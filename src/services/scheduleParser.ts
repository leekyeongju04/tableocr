/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MergedCell, OcrLine } from '../types/table';
import {
  ScheduleEntry,
  SkippedCell,
  TimeInterval,
  ScheduleParseResult,
} from '../types/schedule';

/**
 * Normalizes section candidate according to rule:
 * "Section = the line matching ^[A-Z]{3,5}\d(\.\d)?[A-Z]?$ (normalize O→0, I/l→1 in digits)."
 */
export function normalizeAndMatchSection(lineText: string): string | null {
  const clean = lineText.trim().replace(/\s+/g, '');
  if (!clean) return null;

  // Must start with 3 to 5 letters
  const prefixMatch = clean.match(/^([A-Za-z]{3,5})(.*)$/);
  if (!prefixMatch) return null;

  const prefix = prefixMatch[1].toUpperCase();
  let rest = prefixMatch[2];

  // Normalize in the digits/suffix part: O -> 0, I -> 1, l -> 1, | -> 1
  rest = rest
    .replace(/O/g, '0')
    .replace(/[Il|]/g, '1')
    .toUpperCase();

  const candidate = prefix + rest;

  // Strict regex from user requirement: ^[A-Z]{3,5}\d(\.\d)?[A-Z]?$
  const exactRegex = /^[A-Z]{3,5}\d(\.\d)?[A-Z]?$/;
  // Also accommodate multi-digit sections like CSC101 or CSC101A
  const multiDigitRegex = /^[A-Z]{3,5}\d+(\.\d+)?[A-Z]?$/;

  if (exactRegex.test(candidate)) {
    return candidate;
  }
  if (multiDigitRegex.test(candidate)) {
    return candidate;
  }

  return null;
}

/**
 * Test if a line's text pixels are red in the original image:
 * "Room = lines whose dark text pixels are red in the original image (R>G+60 && R>B+60)."
 */
export function isLineRedInk(
  sourceCanvas: HTMLCanvasElement,
  cellBbox: { x: number; y: number; w: number; h: number },
  lineBbox: { x0: number; y0: number; x1: number; y1: number }
): boolean {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return false;

  const insetX = Math.max(2, Math.min(6, Math.floor(cellBbox.w * 0.04)));
  const insetY = Math.max(2, Math.min(6, Math.floor(cellBbox.h * 0.04)));
  const cropX = Math.max(0, cellBbox.x + insetX);
  const cropY = Math.max(0, cellBbox.y + insetY);

  const x0 = Math.max(0, Math.floor(cropX + lineBbox.x0));
  const y0 = Math.max(0, Math.floor(cropY + lineBbox.y0));
  const x1 = Math.min(sourceCanvas.width, Math.ceil(cropX + lineBbox.x1));
  const y1 = Math.min(sourceCanvas.height, Math.ceil(cropY + lineBbox.y1));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return false;

  const imgData = ctx.getImageData(x0, y0, w, h);
  const data = imgData.data;

  // before the loop: background = most frequent quantized color in the region
  const key = (r: number, g: number, b: number) => `${r >> 4},${g >> 4},${b >> 4}`;
  const freq = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < data.length; i += 4) {
    const k = key(data[i], data[i + 1], data[i + 2]);
    const e = freq.get(k) || [data[i], data[i + 1], data[i + 2], 0];
    e[3]++;
    freq.set(k, e);
  }
  const bg = [...freq.values()].sort((a, b) => b[3] - a[3])[0];
  if (!bg) return false;

  let redTextCount = 0;
  let totalDarkCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // in the loop: ink = differs from background, not "dark"
    const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    if (dist > 120) {
      totalDarkCount++;
      if (r > g + 60 && r > b + 60) {
        redTextCount++;
      }
    }
  }

  // Red line if at least 6 red pixels AND red pixels represent >= 15% of ink pixels
  return redTextCount >= 6 && totalDarkCount > 0 && redTextCount / totalDarkCount >= 0.15;
}

