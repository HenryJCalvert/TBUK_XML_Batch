import { PaymentTransaction, SourcePaymentRecord } from '../types/payment';
import { normaliseSortCode, normaliseAccountNumber } from './bankLookup';

/**
 * Consolidation of identical payment records.
 *
 * Records with exactly the same payee name, sort code, account number and payment reference
 * are paid as ONE payment for the combined amount. This reduces the number of payments (and
 * per-payment fees) and avoids sending a payee several credits with the same reference.
 *
 * Matching rules:
 * - Payee name and reference: exact match, case-sensitive, after trimming and collapsing spaces
 *   (so "Arts Richmond " matches "Arts Richmond"). Different references are never merged.
 * - Sort code and account number: compared on the 6/8-digit values sent to Lloyds, so
 *   "08-92-99" matches "089299" and a zero-padded "065130096" matches "65130096".
 *   Values that can't be normalised are compared exactly as imported.
 */

const collapse = (value: string) => (value ?? '').replace(/\s+/g, ' ').trim();

export function consolidationKey(record: Pick<SourcePaymentRecord, 'payeeName' | 'sortCode' | 'accountNumber' | 'payeeReference'>): string {
  const sort = normaliseSortCode(record.sortCode).value || collapse(record.sortCode);
  const account = normaliseAccountNumber(record.accountNumber).value || collapse(record.accountNumber);
  return [collapse(record.payeeName), sort, account, collapse(record.payeeReference)].join('\u0000');
}

/** Groups identical records into payments, keeping the order in which each payee first appears. */
export function consolidateRecords(
  records: SourcePaymentRecord[],
  makePayment: (records: SourcePaymentRecord[], amount: number) => PaymentTransaction
): PaymentTransaction[] {
  const groups = new Map<string, SourcePaymentRecord[]>();
  records.forEach((record) => {
    const key = consolidationKey(record);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  });

  return Array.from(groups.values()).map((group) => {
    // Add in whole pence so £0.10 + £0.20 is exactly £0.30
    const pence = group.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
    return makePayment(group, pence / 100);
  });
}

export function sourceRecordCount(tx: PaymentTransaction): number {
  return tx.sourceRecords?.length || 1;
}

export function isConsolidated(tx: PaymentTransaction): boolean {
  return sourceRecordCount(tx) > 1;
}

export interface ConsolidationStats {
  payments: number; // Payments that will be made (one per consolidated group)
  records: number; // Source CSV records those payments cover
  consolidatedPayments: number; // Payments made up of more than one record
  recordsMerged: number; // Payments saved by consolidation (records - payments)
}

export function getConsolidationStats(transactions: PaymentTransaction[]): ConsolidationStats {
  const records = transactions.reduce((sum, t) => sum + sourceRecordCount(t), 0);
  return {
    payments: transactions.length,
    records,
    consolidatedPayments: transactions.filter(isConsolidated).length,
    recordsMerged: records - transactions.length,
  };
}

/** e.g. "46 payments (48 records, 2 merged)" or "46 payments" when nothing was merged. */
export function describePaymentCount(stats: ConsolidationStats): string {
  const base = `${stats.payments} payment${stats.payments === 1 ? '' : 's'}`;
  return stats.recordsMerged > 0 ? `${base} (${stats.records} records, ${stats.recordsMerged} merged)` : base;
}
