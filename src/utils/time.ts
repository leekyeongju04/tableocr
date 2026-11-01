/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format a 24-hour "HH:MM" string into a 12-hour formatted string (e.g. "07:00" -> "7:00 AM", "13:30" -> "1:30 PM").
 * Single source of truth across the app.
 */
export function to12Hour(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
