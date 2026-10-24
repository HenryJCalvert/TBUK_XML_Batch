import React from 'react';
import { PaymentTransaction, DebtorConfig, FeeSchedule, DEFAULT_FEE_SCHEDULE } from '../types/payment';
import {
  downloadFile,
  toPence,
  getLloydsExecutionDates,
  validateLloydsBatch,
  LloydsBatchValidation,
} from '../utils/xmlGenerator';
import { normaliseSortCode, normaliseAccountNumber, formatLloydsDebitAccount } from '../utils/bankLookup';
import { getConsolidationStats, sourceRecordCount } from '../utils/consolidation';

// Reconciliation shows the 6/8-digit values sent to Lloyds; unconvertible values are shown as imported
const exportSortCode = (tx: PaymentTransaction) => normaliseSortCode(tx.sortCode).value || tx.sortCode;
const exportAccountNumber = (tx: PaymentTransaction) => normaliseAccountNumber(tx.accountNumber).value || tx.accountNumber;
const sourceRows = (tx: PaymentTransaction) => (tx.sourceRecords || []).map((r) => r.rowNumber).join(';');
import {
  CheckCircle2,
  ShieldCheck,
  Download,
  X,
  AlertTriangle,
  Building2,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';

interface BatchReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: PaymentTransaction[];
  selectedTxIds: Set<string>;
  debtor: DebtorConfig;
  profitMarginPercent: number;
  onProceedToExport: () => void;
  feeSchedule?: FeeSchedule;
  currentO4bBatchNumber?: number;
}

