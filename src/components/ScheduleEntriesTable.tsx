/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ScheduleEntry } from '../types/schedule';
import { to12Hour } from '../utils/time';
import {
  Calendar,
  Plus,
  Check,
  AlertCircle,
  Clock,
  MapPin,
  Tag,
  BookOpen,
  Download,
  Copy,
  Trash2,
  Sparkles,
  Layers,
  Filter,
} from 'lucide-react';

interface ScheduleEntriesTableProps {
  entries: ScheduleEntry[];
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
  onUpdateEntry: (updatedEntry: ScheduleEntry) => void;
  onToggleAddEntry: (id: string) => void;
  onAddCustomRow: () => void;
  onDeleteEntry: (id: string) => void;
}

const CANONICAL_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_COLOR_CONFIG: Record<
  string,
  { badge: string; text: string; border: string; bg: string; dot: string }
> = {
  Monday: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-950/20',
    dot: 'bg-indigo-400',
  },
  Tuesday: {
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    bg: 'bg-violet-950/20',
    dot: 'bg-violet-400',
  },
  Wednesday: {
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-950/20',
    dot: 'bg-cyan-400',
  },
  Thursday: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-950/20',
    dot: 'bg-amber-400',
  },
  Friday: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/20',
    dot: 'bg-emerald-400',
  },
  Saturday: {
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    bg: 'bg-rose-950/20',
    dot: 'bg-rose-400',
  },
  Sunday: {
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-950/20',
    dot: 'bg-orange-400',
  },
};

function computeDayHours(entriesList: ScheduleEntry[]): number {
  return entriesList.reduce((sum, e) => {
    if (!e.startTime || !e.endTime) return sum;
    const [sh, sm] = e.startTime.split(':').map(Number);
    const [eh, em] = e.endTime.split(':').map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    return sum + (diff > 0 ? diff / 60 : 0);
  }, 0);
}

