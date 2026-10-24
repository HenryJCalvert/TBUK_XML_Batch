/**
 * UK sort code and account number handling for Lloyds BACS / Faster Payments files.
 *
 * Lloyds pain.001 files need exactly 6 digits for the payee sort code (<MmbId>) and exactly
 * 8 digits for the payee account number (<CdtrAcct><Id><Othr><Id>). Values are never cut down
 * to fit: dropping or changing a digit can send money to someone else's account without the
 * bank rejecting it. Only lossless conversions (restoring or removing leading zeros) are applied,
 * and they are always reported so the operator can confirm them.
 */

export type BankDetailStatus = 'valid' | 'converted' | 'invalid';

export interface NormalisedBankDetail {
  value: string; // 6/8-digit value to export; empty when invalid
  status: BankDetailStatus;
  raw: string; // As imported
  digitCount: number;
  message?: string; // Why it was converted or rejected
}

const SEPARATORS = /[\s\-.]/g;

export function normaliseSortCode(sortCode: string): NormalisedBankDetail {
  const raw = (sortCode ?? '').trim();
  const compact = raw.replace(SEPARATORS, '');
  const digitCount = compact.replace(/\D/g, '').length;

  if (!compact) {
    return { value: '', status: 'invalid', raw, digitCount, message: 'Sort code is missing' };
  }
  if (/\D/.test(compact)) {
    return { value: '', status: 'invalid', raw, digitCount, message: `Sort code "${raw}" contains characters other than digits` };
  }
  if (compact.length === 6) {
    return { value: compact, status: 'valid', raw, digitCount };
  }
  if (compact.length === 5) {
    // Spreadsheets drop the leading zero of sort codes such as 01-30-99
    const value = compact.padStart(6, '0');
    return {
      value,
      status: 'converted',
      raw,
      digitCount,
      message: `Sort code "${raw}" has 5 digits; leading zero restored as ${formatSortCode(value)}`,
    };
  }
  return { value: '', status: 'invalid', raw, digitCount, message: `Sort code "${raw}" must be 6 digits (has ${compact.length})` };
}

export function normaliseAccountNumber(accountNumber: string): NormalisedBankDetail {
  const raw = (accountNumber ?? '').trim();
  const compact = raw.replace(SEPARATORS, '');
  const digitCount = compact.replace(/\D/g, '').length;

  if (!compact) {
    return { value: '', status: 'invalid', raw, digitCount, message: 'Account number is missing' };
  }
  if (/\D/.test(compact)) {
    // Letters usually mean a building society roll number, which is not an account number
    return {
      value: '',
      status: 'invalid',
      raw,
      digitCount,
      message: `Account number "${raw}" contains letters or symbols (building society roll number?)`,
    };
  }
  if (compact.length === 8) {
    return { value: compact, status: 'valid', raw, digitCount };
  }
  if (compact.length === 9 && compact.startsWith('0')) {
    // The source export pads account numbers to 9 characters with a leading zero
    const value = compact.slice(1);
    return {
      value,
      status: 'converted',
      raw,
      digitCount,
      message: `Account number "${raw}" is zero-padded to 9 digits; sent as ${value}`,
    };
  }
  if (compact.length === 6 || compact.length === 7) {
    // UK convention: shorter account numbers are prefixed with zeros to make 8 digits
    const value = compact.padStart(8, '0');
    return {
      value,
      status: 'converted',
      raw,
      digitCount,
      message: `Account number "${raw}" has ${compact.length} digits; padded to ${value}. Confirm with the payee`,
    };
  }
  if (compact.length === 10) {
    return {
      value: '',
      status: 'invalid',
      raw,
      digitCount,
      message: `Account number "${raw}" has 10 digits; ask the payee for the 8-digit account number their bank uses for BACS/FPS`,
    };
  }
  return {
    value: '',
    status: 'invalid',
    raw,
    digitCount,
    message: `Account number "${raw}" must be 8 digits (has ${compact.length})`,
  };
}

/** Display format "01-30-99". Falls back to the raw value when it can't be normalised. */
export function formatSortCode(sortCode: string): string {
  const { value } = normaliseSortCode(sortCode);
  if (!value) return sortCode;
  return `${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
}

/** Lloyds debit account format "SSSSSS-AAAAAAAA" used in <DbtrAcct><Id><Othr><Id>. */
export function formatLloydsDebitAccount(sortCode: string, accountNumber: string): string {
  return `${(sortCode ?? '').replace(/\D/g, '')}-${(accountNumber ?? '').replace(/\D/g, '')}`;
}

// Indicative bank by the first two digits of the sort code. Many ranges are shared or have been
// reassigned, so this is a display hint only — it is not a substitute for checking with the payee.
const SORT_CODE_PREFIX_BANKS: Array<[number, number, string]> = [
  [1, 1, 'NatWest'],
  [4, 4, 'Monzo / Revolut / e-money'],
  [7, 7, 'Nationwide'],
  [8, 8, 'Co-operative Bank'],
  [9, 9, 'Santander UK'],
  [11, 11, 'Halifax'],
  [12, 12, 'Bank of Scotland'],
  [16, 16, 'Royal Bank of Scotland'],
  [20, 29, 'Barclays'],
  [30, 39, 'Lloyds Bank'],
  [40, 49, 'HSBC UK'],
  [50, 62, 'NatWest'],
  [72, 72, 'Santander UK'],
  [77, 77, 'Lloyds Bank / TSB'],
  [80, 81, 'Bank of Scotland'],
  [82, 82, 'Clydesdale / Virgin Money'],
  [83, 83, 'Royal Bank of Scotland'],
  [87, 87, 'TSB'],
  [90, 99, 'Northern Ireland / Irish bank'],
];

export function getBankNameFromSortCode(sortCode: string): string {
  const { value } = normaliseSortCode(sortCode);
  if (!value) return 'Invalid sort code';
  const prefix = parseInt(value.slice(0, 2), 10);
  const match = SORT_CODE_PREFIX_BANKS.find(([from, to]) => prefix >= from && prefix <= to);
  return match ? match[2] : 'UK bank';
}