export const BatchReconciliationModal: React.FC<BatchReconciliationModalProps> = ({
  isOpen,
  onClose,
  transactions,
  selectedTxIds,
  debtor,
  profitMarginPercent,
  onProceedToExport,
  feeSchedule,
  currentO4bBatchNumber = 1,
}) => {
  if (!isOpen) return null;

  const fees: FeeSchedule = feeSchedule || DEFAULT_FEE_SCHEDULE;

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Totals are added in whole pence so the variance check isn't thrown off by floating point
  const sumGbp = (txs: PaymentTransaction[]) => txs.reduce((s, t) => s + toPence(t.amount), 0) / 100;

  // Source total: payments, and the CSV records they cover (identical records are consolidated)
  const totalSourceCount = transactions.length;
  const totalSourceAmount = sumGbp(transactions);
  const sourceStats = getConsolidationStats(transactions);
  // Items column: "payments" or "payments / records" when records were consolidated
  const items = (txs: PaymentTransaction[]) => {
    const st = getConsolidationStats(txs);
    return st.recordsMerged > 0 ? `${st.payments} / ${st.records}` : `${st.payments}`;
  };

  // Same rule as the export: only ticked rows are exported (plus O4B rows already committed to a batch)
  const isIncluded = (t: PaymentTransaction) =>
    selectedTxIds.has(t.id) || (t.assignedRail === 'O4B' && !!t.o4bBatchCommitted);
  const selectedTxs = transactions.filter(isIncluded);
  const excludedTxs = transactions.filter((t) => !isIncluded(t));

  // Tiers among active
  const o4bTxs = selectedTxs.filter((t) => t.assignedRail === 'O4B');
  const bacsTxs = selectedTxs.filter((t) => t.assignedRail === 'BACS');
  const fpsTxs = selectedTxs.filter((t) => t.assignedRail === 'FasterPay');

  const o4bAmount = sumGbp(o4bTxs);
  const bacsAmount = sumGbp(bacsTxs);
  const fpsAmount = sumGbp(fpsTxs);
  const excludedAmount = sumGbp(excludedTxs);

  // Lloyds validation status and dates, identical to what the export window will produce
  const dates = getLloydsExecutionDates(debtor);
  const bacsBatch = validateLloydsBatch('BACS', bacsTxs, debtor, dates);
  const fpsBatch = validateLloydsBatch('FasterPay', fpsTxs, debtor, dates);
  const batchStatus = (batch: LloydsBatchValidation, label: string) =>
    batch.payments.length === 0
      ? 'Nothing to export'
      : batch.hasErrors
      ? `Blocked: ${batch.issues.filter((i) => i.level === 'error').length} error(s)`
      : `Ready for Lloyds ${label} XML`;
  const debitAccount = formatLloydsDebitAccount(debtor.debtorSortCode, debtor.debtorAccountNumber);

  const o4bFees = o4bTxs.length * fees.O4B;
  const bacsFees = bacsTxs.length * fees.BACS;
  const fpsFees = fpsTxs.length * fees.FasterPay;
  const totalBatchFees = o4bFees + bacsFees + fpsFees;

  const activeBatchTotal = o4bAmount + bacsAmount + fpsAmount;
  const totalAccountedAmount = activeBatchTotal + excludedAmount;
  const amountVariance = Math.abs(Math.round(totalSourceAmount * 100) - Math.round(totalAccountedAmount * 100)) / 100;
  // Every CSV record must be in exactly one payment, and every payment either exported or excluded
  const recordsAccounted = getConsolidationStats(selectedTxs).records + getConsolidationStats(excludedTxs).records;
  const countVariance =
    sourceStats.records - recordsAccounted + (totalSourceCount - (selectedTxs.length + excludedTxs.length));

  const isBalanced = amountVariance === 0 && countVariance === 0;

  // Generate and download the Final Reconciliation CSV Audit Report
  const handleExportReconciliationCsv = () => {
    const lines: string[] = [];
    const dateStr = dates.fps.date.replace(/-/g, '');
    const marginMult = profitMarginPercent / 100;

    lines.push(`"FINAL PAYMENT BATCH EXPORT RECONCILIATION REPORT"`);
    lines.push(`"FPS Execution Date","${dates.fps.date}"`);
    lines.push(`"BACS Execution Date","${dates.bacs.date}"`);
    lines.push(`"Debtor Account","${debitAccount}"`);
    lines.push(`"Debtor Entity","${debtor.debtorName.replace(/"/g, '""')}"`);
    lines.push(`"Generated At","${new Date().toISOString()}"`);
    lines.push(`"Profit Margin Basis","${profitMarginPercent.toFixed(3)}%"`);
    lines.push(``);

    lines.push(`"RECONCILIATION SUMMARY AUDIT"`);
    lines.push(`"Source CSV Records","${sourceStats.records}"`);
    lines.push(`"Payments After Consolidation","${totalSourceCount}"`);
    lines.push(`"Records Merged","${sourceStats.recordsMerged}"`);
    lines.push(``);
    lines.push(`"Category","Payments","Total Amount (GBP)","Processing Fees (GBP)","Net Margin (GBP)","Status","Source Records"`);
    lines.push(
      `"O4B (Open Banking) Batched","${o4bTxs.length}","${o4bAmount.toFixed(2)}","${o4bFees.toFixed(2)}","${(o4bAmount * marginMult - o4bFees).toFixed(2)}","Committed / Active","${getConsolidationStats(o4bTxs).records}"`
    );
    lines.push(
      `"BACS Selected for Export","${bacsTxs.length}","${bacsAmount.toFixed(2)}","${bacsFees.toFixed(2)}","${(bacsAmount * marginMult - bacsFees).toFixed(2)}","${batchStatus(bacsBatch, 'BACS')}","${getConsolidationStats(bacsTxs).records}"`
    );
    lines.push(
      `"FPS Selected for Export","${fpsTxs.length}","${fpsAmount.toFixed(2)}","${fpsFees.toFixed(2)}","${(fpsAmount * marginMult - fpsFees).toFixed(2)}","${batchStatus(fpsBatch, 'FPS')}","${getConsolidationStats(fpsTxs).records}"`
    );
    if (excludedTxs.length > 0) {
      lines.push(
        `"Unselected / Excluded","${excludedTxs.length}","${excludedAmount.toFixed(2)}","0.00","0.00","Excluded from Export","${getConsolidationStats(excludedTxs).records}"`
      );
    }
    lines.push(
      `"TOTAL RECONCILED","${totalSourceCount}","${totalSourceAmount.toFixed(2)}","${totalBatchFees.toFixed(2)}","${(activeBatchTotal * marginMult - totalBatchFees).toFixed(2)}","${isBalanced ? 'Zero Variance Verified' : `Variance: ${countVariance} record(s), GBP ${amountVariance.toFixed(2)}`}","${sourceStats.records}"`
    );
    lines.push(``);

    lines.push(`"DETAILED TRANSACTION AUDIT RECORDS"`);
    lines.push(
      `"GROUP","STATUS","RAIL","BATCH_NO","FEE_GBP","MARGIN_GBP","NET_GBP","RECORD_ID","PAYEE_NAME","SORT_CODE","ACCOUNT_NUMBER","AMOUNT_GBP","PAYEE_REFERENCE","SOURCE_RECORDS","SOURCE_CSV_ROWS"`
    );

    // Group 1: O4B
    transactions
      .filter((t) => t.assignedRail === 'O4B')
      .forEach((tx) => {
        const isSel = selectedTxIds.has(tx.id);
        const batchNo = tx.o4bBatchNumber
          ? `${tx.o4bBatchNumber}`
          : isSel
          ? `${currentO4bBatchNumber}`
          : '-';
        const group = tx.o4bBatchCommitted
          ? `O4B (Batch #${tx.o4bBatchNumber})`
          : isSel
          ? `O4B (Batch #${currentO4bBatchNumber})`
          : 'O4B (Unbatched)';
        const status = tx.o4bBatchCommitted
          ? `Committed Batch #${tx.o4bBatchNumber}`
          : isSel
          ? `Selected (Batch #${currentO4bBatchNumber})`
          : 'Unselected';
        const fee = fees.O4B;
        const margin = tx.amount * marginMult;
        const net = margin - fee;
        lines.push(
          `"${group}","${status}","O4B","${batchNo}","${fee.toFixed(2)}","${margin.toFixed(2)}","${net.toFixed(2)}","${tx.id}","${tx.payeeName.replace(/"/g, '""')}","${exportSortCode(tx)}","${exportAccountNumber(tx)}","${tx.amount.toFixed(2)}","${(tx.payeeReference || '').replace(/"/g, '""')}","${sourceRecordCount(tx)}","${sourceRows(tx)}"`
        );
      });

    // Group 2: BACS
    transactions
      .filter((t) => t.assignedRail === 'BACS')
      .forEach((tx) => {
        const isSel = selectedTxIds.has(tx.id);
        const batchNo = isSel ? '1' : '-';
        const group = isSel ? 'BACS (Batch #1)' : 'BACS (Excluded)';
        const status = isSel ? 'Selected for BACS XML' : 'Unselected';
        const fee = fees.BACS;
        const margin = tx.amount * marginMult;
        const net = margin - fee;
        lines.push(
          `"${group}","${status}","BACS","${batchNo}","${fee.toFixed(2)}","${margin.toFixed(2)}","${net.toFixed(2)}","${tx.id}","${tx.payeeName.replace(/"/g, '""')}","${exportSortCode(tx)}","${exportAccountNumber(tx)}","${tx.amount.toFixed(2)}","${(tx.payeeReference || '').replace(/"/g, '""')}","${sourceRecordCount(tx)}","${sourceRows(tx)}"`
        );
      });

    // Group 3: FPS
    transactions
      .filter((t) => t.assignedRail === 'FasterPay')
      .forEach((tx) => {
        const isSel = selectedTxIds.has(tx.id);
        const batchNo = isSel ? '1' : '-';
        const group = isSel ? 'FPS (Batch #1)' : 'FPS (Excluded)';
        const status = isSel ? 'Selected for FPS XML' : 'Unselected';
        const fee = fees.FasterPay;
        const margin = tx.amount * marginMult;
        const net = margin - fee;
        lines.push(
          `"${group}","${status}","FPS","${batchNo}","${fee.toFixed(2)}","${margin.toFixed(2)}","${net.toFixed(2)}","${tx.id}","${tx.payeeName.replace(/"/g, '""')}","${exportSortCode(tx)}","${exportAccountNumber(tx)}","${tx.amount.toFixed(2)}","${(tx.payeeReference || '').replace(/"/g, '""')}","${sourceRecordCount(tx)}","${sourceRows(tx)}"`
        );
      });

    const csvContent = lines.join('\n');
    downloadFile(
      `Final_Payment_Batch_Export_Reconciliation_${dateStr}.csv`,
      csvContent,
      'text/csv'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Final Payment Batch Export Reconciliation
              </h2>
              <p className="text-xs text-slate-500">
                Audits transaction allocation and validates zero variance before bank clearing transmission
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Debtor Profile Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{debtor.debtorName}</span>
                <span className="font-mono text-slate-500">({debitAccount})</span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Execution Date:</span>
              <span className="font-mono font-semibold text-slate-800">
                FPS {dates.fps.date} · BACS {dates.bacs.date}
              </span>
            </div>
          </div>

          {/* Reconciliation Status Card */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isBalanced
                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              {isBalanced ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {isBalanced
                    ? '100% Balanced & Reconciled — Zero Variance'
                    : 'Reconciliation Discrepancy Detected'}
                </div>
                <div className="text-xs mt-0.5 opacity-90">
                  {isBalanced
                    ? sourceStats.recordsMerged > 0
                      ? `All ${sourceStats.records} CSV records accounted for in ${totalSourceCount} payments (${sourceStats.recordsMerged} merged into ${sourceStats.consolidatedPayments} consolidated payments).`
                      : `All ${totalSourceCount} source payments accounted for across the payment batches.`
                    : 'Please review transaction count and amount allocations before generating Lloyds XML.'}
                </div>
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-xs uppercase text-slate-500">Variance</div>
              <div className={`text-sm font-bold ${isBalanced ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatGBP(amountVariance)}
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Batch Window / Category</th>
                  <th className="py-2.5 px-3 text-center">Unit Fee (/ tx)</th>
                  <th className="py-2.5 px-3 text-right" title="Payments / CSV records when identical records were consolidated">Payments</th>
                  <th className="py-2.5 px-3 text-right">Total Batch Amount</th>
                  <th className="py-2.5 px-3 text-right">Batch Fee</th>
                  <th className="py-2.5 px-3 text-right">Target Format</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>O4B (Open Banking)</span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-emerald-600 font-semibold">£{fees.O4B.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right">{items(o4bTxs)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatGBP(o4bAmount)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-600">{formatGBP(o4bFees)}</td>
                  <td className="py-2.5 px-3 text-right font-sans text-slate-500 text-[11px]">O4B Batches</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span>BACS Direct Credit</span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-blue-600 font-semibold">£{fees.BACS.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right">{items(bacsTxs)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatGBP(bacsAmount)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatGBP(bacsFees)}</td>
                  <td className="py-2.5 px-3 text-right font-sans text-slate-500 text-[11px]">Lloyds BACS XML (UKBACS)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                    <span>FPS (Faster Payments)</span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-red-600 font-semibold">£{fees.FasterPay.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right">{items(fpsTxs)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{formatGBP(fpsAmount)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatGBP(fpsFees)}</td>
                  <td className="py-2.5 px-3 text-right font-sans text-slate-500 text-[11px]">Lloyds FPS XML (FPS)</td>
                </tr>
                {excludedTxs.length > 0 && (
                  <tr className="bg-slate-50/70 text-slate-500">
                    <td className="py-2 px-3 font-sans flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                      <span>Deselected / On Hold</span>
                    </td>
                    <td className="py-2 px-3 text-center">-</td>
                    <td className="py-2 px-3 text-right">{items(excludedTxs)}</td>
                    <td className="py-2 px-3 text-right">{formatGBP(excludedAmount)}</td>
                    <td className="py-2 px-3 text-right">£0.00</td>
                    <td className="py-2 px-3 text-right font-sans text-[11px]">Excluded from export</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100/80 font-mono font-bold text-slate-900 border-t border-slate-200">
                <tr>
                  <td className="py-2.5 px-3 font-sans">Active Export Total</td>
                  <td className="py-2.5 px-3 text-center">-</td>
                  <td className="py-2.5 px-3 text-right">{items(selectedTxs)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">{formatGBP(activeBatchTotal)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-600">{formatGBP(totalBatchFees)}</td>
                  <td className="py-2.5 px-3 text-right font-sans text-emerald-700 font-semibold text-[11px]">Lloyds XML Ready</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Back to Payments
          </button>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportReconciliationCsv}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm border border-emerald-700 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV Audit</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onProceedToExport();
              }}
              className="flex items-center space-x-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Proceed to Lloyds XML Export</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