export const ScheduleEntriesTable: React.FC<ScheduleEntriesTableProps> = ({
  entries,
  selectedCellId,
  onSelectCell,
  onUpdateEntry,
  onToggleAddEntry,
  onAddCustomRow,
  onDeleteEntry,
}) => {
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [groupByDay, setGroupByDay] = useState<boolean>(true);
  const [dayFilter, setDayFilter] = useState<string>('ALL');

  // Filter entries by search query and optional day filter
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Day filter
      if (dayFilter !== 'ALL') {
        const matchesDay =
          entry.day.toLowerCase().trim() === dayFilter.toLowerCase().trim();
        if (!matchesDay) return false;
      }

      // Query filter
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      const time12Start = to12Hour(entry.startTime).toLowerCase();
      const time12End = to12Hour(entry.endTime).toLowerCase();

      return (
        entry.subject.toLowerCase().includes(q) ||
        entry.section.toLowerCase().includes(q) ||
        entry.room.toLowerCase().includes(q) ||
        entry.day.toLowerCase().includes(q) ||
        entry.startTime.includes(q) ||
        entry.endTime.includes(q) ||
        time12Start.includes(q) ||
        time12End.includes(q)
      );
    });
  }, [entries, filterQuery, dayFilter]);

  // Group entries by day
  const groupedEntries = useMemo(() => {
    const groups: Array<{
      day: string;
      entries: ScheduleEntry[];
      hours: number;
    }> = [];

    // Canonical days first
    for (const d of CANONICAL_DAYS) {
      const dayMatches = filteredEntries.filter(
        (e) => e.day.toLowerCase().trim() === d.toLowerCase()
      );
      if (dayMatches.length > 0 || (dayFilter === d && filteredEntries.length === 0)) {
        groups.push({
          day: d,
          entries: dayMatches,
          hours: computeDayHours(dayMatches),
        });
      }
    }

    // Any entries with other / unstandardized days
    const otherEntries = filteredEntries.filter(
      (e) =>
        !CANONICAL_DAYS.some(
          (cd) => cd.toLowerCase() === e.day.toLowerCase().trim()
        )
    );
    if (otherEntries.length > 0) {
      groups.push({
        day: 'Other / Custom',
        entries: otherEntries,
        hours: computeDayHours(otherEntries),
      });
    }

    return groups;
  }, [filteredEntries, dayFilter]);

  const addedCount = entries.filter((e) => e.isAdded).length;

  const handleFieldChange = (
    entry: ScheduleEntry,
    field: keyof ScheduleEntry,
    value: string
  ) => {
    const updated = {
      ...entry,
      [field]: value,
    };

    // Recompute missing fields
    const missing: string[] = [];
    if (!updated.subject.trim()) missing.push('subject');
    if (!updated.section.trim()) missing.push('section');
    if (!updated.room.trim()) missing.push('room');
    if (!updated.day.trim()) missing.push('day');
    if (!updated.startTime.trim()) missing.push('startTime');
    if (!updated.endTime.trim()) missing.push('endTime');

    updated.missingFields = missing;
    onUpdateEntry(updated);
  };

  const handleCopyJson = async () => {
    const data = entries.map((e) => ({
      subject: e.subject,
      section: e.section,
      room: e.room,
      day: e.day,
      startTime: to12Hour(e.startTime),
      endTime: to12Hour(e.endTime),
      startTime24h: e.startTime,
      endTime24h: e.endTime,
    }));
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedFormat('json');
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleDownloadCsv = () => {
    const header = [
      'Subject',
      'Section',
      'Room',
      'Day',
      'Start Time (12h)',
      'End Time (12h)',
      'Start Time (24h)',
      'End Time (24h)',
    ];
    const rows = entries.map((e) => [
      `"${e.subject.replace(/"/g, '""')}"`,
      `"${e.section.replace(/"/g, '""')}"`,
      `"${e.room.replace(/"/g, '""')}"`,
      `"${e.day.replace(/"/g, '""')}"`,
      `"${to12Hour(e.startTime)}"`,
      `"${to12Hour(e.endTime)}"`,
      `"${e.startTime}"`,
      `"${e.endTime}"`,
    ]);

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join(
      '\n'
    );
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_entries.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIcs = () => {
    const dayMap: Record<string, string> = {
      sunday: 'SU',
      monday: 'MO',
      tuesday: 'TU',
      wednesday: 'WE',
      thursday: 'TH',
      friday: 'FR',
      saturday: 'SA',
    };

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TableGrid OCR//Schedule Extractor//EN',
      'CALSCALE:GREGORIAN',
    ];

    entries.forEach((e, idx) => {
      const byDay = dayMap[e.day.toLowerCase()] || 'MO';
      const startClean = e.startTime.replace(':', '') + '00';
      const endClean = e.endTime.replace(':', '') + '00';

      ics.push(
        'BEGIN:VEVENT',
        `UID:entry-${idx}-${Date.now()}@tablegrid.ocr`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `SUMMARY:${e.subject || 'Class'} (${e.section})`,
        `LOCATION:${e.room}`,
        `DESCRIPTION:Section: ${e.section}\\nRoom: ${e.room}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`,
        `DTSTART;TZID=UTC:20261102T${startClean}`,
        `DTEND;TZID=UTC:20261102T${endClean}`,
        'END:VEVENT'
      );
    });

    ics.push('END:VCALENDAR');

    const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRow = (entry: ScheduleEntry, idx: number) => {
    const isSelected = selectedCellId === entry.id.replace('entry_', '');
    const hasMissing = entry.missingFields.length > 0;

    return (
      <tr
        key={entry.id}
        onClick={() => onSelectCell(entry.id.replace('entry_', ''))}
        className={`transition ${
          isSelected
            ? 'bg-indigo-950/40 ring-1 ring-indigo-500/50'
            : 'hover:bg-slate-850/60 bg-slate-900/30'
        }`}
      >
        <td className="p-3 text-center text-slate-500 font-mono text-[11px]">
          {idx + 1}
        </td>

        {/* Subject */}
        <td className="p-2">
          <div className="relative">
            <input
              type="text"
              value={entry.subject}
              placeholder="[Blank Subject]"
              onChange={(e) =>
                handleFieldChange(entry, 'subject', e.target.value)
              }
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs transition focus:outline-none ${
                !entry.subject.trim()
                  ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 placeholder-amber-400/60 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/80 border border-slate-700/80 text-white focus:border-indigo-500'
              }`}
            />
            {!entry.subject.trim() && (
              <span className="absolute right-2 top-2 text-[9px] font-mono text-amber-400/90 pointer-events-none">
                Missing
              </span>
            )}
          </div>
        </td>

        {/* Section */}
        <td className="p-2">
          <div className="relative">
            <input
              type="text"
              value={entry.section}
              placeholder="[Blank Section]"
              onChange={(e) =>
                handleFieldChange(entry, 'section', e.target.value)
              }
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono transition focus:outline-none ${
                !entry.section.trim()
                  ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 placeholder-amber-400/60 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/80 border border-slate-700/80 text-cyan-300 font-semibold focus:border-indigo-500'
              }`}
            />
            {!entry.section.trim() && (
              <span className="absolute right-2 top-2 text-[9px] font-mono text-amber-400/90 pointer-events-none">
                Missing
              </span>
            )}
          </div>
        </td>

        {/* Room */}
        <td className="p-2">
          <div className="relative">
            <input
              type="text"
              value={entry.room}
              placeholder="[Blank Room]"
              onChange={(e) => handleFieldChange(entry, 'room', e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs transition focus:outline-none ${
                !entry.room.trim()
                  ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 placeholder-amber-400/60 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/80 border border-slate-700/80 text-rose-300 font-medium focus:border-indigo-500'
              }`}
            />
            {!entry.room.trim() ? (
              <span className="absolute right-2 top-2 text-[9px] font-mono text-amber-400/90 pointer-events-none">
                Missing
              </span>
            ) : entry.mergedFromRoomOnlyCell ? (
              <span
                title="Room merged from adjacent cell directly below"
                className="absolute right-2 top-2 text-[9px] font-mono text-emerald-400 pointer-events-none"
              >
                Merged ✓
              </span>
            ) : null}
          </div>
        </td>

        {/* Day */}
        <td className="p-2">
          <div className="relative">
            <select
              value={entry.day}
              onChange={(e) => handleFieldChange(entry, 'day', e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs transition focus:outline-none cursor-pointer ${
                !entry.day.trim()
                  ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/80 border border-slate-700/80 text-amber-300 font-medium focus:border-indigo-500'
              }`}
            >
              <option value="">[Blank Day]</option>
              <option value="Monday">Monday</option>
              <option value="Tuesday">Tuesday</option>
              <option value="Wednesday">Wednesday</option>
              <option value="Thursday">Thursday</option>
              <option value="Friday">Friday</option>
              <option value="Saturday">Saturday</option>
              <option value="Sunday">Sunday</option>
            </select>
            {!entry.day.trim() && (
              <span className="absolute right-6 top-2 text-[9px] font-mono text-amber-400/90 pointer-events-none">
                Missing
              </span>
            )}
          </div>
        </td>

        {/* Start Time (12h format prominent) */}
        <td className="p-2">
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={entry.startTime}
                onChange={(e) =>
                  handleFieldChange(entry, 'startTime', e.target.value)
                }
                className={`w-24 px-2 py-1 rounded-md text-xs font-mono transition focus:outline-none ${
                  !entry.startTime.trim()
                    ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 ring-1 ring-amber-500/40'
                    : 'bg-slate-950/80 border border-slate-700/80 text-slate-200 focus:border-indigo-500'
                }`}
              />
              {entry.startTime ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs whitespace-nowrap shadow-sm">
                  {to12Hour(entry.startTime)}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-amber-400">
                  Missing
                </span>
              )}
            </div>
          </div>
        </td>

        {/* End Time (12h format prominent) */}
        <td className="p-2">
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={entry.endTime}
                onChange={(e) =>
                  handleFieldChange(entry, 'endTime', e.target.value)
                }
                className={`w-24 px-2 py-1 rounded-md text-xs font-mono transition focus:outline-none ${
                  !entry.endTime.trim()
                    ? 'bg-amber-950/40 border border-amber-500/80 text-amber-200 ring-1 ring-amber-500/40'
                    : 'bg-slate-950/80 border border-slate-700/80 text-slate-200 focus:border-indigo-500'
                }`}
              />
              {entry.endTime ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs whitespace-nowrap shadow-sm">
                  {to12Hour(entry.endTime)}
                </span>
              ) : (
                <span className="text-[10px] font-mono text-amber-400">
                  Missing
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Action: Per-Row "Add" Button */}
        <td className="p-2 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAddEntry(entry.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow ${
                entry.isAdded
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : hasMissing
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {entry.isAdded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </>
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEntry(entry.id);
              }}
              title="Delete Entry"
              className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Table Header Bar */}
      <div className="flex flex-col gap-3 p-4 bg-slate-950/80 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-slate-100 text-sm">
              Schedule Entries ({entries.length})
            </h3>
            {addedCount > 0 && (
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/30">
                {addedCount} Added
              </span>
            )}
          </div>

          {/* Toolbar Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search subject, section, time..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
            />

            {/* Categorize By Day Toggle */}
            <button
              onClick={() => setGroupByDay(!groupByDay)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                groupByDay
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-sm'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle Day Grouping"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{groupByDay ? 'Categorized by Day' : 'Flat List'}</span>
            </button>

            <button
              onClick={onAddCustomRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </button>

            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            >
              {copiedFormat === 'json' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{copiedFormat === 'json' ? 'Copied!' : 'Copy JSON'}</span>
            </button>

            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              onClick={handleDownloadIcs}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow"
              title="Download iCalendar format (.ics) for Google/Apple Calendar"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Export iCal (.ics)</span>
            </button>
          </div>
        </div>

        {/* Day Categorization Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3 text-slate-500" />
            <span>Day:</span>
          </span>
          <button
            onClick={() => setDayFilter('ALL')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
              dayFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            All Days ({entries.length})
          </button>
          {CANONICAL_DAYS.map((dayName) => {
            const count = entries.filter(
              (e) => e.day.toLowerCase().trim() === dayName.toLowerCase()
            ).length;
            const isSelected = dayFilter.toLowerCase() === dayName.toLowerCase();
            const config = DAY_COLOR_CONFIG[dayName];

            return (
              <button
                key={dayName}
                onClick={() => setDayFilter(isSelected ? 'ALL' : dayName)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? `${config.badge} shadow-sm font-semibold`
                    : count > 0
                    ? 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:bg-slate-800'
                    : 'bg-slate-900/40 text-slate-500 border-slate-800/50 hover:text-slate-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                <span>{dayName.slice(0, 3)}</span>
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editable Table View */}
      <div className="flex-1 overflow-auto bg-slate-950 p-4">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-600" />
            <p>No schedule entries match the selected filters.</p>
            <p className="text-[11px] text-slate-600">
              Clear search query or day filter to show all entries.
            </p>
          </div>
        ) : (
          <div className="border border-slate-800 rounded-xl overflow-hidden shadow-lg bg-slate-900/50">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Subject</span>
                    </div>
                  </th>
                  <th className="p-3 min-w-[110px]">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Section</span>
                    </div>
                  </th>
                  <th className="p-3 min-w-[110px]">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>Room</span>
                    </div>
                  </th>
                  <th className="p-3 min-w-[120px]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>Day</span>
                    </div>
                  </th>
                  <th className="p-3 min-w-[170px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>START (12H)</span>
                    </div>
                  </th>
                  <th className="p-3 min-w-[170px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>END (12H)</span>
                    </div>
                  </th>
                  <th className="p-3 text-center min-w-[110px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-normal">
                {groupByDay ? (
                  // Categorized by Day View
                  groupedEntries.map((group) => {
                    if (group.entries.length === 0) return null;
                    const config =
                      DAY_COLOR_CONFIG[group.day] || {
                        badge: 'bg-slate-800 text-slate-300 border-slate-700',
                        text: 'text-slate-300',
                        border: 'border-slate-700',
                        bg: 'bg-slate-900',
                        dot: 'bg-slate-400',
                      };

                    return (
                      <React.Fragment key={group.day}>
                        {/* Day Category Header */}
                        <tr className={`${config.bg} border-y ${config.border}`}>
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${config.dot} shadow-sm`}
                                />
                                <span
                                  className={`font-bold text-sm tracking-wide ${config.text}`}
                                >
                                  {group.day}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border ${config.badge}`}
                                >
                                  {group.entries.length}{' '}
                                  {group.entries.length === 1 ? 'class' : 'classes'}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {group.hours.toFixed(1)} hrs total
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Day Rows */}
                        {group.entries.map((entry, idx) =>
                          renderRow(entry, idx)
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  // Flat List View
                  filteredEntries.map((entry, idx) => renderRow(entry, idx))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Info & Missing Fields Guidance */}
      <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500 inline-block" />
            <span>Amber borders = Highlighted blank/missing fields (no guessing)</span>
          </span>
          <span className="hidden sm:inline">&bull;</span>
          <span className="text-slate-400">
            Click any row to inspect cell on canvas.
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-emerald-400">
          <Sparkles className="w-3 h-3" />
          <span>12-Hour format &bull; Categorized by Day</span>
        </div>
      </div>
    </div>
  );
};
