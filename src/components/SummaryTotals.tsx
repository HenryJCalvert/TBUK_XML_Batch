import React from 'react';
import { GlobalSummary, ThresholdLimits, PaymentRail, FeeSchedule, DEFAULT_FEE_SCHEDULE } from '../types/payment';
import { ArrowUpRight, TrendingUp, CreditCard, Clock, Zap, ShieldCheck } from 'lucide-react';

interface SummaryTotalsProps {
  summary: GlobalSummary;
  limits: ThresholdLimits;
  profitMarginPercent: number;
  onFilterRail?: (rail: PaymentRail) => void;
  activeFilter?: PaymentRail | 'ALL';
  feeSchedule?: FeeSchedule;
}

export const SummaryTotals: React.FC<SummaryTotalsProps> = ({
  summary,
  limits,
  profitMarginPercent,
  onFilterRail,
  activeFilter = 'ALL',
  feeSchedule,
}) => {
  const fees: FeeSchedule = feeSchedule || DEFAULT_FEE_SCHEDULE;
  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  return (
    <div className="space-y-4">
      {/* Top Level Aggregate KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="col-span-1 border-r border-slate-100 pr-3">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Total Batch Value
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {formatGBP(summary.totalAmount)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {summary.totalCount} payments to make
          </div>
        </div>

        <div className="col-span-1 border-r border-slate-100 pr-3">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Aggregate Processing Fees
          </div>
          <div className="text-xl font-bold text-rose-600 mt-1 font-mono tabular-nums">
            {formatGBP(summary.totalFees)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Avg {formatGBP(summary.averageFeePerPayment)} / tx
          </div>
        </div>

        <div className="col-span-1 border-r border-slate-100 pr-3">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Gross Margin</span>
            <span className="text-[11px] text-emerald-600 font-mono">
              {profitMarginPercent.toFixed(3)}%
            </span>
          </div>
          <div className="text-xl font-bold text-slate-800 mt-1 font-mono tabular-nums">
            {formatGBP(summary.totalMarginRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Configurable revenue base
          </div>
        </div>

        <div className="col-span-1 border-r border-slate-100 pr-3">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Net Profit (Margin - Fees)
          </div>
          <div
            className={`text-xl font-bold mt-1 font-mono tabular-nums ${
              summary.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {formatGBP(summary.netProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {summary.totalMarginRevenue > 0
              ? `${((summary.netProfit / summary.totalMarginRevenue) * 100).toFixed(1)}% margin retained`
              : '0%'}
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 flex flex-col justify-center">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Fee as % of Volume
          </div>
          <div className="text-xl font-bold text-slate-700 mt-1 font-mono tabular-nums">
            {summary.totalAmount > 0
              ? `${((summary.totalFees / summary.totalAmount) * 100).toFixed(3)}%`
              : '0.000%'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Effective clearing drag
          </div>
        </div>
      </div>

      {/* 3 Windows / Payment Tiers Detailed Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier 1: O4B */}
        <div
          onClick={() => onFilterRail && onFilterRail('O4B')}
          className={`cursor-pointer transition rounded-xl p-4 border bg-white relative overflow-hidden ${
            activeFilter === 'O4B'
              ? 'border-emerald-500 shadow-xs bg-emerald-50/20'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500"></div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-900 text-sm">O4B</span>
                <span className="text-xs text-slate-400">· Open Banking</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Initial limit: &lt; {formatGBP(limits.o4bLimit)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                £{fees.O4B.toFixed(2)} / tx
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">Zero Processing Fee</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Payments Count</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {summary.rails.O4B.count}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({summary.rails.O4B.countPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Amount</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {formatGBP(summary.rails.O4B.totalAmount)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Aggregate Tier Fees:</span>
            <span className="font-bold text-emerald-600 font-mono">£0.00 (100% saved)</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-slate-500">Net Profit @ {profitMarginPercent}%:</span>
            <span className="font-semibold text-slate-800 font-mono">
              {formatGBP(summary.rails.O4B.netProfit)}
            </span>
          </div>
        </div>

        {/* Tier 2: BACS */}
        <div
          onClick={() => onFilterRail && onFilterRail('BACS')}
          className={`cursor-pointer transition rounded-xl p-4 border bg-white relative overflow-hidden ${
            activeFilter === 'BACS'
              ? 'border-blue-500 shadow-xs bg-blue-50/20'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-900 text-sm">BACS</span>
                <span className="text-xs text-slate-400">· Direct Credit</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Limits: {formatGBP(limits.o4bLimit)} to &lt; {formatGBP(limits.bacsLimit)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                £{fees.BACS.toFixed(2)} / tx
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">3-Day Clearing Cycle</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Payments Count</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {summary.rails.BACS.count}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({summary.rails.BACS.countPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Amount</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {formatGBP(summary.rails.BACS.totalAmount)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Aggregate Tier Fees:</span>
            <span className="font-bold text-rose-600 font-mono">
              {formatGBP(summary.rails.BACS.totalFees)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-slate-500">Net Profit @ {profitMarginPercent}%:</span>
            <span
              className={`font-semibold font-mono ${
                summary.rails.BACS.netProfit >= 0 ? 'text-slate-800' : 'text-rose-600'
              }`}
            >
              {formatGBP(summary.rails.BACS.netProfit)}
            </span>
          </div>
        </div>

        {/* Tier 3: FPS (Faster Payments - Red Theme) */}
        <div
          onClick={() => onFilterRail && onFilterRail('FasterPay')}
          className={`cursor-pointer transition rounded-xl p-4 border bg-white relative overflow-hidden ${
            activeFilter === 'FasterPay'
              ? 'border-red-500 shadow-xs bg-red-50/20'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-900 text-sm">FPS</span>
                <span className="text-xs text-slate-400">· Faster Payments</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Limits: ≥ {formatGBP(limits.bacsLimit)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                £{fees.FasterPay.toFixed(2)} / tx
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">Instant Real-Time Payout</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Payments Count</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {summary.rails.FasterPay.count}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({summary.rails.FasterPay.countPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Amount</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                {formatGBP(summary.rails.FasterPay.totalAmount)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Aggregate Tier Fees:</span>
            <span className="font-bold text-rose-600 font-mono">
              {formatGBP(summary.rails.FasterPay.totalFees)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-slate-500">Net Profit @ {profitMarginPercent}%:</span>
            <span
              className={`font-semibold font-mono ${
                summary.rails.FasterPay.netProfit >= 0 ? 'text-slate-800' : 'text-rose-600'
              }`}
            >
              {formatGBP(summary.rails.FasterPay.netProfit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
