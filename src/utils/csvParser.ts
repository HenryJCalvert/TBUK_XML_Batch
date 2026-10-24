import { PaymentTransaction, PaymentRail, ThresholdLimits } from '../types/payment';
import { cleanAccountNoForXml } from './bankLookup';

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

export function parsePaymentCsv(csvText: string, limits: ThresholdLimits): PaymentTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headerLine = parseCsvLine(lines[0]);
  const headers = headerLine.map((h) => h.toUpperCase().replace(/[^A-Z0-9]/g, ''));

  // Expected headers: BANKCODE, ACCOUNTNO, INDICATOR, TRANSACTIONCODE, AMOUNT, TITLE, LODGEMENTREF, BOOKWANABANKCODE, BOOKWANAACCOUNTNO, REMITTERNAME
  const colBankCode = headers.findIndex((h) => h.includes('BANKCODE') && !h.includes('BOOKWANA'));
  const colAccountNo = headers.findIndex((h) => h.includes('ACCOUNTNO') && !h.includes('BOOKWANA'));
  const colIndicator = headers.findIndex((h) => h.includes('INDICATOR'));
  const colTxCode = headers.findIndex((h) => h.includes('TRANSACTIONCODE'));
  const colAmount = headers.findIndex((h) => h.includes('AMOUNT'));
  const colTitle = headers.findIndex((h) => h.includes('TITLE') || h.includes('NAME') || h.includes('BENEFICIARY'));
  const colLodgement = headers.findIndex((h) => h.includes('LODGEMENT') || h.includes('REF'));
  const colBookwanaBank = headers.findIndex((h) => h.includes('BOOKWANABANKCODE') || h.includes('REMITTERBANK'));
  const colBookwanaAccount = headers.findIndex((h) => h.includes('BOOKWANAACCOUNTNO') || h.includes('REMITTERACCOUNT'));
  const colRemitter = headers.findIndex((h) => h.includes('REMITTERNAME') || h.includes('ORIGINATOR'));

  const transactions: PaymentTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const cols = parseCsvLine(rawLine);
    if (cols.length < 3) continue;

    const rawBankCode = colBankCode !== -1 ? cols[colBankCode] : cols[0] || '';
    const rawAccountNo = colAccountNo !== -1 ? cols[colAccountNo] : cols[1] || '';
    // Format to 8 digits only (e.g. strips leading 0 from 9-digit accounts)
    const formattedAccountNo = cleanAccountNoForXml(rawAccountNo);
    const indicator = colIndicator !== -1 ? cols[colIndicator] : '';
    const txCode = colTxCode !== -1 ? cols[colTxCode] : '50';
    const amountStr = colAmount !== -1 ? cols[colAmount] : cols[4] || '0';
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
    const title = colTitle !== -1 ? cols[colTitle] : cols[5] || 'Unknown Payee';
    const lodgementRef = colLodgement !== -1 ? cols[colLodgement] : cols[6] || 'Payment Ref';
    const bookwanaBank = colBookwanaBank !== -1 ? cols[colBookwanaBank] : cols[7] || '11-11-11';
    const bookwanaAcc = colBookwanaAccount !== -1 ? cols[colBookwanaAccount] : cols[8] || '111111111';
    const remitter = colRemitter !== -1 ? cols[colRemitter] : cols[9] || 'TRYBOOKING UK LIMITED';

    const assignedRail = determineRailByLimits(amount, limits);

    transactions.push({
      id: `tx-${i}-${Math.random().toString(36).substring(2, 7)}`,
      bankCode: rawBankCode,
      accountNo: formattedAccountNo,
      indicator,
      transactionCode: txCode,
      amount: Math.round(amount * 100) / 100,
      title,
      lodgementRef,
      bookwanaBankCode: bookwanaBank,
      bookwanaAccountNo: bookwanaAcc,
      remitterName: remitter,
      assignedRail,
      isManualOverride: false,
    });
  }

  return transactions;
}
