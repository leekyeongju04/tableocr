/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadOpenCV } from './opencvLoader';
import { UnionFind } from './unionFind';
import {
  AtomicCell,
  SharedEdge,
  MergedCell,
  GridDiagnostics,
} from '../types/table';

export interface DetectionIntermediate {
  upscaledCanvas: HTMLCanvasElement;
  threshCanvas: HTMLCanvasElement;
  morphCanvas: HTMLCanvasElement;
  horizontalLines: number[];
  verticalLines: number[];
  atomicCells: AtomicCell[];
  sharedEdges: SharedEdge[];
  mergedCells: MergedCell[];
  totalRows: number;
  totalCols: number;
  diagnostics: GridDiagnostics;
}

export type GridProgressCallback = (
  stepNumber: number,
  stepTitle: string,
  detail: string,
  percent: number
) => void;

/**
 * Step 1: Upscale (scale so longest side is at most 2000px, not a fixed multiplier), grayscale, adaptive threshold (blockSize 31, C 10)
 * Step 2: Detect horizontal/vertical grid lines with morphological operations and line projection (cv.reduce)
 * Step 3: Build atomic cells from line intersections
 * Step 4: Merge adjacent cells when the shared edge has <30% dark pixels, using union-find, producing rectangles with rowspan/colspan
 */
