/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SampleSchedule {
  id: string;
  title: string;
  description: string;
  generate: () => HTMLCanvasElement;
}

/**
 * Generate a synthetic schedule table image with crisp borders,
 * clear text, and merged header / multi-hour blocks.
 */
export function createUniversityScheduleCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Clean white paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Margins & Geometry
  const left = 60;
  const top = 60;
  const colWidths = [140, 180, 180, 180, 180, 180];
  const rowHeights = [60, 50, 80, 80, 60, 80, 80];

  // Cumulative positions
  const xPositions: number[] = [left];
  for (const w of colWidths) {
    xPositions.push(xPositions[xPositions.length - 1] + w);
  }
  const yPositions: number[] = [top];
  for (const h of rowHeights) {
    yPositions.push(yPositions[yPositions.length - 1] + h);
  }

  // Draw cells and text
  // Row 0: Top title banner spanning ALL columns (Colspan 6) -> no vertical dividing lines!
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    'DEPARTMENT OF COMPUTER SCIENCE - TIMETABLE',
    (xPositions[0] + xPositions[6]) / 2,
    (yPositions[0] + yPositions[1]) / 2
  );

  // Row 1: Headers (Time, Mon, Tue, Wed, Thu, Fri)
  const headers = ['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  ctx.font = 'bold 16px Arial, sans-serif';
  for (let c = 0; c < 6; c++) {
    ctx.fillText(
      headers[c],
      (xPositions[c] + xPositions[c + 1]) / 2,
      (yPositions[1] + yPositions[2]) / 2
    );
  }

  // Helper to draw a class cell with Subject, Section, and Red Room
  const drawClassCell = (
    c: number,
    r: number,
    subject: string,
    section: string,
    room: string,
    spanC: number = 1,
    spanR: number = 1
  ) => {
    const xMid = (xPositions[c] + xPositions[c + spanC]) / 2;
    const yTop = yPositions[r];
    const yBot = yPositions[r + spanR];
    const yMid = (yTop + yBot) / 2;

    // 1. Subject (dark slate)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(subject, xMid, yMid - 18);

    // 2. Section matching ^[A-Z]{3,5}\d(\.\d)?[A-Z]?$
    ctx.fillStyle = '#1e293b';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(section, xMid, yMid);

    // 3. Room in Red ink (R>G+60 && R>B+60)
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText(room, xMid, yMid + 18);
  };

  // Helper to draw time label
  const drawTimeLabel = (r: number, text: string) => {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(text, (xPositions[0] + xPositions[1]) / 2, (yPositions[r] + yPositions[r + 1]) / 2);
  };

  // Row 2 (09:00 - 10:00)
  drawTimeLabel(2, '09:00 - 10:00');
  drawClassCell(1, 2, 'Calculus I', 'MATH1', 'Room 101');
  drawClassCell(2, 2, 'Physics', 'PHYS2', 'Lab 204');
  // Wed & Thu: Merged 2-column Lab! (Colspan 2: xPositions[3] to xPositions[5])
  drawClassCell(3, 2, 'AI Systems', 'CSCI1A', 'Room 402', 2, 1);
  // Friday Row 2: Class with Subject & Section, but NO room (room sits in cell directly below!)
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('Cyber Security', (xPositions[5] + xPositions[6]) / 2, (yPositions[2] + yPositions[3]) / 2 - 10);
  ctx.fillStyle = '#1e293b';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('INFO1', (xPositions[5] + xPositions[6]) / 2, (yPositions[2] + yPositions[3]) / 2 + 10);

  // Row 3 (10:00 - 11:00)
  drawTimeLabel(3, '10:00 - 11:00');
  drawClassCell(1, 3, 'Calculus I', 'MATH1', 'Room 101');
  drawClassCell(2, 3, 'Physics', 'PHYS2', 'Lab 204');
  drawClassCell(3, 3, 'Databases', 'DATA1', 'Room 305');
  drawClassCell(4, 3, 'Algorithms', 'ALGO2', 'Room 308');
  // Friday Row 3 directly below Row 2: ROOM-ONLY CELL in Red (tests room-only merging rule!)
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('Room 501', (xPositions[5] + xPositions[6]) / 2, (yPositions[3] + yPositions[4]) / 2);

  // Row 4 (11:00 - 12:00): CAMPUS LUNCH BREAK spanning col 1 to 5 (Colspan 5)
  drawTimeLabel(4, '11:00 - 12:00');
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText('CAMPUS LUNCH BREAK & RECESS', (xPositions[1] + xPositions[6]) / 2, (yPositions[4] + yPositions[5]) / 2);

  // Row 5 & 6 (12:00 - 14:00):
  drawTimeLabel(5, '12:00 - 13:00');
  drawClassCell(1, 5, 'Linear Algebra', 'MATH2', 'Room 102');
  // Col 2 spans Row 5 and 6 (Rowspan 2)!
  drawClassCell(2, 5, 'Robotics Studio', 'ROB1.1A', 'Studio A', 1, 2);
  drawClassCell(3, 5, 'Web Tech', 'WEB1', 'Lab 102');
  drawClassCell(4, 5, 'Networks', 'NET1', 'Room 205');
  drawClassCell(5, 5, 'Seminar', 'SEM3', 'Auditorium');

  // Row 6 (13:00 - 14:00)
  drawTimeLabel(6, '13:00 - 14:00');
  drawClassCell(1, 6, 'Linear Algebra', 'MATH2', 'Room 102');
  drawClassCell(3, 6, 'Web Tech', 'WEB1', 'Lab 102');
  drawClassCell(4, 6, 'Networks', 'NET1', 'Room 205');
  drawClassCell(5, 6, 'Office Hours', 'PROF1', 'Room 410');

  // ========================================================
  // DRAW GRID LINES (Reflecting the merged regions accurately!)
  // ========================================================
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;

  // Outer border
  ctx.strokeRect(left, top, xPositions[6] - left, yPositions[7] - top);

  // Horizontal Lines:
  // yPositions[1]: full line
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[1]);
  ctx.lineTo(xPositions[6], yPositions[1]);
  ctx.stroke();

  // yPositions[2]: full line
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[2]);
  ctx.lineTo(xPositions[6], yPositions[2]);
  ctx.stroke();

  // yPositions[3]: full line
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[3]);
  ctx.lineTo(xPositions[6], yPositions[3]);
  ctx.stroke();

  // yPositions[4]: full line
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[4]);
  ctx.lineTo(xPositions[6], yPositions[4]);
  ctx.stroke();

  // yPositions[5]: full line
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[5]);
  ctx.lineTo(xPositions[6], yPositions[5]);
  ctx.stroke();

  // yPositions[6]: OMIT horizontal line in col 2 (Robotics 2-hour block: Rowspan 2)!
  ctx.beginPath();
  ctx.moveTo(xPositions[0], yPositions[6]);
  ctx.lineTo(xPositions[2], yPositions[6]); // draws col 0 and 1
  ctx.moveTo(xPositions[3], yPositions[6]); // skips col 2!
  ctx.lineTo(xPositions[6], yPositions[6]); // draws cols 3, 4, 5
  ctx.stroke();

  // Vertical Lines:
  // xPositions[1]: Time column divider (rows 1..6)
  ctx.beginPath();
  ctx.moveTo(xPositions[1], yPositions[1]);
  ctx.lineTo(xPositions[1], yPositions[7]);
  ctx.stroke();

  // xPositions[2]: divider between Mon & Tue (rows 1..3, and 5..6, OMIT row 4 Lunch!)
  ctx.beginPath();
  ctx.moveTo(xPositions[2], yPositions[1]);
  ctx.lineTo(xPositions[2], yPositions[4]); // rows 1, 2, 3
  ctx.moveTo(xPositions[2], yPositions[5]); // skip row 4 Lunch
  ctx.lineTo(xPositions[2], yPositions[7]); // rows 5, 6
  ctx.stroke();

  // xPositions[3]: divider between Tue & Wed (rows 1..3, and 5..6, OMIT row 4 Lunch!)
  ctx.beginPath();
  ctx.moveTo(xPositions[3], yPositions[1]);
  ctx.lineTo(xPositions[3], yPositions[4]);
  ctx.moveTo(xPositions[3], yPositions[5]);
  ctx.lineTo(xPositions[3], yPositions[7]);
  ctx.stroke();

  // xPositions[4]: divider between Wed & Thu
  // (OMIT in row 2: AI Systems Lab Colspan 2! OMIT in row 4: Lunch!)
  ctx.beginPath();
  ctx.moveTo(xPositions[4], yPositions[1]);
  ctx.lineTo(xPositions[4], yPositions[2]); // row 1 header
  ctx.moveTo(xPositions[4], yPositions[3]); // skip row 2 Lab
  ctx.lineTo(xPositions[4], yPositions[4]); // row 3
  ctx.moveTo(xPositions[4], yPositions[5]); // skip row 4 Lunch
  ctx.lineTo(xPositions[4], yPositions[7]); // rows 5, 6
  ctx.stroke();

  // xPositions[5]: divider between Thu & Fri
  ctx.beginPath();
  ctx.moveTo(xPositions[5], yPositions[1]);
  ctx.lineTo(xPositions[5], yPositions[4]);
  ctx.moveTo(xPositions[5], yPositions[5]);
  ctx.lineTo(xPositions[5], yPositions[7]);
  ctx.stroke();

  return canvas;
}

