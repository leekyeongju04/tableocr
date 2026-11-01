/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { TableExtractionResult, MergedCell, SharedEdge } from '../types/table';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Hash,
} from 'lucide-react';

interface DebugCanvasProps {
  result: TableExtractionResult;
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
}

type ViewMode = 'upscaled' | 'thresh' | 'morph';

export const DebugCanvas: React.FC<DebugCanvasProps> = ({
  result,
  selectedCellId,
  onSelectCell,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Layer toggles
  const [viewMode, setViewMode] = useState<ViewMode>('upscaled');
  const [showGridLines, setShowGridLines] = useState<boolean>(true);
  const [showAtomicCells, setShowAtomicCells] = useState<boolean>(true);
  const [showMergedRects, setShowMergedRects] = useState<boolean>(true);
  const [showSharedEdges, setShowSharedEdges] = useState<boolean>(false);
  const [showOcrText, setShowOcrText] = useState<boolean>(true);

  // Zoom & Pan
  const [scale, setScale] = useState<number>(1.0);
  const [hoveredCell, setHoveredCell] = useState<MergedCell | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<SharedEdge | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const {
    upscaledCanvas,
    threshCanvas,
    morphCanvas,
    horizontalLines,
    verticalLines,
    atomicCells,
    cells: mergedCells,
    sharedEdges,
  } = result;

  const canvasWidth = upscaledCanvas.width;
  const canvasHeight = upscaledCanvas.height;

  // Render on canvas whenever toggles or selection changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw base image
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (viewMode === 'thresh' && threshCanvas) {
      ctx.drawImage(threshCanvas, 0, 0);
    } else if (viewMode === 'morph' && morphCanvas) {
      ctx.drawImage(morphCanvas, 0, 0);
    } else {
      ctx.drawImage(upscaledCanvas, 0, 0);
    }

    // 2. Draw Detected Grid Lines (Horizontal & Vertical)
    if (showGridLines) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'; // Sky blue
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      // Horizontal lines
      for (const y of horizontalLines) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

      // Vertical lines
      for (const x of verticalLines) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Draw Atomic Cells
    if (showAtomicCells) {
      ctx.save();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)'; // Cyan
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      for (const cell of atomicCells) {
        ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);

        // Small (r, c) label in top-left
        if (cell.w > 30 && cell.h > 20) {
          ctx.fillStyle = 'rgba(14, 165, 233, 0.7)';
          ctx.font = '9px monospace';
          ctx.fillText(`${cell.r},${cell.c}`, cell.x + 3, cell.y + 10);
        }
      }
      ctx.restore();
    }

    // 4. Draw Shared Edges Analysis (<30% dark pixels = merged)
    if (showSharedEdges) {
      ctx.save();
      for (const edge of sharedEdges) {
        if (edge.merged) {
          // Merged (< 30% dark pixels)
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.85)'; // Pink/Magenta
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 3]);
        } else {
          // Separator Line (>= 30% dark pixels)
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.75)'; // Emerald
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(edge.x1, edge.y1);
        ctx.lineTo(edge.x2, edge.y2);
        ctx.stroke();

        // Label with dark pixel percentage
        const midX = (edge.x1 + edge.x2) / 2;
        const midY = (edge.y1 + edge.y2) / 2;
        ctx.fillStyle = edge.merged ? '#ec4899' : '#22c55e';
        ctx.font = 'bold 10px monospace';
        const pctText = `${Math.round(edge.darkPixelRatio * 100)}%`;
        ctx.fillText(pctText, midX + 3, midY - 3);
      }
      ctx.restore();
    }

    // 5. Draw Merged Rectangles with Rowspan / Colspan
    if (showMergedRects) {
      ctx.save();
      for (const cell of mergedCells) {
        const isSelected = selectedCellId === cell.id;
        const isHovered = hoveredCell?.id === cell.id;

        const { x, y, w, h } = cell.bbox;

        if (isSelected) {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.28)'; // Indigo fill
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([]);
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.2)'; // Amber fill
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
        } else {
          // Highlight merged cells (>1 row or >1 col) with special border
          const isSpanned = cell.rowspan > 1 || cell.colspan > 1;
          if (isSpanned) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'; // Light emerald
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
          } else {
            ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
            ctx.lineWidth = 1.2;
          }
          ctx.setLineDash([]);
        }

        ctx.strokeRect(x, y, w, h);

        // Badge in top-right or corner
        const isSpanned = cell.rowspan > 1 || cell.colspan > 1;
        const badgeText = isSpanned
          ? `[${cell.row},${cell.col}] ${cell.rowspan}R×${cell.colspan}C`
          : `[${cell.row},${cell.col}]`;

        ctx.fillStyle = isSelected
          ? '#4338ca'
          : isSpanned
          ? '#065f46'
          : 'rgba(30, 41, 59, 0.85)';
        const textWidth = ctx.measureText(badgeText).width;
        ctx.fillRect(x + 2, y + 2, textWidth + 8, 14);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(badgeText, x + 6, y + 12);
      }
      ctx.restore();
    }

    // 6. Draw OCR Text Overlay
    if (showOcrText) {
      ctx.save();
      for (const cell of mergedCells) {
        if (!cell.text) continue;
        const { x, y, w, h } = cell.bbox;
        ctx.fillStyle = selectedCellId === cell.id ? '#ffffff' : '#fbbf24'; // Golden text
        ctx.font = '600 12px sans-serif';

        // Clip to cell
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y + 16, w - 8, h - 20);
        ctx.clip();

        ctx.fillText(cell.text, x + 8, y + Math.min(h / 2 + 5, h - 8));
        ctx.restore();
      }
      ctx.restore();
    }
  }, [
    viewMode,
    showGridLines,
    showAtomicCells,
    showMergedRects,
    showSharedEdges,
    showOcrText,
    selectedCellId,
    hoveredCell,
    canvasWidth,
    canvasHeight,
    upscaledCanvas,
    threshCanvas,
    morphCanvas,
    horizontalLines,
    verticalLines,
    atomicCells,
    mergedCells,
    sharedEdges,
  ]);

  // Handle canvas mouse move for interactive inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseCanvasX = (e.clientX - rect.left) * scaleX;
    const mouseCanvasY = (e.clientY - rect.top) * scaleY;

    setMousePos({ x: Math.round(mouseCanvasX), y: Math.round(mouseCanvasY) });

    // Check hovered cell
    const foundCell = mergedCells.find((c: MergedCell) => {
      const { x, y, w, h } = c.bbox;
      return (
        mouseCanvasX >= x &&
        mouseCanvasX <= x + w &&
        mouseCanvasY >= y &&
        mouseCanvasY <= y + h
      );
    });
    setHoveredCell(foundCell || null);

    // Check hovered edge
    if (showSharedEdges) {
      const thresholdDist = 6;
      const foundEdge = sharedEdges.find((edge) => {
        if (edge.type === 'vertical') {
          return (
            Math.abs(mouseCanvasX - edge.x1) <= thresholdDist &&
            mouseCanvasY >= edge.y1 &&
            mouseCanvasY <= edge.y2
          );
        } else {
          return (
            Math.abs(mouseCanvasY - edge.y1) <= thresholdDist &&
            mouseCanvasX >= edge.x1 &&
            mouseCanvasX <= edge.x2
          );
        }
      });
      setHoveredEdge(foundEdge || null);
    } else {
      setHoveredEdge(null);
    }
  };

  const handleClick = () => {
    if (hoveredCell) {
      onSelectCell(hoveredCell.id === selectedCellId ? null : hoveredCell.id);
    } else {
      onSelectCell(null);
    }
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => Math.max(0.4, Math.min(3.0, prev + delta)));
  };

  const resetZoom = () => setScale(1.0);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950/80 border-b border-slate-800 text-xs">
        {/* View Mode Radio */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <span className="text-slate-400 font-medium px-2 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> View:
          </span>
          <button
            onClick={() => setViewMode('upscaled')}
            className={`px-2.5 py-1 rounded font-medium transition ${
              viewMode === 'upscaled'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Upscaled
          </button>
          <button
            onClick={() => setViewMode('thresh')}
            className={`px-2.5 py-1 rounded font-medium transition ${
              viewMode === 'thresh'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Threshold
          </button>
          <button
            onClick={() => setViewMode('morph')}
            className={`px-2.5 py-1 rounded font-medium transition ${
              viewMode === 'morph'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Morph Lines
          </button>
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setShowGridLines(!showGridLines)}
            className={`px-2 py-1 rounded border text-xs font-medium transition flex items-center gap-1 ${
              showGridLines
                ? 'bg-sky-950/80 border-sky-600 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <Hash className="w-3 h-3" />
            Grid Lines
          </button>

          <button
            onClick={() => setShowAtomicCells(!showAtomicCells)}
            className={`px-2 py-1 rounded border text-xs font-medium transition flex items-center gap-1 ${
              showAtomicCells
                ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Atomic ({atomicCells.length})
          </button>

          <button
            onClick={() => setShowMergedRects(!showMergedRects)}
            className={`px-2 py-1 rounded border text-xs font-medium transition flex items-center gap-1 ${
              showMergedRects
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Merged ({mergedCells.length})
          </button>

          <button
            onClick={() => setShowSharedEdges(!showSharedEdges)}
            className={`px-2 py-1 rounded border text-xs font-medium transition flex items-center gap-1 ${
              showSharedEdges
                ? 'bg-fuchsia-950/80 border-fuchsia-600 text-fuchsia-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
            title="Inspect dark pixel % on shared edges (<30% merged vs >=30% border)"
          >
            Edge Inspect (&lt;30%)
          </button>

          <button
            onClick={() => setShowOcrText(!showOcrText)}
            className={`px-2 py-1 rounded border text-xs font-medium transition flex items-center gap-1 ${
              showOcrText
                ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            OCR Overlay
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => handleZoom(-0.2)}
            title="Zoom Out"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-slate-300 font-mono px-1 w-12 text-center text-xs">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => handleZoom(0.2)}
            title="Zoom In"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoom}
            title="Reset Zoom"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 ml-1"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950 p-4 relative flex items-center justify-center min-h-[380px]"
        onMouseLeave={() => {
          setHoveredCell(null);
          setHoveredEdge(null);
          setMousePos(null);
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.1s ease-out',
          }}
          className="inline-block shadow-2xl rounded border border-slate-800 bg-black cursor-crosshair"
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            className="block max-w-none"
          />
        </div>

        {/* Live Hover Inspection Tooltip */}
        {(hoveredCell || hoveredEdge) && mousePos && (
          <div className="absolute bottom-4 left-4 z-20 bg-slate-900/95 border border-slate-700 backdrop-blur-md px-3.5 py-2.5 rounded-lg shadow-xl text-xs space-y-1 pointer-events-none max-w-sm">
            {hoveredCell && (
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-400">
                    Row {hoveredCell.row}, Col {hoveredCell.col}
                  </span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono text-[10px]">
                    Span: {hoveredCell.rowspan}R × {hoveredCell.colspan}C
                  </span>
                </div>
                {hoveredCell.text ? (
                  <p className="text-slate-200 mt-1 font-sans italic">
                    "{hoveredCell.text}"
                  </p>
                ) : (
                  <p className="text-slate-500 mt-1 text-[11px]">[Empty cell]</p>
                )}
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  BBox: {hoveredCell.bbox.w}×{hoveredCell.bbox.h}px at ({hoveredCell.bbox.x}, {hoveredCell.bbox.y})
                </div>
              </div>
            )}

            {hoveredEdge && (
              <div className="pt-1 mt-1 border-t border-slate-800">
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span>Shared {hoveredEdge.type} edge:</span>
                  <span
                    className={`font-bold ${
                      hoveredEdge.merged ? 'text-pink-400' : 'text-emerald-400'
                    }`}
                  >
                    {(hoveredEdge.darkPixelRatio * 100).toFixed(1)}% dark pixels
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {hoveredEdge.merged
                    ? '✓ Merged (<30% dark pixels, dividing line absent)'
                    : '✗ Separated (>=30% dark pixels, dividing border line detected)'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend / Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/50 border border-cyan-400 inline-block" />
            <span>Atomic Cell</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-400 inline-block" />
            <span>Merged Cell (Rowspan/Colspan)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-pink-500/50 border border-pink-400 inline-block" />
            <span>Merged Edge (&lt;30% ink)</span>
          </div>
        </div>

        <div className="font-mono text-slate-500">
          Grid: {result.totalRows}R × {result.totalCols}C ({atomicCells.length} atomic → {mergedCells.length} merged)
        </div>
      </div>
    </div>
  );
};
