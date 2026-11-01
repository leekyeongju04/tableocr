/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWorker, PSM } from 'tesseract.js';
import { MergedCell, OcrLine } from '../types/table';

export type OcrProgressCallback = (progress: {
  current: number;
  total: number;
  percent: number;
  currentCellText?: string;
  statusText: string;
}) => void;

let cachedWorker: any = null;
let currentLanguage = 'eng';

export async function getTesseractWorker(
  lang: string = 'eng',
  onStatus?: (status: string) => void
): Promise<any> {
  if (cachedWorker && currentLanguage === lang) {
    return cachedWorker;
  }

  if (cachedWorker) {
    try {
      await cachedWorker.terminate();
    } catch {
      // Ignore termination error
    }
    cachedWorker = null;
  }

  if (onStatus) onStatus('Initializing Tesseract OCR engine (PSM 6)...');

  // Create worker with PSM 6: Assume a single uniform block of text
  const worker = await createWorker(lang);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // '6'
  });

  cachedWorker = worker;
  currentLanguage = lang;
  return worker;
}

/**
 * Step 5: Run Tesseract.js (PSM 6) on each merged region's crop
 * - Upscales crop 3x with white padding to achieve optimal 30px+ character height
 * - Re-maps line bounding boxes back to crop coordinates for downstream red-ink analysis
 * - Fetches blocks/paragraphs/lines directly from Tesseract.js v6/v7
 * - Strictly throws if OCR fails or text exists without line bounding boxes (no fallbacks)
 */
