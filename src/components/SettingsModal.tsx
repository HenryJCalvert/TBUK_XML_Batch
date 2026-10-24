import React, { useEffect, useState } from 'react';
import {
  DebtorConfig,
  FeeSchedule,
  DEFAULT_FEE_SCHEDULE,
  RailTimeConfig,
  DEFAULT_RAIL_TIME_CONFIG,
} from '../types/payment';
import { calculateBacsEarliestExecutionDate } from '../utils/ukBankingCalendar';
import { Settings, Save, X, RotateCcw, CreditCard, Clock } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtor: DebtorConfig;
  onSaveDebtor: (config: DebtorConfig) => void;
  profitMarginPercent: number;
  onSaveProfitMargin: (margin: number) => void;
  feeSchedule: FeeSchedule;
  onSaveFeeSchedule: (fees: FeeSchedule) => void;
  railTimeConfig?: RailTimeConfig;
  onSaveRailTimeConfig?: (config: RailTimeConfig) => void;
  consolidateIdentical?: boolean;
  onSaveConsolidateIdentical?: (value: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  debtor,
  onSaveDebtor,
  profitMarginPercent,
  onSaveProfitMargin,
  feeSchedule,
  onSaveFeeSchedule,
  railTimeConfig,
  onSaveRailTimeConfig,
  consolidateIdentical = true,
  onSaveConsolidateIdentical,
}) => {
  const [form, setForm] = useState<DebtorConfig>({ ...debtor });
  const [margin, setMargin] = useState<number>(profitMarginPercent);
  const [fees, setFees] = useState<FeeSchedule>({ ...feeSchedule });
  const [consolidate, setConsolidate] = useState<boolean>(consolidateIdentical);
  const [times, setTimes] = useState<RailTimeConfig>({
    ...(railTimeConfig || DEFAULT_RAIL_TIME_CONFIG),
  });

  // Re-sync the form each time the modal opens, so it reflects resets and changes made elsewhere
  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...debtor });
    setMargin(profitMarginPercent);
    setFees({ ...feeSchedule });
    setTimes({ ...(railTimeConfig || DEFAULT_RAIL_TIME_CONFIG) });
    setConsolidate(consolidateIdentical);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const earliestBacsDate = calculateBacsEarliestExecutionDate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDebtor(form);
    onSaveProfitMargin(margin);
    onSaveFeeSchedule(fees);
    onSaveRailTimeConfig?.(times);
    if (consolidate !== consolidateIdentical) onSaveConsolidateIdentical?.(consolidate);
    onClose();
  };

  const handleResetFees = () => {
    setFees({ ...DEFAULT_FEE_SCHEDULE });
  };

  const handleResetTimes = () => {
    setTimes({ ...DEFAULT_RAIL_TIME_CONFIG });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Treasury &amp; Debtor Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Debtor bank account details, fee schedules, time schedules, and XML parameters
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Consolidation of identical payment records */}
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-violet-200 bg-violet-50/50">
            <div>
              <label htmlFor="consolidate-identical" className="block text-xs font-semibold text-slate-800 cursor-pointer">
                Consolidate identical payments
              </label>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Records with the same payee name, sort code, account number and payment reference are paid as one
                payment for the combined amount. Changing this re-imports the CSV and clears ticks and O4B batches.
              </p>
            </div>
            <button
              id="consolidate-identical"
              type="button"
              role="switch"
              aria-checked={consolidate}
              onClick={() => setConsolidate(!consolidate)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition cursor-pointer ${
                consolidate ? 'bg-violet-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  consolidate ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Debtor Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="debtor-sort-code"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Debtor Sort Code
              </label>
              <input
                id="debtor-sort-code"
                type="text"
                value={form.debtorSortCode}
                onChange={(e) => setForm({ ...form, debtorSortCode: e.target.value })}
                placeholder="30-14-40"
                pattern="\d{2}-?\d{2}-?\d{2}"
                title="6-digit sort code, e.g. 30-14-40"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
                required
              />
            </div>

            <div>
              <label
                htmlFor="debtor-account-no"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Debtor Account Number
              </label>
              <input
                id="debtor-account-no"
                type="text"
                value={form.debtorAccountNumber}
                onChange={(e) => setForm({ ...form, debtorAccountNumber: e.target.value })}
                placeholder="14438260"
                pattern="\d{8}"
                inputMode="numeric"
                title="8-digit account number"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="debtor-company-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Debtor / Remitter Entity Name
            </label>
            <input
              id="debtor-company-name"
              type="text"
              value={form.debtorName}
              onChange={(e) => setForm({ ...form, debtorName: e.target.value })}
              placeholder="TRYBOOKING UK LIMITED"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-slate-900 font-semibold text-slate-900"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="category-purpose"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Debt Acc Ref (CtgyPurp)
              </label>
              <input
                id="category-purpose"
                type="text"
                value={form.categoryPurpose}
                onChange={(e) => setForm({ ...form, categoryPurpose: e.target.value })}
                placeholder="TRYBOOKING PAYOUTS"
                maxLength={18}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-slate-900 font-mono font-bold text-slate-900"
                required
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Reference on our own statement, max 18 characters (e.g. TRYBOOKING PAYOUTS)
              </p>
            </div>

            <div>
              <label
                htmlFor="execution-date"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                FPS Payment Date (ReqdExctnDt)
              </label>
              <input
                id="execution-date"
                type="date"
                value={form.executionDate}
                onChange={(e) => setForm({ ...form, executionDate: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
                required
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Past dates are moved to today when exporting
              </p>
            </div>

            <div>
              <label
                htmlFor="bacs-execution-date"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                BACS Payment Date (optional)
              </label>
              <input
                id="bacs-execution-date"
                type="date"
                value={form.bacsExecutionDate || ''}
                min={earliestBacsDate}
                onChange={(e) => setForm({ ...form, bacsExecutionDate: e.target.value || undefined })}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Blank uses the earliest date ({earliestBacsDate}); 3 UK banking days, skipping weekends and bank holidays
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="message-id-prefix"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Message ID Prefix (MsgId)
              </label>
              <input
                id="message-id-prefix"
                type="text"
                value={form.messageIdPrefix}
                onChange={(e) => setForm({ ...form, messageIdPrefix: e.target.value })}
                placeholder="COMMERCIAL BANKING ONLINE"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
                required
              />
            </div>

            <div>
              <label
                htmlFor="payment-info-id"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Payment Info ID (PmtInfId)
              </label>
              <input
                id="payment-info-id"
                type="text"
                value={form.paymentInfoId}
                onChange={(e) => setForm({ ...form, paymentInfoId: e.target.value })}
                placeholder="1"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-slate-900"
                required
              />
            </div>
          </div>

          {/* Configurable Processing Fee Schedules */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <CreditCard className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  Processing Fee Schedules
                </span>
                <span className="text-[10px] text-slate-400 font-mono">(clearing rate / tx)</span>
              </div>
              <button
                type="button"
                onClick={handleResetFees}
                className="flex items-center space-x-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer"
                title="Reset standard fees (£0.00 O4B, £0.25 BACS, £0.50 FPS)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Standard Fees</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {/* O4B Fee */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <label
                  htmlFor="fee-o4b"
                  className="block text-[11px] font-semibold text-emerald-800 mb-1"
                >
                  O4B (£ / tx)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2.5 text-xs text-slate-400 font-mono">£</span>
                  <input
                    id="fee-o4b"
                    type="number"
                    step={0.01}
                    min={0}
                    max={10}
                    value={fees.O4B}
                    onChange={(e) =>
                      setFees({ ...fees, O4B: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded focus:outline-emerald-500 text-slate-900"
                    required
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Open Banking</div>
              </div>

              {/* BACS Fee */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <label
                  htmlFor="fee-bacs"
                  className="block text-[11px] font-semibold text-blue-800 mb-1"
                >
                  BACS (£ / tx)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2.5 text-xs text-slate-400 font-mono">£</span>
                  <input
                    id="fee-bacs"
                    type="number"
                    step={0.01}
                    min={0}
                    max={10}
                    value={fees.BACS}
                    onChange={(e) =>
                      setFees({ ...fees, BACS: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded focus:outline-blue-500 text-slate-900"
                    required
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">3-Day Clearing</div>
              </div>

              {/* FPS Fee */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <label
                  htmlFor="fee-fps"
                  className="block text-[11px] font-semibold text-red-800 mb-1"
                >
                  FPS (£ / tx)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-2.5 text-xs text-slate-400 font-mono">£</span>
                  <input
                    id="fee-fps"
                    type="number"
                    step={0.01}
                    min={0}
                    max={10}
                    value={fees.FasterPay}
                    onChange={(e) =>
                      setFees({ ...fees, FasterPay: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full pl-6 pr-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded focus:outline-red-500 text-slate-900"
                    required
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Faster Payments</div>
              </div>
            </div>
          </div>

          {/* Target Profit Margin Basis */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <div>
                <label
                  htmlFor="settings-profit-margin"
                  className="block text-xs font-bold text-slate-800"
                >
                  Target Profit Margin Basis (%)
                </label>
                <p className="text-[10px] text-slate-500">
                  Basis for gross margin revenue and break-even clearing thresholds
                </p>
              </div>
              <div className="flex items-center space-x-1.5">
                <input
                  id="settings-profit-margin"
                  type="number"
                  step={0.001}
                  min={0.001}
                  max={5.0}
                  value={margin}
                  onChange={(e) => setMargin(Math.max(0.001, Number(e.target.value)))}
                  className="w-24 px-2 py-1 text-xs font-mono font-bold text-right border border-slate-300 rounded focus:outline-emerald-500 text-slate-900 bg-white"
                  required
                />
                <span className="text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>
            <div className="text-[10px] text-emerald-700 font-medium font-mono">
              Reported to 3 decimal places in audit reports: {margin.toFixed(3)}%
            </div>
          </div>

          {/* Configurable Operator Processing Time Schedules */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">
                  Processing Time Schedules &amp; Hourly Labor Cost
                </span>
                <span className="text-[10px] text-slate-400 font-mono">(operator effort)</span>
              </div>
              <button
                type="button"
                onClick={handleResetTimes}
                className="flex items-center space-x-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium transition cursor-pointer"
                title="Reset standard processing times and hourly cost (£25/hr, 2m setup, 2m BACS, 2m FPS, 30s O4B)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Standard Times</span>
              </button>
            </div>

            {/* Cost per hour for payment and batch processing */}
            <div className="bg-slate-100/70 p-3 rounded-lg border border-slate-300/80 mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <label
                  htmlFor="settings-cost-per-hour"
                  className="block text-xs font-bold text-slate-900"
                >
                  Cost per Hour for Payment &amp; Batch Processing (£/hr)
                </label>
                <p className="text-[10px] text-slate-500">
                  Operator staff rate applied to batch setup, bulk uploads, and manual O4B authorizations
                </p>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs text-slate-600 font-mono font-bold">£</span>
                <input
                  id="settings-cost-per-hour"
                  type="number"
                  step={0.5}
                  min={0}
                  max={500}
                  value={times.costPerHour}
                  onChange={(e) =>
                    setTimes({
                      ...times,
                      costPerHour: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-24 px-2.5 py-1 text-xs font-mono font-bold text-right border border-slate-300 rounded focus:outline-slate-900 text-slate-900 bg-white shadow-2xs"
                  required
                />
                <span className="text-xs text-slate-500 font-mono">/ hr</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Holistic Session & 1st Batch Setup */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <label
                  htmlFor="settings-time-setup"
                  className="block text-[11px] font-semibold text-slate-800 mb-1"
                >
                  Portal Setup (mins)
                </label>
                <input
                  id="settings-time-setup"
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  value={times.sessionSetupMinutes}
                  onChange={(e) =>
                    setTimes({
                      ...times,
                      sessionSetupMinutes: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded focus:outline-slate-700 text-slate-900 text-right"
                  required
                />
                <div className="text-[10px] text-slate-400 mt-1">Holistic 1st batch</div>
              </div>

              {/* BACS Time */}
              <div className="bg-white p-2.5 rounded-lg border border-blue-200 bg-blue-50/20">
                <label
                  htmlFor="settings-time-bacs"
                  className="block text-[11px] font-semibold text-blue-800 mb-1"
                >
                  BACS (mins / batch)
                </label>
                <input
                  id="settings-time-bacs"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={times.bacsMinutesPerBatch}
                  onChange={(e) =>
                    setTimes({
                      ...times,
                      bacsMinutesPerBatch: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-2 py-1 text-xs font-mono font-bold border border-blue-300 rounded focus:outline-blue-500 text-slate-900 text-right"
                  required
                />
                <div className="text-[10px] text-blue-600 font-medium mt-1">Biased (£0.25)</div>
              </div>

              {/* FPS Time */}
              <div className="bg-white p-2.5 rounded-lg border border-red-200 bg-red-50/20">
                <label
                  htmlFor="settings-time-fps"
                  className="block text-[11px] font-semibold text-red-800 mb-1"
                >
                  FPS (mins / batch)
                </label>
                <input
                  id="settings-time-fps"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={times.fpsMinutesPerBatch}
                  onChange={(e) =>
                    setTimes({
                      ...times,
                      fpsMinutesPerBatch: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-2 py-1 text-xs font-mono font-bold border border-red-300 rounded focus:outline-red-500 text-slate-900 text-right"
                  required
                />
                <div className="text-[10px] text-slate-400 mt-1">Bulk XML upload</div>
              </div>

              {/* O4B Time */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <label
                  htmlFor="settings-time-o4b"
                  className="block text-[11px] font-semibold text-emerald-800 mb-1"
                >
                  O4B (secs / tx)
                </label>
                <input
                  id="settings-time-o4b"
                  type="number"
                  min={1}
                  max={300}
                  step={1}
                  value={times.o4bSecondsPerPayment}
                  onChange={(e) =>
                    setTimes({
                      ...times,
                      o4bSecondsPerPayment: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-full px-2 py-1 text-xs font-mono font-bold border border-slate-300 rounded focus:outline-emerald-500 text-slate-900 text-right"
                  required
                />
                <div className="text-[10px] text-slate-400 mt-1">Single auth per tx</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 italic">
              Holistic setup applies once when batching. Each bulk batch upload takes configured time. BACS is economically biased (£0.25 vs £0.50). Hourly labor is factored into net margins.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
