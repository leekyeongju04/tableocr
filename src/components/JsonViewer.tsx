/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TableExtractionResult } from '../types/table';
import { Copy, Check, Download, FileCode, Search } from 'lucide-react';

interface JsonViewerProps {
  result: TableExtractionResult;
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  result,
  selectedCellId,
  onSelectCell,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  const jsonArray = result.cells.map((c) => ({
    text: c.text,
    row: c.row,
    col: c.col,
    rowspan: c.rowspan,
    colspan: c.colspan,
  }));

  const jsonString = JSON.stringify(jsonArray, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_table_${result.totalRows}x${result.totalCols}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCells = result.cells.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.text.toLowerCase().includes(q) ||
      `row ${c.row}`.includes(q) ||
      `col ${c.col}`.includes(q) ||
      `${c.rowspan}`.includes(q) ||
      `${c.colspan}`.includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-slate-200">
            Output JSON Schema ({jsonArray.length} items)
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {`{ text, row, col, rowspan, colspan }`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter cells..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2.5 py-1 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-36"
            />
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copied ? 'Copied JSON!' : 'Copy JSON'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .json</span>
          </button>
        </div>
      </div>

      {/* Code / Object View Tabs */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-300">
        <div className="space-y-1">
          <span className="text-slate-500">[</span>
          <div className="pl-4 space-y-2">
            {filteredCells.map((cell, idx) => {
              const isSelected = selectedCellId === cell.id;
              return (
                <div
                  key={cell.id}
                  onClick={() => onSelectCell(cell.id)}
                  className={`p-2 rounded border transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="text-slate-500">#{idx + 1}</span>
                    <span className="text-amber-400/90 font-semibold">
                      Row {cell.row}, Col {cell.col}
                    </span>
                    <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-400">
                      Span: {cell.rowspan} × {cell.colspan}
                    </span>
                  </div>

                  <div className="pl-2">
                    <div>
                      <span className="text-indigo-400">"text"</span>:{" "}
                      <span className="text-emerald-300">"{cell.text}"</span>,
                    </div>
                    <div>
                      <span className="text-indigo-400">"row"</span>:{" "}
                      <span className="text-amber-300">{cell.row}</span>,
                    </div>
                    <div>
                      <span className="text-indigo-400">"col"</span>:{" "}
                      <span className="text-amber-300">{cell.col}</span>,
                    </div>
                    <div>
                      <span className="text-indigo-400">"rowspan"</span>:{" "}
                      <span className="text-cyan-300">{cell.rowspan}</span>,
                    </div>
                    <div>
                      <span className="text-indigo-400">"colspan"</span>:{" "}
                      <span className="text-cyan-300">{cell.colspan}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <span className="text-slate-500">]</span>
        </div>
      </div>
    </div>
  );
};