export async function detectGridAndCells(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  onProgress?: GridProgressCallback
): Promise<DetectionIntermediate> {
  const startTime = performance.now();
  const cv = await loadOpenCV();

  const originalWidth =
    (sourceImage as HTMLImageElement).naturalWidth || sourceImage.width;
  const originalHeight =
    (sourceImage as HTMLImageElement).naturalHeight || sourceImage.height;

  if (!originalWidth || !originalHeight || originalWidth <= 0 || originalHeight <= 0) {
    throw new Error(
      'Invalid image: Image dimensions are 0. Please select a valid schedule image.'
    );
  }

  const stepTimes = {
    preprocessingMs: 0,
    morphologyAndProjectionMs: 0,
    atomicCellsMs: 0,
    unionFindMergeMs: 0,
    ocrRecognitionMs: 0,
  };

  // Convert source image to canvas to read Mat
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = originalWidth;
  tempCanvas.height = originalHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) {
    throw new Error('Failed to create 2D canvas context for image processing.');
  }
  tempCtx.drawImage(sourceImage, 0, 0);

  // Track all OpenCV Mat allocations to delete in finally block
  const matsToDelete: any[] = [];
  const trackMat = <T>(m: T): T => {
    matsToDelete.push(m);
    return m;
  };

  try {
    // ==========================================
    // STEP 1: Upscale, Grayscale, Adaptive Threshold
    // ==========================================
    console.time('Step 1: Upscale, Grayscale & Adaptive Threshold');
    const t0 = performance.now();

    onProgress?.(
      1,
      'Step 1: Upscale, Grayscale & Adaptive Threshold',
      'Scaling image resolution and computing adaptive binary threshold...',
      15
    );
    await new Promise((r) => setTimeout(r, 0));

    const srcMat = trackMat(cv.imread(tempCanvas));

    // (1) Scale the image so its longest side is at most 2000px, not a fixed multiplier
    const maxDim = Math.max(srcMat.cols, srcMat.rows);
    const scale = maxDim > 2000 ? 2000 / maxDim : 1.0;

    const upscaledWidth = Math.round(srcMat.cols * scale);
    const upscaledHeight = Math.round(srcMat.rows * scale);

    const upscaledMat = trackMat(new cv.Mat());
    if (scale < 1.0) {
      cv.resize(
        srcMat,
        upscaledMat,
        new cv.Size(upscaledWidth, upscaledHeight),
        0,
        0,
        cv.INTER_AREA
      );
    } else {
      srcMat.copyTo(upscaledMat);
    }

    // Grayscale
    const grayMat = trackMat(new cv.Mat());
    cv.cvtColor(upscaledMat, grayMat, cv.COLOR_RGBA2GRAY);

    // (2) Use cv.adaptiveThreshold (ADAPTIVE_THRESH_GAUSSIAN_C, blockSize 31, C 10) instead of any manual pixel loop
    const threshMat = trackMat(new cv.Mat());
    cv.adaptiveThreshold(
      grayMat,
      threshMat,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      10
    );

    stepTimes.preprocessingMs = performance.now() - t0;
    console.timeEnd('Step 1: Upscale, Grayscale & Adaptive Threshold');

    // (4) Await new Promise(r => setTimeout(r, 0)) between each pipeline step so UI repaints
    await new Promise((r) => setTimeout(r, 0));

    // ==========================================
    // STEP 2: Detect vertical grid lines first, then detect horizontal row boundaries
    // ONLY from the leftmost column (the time column) using horizontal-line projection
    // on the strip between table left edge and first vertical line, with threshold ~60%
    // ==========================================
    console.time('Step 2: Detect Grid Lines');
    const t1 = performance.now();
    const W = upscaledMat.cols;
    const H = upscaledMat.rows;

    onProgress?.(
      2,
      'Step 2: Morphological Lines & Line Projection',
      'Detecting column dividers and horizontal boundaries from the time column strip...',
      35
    );
    await new Promise((r) => setTimeout(r, 0));

    // 2A: Detect vertical grid lines
    const kernelLenV = Math.max(16, Math.floor(H / 35));
    const vKernel = trackMat(
      cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, kernelLenV))
    );
    const vLinesMat = trackMat(new cv.Mat());
    cv.erode(threshMat, vLinesMat, vKernel);
    cv.dilate(vLinesMat, vLinesMat, vKernel);

    const colProjMat = trackMat(new cv.Mat());
    cv.reduce(vLinesMat, colProjMat, 0, cv.REDUCE_AVG, cv.CV_32F);

    const colProj = new Float32Array(W);
    let maxColVal = 0;
    for (let x = 0; x < W; x++) {
      const v = colProjMat.floatAt(0, x) / 255;
      colProj[x] = v;
      if (v > maxColVal) maxColVal = v;
    }
    const colThreshold = Math.max(0.04, maxColVal * 0.18);

    const rawVLines: number[] = [];
    let inCluster = false;
    let clusterWeightedSum = 0;
    let clusterWeightTotal = 0;

    for (let x = 0; x < W; x++) {
      if (colProj[x] >= colThreshold) {
        if (!inCluster) {
          inCluster = true;
          clusterWeightedSum = 0;
          clusterWeightTotal = 0;
        }
        clusterWeightedSum += x * colProj[x];
        clusterWeightTotal += colProj[x];
      } else if (inCluster) {
        inCluster = false;
        rawVLines.push(Math.round(clusterWeightedSum / (clusterWeightTotal || 1)));
      }
    }
    if (inCluster) {
      rawVLines.push(Math.round(clusterWeightedSum / (clusterWeightTotal || 1)));
    }

    const consolidateLines = (lines: number[], minSpacing: number): number[] => {
      if (lines.length === 0) return [];
      lines.sort((a, b) => a - b);
      const res: number[] = [lines[0]];
      for (let i = 1; i < lines.length; i++) {
        const last = res[res.length - 1];
        if (lines[i] - last < minSpacing) {
          res[res.length - 1] = Math.round((last + lines[i]) / 2);
        } else {
          res.push(lines[i]);
        }
      }
      return res;
    };

    const minVSpacing = Math.max(16, Math.floor(W * 0.015));
    const verticalLines = consolidateLines(rawVLines, minVSpacing);

    if (verticalLines.length < 2) {
      throw new Error(
        `No grid detected: Found ${verticalLines.length} vertical lines. At least 2 vertical lines (table left boundary and first column divider) are required.`
      );
    }

    // 2B: Extract leftmost column (time column) strip
    const xLeft = Math.max(0, verticalLines[0]);
    const xRight = Math.min(W, verticalLines[1]);
    const stripWidth = xRight - xLeft;

    if (stripWidth < 10) {
      throw new Error(
        `Invalid grid: Leftmost column strip width is too narrow (${stripWidth}px).`
      );
    }

    // 2C: Morphological horizontal lines
    const kernelLenH = Math.max(10, Math.floor(stripWidth / 6));
    const hKernel = trackMat(
      cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelLenH, 1))
    );
    const hLinesMat = trackMat(new cv.Mat());
    cv.erode(threshMat, hLinesMat, hKernel);
    cv.dilate(hLinesMat, hLinesMat, hKernel);

    // Combined morph lines for visual debugging
    const morphCombinedMat = trackMat(new cv.Mat());
    cv.add(hLinesMat, vLinesMat, morphCombinedMat);

    // 2D: Horizontal-line projection ONLY on the strip between table left edge and first vertical line
    const timeStripMat = trackMat(hLinesMat.colRange(xLeft, xRight));
    const stripRowProjMat = trackMat(new cv.Mat());
    cv.reduce(timeStripMat, stripRowProjMat, 1, cv.REDUCE_AVG, cv.CV_32F);

    // Requirement: "with the threshold set to ~60% of that strip’s width"
    const stripThreshold = 0.60;

    const rawHLines: number[] = [];
    inCluster = false;
    clusterWeightedSum = 0;
    clusterWeightTotal = 0;

    for (let y = 0; y < H; y++) {
      const val = stripRowProjMat.floatAt(y, 0) / 255;
      if (val >= stripThreshold) {
        if (!inCluster) {
          inCluster = true;
          clusterWeightedSum = 0;
          clusterWeightTotal = 0;
        }
        clusterWeightedSum += y * val;
        clusterWeightTotal += val;
      } else if (inCluster) {
        inCluster = false;
        rawHLines.push(Math.round(clusterWeightedSum / (clusterWeightTotal || 1)));
      }
    }
    if (inCluster) {
      rawHLines.push(Math.round(clusterWeightedSum / (clusterWeightTotal || 1)));
    }

    const minHSpacing = Math.max(10, Math.floor(H * 0.008));
    const horizontalLines = consolidateLines(rawHLines, minHSpacing);

    if (horizontalLines.length < 2) {
      throw new Error(
        `No grid detected: Found ${horizontalLines.length} horizontal boundaries in the time column strip at 60% projection threshold. At least 2 horizontal boundaries are required.`
      );
    }

    const detectedRowCount = horizontalLines.length - 1;
    console.log(`[GridDetector] Detected row count: ${detectedRowCount}`);

    stepTimes.morphologyAndProjectionMs = performance.now() - t1;
    console.timeEnd('Step 2: Detect Grid Lines');

    // Strict Error Check: No fallbacks, one code path
    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      throw new Error(
        `No grid detected: Morphological line projection found ${horizontalLines.length} horizontal lines and ${verticalLines.length} vertical lines. A valid table grid requires at least 2 horizontal and 2 vertical boundary lines.`
      );
    }

    // (4) Yield event loop
    await new Promise((r) => setTimeout(r, 0));

    // ==========================================
    // STEP 3: Build atomic cells from line intersections
    // ==========================================
    console.time('Step 3: Atomic Cells');
    const t2 = performance.now();
    const totalRows = horizontalLines.length - 1;
    const totalCols = verticalLines.length - 1;

    onProgress?.(
      3,
      'Step 3: Atomic Cells from Intersections',
      `Constructing ${totalRows * totalCols} atomic cells (${totalRows} rows × ${totalCols} cols)...`,
      50
    );
    await new Promise((r) => setTimeout(r, 0));

    const atomicCells: AtomicCell[] = [];
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const x = verticalLines[c];
        const y = horizontalLines[r];
        const w = verticalLines[c + 1] - verticalLines[c];
        const h = horizontalLines[r + 1] - horizontalLines[r];
        atomicCells.push({ r, c, x, y, w, h });
      }
    }

    stepTimes.atomicCellsMs = performance.now() - t2;
    console.timeEnd('Step 3: Atomic Cells');

    // (4) Yield event loop
    await new Promise((r) => setTimeout(r, 0));

    // ==========================================
    // STEP 4: Merge adjacent cells when the shared edge has <30% dark pixels, using union-find, producing rectangles with rowspan/colspan
    // ==========================================
    console.time('Step 4: Union-Find Merge');
    const t3 = performance.now();
    const totalAtomicCount = totalRows * totalCols;
    const uf = new UnionFind(totalAtomicCount);
    const cellIdx = (r: number, c: number) => r * totalCols + c;

    onProgress?.(
      4,
      'Step 4: Union-Find Adjacent Cell Merge',
      'Evaluating shared edge dark-pixel ratios (<30% merge threshold)...',
      60
    );
    await new Promise((r) => setTimeout(r, 0));

    const sharedEdges: SharedEdge[] = [];

    // 4A: Check vertical shared edges - sample vertical line mask (vLinesMat)
    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols - 1; c++) {
        const edgeX = verticalLines[c + 1];
        const yTop = horizontalLines[r];
        const yBottom = horizontalLines[r + 1];
        const cellH = yBottom - yTop;

        const inset = Math.max(3, Math.min(10, Math.floor(cellH * 0.12)));
        const sampleStart = yTop + inset;
        const sampleEnd = yBottom - inset;

        let darkCount = 0;
        let totalSamples = 0;

        for (let y = sampleStart; y <= sampleEnd; y++) {
          totalSamples++;
          let hasLine = false;
          for (let dx = -2; dx <= 2; dx++) {
            const sx = edgeX + dx;
            if (sx >= 0 && sx < W && y >= 0 && y < H && vLinesMat.ucharPtr(y, edgeX + dx)[0] > 128) {
              hasLine = true;
              break;
            }
          }
          if (hasLine) darkCount++;
        }

        const darkPixelRatio = totalSamples > 0 ? darkCount / totalSamples : 1.0;
        const shouldMerge = darkPixelRatio < 0.30;

        if (shouldMerge) {
          uf.union(cellIdx(r, c), cellIdx(r, c + 1));
        }

        sharedEdges.push({
          id: `v_${r}_${c}`,
          type: 'vertical',
          r1: r,
          c1: c,
          r2: r,
          c2: c + 1,
          x1: edgeX,
          y1: yTop,
          x2: edgeX,
          y2: yBottom,
          darkPixelRatio,
          merged: shouldMerge,
        });
      }
    }

    // 4B: Check horizontal shared edges - sample horizontal line mask (hLinesMat)
    for (let r = 0; r < totalRows - 1; r++) {
      for (let c = 0; c < totalCols; c++) {
        const edgeY = horizontalLines[r + 1];
        const xLeftCell = verticalLines[c];
        const xRightCell = verticalLines[c + 1];
        const cellW = xRightCell - xLeftCell;

        const inset = Math.max(3, Math.min(10, Math.floor(cellW * 0.12)));
        const sampleStart = xLeftCell + inset;
        const sampleEnd = xRightCell - inset;

        let darkCount = 0;
        let totalSamples = 0;

        for (let x = sampleStart; x <= sampleEnd; x++) {
          totalSamples++;
          let hasLine = false;
          for (let dy = -2; dy <= 2; dy++) {
            const sy = edgeY + dy;
            if (x >= 0 && x < W && sy >= 0 && sy < H && hLinesMat.ucharPtr(edgeY + dy, x)[0] > 128) {
              hasLine = true;
              break;
            }
          }
          if (hasLine) darkCount++;
        }

        const darkPixelRatio = totalSamples > 0 ? darkCount / totalSamples : 1.0;
        const shouldMerge = darkPixelRatio < 0.30;

        if (shouldMerge) {
          uf.union(cellIdx(r, c), cellIdx(r + 1, c));
        }

        sharedEdges.push({
          id: `h_${r}_${c}`,
          type: 'horizontal',
          r1: r,
          c1: c,
          r2: r + 1,
          c2: c,
          x1: xLeftCell,
          y1: edgeY,
          x2: xRightCell,
          y2: edgeY,
          darkPixelRatio,
          merged: shouldMerge,
        });
      }
    }

    // Form merged rectangles from Union-Find components
    const groups = uf.getGroups();
    const mergedCells: MergedCell[] = [];

    let cellCounter = 0;
    groups.forEach((cellIndices) => {
      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;

      const atomicCoords: Array<{ r: number; c: number }> = [];

      for (const idx of cellIndices) {
        const r = Math.floor(idx / totalCols);
        const c = idx % totalCols;
        atomicCoords.push({ r, c });
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }

      const rowspan = maxRow - minRow + 1;
      const colspan = maxCol - minCol + 1;

      const bboxX = verticalLines[minCol];
      const bboxY = horizontalLines[minRow];
      const bboxW = verticalLines[maxCol + 1] - verticalLines[minCol];
      const bboxH = horizontalLines[maxRow + 1] - horizontalLines[minRow];

      mergedCells.push({
        id: `merged_${cellCounter++}`,
        text: '',
        roomText: '',
        row: minRow,
        col: minCol,
        rowspan,
        colspan,
        bbox: {
          x: bboxX,
          y: bboxY,
          w: bboxW,
          h: bboxH,
        },
        atomicCells: atomicCoords,
      });
    });

    mergedCells.sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    stepTimes.unionFindMergeMs = performance.now() - t3;
    console.timeEnd('Step 4: Union-Find Merge');

    // Create debug canvases
    const upscaledCanvas = document.createElement('canvas');
    cv.imshow(upscaledCanvas, upscaledMat);

    const threshCanvas = document.createElement('canvas');
    cv.imshow(threshCanvas, threshMat);

    const morphCanvas = document.createElement('canvas');
    cv.imshow(morphCanvas, morphCombinedMat);

    const totalExecutionTimeMs = performance.now() - startTime;

    const diagnostics: GridDiagnostics = {
      originalWidth,
      originalHeight,
      upscaledWidth,
      upscaledHeight,
      scaleFactor: scale,
      hLinesCount: horizontalLines.length,
      vLinesCount: verticalLines.length,
      atomicCellsCount: atomicCells.length,
      mergedCellsCount: mergedCells.length,
      totalExecutionTimeMs,
      stepTimes,
    };

    return {
      upscaledCanvas,
      threshCanvas,
      morphCanvas,
      horizontalLines,
      verticalLines,
      atomicCells,
      sharedEdges,
      mergedCells,
      totalRows,
      totalCols,
      diagnostics,
    };
  } finally {
    // (3) Delete all cv.Mat objects in a finally block
    for (const m of matsToDelete) {
      if (m && typeof m.delete === 'function') {
        try {
          m.delete();
        } catch (_) {}
      }
    }
  }
}
