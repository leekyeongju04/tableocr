/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TableExtractionResult, MergedCell } from '../types/table';
import { Copy, Download, Edit3, Check, Table, Sparkles } from 'lucide-react';

interface TableViewProps {
  result: TableExtractionResult;
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
  onUpdateCellText: (cellId: string, newText: string) => void;
}

export const TableView: React.FC<TableViewProps> = ({
  result,
  selectedCellId,
  onSelectCell,
  onUpdateCellText,
}) => {
  const { totalRows, totalCols, cells } = result;
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'html' | 'csv' | null>(null);

  // Map cell by top-left (row, col)
  const cellMap = new Map<string, MergedCell>();
  for (const cell of cells) {
    cellMap.set(`${cell.row}_${cell.col}`, cell);
  }

  // Build 2D coverage map to properly render <tr> and <td> with rowspan/colspan
  const covered: boolean[][] = Array.from({ length: totalRows }, () =>
    new Array(totalCols).fill(false)
  );

  const tableRowsJsx: React.ReactNode[] = [];

  for (let r = 0; r < totalRows; r++) {
    const rowCellsJsx: React.ReactNode[] = [];

    for (let c = 0; c < totalCols; c++) {
      if (covered[r][c]) {
        // Covered by a previous rowspan/colspan cell
        continue;
      }

      const cell = cellMap.get(`${r}_${c}`);
      if (cell) {
        // Mark all covered atomic cells
        for (let dr = 0; dr < cell.rowspan; dr++) {
          for (let dc = 0; dc < cell.colspan; dc++) {
            if (r + dr < totalRows && c + dc < totalCols) {
              covered[r + dr][c + dc] = true;
            }
          }
        }

        const isSelected = selectedCellId === cell.id;
        const isEditing = editingCellId === cell.id;
        const isSpanned = cell.rowspan > 1 || cell.colspan > 1;

        rowCellsJsx.push(
          <td
            key={`${r}_${c}`}
            rowSpan={cell.rowspan}
            colSpan={cell.colspan}
            onClick={() => onSelectCell(cell.id)}
            className={`p-3 text-sm border border-slate-700/80 transition relative cursor-pointer group ${
              isSelected
                ? 'bg-indigo-900/50 ring-2 ring-indigo-500 text-white z-10'
                : isSpanned
                ? 'bg-emerald-950/20 hover:bg-emerald-900/30 text-slate-100'
                : 'bg-slate-900/50 hover:bg-slate-800/60 text-slate-200'
            }`}
          >
            <div className="flex flex-col justify-between min-h-[38px] h-full">
              {/* Badge for spanned cell */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1 select-none">
                <span className="opacity-60 group-hover:opacity-100">
                  [{cell.row},{cell.col}]
                </span>
                {isSpanned && (
                  <span className="bg-emerald-900/80 text-emerald-300 px-1 rounded text-[9px] font-semibold">
                    {cell.rowspan}R × {cell.colspan}C
                  </span>
                )}
              </div>

              {/* Text content or edit input */}
              {isEditing ? (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateCellText(cell.id, editValue);
                        setEditingCellId(null);
                      } else if (e.key === 'Escape') {
                        setEditingCellId(null);
                      }
                    }}
                    className="w-full bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      onUpdateCellText(cell.id, editValue);
                      setEditingCellId(null);
                    }}
                    className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-medium ${
                      cell.text ? 'text-slate-100' : 'text-slate-500 italic'
                    }`}
                  >
                    {cell.text || '[Empty]'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCellId(cell.id);
                      setEditValue(cell.text);
                    }}
                    title="Edit cell text"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </td>
        );
      } else {
        // Fallback for uncovered empty cell
        covered[r][c] = true;
        rowCellsJsx.push(
          <td
            key={`${r}_${c}`}
            className="p-3 text-xs border border-slate-800 bg-slate-950/40 text-slate-600 italic"
          >
            -
          </td>
        );
      }
    }

    tableRowsJsx.push(
      <tr key={`row_${r}`} className="transition">
        {rowCellsJsx}
      </tr>
    );
  }

  // Generate HTML table markup
  const generateHtmlTableString = (): string => {
    let html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif;">\n`;
    const tempCovered: boolean[][] = Array.from({ length: totalRows }, () =>
      new Array(totalCols).fill(false)
    );

    for (let r = 0; r < totalRows; r++) {
      html += `  <tr>\n`;
      for (let c = 0; c < totalCols; c++) {
        if (tempCovered[r][c]) continue;
        const cell = cellMap.get(`${r}_${c}`);
        if (cell) {
          for (let dr = 0; dr < cell.rowspan; dr++) {
            for (let dc = 0; dc < cell.colspan; dc++) {
              if (r + dr < totalRows && c + dc < totalCols) {
                tempCovered[r + dr][c + dc] = true;
              }
            }
          }
          const rowSpanAttr = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
          const colSpanAttr = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
          html += `    <td${rowSpanAttr}${colSpanAttr}>${escapeHtml(
            cell.text
          )}</td>\n`;
        } else {
          tempCovered[r][c] = true;
          html += `    <td></td>\n`;
        }
      }
      html += `  </tr>\n`;
    }
    html += `</table>`;
    return html;
  };

  // Generate CSV representation
  const generateCsvString = (): string => {
    // Fill full grid
    const grid: string[][] = Array.from({ length: totalRows }, () =>
      new Array(totalCols).fill('')
    );
    for (const cell of cells) {
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          if (cell.row + dr < totalRows && cell.col + dc < totalCols) {
            grid[cell.row + dr][cell.col + dc] = cell.text;
          }
        }
      }
    }
    return grid
      .map((row) =>
        row.map((val) => `"${(val || '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
  };

  const handleCopyHtml = async () => {
    const html = generateHtmlTableString();
    await navigator.clipboard.writeText(html);
    setCopiedType('html');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyCsv = async () => {
    const csv = generateCsvString();
    await navigator.clipboard.writeText(csv);
    setCopiedType('csv');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadHtml = () => {
    const html = generateHtmlTableString();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_table_${totalRows}x${totalCols}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200">
            Rendered HTML Table ({totalRows} Rows × {totalCols} Cols)
          </span>
          <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            {cells.length} merged cells
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyHtml}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            {copiedType === 'html' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copiedType === 'html' ? 'Copied HTML!' : 'Copy HTML'}</span>
          </button>

          <button
            onClick={handleCopyCsv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            {copiedType === 'csv' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copiedType === 'csv' ? 'Copied CSV!' : 'Copy CSV'}</span>
          </button>

          <button
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download HTML</span>
          </button>
        </div>
      </div>

      {/* Rendered HTML Table with Merged Cells */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full border-collapse border border-slate-800 text-left rounded-lg overflow-hidden">
            <tbody>{tableRowsJsx}</tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Click any cell to highlight in Debug Canvas. Hover and click pencil to edit text inline.</span>
        <span className="font-mono text-emerald-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Real-time Union-Find table geometry
        </span>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
