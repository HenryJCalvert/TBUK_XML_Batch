import React, { useState, useMemo, useRef } from 'react';
import {
  PaymentTransaction,
  ThresholdLimits,
  DebtorConfig,
  PaymentRail,
  O4bBatchInfo,
  FeeSchedule,
  DEFAULT_FEE_SCHEDULE,
  RailTimeConfig,
  DEFAULT_RAIL_TIME_CONFIG,
  DEFAULT_DEBTOR_CONFIG,
} from './types/payment';
import { parsePaymentCsv, determineRailByLimits } from './utils/csvParser';
import { calculateSummaries } from './utils/calculations';
import { Header } from './components/Header';
import { SummaryTotals } from './components/SummaryTotals';
import { SliderControls } from './components/SliderControls';
import { BatchWindowView } from './components/BatchWindowView';
import { OptimizationModal } from './components/OptimizationModal';
import { XmlExportModal } from './components/XmlExportModal';
import { SettingsModal } from './components/SettingsModal';
import { CsvUploadModal } from './components/CsvUploadModal';
import { BatchReconciliationModal } from './components/BatchReconciliationModal';
import {
  Upload,
  FileSpreadsheet,
} from 'lucide-react';

export default function App() {
  // State: Limits (Default Break-Even display: O4B < £1,000, BACS < £2,000, FPS >= £2,000 at 0.025% margin)
  const [limits, setLimits] = useState<ThresholdLimits>({
    o4bLimit: 1000,
    bacsLimit: 2000,
  });

  // State: Profit margin percentage (Default: 0.025%)
  const [profitMarginPercent, setProfitMarginPercent] = useState<number>(0.025);

  // State: Processing Fee Schedule (Configurable clearing rates per tx)
  const [feeSchedule, setFeeSchedule] = useState<FeeSchedule>({
    ...DEFAULT_FEE_SCHEDULE,
  });

  // State: Operator Processing Time Schedule (30s / payment O4B, 2m holistic setup, 2m / batch BACS, 2m / batch FPS)
  const [railTimeConfig, setRailTimeConfig] = useState<RailTimeConfig>({
    ...DEFAULT_RAIL_TIME_CONFIG,
  });

  // State: Debtor settings (Default Sort Code: 30-14-40, Account: 14438260, Entity: TRYBOOKING UK LIMITED, Ref: SUPP)
  const [debtor, setDebtor] = useState<DebtorConfig>({
    ...DEFAULT_DEBTOR_CONFIG,
  });

  // State: Transactions & Raw CSV (Start with NO uploaded file)
  const [fileName, setFileName] = useState<string>('');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  // Tick boxes are UNSELECTED by default
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [isOptimized, setIsOptimized] = useState<boolean>(false);

  // Drag and drop state for landing screen
  const [landingDragActive, setLandingDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // O4B Batch Numbering & Rolling State
  const [currentO4bBatchNumber, setCurrentO4bBatchNumber] = useState<number>(1);
  const [committedO4bBatches, setCommittedO4bBatches] = useState<O4bBatchInfo[]>([]);

  // State: Active tab & Modals
  const [activeTab, setActiveTab] = useState<PaymentRail | 'ALL'>('ALL');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isOptimizeOpen, setIsOptimizeOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportRail, setExportRail] = useState<PaymentRail | 'ALL'>('ALL');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);

  // When limits change, update assignedRail for non-overridden transactions
  const handleLimitsChange = (newLimits: ThresholdLimits) => {
    setLimits(newLimits);
    setIsOptimized(false);
    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.isManualOverride) return tx;
        return {
          ...tx,
          assignedRail: determineRailByLimits(tx.amount, newLimits),
        };
      })
    );
  };

  // Re-partition with default Break-Even limits (£1,000 / £2,000 at 0.025% margin)
  const handleResetToDefaults = () => {
    const defaultLimits: ThresholdLimits = { o4bLimit: 1000, bacsLimit: 2000 };
    setLimits(defaultLimits);
    setProfitMarginPercent(0.025);
    setFeeSchedule({ ...DEFAULT_FEE_SCHEDULE });
    setRailTimeConfig({ ...DEFAULT_RAIL_TIME_CONFIG });
    setDebtor({ ...DEFAULT_DEBTOR_CONFIG });
    setIsOptimized(false);
    setSelectedTxIds(new Set());
    setTransactions((prev) =>
      prev.map((tx) => ({
        ...tx,
        isManualOverride: false,
        assignedRail: determineRailByLimits(tx.amount, defaultLimits),
      }))
    );
  };

  // Handle manual override from table
  const handleOverrideRail = (txId: string, newRail: PaymentRail) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === txId
          ? {
              ...tx,
              assignedRail: newRail,
              isManualOverride: true,
            }
          : tx
      )
    );
  };

  // Selection handlers - tick boxes are unselected by default
  const handleToggleSelect = (txId: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const handleSelectAll = (ids: string[]) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDeselectAll = (ids: string[]) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleBulkReassign = (ids: string[], targetRail: PaymentRail) => {
    const idSet = new Set(ids);
    setTransactions((prev) =>
      prev.map((tx) =>
        idSet.has(tx.id)
          ? {
              ...tx,
              assignedRail: targetRail,
              isManualOverride: true,
            }
          : tx
      )
    );
  };

  // O4B Commit Batch Handler - commits current staged items and rolls to next batch number
  const handleCommitO4bBatch = () => {
    const stagedO4bTxs = transactions.filter(
      (t) => t.assignedRail === 'O4B' && selectedTxIds.has(t.id) && !t.o4bBatchCommitted
    );

    if (stagedO4bTxs.length === 0) return;

    const batchCount = stagedO4bTxs.length;
    const batchAmount = stagedO4bTxs.reduce((s, t) => s + t.amount, 0);
    const stagedIds = new Set(stagedO4bTxs.map((t) => t.id));

    // Update transactions to be committed with current batch number
    setTransactions((prev) =>
      prev.map((tx) =>
        stagedIds.has(tx.id)
          ? {
              ...tx,
              o4bBatchNumber: currentO4bBatchNumber,
              o4bBatchCommitted: true,
            }
          : tx
      )
    );

    // Save batch summary
    const newBatchInfo: O4bBatchInfo = {
      batchNumber: currentO4bBatchNumber,
      status: 'committed',
      count: batchCount,
      totalAmount: batchAmount,
      committedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setCommittedO4bBatches((prev) => [...prev, newBatchInfo]);

    // Clear staged IDs from selection
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      stagedIds.forEach((id) => next.delete(id));
      return next;
    });

    // Roll onto next batch number!
    setCurrentO4bBatchNumber((prev) => prev + 1);
  };

  // Reset O4B batches back to Batch #1
  const handleResetO4bBatches = () => {
    setCurrentO4bBatchNumber(1);
    setCommittedO4bBatches([]);
    setTransactions((prev) =>
      prev.map((t) => ({
        ...t,
        o4bBatchNumber: undefined,
        o4bBatchCommitted: false,
      }))
    );
  };

  // Process File directly (handles input change or drag-and-drop)
  const processUploadedFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        handleUploadCsv(content, file.name);
      }
    };
    reader.readAsText(file);
  };

  // Handle CSV upload (unselected by default)
  const handleUploadCsv = (content: string, name: string) => {
    setRawCsvText(content);
    setFileName(name);
    setIsOptimized(false);
    setSelectedTxIds(new Set()); // Unselected by default!
    setCurrentO4bBatchNumber(1);
    setCommittedO4bBatches([]);
    const parsed = parsePaymentCsv(content, limits);
    setTransactions(parsed);
  };

  // Apply optimization result
  const handleApplyOptimization = (
    optimizedTxs: PaymentTransaction[],
    newLimits: ThresholdLimits,
    newMargin: number
  ) => {
    setLimits(newLimits);
    setProfitMarginPercent(newMargin);
    setTransactions(optimizedTxs);
    setIsOptimized(true);
  };

  // Trigger export for specific window
  const handleExportWindow = (rail: PaymentRail) => {
    setExportRail(rail);
    setIsExportOpen(true);
  };

  // Calculate live global summary
  const summary = useMemo(() => {
    return calculateSummaries(transactions, profitMarginPercent, feeSchedule);
  }, [transactions, profitMarginPercent, feeSchedule]);

  // For BACS and FPS, ONLY export the selected payment rows!
  const exportableTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.assignedRail === 'BACS' || t.assignedRail === 'FasterPay') {
        return selectedTxIds.has(t.id);
      }
      if (t.assignedRail === 'O4B') {
        return selectedTxIds.has(t.id) || t.o4bBatchCommitted;
      }
      return false;
    });
  }, [transactions, selectedTxIds]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased flex flex-col">
      {/* Hidden File Input for direct open dialog */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            processUploadedFile(e.target.files[0]);
          }
        }}
      />

      {/* Top Application Header */}
      <Header
        fileName={fileName}
        totalCount={transactions.length}
        onOpenUpload={() => fileInputRef.current?.click()}
        onOpenOptimize={() => {
          if (transactions.length > 0) {
            setIsOptimizeOpen(true);
          } else {
            fileInputRef.current?.click();
          }
        }}
        onOpenExport={() => {
          setExportRail('ALL');
          setIsExportOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetToDefaults={handleResetToDefaults}
        isOptimized={isOptimized}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {transactions.length === 0 ? (
          /* Zero-State: Drop and Drag directly on this window, button goes straight to file open window */
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setLandingDragActive(true);
            }}
            onDragLeave={() => setLandingDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setLandingDragActive(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processUploadedFile(e.dataTransfer.files[0]);
              }
            }}
            className={`rounded-2xl border-2 p-10 shadow-sm text-center max-w-2xl mx-auto my-8 transition ${
              landingDragActive
                ? 'border-emerald-500 bg-emerald-50/60 ring-4 ring-emerald-500/20'
                : 'border-dashed border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-100">
              <Upload className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Import Payment Transactions CSV
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
              Drag and drop your banking batch .csv file anywhere in this window, or click below to browse directly.
            </p>

            <div className="mt-6 flex items-center justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center space-x-2 px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Batch CSV</span>
              </button>
            </div>

            {/* 3 Windows Spec Overview */}
            <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="font-semibold text-xs text-slate-900">O4B</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Break-even: &lt;£1,000 · <strong>£{feeSchedule.O4B.toFixed(2)}</strong> fee / tx
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Real-time Open Banking with sequential batching
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span className="font-semibold text-xs text-slate-900">BACS</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Break-even: £1,000 to &lt;£2,000 · <strong>£{feeSchedule.BACS.toFixed(2)}</strong> fee / tx
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Standard 3-day bulk clearing direct credit
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                  <span className="font-semibold text-xs text-slate-900">FPS</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Break-even: £2,000+ · <strong>£{feeSchedule.FasterPay.toFixed(2)}</strong> fee / tx
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Instant real-time clearing via Lloyds FPS
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Executive Summary Totals Cards */}
            <SummaryTotals
              summary={summary}
              limits={limits}
              profitMarginPercent={profitMarginPercent}
              onFilterRail={(rail) => setActiveTab(rail)}
              activeFilter={activeTab}
              feeSchedule={feeSchedule}
            />

            {/* Compact Interactive Threshold Limit Sliders with Break-Even as default */}
            <SliderControls
              limits={limits}
              onChangeLimits={handleLimitsChange}
              summary={summary}
              transactions={transactions}
              profitMarginPercent={profitMarginPercent}
              feeSchedule={feeSchedule}
            />

            {/* Batch Transactions Table / Window Splitter with Tick Boxes and Reconciliation */}
            <BatchWindowView
              transactions={transactions}
              limits={limits}
              profitMarginPercent={profitMarginPercent}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              onOverrideRail={handleOverrideRail}
              selectedTxIds={selectedTxIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onBulkReassign={handleBulkReassign}
              onOpenReconciliation={() => setIsReconciliationOpen(true)}
              currentO4bBatchNumber={currentO4bBatchNumber}
              onCommitO4bBatch={handleCommitO4bBatch}
              onResetO4bBatches={handleResetO4bBatches}
              committedO4bBatches={committedO4bBatches}
              feeSchedule={feeSchedule}
              debtor={debtor}
            />
          </>
        )}
      </main>

      {/* Modals */}
      <OptimizationModal
        isOpen={isOptimizeOpen}
        onClose={() => setIsOptimizeOpen(false)}
        transactions={transactions}
        currentLimits={limits}
        profitMarginPercent={profitMarginPercent}
        onApplyOptimization={handleApplyOptimization}
        feeSchedule={feeSchedule}
        railTimeConfig={railTimeConfig}
        onSaveRailTimeConfig={setRailTimeConfig}
      />

      <XmlExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        transactions={exportableTransactions}
        debtor={debtor}
        defaultRail={exportRail}
      />

      <BatchReconciliationModal
        isOpen={isReconciliationOpen}
        onClose={() => setIsReconciliationOpen(false)}
        transactions={transactions}
        selectedTxIds={selectedTxIds}
        debtor={debtor}
        profitMarginPercent={profitMarginPercent}
        onProceedToExport={() => {
          setExportRail('ALL');
          setIsExportOpen(true);
        }}
        feeSchedule={feeSchedule}
        currentO4bBatchNumber={currentO4bBatchNumber}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        debtor={debtor}
        onSaveDebtor={setDebtor}
        profitMarginPercent={profitMarginPercent}
        onSaveProfitMargin={setProfitMarginPercent}
        feeSchedule={feeSchedule}
        onSaveFeeSchedule={setFeeSchedule}
        railTimeConfig={railTimeConfig}
        onSaveRailTimeConfig={setRailTimeConfig}
      />

      <CsvUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadCsv={handleUploadCsv}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-3.5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Lloyds ISO 20022 Commercial Banking Online Engine</span>
            <span>·</span>
            <span>UK BACS &amp; FPS Compliant</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-400 font-mono text-[11px]">
            <span className="text-emerald-700 font-semibold">O4B £{feeSchedule.O4B.toFixed(2)} / tx</span>
            <span>·</span>
            <span className="text-blue-700 font-semibold">BACS £{feeSchedule.BACS.toFixed(2)} / tx</span>
            <span>·</span>
            <span className="text-red-700 font-semibold">FPS £{feeSchedule.FasterPay.toFixed(2)} / tx</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
