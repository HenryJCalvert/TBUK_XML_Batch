import { PaymentRail, PaymentTransaction, SourcePaymentRecord } from '../types/payment';
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
  paidSeparately: number; // Identical records the operator chose to pay as separate payments
}

export function getConsolidationStats(transactions: PaymentTransaction[]): ConsolidationStats {
  const records = transactions.reduce((sum, t) => sum + sourceRecordCount(t), 0);
  return {
    payments: transactions.length,
    records,
    consolidatedPayments: transactions.filter(isConsolidated).length,
    recordsMerged: records - transactions.length,
    paidSeparately: transactions.filter((t) => t.paidSeparately).length,
  };
}

/** e.g. "46 payments (48 records, 2 merged)" or "46 payments" when nothing was merged. */
export function describePaymentCount(stats: ConsolidationStats): string {
  const base = `${stats.payments} payment${stats.payments === 1 ? '' : 's'}`;
  return stats.recordsMerged > 0 ? `${base} (${stats.records} records, ${stats.recordsMerged} merged)` : base;
}

type RailForAmount = (amount: number) => PaymentRail;

const sumPence = (amounts: number[]) => amounts.reduce((sum, a) => sum + Math.round(a * 100), 0) / 100;

/** Payments that are part of a group of identical records and can be merged/split by the operator. */
export function isConsolidationGroupMember(tx: PaymentTransaction): boolean {
  return !!tx.consolidationKey;
}

/** The separately-paid payments that belong to the same identical-record group as `tx`. */
export function getGroupMembers(transactions: PaymentTransaction[], tx: PaymentTransaction): PaymentTransaction[] {
  if (!tx.consolidationKey) return [tx];
  return transactions.filter((t) => t.consolidationKey === tx.consolidationKey);
}

/**
 * Pays a consolidated payment as separate payments, one per source record, in its place in the list.
 * A manually chosen rail is kept; otherwise each payment's rail comes from its own amount.
 */
export function splitConsolidatedPayment(
  transactions: PaymentTransaction[],
  txId: string,
  railForAmount: RailForAmount
): PaymentTransaction[] {
  const index = transactions.findIndex((t) => t.id === txId);
  const tx = transactions[index];
  if (!tx || sourceRecordCount(tx) < 2) return transactions;

  const parts: PaymentTransaction[] = tx.sourceRecords.map((record) => ({
    ...tx,
    id: `${tx.id}-r${record.rowNumber}`,
    sortCode: record.sortCode,
    accountNumber: record.accountNumber,
    payeeName: record.payeeName,
    payeeReference: record.payeeReference,
    amount: record.amount,
    sourceRecords: [record],
    paidSeparately: true,
    assignedRail: tx.isManualOverride ? tx.assignedRail : railForAmount(record.amount),
    o4bBatchNumber: undefined,
    o4bBatchCommitted: undefined,
  }));
  return [...transactions.slice(0, index), ...parts, ...transactions.slice(index + 1)];
}

/**
 * Merges the separately-paid payments of an identical-record group back into one payment,
 * placed where the first of them was. The rail comes from the combined amount unless every
 * part was manually moved to the same rail.
 */
export function mergeConsolidationGroup(
  transactions: PaymentTransaction[],
  txId: string,
  railForAmount: RailForAmount
): PaymentTransaction[] {
  const tx = transactions.find((t) => t.id === txId);
  if (!tx || !tx.consolidationKey) return transactions;
  const members = getGroupMembers(transactions, tx);
  if (members.length < 2) return transactions;

  const records = members.flatMap((m) => m.sourceRecords).sort((a, b) => a.rowNumber - b.rowNumber);
  const amount = sumPence(records.map((r) => r.amount));
  const manualRails = new Set(members.filter((m) => m.isManualOverride).map((m) => m.assignedRail));
  const keepManual = manualRails.size === 1 && members.every((m) => m.isManualOverride);
  const first = members[0];

  const merged: PaymentTransaction = {
    ...first,
    id: first.id.replace(/-r\d+$/, ''),
    sortCode: records[0].sortCode,
    accountNumber: records[0].accountNumber,
    payeeName: records[0].payeeName,
    payeeReference: records[0].payeeReference,
    amount,
    sourceRecords: records,
    paidSeparately: false,
    assignedRail: keepManual ? first.assignedRail : railForAmount(amount),
    isManualOverride: keepManual,
    o4bBatchNumber: undefined,
    o4bBatchCommitted: undefined,
  };

  const memberIds = new Set(members.map((m) => m.id));
  const result: PaymentTransaction[] = [];
  transactions.forEach((t) => {
    if (!memberIds.has(t.id)) result.push(t);
    else if (t.id === first.id) result.push(merged);
  });
  return result;
}
