/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileImage,
  Layers,
  Table as TableIcon,
  FileCode,
  Activity,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Sparkles,
  Calendar,
  Play,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { loadOpenCV, isCvReady } from './services/opencvLoader';
import {
  executeScheduleExtractionPipeline,
  PipelineProgress,
} from './services/pipeline';
import { TableExtractionResult } from './types/table';
import { ScheduleEntry } from './types/schedule';
import { ScheduleEntriesTable } from './components/ScheduleEntriesTable';
import { SkippedCellsPanel } from './components/SkippedCellsPanel';
import { DebugCanvas } from './components/DebugCanvas';
import { TableView } from './components/TableView';
import { JsonViewer } from './components/JsonViewer';
import { ApkModal } from './components/ApkModal';
import { SAMPLE_SCHEDULES } from './utils/sampleTables';
import { to12Hour } from './utils/time';

const APP_VERSION = 'v1.4.0';

export default function App() {
  const [isOpenCvReady, setIsOpenCvReady] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null);

  const [result, setResult] = useState<TableExtractionResult | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'entries' | 'debug' | 'table' | 'json' | 'diagnostics'>('entries');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [isApkModalOpen, setIsApkModalOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Requirement (6): Initialize OpenCV runtime on mount and track readiness
  // Requirement (5): NEVER trigger processing from a useEffect
  useEffect(() => {
    let mounted = true;
    loadOpenCV()
      .then(() => {
        if (mounted) {
          setIsOpenCvReady(true);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize OpenCV runtime:', err);
        if (mounted) {
          setErrorMessage('Failed to initialize OpenCV.js WebAssembly runtime.');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Requirement (5): Trigger processing ONLY from a button click
  const handleRunProcessing = async (sourceOverride?: HTMLImageElement | HTMLCanvasElement) => {
    const imgToProcess = sourceOverride || selectedImage;
    if (!imgToProcess) {
      setErrorMessage('Please upload a schedule image or select a preset first.');
      return;
    }

    if (!isOpenCvReady) {
      setErrorMessage('OpenCV.js runtime is still initializing. Please wait a moment.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSelectedCellId(null);

    try {
      const extractionResult = await executeScheduleExtractionPipeline(
        imgToProcess,
        (progress) => {
          setPipelineProgress(progress);
        }
      );
      setResult(extractionResult);
      setEntries(extractionResult.scheduleResult?.entries || []);
    } catch (err: any) {
      console.error('Table extraction pipeline error:', err);
      // Strictly surface explicit error: No fallbacks, one code path
      setErrorMessage(
        err?.message ||
          'Failed to extract table grid. Please ensure the uploaded image contains visible grid borders.'
      );
      setResult(null);
      setEntries([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-uploading the same file works
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreviewUrl(dataUrl);
      setSelectedPresetName(file.name);

      const img = new Image();
      img.onload = () => {
        setSelectedImage(img);
        // Requirement (5): Trigger processing on explicit user action
        handleRunProcessing(img);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isOpenCvReady || isProcessing) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreviewUrl(dataUrl);
      setSelectedPresetName(file.name);

      const img = new Image();
      img.onload = () => {
        setSelectedImage(img);
        handleRunProcessing(img);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLE_SCHEDULES.find((s) => s.id === sampleId);
    if (!sample) return;

    const canvas = sample.generate();
    setImagePreviewUrl(canvas.toDataURL());
    setSelectedPresetName(sample.title);
    setSelectedImage(canvas);

    // Requirement (5): Button click triggers processing
    handleRunProcessing(canvas);
  };

  const handleUpdateCellText = (cellId: string, newText: string) => {
    if (!result) return;
    const updatedCells = result.cells.map((c) =>
      c.id === cellId ? { ...c, text: newText } : c
    );
    const updatedJson = updatedCells.map((c) => ({
      text: c.text,
      row: c.row,
      col: c.col,
      rowspan: c.rowspan,
      colspan: c.colspan,
    }));
    setResult({
      ...result,
      cells: updatedCells,
      json: updatedJson,
    });
  };

  // Schedule Entries Handlers
  const handleUpdateEntry = (updatedEntry: ScheduleEntry) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
    );
  };

  const handleToggleAddEntry = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isAdded: !e.isAdded } : e))
    );
  };

  const handleAddCustomRow = () => {
    const newEntry: ScheduleEntry = {
      id: `custom_${Date.now()}`,
      subject: '',
      section: '',
      room: '',
      day: 'Monday',
      startTime: '09:00',
      endTime: '10:00',
      row: 0,
      col: 0,
      rowspan: 1,
      colspan: 1,
      isAdded: false,
      missingFields: ['subject', 'section', 'room'],
    };
    setEntries((prev) => [newEntry, ...prev]);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Version */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-lg">
              田
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">
                  TableGrid OCR
                </h1>
                <span className="bg-indigo-500/20 text-indigo-300 text-xs font-mono font-semibold px-2 py-0.5 rounded-full border border-indigo-500/40">
                  {APP_VERSION}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[11px] px-2 py-0.5 rounded-md border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> 100% Client-Side
                </span>
              </div>
              <p className="text-xs text-slate-400">
                OpenCV.js adaptive threshold &bull; Projection &bull; Union-Find &bull; Tesseract.js PSM 6
              </p>
            </div>
          </div>

          {/* Right Status & APK Build Button */}
          <div className="flex items-center gap-3 text-xs">
            {/* OpenCV Runtime Readiness Indicator (Requirement 6) */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
              <Cpu className={`w-3.5 h-3.5 ${isOpenCvReady ? 'text-emerald-400' : 'text-amber-400 animate-spin'}`} />
              <span className="font-mono text-[11px]">
                {isOpenCvReady ? (
                  <span className="text-emerald-300 font-medium">OpenCV Ready</span>
                ) : (
                  <span className="text-amber-300">Initializing OpenCV...</span>
                )}
              </span>
            </div>

            {/* Quota Status Indicator */}
            <div className="hidden md:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Quota Status:</span>
              <span className="font-mono text-cyan-300 font-semibold">
                0 Quota (Client-Only)
              </span>
            </div>

            {/* APK Build Button */}
            <button
              onClick={() => setIsApkModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Build APK ({APP_VERSION})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
        {/* Upload & Sample Controls Section */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 lg:p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileImage className="w-4 h-4 text-indigo-400" />
                Schedule Image Input
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload a timetable photo/scan or select a preset. Scaled to max 2000px with adaptive threshold (31, 10).
              </p>
            </div>

            {/* Hidden File Input: Requirement (6) disabled until OpenCV is initialized */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              disabled={!isOpenCvReady || isProcessing}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isOpenCvReady || isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-lg transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {!isOpenCvReady
                    ? 'Loading OpenCV Runtime...'
                    : isProcessing
                    ? 'Processing...'
                    : 'Upload Table Image'}
                </span>
              </button>

              {/* Requirement (5): Button click to re-run processing on current image */}
              {selectedImage && (
                <button
                  onClick={() => handleRunProcessing()}
                  disabled={!isOpenCvReady || isProcessing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Extraction</span>
                </button>
              )}
            </div>
          </div>

          {/* Sample Schedules Selector Bar */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Presets:
            </span>
            {SAMPLE_SCHEDULES.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleSelectSample(sample.id)}
                disabled={!isOpenCvReady || isProcessing}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  sample.id === 'invalid_photo'
                    ? 'bg-rose-950/30 border-rose-800/50 text-rose-300 hover:bg-rose-900/40'
                    : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
                }`}
                title={sample.description}
              >
                {sample.title}
              </button>
            ))}
          </div>

          {/* Drag & Drop Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => {
              if (isOpenCvReady && !isProcessing) {
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition ${
              !isOpenCvReady
                ? 'border-slate-800/50 bg-slate-950/20 opacity-60 cursor-not-allowed'
                : 'border-slate-800 hover:border-indigo-500/50 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80'
            }`}
          >
            <p className="text-xs text-slate-400">
              {!isOpenCvReady
                ? 'Initializing OpenCV.js runtime in browser...'
                : 'Drag & drop schedule image here, or paste from clipboard (Ctrl+V)'}
            </p>
            {selectedPresetName && (
              <p className="text-[11px] text-indigo-400 mt-1 font-mono">
                Active image: {selectedPresetName}
              </p>
            )}
          </div>
        </section>

        {/* Error Banner (Requirement: Throw explicit errors if no grid is detected) */}
        {errorMessage && (
          <div className="bg-rose-950/50 border border-rose-500/50 rounded-xl p-4 shadow-xl flex items-start gap-3 text-rose-200">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-sm text-rose-300">
                Pipeline Error (Strict Validation)
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed font-mono">
                {errorMessage}
              </p>
              <p className="text-[11px] text-rose-400/80 mt-1">
                Per requirement, no fallback estimation was performed. Ensure the schedule image contains visible grid borders and sequential times.
              </p>
            </div>
          </div>
        )}

        {/* Processing Step Tracker */}
        {isProcessing && pipelineProgress && (
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="font-bold text-indigo-300">
                  {pipelineProgress.stepTitle}
                </span>
              </div>
              <span className="font-mono text-slate-400">
                {pipelineProgress.percent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-200"
                style={{ width: `${pipelineProgress.percent}%` }}
              />
            </div>

            <p className="text-xs text-slate-400 font-mono">
              {pipelineProgress.detail}
            </p>
          </div>
        )}

        {/* Results Workspace */}
        {result && (
          <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-1.5 rounded-xl">
              <div className="flex flex-wrap items-center gap-1">
                {/* Schedule Entries Tab (Primary) */}
                <button
                  onClick={() => setActiveTab('entries')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'entries'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Entries ({entries.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('table')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'table'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>HTML Merged Table</span>
                </button>

                <button
                  onClick={() => setActiveTab('debug')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'debug'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Debug Canvas Overlay</span>
                </button>

                <button
                  onClick={() => setActiveTab('json')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'json'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>JSON Output Schema</span>
                </button>

                <button
                  onClick={() => setActiveTab('diagnostics')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'diagnostics'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Pipeline Diagnostics</span>
                </button>
              </div>

              {/* Quick Summary Pill */}
              <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 px-3">
                <span>
                  Grid:{' '}
                  <strong className="text-slate-200">
                    {result.totalRows}R × {result.totalCols}C
                  </strong>
                </span>
                <span>
                  Classes:{' '}
                  <strong className="text-indigo-400 font-bold">
                    {entries.length}
                  </strong>
                </span>
                <span>
                  Time:{' '}
                  <strong className="text-cyan-400">
                    {(result.diagnostics.totalExecutionTimeMs / 1000).toFixed(2)}s
                  </strong>
                </span>
              </div>
            </div>

            {/* Tab Views */}
            <div className="min-h-[520px]">
              {/* Schedule Entries Table Tab */}
              {activeTab === 'entries' && (
                <div className="space-y-4">
                  <div className="h-[540px]">
                    <ScheduleEntriesTable
                      entries={entries}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                      onUpdateEntry={handleUpdateEntry}
                      onToggleAddEntry={handleToggleAddEntry}
                      onAddCustomRow={handleAddCustomRow}
                      onDeleteEntry={handleDeleteEntry}
                    />
                  </div>

                  {/* Skipped Cells Panel */}
                  {result.scheduleResult?.skippedCells && (
                    <SkippedCellsPanel
                      skippedCells={result.scheduleResult.skippedCells}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                    />
                  )}
                </div>
              )}

              {activeTab === 'debug' && (
                <div className="h-[640px]">
                  <DebugCanvas
                    result={result}
                    selectedCellId={selectedCellId}
                    onSelectCell={setSelectedCellId}
                  />
                </div>
              )}

              {activeTab === 'table' && (
                <div className="h-[640px]">
                  <TableView
                    result={result}
                    selectedCellId={selectedCellId}
                    onSelectCell={setSelectedCellId}
                    onUpdateCellText={handleUpdateCellText}
                  />
                </div>
              )}

              {activeTab === 'json' && (
                <div className="h-[640px]">
                  <JsonViewer
                    result={result}
                    selectedCellId={selectedCellId}
                    onSelectCell={setSelectedCellId}
                  />
                </div>
              )}

              {activeTab === 'diagnostics' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6 text-xs">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Computer Vision & OCR Execution Breakdown
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="text-slate-400">Resolution</div>
                      <div className="font-mono text-sm text-slate-200 mt-1">
                        {result.diagnostics.originalWidth}×{result.diagnostics.originalHeight}px
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Scaled to {result.diagnostics.upscaledWidth}×{result.diagnostics.upscaledHeight}px ({result.diagnostics.scaleFactor.toFixed(2)}x, max 2000px)
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="text-slate-400">Grid Boundaries</div>
                      <div className="font-mono text-sm text-cyan-400 mt-1">
                        {result.horizontalLines.length} H × {result.verticalLines.length} V lines
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        cv.reduce Projection (blockSize 31, C 10)
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="text-slate-400">Parsed Classes</div>
                      <div className="font-mono text-sm text-emerald-400 mt-1">
                        {entries.length} valid entries
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {result.scheduleResult?.skippedCells.length || 0} skipped (no section code)
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="text-slate-400">Total Run Time</div>
                      <div className="font-mono text-sm text-amber-400 mt-1">
                        {(result.diagnostics.totalExecutionTimeMs / 1000).toFixed(2)}s
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        100% Client-Side WebAssembly
                      </div>
                    </div>
                  </div>

                  {/* Step Timing Breakdown */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                      Timing By Pipeline Phase
                    </h4>
                    <div className="space-y-2">
                      {[
                        {
                          name: 'Step 1: Scaling (max 2000px), Grayscale & Adaptive Threshold (31, 10)',
                          ms: result.diagnostics.stepTimes.preprocessingMs,
                        },
                        {
                          name: 'Step 2: Morphological Grid Lines & cv.reduce Projection',
                          ms: result.diagnostics.stepTimes.morphologyAndProjectionMs,
                        },
                        {
                          name: 'Step 3: Atomic Cells from Line Intersections',
                          ms: result.diagnostics.stepTimes.atomicCellsMs,
                        },
                        {
                          name: 'Step 4: Union-Find Adjacent Edge Dark Pixel Merging (<30%)',
                          ms: result.diagnostics.stepTimes.unionFindMergeMs,
                        },
                        {
                          name: 'Step 5: Tesseract.js (PSM 6) Line-Level OCR on Merged Regions',
                          ms: result.diagnostics.stepTimes.ocrRecognitionMs,
                        },
                      ].map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs"
                        >
                          <span className="text-slate-300">{step.name}</span>
                          <span className="text-indigo-400 font-semibold">
                            {step.ms.toFixed(1)} ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detected Time Row Intervals in 12H */}
                  {result.scheduleResult?.timeIntervals && result.scheduleResult.timeIntervals.length > 0 && (
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <div className="font-semibold text-slate-300 flex items-center justify-between">
                        <span>Detected Time Row Intervals (12H):</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {result.scheduleResult.timeIntervals.length} row intervals
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {result.scheduleResult.timeIntervals.map((interval, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-slate-900/70 border border-slate-800 rounded font-mono text-[11px] text-slate-300"
                          >
                            <span className="text-slate-500 mr-1.5">R{interval.row}:</span>
                            <span className="text-emerald-400 font-medium">
                              {to12Hour(interval.start)} - {to12Hour(interval.end)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Teaching Hours Verification Check (Item 3) */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="font-semibold text-slate-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Teaching Hours Footer Verification:</span>
                      </span>
                      {result.scheduleResult?.teachingHoursVerification ? (
                        <span className="text-[11px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 px-2 py-0.5 rounded font-mono">
                          Footer Verified (Row {result.scheduleResult.teachingHoursVerification.footerRow})
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">
                          No "TEACHING HOURS" footer row in active table
                        </span>
                      )}
                    </div>

                    {result.scheduleResult?.teachingHoursVerification ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                        {result.scheduleResult.teachingHoursVerification.dayChecks.map((dc, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-slate-900/80 border border-slate-800 rounded font-mono text-[11px]"
                          >
                            <div className="text-slate-400 font-semibold">{dc.day}</div>
                            <div className="text-emerald-300 mt-0.5">
                              Parsed: {dc.parsedHours}h / Footer: {dc.expectedHours}h
                            </div>
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              Matched ✓
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        When a timetable contains a footer row labeled "TEACHING HOURS", each day's entry durations are summed and verified against the footer values.
                      </p>
                    )}
                  </div>

                  {/* Horizontal and Vertical Line Pixel Coordinates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-semibold text-slate-300">
                        Horizontal Line Y Coordinates ({result.horizontalLines.length}):
                      </div>
                      <div className="font-mono text-slate-400 break-words">
                        [{result.horizontalLines.join(', ')}]
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="font-semibold text-slate-300">
                        Vertical Line X Coordinates ({result.verticalLines.length}):
                      </div>
                      <div className="font-mono text-slate-400 break-words">
                        [{result.verticalLines.join(', ')}]
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-4 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-400">
              TableGrid OCR <strong className="text-slate-200">{APP_VERSION}</strong>
            </span>
            <span>&bull;</span>
            <span>Client-side OpenCV.js & Tesseract.js</span>
            <span>&bull;</span>
            <span className="text-emerald-400">Zero Gemini/Cloud API calls</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-cyan-400/90">
            <span>Quota Status: 0 API Calls Consumed (Unlimited)</span>
          </div>
        </div>
      </footer>

      {/* APK Modal */}
      <ApkModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
        appVersion={APP_VERSION}
      />
    </div>
  );
}