export async function runOcrOnMergedCells(
  sourceCanvas: HTMLCanvasElement,
  mergedCells: MergedCell[],
  onProgress?: OcrProgressCallback
): Promise<MergedCell[]> {
  const worker = await getTesseractWorker('eng', (status) => {
    if (onProgress) {
      onProgress({
        current: 0,
        total: mergedCells.length,
        percent: 0,
        statusText: status,
      });
    }
  });

  const OCR_SCALE = 3;
  const PAD = 12;

  // Temporary canvas for cropped cell
  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) {
    throw new Error('Failed to create canvas context for OCR cell crop.');
  }

  const results: MergedCell[] = [];
  const total = mergedCells.length;

  for (let i = 0; i < total; i++) {
    const cell = mergedCells[i];
    const { x, y, w, h } = cell.bbox;

    // Inset crop by 2-3px so cell boundary lines are not read as "I", "|", or "l"
    const insetX = Math.max(2, Math.min(6, Math.floor(w * 0.04)));
    const insetY = Math.max(2, Math.min(6, Math.floor(h * 0.04)));

    const cropX = Math.max(0, x + insetX);
    const cropY = Math.max(0, y + insetY);
    const cropW = Math.max(1, w - 2 * insetX);
    const cropH = Math.max(1, h - 2 * insetY);

    const canvasW = cropW * OCR_SCALE + 2 * PAD;
    const canvasH = cropH * OCR_SCALE + 2 * PAD;

    cropCanvas.width = canvasW;
    cropCanvas.height = canvasH;

    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, canvasW, canvasH);
    cropCtx.imageSmoothingQuality = 'high';
    cropCtx.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      PAD,
      PAD,
      cropW * OCR_SCALE,
      cropH * OCR_SCALE
    );

    const baseImgData = cropCtx.getImageData(0, 0, canvasW, canvasH);
    const baseData = baseImgData.data;

    // Helper: a pixel is "red" if r>g+60 && r>b+60 && r>80
    const isRedPixel = (r: number, g: number, b: number): boolean => {
      return r > g + 60 && r > b + 60 && r > 80;
    };

    // Find the cell background = most frequent color (quantized 4 bits/channel)
    // and count red pixels in the cropped region
    const key = (r: number, g: number, b: number) => `${r >> 4},${g >> 4},${b >> 4}`;
    const freq = new Map<string, [number, number, number, number]>();
    let redPixelCount = 0;

    for (let y = PAD; y < canvasH - PAD; y++) {
      const rowOffset = y * canvasW;
      for (let x = PAD; x < canvasW - PAD; x++) {
        const p = (rowOffset + x) * 4;
        const r = baseData[p];
        const g = baseData[p + 1];
        const b = baseData[p + 2];

        if (isRedPixel(r, g, b)) {
          redPixelCount++;
        }

        const k = key(r, g, b);
        const entry = freq.get(k) || [r, g, b, 0];
        entry[3]++;
        freq.set(k, entry);
      }
    }

    let bgR = 255;
    let bgG = 255;
    let bgB = 255;
    let maxCount = -1;
    for (const entry of freq.values()) {
      if (entry[3] > maxCount) {
        maxCount = entry[3];
        bgR = entry[0];
        bgG = entry[1];
        bgB = entry[2];
      }
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 0.2) / total) * 100),
        statusText: `Running OCR on cell ${i + 1}/${total} [Row ${cell.row}, Col ${cell.col}]...`,
      });
    }

    try {
      // =========================================================================
      // PASS A (subject + section):
      // Output pixel = BLACK if differs from background by |dr|+|dg|+|db| > 100 AND is not red;
      // otherwise WHITE. Red pixels are erased (white).
      // =========================================================================
      const passACanvas = document.createElement('canvas');
      passACanvas.width = canvasW;
      passACanvas.height = canvasH;
      const passACtx = passACanvas.getContext('2d');
      if (!passACtx) throw new Error('Failed to create context for Pass A.');

      const passAImgData = passACtx.createImageData(canvasW, canvasH);
      const passAData = passAImgData.data;

      for (let p = 0; p < baseData.length; p += 4) {
        const r = baseData[p];
        const g = baseData[p + 1];
        const b = baseData[p + 2];

        const dr = Math.abs(r - bgR);
        const dg = Math.abs(g - bgG);
        const db = Math.abs(b - bgB);

        const isRed = isRedPixel(r, g, b);
        const isDiffFromBg = dr + dg + db > 100;

        if (isDiffFromBg && !isRed) {
          passAData[p] = 0;
          passAData[p + 1] = 0;
          passAData[p + 2] = 0;
          passAData[p + 3] = 255;
        } else {
          passAData[p] = 255;
          passAData[p + 1] = 255;
          passAData[p + 2] = 255;
          passAData[p + 3] = 255;
        }
      }
      passACtx.putImageData(passAImgData, 0, 0);

      // OCR Pass A with single worker
      const ocrResultA = await worker.recognize(
        passACanvas,
        {},
        { blocks: true }
      );

      // Read lines from data.blocks[].paragraphs[].lines[]
      const rawLinesA: any[] = [];
      if (Array.isArray(ocrResultA?.data?.blocks)) {
        for (const block of ocrResultA.data.blocks) {
          if (Array.isArray(block.paragraphs)) {
            for (const para of block.paragraphs) {
              if (Array.isArray(para.lines)) {
                for (const line of para.lines) {
                  rawLinesA.push(line);
                }
              }
            }
          }
        }
      }

      // Map OCR line bboxes back to crop coordinates: x = (x - PAD) / OCR_SCALE, same for y
      const back = (b: { x0: number; y0: number; x1: number; y1: number }) => ({
        x0: Math.max(0, (b.x0 - PAD) / OCR_SCALE),
        y0: Math.max(0, (b.y0 - PAD) / OCR_SCALE),
        x1: Math.min(cropW, (b.x1 - PAD) / OCR_SCALE),
        y1: Math.min(cropH, (b.y1 - PAD) / OCR_SCALE),
      });

      const lines: OcrLine[] = rawLinesA
        .filter((l: any) => (l.text || '').trim().length > 0)
        .map((l: any) => ({
          text: (l.text || '').trim(),
          bbox: back(l.bbox || { x0: PAD, y0: PAD, x1: canvasW - PAD, y1: canvasH - PAD }),
          confidence: l.confidence || 0,
        }));

      const rawTextA = (ocrResultA?.data?.text || '').trim();
      const cleanedText = lines.map((l) => l.text).join(' ').trim();

      // If a non-empty cell returns no line boxes, throw an Error naming the row and column
      if (rawTextA.length > 0 && lines.length === 0) {
        throw new Error(
          `Cell [Row ${cell.row}, Col ${cell.col}] has non-empty text "${rawTextA}", but no line bounding boxes were detected.`
        );
      }

      // =========================================================================
      // PASS B (room, red text only):
      // Count red pixels in the cropped region. If fewer than 30, skip this pass and set cell.roomText = ''.
      // Otherwise output BLACK where pixel is red, WHITE elsewhere, then dilate black pixels by 1px (3x3).
      // =========================================================================
      let roomText = '';

      if (redPixelCount < 30) {
        roomText = '';
      } else {
        // Precompute red grid for dilation
        const isRedGrid = new Uint8Array(canvasW * canvasH);
        for (let idx = 0; idx < canvasW * canvasH; idx++) {
          const p = idx * 4;
          if (isRedPixel(baseData[p], baseData[p + 1], baseData[p + 2])) {
            isRedGrid[idx] = 1;
          }
        }

        const passBCanvas = document.createElement('canvas');
        passBCanvas.width = canvasW;
        passBCanvas.height = canvasH;
        const passBCtx = passBCanvas.getContext('2d');
        if (!passBCtx) throw new Error('Failed to create context for Pass B.');

        const passBImgData = passBCtx.createImageData(canvasW, canvasH);
        const passBData = passBImgData.data;

        // Dilate the black pixels by 1px (3x3) so thin strokes survive
        for (let y = 0; y < canvasH; y++) {
          const rowOffset = y * canvasW;
          for (let x = 0; x < canvasW; x++) {
            let hasRedNeighbor = false;

            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= canvasH) continue;
              const nRowOffset = ny * canvasW;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= canvasW) continue;
                if (isRedGrid[nRowOffset + nx] === 1) {
                  hasRedNeighbor = true;
                  break;
                }
              }
              if (hasRedNeighbor) break;
            }

            const p = (rowOffset + x) * 4;
            if (hasRedNeighbor) {
              passBData[p] = 0;
              passBData[p + 1] = 0;
              passBData[p + 2] = 0;
              passBData[p + 3] = 255;
            } else {
              passBData[p] = 255;
              passBData[p + 1] = 255;
              passBData[p + 2] = 255;
              passBData[p + 3] = 255;
            }
          }
        }
        passBCtx.putImageData(passBImgData, 0, 0);

        // Run OCR Pass B sequentially with the SAME worker
        const ocrResultB = await worker.recognize(
          passBCanvas,
          {},
          { blocks: true }
        );

        const rawLinesB: string[] = [];
        if (Array.isArray(ocrResultB?.data?.blocks)) {
          for (const block of ocrResultB.data.blocks) {
            if (Array.isArray(block.paragraphs)) {
              for (const para of block.paragraphs) {
                if (Array.isArray(para.lines)) {
                  for (const line of para.lines) {
                    const txt = (line.text || '').trim();
                    if (txt.length > 0) {
                      rawLinesB.push(txt);
                    }
                  }
                }
              }
            }
          }
        }

        roomText = rawLinesB.join(' ').trim();

        // If red pixels >= 30 and the result is empty, throw an Error naming the cell's row and column
        if (!roomText) {
          throw new Error(
            `Cell [Row ${cell.row}, Col ${cell.col}] has ${redPixelCount} red pixels, but no room text could be recognized.`
          );
        }
      }

      const updatedCell: MergedCell = {
        ...cell,
        text: cleanedText,
        roomText,
        confidence: ocrResultA?.data?.confidence || 0,
        lines,
      };

      results.push(updatedCell);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          currentCellText: cleanedText,
          statusText: `Processed cell ${i + 1}/${total}: "${cleanedText.slice(0, 24)}"${
            roomText ? ` [Room: ${roomText}]` : ''
          }`,
        });
      }
    } catch (err: any) {
      // Do NOT push an empty cell. Rethrow with row and column.
      throw new Error(
        `OCR failed on cell [Row ${cell.row}, Col ${cell.col}]: ${err?.message || err}`
      );
    }
  }

  return results;
}

export async function terminateOcrWorker(): Promise<void> {
  if (cachedWorker) {
    try {
      await cachedWorker.terminate();
    } catch {
      // Ignore error
    }
    cachedWorker = null;
  }
}
