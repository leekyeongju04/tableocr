/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectGridAndCells, DetectionIntermediate } from './gridDetector';
import { runOcrOnMergedCells, OcrProgressCallback } from './tableOcr';
import { parseScheduleEntries } from './scheduleParser';
import { TableExtractionResult, MergedCell } from '../types/table';

export type PipelinePhase =
  | 'idle'
  | 'loading_libraries'
  | 'preprocessing'
  | 'morphology_grid'
  | 'atomic_cells'
  | 'union_find_merge'
  | 'ocr_recognition'
  | 'rendering_output'
  | 'complete'
  | 'error';

export interface PipelineProgress {
  phase: PipelinePhase;
  stepNumber: number; // 1 to 6
  stepTitle: string;
  detail: string;
  percent: number;
}

/**
 * Execute the complete 6-step table extraction pipeline:
 * Step 1: Upscale, grayscale, adaptive threshold
 * Step 2: Detect horizontal/vertical grid lines with morphological operations and line projection
 * Step 3: Build atomic cells from line intersections
 * Step 4: Merge adjacent cells when shared edge has <30% dark pixels (Union-Find) -> rectangles with rowspan/colspan
 * Step 5: Run Tesseract.js (PSM 6) on each merged region crop
 * Step 6: Output JSON array {text, row, col, rowspan, colspan} & HTML table data
 *
 * Strict error requirement: Throw explicit errors if no grid is detected. No fallbacks, one code path.
 */
export async function executeScheduleExtractionPipeline(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  onProgress?: (progress: PipelineProgress) => void
): Promise<TableExtractionResult> {
  const tStart = performance.now();

  // Progress update helper
  const notify = (
    phase: PipelinePhase,
    stepNumber: number,
    stepTitle: string,
    detail: string,
    percent: number
  ) => {
    if (onProgress) {
      onProgress({ phase, stepNumber, stepTitle, detail, percent });
    }
  };

  notify(
    'preprocessing',
    1,
    'Step 1: Upscale, Grayscale & Adaptive Threshold',
    'Scaling image resolution and computing adaptive binary threshold...',
    15
  );

  await new Promise((r) => setTimeout(r, 0));

  // Run Steps 1 through 4 with live progress updates and thread yielding
  const intermediate: DetectionIntermediate = await detectGridAndCells(
    imageSource,
    (stepNum, title, detail, pct) => {
      notify(
        stepNum === 1
          ? 'preprocessing'
          : stepNum === 2
          ? 'morphology_grid'
          : stepNum === 3
          ? 'atomic_cells'
          : 'union_find_merge',
        stepNum,
        title,
        detail,
        pct
      );
    }
  );

  await new Promise((r) => setTimeout(r, 0));

  // Step 5: Tesseract OCR (PSM 6)
  notify(
    'ocr_recognition',
    5,
    'Step 5: Tesseract.js OCR (PSM 6)',
    `Recognizing text across ${intermediate.mergedCells.length} merged cell crops...`,
    70
  );

  console.time('Step 5: Tesseract OCR');
  const tOcrStart = performance.now();
  const ocrCells: MergedCell[] = await runOcrOnMergedCells(
    intermediate.upscaledCanvas,
    intermediate.mergedCells,
    ({ current, total, percent, statusText }) => {
      notify(
        'ocr_recognition',
        5,
        'Step 5: Tesseract.js OCR (PSM 6)',
        statusText,
        70 + Math.round((percent * 25) / 100)
      );
    }
  );
  const ocrDuration = performance.now() - tOcrStart;
  console.timeEnd('Step 5: Tesseract OCR');

  await new Promise((r) => setTimeout(r, 0));

  // Step 6: Output JSON array {text, row, col, rowspan, colspan} & Schedule Parsing
  notify(
    'rendering_output',
    6,
    'Step 6: Parsing Schedule Entries & Table Assembly',
    'Extracting subject, section, red-ink rooms, and validating sequential time rows...',
    95
  );

  console.time('Step 6: Schedule Parse');
  const json = ocrCells.map((c) => ({
    text: c.text,
    row: c.row,
    col: c.col,
    rowspan: c.rowspan,
    colspan: c.colspan,
  }));

  // Parse into schedule entries (subject, section, room, day, start, end)
  // Throws explicit error if time rows are not sequential
  const scheduleResult = parseScheduleEntries(
    ocrCells,
    intermediate.upscaledCanvas,
    intermediate.verticalLines,
    intermediate.totalRows,
    intermediate.totalCols
  );
  console.timeEnd('Step 6: Schedule Parse');

  await new Promise((r) => setTimeout(r, 0));

  const totalTime = performance.now() - tStart;
  intermediate.diagnostics.totalExecutionTimeMs = totalTime;
  intermediate.diagnostics.stepTimes.ocrRecognitionMs = ocrDuration;

  notify(
    'complete',
    6,
    'Extraction Complete',
    `Found ${scheduleResult.entries.length} valid schedule entries (${scheduleResult.skippedCells.length} skipped) in ${(totalTime / 1000).toFixed(2)}s.`,
    100
  );

  return {
    json,
    cells: ocrCells,
    totalRows: intermediate.totalRows,
    totalCols: intermediate.totalCols,
    horizontalLines: intermediate.horizontalLines,
    verticalLines: intermediate.verticalLines,
    atomicCells: intermediate.atomicCells,
    sharedEdges: intermediate.sharedEdges,
    diagnostics: intermediate.diagnostics,
    upscaledCanvas: intermediate.upscaledCanvas,
    threshCanvas: intermediate.threshCanvas,
    morphCanvas: intermediate.morphCanvas,
    scheduleResult,
  };
}
