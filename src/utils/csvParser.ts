import { PaymentTransaction, PaymentRail, SourcePaymentRecord, ThresholdLimits } from '../types/payment';
import { consolidateRecords } from './consolidation';

/**
 * Standard CSV line parser that handles quotes, escaped quotes, and commas inside fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function determineRailByLimits(amount: number, limits: ThresholdLimits): PaymentRail {
  if (amount < limits.o4bLimit) {
    return 'O4B';
  } else if (amount < limits.bacsLimit) {
    return 'BACS';
  } else {
    return 'FasterPay';
  }
}

/**
 * Column aliases, matched against headers upper-cased with non-alphanumerics removed.
 * UK names come first; the TryBooking payout export still uses the Australian ABA-style
 * names (BANKCODE, ACCOUNTNO, TITLE, LODGEMENTREF), so those are accepted as aliases.
 * Originator columns in that export (BOOKWANABANKCODE, BOOKWANAACCOUNTNO, REMITTERNAME)
 * and the ABA INDICATOR / TRANSACTIONCODE columns are ignored: the debit account comes from
 * Settings, and Lloyds files carry no transaction code.
 */
const COLUMN_ALIASES = {
  sortCode: ['SORTCODE', 'PAYEESORTCODE', 'BENEFICIARYSORTCODE', 'BANKCODE'],
  accountNumber: ['ACCOUNTNUMBER', 'PAYEEACCOUNTNUMBER', 'BENEFICIARYACCOUNTNUMBER', 'ACCOUNTNO'],
  amount: ['AMOUNT', 'AMOUNTGBP'],
  payeeName: ['PAYEENAME', 'BENEFICIARYNAME', 'ACCOUNTNAME', 'NAME', 'TITLE'],
  payeeReference: ['PAYEEREFERENCE', 'BENEFICIARYREFERENCE', 'REFERENCE', 'LODGEMENTREF'],
} as const;

export const SUPPORTED_CSV_COLUMNS = COLUMN_ALIASES;

function findColumn(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Parses a GBP amount such as "1,078.25" or "£65.00". Returns NaN when it isn't a number. */
export function parseGbpAmount(value: string): number {
  const cleaned = (value || '').replace(/[£,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100) / 100;
}

export function parsePaymentCsv(csvText: string, limits: ThresholdLimits): PaymentTransaction[] {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toUpperCase().replace(/[^A-Z0-9]/g, ''));

  // Fall back to the TryBooking export column order when a header isn't recognised
  const colSortCode = findColumn(headers, COLUMN_ALIASES.sortCode);
  const colAccountNumber = findColumn(headers, COLUMN_ALIASES.accountNumber);
  const colAmount = findColumn(headers, COLUMN_ALIASES.amount);
  const colPayeeName = findColumn(headers, COLUMN_ALIASES.payeeName);
  const colPayeeReference = findColumn(headers, COLUMN_ALIASES.payeeReference);
  const pick = (cols: string[], col: number, fallbackCol: number) => (cols[col !== -1 ? col : fallbackCol] ?? '').trim();

  const records: SourcePaymentRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 3) continue;

    // Unreadable amounts become 0.00, which the Lloyds export validation rejects
    const parsedAmount = parseGbpAmount(pick(cols, colAmount, 4));

    records.push({
      rowNumber: i + 1,
      sortCode: pick(cols, colSortCode, 0),
      accountNumber: pick(cols, colAccountNumber, 1),
      amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
      payeeName: pick(cols, colPayeeName, 5),
      payeeReference: pick(cols, colPayeeReference, 6),
    });
  }

  // Identical records (payee, sort code, account number, reference) become one payment;
  // the rail is chosen from the combined amount
  const transactions = consolidateRecords(records, (group, amount) => ({
    id: `tx-${group[0].rowNumber}-${Math.random().toString(36).substring(2, 7)}`,
    sortCode: group[0].sortCode,
    accountNumber: group[0].accountNumber,
    amount,
    payeeName: group[0].payeeName.replace(/\s+/g, ' ').trim(),
    payeeReference: group[0].payeeReference.replace(/\s+/g, ' ').trim(),
    sourceRecords: group,
    assignedRail: determineRailByLimits(amount, limits),
    isManualOverride: false,
  }));

  return transactions;
}
