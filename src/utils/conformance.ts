import { normaliseSortCode, normaliseAccountNumber } from './bankLookup';

/**
 * Row-level conformance checks on payment data as uploaded, used to highlight rows in the
 * rail panels. These look at the raw CSV values (before any cleaning for the Lloyds files),
 * so the operator can see exactly which source values need correcting.
 *
 * Sort codes and account numbers fail only when they can't be converted to 6 / 8 digits.
 * Lossless conversions (e.g. the zero-padded 9-digit accounts in the TryBooking export) pass
 * here and are shown separately with an amber "from …" badge.
 */

/** Characters allowed in UK Bacs/FPS payee names and references */
const BACS_CHARACTER = /[A-Za-z0-9 .&/-]/;

export const CONFORMANCE_REFERENCE_MAX = 26;
export const CONFORMANCE_AMOUNT_MAX = 250000;

export type ConformanceField = 'payeeName' | 'sortCode' | 'accountNumber' | 'payeeReference' | 'amount';

export interface ConformanceInput {
  payeeName: string;
  sortCode: string;
  accountNumber: string;
  payeeReference: string;
  amount: number;
}

/** Failure message per field; an empty object means the payment conforms. */
export type ConformanceResult = Partial<Record<ConformanceField, string>>;

export function checkConformance(input: ConformanceInput): ConformanceResult {
  const result: ConformanceResult = {};

  const name = input.payeeName ?? '';
  const nameProblems: string[] = [];
  if (!name.trim()) nameProblems.push('missing');
  if (/\s{2,}/.test(name) || name !== name.trim()) nameProblems.push('multiple spaces');
  const illegal = Array.from(new Set(Array.from(name).filter((ch) => !BACS_CHARACTER.test(ch))));
  if (illegal.length > 0) nameProblems.push(`illegal characters ${illegal.map((c) => `"${c}"`).join(' ')}`);
  if (nameProblems.length > 0) result.payeeName = `Payee name: ${nameProblems.join(', ')}`;

  if (normaliseSortCode(input.sortCode).status === 'invalid')
    result.sortCode = `Sort code "${input.sortCode}" is not 6 digits`;

  if (normaliseAccountNumber(input.accountNumber).status === 'invalid')
    result.accountNumber = `Account number "${input.accountNumber}" is not 8 digits`;

  const ref = (input.payeeReference ?? '').trim();
  if (!ref) result.payeeReference = 'Payment reference is not filled';
  else if (ref.length > CONFORMANCE_REFERENCE_MAX)
    result.payeeReference = `Payment reference is ${ref.length} characters (max ${CONFORMANCE_REFERENCE_MAX})`;

  if (!Number.isFinite(input.amount) || input.amount > CONFORMANCE_AMOUNT_MAX)
    result.amount = `Amount is over £${CONFORMANCE_AMOUNT_MAX.toLocaleString('en-GB')}`;

  return result;
}

export function conformanceMessages(result: ConformanceResult): string[] {
  return Object.values(result).filter((m): m is string => !!m);
}

/** Checks a payment and, for consolidated payments, every source record it is made from. */
export function checkPaymentConformance(payment: ConformanceInput & { sourceRecords?: ConformanceInput[] }): ConformanceResult {
  const result = checkConformance(payment);
  (payment.sourceRecords || []).forEach((record) => {
    const recordResult = checkConformance(record);
    // The amount limit applies to the combined payment, not to each record
    delete recordResult.amount;
    (Object.keys(recordResult) as ConformanceField[]).forEach((field) => {
      if (!result[field]) result[field] = recordResult[field];
    });
  });
  return result;
}