function to24(h: number, m: number, pm: boolean): number {
  return ((h % 12) + (pm ? 12 : 0)) * 60 + m;
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Parse a raw time string like "09:00 - 10:00" or "1:00-1:30 PM" into 24h start and end times
 */
export function parseTimeInterval(raw: string): { start: string; end: string } | null {
  const m = raw.replace(/\s+/g, ' ').match(
    /(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i
  );
  if (!m) return null;

  const [sh, sm, eh, em] = [m[1], m[2], m[4], m[5]].map(Number);
  const startP = m[3]?.toLowerCase();
  const endP = m[6]?.toLowerCase();
  if (!endP) throw new Error(`Time label "${raw}" has no AM/PM on the end time`);

  const end = to24(eh, em, endP === 'pm');
  let start: number;
  if (startP) {
    start = to24(sh, sm, startP === 'pm');
  } else {
    // Start inherits PM if that still lands before the end, else AM
    const pmStart = to24(sh, sm, true);
    start = pmStart < end ? pmStart : to24(sh, sm, false);
  }
  if (start >= end) throw new Error(`Invalid time range "${raw}"`);
  return { start: fmt(start), end: fmt(end) };
}

/**
 * Parse time columns and verify that time rows are sequential.
 * Requirement: "throw if time rows aren’t sequential."
 */
export function extractAndValidateTimeRows(
  cells: MergedCell[],
  totalRows: number,
  totalCols: number
): { timeColumnIndex: number; intervals: Map<number, TimeInterval> } {
  // 1. Identify which column is the Time column
  const colTimeCounts = new Array(totalCols).fill(0);
  for (const cell of cells) {
    if (/\d{1,2}:\d{2}/.test(cell.text) || /time/i.test(cell.text)) {
      colTimeCounts[cell.col]++;
    }
  }

  let timeColIndex = 0;
  let maxCount = -1;
  for (let c = 0; c < totalCols; c++) {
    if (colTimeCounts[c] > maxCount) {
      maxCount = colTimeCounts[c];
      timeColIndex = c;
    }
  }

  // 2. Parse time intervals for each row
  // Requirement: "If a row’s OCR text contains more than one time range, throw an explicit error naming the row. No fallbacks."
  const timeRangeRegex = /\b\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}:\d{2}\s*(?:am|pm)?/gi;

  for (const cell of cells) {
    if (cell.col === timeColIndex) {
      const detectedRanges = cell.text.match(timeRangeRegex) || [];
      if (detectedRanges.length > 1) {
        throw new Error(
          `Row ${cell.row} contains more than one time range: "${cell.text}". Each row must contain at most one time range.`
        );
      }
    }
  }

  const rowIntervals = new Map<number, TimeInterval>();

  for (const cell of cells) {
    if (cell.col === timeColIndex) {
      const parsed = parseTimeInterval(cell.text);
      if (parsed) {
        const [sH, sM] = parsed.start.split(':').map(Number);
        const [eH, eM] = parsed.end.split(':').map(Number);
        const startMinutes = sH * 60 + sM;
        const endMinutes = eH * 60 + eM;

        const interval: TimeInterval = {
          row: cell.row,
          rawText: cell.text,
          start: parsed.start,
          end: parsed.end,
          startMinutes,
          endMinutes,
        };

        // If cell spans multiple rows, apply to all covered rows
        for (let r = cell.row; r < cell.row + cell.rowspan; r++) {
          rowIntervals.set(r, interval);
        }
      }
    }
  }

  // 3. Strict Sequential Validation:
  // "throw if time rows aren’t sequential."
  const sortedRowKeys = Array.from(rowIntervals.keys()).sort((a, b) => a - b);
  for (let i = 0; i < sortedRowKeys.length - 1; i++) {
    const rCurr = sortedRowKeys[i];
    const rNext = sortedRowKeys[i + 1];

    const intCurr = rowIntervals.get(rCurr)!;
    const intNext = rowIntervals.get(rNext)!;

    // Only compare if they represent distinct time intervals
    if (intCurr.rawText !== intNext.rawText) {
      if (intNext.startMinutes !== intCurr.endMinutes) {
        throw new Error(
          `Time gap/overlap between row ${rCurr} (${intCurr.end}) and row ${rNext} (${intNext.start})`
        );
      }
      if (intNext.startMinutes < intCurr.startMinutes) {
        throw new Error(
          `Time rows are not sequential: Row ${rCurr} has time "${intCurr.rawText}" (${intCurr.start}) but Row ${rNext} has time "${intNext.rawText}" (${intNext.start}). Schedule times must progress chronologically.`
        );
      }
    }
  }

  return { timeColumnIndex: timeColIndex, intervals: rowIntervals };
}

/**
 * Extract day column headers:
 * "Day = column header containing the cell’s x-center."
 */
export function extractDayHeaders(
  cells: MergedCell[],
  verticalLines: number[],
  totalCols: number
): Record<number, string> {
  const dayHeaders: Record<number, string> = {};

  const DAY_STANDARDIZED: Record<string, string> = {
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday',
    sat: 'Saturday',
    saturday: 'Saturday',
    sun: 'Sunday',
    sunday: 'Sunday',
  };

  const getDayFromText = (str: string): string | null => {
    const clean = str.toLowerCase().replace(/[^a-z]/g, '');
    return DAY_STANDARDIZED[clean] || null;
  };

  const counts = new Map<number, number>();
  for (const cell of cells) {
    const day = getDayFromText(cell.text) || (cell.lines ? cell.lines.map(l => getDayFromText(l.text)).find(Boolean) : null);
    if (day) {
      counts.set(cell.row, (counts.get(cell.row) || 0) + 1);
    }
  }

  const headerRow = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!headerRow || headerRow[1] < 3) throw new Error('Day header row not found');

  for (const cell of cells) {
    if (cell.row === headerRow[0]) {
      const matched = getDayFromText(cell.text) || (cell.lines ? cell.lines.map(l => getDayFromText(l.text)).find(Boolean) : null);
      if (matched) {
        for (let c = cell.col; c < cell.col + cell.colspan; c++) {
          dayHeaders[c] = matched;
        }
      }
    }
  }

  return dayHeaders;
}

