import { PaymentTransaction, DebtorConfig, PaymentRail } from '../types/payment';
import { normaliseSortCode, normaliseAccountNumber, formatLloydsDebitAccount } from './bankLookup';
import {
  ResolvedExecutionDate,
  resolveBacsExecutionDate,
  resolveFpsExecutionDate,
  isBeyondBankHolidayCalendar,
  todayInLondon,
} from './ukBankingCalendar';

/** Lloyds CBO / Bacs field limits */
export const LLOYDS_PAYEE_NAME_MAX = 18;
export const LLOYDS_PAYEE_REFERENCE_MAX = 18;
export const LLOYDS_DEBIT_REFERENCE_MAX = 18;
export const LLOYDS_FPS_ADDITIONAL_REFERENCE_MAX = 26; // <Ustrd>; carries the payee reference unchanged
export const ISO_END_TO_END_ID_MAX = 35;
/** Bacs requires at least 6 letters/digits in the payee reference */
export const BACS_REFERENCE_MIN_ALPHANUMERIC = 6;

/**
 * Escapes characters for safe inclusion in XML
 */
export function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Reduces text to the UK Bacs character set: A-Z a-z 0-9 space . & / -
 * Accented letters are converted to plain letters (Zoë -> Zoe); anything else is removed.
 * Consecutive whitespace is collapsed to a single space.
 */
