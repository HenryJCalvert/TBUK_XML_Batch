import React from 'react';
import {
  SlidersHorizontal,
  Upload,
  Download,
  Sparkles,
  Settings,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react';

interface HeaderProps {
  fileName: string;
  totalCount: number;
  recordCount?: number; // CSV records before identical records were consolidated
  onOpenUpload: () => void;
  onOpenOptimize: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
  onResetToDefaults: () => void;
  isOptimized: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  totalCount,
  recordCount,
  onOpenUpload,
  onOpenOptimize,
  onOpenExport,
  onOpenSettings,
  onResetToDefaults,
  isOptimized,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 backdrop-blur-md bg-slate-900/95">
      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Brand & File Info */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
              £
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-semibold text-white tracking-tight">
                  Fund Transfer & Batch Engine
                </h1>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  · ISO 20022 Lloyds BACS & FPS
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                {fileName ? (
                  <>
                    <span className="flex items-center gap-1 text-slate-300">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      {fileName}
                    </span>
                    <span>·</span>
                    <span>
                      {recordCount !== undefined && recordCount !== totalCount
                        ? `${recordCount} records → ${totalCount} payments (${recordCount - totalCount} merged)`
                        : `${totalCount} payments`}
                    </span>
                    {isOptimized && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400 font-medium">Balanced Optimized</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">Ready to import batch CSV</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenUpload}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 transition"
            title="Upload CSV or load sample dataset"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Import CSV</span>
          </button>

          <button
            onClick={onResetToDefaults}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-md border border-slate-700/60 transition"
            title="Reset to default initial limits (£100 / £1,000)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Reset</span>
          </button>

          <button
            onClick={onOpenOptimize}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md shadow-sm transition border ${
              isOptimized
                ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-500'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold border-emerald-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Optimise Batches</span>
          </button>

          <button
            onClick={onOpenExport}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-sm border border-blue-500 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Lloyds XML</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 transition"
            title="Configuration settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