/**
 * Parse merged cells into complete schedule entries:
 * - Section = line matching ^[A-Z]{3,5}\d(\.\d)?[A-Z]?$ (normalize O->0, I/l->1)
 * - Room = lines whose dark text pixels are red in original image (R>G+60 && R>B+60)
 * - Subject = remaining lines above section line joined by spaces
 * - Day = column header containing cell's x-center
 * - Start/end = OCR'd time-column labels for first and last rows spanned
 * - Cells with no section line are skipped and listed in "skipped" panel
 * - If a room-only cell sits directly below a class cell in same column, merge it: extend end time and use its room
 * - Leave missing fields blank and highlight them (no guessing)
 */
function isFilledCell(
  canvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number }
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const x = Math.floor(bbox.x + bbox.w / 2);
  const y = Math.floor(bbox.y + bbox.h / 2);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return (d[0] + d[1] + d[2]) / 3 < 240; // colored fill, not white
}

export function parseScheduleEntries(
  cells: MergedCell[],
  sourceCanvas: HTMLCanvasElement,
  verticalLines: number[],
  totalRows: number,
  totalCols: number
): ScheduleParseResult {
  // 1. Validate & extract sequential time rows (throws explicit error if non-sequential)
  const { timeColumnIndex, intervals: rowTimeIntervals } = extractAndValidateTimeRows(
    cells,
    totalRows,
    totalCols
  );

  // 2. Extract day headers
  const dayHeaders = extractDayHeaders(cells, verticalLines, totalCols);

  const rawEntries: ScheduleEntry[] = [];
  const skippedCells: SkippedCell[] = [];

  // Intermediate list of room-only cells to test for merging
  interface RoomOnlyCandidate {
    cell: MergedCell;
    roomText: string;
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  }
  const roomOnlyCandidates: RoomOnlyCandidate[] = [];

  for (const cell of cells) {
    // Ignore time column cells as schedule entries (they define the time grid)
    if (cell.col === timeColumnIndex) {
      skippedCells.push({
        id: cell.id,
        row: cell.row,
        col: cell.col,
        rowspan: cell.rowspan,
        colspan: cell.colspan,
        text: cell.text,
        reason: 'Time-grid coordinate column',
      });
      continue;
    }

    // Determine Day from cell's x-center
    const xCenter = cell.bbox.x + cell.bbox.w / 2;
    let cellCol = cell.col;
    for (let c = 0; c < verticalLines.length - 1; c++) {
      if (xCenter >= verticalLines[c] && xCenter < verticalLines[c + 1]) {
        cellCol = c;
        break;
      }
    }
    const day = dayHeaders[cellCol] || '';

    // Calculate Start and End times from spanned rows
    const firstRow = cell.row;
    const lastRow = cell.row + cell.rowspan - 1;

    const startInterval = rowTimeIntervals.get(firstRow);
    const endInterval = rowTimeIntervals.get(lastRow);

    const startTime = startInterval?.start || '';
    const endTime = endInterval?.end || startInterval?.end || '';

    // Inspect lines
    const lines = cell.lines || [];

    let sectionCandidate: string | null = null;
    let sectionLineIndex = -1;
    let roomCandidate: string = '';
    const redLineIndices = new Set<number>();

    // 1. Identify Room lines via red pixel test (R>G+60 && R>B+60)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isRed = isLineRedInk(sourceCanvas, cell.bbox, line.bbox);
      if (isRed) {
        redLineIndices.add(i);
        if (!roomCandidate) {
          roomCandidate = line.text.trim();
        }
      }
    }

    // 2. Identify Section line matching ^[A-Z]{3,5}\d(\.\d)?[A-Z]?$ (normalize O->0, I/l->1)
    for (let i = 0; i < lines.length; i++) {
      if (redLineIndices.has(i)) continue;
      const matched = normalizeAndMatchSection(lines[i].text);
      if (matched) {
        sectionCandidate = matched;
        sectionLineIndex = i;
        break;
      }
    }

    // Check if cell has a section line
    if (!sectionCandidate) {
      // Cell has no section line -> Check if it is a room-only cell
      if (roomCandidate || redLineIndices.size > 0) {
        const roomTxt = roomCandidate || (lines[0]?.text || '').trim();
        roomOnlyCandidates.push({
          cell,
          roomText: roomTxt,
          row: cell.row,
          col: cell.col,
          rowspan: cell.rowspan,
          colspan: cell.colspan,
        });

        skippedCells.push({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          rowspan: cell.rowspan,
          colspan: cell.colspan,
          text: cell.text,
          reason: 'Room-only cell (awaiting merge with class cell above)',
          isRoomOnly: true,
        });
      } else {
        // Regular skipped cell
        skippedCells.push({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          rowspan: cell.rowspan,
          colspan: cell.colspan,
          text: cell.text,
          reason: 'No section code matching ^[A-Z]{3,5}\\d(\\.\\d)?[A-Z]?$',
        });
      }
      continue;
    }

    // 3. Subject = remaining lines above the section line, joined by spaces
    const linesAbove = lines
      .slice(0, sectionLineIndex)
      .filter((_, idx) => !redLineIndices.has(idx));

    const subject = linesAbove.map((l) => l.text.trim()).filter(Boolean).join(' ');

    // Compile missing fields for strict highlighting (no guessing!)
    const missingFields: string[] = [];
    if (!subject) missingFields.push('subject');
    if (!sectionCandidate) missingFields.push('section');
    if (!roomCandidate) missingFields.push('room');
    if (!day) missingFields.push('day');
    if (!startTime) missingFields.push('startTime');
    if (!endTime) missingFields.push('endTime');

    rawEntries.push({
      id: `entry_${cell.id}`,
      subject,
      section: sectionCandidate,
      room: roomCandidate,
      day,
      startTime,
      endTime,
      row: cell.row,
      col: cellCol,
      rowspan: cell.rowspan,
      colspan: cell.colspan,
      isAdded: false,
      missingFields,
      rawLines: lines.map((l) => l.text),
    });
  }

  // =========================================================================
  // Room-only cell merge rule:
  // "If a room-only cell sits directly below a class cell in the same column,
  // merge it into that class: extend the end time and use its room."
  // =========================================================================
  const mergedRoomCellIds = new Set<string>();

  for (const entry of rawEntries) {
    // Find if a room-only cell sits directly below this entry in the same column:
    // row === entry.row + entry.rowspan, and col matches
    const expectedRow = entry.row + entry.rowspan;
    const matchingRoomCell = roomOnlyCandidates.find(
      (roc) =>
        roc.row === expectedRow &&
        !entry.room &&
        (roc.col === entry.col ||
          (roc.col >= entry.col && roc.col < entry.col + entry.colspan))
    );

    if (matchingRoomCell) {
      // Merge room from below cell into class
      entry.room = matchingRoomCell.roomText;

      // Extend end time
      const newLastRow = matchingRoomCell.row + matchingRoomCell.rowspan - 1;
      const extendedEnd = rowTimeIntervals.get(newLastRow);
      if (extendedEnd) {
        entry.endTime = extendedEnd.end;
      }
      entry.rowspan = newLastRow - entry.row + 1;
      entry.mergedFromRoomOnlyCell = true;

      // Re-evaluate missing fields
      entry.missingFields = entry.missingFields.filter(
        (f) => f !== 'room' && f !== 'endTime'
      );

      mergedRoomCellIds.add(matchingRoomCell.cell.id);
    }
  }

  // Relabel what remains in the skipped panel (items 13 and 14)
  const finalSkippedCells = skippedCells
    .filter((sc) => !mergedRoomCellIds.has(sc.id))
    .map((sc) => {
      if (sc.isRoomOnly) {
        return { ...sc, reason: 'Room-only, no class above (undecided)' };
      }
      if (!sc.text.trim() && sc.col !== timeColumnIndex) {
        const cell = cells.find((c) => c.id === sc.id);
        const below = rawEntries.some(
          (e) =>
            sc.row === e.row + e.rowspan &&
            sc.col >= e.col &&
            sc.col < e.col + e.colspan
        );
        if (cell && below && isFilledCell(sourceCanvas, cell.bbox)) {
          return { ...sc, reason: 'Empty cell below class (unconfirmed)' };
        }
      }
      return sc;
    });

  return {
    entries: rawEntries,
    skippedCells: finalSkippedCells,
    timeColumnIndex,
    timeIntervals: Array.from(rowTimeIntervals.values()),
    dayHeaders,
  };
}