export function toBacsCharacterSet(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .&/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitizes reference text for banking standards (Bacs character set, limited length).
 * Returns an empty string when nothing usable remains; callers decide the fallback.
 */
export function sanitizeReference(ref: string, maxLength: number = LLOYDS_PAYEE_REFERENCE_MAX): string {
  return toBacsCharacterSet(ref).slice(0, maxLength).trim();
}

/**
 * Sanitizes the payee name: Bacs character set, single spaces, shortened to maxLength
 * (18 characters for Lloyds BACS and FPS) so the operator controls what the payee sees
 * rather than Lloyds cutting it short.
 */
export function sanitizePayeeName(name: string, maxLength: number = LLOYDS_PAYEE_NAME_MAX): string {
  return toBacsCharacterSet(name).slice(0, maxLength).trim();
}

/** Amount in whole pence, avoiding floating point drift when totalling. */
export function toPence(amount: number): number {
  return Math.round(amount * 100);
}

export function formatPenceAsGbp(pence: number): string {
  return (pence / 100).toFixed(2);
}

export interface LloydsExecutionDates {
  bacs: ResolvedExecutionDate;
  fps: ResolvedExecutionDate;
}

/** Single source of truth for the ReqdExctnDt values shown on screen and written to the files. */
export function getLloydsExecutionDates(debtor: DebtorConfig, today: string = todayInLondon()): LloydsExecutionDates {
  return {
    bacs: resolveBacsExecutionDate(debtor.bacsExecutionDate, today),
    fps: resolveFpsExecutionDate(debtor.executionDate, today),
  };
}

export type LloydsIssueLevel = 'error' | 'warning';

export interface LloydsValidationIssue {
  level: LloydsIssueLevel;
  txId?: string; // Undefined for file-level (debtor / date) issues
  payeeName: string;
  field: 'sortCode' | 'accountNumber' | 'amount' | 'payeeName' | 'payeeReference' | 'debtor' | 'executionDate';
  message: string;
}

/** A payment converted to the exact values that go into a Lloyds file. */
export interface LloydsPreparedPayment {
  tx: PaymentTransaction;
  sortCode: string;
  accountNumber: string;
  amountPence: number;
  payeeName: string;
  payeeReference: string;
}

/**
 * Converts a payment to Lloyds file values and lists what is wrong or will be changed.
 * The Bacs 6-character reference minimum is an error for BACS and a warning elsewhere.
 */
export function prepareLloydsPayment(
  tx: PaymentTransaction,
  rail: PaymentRail = 'BACS'
): {
  payment: LloydsPreparedPayment;
  issues: LloydsValidationIssue[];
} {
  const issues: LloydsValidationIssue[] = [];
  const displayName = (tx.payeeName || '').trim() || tx.id;
  const add = (level: LloydsIssueLevel, field: LloydsValidationIssue['field'], message: string) =>
    issues.push({ level, txId: tx.id, payeeName: displayName, field, message });

  const sort = normaliseSortCode(tx.sortCode);
  if (sort.status === 'invalid') add('error', 'sortCode', sort.message!);
  if (sort.status === 'converted') add('warning', 'sortCode', sort.message!);

  const account = normaliseAccountNumber(tx.accountNumber);
  if (account.status === 'invalid') add('error', 'accountNumber', account.message!);
  if (account.status === 'converted') add('warning', 'accountNumber', account.message!);

  const amountPence = Number.isFinite(tx.amount) ? toPence(tx.amount) : NaN;
  if (!Number.isFinite(amountPence) || amountPence <= 0) {
    add('error', 'amount', `Amount ${tx.amount} must be greater than £0.00`);
  }

  const payeeName = sanitizePayeeName(tx.payeeName);
  const rawName = (tx.payeeName || '').replace(/\s+/g, ' ').trim();
  if (!payeeName) {
    add('error', 'payeeName', 'Payee name is missing');
  } else if (payeeName !== rawName) {
    add('warning', 'payeeName', `Name will be sent as "${payeeName}"`);
  }

  // The payment reference is sent as uploaded: nothing is added to it, and a missing reference
  // is an error rather than being replaced. Only characters the bank can't carry are removed
  // and it is limited to 18 characters, both reported as warnings.
  const payeeReference = sanitizeReference(tx.payeeReference);
  const rawRef = (tx.payeeReference || '').replace(/\s+/g, ' ').trim();
  const refAlphanumerics = payeeReference.replace(/[^A-Za-z0-9]/g, '');
  const refRuleLevel: LloydsIssueLevel = rail === 'BACS' ? 'error' : 'warning';
  if (!payeeReference) {
    add('error', 'payeeReference', 'Payment reference is missing');
  } else if (refAlphanumerics.length < BACS_REFERENCE_MIN_ALPHANUMERIC) {
    add(refRuleLevel, 'payeeReference', `Reference "${payeeReference}" has fewer than ${BACS_REFERENCE_MIN_ALPHANUMERIC} letters or digits${rail === 'BACS' ? '' : ' (BACS minimum; may be rejected)'}`);
  } else if (/^(.)\1+$/.test(refAlphanumerics)) {
    add(refRuleLevel, 'payeeReference', `Reference "${payeeReference}" cannot be a single repeated character`);
  } else if (payeeReference !== rawRef) {
    add('warning', 'payeeReference', `Reference will be sent as "${payeeReference}"`);
  }

  return {
    payment: {
      tx,
      sortCode: sort.value,
      accountNumber: account.value,
      amountPence,
      payeeName,
      payeeReference,
    },
    issues,
  };
}

export function validateDebtor(debtor: DebtorConfig): LloydsValidationIssue[] {
  const issues: LloydsValidationIssue[] = [];
  const add = (level: LloydsIssueLevel, message: string) =>
    issues.push({ level, payeeName: debtor.debtorName || 'Debit account', field: 'debtor', message });

  const sortDigits = (debtor.debtorSortCode || '').replace(/\D/g, '');
  const accountDigits = (debtor.debtorAccountNumber || '').replace(/\D/g, '');
  if (sortDigits.length !== 6) add('error', `Debit sort code "${debtor.debtorSortCode}" must be 6 digits`);
  if (accountDigits.length !== 8) add('error', `Debit account number "${debtor.debtorAccountNumber}" must be 8 digits`);

  const debitRef = sanitizeReference(debtor.categoryPurpose, LLOYDS_DEBIT_REFERENCE_MAX);
  if (!debitRef) {
    add('error', 'Debit account reference (CtgyPurp) is missing');
  } else if (debitRef !== (debtor.categoryPurpose || '').replace(/\s+/g, ' ').trim()) {
    add('warning', `Debit account reference will be sent as "${debitRef}"`);
  }
  return issues;
}

export interface LloydsBatchValidation {
  rail: Extract<PaymentRail, 'BACS' | 'FasterPay'>;
  payments: LloydsPreparedPayment[];
  issues: LloydsValidationIssue[];
  hasErrors: boolean;
  totalPence: number;
  executionDate: ResolvedExecutionDate;
}

/**
 * Validates a Lloyds BACS or FPS batch. A batch with any `error` must not be exported;
 * `warning`s describe exactly what will be changed on the way into the file.
 */
export function validateLloydsBatch(
  rail: LloydsBatchValidation['rail'],
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  dates: LloydsExecutionDates = getLloydsExecutionDates(debtor)
): LloydsBatchValidation {
  const issues: LloydsValidationIssue[] = [...validateDebtor(debtor)];
  const payments: LloydsPreparedPayment[] = [];

  transactions.forEach((tx) => {
    const { payment, issues: txIssues } = prepareLloydsPayment(tx, rail);
    payments.push(payment);
    issues.push(...txIssues);
  });

  // Identical records were already consolidated on import. Anything still sharing an account and
  // reference differs in payee name (e.g. a typo), so it was kept separate: flag it for review.
  const seen = new Map<string, LloydsPreparedPayment>();
  payments.forEach((p) => {
    if (!p.sortCode || !p.accountNumber) return;
    const key = `${p.sortCode}|${p.accountNumber}|${(p.tx.payeeReference || '').trim()}`;
    const first = seen.get(key);
    if (first) {
      issues.push({
        level: 'warning',
        txId: p.tx.id,
        payeeName: p.payeeName || p.tx.id,
        field: 'payeeName',
        message: `Same account and reference as "${first.tx.payeeName}" but a different payee name, so not consolidated`,
      });
    } else {
      seen.set(key, p);
    }
  });

  const executionDate = rail === 'BACS' ? dates.bacs : dates.fps;
  if (executionDate.adjusted && executionDate.reason) {
    issues.push({ level: 'warning', payeeName: 'Execution date', field: 'executionDate', message: executionDate.reason });
  }
  if (isBeyondBankHolidayCalendar(executionDate.date)) {
    issues.push({
      level: 'warning',
      payeeName: 'Execution date',
      field: 'executionDate',
      message: `${executionDate.date} is after the last year in the bank holiday calendar; only weekends were checked`,
    });
  }

  return {
    rail,
    payments,
    issues,
    hasErrors: issues.some((i) => i.level === 'error'),
    totalPence: payments.reduce((sum, p) => sum + (Number.isFinite(p.amountPence) ? p.amountPence : 0), 0),
    executionDate,
  };
}

function assertExportable(batch: LloydsBatchValidation): void {
  if (batch.hasErrors) {
    const count = batch.issues.filter((i) => i.level === 'error').length;
    throw new Error(`Lloyds ${batch.rail} file has ${count} error(s) and cannot be generated`);
  }
}

/**
 * Generates Lloyds BACS bulk payment XML matching ISO 20022 pain.001.001.03 format.
 */
export function generateLloydsBacsXml(
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  dates: LloydsExecutionDates = getLloydsExecutionDates(debtor)
): string {
  const batch = validateLloydsBatch('BACS', transactions, debtor, dates);
  assertExportable(batch);
  const count = batch.payments.length;
  const isoTimestamp = new Date().toISOString();
  const debtorAccountFormatted = formatLloydsDebitAccount(debtor.debtorSortCode, debtor.debtorAccountNumber);
  // Never earlier than 3 UK banking days after today (weekends and bank holidays skipped)
  const bacsExecutionDate = batch.executionDate.date;

  const txXmlItems = batch.payments
    .map((p, idx) => {
      const cleanSort = p.sortCode;
      const cleanAcc = p.accountNumber;
      const beneName = escapeXml(p.payeeName);
      const beneRef = escapeXml(p.payeeReference);
      // Unique EndToEndId per payment in the batch
      const seqStr = String(idx + 1).padStart(2, '0');
      const endToEndId = escapeXml(sanitizeReference(`${p.payeeReference}-${seqStr}`, ISO_END_TO_END_ID_MAX));
      const amtStr = formatPenceAsGbp(p.amountPence);

      return `            <CdtTrfTxInf>
			<PmtId>
				<EndToEndId>${endToEndId}</EndToEndId>
			</PmtId>
                <Amt>
                    <InstdAmt Ccy="GBP">${amtStr}</InstdAmt>
                </Amt>
                <CdtrAgt>
					<FinInstnId>
						<ClrSysMmbId>
							<MmbId>${cleanSort}</MmbId>
						</ClrSysMmbId>
					</FinInstnId>	
				</CdtrAgt>
                <Cdtr>
                    <Nm>${beneName}</Nm>
                </Cdtr>
				<CdtrAcct>
                    <Id>
                        <Othr>
                            <Id>${cleanAcc}</Id>
                        </Othr>
                    </Id>
                </CdtrAcct>
                <RmtInf>
				<Strd>
				<CdtrRefInf>
					<Tp>
						<CdOrPrtry>
							<Prtry>${beneRef}</Prtry>
						</CdOrPrtry>
					</Tp>
				</CdtrRefInf>
				</Strd>
                </RmtInf>
            </CdtTrfTxInf>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>${escapeXml(debtor.messageIdPrefix || 'COMMERCIAL BANKING ONLINE')}</MsgId>
            <CreDtTm>${isoTimestamp}</CreDtTm>
            <NbOfTxs>${count}</NbOfTxs>
            <InitgPty/>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>${escapeXml(debtor.paymentInfoId || '1')}</PmtInfId>
            <PmtMtd>TRA</PmtMtd>
            <PmtTpInf>
			<LclInstrm>
                    <Prtry>UKBACS</Prtry>
                </LclInstrm>
				<CtgyPurp>
					<Prtry>${escapeXml(sanitizeReference(debtor.categoryPurpose, LLOYDS_DEBIT_REFERENCE_MAX))}</Prtry>
				</CtgyPurp>
             </PmtTpInf>	
            <ReqdExctnDt>${bacsExecutionDate}</ReqdExctnDt>
			<Dbtr/>
            <DbtrAcct>
                <Id>
                    <Othr>
                        <Id>${debtorAccountFormatted}</Id>
                    </Othr>
                </Id>
            </DbtrAcct>
            <DbtrAgt>
                <FinInstnId/>
            </DbtrAgt>
${txXmlItems}
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>
`;
}

/**
 * Generates Lloyds Faster Payments (FPS) bulk payment XML matching ISO 20022 pain.001.001.03 format.
 */
export function generateLloydsFasterPaymentsXml(
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  dates: LloydsExecutionDates = getLloydsExecutionDates(debtor)
): string {
  const batch = validateLloydsBatch('FasterPay', transactions, debtor, dates);
  assertExportable(batch);
  const count = batch.payments.length;
  const isoTimestamp = new Date().toISOString();
  const debtorAccountFormatted = formatLloydsDebitAccount(debtor.debtorSortCode, debtor.debtorAccountNumber);
  // Never earlier than today (UK time)
  const fpsExecutionDate = batch.executionDate.date;

  const txXmlItems = batch.payments
    .map((p, idx) => {
      const cleanSort = p.sortCode;
      const cleanAcc = p.accountNumber;
      const beneName = escapeXml(p.payeeName);
      // Unique EndToEndId per payment in the batch
      const seqStr = String(idx + 1).padStart(2, '0');
      const endToEndId = escapeXml(sanitizeReference(`${p.payeeReference}-${seqStr}`, ISO_END_TO_END_ID_MAX));
      const beneRef = escapeXml(p.payeeReference);
      // Template "ADDITIONAL REFERENCE FPS" (<Ustrd>): the payment reference as uploaded, nothing added
      const additionalRef = escapeXml(sanitizeReference(p.payeeReference, LLOYDS_FPS_ADDITIONAL_REFERENCE_MAX));
      const amtStr = formatPenceAsGbp(p.amountPence);

      return `            <CdtTrfTxInf>
			<PmtId>
				<EndToEndId>${endToEndId}</EndToEndId>    
            </PmtId>
                <Amt>
                    <InstdAmt Ccy="GBP">${amtStr}</InstdAmt>  
                </Amt>
                <CdtrAgt>
                    <FinInstnId>
                        <ClrSysMmbId>
                            <MmbId>${cleanSort}</MmbId>              
                        </ClrSysMmbId>
                    </FinInstnId>
                </CdtrAgt>
                <Cdtr>
                    <Nm>${beneName}</Nm>                    
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <Othr>
                            <Id>${cleanAcc}</Id>                  
                        </Othr>
                    </Id>
                </CdtrAcct>
				<RmtInf>
					<Ustrd>${additionalRef}</Ustrd>    
					<Strd>
						<CdtrRefInf>
							<Tp>
								<CdOrPrtry>
									<Prtry>${beneRef}</Prtry> 
								</CdOrPrtry>
							</Tp>
						</CdtrRefInf>
					</Strd>
				</RmtInf>
            </CdtTrfTxInf>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>                                               
            <MsgId>${escapeXml(debtor.messageIdPrefix || 'COMMERCIAL BANKING ONLINE')}</MsgId>           
            <CreDtTm>${isoTimestamp}</CreDtTm>         
            <NbOfTxs>${count}</NbOfTxs>                               
            <InitgPty/>
        </GrpHdr>
		
        <PmtInf>                                               
            <PmtInfId>${escapeXml(debtor.paymentInfoId || '1')}</PmtInfId>                          
            <PmtMtd>TRA</PmtMtd>                                
            <PmtTpInf>                     
				<LclInstrm>
                    <Prtry>FPS</Prtry>                         
                </LclInstrm>
				<CtgyPurp>
					<Prtry>${escapeXml(sanitizeReference(debtor.categoryPurpose, LLOYDS_DEBIT_REFERENCE_MAX))}</Prtry>          
				</CtgyPurp>
             </PmtTpInf>	
            <ReqdExctnDt>${fpsExecutionDate}</ReqdExctnDt>              
            <Dbtr/>
            <DbtrAcct>
                <Id>
                    <Othr>
                        <Id>${debtorAccountFormatted}</Id>               
                    </Othr>
                </Id>
            </DbtrAcct>
            <DbtrAgt>
                <FinInstnId/>                        
            </DbtrAgt>
${txXmlItems}
        </PmtInf>		
    </CstmrCdtTrfInitn>
</Document>
`;
}


/**
 * Generates the O4B batch CSV (payments keyed manually in Commercial Banking Online).
 * Records the batch number for each selected transaction, using UK field names and the
 * same 6-digit sort code / 8-digit account number values as the Lloyds XML files.
 * Rows whose bank details can't be normalised are written with STATUS "CHECK DETAILS".
 * One row per payment: consolidated records appear once, with their CSV row numbers listed.
 */
export function generateO4bBatchCsv(
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  batchNumber?: number
): string {
  const q = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const header = ['BATCH_NO', 'STATUS', 'SORT_CODE', 'ACCOUNT_NUMBER', 'AMOUNT_GBP', 'PAYEE_NAME', 'PAYEE_REFERENCE', 'SOURCE_RECORDS', 'SOURCE_CSV_ROWS', 'DEBIT_SORT_CODE', 'DEBIT_ACCOUNT_NUMBER', 'DEBIT_ACCOUNT_NAME']
    .map(q)
    .join(',');
  const debitSort = (debtor.debtorSortCode || '').replace(/\D/g, '');
  const debitAccount = (debtor.debtorAccountNumber || '').replace(/\D/g, '');
  const rows = transactions.map((t) => {
    const bNum = t.o4bBatchNumber || batchNumber || 1;
    const { payment, issues } = prepareLloydsPayment(t, 'O4B');
    const status = issues.some((i) => i.level === 'error') ? 'CHECK DETAILS' : 'OK';
    return [
      String(bNum),
      status,
      payment.sortCode || t.sortCode,
      payment.accountNumber || t.accountNumber,
      Number.isFinite(payment.amountPence) ? formatPenceAsGbp(payment.amountPence) : String(t.amount),
      t.payeeName,
      t.payeeReference || '',
      String(t.sourceRecords?.length || 1),
      (t.sourceRecords || []).map((r) => r.rowNumber).join(';'),
      debitSort,
      debitAccount,
      debtor.debtorName,
    ]
      .map(q)
      .join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Triggers a file download directly in the browser
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/xml'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so multi-file sequential downloads complete before URL is destroyed
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

