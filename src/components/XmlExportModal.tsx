import React, { useEffect, useMemo, useState } from 'react';
import { PaymentTransaction, DebtorConfig, PaymentRail } from '../types/payment';
import {
  generateLloydsBacsXml,
  generateLloydsFasterPaymentsXml,
  getLloydsExecutionDates,
  validateLloydsBatch,
  sanitizeReference,
  LloydsBatchValidation,
  LLOYDS_DEBIT_REFERENCE_MAX,
  downloadFile,
} from '../utils/xmlGenerator';
import { formatLloydsDebitAccount } from '../utils/bankLookup';
import { getConsolidationStats, describePaymentCount } from '../utils/consolidation';
import {
  Download,
  Copy,
  Check,
  FileCode,
  X,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface XmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: PaymentTransaction[];
  debtor: DebtorConfig;
  defaultRail?: PaymentRail | 'ALL';
}

export const XmlExportModal: React.FC<XmlExportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  debtor,
  defaultRail = 'ALL',
}) => {
  const [activeTab, setActiveTab] = useState<'BACS' | 'FasterPay'>(
    defaultRail === 'FasterPay' ? 'FasterPay' : 'BACS'
  );
  const [copied, setCopied] = useState(false);
  const [exportedAll, setExportedAll] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>('');
  // Code window set to closed at beginning as requested
  const [isCodeOpen, setIsCodeOpen] = useState(false);

  // Filter batches for Lloyds BACS and FPS
  const bacsTxs = useMemo(() => transactions.filter((t) => t.assignedRail === 'BACS'), [transactions]);
  const fpsTxs = useMemo(() => transactions.filter((t) => t.assignedRail === 'FasterPay'), [transactions]);

  // Dates and validation are recalculated each time the modal opens, so a session left open
  // overnight never exports yesterday's date. The screen and the files use the same values.
  const dates = useMemo(() => getLloydsExecutionDates(debtor), [debtor, isOpen]);
  const bacsBatch = useMemo(() => validateLloydsBatch('BACS', bacsTxs, debtor, dates), [bacsTxs, debtor, dates]);
  const fpsBatch = useMemo(() => validateLloydsBatch('FasterPay', fpsTxs, debtor, dates), [fpsTxs, debtor, dates]);

  // XML is only generated for batches that pass validation
  const bacsXml = useMemo(
    () => (bacsBatch.hasErrors ? '' : generateLloydsBacsXml(bacsTxs, debtor, dates)),
    [bacsBatch, bacsTxs, debtor, dates]
  );
  const fpsXml = useMemo(
    () => (fpsBatch.hasErrors ? '' : generateLloydsFasterPaymentsXml(fpsTxs, debtor, dates)),
    [fpsBatch, fpsTxs, debtor, dates]
  );

  // Open on the requested rail, or on whichever rail actually has payments
  useEffect(() => {
    if (!isOpen) return;
    if (defaultRail === 'BACS' || defaultRail === 'FasterPay') {
      setActiveTab(defaultRail);
    } else {
      setActiveTab(bacsTxs.length === 0 && fpsTxs.length > 0 ? 'FasterPay' : 'BACS');
    }
    setExportMessage('');
  }, [isOpen, defaultRail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Totals are added in whole pence to avoid floating point drift
  const bacsAmount = bacsBatch.totalPence / 100;
  const fpsAmount = fpsBatch.totalPence / 100;
  const combinedTotalCount = bacsTxs.length + fpsTxs.length;
  const combinedTotalAmount = (bacsBatch.totalPence + fpsBatch.totalPence) / 100;

  // Payments in each file vs. the CSV records they cover (identical records are consolidated)
  const bacsStats = getConsolidationStats(bacsTxs);
  const fpsStats = getConsolidationStats(fpsTxs);
  const combinedRecords = bacsStats.records + fpsStats.records;

  const bacsExecutionDate = dates.bacs.date;
  const fpsExecutionDate = dates.fps.date;
  const debitAccount = formatLloydsDebitAccount(debtor.debtorSortCode, debtor.debtorAccountNumber);
  const debitReference = sanitizeReference(debtor.categoryPurpose, LLOYDS_DEBIT_REFERENCE_MAX);

  const bacsFileName = `Lloyds_BACS_pain001_${bacsExecutionDate.replace(/-/g, '')}.xml`;
  const fpsFileName = `Lloyds_FPS_pain001_${fpsExecutionDate.replace(/-/g, '')}.xml`;

  const activeBatch: LloydsBatchValidation = activeTab === 'BACS' ? bacsBatch : fpsBatch;
  const activeContent = activeTab === 'BACS' ? bacsXml : fpsXml;
  const activeFileName = activeTab === 'BACS' ? bacsFileName : fpsFileName;
  const activeCount = activeTab === 'BACS' ? bacsTxs.length : fpsTxs.length;
  const activeAmount = activeTab === 'BACS' ? bacsAmount : fpsAmount;
  const activeStats = activeTab === 'BACS' ? bacsStats : fpsStats;
  const activeErrors = activeBatch.issues.filter((i) => i.level === 'error');
  const activeWarnings = activeBatch.issues.filter((i) => i.level === 'warning');
  const canDownloadActive = activeCount > 0 && !activeBatch.hasErrors;
  const exportableCount =
    (bacsTxs.length > 0 && !bacsBatch.hasErrors ? 1 : 0) + (fpsTxs.length > 0 && !fpsBatch.hasErrors ? 1 : 0);

  const handleCopy = async () => {
    if (!activeContent) return;
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportMessage('Copy failed: your browser blocked clipboard access. Use Download instead.');
    }
  };

  const handleDownloadActive = () => {
    if (!canDownloadActive) return;
    downloadFile(activeFileName, activeContent, 'application/xml');
  };

  // Process the two XML file downloads separately; batches with errors are skipped and reported
  const handleExportAllBatchFiles = () => {
    const skipped: string[] = [];
    let downloadedCount = 0;

    if (bacsTxs.length > 0) {
      if (bacsBatch.hasErrors) {
        skipped.push('BACS');
      } else {
        downloadFile(bacsFileName, bacsXml, 'application/xml');
        downloadedCount++;
      }
    }

    if (fpsTxs.length > 0) {
      if (fpsBatch.hasErrors) {
        skipped.push('FPS');
      } else if (downloadedCount > 0) {
        setTimeout(() => {
          downloadFile(fpsFileName, fpsXml, 'application/xml');
        }, 350);
        downloadedCount++;
      } else {
        downloadFile(fpsFileName, fpsXml, 'application/xml');
        downloadedCount++;
      }
    }

    setExportMessage(
      skipped.length > 0
        ? `${skipped.join(' and ')} not downloaded: fix the errors listed for ${skipped.length > 1 ? 'those files' : 'that file'} first.`
        : ''
    );
    if (downloadedCount > 0) {
      setExportedAll(true);
      setTimeout(() => setExportedAll(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Lloyds Bulk Payments Export Hub
              </h2>
              <p className="text-xs text-slate-500">
                ISO 20022 <code className="font-mono text-slate-700">pain.001.001.03</code> XML for Commercial Banking Online (CBO)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            title="Close window"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Debtor Profile Bar: Provides combined total of Lloyds XML batches */}
        <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-y-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center space-x-1.5 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">Debtor:</span>
                <span className="font-mono font-bold text-slate-900">{debitAccount}</span>
                <span className="text-slate-500">({debtor.debtorName})</span>
                <span className="text-slate-500" title="Debit account reference (CtgyPurp) shown on our own statement">
                  Ref: <span className="font-mono font-semibold text-slate-900">{debitReference || '—'}</span>
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5" title="Lloyds Faster Payments execution date">
                  <Calendar className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-slate-500">FPS Date:</span>
                  <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">{fpsExecutionDate}</span>
                </div>
                <div
                  className="flex items-center space-x-1.5"
                  title={dates.bacs.reason || 'Lloyds BACS execution date (at least 3 UK banking days ahead)'}
                >
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-slate-500">BACS Date:</span>
                  <span className="font-mono font-semibold text-blue-900 whitespace-nowrap">{bacsExecutionDate}</span>
                  {dates.bacs.adjusted && (
                    <span className="text-[10px] text-amber-700 font-sans font-semibold">(moved forward)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Total of Lloyds batches under Debtor */}
            <div className="flex items-center space-x-2 text-xs font-mono pt-0.5">
              <span className="text-slate-500 font-sans font-medium">Export Batches Combined:</span>
              <span className="font-bold text-slate-900">
                {combinedTotalCount} payments to export
                {combinedRecords !== combinedTotalCount && (
                  <span className="text-violet-700"> ({combinedRecords} records, {combinedRecords - combinedTotalCount} merged)</span>
                )}
              </span>
              <span>·</span>
              <span className="font-bold text-emerald-700">
                {formatGBP(combinedTotalAmount)}
              </span>
              <span className="text-slate-400 text-[11px] font-sans">
                (BACS: {bacsTxs.length} · FPS: {fpsTxs.length})
              </span>
            </div>
          </div>

          {/* Export All Batch Files Button (downloads both XML files separately) */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportAllBatchFiles}
              disabled={exportableCount === 0}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold shadow-xs transition ${
                exportableCount > 0
                  ? exportedAll
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="Download Lloyds BACS and FPS XML files separately"
            >
              {exportedAll ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Download className="w-3.5 h-3.5" />}
              <span>{exportedAll ? 'Downloaded Both Files' : 'Export All Batch Files'}</span>
            </button>
          </div>
        </div>

        {/* Compact Batch Summary as a tab selector (2 Rails: BACS and FPS with equal 1px small outline) */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* BACS Selector */}
            <button
              onClick={() => setActiveTab('BACS')}
              className={`p-3 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                activeTab === 'BACS'
                  ? 'bg-blue-50/80 border-blue-600 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Lloyds BACS XML</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    UKBACS · ReqdExctnDt: {bacsExecutionDate}
                    {bacsBatch.hasErrors && <span className="text-red-600 font-sans font-semibold"> · errors</span>}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-blue-900">{formatGBP(bacsAmount)}</div>
                <div className="text-[10px] text-slate-500">{describePaymentCount(bacsStats)}</div>
              </div>
            </button>

            {/* FPS Selector (Red Theme) */}
            <button
              onClick={() => setActiveTab('FasterPay')}
              className={`p-3 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                activeTab === 'FasterPay'
                  ? 'bg-red-50/80 border-red-600 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Lloyds FPS XML</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    FPS Instant · ReqdExctnDt: {fpsExecutionDate}
                    {fpsBatch.hasErrors && <span className="text-red-600 font-sans font-semibold"> · errors</span>}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-red-900">{formatGBP(fpsAmount)}</div>
                <div className="text-[10px] text-slate-500">{describePaymentCount(fpsStats)}</div>
              </div>
            </button>
          </div>
        </div>

        {/* Toolbar: Toggle Code Window & Download XML button */}
        <div className="px-6 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-slate-400">File:</span>
            <span className="text-emerald-400 font-bold">
              {activeFileName}
            </span>
            <span>·</span>
            <span title="NbOfTxs in the file">{describePaymentCount(activeStats)}</span>
            <span>·</span>
            <span>{formatGBP(activeAmount)}</span>
          </div>

          <div className="flex items-center space-x-2">
            {isCodeOpen && activeContent && (
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy XML'}</span>
              </button>
            )}

            {/* Expand / Close Code Window Button (defaults to closed) */}
            <button
              onClick={() => setIsCodeOpen(!isCodeOpen)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer font-medium"
              title={isCodeOpen ? 'Close code preview window' : 'Expand code preview window'}
            >
              {isCodeOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Close Preview</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expand Preview</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Validation results: errors block the download, warnings show what will be changed */}
        {activeBatch.issues.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-200 bg-white max-h-48 overflow-y-auto text-xs space-y-1">
            {activeErrors.map((issue, i) => (
              <div key={`e-${i}`} className="flex items-start gap-1.5 text-red-700">
                <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{issue.payeeName}:</strong> {issue.message}
                </span>
              </div>
            ))}
            {activeWarnings.map((issue, i) => (
              <div key={`w-${i}`} className="flex items-start gap-1.5 text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{issue.payeeName}:</strong> {issue.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Code Window: Placed below the batch summary, collapsible */}
        {isCodeOpen && activeContent ? (
          <div className="p-6 flex-1 overflow-y-auto bg-slate-900 text-slate-200 max-h-72">
            <pre className="text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed text-slate-300 selection:bg-emerald-500 selection:text-black">
              {activeContent}
            </pre>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 flex-1 flex flex-col justify-center items-center text-center gap-1">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
              {activeCount === 0 ? (
                <span>No payments assigned to this rail.</span>
              ) : activeBatch.hasErrors ? (
                <>
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span>
                    {activeErrors.length} error(s) must be fixed in the source file before this batch can be exported.
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {activeCount} payments validated for{' '}
                    {activeTab === 'BACS'
                      ? 'Lloyds BACS Direct Credit (UKBACS)'
                      : 'Lloyds Faster Payments (FPS Instant)'}
                    {activeWarnings.length > 0 ? ` with ${activeWarnings.length} change(s) noted above.` : '.'}
                  </span>
                </>
              )}
            </div>
            {exportMessage && <div className="text-xs text-red-700 font-semibold">{exportMessage}</div>}
          </div>
        )}

        {/* Modal Footer: Download button stays synchronized with active file and state */}
        <div className="p-4 px-6 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            <span>Selected for {activeTab}: </span>
            <strong className="text-slate-800">{describePaymentCount(activeStats)} · {formatGBP(activeAmount)}</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadActive}
              disabled={!canDownloadActive}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition ${
                canDownloadActive
                  ? activeTab === 'FasterPay'
                    ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                    : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                Download {activeTab === 'BACS' ? 'Lloyds BACS XML' : 'Lloyds FPS XML'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
