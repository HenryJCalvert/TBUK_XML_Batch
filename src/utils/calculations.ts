import { PaymentTransaction, PaymentRail, RailSummary, GlobalSummary, FeeSchedule, DEFAULT_FEE_SCHEDULE } from '../types/payment';

export const RAIL_FEES: FeeSchedule = { ...DEFAULT_FEE_SCHEDULE };

export const getRailDetails = (fees: FeeSchedule = RAIL_FEES) => ({
  O4B: {
    name: 'O4B (Order for Business / Open Banking)',
    code: 'O4B' as PaymentRail,
    fee: fees.O4B,
    settlement: 'Instant Account-to-Account',
    description: 'Zero processing fee rail. Real-time bank transfer for lower amount disbursements.',
  },
  BACS: {
    name: 'BACS Direct Credit',
    code: 'BACS' as PaymentRail,
    fee: fees.BACS,
    settlement: '3 Business Days (Standard)',
    description: `£${fees.BACS.toFixed(2)} / tx. Established high-volume UK bulk clearing system via Lloyds.`,
  },
  FasterPay: {
    name: 'Faster Payments (FPS)',
    code: 'FasterPay' as PaymentRail,
    fee: fees.FasterPay,
    settlement: 'Near-Instant (24/7/365)',
    description: `£${fees.FasterPay.toFixed(2)} / tx. Real-time high-priority clearing through Lloyds Commercial Banking Online.`,
  },
});

export const RAIL_DETAILS = getRailDetails(RAIL_FEES);

export function calculateSummaries(
  transactions: PaymentTransaction[],
  profitMarginPercent: number = 0.025,
  fees: FeeSchedule = RAIL_FEES
): GlobalSummary {
  const marginMultiplier = profitMarginPercent / 100;
  const totalCount = transactions.length;
  const totalAmount = transactions.reduce((acc, t) => acc + t.amount, 0);

  const initRailSummary = (rail: PaymentRail, label: string): RailSummary => ({
    rail,
    label,
    count: 0,
    countPercent: 0,
    totalAmount: 0,
    amountPercent: 0,
    totalFees: 0,
    feePerPayment: fees[rail],
    marginRevenue: 0,
    netProfit: 0,
    effectiveFeePercent: 0,
  });

  const rails: Record<PaymentRail, RailSummary> = {
    O4B: initRailSummary('O4B', `O4B (Instant £${fees.O4B.toFixed(2)})`),
    BACS: initRailSummary('BACS', `BACS Direct Credit (£${fees.BACS.toFixed(2)})`),
    FasterPay: initRailSummary('FasterPay', `FPS (£${fees.FasterPay.toFixed(2)})`),
  };

  transactions.forEach((tx) => {
    const rail = tx.assignedRail;
    const summary = rails[rail];
    if (summary) {
      summary.count += 1;
      summary.totalAmount += tx.amount;
      summary.totalFees += summary.feePerPayment;
      const txMargin = tx.amount * marginMultiplier;
      summary.marginRevenue += txMargin;
    }
  });

  let totalFees = 0;
  let totalMarginRevenue = 0;

  (Object.keys(rails) as PaymentRail[]).forEach((railKey) => {
    const item = rails[railKey];
    item.countPercent = totalCount > 0 ? (item.count / totalCount) * 100 : 0;
    item.amountPercent = totalAmount > 0 ? (item.totalAmount / totalAmount) * 100 : 0;
    item.netProfit = item.marginRevenue - item.totalFees;
    item.effectiveFeePercent = item.totalAmount > 0 ? (item.totalFees / item.totalAmount) * 100 : 0;

    totalFees += item.totalFees;
    totalMarginRevenue += item.marginRevenue;
  });

  return {
    totalCount,
    totalAmount,
    totalFees,
    totalMarginRevenue,
    netProfit: totalMarginRevenue - totalFees,
    averageFeePerPayment: totalCount > 0 ? totalFees / totalCount : 0,
    rails,
  };
}
