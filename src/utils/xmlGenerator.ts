import { PaymentTransaction, DebtorConfig } from '../types/payment';
import { cleanSortCodeForXml, cleanAccountNoForXml } from './bankLookup';

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
 * Sanitizes reference text for banking standards (removes invalid characters, limits length)
 */
export function sanitizeReference(ref: string, maxLength: number = 18): string {
  if (!ref) return 'PAYMENT';
  // Allowed chars: alphanumeric, spaces, hyphens, periods, slashes
  const cleaned = ref.replace(/[^a-zA-Z0-9 ./_-]/g, '').trim();
  return cleaned.slice(0, maxLength) || 'PAYMENT';
}

/**
 * Sanitizes beneficiary name by collapsing multiple spaces into a single space,
 * trimming whitespace, and shortening to maxLength (18 characters for BACS and FPS standards).
 * This ensures the operator controls what the payee sees rather than Lloyds cutting it short.
 */
export function sanitizePayeeName(name: string, maxLength: number = 18): string {
  if (!name) return 'PAYEE';
  // 1. Collapse multiple consecutive spaces and whitespace into a single space
  const collapsed = name.replace(/\s+/g, ' ').trim();
  // 2. Shorten to maxLength, trimming any trailing space from cutoff
  const shortened = collapsed.slice(0, maxLength).trim();
  return shortened || 'PAYEE';
}

/**
 * Calculates the earliest valid BACS execution date (at least 3 banking working days ahead).
 * BACS cycle requires Day 1 (Input), Day 2 (Processing), Day 3 (Entry/Settlement).
 * Weekends (Saturday and Sunday) are non-working days.
 */
export function calculateBacsEarliestExecutionDate(fromDateStr?: string): string {
  const base = fromDateStr ? new Date(fromDateStr) : new Date();
  const date = isNaN(base.getTime()) ? new Date() : new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let workingDaysCount = 0;
  while (workingDaysCount < 3) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      workingDaysCount++;
    }
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generates Lloyds BACS bulk payment XML matching ISO 20022 pain.001.001.03 format.
 */
export function generateLloydsBacsXml(
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  customBacsDate?: string
): string {
  const count = transactions.length;
  const isoTimestamp = new Date().toISOString();
  const debtorAccountFormatted = `${cleanSortCodeForXml(debtor.debtorSortCode)}-${cleanAccountNoForXml(debtor.debtorAccountNo)}`;
  // BACS takes 3 business days; ensure ReqdExctnDt is at least 3 working days ahead
  const bacsExecutionDate = customBacsDate || debtor.bacsExecutionDate || calculateBacsEarliestExecutionDate(debtor.executionDate);

  const txXmlItems = transactions
    .map((tx, idx) => {
      const cleanSort = cleanSortCodeForXml(tx.bankCode);
      const cleanAcc = cleanAccountNoForXml(tx.accountNo);
      // Collapses multiple spaces and limits to 18 characters
      const beneName = escapeXml(sanitizePayeeName(tx.title, 18));
      const beneRef = escapeXml(sanitizeReference(tx.lodgementRef || `REF${idx + 1}`, 18));
      // Unique EndToEndId per payment in the batch
      const seqStr = String(idx + 1).padStart(2, '0');
      const baseRef = tx.lodgementRef && tx.lodgementRef.trim().length > 0 ? tx.lodgementRef.trim() : 'TB-BACS';
      const endToEndId = escapeXml(sanitizeReference(`${baseRef}-${seqStr}`, 35));
      const amtStr = tx.amount.toFixed(2);

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
					<Prtry>${escapeXml(debtor.categoryPurpose || 'TRYBOOKING PAYOUTS')}</Prtry>
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
  debtor: DebtorConfig
): string {
  const count = transactions.length;
  const isoTimestamp = new Date().toISOString();
  const debtorAccountFormatted = `${cleanSortCodeForXml(debtor.debtorSortCode)}-${cleanAccountNoForXml(debtor.debtorAccountNo)}`;

  const txXmlItems = transactions
    .map((tx, idx) => {
      const cleanSort = cleanSortCodeForXml(tx.bankCode);
      const cleanAcc = cleanAccountNoForXml(tx.accountNo);
      // Collapses multiple spaces and limits to 18 characters
      const beneName = escapeXml(sanitizePayeeName(tx.title, 18));
      // Unique EndToEndId per payment in the batch
      const seqStr = String(idx + 1).padStart(2, '0');
      const baseRef = tx.lodgementRef && tx.lodgementRef.trim().length > 0 ? tx.lodgementRef.trim() : 'TB-FPS';
      const endToEndId = escapeXml(sanitizeReference(`${baseRef}-${seqStr}`, 35));
      const beneRef = escapeXml(sanitizeReference(tx.lodgementRef || `FPS${idx + 1}`, 18));
      const additionalRef = escapeXml(sanitizeReference(`PAYMENT ${sanitizeReference(tx.lodgementRef || '', 18)}`, 26));
      const amtStr = tx.amount.toFixed(2);

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
            <PmtInfId>${escapeXml(debtor.paymentInfoId || '12345')}</PmtInfId>                          
            <PmtMtd>TRA</PmtMtd>                                
            <PmtTpInf>                     
				<LclInstrm>
                    <Prtry>FPS</Prtry>                         
                </LclInstrm>
				<CtgyPurp>
					<Prtry>${escapeXml(debtor.categoryPurpose || 'TRYBOOKING PAYOUTS')}</Prtry>          
				</CtgyPurp>
             </PmtTpInf>	
            <ReqdExctnDt>${debtor.executionDate}</ReqdExctnDt>              
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
 * Generates O4B Batch CSV format for Open Banking / Order for Business payout engines.
 * Records the Batch number for each selected transaction.
 */
export function generateO4bBatchCsv(
  transactions: PaymentTransaction[],
  debtor: DebtorConfig,
  batchNumber?: number
): string {
  const header = `"BATCH_NO","BANKCODE","ACCOUNTNO","INDICATOR","TRANSACTIONCODE","AMOUNT","TITLE","LODGEMENTREF","BOOKWANABANKCODE","BOOKWANAACCOUNTNO","REMITTERNAME"`;
  const rows = transactions.map((t) => {
    const bNum = t.o4bBatchNumber || batchNumber || 1;
    return `"${bNum}","${cleanSortCodeForXml(t.bankCode)}","${cleanAccountNoForXml(t.accountNo)}","","50","${t.amount.toFixed(2)}","${t.title.replace(/"/g, '""')}","${(t.lodgementRef || '').replace(/"/g, '""')}","${cleanSortCodeForXml(debtor.debtorSortCode)}","${cleanAccountNoForXml(debtor.debtorAccountNo)}","${debtor.debtorName.replace(/"/g, '""')}"`;
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

