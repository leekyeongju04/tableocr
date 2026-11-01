/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Smartphone, Download, X, Check, Terminal, ShieldCheck, Box } from 'lucide-react';

interface ApkModalProps {
  isOpen: boolean;
  onClose: () => void;
  appVersion: string;
}

export const ApkModal: React.FC<ApkModalProps> = ({
  isOpen,
  onClose,
  appVersion,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  if (!isOpen) return null;

  const buildCommands = `# 1. Install Capacitor Android CLI
npm i --save-dev @capacitor/core @capacitor/cli @capacitor/android

# 2. Initialize Capacitor Project
npx cap init "TableGrid OCR" "com.tablegrid.ocr" --web-dir dist

# 3. Build Web Assets
npm run build

# 4. Add Android Platform & Generate APK
npx cap add android
npx cap sync
npx cap open android
# In Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)`;

  const handleCopyCommands = async () => {
    await navigator.clipboard.writeText(buildCommands);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleDownloadCapacitorConfig = () => {
    const config = {
      appId: 'com.tablegrid.ocr',
      appName: 'TableGrid OCR',
      webDir: 'dist',
      bundledWebRuntime: false,
      version: appVersion,
      android: {
        allowMixedContent: true,
        captureInput: true,
        webContentsDebuggingEnabled: false,
      },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capacitor.config.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">
                  Android APK Build & Package Center
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs font-mono px-2 py-0.5 rounded-full border border-emerald-500/40">
                  {appVersion}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Package TableGrid OCR into a standalone Android APK
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Version & Status Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">App Version</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {appVersion}
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Execution Mode</div>
              <div className="text-xs font-medium text-emerald-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Client-Side
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Quota Status</div>
              <div className="text-xs font-mono text-cyan-400 mt-1">
                0 / Unlimited API Calls
              </div>
            </div>
          </div>

          {/* Quick APK Steps */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-indigo-400" />
              One-Step Capacitor Android APK Build
            </h4>
            <div className="relative">
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
                {buildCommands}
              </pre>
              <button
                onClick={handleCopyCommands}
                className="absolute top-3 right-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs flex items-center gap-1.5 transition"
              >
                {copiedCmd ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Box className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{copiedCmd ? 'Copied CLI!' : 'Copy Script'}</span>
              </button>
            </div>
          </div>

          {/* Offline & Architecture Notes */}
          <div className="p-4 bg-indigo-950/20 border border-indigo-800/40 rounded-xl text-xs space-y-1.5 text-slate-300">
            <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Native Android APK Performance
            </div>
            <p className="text-slate-400">
              OpenCV.js and Tesseract.js run completely inside Android's WebView WebAssembly engine with multithreading support. No server round-trip or cloud credentials are required in the generated APK.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950">
          <span className="text-xs text-slate-500 font-mono">
            TableGrid OCR {appVersion}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCapacitorConfig}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download capacitor.config.json</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
