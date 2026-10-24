import React, { Fragment, useState, useMemo } from 'react';
import { PaymentTransaction, PaymentRail, ThresholdLimits, O4bBatchInfo, FeeSchedule, DEFAULT_FEE_SCHEDULE, DebtorConfig, DEFAULT_DEBTOR_CONFIG } from '../types/payment';
import {
  formatSortCode,
  getBankNameFromSortCode,
  normaliseSortCode,
  normaliseAccountNumber,
} from '../utils/bankLookup';
import { generateO4bBatchCsv, downloadFile } from '../utils/xmlGenerator';
import { getConsolidationStats, isConsolidated, sourceRecordCount } from '../utils/consolidation';
import {
  Search,
  ArrowUpDown,
  CheckSquare,
  Square,
  MinusSquare,
  ShieldCheck,
  Check,
  Layers,
  ArrowRight,
  RotateCcw,
  Download,
  ChevronRight,
  Merge,
} from 'lucide-react';

interface BatchWindowViewProps {
  transactions: PaymentTransaction[];
  limits: ThresholdLimits;
  profitMarginPercent: number;
  activeTab: PaymentRail | 'ALL';
  onChangeTab: (tab: PaymentRail | 'ALL') => void;
  onOverrideRail: (txId: string, newRail: PaymentRail) => void;
  selectedTxIds: Set<string>;
  onToggleSelect: (txId: string) => void;
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: (ids: string[]) => void;
  onBulkReassign: (txIds: string[], targetRail: PaymentRail) => void;
  onOpenReconciliation: () => void;
  // O4B Batching Props
  currentO4bBatchNumber: number;
  onCommitO4bBatch: () => void;
  onResetO4bBatches: () => void;
  committedO4bBatches: O4bBatchInfo[];
  feeSchedule?: FeeSchedule;
  debtor?: DebtorConfig;
}

