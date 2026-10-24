import React, { useState } from 'react';
import { PaymentTransaction, DebtorConfig, PaymentRail } from '../types/payment';
import {
  generateLloydsBacsXml,
  generateLloydsFasterPaymentsXml,
  calculateBacsEarliestExecutionDate,
  downloadFile,
} from '../utils/xmlGenerator';
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
  // Code window set to closed at beginning as requested
  const [isCodeOpen, setIsCodeOpen] = useState(false);

  if (!isOpen) return null;

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Filter batches for Lloyds BACS and FPS
  const bacsTxs = transactions.filter((t) => t.assignedRail === 'BACS');
  const fpsTxs = transactions.filter((t) => t.assignedRail === 'FasterPay');

  const bacsAmount = bacsTxs.reduce((s, t) => s + t.amount, 0);
  const fpsAmount = fpsTxs.reduce((s, t) => s + t.amount, 0);
  const combinedTotalCount = bacsTxs.length + fpsTxs.length;
  const combinedTotalAmount = bacsAmount + fpsAmount;

  // BACS requires at least 3 business working days ahead; FPS is same-day
  const bacsExecutionDate = debtor.bacsExecutionDate || calculateBacsEarliestExecutionDate(debtor.executionDate);
  const fpsExecutionDate = debtor.executionDate;

  const bacsXml = generateLloydsBacsXml(bacsTxs, debtor, bacsExecutionDate);
  const fpsXml = generateLloydsFasterPaymentsXml(fpsTxs, debtor);

  const activeContent = activeTab === 'BACS' ? bacsXml : fpsXml;
  const activeCount = activeTab === 'BACS' ? bacsTxs.length : fpsTxs.length;
  const activeAmount = activeTab === 'BACS' ? bacsAmount : fpsAmount;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActive = () => {
    if (activeTab === 'BACS') {
      const bacsDateStr = bacsExecutionDate.replace(/-/g, '');
      downloadFile(`Lloyds_BACS_pain001_${bacsDateStr}.xml`, bacsXml, 'application/xml');
    } else {
      const fpsDateStr = fpsExecutionDate.replace(/-/g, '');
      downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
    }
  };

  // Process the two XML file downloads separately
  const handleExportAllBatchFiles = () => {
    const bacsDateStr = bacsExecutionDate.replace(/-/g, '');
    const fpsDateStr = fpsExecutionDate.replace(/-/g, '');
    let downloadedCount = 0;

    if (bacsTxs.length > 0) {
      downloadFile(`Lloyds_BACS_pain001_${bacsDateStr}.xml`, bacsXml, 'application/xml');
      downloadedCount++;
    }

    if (fpsTxs.length > 0) {
      if (downloadedCount > 0) {
        setTimeout(() => {
          downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
        }, 350);
      } else {
        downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
      }
      downloadedCount++;
    }

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
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">Debtor:</span>
                <span className="font-mono font-bold text-slate-900">
                  {debtor.debtorSortCode}-{debtor.debtorAccountNo}
                </span>
                <span className="text-slate-500">({debtor.debtorName})</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5" title="Lloyds Faster Payments execution date">
                  <Calendar className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-slate-500">FPS Date:</span>
                  <span className="font-mono font-semibold text-slate-900">{fpsExecutionDate}</span>
                </div>
                <div className="flex items-center space-x-1.5" title="Lloyds BACS execution date (at least 3 banking working days ahead)">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-slate-500">BACS Date:</span>
                  <span className="font-mono font-semibold text-blue-900">{bacsExecutionDate}</span>
                  <span className="text-[10px] text-blue-600 font-sans">(+3d)</span>
                </div>
              </div>
            </div>

            {/* Total of Lloyds batches under Debtor */}
            <div className="flex items-center space-x-2 text-xs font-mono pt-0.5">
              <span className="text-slate-500 font-sans font-medium">Export Batches Combined:</span>
              <span className="font-bold text-slate-900">
                {combinedTotalCount} selected payments
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
              disabled={combinedTotalCount === 0}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold shadow-xs transition ${
                combinedTotalCount > 0
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
                    UKBACS · ReqdExctnDt: {bacsExecutionDate} (+3d)
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-blue-900">{formatGBP(bacsAmount)}</div>
                <div className="text-[10px] text-slate-500">{bacsTxs.length} selected</div>
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
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-red-900">{formatGBP(fpsAmount)}</div>
                <div className="text-[10px] text-slate-500">{fpsTxs.length} selected</div>
              </div>
            </button>
          </div>
        </div>

        {/* Toolbar: Toggle Code Window & Download XML button */}
        <div className="px-6 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-slate-400">File:</span>
            <span className="text-emerald-400 font-bold">
              {activeTab === 'BACS' ? 'Lloyds_BACS_pain001.xml' : 'Lloyds_FPS_pain001.xml'}
            </span>
            <span>·</span>
            <span>{activeCount} payments</span>
            <span>·</span>
            <span>{formatGBP(activeAmount)}</span>
          </div>

          <div className="flex items-center space-x-2">
            {isCodeOpen && (
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

        {/* Code Window: Placed below the batch summary, collapsible */}
        {isCodeOpen ? (
          <div className="p-6 flex-1 overflow-y-auto bg-slate-900 text-slate-200 max-h-72">
            <pre className="text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed text-slate-300 selection:bg-emerald-500 selection:text-black">
              {activeContent}
            </pre>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 flex-1 flex flex-col justify-center items-center text-center">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                {activeCount} selected payments ready for{' '}
                {activeTab === 'BACS'
                  ? 'Lloyds BACS Direct Credit (UKBACS)'
                  : 'Lloyds Faster Payments (FPS Instant)'}
                .
              </span>
            </div>
          </div>
        )}

        {/* Modal Footer: Download button stays synchronized with active file and state */}
        <div className="p-4 px-6 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            <span>Selected for {activeTab}: </span>
            <strong className="text-slate-800">{activeCount} payments ({formatGBP(activeAmount)})</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadActive}
              disabled={activeCount === 0}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition ${
                activeCount > 0
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