/**
 * Generate a Conference Session Schedule with keynote and multi-track workshops
 */
export function createConferenceScheduleCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const left = 50;
  const top = 50;
  const colW = [130, 240, 240, 240];
  const rowH = [55, 50, 75, 75, 55, 80];

  const xPositions: number[] = [left];
  for (const w of colW) xPositions.push(xPositions[xPositions.length - 1] + w);
  const yPositions: number[] = [top];
  for (const h of rowH) yPositions.push(yPositions[yPositions.length - 1] + h);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Row 0: Header title
  ctx.fillText('TECH SUMMIT 2026 - AGENDA', (xPositions[0] + xPositions[4]) / 2, (yPositions[0] + yPositions[1]) / 2);

  // Row 1: Columns (Time, Track A, Track B, Track C)
  const headers = ['Time', 'Track A: Cloud', 'Track B: Security', 'Track C: AI & ML'];
  ctx.font = 'bold 15px Arial, sans-serif';
  for (let c = 0; c < 4; c++) {
    ctx.fillText(headers[c], (xPositions[c] + xPositions[c + 1]) / 2, (yPositions[1] + yPositions[2]) / 2);
  }

  // Row 2: Keynote Address across ALL 3 Tracks (Colspan 3)
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('09:00 - 10:15', (xPositions[0] + xPositions[1]) / 2, (yPositions[2] + yPositions[3]) / 2);
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText('OPENING KEYNOTE: THE FUTURE OF COMPUTING', (xPositions[1] + xPositions[4]) / 2, (yPositions[2] + yPositions[3]) / 2);
  ctx.font = '14px Arial, sans-serif';

  // Row 3: Parallel sessions
  ctx.fillText('10:30 - 11:45', (xPositions[0] + xPositions[1]) / 2, (yPositions[3] + yPositions[4]) / 2);
  ctx.fillText('Serverless Scale', (xPositions[1] + xPositions[2]) / 2, (yPositions[3] + yPositions[4]) / 2);
  ctx.fillText('Zero-Trust Arch', (xPositions[2] + xPositions[3]) / 2, (yPositions[3] + yPositions[4]) / 2);
  ctx.fillText('LLM Pipelines', (xPositions[3] + xPositions[4]) / 2, (yPositions[3] + yPositions[4]) / 2);

  // Row 4: Networking Break (Colspan 3)
  ctx.fillText('11:45 - 13:00', (xPositions[0] + xPositions[1]) / 2, (yPositions[4] + yPositions[5]) / 2);
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('EXHIBIT HALL & NETWORKING LUNCH', (xPositions[1] + xPositions[4]) / 2, (yPositions[4] + yPositions[5]) / 2);
  ctx.font = '14px Arial, sans-serif';

  // Row 5: Afternoon Deep Dives
  ctx.fillText('13:00 - 14:30', (xPositions[0] + xPositions[1]) / 2, (yPositions[5] + yPositions[6]) / 2);
  ctx.fillText('Kubernetes Ops', (xPositions[1] + xPositions[2]) / 2, (yPositions[5] + yPositions[6]) / 2);
  ctx.fillText('Applied Cryptography', (xPositions[2] + xPositions[3]) / 2, (yPositions[5] + yPositions[6]) / 2);
  ctx.fillText('Model Distillation', (xPositions[3] + xPositions[4]) / 2, (yPositions[5] + yPositions[6]) / 2);

  // Grid Borders
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, xPositions[4] - left, yPositions[6] - top);

  // Horizontals
  for (let r = 1; r < 6; r++) {
    ctx.beginPath();
    ctx.moveTo(xPositions[0], yPositions[r]);
    ctx.lineTo(xPositions[4], yPositions[r]);
    ctx.stroke();
  }

  // Verticals
  // Col 1 divider (Time)
  ctx.beginPath();
  ctx.moveTo(xPositions[1], yPositions[1]);
  ctx.lineTo(xPositions[1], yPositions[6]);
  ctx.stroke();

  // Col 2 & 3 dividers (Skip Row 2 Keynote and Row 4 Lunch!)
  for (let c = 2; c <= 3; c++) {
    ctx.beginPath();
    ctx.moveTo(xPositions[c], yPositions[1]);
    ctx.lineTo(xPositions[c], yPositions[2]); // header
    ctx.moveTo(xPositions[c], yPositions[3]); // skip keynote
    ctx.lineTo(xPositions[c], yPositions[4]); // session
    ctx.moveTo(xPositions[c], yPositions[5]); // skip lunch
    ctx.lineTo(xPositions[c], yPositions[6]); // afternoon
    ctx.stroke();
  }

  return canvas;
}

/**
 * Generate a non-table image to explicitly verify error handling
 * Requirement: "Throw explicit errors if no grid is detected. No fallbacks, one code path."
 */
export function createInvalidNoGridCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;

  // Smooth decorative color gradient with no lines or tables
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#f97316');
  grad.addColorStop(0.5, '#ec4899');
  grad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Sunset Nature Photo', canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '16px sans-serif';
  ctx.fillText('(Contains no grid lines or table borders)', canvas.width / 2, canvas.height / 2 + 20);

  return canvas;
}

export const SAMPLE_SCHEDULES: SampleSchedule[] = [
  {
    id: 'university',
    title: 'University Schedule',
    description: 'Lecture schedule with 2-hour lab, 5-col lunch break & day headers',
    generate: createUniversityScheduleCanvas,
  },
  {
    id: 'conference',
    title: 'Conference Agenda',
    description: 'Summit program with merged keynote address across 3 tracks',
    generate: createConferenceScheduleCanvas,
  },
  {
    id: 'invalid_photo',
    title: 'Non-Grid Image (Error Test)',
    description: 'Demonstrates strict error throwing when no grid lines are detected',
    generate: createInvalidNoGridCanvas,
  },
];