export const BatchWindowView: React.FC<BatchWindowViewProps> = ({
  transactions,
  limits,
  profitMarginPercent,
  activeTab,
  onChangeTab,
  onOverrideRail,
  selectedTxIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onBulkReassign,
  onOpenReconciliation,
  currentO4bBatchNumber,
  onCommitO4bBatch,
  onResetO4bBatches,
  committedO4bBatches,
  feeSchedule,
  debtor,
}) => {
  const fees: FeeSchedule = feeSchedule || DEFAULT_FEE_SCHEDULE;
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'amount' | 'payeeName' | 'sortCode'>('amount');
  const [sortAsc, setSortAsc] = useState(false);
  // Consolidated payments whose source records are folded out for review
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Compute records total and selected total for each rail
  const railMetrics = useMemo(() => {
    const calc = (rail?: PaymentRail) => {
      const allInRail = rail ? transactions.filter((t) => t.assignedRail === rail) : transactions;
      const count = allInRail.length;
      const amount = allInRail.reduce((s, t) => s + t.amount, 0);

      const selectedInRail = allInRail.filter((t) => selectedTxIds.has(t.id));
      const selCount = selectedInRail.length;
      const selAmount = selectedInRail.reduce((s, t) => s + t.amount, 0);

      // Payments vs. the CSV records they cover (identical records are consolidated)
      const stats = getConsolidationStats(allInRail);
      const selStats = getConsolidationStats(selectedInRail);

      return { count, amount, selCount, selAmount, stats, selStats };
    };

    return {
      ALL: calc(),
      O4B: calc('O4B'),
      BACS: calc('BACS'),
      FasterPay: calc('FasterPay'),
    };
  }, [transactions, selectedTxIds]);

  // O4B specific calculations: Committed, Staged, and Payments to Go
  const o4bTransactions = useMemo(
    () => transactions.filter((t) => t.assignedRail === 'O4B'),
    [transactions]
  );

  const o4bStagedTxs = useMemo(() => {
    return o4bTransactions.filter((t) => selectedTxIds.has(t.id) && !t.o4bBatchCommitted);
  }, [o4bTransactions, selectedTxIds]);

  const o4bStagedCount = o4bStagedTxs.length;
  const o4bStagedAmount = o4bStagedTxs.reduce((s, t) => s + t.amount, 0);

  // Payments to Go : O4B transactions not committed and not currently staged
  const o4bToGoTxs = useMemo(() => {
    return o4bTransactions.filter((t) => !t.o4bBatchCommitted && !selectedTxIds.has(t.id));
  }, [o4bTransactions, selectedTxIds]);

  const o4bToGoCount = o4bToGoTxs.length;
  const o4bToGoAmount = o4bToGoTxs.reduce((s, t) => s + t.amount, 0);

  // Filtered transactions for current tab
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Filter by tab
      if (activeTab !== 'ALL' && tx.assignedRail !== activeTab) {
        return false;
      }
      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = tx.payeeName.toLowerCase().includes(query);
        const matchesSort = tx.sortCode.includes(query) || formatSortCode(tx.sortCode).includes(query);
        const matchesAccount = tx.accountNumber.includes(query);
        const matchesRef = tx.payeeReference.toLowerCase().includes(query);
        return matchesTitle || matchesSort || matchesAccount || matchesRef;
      }
      return true;
    });
  }, [transactions, activeTab, searchQuery]);

  // Sorted transactions - NO 20 payment limit, list all relevant payments for that selection
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let result = 0;
      if (sortField === 'amount') {
        result = a.amount - b.amount;
      } else if (sortField === 'payeeName') {
        result = a.payeeName.localeCompare(b.payeeName);
      } else if (sortField === 'sortCode') {
        result = a.sortCode.localeCompare(b.sortCode);
      }
      return sortAsc ? result : -result;
    });
  }, [filteredTransactions, sortField, sortAsc]);

  const handleSort = (field: 'amount' | 'payeeName' | 'sortCode') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Selection states for current filtered view (active only on non-ALL tabs)
  const currentFilteredIds = filteredTransactions.map((t) => t.id);
  const selectedInCurrentView = currentFilteredIds.filter((id) => selectedTxIds.has(id));
  const isAllCurrentSelected =
    currentFilteredIds.length > 0 && selectedInCurrentView.length === currentFilteredIds.length;
  const isPartiallySelected =
    selectedInCurrentView.length > 0 && selectedInCurrentView.length < currentFilteredIds.length;

  const handleToggleMasterCheckbox = () => {
    if (activeTab === 'ALL') return; // Inactive on All Payments
    if (isAllCurrentSelected) {
      onDeselectAll(currentFilteredIds);
    } else {
      onSelectAll(currentFilteredIds);
    }
  };

  // Active tab totals
  const currentTabMetric = railMetrics[activeTab];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Tab Navigation: Each Tile Summary has Total Amount on Left, Selected Amount on Right with SAME font size, and rows underneath */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Tab 1: All Payments */}
          <button
            onClick={() => onChangeTab('ALL')}
            className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-white border-slate-800 shadow-xs'
                : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-1">
              <span>All Payments</span>
              <span className="text-[11px] text-slate-400 font-normal">Overview</span>
            </div>

            {/* Same Font Size: Left (Total) and Right (Selected) */}
            <div className="flex items-center justify-between font-mono text-sm font-bold pt-0.5">
              <span className="text-slate-900">{formatGBP(railMetrics.ALL.amount)}</span>
              <span className={railMetrics.ALL.selCount > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                {formatGBP(railMetrics.ALL.selAmount)}
              </span>
            </div>

            {/* Rows underneath: Total records count on left, Selected records count on right */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100 mt-1 font-mono">
              <span title={`${railMetrics.ALL.stats.records} CSV records paid as ${railMetrics.ALL.count} payments`}>
                {railMetrics.ALL.count} payments
                {railMetrics.ALL.stats.recordsMerged > 0 && (
                  <span className="text-violet-700 font-semibold"> · {railMetrics.ALL.stats.recordsMerged} merged</span>
                )}
              </span>
              <span className={railMetrics.ALL.selCount > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                {railMetrics.ALL.selCount} selected
              </span>
            </div>
          </button>

          {/* Tab 2: O4B with Payments to Go : £ */}
          <button
            onClick={() => onChangeTab('O4B')}
            className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
              activeTab === 'O4B'
                ? 'bg-emerald-50/60 border-emerald-600 shadow-xs'
                : 'bg-white/60 border-slate-200 hover:bg-emerald-50/30 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-950 pb-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>O4B</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-mono">£{fees.O4B.toFixed(2)} / tx</span>
            </div>

            {/* Same Font Size: Left (Total) and Right (Selected) */}
            <div className="flex items-center justify-between font-mono text-sm font-bold pt-0.5">
              <span className="text-emerald-950">{formatGBP(railMetrics.O4B.amount)}</span>
              <span className={railMetrics.O4B.selCount > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                {formatGBP(railMetrics.O4B.selAmount)}
              </span>
            </div>

            {/* Rows underneath: Total records count on left, Selected records count on right */}
            <div className="flex items-center justify-between text-[11px] text-emerald-800/80 pt-1.5 border-t border-emerald-100 mt-1 font-mono">
              <span title={`${railMetrics.O4B.stats.records} CSV records paid as ${railMetrics.O4B.count} payments`}>
                {railMetrics.O4B.count} payments
                {railMetrics.O4B.stats.recordsMerged > 0 && (
                  <span className="text-violet-700 font-semibold"> · {railMetrics.O4B.stats.recordsMerged} merged</span>
                )}
              </span>
              <span className={railMetrics.O4B.selCount > 0 ? 'text-emerald-900 font-bold' : 'text-slate-400'}>
                {railMetrics.O4B.selCount} selected
              </span>
            </div>
          </button>

          {/* Tab 3: BACS */}
          <button
            onClick={() => onChangeTab('BACS')}
            className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
              activeTab === 'BACS'
                ? 'bg-blue-50/60 border-blue-600 shadow-xs'
                : 'bg-white/60 border-slate-200 hover:bg-blue-50/30 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-blue-950 pb-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>BACS</span>
              </div>
              <span className="text-[10px] text-blue-700 font-mono">£{fees.BACS.toFixed(2)} / tx</span>
            </div>

            {/* Same Font Size: Left (Total) and Right (Selected) */}
            <div className="flex items-center justify-between font-mono text-sm font-bold pt-0.5">
              <span className="text-blue-950">{formatGBP(railMetrics.BACS.amount)}</span>
              <span className={railMetrics.BACS.selCount > 0 ? 'text-blue-700' : 'text-slate-400'}>
                {formatGBP(railMetrics.BACS.selAmount)}
              </span>
            </div>

            {/* Rows underneath: Total records count on left, Selected records count on right */}
            <div className="flex items-center justify-between text-[11px] text-blue-800/80 pt-1.5 border-t border-blue-100 mt-1 font-mono">
              <span title={`${railMetrics.BACS.stats.records} CSV records paid as ${railMetrics.BACS.count} payments`}>
                {railMetrics.BACS.count} payments
                {railMetrics.BACS.stats.recordsMerged > 0 && (
                  <span className="text-violet-700 font-semibold"> · {railMetrics.BACS.stats.recordsMerged} merged</span>
                )}
              </span>
              <span className={railMetrics.BACS.selCount > 0 ? 'text-blue-900 font-bold' : 'text-slate-400'}>
                {railMetrics.BACS.selCount} selected
              </span>
            </div>
          </button>

          {/* Tab 4: FPS (Faster Payments - Red Theme) */}
          <button
            onClick={() => onChangeTab('FasterPay')}
            className={`p-3 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
              activeTab === 'FasterPay'
                ? 'bg-red-50/60 border-red-600 shadow-xs'
                : 'bg-white/60 border-slate-200 hover:bg-red-50/30 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-red-950 pb-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600"></span>
                <span>FPS</span>
              </div>
              <span className="text-[10px] text-red-700 font-mono">£{fees.FasterPay.toFixed(2)} / tx</span>
            </div>

            {/* Same Font Size: Left (Total) and Right (Selected) */}
            <div className="flex items-center justify-between font-mono text-sm font-bold pt-0.5">
              <span className="text-red-950">{formatGBP(railMetrics.FasterPay.amount)}</span>
              <span className={railMetrics.FasterPay.selCount > 0 ? 'text-red-700' : 'text-slate-400'}>
                {formatGBP(railMetrics.FasterPay.selAmount)}
              </span>
            </div>

            {/* Rows underneath: Total records count on left, Selected records count on right */}
            <div className="flex items-center justify-between text-[11px] text-red-800/80 pt-1.5 border-t border-red-100 mt-1 font-mono">
              <span title={`${railMetrics.FasterPay.stats.records} CSV records paid as ${railMetrics.FasterPay.count} payments`}>
                {railMetrics.FasterPay.count} payments
                {railMetrics.FasterPay.stats.recordsMerged > 0 && (
                  <span className="text-violet-700 font-semibold"> · {railMetrics.FasterPay.stats.recordsMerged} merged</span>
                )}
              </span>
              <span className={railMetrics.FasterPay.selCount > 0 ? 'text-red-900 font-bold' : 'text-slate-400'}>
                {railMetrics.FasterPay.selCount} selected
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* O4B Special Batch Numbering & Commit Toolbar (when O4B tab is active) */}
      {activeTab === 'O4B' && (
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded-md text-xs font-bold shadow-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>Current Batch: #{currentO4bBatchNumber}</span>
            </div>

            <div className="text-xs text-slate-700 font-mono">
              <span>Staged in #{currentO4bBatchNumber}: </span>
              <strong className="text-emerald-800">
                {o4bStagedCount} payments ({formatGBP(o4bStagedAmount)})
              </strong>
            </div>

            {/* Already committed batches list */}
            {committedO4bBatches.length > 0 && (
              <div className="hidden lg:flex items-center space-x-1 pl-2 border-l border-emerald-200 text-xs">
                <span className="text-slate-500 text-[11px]">Committed:</span>
                {committedO4bBatches.map((b) => (
                  <span
                    key={b.batchNumber}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono text-[11px]"
                    title={`Committed at ${b.committedAt || ''}: ${b.count} txs, ${formatGBP(b.totalAmount)}`}
                  >
                    <Check className="w-3 h-3 text-emerald-600 mr-1" />
                    B#{b.batchNumber} ({b.count})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Commit Batch Checkbox & Action */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const dateStr = (debtor?.executionDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
                const csv = generateO4bBatchCsv(o4bStagedTxs, debtor || DEFAULT_DEBTOR_CONFIG, currentO4bBatchNumber);
                downloadFile(`O4B_Batch_${currentO4bBatchNumber}_${dateStr}.csv`, csv, 'text/csv');
              }}
              disabled={o4bStagedCount === 0}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition ${
                o4bStagedCount > 0
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title={`Download O4B CSV for Batch #${currentO4bBatchNumber} with batch number recorded in selected records`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Batch #{currentO4bBatchNumber} CSV</span>
            </button>

            <button
              onClick={onCommitO4bBatch}
              disabled={o4bStagedCount === 0}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition ${
                o4bStagedCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer ring-2 ring-emerald-400/40'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="Commit selected items into this batch and advance to next batch number"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Commit Batch #{currentO4bBatchNumber} &amp; Roll to #{currentO4bBatchNumber + 1}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>

            {committedO4bBatches.length > 0 && (
              <button
                onClick={onResetO4bBatches}
                className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded border border-slate-300 transition cursor-pointer"
                title="Reset O4B batches back to Batch #1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Selection Status & Master Tickbox */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {activeTab === 'ALL' ? (
            <div className="flex items-center text-slate-500 text-xs font-medium">
              <span className="w-4 h-4 rounded border border-slate-300 bg-slate-100 flex items-center justify-center mr-1.5 text-[10px] text-slate-400">
                -
              </span>
              <span>All Payments View (Tick in specific rail tabs)</span>
            </div>
          ) : (
            <button
              onClick={handleToggleMasterCheckbox}
              className="flex items-center text-slate-700 hover:text-slate-900 font-medium cursor-pointer"
            >
              {isAllCurrentSelected ? (
                <CheckSquare className="w-4 h-4 text-emerald-600 mr-1.5" />
              ) : isPartiallySelected ? (
                <MinusSquare className="w-4 h-4 text-emerald-600 mr-1.5" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 mr-1.5" />
              )}
              <span>
                {selectedInCurrentView.length} of {filteredTransactions.length} selected
              </span>
            </button>
          )}

          <div className="text-slate-300 hidden sm:inline">|</div>

          <div className="text-xs text-slate-600 font-mono flex flex-wrap items-center gap-1.5">
            <span>Tab: <strong className="text-slate-900">{formatGBP(currentTabMetric.amount)}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Selected: <strong className="text-emerald-700">{formatGBP(currentTabMetric.selAmount)}</strong></span>
            {activeTab === 'O4B' && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-amber-800 font-medium">
                  Payments to Go : <strong className="text-amber-900 font-bold">{formatGBP(o4bToGoAmount)}</strong> ({o4bToGoCount} txs)
                </span>
              </>
            )}
          </div>

          {/* Bulk Reassign Actions */}
          {selectedInCurrentView.length > 0 && activeTab !== 'O4B' && (
            <div className="hidden sm:flex items-center space-x-1 pl-2 border-l border-slate-300">
              <span className="text-[11px] text-slate-500">Move:</span>
              <button
                onClick={() => onBulkReassign(selectedInCurrentView, 'O4B')}
                className="px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded cursor-pointer"
              >
                → O4B
              </button>
              <button
                onClick={() => onBulkReassign(selectedInCurrentView, 'BACS')}
                className="px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded cursor-pointer"
              >
                → BACS
              </button>
              <button
                onClick={() => onBulkReassign(selectedInCurrentView, 'FasterPay')}
                className="px-1.5 py-0.5 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded cursor-pointer"
              >
                → FPS
              </button>
            </div>
          )}
        </div>

        {/* Search & Final Reconciliation Trigger */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search payee, sort code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-slate-900 placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={onOpenReconciliation}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md shadow-xs transition cursor-pointer"
            title="Perform final batch export reconciliation check & export CSV audit report"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Reconciliation</span>
          </button>
        </div>
      </div>

      {/* Transaction Table - Lists all relevant payments for that selection (no 20 limit) */}
      <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-2xs">
            <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-3 w-12 text-center bg-slate-50">
                {activeTab === 'O4B' ? (
                  <span title={`Tick to stage into Batch #${currentO4bBatchNumber}`}>Batch</span>
                ) : activeTab === 'ALL' ? (
                  <span title="Read-only selection indicator on All tab">State</span>
                ) : (
                  <input
                    type="checkbox"
                    aria-label="Select all transactions in current view"
                    checked={isAllCurrentSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isPartiallySelected;
                    }}
                    onChange={handleToggleMasterCheckbox}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                )}
              </th>
              {activeTab === 'O4B' && (
                <th className="py-2.5 px-3 text-center bg-slate-50">Batch Status</th>
              )}
              <th
                onClick={() => handleSort('payeeName')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 bg-slate-50"
              >
                <div className="flex items-center space-x-1">
                  <span>Payee Name &amp; Reference</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('sortCode')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-900 bg-slate-50"
              >
                <div className="flex items-center space-x-1">
                  <span>Sort Code / Bank</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 bg-slate-50">Account Number</th>
              <th
                onClick={() => handleSort('amount')}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-slate-900 bg-slate-50"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Amount</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-center bg-slate-50">Rail</th>
              <th className="py-2.5 px-3 text-right bg-slate-50">Fee</th>
              <th className="py-2.5 px-3 text-right bg-slate-50">Margin ({profitMarginPercent}%)</th>
              <th className="py-2.5 px-3 text-right bg-slate-50">Net Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {sortedTransactions.length === 0 ? (
              <tr>
                <td colSpan={activeTab === 'O4B' ? 10 : 9} className="py-8 text-center text-slate-400">
                  No transactions found matching your criteria.
                </td>
              </tr>
            ) : (
              sortedTransactions.map((tx) => {
                const isSelected = selectedTxIds.has(tx.id);
                const fee = fees[tx.assignedRail];
                const margin = tx.amount * (profitMarginPercent / 100);
                const net = margin - fee;
                const bankName = getBankNameFromSortCode(tx.sortCode);
                const isO4bCommitted = tx.assignedRail === 'O4B' && tx.o4bBatchCommitted;
                const consolidated = isConsolidated(tx);
                const isExpanded = consolidated && expandedIds.has(tx.id);

                return (
                  <Fragment key={tx.id}>
                  <tr
                    className={`transition-colors group ${
                      isSelected
                        ? 'bg-emerald-50/40'
                        : isO4bCommitted
                        ? 'bg-emerald-50/20'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Tick Box Column:
                        - On ALL tab: Read-only visual indicator (not active)
                        - On O4B tab: Batch numbering and staging
                        - On BACS / FPS: Interactive row checkbox
                    */}
                    <td className="py-2 px-3 text-center">
                      {activeTab === 'ALL' ? (
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled
                            aria-label={`Selection state for ${tx.payeeName}`}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 opacity-60 cursor-not-allowed"
                            title={isSelected ? 'Selected in rail tab' : 'Unselected'}
                          />
                        </div>
                      ) : activeTab === 'O4B' ? (
                        isO4bCommitted ? (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-300"
                            title={`Committed in Batch #${tx.o4bBatchNumber}`}
                          >
                            ✓ B{tx.o4bBatchNumber}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleSelect(tx.id)}
                            className={`w-7 h-6 rounded text-[11px] font-mono font-bold transition flex items-center justify-center border cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-white text-slate-400 border-slate-300 hover:border-emerald-500 hover:text-emerald-600'
                            }`}
                            title={
                              isSelected
                                ? `Staged for Batch #${currentO4bBatchNumber} (click to unstage)`
                                : `Click to add to Batch #${currentO4bBatchNumber}`
                            }
                          >
                            {isSelected ? `#${currentO4bBatchNumber}` : '+'}
                          </button>
                        )
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Select transaction for ${tx.payeeName}`}
                          checked={isSelected}
                          onChange={() => onToggleSelect(tx.id)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      )}
                    </td>

                    {/* O4B Batch Status Column */}
                    {activeTab === 'O4B' && (
                      <td className="py-2 px-3 text-center font-mono text-[11px]">
                        {isO4bCommitted ? (
                          <span className="text-emerald-700 font-semibold flex items-center justify-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Batch #{tx.o4bBatchNumber}
                          </span>
                        ) : isSelected ? (
                          <span className="text-emerald-600 font-semibold">
                            Pending #{currentO4bBatchNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">Unbatched</span>
                        )}
                      </td>
                    )}

                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div>{tx.payeeName}</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        Ref: {tx.payeeReference || 'N/A'}
                      </div>
                      {consolidated && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(tx.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`fold-${tx.id}`}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-800 border border-violet-300 hover:bg-violet-100 cursor-pointer"
                          title="Identical payee, sort code, account number and reference: paid as one payment"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <Merge className="w-3 h-3" />
                          {sourceRecordCount(tx)} records consolidated
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <div>{formatSortCode(tx.sortCode)}</div>
                      <div className="text-[10px] text-slate-400 font-sans">{bankName}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 8-digit value as exported; the raw value is shown only when it can't be converted */}
                        <span>{normaliseAccountNumber(tx.accountNumber).value || tx.accountNumber}</span>
                        {(() => {
                          // Show exactly what the Lloyds files will contain, or why the payment is blocked
                          const acc = normaliseAccountNumber(tx.accountNumber);
                          const sort = normaliseSortCode(tx.sortCode);
                          const problem = [sort, acc].find((d) => d.status === 'invalid');
                          if (problem) {
                            return (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-red-100 text-red-800 border border-red-300"
                                title={`${problem.message}. This payment will block the Lloyds BACS/FPS export until corrected.`}
                              >
                                Invalid
                              </span>
                            );
                          }
                          if (acc.status === 'converted') {
                            return (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                                title={acc.message}
                              >
                                from {acc.raw}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatGBP(tx.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <select
                        aria-label={`Assigned rail for ${tx.payeeName}`}
                        value={tx.assignedRail}
                        onChange={(e) => onOverrideRail(tx.id, e.target.value as PaymentRail)}
                        className={`text-xs font-semibold py-1 px-2 rounded border transition cursor-pointer ${
                          tx.assignedRail === 'O4B'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : tx.assignedRail === 'BACS'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-red-50 text-red-800 border-red-300'
                        }`}
                      >
                        <option value="O4B">O4B (£{fees.O4B.toFixed(2)} / tx)</option>
                        <option value="BACS">BACS (£{fees.BACS.toFixed(2)} / tx)</option>
                        <option value="FasterPay">FPS (£{fees.FasterPay.toFixed(2)} / tx)</option>
                      </select>
                      {tx.isManualOverride && (
                        <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                          manual
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {fee === 0 ? (
                        <span className="text-emerald-600 font-semibold">£0.00</span>
                      ) : (
                        <span className="text-slate-600">£{fee.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      {formatGBP(margin)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${
                        net >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {formatGBP(net)}
                    </td>
                  </tr>
                  {isExpanded && (
                    // Z-fold review panel: each source record is a fold, alternately offset, adding up to the payment
                    <tr id={`fold-${tx.id}`} className="bg-violet-50/40">
                      <td colSpan={activeTab === 'O4B' ? 10 : 9} className="px-3 pb-3 pt-0">
                        <div className="ml-10 border-l-2 border-violet-300 pl-3 pt-2 space-y-1">
                          <div className="text-[11px] font-semibold text-violet-900">
                            {sourceRecordCount(tx)} identical records consolidated into one payment
                          </div>
                          {tx.sourceRecords.map((r, i) => (
                            <div
                              key={r.rowNumber}
                              className={`flex flex-wrap items-center gap-x-4 gap-y-0.5 px-2.5 py-1.5 rounded border border-violet-200 bg-white text-[11px] font-mono text-slate-700 shadow-2xs max-w-3xl ${
                                i % 2 === 1 ? 'ml-6 -skew-x-3' : 'skew-x-3'
                              }`}
                            >
                              <span className="text-violet-700 font-semibold">CSV row {r.rowNumber}</span>
                              <span className="font-sans">{r.payeeName}</span>
                              <span>{formatSortCode(r.sortCode)}</span>
                              <span>{r.accountNumber}</span>
                              <span className="font-sans">Ref: {r.payeeReference || 'N/A'}</span>
                              <span className="ml-auto font-bold text-slate-900 tabular-nums">{formatGBP(r.amount)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between max-w-3xl px-2.5 pt-1 text-[11px] font-mono border-t border-violet-200">
                            <span className="text-violet-900 font-sans font-semibold">
                              Exported as 1 payment ({sourceRecordCount(tx) - 1} fewer, saving {formatGBP(fee * (sourceRecordCount(tx) - 1))} in fees)
                            </span>
                            <span className="font-bold text-slate-900 tabular-nums">= {formatGBP(tx.amount)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer: Lists All Relevant Payments without 20 limit */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800 font-sans">
            Listing all {sortedTransactions.length} payments
          </span>
          {currentTabMetric.stats.recordsMerged > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-violet-800" title="Identical payee, sort code, account number and reference">
                {currentTabMetric.stats.records} CSV records → {currentTabMetric.count} payments ({currentTabMetric.stats.recordsMerged} merged)
              </span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span>Total: <strong className="text-slate-900">{formatGBP(currentTabMetric.amount)}</strong></span>
          <span className="text-slate-300">·</span>
          <span>Selected: <strong className="text-emerald-700">{formatGBP(currentTabMetric.selAmount)}</strong> ({currentTabMetric.selCount} payments{currentTabMetric.selStats.recordsMerged > 0 ? `, ${currentTabMetric.selStats.records} records` : ''})</span>
          {activeTab === 'O4B' && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-amber-800 font-medium">
                Payments to Go : <strong className="text-amber-950 font-bold">{formatGBP(o4bToGoAmount)}</strong> ({o4bToGoCount} remaining)
              </span>
            </>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-sans">
          All relevant records shown for {activeTab === 'ALL' ? 'All Payments' : activeTab}
        </div>
      </div>
    </div>
  );
};
