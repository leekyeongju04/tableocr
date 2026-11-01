/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ScheduleEntry {
  id: string;
  subject: string;
  section: string;
  room: string;
  day: string;
  startTime: string; // 24h format: HH:MM
  endTime: string;   // 24h format: HH:MM
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  isAdded?: boolean;
  missingFields: string[]; // List of fields that are blank: e.g. ['subject', 'room']
  rawLines?: string[];
  mergedFromRoomOnlyCell?: boolean;
}

export interface SkippedCell {
  id: string;
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  text: string;
  reason: string;
  isRoomOnly?: boolean;
}

export interface TimeInterval {
  row: number;
  rawText: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  startMinutes: number;
  endMinutes: number;
}

export interface DayTeachingHoursCheck {
  day: string;
  parsedHours: number;
  expectedHours: number;
  matched: boolean;
}

export interface TeachingHoursVerification {
  footerFound: boolean;
  footerRow?: number;
  dayChecks: DayTeachingHoursCheck[];
  statusMessage: string;
}

export interface ScheduleParseResult {
  entries: ScheduleEntry[];
  skippedCells: SkippedCell[];
  timeColumnIndex: number;
  timeIntervals: TimeInterval[];
  dayHeaders: Record<number, string>; // colIndex -> Day name
  teachingHoursVerification?: TeachingHoursVerification;
}
