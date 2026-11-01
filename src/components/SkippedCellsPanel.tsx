/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SkippedCell } from '../types/schedule';
import { AlertCircle, ChevronDown, ChevronUp, Eye, Ban } from 'lucide-react';

interface SkippedCellsPanelProps {
  skippedCells: SkippedCell[];
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
}

export const SkippedCellsPanel: React.FC<SkippedCellsPanelProps> = ({
  skippedCells,
  selectedCellId,
  onSelectCell,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (skippedCells.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition">
      {/* Panel Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3.5 bg-slate-950/80 hover:bg-slate-950 text-left border-b border-slate-800 transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Ban className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-xs text-slate-200">
            Skipped Cells Panel ({skippedCells.length})
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            No section line matching ^[A-Z]{'{3,5}'}\d(\.\d)?[A-Z]?$
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Panel Content */}
      {isExpanded && (
        <div className="p-4 bg-slate-950/60 max-h-64 overflow-y-auto">
          <div className="divide-y divide-slate-800/80 text-xs font-mono">
            {skippedCells.map((cell) => {
              const isSelected = selectedCellId === cell.id;
              return (
                <div
                  key={cell.id}
                  onClick={() => onSelectCell(cell.id)}
                  className={`py-2 px-3 flex flex-wrap items-center justify-between gap-2 rounded-lg transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/50 ring-1 ring-indigo-500 text-white'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 w-16">
                      [{cell.row},{cell.col}]
                    </span>
                    <span className="text-slate-200 font-sans font-medium max-w-xs truncate">
                      "{cell.text || '[Empty Cell]'}"
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-500">
                      Span: {cell.rowspan}R × {cell.colspan}C
                    </span>
                    <span className="text-amber-400/90 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/40 text-[10px]">
                      {cell.reason}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
