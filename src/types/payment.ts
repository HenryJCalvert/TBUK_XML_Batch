export type PaymentRail = 'O4B' | 'BACS' | 'FasterPay';

export interface PaymentTransaction {
  id: string;
  bankCode: string; // e.g. "013099" (Sort code)
  accountNo: string; // e.g. "98679872"
  indicator: string; // e.g. ""
  transactionCode: string; // e.g. "50"
  amount: number; // e.g. 402.00
  title: string; // Beneficiary name
  lodgementRef: string; // Beneficiary reference
  bookwanaBankCode: string; // Originator bank code
  bookwanaAccountNo: string; // Originator account no
  remitterName: string; // Originator name
  assignedRail: PaymentRail;
  isManualOverride?: boolean;
  o4bBatchNumber?: number; // e.g. 1, 2, 3...
  o4bBatchCommitted?: boolean;
}

export interface O4bBatchInfo {
  batchNumber: number;
  status: 'draft' | 'committed';
  count: number;
  totalAmount: number;
  committedAt?: string;
}

export interface FeeSchedule {
  O4B: number;
  BACS: number;
  FasterPay: number;
}

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  O4B: 0.0,
  BACS: 0.25,
  FasterPay: 0.5,
};

export interface RailConfig {
  name: string;
  code: PaymentRail;
  feePerPayment: number; // £ / tx
  description: string;
  settlementTime: string;
  color: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
}

export interface ThresholdLimits {
  o4bLimit: number; // < o4bLimit -> O4B (default £100)
  bacsLimit: number; // >= o4bLimit and < bacsLimit -> BACS (default £1,000)
  // >= bacsLimit -> FasterPay
}

export interface OptimizationSettings {
  profitMarginPercent: number; // default 0.025%
  maxO4bSharePercent: number; // e.g. 30% (protect low amounts without excessive manual time)
  minBacsSharePercent: number; // e.g. 55% (biased method due to 50% cost benefit: £0.25 vs £0.50)
  minFasterPaySharePercent: number; // e.g. 15% (reserved for high value / urgent txs)
  highValueThreshold: number; // e.g. £1,000 where margin covers £0.50
  prioritizeUrgentForHighValue: boolean;
}

export interface RailTimeConfig {
  costPerHour: number; // £/hour for payment and batch processing (default: 25.00)
  o4bSecondsPerPayment: number; // default: 30 seconds per payment
  sessionSetupMinutes: number;  // default: 2 mins (holistic portal login & first batch setup)
  bacsMinutesPerBatch: number;  // default: 2 mins per batch upload
  fpsMinutesPerBatch: number;   // default: 2 mins per batch upload
}

export const DEFAULT_RAIL_TIME_CONFIG: RailTimeConfig = {
  costPerHour: 25.0, // £25.00/hr processing & operator labor cost
  o4bSecondsPerPayment: 30,
  sessionSetupMinutes: 2,
  bacsMinutesPerBatch: 2,
  fpsMinutesPerBatch: 2,
};

export interface ProcessingTimeSummary {
  o4bMinutes: number;
  sessionSetupMinutes: number;
  bacsMinutes: number;
  fpsMinutes: number;
  totalMinutes: number;
  totalSeconds: number;
  formattedTotal: string;
  costPerHour: number;
  processingCost: number; // (totalMinutes / 60) * costPerHour
  formattedProcessingCost: string;
  o4bCost: number;
  sessionSetupCost: number;
  bacsCost: number;
  fpsCost: number;
}

export interface DebtorConfig {
  debtorSortCode: string; // e.g. "30-14-40"
  debtorAccountNo: string; // e.g. "14438260"
  debtorName: string; // "TRYBOOKING UK LIMITED"
  remitterName?: string;
  categoryPurpose: string; // "TRYBOOKING PAYOUTS"
  messageIdPrefix: string; // "COMMERCIAL BANKING ONLINE"
  paymentInfoId: string; // "1"
  executionDate: string; // YYYY-MM-DD (e.g. for FPS instant clearing)
  bacsExecutionDate?: string; // YYYY-MM-DD (min +3 working days for BACS clearing)
}

export const DEFAULT_DEBTOR_CONFIG: DebtorConfig = {
  debtorSortCode: '30-14-40',
  debtorAccountNo: '14438260',
  debtorName: 'TRYBOOKING UK LIMITED',
  remitterName: 'TRYBOOKING UK LIMITED',
  categoryPurpose: 'TRYBOOKING PAYOUTS',
  messageIdPrefix: 'COMMERCIAL BANKING ONLINE',
  paymentInfoId: '1',
  executionDate: new Date().toISOString().split('T')[0],
};

export interface RailSummary {
  rail: PaymentRail;
  label: string;
  count: number;
  countPercent: number;
  totalAmount: number;
  amountPercent: number;
  totalFees: number;
  feePerPayment: number;
  marginRevenue: number;
  netProfit: number;
  effectiveFeePercent: number;
}

export interface GlobalSummary {
  totalCount: number;
  totalAmount: number;
  totalFees: number;
  totalMarginRevenue: number;
  netProfit: number;
  averageFeePerPayment: number;
  rails: Record<PaymentRail, RailSummary>;
}
