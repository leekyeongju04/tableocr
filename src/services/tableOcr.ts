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

    cropCanvas.width = cropW * OCR_SCALE + 2 * PAD;
    cropCanvas.height = cropH * OCR_SCALE + 2 * PAD;

    cropCtx.fillStyle = '#fff';
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
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

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 0.2) / total) * 100),
        statusText: `Running OCR on cell ${i + 1}/${total} [Row ${cell.row}, Col ${cell.col}]...`,
      });
    }

    try {
      // Request blocks to ensure line-level bounding box hierarchy in modern Tesseract.js
      const ocrResult = await worker.recognize(
        cropCanvas,
        {},
        { blocks: true, text: true }
      );
      const rawText = ocrResult?.data?.text || '';
      // Clean up whitespace, trim trailing newlines
      const cleanedText = rawText
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean)
        .join(' ');

      const confidence = ocrResult?.data?.confidence || 0;

      // Coordinate un-scaling mapper back to original cell crop space
      const back = (b: { x0: number; y0: number; x1: number; y1: number }) => ({
        x0: Math.max(0, (b.x0 - PAD) / OCR_SCALE),
        y0: Math.max(0, (b.y0 - PAD) / OCR_SCALE),
        x1: Math.min(cropW, (b.x1 - PAD) / OCR_SCALE),
        y1: Math.min(cropH, (b.y1 - PAD) / OCR_SCALE),
      });

      // Extract line-level output with bounding boxes from blocks hierarchy or top-level lines
      let rawLines: any[] = [];
      if (Array.isArray(ocrResult?.data?.lines) && ocrResult.data.lines.length > 0) {
        rawLines = ocrResult.data.lines;
      } else if (Array.isArray(ocrResult?.data?.blocks)) {
        for (const block of ocrResult.data.blocks) {
          if (Array.isArray(block.paragraphs)) {
            for (const para of block.paragraphs) {
              if (Array.isArray(para.lines)) {
                rawLines.push(...para.lines);
              }
            }
          }
        }
      }

      const lines: OcrLine[] = rawLines
        .map((l: any) => ({
          text: (l.text || '').trim(),
          bbox: back(l.bbox || { x0: PAD, y0: PAD, x1: cropW * OCR_SCALE + PAD, y1: cropH * OCR_SCALE + PAD }),
          confidence: l.confidence || 0,
        }))
        .filter((l: OcrLine) => l.text.length > 0);

      // Strict requirement: No guessing fallback. Throw if there are no lines when text is present.
      if (lines.length === 0 && rawText.trim().length > 0) {
        throw new Error(
          `OCR produced text "${rawText.trim()}" in cell [Row ${cell.row}, Col ${cell.col}], but no line bounding boxes were detected.`
        );
      }

      const updatedCell: MergedCell = {
        ...cell,
        text: cleanedText,
        confidence,
        lines,
      };

      results.push(updatedCell);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          currentCellText: cleanedText,
          statusText: `Processed cell ${i + 1}/${total}: "${cleanedText.slice(0, 24)}"`,
        });
      }
    } catch (err: any) {
      // Strict requirement: Never swallow OCR errors. Rethrow with row and column.
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
