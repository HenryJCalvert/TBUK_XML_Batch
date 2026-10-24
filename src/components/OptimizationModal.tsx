import React, { useState } from 'react';
import {
  PaymentTransaction,
  ThresholdLimits,
  OptimizationSettings,
  FeeSchedule,
  RailTimeConfig,
  DEFAULT_RAIL_TIME_CONFIG,
} from '../types/payment';
import { runBalancedOptimization, formatDuration } from '../utils/optimizer';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Scale,
  X,
  TrendingUp,
  Percent,
  RotateCcw,
  Clock,
  Zap,
  Timer,
} from 'lucide-react';

interface OptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: PaymentTransaction[];
  currentLimits: ThresholdLimits;
  profitMarginPercent: number;
  onApplyOptimization: (
    optimizedTxs: PaymentTransaction[],
    newLimits: ThresholdLimits,
    newMargin: number
  ) => void;
  feeSchedule?: FeeSchedule;
  railTimeConfig?: RailTimeConfig;
  onSaveRailTimeConfig?: (config: RailTimeConfig) => void;
}

export const OptimizationModal: React.FC<OptimizationModalProps> = ({
  isOpen,
  onClose,
  transactions,
  currentLimits,
  profitMarginPercent,
  onApplyOptimization,
  feeSchedule,
  railTimeConfig,
  onSaveRailTimeConfig,
}) => {
  const fees: FeeSchedule = feeSchedule || { O4B: 0.0, BACS: 0.25, FasterPay: 0.5 };
  const [margin, setMargin] = useState(profitMarginPercent || 0.025);
  const [maxO4bShare, setMaxO4bShare] = useState(30);
  const [minBacsShare, setMinBacsShare] = useState(55); // BACS biased due to 50% cost advantage (£0.25 vs £0.50)
  const [minFasterPayShare, setMinFasterPayShare] = useState(15);
  const [syncSliders, setSyncSliders] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Rail Time Config & Cost per hour are provided by central Settings
  const railTimes: RailTimeConfig = railTimeConfig || DEFAULT_RAIL_TIME_CONFIG;

  if (!isOpen) return null;

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  const settings: OptimizationSettings = {
    profitMarginPercent: margin,
    maxO4bSharePercent: maxO4bShare,
    minBacsSharePercent: minBacsShare,
    minFasterPaySharePercent: minFasterPayShare,
    highValueThreshold: 1000,
    prioritizeUrgentForHighValue: true,
  };

  const result = runBalancedOptimization(transactions, currentLimits, settings, fees, railTimes);

  // Double click O4B slider goal seeks to 25 O4B Payments Tx Counts
  const handleGoalSeek25O4b = () => {
    if (transactions.length === 0) return;
    const targetCount = Math.min(25, transactions.length);
    let bestShare = maxO4bShare;
    let minDiff = Infinity;

    for (let s = 5; s <= 85; s += 1) {
      const testSettings: OptimizationSettings = {
        profitMarginPercent: margin,
        maxO4bSharePercent: s,
        minBacsSharePercent: minBacsShare,
        minFasterPaySharePercent: minFasterPayShare,
        highValueThreshold: 1000,
        prioritizeUrgentForHighValue: true,
      };
      const testRes = runBalancedOptimization(transactions, currentLimits, testSettings, fees, railTimes);
      const count = testRes.summaryAfter.rails.O4B.count;
      const diff = Math.abs(count - targetCount);
      if (diff < minDiff) {
        minDiff = diff;
        bestShare = s;
        if (diff === 0) break;
      }
    }
    setMaxO4bShare(bestShare);
    setStatusMessage(`Goal Seek Applied: Max O4B Cap set to ${bestShare}% (${targetCount} O4B Txs)`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Maximise Net Margin solver: finds the parameter allocation that maximizes Net Margin (Gross Margin - Fees - Processing Labor Cost)
  const handleMaximiseNetMargin = () => {
    if (transactions.length === 0) return;
    let bestNetProfit = -Infinity;
    let bestShare = maxO4bShare;
    let bestBacsShare = minBacsShare;
    let bestFpsShare = minFasterPayShare;

    // Sweep across practical allocation bounds, heavily testing BACS priority
    for (let o4b = 10; o4b <= 45; o4b += 2) {
      for (let fps = 10; fps <= 30; fps += 5) {
        const bacs = Math.max(35, 100 - o4b - fps);
        const testSettings: OptimizationSettings = {
          profitMarginPercent: margin,
          maxO4bSharePercent: o4b,
          minBacsSharePercent: bacs,
          minFasterPaySharePercent: fps,
          highValueThreshold: 1000,
          prioritizeUrgentForHighValue: true,
        };
        const testRes = runBalancedOptimization(transactions, currentLimits, testSettings, fees, railTimes);
        const hasO4b = testRes.summaryAfter.rails.O4B.count > 0;
        const hasBacs = testRes.summaryAfter.rails.BACS.count > 0;
        const hasFps = testRes.summaryAfter.rails.FasterPay.count > 0;
        if ((hasO4b && hasBacs && hasFps) || transactions.length < 3) {
          if (testRes.netProfitAfter > bestNetProfit) {
            bestNetProfit = testRes.netProfitAfter;
            bestShare = o4b;
            bestBacsShare = bacs;
            bestFpsShare = fps;
          }
        }
      }
    }

    setMaxO4bShare(bestShare);
    setMinBacsShare(bestBacsShare);
    setMinFasterPayShare(bestFpsShare);
    setStatusMessage(`Maximised Net Margin: ${formatGBP(bestNetProfit)} (BACS: ${bestBacsShare}%)`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Maximise Time solver: minimizes operator processing time by leveraging bulk BACS & FPS files.
  // Strongly biased to BACS because both BACS and FPS take the exact same batch upload time,
  // but BACS saves 50% in fees (£0.25 vs £0.50 FPS).
  const handleMaximiseTime = () => {
    if (transactions.length === 0) return;
    let minTimeMinutes = Infinity;
    let bestNetProfit = -Infinity;
    let bestO4b = maxO4bShare;
    let bestBacs = minBacsShare;
    let bestFps = minFasterPayShare;
    let bestSavedMins = 0;

    // Minimise operator duration by keeping manual single O4B approvals low (0-15%).
    // Allocate the bulk to BACS and high-value to FPS.
    for (let o4b = 0; o4b <= 15; o4b += 2) {
      for (let fps = 10; fps <= 25; fps += 5) {
        const bacs = Math.max(55, 100 - o4b - fps);
        const testSettings: OptimizationSettings = {
          profitMarginPercent: margin,
          maxO4bSharePercent: o4b,
          minBacsSharePercent: bacs,
          minFasterPaySharePercent: fps,
          highValueThreshold: 1000,
          prioritizeUrgentForHighValue: true,
        };
        const testRes = runBalancedOptimization(transactions, currentLimits, testSettings, fees, railTimes);
        if (testRes.netProfitAfter >= 0 || transactions.length < 3) {
          // Primary criterion: minimum time; Secondary criterion: maximum net profit (favors BACS cost benefit)
          if (
            testRes.timeAfter.totalMinutes < minTimeMinutes - 0.01 ||
            (Math.abs(testRes.timeAfter.totalMinutes - minTimeMinutes) <= 0.05 && testRes.netProfitAfter > bestNetProfit)
          ) {
            minTimeMinutes = testRes.timeAfter.totalMinutes;
            bestNetProfit = testRes.netProfitAfter;
            bestO4b = o4b;
            bestBacs = bacs;
            bestFps = fps;
            bestSavedMins = testRes.timeSavedMinutes;
          }
        }
      }
    }

    setMaxO4bShare(bestO4b);
    setMinBacsShare(bestBacs);
    setMinFasterPayShare(bestFps);
    setStatusMessage(
      `Maximised Time (BACS Biased): Fastest ${formatDuration(minTimeMinutes)} (saved ${formatDuration(bestSavedMins)}, ${formatGBP(bestNetProfit)} net)`
    );
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Optimal Net / Time solver: maximizes Net Margin per unit of Operator Processing Time (£ / min)
  // Heavily leverages BACS's lower £0.25 fee structure over FPS (£0.50) to maximize yield per minute
  const handleOptimalNetTime = () => {
    if (transactions.length === 0) return;
    let bestYield = -Infinity;
    let bestO4b = maxO4bShare;
    let bestBacs = minBacsShare;
    let bestFps = minFasterPayShare;
    let bestNetProfit = 0;
    let bestDuration = 0;

    for (let o4b = 5; o4b <= 35; o4b += 2) {
      for (let fps = 10; fps <= 25; fps += 5) {
        const bacs = Math.max(45, 100 - o4b - fps);
        const testSettings: OptimizationSettings = {
          profitMarginPercent: margin,
          maxO4bSharePercent: o4b,
          minBacsSharePercent: bacs,
          minFasterPaySharePercent: fps,
          highValueThreshold: 1000,
          prioritizeUrgentForHighValue: true,
        };
        const testRes = runBalancedOptimization(transactions, currentLimits, testSettings, fees, railTimes);
        const mins = testRes.timeAfter.totalMinutes;
        const net = testRes.netProfitAfter;
        if (mins > 0 && net > 0) {
          const yieldPerMin = net / mins;
          if (yieldPerMin > bestYield) {
            bestYield = yieldPerMin;
            bestO4b = o4b;
            bestBacs = bacs;
            bestFps = fps;
            bestNetProfit = net;
            bestDuration = mins;
          }
        }
      }
    }

    if (bestYield > -Infinity) {
      setMaxO4bShare(bestO4b);
      setMinBacsShare(bestBacs);
      setMinFasterPayShare(bestFps);
      setStatusMessage(
        `Optimal Net / Time (BACS Biased): £${bestYield.toFixed(2)}/min (${formatGBP(bestNetProfit)} in ${formatDuration(bestDuration)})`
      );
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  // Reset to default configuration (BACS biased)
  const handleResetDefaults = () => {
    setMargin(0.025);
    setMaxO4bShare(30);
    setMinBacsShare(55);
    setMinFasterPayShare(15);
    setSyncSliders(true);
    setStatusMessage('Parameters reset to default values (BACS biased).');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleApply = () => {
    onSaveRailTimeConfig?.(railTimes);
    onApplyOptimization(
      result.optimizedTransactions,
      syncSliders ? result.recommendedLimits : currentLimits,
      margin
    );
    onClose();
  };

  const bacsBreakEven = fees.BACS > 0 ? fees.BACS / (margin / 100) : 1000;
  const fpsBreakEven = fees.FasterPay > 0 ? fees.FasterPay / (margin / 100) : 2000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[min(96vw,80rem)] max-h-[94dvh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Payment Fee &amp; Margin Optimisation Engine
              </h2>
              <p className="text-xs text-slate-500">
                Minimises transaction fees and operator time while ensuring positive net margin yields
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

        <div className="p-6 space-y-5">
          {/* Action Ribbon: Solvers for Net Margin, Time, Optimal Net/Time, and Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100/90 border border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleMaximiseNetMargin}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg shadow-xs transition cursor-pointer"
                title="Automatically calculate parameters to achieve the maximum possible net margin"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                <span>Maximise Net Margin</span>
              </button>

              <button
                type="button"
                onClick={handleMaximiseTime}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg shadow-xs transition cursor-pointer"
                title="Minimizes operator processing time by batching payments into rapid BACS & FPS bulk files"
              >
                <Clock className="w-3.5 h-3.5 text-blue-700" />
                <span>Maximise Time</span>
              </button>

              <button
                type="button"
                onClick={handleOptimalNetTime}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-xs transition cursor-pointer"
                title="Finds the optimal sweet spot maximizing Net Margin per minute of operator processing"
              >
                <Zap className="w-3.5 h-3.5 text-amber-700" />
                <span>Optimal Net / Time</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition cursor-pointer shadow-2xs"
                title="Reset margin to 0.025% and restore default parameters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            </div>

            {statusMessage && (
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-pulse">
                {statusMessage}
              </span>
            )}
          </div>

          {/* Processing Time Schedules Tile (Operator Effort & Processing Labor Cost) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Timer className="w-4 h-4 text-slate-700" />
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>Transaction Processing Time Schedules</span>
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                      £{railTimes.costPerHour.toFixed(2)} / hr rate
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Operator processing effort &amp; labor costs (configured centrally in Settings)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Scheduled Effort &amp; Labor Cost</div>
                <div className="text-xs font-mono font-bold text-slate-800">
                  {result.timeAfter.formattedTotal} · <span className="text-emerald-700 font-semibold">£{result.timeAfter.processingCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 4 Rail Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Holistic Portal Login & 1st Batch Setup */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      Portal Login &amp; Setup
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Holistic</span>
                  </div>
                  <div className="text-base font-bold font-mono text-slate-900">
                    {formatDuration(result.timeAfter.sessionSetupMinutes)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Labor: <span className="font-semibold text-slate-800">£{result.timeAfter.sessionSetupCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-100">
                  Config: {railTimes.sessionSetupMinutes}m first batch setup
                </div>
              </div>

              {/* BACS Bulk Upload */}
              <div className="bg-white p-3 rounded-lg border border-blue-200 bg-blue-50/20 flex flex-col justify-between shadow-2xs">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-blue-900 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      BACS Bulk Upload
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1 rounded">Biased</span>
                  </div>
                  <div className="text-base font-bold font-mono text-blue-900">
                    {formatDuration(result.timeAfter.bacsMinutes)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Labor: <span className="font-semibold text-blue-800">£{result.timeAfter.bacsCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 pt-1 border-t border-blue-100">
                  {result.summaryAfter.rails.BACS.count} txs · {railTimes.bacsMinutesPerBatch}m/batch
                </div>
              </div>

              {/* FPS Bulk Upload */}
              <div className="bg-white p-3 rounded-lg border border-red-200 bg-red-50/20 flex flex-col justify-between shadow-2xs">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-red-900 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-600"></span>
                      FPS Bulk Upload
                    </span>
                    <span className="text-[10px] text-red-600 font-mono">Instant</span>
                  </div>
                  <div className="text-base font-bold font-mono text-red-900">
                    {formatDuration(result.timeAfter.fpsMinutes)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Labor: <span className="font-semibold text-red-800">£{result.timeAfter.fpsCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 pt-1 border-t border-red-100">
                  {result.summaryAfter.rails.FasterPay.count} txs · {railTimes.fpsMinutesPerBatch}m/batch
                </div>
              </div>

              {/* O4B Single Tx Approvals */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200 bg-emerald-50/20 flex flex-col justify-between shadow-2xs">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold text-emerald-900 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      O4B Approvals
                    </span>
                    <span className="text-[10px] text-emerald-700 font-mono">Manual</span>
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-900">
                    {formatDuration(result.timeAfter.o4bMinutes)}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Labor: <span className="font-semibold text-emerald-800">£{result.timeAfter.o4bCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 pt-1 border-t border-emerald-100">
                  {result.summaryAfter.rails.O4B.count} txs × {railTimes.o4bSecondsPerPayment}s/tx
                </div>
              </div>
            </div>

            {/* Overall Schedule & Cost Rollup */}
            <div className="flex flex-wrap items-center justify-between text-xs bg-white px-3 py-2 rounded-lg border border-slate-200 gap-2">
              <div className="flex items-center space-x-2 text-slate-600">
                <span className="font-semibold text-slate-700">Financial Rollup:</span>
                <span>Operational Costs:</span>
                <span className="font-mono font-bold text-slate-900">£{result.totalCostsAfter.toFixed(2)}</span>
                <span className="text-[11px] text-slate-500">(Rail Fees: £{result.summaryAfter.totalFees.toFixed(2)} + Labor: £{result.timeAfter.processingCost.toFixed(2)})</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-emerald-700 font-semibold font-mono text-xs">
                  Labor Savings: £{result.processingCostSavings.toFixed(2)}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500 text-[11px]">
                  Configured in Settings
                </span>
              </div>
            </div>
          </div>

          {/* Configuration Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            {/* Profit Margin Control */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="config-profit-margin"
                  className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                >
                  <Percent className="w-3.5 h-3.5 text-emerald-600" />
                  Configurable Profit Margin
                </label>
                <div className="flex items-center space-x-1">
                  <input
                    id="config-profit-margin"
                    type="number"
                    step={0.005}
                    min={0.005}
                    max={1.0}
                    value={margin}
                    onChange={(e) => setMargin(Math.max(0.005, Number(e.target.value)))}
                    className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-right border border-slate-300 rounded bg-white text-slate-900"
                  />
                  <span className="text-xs font-mono text-slate-500">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0.005}
                max={0.15}
                step={0.005}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>0.005%</span>
                <span className="text-emerald-700 font-semibold">Current: {margin.toFixed(3)}%</span>
                <span>0.150%</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                At {margin.toFixed(3)}%, break-even is{' '}
                <span className="font-semibold text-slate-700">£{bacsBreakEven.toFixed(0)}</span> for BACS and{' '}
                <span className="font-semibold text-slate-700">£{fpsBreakEven.toFixed(0)}</span> for FPS.
              </div>
            </div>

            {/* Max O4B Allocation Cap Control with Double-Click Goal Seeking */}
            <div>
              <div
                className="flex items-center justify-between mb-1.5 select-none"
                title="Double-click slider or badge to goal seek 25 O4B Payments"
              >
                <label
                  htmlFor="max-o4b-share"
                  onDoubleClick={handleGoalSeek25O4b}
                  className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5 text-blue-600" />
                  <span>Max O4B Allocation Cap</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleGoalSeek25O4b}
                    className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded font-medium border border-blue-200 transition cursor-pointer"
                    title="Goal seek to 25 O4B payments"
                  >
                    2x click = 25 Txs
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {maxO4bShare}% max
                  </span>
                </div>
              </div>
              <input
                id="max-o4b-share"
                type="range"
                min={0}
                max={80}
                step={1}
                value={maxO4bShare}
                onChange={(e) => setMaxO4bShare(Number(e.target.value))}
                onDoubleClick={handleGoalSeek25O4b}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                title="Double-click to goal seek 25 O4B payments"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>0% (Fastest Time)</span>
                <span className="text-blue-700 font-semibold">Cap: {maxO4bShare}%</span>
                <span>80% (Fee Savings)</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Double-click slider to goal-seek 25 O4B payments. Controls operator time spent on individual authorizations.
              </div>
            </div>
          </div>

          {/* Before vs After Impact Comparison (Total Costs, Profit, Time, Net/Time Rate) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">
                Total Operational Costs
              </div>
              <div className="flex items-baseline space-x-1.5 mt-1 font-mono">
                <span className="text-sm text-slate-400 line-through">
                  {formatGBP(result.totalCostsBefore)}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-lg font-bold text-emerald-600">
                  {formatGBP(result.totalCostsAfter)}
                </span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                -£{result.totalCostsSavings.toFixed(2)} ({result.totalCostsBefore > 0 ? ((result.totalCostsSavings / result.totalCostsBefore) * 100).toFixed(1) : '0.0'}% saved)
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">
                Net Profit (Margin - Costs)
              </div>
              <div className="flex items-baseline space-x-1.5 mt-1 font-mono">
                <span className="text-sm text-slate-400 line-through">
                  {formatGBP(result.netProfitBefore)}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-lg font-bold text-emerald-600">
                  {formatGBP(result.netProfitAfter)}
                </span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                +{formatGBP(result.profitImprovement)} improvement
              </div>
            </div>

            {/* Operator Processing Time */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">
                Operator Processing Time
              </div>
              <div className="flex items-baseline space-x-1.5 mt-1 font-mono">
                <span className="text-sm text-slate-400 line-through">
                  {result.timeBefore.formattedTotal}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span className="text-lg font-bold text-blue-700">
                  {result.timeAfter.formattedTotal}
                </span>
              </div>
              <div className="text-[11px] text-blue-700 font-semibold mt-0.5">
                {result.timeSavedMinutes > 0
                  ? `-${formatDuration(result.timeSavedMinutes)} (${result.timeSavedPercent.toFixed(0)}% faster · £${result.timeAfter.processingCost.toFixed(2)} labor)`
                  : `Labor: £${result.timeAfter.processingCost.toFixed(2)}`}
              </div>
            </div>

            {/* Net Margin / Time Rate */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">
                Optimal Net / Time Yield
              </div>
              <div className="text-lg font-bold text-slate-900 font-mono mt-1">
                £{result.netMarginPerMinute.toFixed(2)}
                <span className="text-xs font-normal text-slate-500 ml-1">/ min</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Rate: £{(result.netMarginPerMinute * 60).toFixed(0)} / hr net yield
              </div>
            </div>
          </div>

          {/* Allocation Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Payment Rail</th>
                  <th className="py-2.5 px-3 text-center">Unit Fee (/ tx)</th>
                  <th className="py-2.5 px-3 text-right">Txs Count</th>
                  <th className="py-2.5 px-3 text-right">Volume (£)</th>
                  <th className="py-2.5 px-3 text-right">Rail Fees</th>
                  <th className="py-2.5 px-3 text-right">Labor Cost</th>
                  <th className="py-2.5 px-3 text-right">Net Margin</th>
                  <th className="py-2.5 px-3 text-right">Operator Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    O4B (Open Banking)
                  </td>
                  <td className="py-2 px-3 text-center text-emerald-600 font-bold">£{fees.O4B.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">
                    {result.summaryAfter.rails.O4B.count} ({result.summaryAfter.rails.O4B.countPercent.toFixed(1)}%)
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatGBP(result.summaryAfter.rails.O4B.totalAmount)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-600">£0.00</td>
                  <td className="py-2 px-3 text-right text-slate-600">
                    £{result.timeAfter.o4bCost.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                    {formatGBP(result.summaryAfter.rails.O4B.marginRevenue - result.timeAfter.o4bCost)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatDuration(result.timeAfter.o4bMinutes)}
                    <span className="text-[10px] text-slate-400 font-sans ml-1">
                      ({result.summaryAfter.rails.O4B.count}×{railTimes.o4bSecondsPerPayment}s)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span>BACS Direct Credit</span>
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded ml-1">
                      Biased (£0.25)
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center text-blue-600 font-bold">£{fees.BACS.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">
                    {result.summaryAfter.rails.BACS.count} ({result.summaryAfter.rails.BACS.countPercent.toFixed(1)}%)
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatGBP(result.summaryAfter.rails.BACS.totalAmount)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatGBP(result.summaryAfter.rails.BACS.totalFees)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-600">
                    £{result.timeAfter.bacsCost.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-800">
                    {formatGBP(result.summaryAfter.rails.BACS.marginRevenue - result.summaryAfter.rails.BACS.totalFees - result.timeAfter.bacsCost)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatDuration(result.timeAfter.bacsMinutes)}
                    <span className="text-[10px] text-slate-400 font-sans ml-1">
                      ({result.summaryAfter.rails.BACS.count > 0 ? `1 batch @ ${railTimes.bacsMinutesPerBatch}m` : '0m'})
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                    FPS (£{fees.FasterPay.toFixed(2)})
                  </td>
                  <td className="py-2 px-3 text-center text-red-600 font-bold">£{fees.FasterPay.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">
                    {result.summaryAfter.rails.FasterPay.count} ({result.summaryAfter.rails.FasterPay.countPercent.toFixed(1)}%)
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatGBP(result.summaryAfter.rails.FasterPay.totalAmount)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatGBP(result.summaryAfter.rails.FasterPay.totalFees)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-600">
                    £{result.timeAfter.fpsCost.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-800">
                    {formatGBP(result.summaryAfter.rails.FasterPay.marginRevenue - result.summaryAfter.rails.FasterPay.totalFees - result.timeAfter.fpsCost)}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatDuration(result.timeAfter.fpsMinutes)}
                    <span className="text-[10px] text-slate-400 font-sans ml-1">
                      ({result.summaryAfter.rails.FasterPay.count > 0 ? `1 batch @ ${railTimes.fpsMinutesPerBatch}m` : '0m'})
                    </span>
                  </td>
                </tr>
                {result.timeAfter.sessionSetupMinutes > 0 && (
                  <tr className="bg-slate-50/50 text-slate-600">
                    <td className="py-2 px-3 font-sans text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                      <span>Portal Login &amp; 1st Batch Setup</span>
                      <span className="text-[9px] font-semibold text-slate-600 bg-slate-200/80 px-1 py-0.5 rounded ml-1">
                        Holistic
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-400">-</td>
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                    <td className="py-2 px-3 text-right text-slate-400">£0.00</td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      £{result.timeAfter.sessionSetupCost.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      -£{result.timeAfter.sessionSetupCost.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700 font-semibold">
                      {formatDuration(result.timeAfter.sessionSetupMinutes)}
                      <span className="text-[10px] text-slate-400 font-sans ml-1">
                        (first batch setup)
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100/80 font-mono font-bold text-slate-900 border-t border-slate-200">
                <tr>
                  <td className="py-2 px-3 font-sans">Total Operational Allocation</td>
                  <td className="py-2 px-3 text-center text-slate-500 font-normal">
                    avg £{result.summaryAfter.averageFeePerPayment.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right">{result.summaryAfter.totalCount}</td>
                  <td className="py-2 px-3 text-right">{formatGBP(result.summaryAfter.totalAmount)}</td>
                  <td className="py-2 px-3 text-right text-slate-800">{formatGBP(result.summaryAfter.totalFees)}</td>
                  <td className="py-2 px-3 text-right text-blue-800">{formatGBP(result.timeAfter.processingCost)}</td>
                  <td className="py-2 px-3 text-right text-emerald-700">{formatGBP(result.netProfitAfter)}</td>
                  <td className="py-2 px-3 text-right text-blue-800">{result.timeAfter.formattedTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Logic Details */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-600">
            <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Optimization Strategy Highlights
            </div>
            {result.details.map((d, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>{d}</span>
              </div>
            ))}
          </div>

          {/* Sync Sliders Option */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              id="sync-sliders"
              type="checkbox"
              checked={syncSliders}
              onChange={(e) => setSyncSliders(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="sync-sliders" className="text-xs text-slate-700 cursor-pointer font-medium">
              Also align interactive slider limits to recommended thresholds (£{result.recommendedLimits.o4bLimit} / £{result.recommendedLimits.bacsLimit})
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center space-x-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply Balanced Optimization</span>
          </button>
        </div>
      </div>
    </div>
  );
};
