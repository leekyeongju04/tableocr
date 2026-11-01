/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AtomicCell {
  r: number;
  c: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SharedEdge {
  id: string;
  type: 'horizontal' | 'vertical'; // 'horizontal': boundary between (r,c) and (r+1,c); 'vertical': between (r,c) and (r,c+1)
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  darkPixelRatio: number; // e.g. 0.08 = 8% dark pixels
  merged: boolean; // true if darkPixelRatio < 0.30
}

export interface OcrLine {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence?: number;
}

export interface MergedCell {
  id: string;
  text: string;
  roomText: string;
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  atomicCells: Array<{ r: number; c: number }>;
  confidence?: number;
  lines?: OcrLine[];
}

export interface GridDiagnostics {
  originalWidth: number;
  originalHeight: number;
  upscaledWidth: number;
  upscaledHeight: number;
  scaleFactor: number;
  hLinesCount: number;
  vLinesCount: number;
  atomicCellsCount: number;
  mergedCellsCount: number;
  totalExecutionTimeMs: number;
  stepTimes: {
    preprocessingMs: number;
    morphologyAndProjectionMs: number;
    atomicCellsMs: number;
    unionFindMergeMs: number;
    ocrRecognitionMs: number;
  };
}

import { ScheduleParseResult } from './schedule';

export interface TableExtractionResult {
  json: Array<{
    text: string;
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  }>;
  cells: MergedCell[];
  totalRows: number;
  totalCols: number;
  horizontalLines: number[];
  verticalLines: number[];
  atomicCells: AtomicCell[];
  sharedEdges: SharedEdge[];
  diagnostics: GridDiagnostics;
  upscaledCanvas: HTMLCanvasElement;
  threshCanvas: HTMLCanvasElement;
  morphCanvas: HTMLCanvasElement;
  scheduleResult?: ScheduleParseResult;
}
