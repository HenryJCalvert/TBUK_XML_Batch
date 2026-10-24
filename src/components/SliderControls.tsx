import React, { useMemo } from 'react';
import { ThresholdLimits, GlobalSummary, PaymentTransaction, FeeSchedule } from '../types/payment';
import { Sliders, RotateCcw, Info, Sparkles } from 'lucide-react';

interface SliderControlsProps {
  limits: ThresholdLimits;
  onChangeLimits: (newLimits: ThresholdLimits) => void;
  summary: GlobalSummary;
  transactions: PaymentTransaction[];
  profitMarginPercent: number;
  feeSchedule?: FeeSchedule;
}

export const SliderControls: React.FC<SliderControlsProps> = ({
  limits,
  onChangeLimits,
  summary,
  transactions,
  profitMarginPercent,
  feeSchedule,
}) => {
  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);

  const formatGBPDec = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Sorted list of all transaction amounts for payment granularity
  const sortedTxAmounts = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    return [...transactions].map((t) => t.amount).sort((a, b) => a - b);
  }, [transactions]);

  // Helper: compute threshold amount at boundary index k
  const getThresholdForIndex = (k: number, sorted: number[], fallback: number): number => {
    if (sorted.length === 0) return fallback;
    if (k <= 0) {
      return Math.max(0.01, Math.round((sorted[0] - 0.01) * 100) / 100);
    }
    if (k >= sorted.length) {
      return Math.ceil(sorted[sorted.length - 1] + 1);
    }
    const prev = sorted[k - 1];
    const next = sorted[k];
    if (next > prev) {
      const mid = Math.round(((prev + next) / 2) * 100) / 100;
      return mid > prev ? mid : Math.round((prev + 0.01) * 100) / 100;
    } else {
      return Math.round((prev + 0.01) * 100) / 100;
    }
  };

  // Live counts based on current limits
  const currentO4bCount = useMemo(() => {
    if (sortedTxAmounts.length === 0) return 0;
    return sortedTxAmounts.filter((amt) => amt < limits.o4bLimit).length;
  }, [sortedTxAmounts, limits.o4bLimit]);

  const currentBacsCutoffCount = useMemo(() => {
    if (sortedTxAmounts.length === 0) return 0;
    return sortedTxAmounts.filter((amt) => amt < limits.bacsLimit).length;
  }, [sortedTxAmounts, limits.bacsLimit]);

  // Max O4B count cannot exceed transactions below bacsLimit
  const maxO4bCount = useMemo(() => {
    if (sortedTxAmounts.length === 0) return 0;
    const countBelowBacs = sortedTxAmounts.filter((amt) => amt < limits.bacsLimit).length;
    return Math.max(0, countBelowBacs);
  }, [sortedTxAmounts, limits.bacsLimit]);

  const handleO4bChange = (val: number) => {
    const clamped = Math.min(val, limits.bacsLimit - 0.01);
    onChangeLimits({
      ...limits,
      o4bLimit: Math.round(clamped * 100) / 100,
    });
  };

  const handleBacsChange = (val: number) => {
    const clamped = Math.max(val, limits.o4bLimit + 0.01);
    onChangeLimits({
      ...limits,
      bacsLimit: Math.round(clamped * 100) / 100,
    });
  };

  // Payment granularity slide handler for O4B
  const handleO4bSliderGranularChange = (k: number) => {
    if (sortedTxAmounts.length === 0) {
      handleO4bChange(k);
      return;
    }
    const targetThreshold = getThresholdForIndex(k, sortedTxAmounts, limits.o4bLimit);
    handleO4bChange(targetThreshold);
  };

  // Payment granularity slide handler for FPS (BACS upper / FPS lower cutoff)
  const handleFpsSliderGranularChange = (k: number) => {
    if (sortedTxAmounts.length === 0) {
      handleBacsChange(k);
      return;
    }
    const targetThreshold = getThresholdForIndex(k, sortedTxAmounts, limits.bacsLimit);
    handleBacsChange(targetThreshold);
  };

  // Double click O4B Upper Limit sets to 25 payment records
  const handleSetO4bTo25Records = () => {
    if (sortedTxAmounts.length === 0) return;
    let targetLimit: number;
    if (sortedTxAmounts.length <= 25) {
      targetLimit = Math.ceil(sortedTxAmounts[sortedTxAmounts.length - 1] + 1);
    } else {
      const val25 = sortedTxAmounts[24];
      const val26 = sortedTxAmounts[25];
      if (val26 > val25) {
        targetLimit = Math.round(((val25 + val26) / 2) * 100) / 100;
      } else {
        targetLimit = Math.round((val25 + 0.01) * 100) / 100;
      }
    }
    const clamped = Math.min(targetLimit, limits.bacsLimit - 0.01);
    onChangeLimits({
      ...limits,
      o4bLimit: clamped,
    });
  };

  const setPreset = (o4b: number, bacs: number) => {
    onChangeLimits({
      o4bLimit: o4b,
      bacsLimit: bacs,
    });
  };

  const marginMult = profitMarginPercent / 100;
  const bacsFee = feeSchedule?.BACS ?? 0.25;
  const fpsFee = feeSchedule?.FasterPay ?? 0.5;
  const bacsBreakEven = bacsFee > 0 && marginMult > 0 ? bacsFee / marginMult : 1000;
  const fpsBreakEven = fpsFee > 0 && marginMult > 0 ? fpsFee / marginMult : 2000;

  // Calculate Min / Max for each rail
  const o4bAmounts = transactions.filter((t) => t.assignedRail === 'O4B').map((t) => t.amount);
  const bacsAmounts = transactions.filter((t) => t.assignedRail === 'BACS').map((t) => t.amount);
  const fpsAmounts = transactions.filter((t) => t.assignedRail === 'FasterPay').map((t) => t.amount);

  const o4bMin = o4bAmounts.length > 0 ? Math.min(...o4bAmounts) : null;
  const o4bMax = o4bAmounts.length > 0 ? Math.max(...o4bAmounts) : null;
  const bacsMin = bacsAmounts.length > 0 ? Math.min(...bacsAmounts) : null;
  const bacsMax = bacsAmounts.length > 0 ? Math.max(...bacsAmounts) : null;
  const fpsMin = fpsAmounts.length > 0 ? Math.min(...fpsAmounts) : null;
  const fpsMax = fpsAmounts.length > 0 ? Math.max(...fpsAmounts) : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
      {/* Header & Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Rail Threshold Limits
            </h2>
            {sortedTxAmounts.length > 0 && (
              <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Payment Granularity Active ({sortedTxAmounts.length} steps)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Set cutoff boundary limits between O4B, BACS, and FPS. Sliders step transaction-by-transaction.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 self-start sm:self-auto text-xs">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider mr-1">
            Presets:
          </span>
          <button
            onClick={() => setPreset(100, 1000)}
            className={`px-2.5 py-1 rounded border transition font-medium text-xs cursor-pointer ${
              limits.o4bLimit === 100 && limits.bacsLimit === 1000
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Default (£100 / £1k)
          </button>
          <button
            onClick={() => setPreset(Math.round(bacsBreakEven), Math.round(fpsBreakEven))}
            className={`px-2.5 py-1 rounded border transition font-medium text-xs cursor-pointer ${
              limits.o4bLimit === Math.round(bacsBreakEven) &&
              limits.bacsLimit === Math.round(fpsBreakEven)
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Break-Even (£{Math.round(bacsBreakEven)} / £{Math.round(fpsBreakEven)})
          </button>
          <button
            onClick={() => setPreset(250, 1500)}
            className={`px-2.5 py-1 rounded border transition font-medium text-xs cursor-pointer ${
              limits.o4bLimit === 250 && limits.bacsLimit === 1500
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Balanced (£250 / £1.5k)
          </button>
        </div>
      </div>

      {/* Visual Live Distribution Bar & Min/Max Information */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span className="font-medium text-slate-700">Live Batch Volume Split</span>
          <span className="font-mono text-[11px]">
            {summary.totalCount} Payments · {formatGBP(summary.totalAmount)}
          </span>
        </div>
        <div className="h-3.5 w-full bg-slate-100 rounded overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${summary.rails.O4B.countPercent}%` }}
            className="bg-emerald-500 h-full transition-all duration-300 flex items-center justify-center text-[10px] text-white font-semibold"
          >
            {summary.rails.O4B.countPercent > 8 && `O4B ${summary.rails.O4B.countPercent.toFixed(0)}%`}
          </div>
          <div
            style={{ width: `${summary.rails.BACS.countPercent}%` }}
            className="bg-blue-500 h-full transition-all duration-300 flex items-center justify-center text-[10px] text-white font-semibold"
          >
            {summary.rails.BACS.countPercent > 8 && `BACS ${summary.rails.BACS.countPercent.toFixed(0)}%`}
          </div>
          <div
            style={{ width: `${summary.rails.FasterPay.countPercent}%` }}
            className="bg-red-600 h-full transition-all duration-300 flex items-center justify-center text-[10px] text-white font-semibold"
          >
            {summary.rails.FasterPay.countPercent > 8 && `FPS ${summary.rails.FasterPay.countPercent.toFixed(0)}%`}
          </div>
        </div>

        {/* Live Min / Max Records details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600 mt-2 px-0.5">
          <div className="bg-emerald-50/70 border border-emerald-200/70 rounded p-1.5 flex items-center justify-between">
            <span className="font-semibold text-emerald-800">
              O4B: &lt;{formatGBPDec(limits.o4bLimit)} ({summary.rails.O4B.count} Txs)
            </span>
            <span className="font-mono text-emerald-900 text-[10px]">
              Min: {o4bMin !== null ? formatGBPDec(o4bMin) : '-'} · Max: {o4bMax !== null ? formatGBPDec(o4bMax) : '-'}
            </span>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/70 rounded p-1.5 flex items-center justify-between">
            <span className="font-semibold text-blue-800">
              BACS: {formatGBPDec(limits.o4bLimit)} - {formatGBPDec(limits.bacsLimit)} ({summary.rails.BACS.count} Txs)
            </span>
            <span className="font-mono text-blue-900 text-[10px]">
              Min: {bacsMin !== null ? formatGBPDec(bacsMin) : '-'} · Max: {bacsMax !== null ? formatGBPDec(bacsMax) : '-'}
            </span>
          </div>

          <div className="bg-red-50/70 border border-red-200/70 rounded p-1.5 flex items-center justify-between">
            <span className="font-semibold text-red-800">
              FPS: ≥{formatGBPDec(limits.bacsLimit)} ({summary.rails.FasterPay.count} Txs)
            </span>
            <span className="font-mono text-red-900 text-[10px]">
              Min: {fpsMin !== null ? formatGBPDec(fpsMin) : '-'} · Max: {fpsMax !== null ? formatGBPDec(fpsMax) : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Sliders Grid with Payment Granularity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Compact Slider 1: O4B Upper Limit (with double-click to set 25 records and payment granularity) */}
        <div
          onDoubleClick={handleSetO4bTo25Records}
          title="Double-click O4B Upper Limit to auto-set threshold for 25 payment records"
          className="space-y-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-emerald-300 transition select-none"
        >
          <div className="flex items-center justify-between">
            <label
              htmlFor="o4b-limit-input"
              onDoubleClick={handleSetO4bTo25Records}
              className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
              title="Double-click to set threshold for exactly 25 payment records"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>O4B Upper Limit</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-normal">
                Double-click for 25 records
              </span>
            </label>
            <div className="flex items-center space-x-1">
              <span className="text-xs text-slate-400">£</span>
              <input
                id="o4b-limit-input"
                type="number"
                min={0}
                max={limits.bacsLimit - 0.01}
                step={sortedTxAmounts.length > 0 ? 0.01 : 5}
                value={limits.o4bLimit}
                onChange={(e) => handleO4bChange(Number(e.target.value))}
                className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-right border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500"
              />
            </div>
          </div>

          <div className="pt-0.5">
            {sortedTxAmounts.length > 0 ? (
              <input
                type="range"
                min={0}
                max={maxO4bCount}
                step={1}
                value={currentO4bCount}
                onChange={(e) => handleO4bSliderGranularChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            ) : (
              <input
                type="range"
                min={10}
                max={Math.min(2500, limits.bacsLimit - 10)}
                step={5}
                value={limits.o4bLimit}
                onChange={(e) => handleO4bChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            )}
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
              <span>{sortedTxAmounts.length > 0 ? `£${sortedTxAmounts[0].toFixed(2)} (0 txs)` : '£10'}</span>
              <span className="text-emerald-700 font-medium">
                £{limits.o4bLimit.toFixed(2)} ({summary.rails.O4B.count} txs)
              </span>
              <span>
                {sortedTxAmounts.length > 0
                  ? `£${limits.bacsLimit.toFixed(2)} (${maxO4bCount} max txs)`
                  : '£2,000'}
              </span>
            </div>
          </div>
        </div>

        {/* Compact Slider 2: FPS Lower Limit (with payment granularity and Red styling) */}
        <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 transition select-none">
          <div className="flex items-center justify-between">
            <label
              htmlFor="bacs-limit-input"
              className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              <span>FPS Lower Limit</span>
              <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.2 rounded border border-red-200 font-normal">
                Instant Real-Time
              </span>
            </label>
            <div className="flex items-center space-x-1">
              <span className="text-xs text-slate-400">£</span>
              <input
                id="bacs-limit-input"
                type="number"
                min={limits.o4bLimit + 0.01}
                max={50000}
                step={sortedTxAmounts.length > 0 ? 0.01 : 25}
                value={limits.bacsLimit}
                onChange={(e) => handleBacsChange(Number(e.target.value))}
                className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-right border border-slate-300 rounded bg-white text-slate-900 focus:outline-red-500"
              />
            </div>
          </div>

          <div className="pt-0.5">
            {sortedTxAmounts.length > 0 ? (
              <input
                type="range"
                min={currentO4bCount}
                max={sortedTxAmounts.length}
                step={1}
                value={currentBacsCutoffCount}
                onChange={(e) => handleFpsSliderGranularChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
            ) : (
              <input
                type="range"
                min={Math.max(200, limits.o4bLimit + 10)}
                max={4000}
                step={25}
                value={limits.bacsLimit}
                onChange={(e) => handleBacsChange(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
            )}
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
              <span>
                {sortedTxAmounts.length > 0
                  ? `£${limits.o4bLimit.toFixed(2)} (${sortedTxAmounts.length - currentO4bCount} max FPS)`
                  : '£200'}
              </span>
              <span className="text-red-700 font-medium">
                £{limits.bacsLimit.toFixed(2)} ({summary.rails.FasterPay.count} FPS txs)
              </span>
              <span>
                {sortedTxAmounts.length > 0
                  ? `£${sortedTxAmounts[sortedTxAmounts.length - 1].toFixed(2)} (0 FPS)`
                  : '£4,000'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
