# Chat History: Lloyds BACS / FPS pain.001 Export Review

Exported 2026-10-24.

---

## 1. User

Attached files:
- `Lloyds_BACS_pain001_20261023.xml` (generated BACS output)
- `Lloyds_FPS_pain001_20261023.xml` (generated FPS output)
- `Lloyds_BACS_v4.xml` (Lloyds Commercial Banking BACS template)
- `Lloyds_Faster_Payments.xml` (Lloyds Commercial Banking FPS template)

> Uploaded two templates from lloyds Commercial Banking BACS and FPS batch imports. Validate and check the corresponding output files

## 1. Assistant

I checked both output files against their Lloyds templates. Both are structurally sound and match the template layouts. The BACS file has one definite error and one date problem that will probably stop it going through as dated. The FPS file has nothing blocking.

**Checks both files pass**
- Both are valid XML, ASCII only, using the pain.001.001.03 namespace.
- Every element sits in the same place and order as in the templates. I compared this to the pain.001.001.03 schema order myself; I didn't run a formal XSD validator.
- The transaction count in the header matches the actual number of payments: 6 in BACS, 5 in FPS.
- Your debit account `301440-14438260` is in the template's sort-code-dash-account format, and every beneficiary sort code is 6 digits.
- All amounts are in GBP with two decimal places. Totals are **£8,740.30** for BACS and **£19,381.37** for FPS. Neither file includes a control total, and neither template does either.

**BACS file (`Lloyds_BACS_pain001_20261023.xml`)**

| | Issue | Detail |
|---|---|---|
| ❌ | **Account number has 9 digits** | Furness Tradition, sort code 010893, account `056516177`, £1,244.10. UK accounts are 8 digits, so this is either a typo or a building society roll number that's gone in the wrong field. Fix it at source before uploading. |
| ⚠️ | **Payment date is today** | `ReqdExctnDt` is 2026-10-23, a Friday, and the file was generated at 17:15 UK time. BACS takes three working days, so Lloyds will probably reject this date or move it later. Check what date your generator is meant to use. |
| ⚠️ | **Names longer than 18 characters** | BACS only carries 18 characters of the payee name: "Mr Darran Charles Bramley  Mrs Fiona Christine Bramley" (54), "Saint John Southworth Foundation" (32) and "Harrogate Theatre Choir" (23). Lloyds will cut these short. The first one also has a double space where two names were joined, and once shortened it will read "Mr Darran Charles ". |
| ℹ️ | Your account reference is `SUPP` | This field is the free-text reference that shows on your own statement; the template calls it "Debt Acc Ref". `SUPP` is allowed, but something like `TRYBOOKING PAYOUTS` would be easier to reconcile. |
| ℹ️ | Duplicate payment IDs | 4 of the 6 payments share the ID "TryBooking Payment". Lloyds' template uses this field as a reference, so it's fine, but the IDs aren't unique. |
| ✅ | References | All are 18 characters or fewer, which fits BACS. |

**FPS file (`Lloyds_FPS_pain001_20261023.xml`)**

| | Issue | Detail |
|---|---|---|
| ⚠️ | Double space in a name | "YGG PLASMAWR  GRONFA" has two spaces in the middle. Probably harmless, but it could matter for name checks against the payee's account, so it's worth tidying. |
| ⚠️ | Names longer than 18 characters | "The Marine Society and Sea Cadets" is 33 characters and "YGG PLASMAWR  GRONFA" is 20; Lloyds may shorten them. |
| ℹ️ | Extra reference field is filled | Each payment has an additional reference in the format "PAYMENT <reference>", up to 26 characters, which matches the template. Confirm Lloyds' length limit for that field on your CBO profile. |
| ℹ️ | `SUPP` and duplicate IDs | Same notes as for BACS. |
| ✅ | Account numbers, references and date | All account numbers are 8 digits, all references are 18 characters or fewer, and a same-day date is fine for Faster Payments. |

**What to do:**
1. Correct the Furness Tradition account number before uploading the BACS file.
2. Confirm the BACS payment date, or make the generator set it at least three working days ahead.
3. Optionally, have the generator collapse double spaces in names and shorten them to 18 characters, so you control what the payee sees rather than Lloyds.

I can write you a small reusable validator script for these checks if that would help.

---

## 2. User

> Review the above code to ensure it meets the template and issues listed

<details>
<summary>Pasted code: <code>XmlExportModal.tsx</code></summary>

```tsx
import React, { useState } from 'react';
import { PaymentTransaction, DebtorConfig, PaymentRail } from '../types/payment';
import {
  generateLloydsBacsXml,
  generateLloydsFasterPaymentsXml,
  calculateBacsEarliestExecutionDate,
  downloadFile,
} from '../utils/xmlGenerator';
import {
  Download,
  Copy,
  Check,
  FileCode,
  X,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Clock,
} from 'lucide-react';

interface XmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: PaymentTransaction[];
  debtor: DebtorConfig;
  defaultRail?: PaymentRail | 'ALL';
}

export const XmlExportModal: React.FC<XmlExportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  debtor,
  defaultRail = 'ALL',
}) => {
  const [activeTab, setActiveTab] = useState<'BACS' | 'FasterPay'>(
    defaultRail === 'FasterPay' ? 'FasterPay' : 'BACS'
  );
  const [copied, setCopied] = useState(false);
  const [exportedAll, setExportedAll] = useState(false);
  // Code window set to closed at beginning as requested
  const [isCodeOpen, setIsCodeOpen] = useState(false);

  if (!isOpen) return null;

  const formatGBP = (val: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    }).format(val);

  // Filter batches for Lloyds BACS and FPS
  const bacsTxs = transactions.filter((t) => t.assignedRail === 'BACS');
  const fpsTxs = transactions.filter((t) => t.assignedRail === 'FasterPay');

  const bacsAmount = bacsTxs.reduce((s, t) => s + t.amount, 0);
  const fpsAmount = fpsTxs.reduce((s, t) => s + t.amount, 0);
  const combinedTotalCount = bacsTxs.length + fpsTxs.length;
  const combinedTotalAmount = bacsAmount + fpsAmount;

  // BACS requires at least 3 business working days ahead; FPS is same-day
  const bacsExecutionDate = debtor.bacsExecutionDate || calculateBacsEarliestExecutionDate(debtor.executionDate);
  const fpsExecutionDate = debtor.executionDate;

  const bacsXml = generateLloydsBacsXml(bacsTxs, debtor, bacsExecutionDate);
  const fpsXml = generateLloydsFasterPaymentsXml(fpsTxs, debtor);

  const activeContent = activeTab === 'BACS' ? bacsXml : fpsXml;
  const activeCount = activeTab === 'BACS' ? bacsTxs.length : fpsTxs.length;
  const activeAmount = activeTab === 'BACS' ? bacsAmount : fpsAmount;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActive = () => {
    if (activeTab === 'BACS') {
      const bacsDateStr = bacsExecutionDate.replace(/-/g, '');
      downloadFile(`Lloyds_BACS_pain001_${bacsDateStr}.xml`, bacsXml, 'application/xml');
    } else {
      const fpsDateStr = fpsExecutionDate.replace(/-/g, '');
      downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
    }
  };

  // Process the two XML file downloads separately
  const handleExportAllBatchFiles = () => {
    const bacsDateStr = bacsExecutionDate.replace(/-/g, '');
    const fpsDateStr = fpsExecutionDate.replace(/-/g, '');
    let downloadedCount = 0;

    if (bacsTxs.length > 0) {
      downloadFile(`Lloyds_BACS_pain001_${bacsDateStr}.xml`, bacsXml, 'application/xml');
      downloadedCount++;
    }

    if (fpsTxs.length > 0) {
      if (downloadedCount > 0) {
        setTimeout(() => {
          downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
        }, 350);
      } else {
        downloadFile(`Lloyds_FPS_pain001_${fpsDateStr}.xml`, fpsXml, 'application/xml');
      }
      downloadedCount++;
    }

    if (downloadedCount > 0) {
      setExportedAll(true);
      setTimeout(() => setExportedAll(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Lloyds Bulk Payments Export Hub
              </h2>
              <p className="text-xs text-slate-500">
                ISO 20022 <code className="font-mono text-slate-700">pain.001.001.03</code> XML for Commercial Banking Online (CBO)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            title="Close window"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Debtor Profile Bar: Provides combined total of Lloyds XML batches */}
        <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-y-2">
          <div className="space-y-1">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">Debtor:</span>
                <span className="font-mono font-bold text-slate-900">
                  {debtor.debtorSortCode}-{debtor.debtorAccountNo}
                </span>
                <span className="text-slate-500">({debtor.debtorName})</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5" title="Lloyds Faster Payments execution date">
                  <Calendar className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-slate-500">FPS Date:</span>
                  <span className="font-mono font-semibold text-slate-900">{fpsExecutionDate}</span>
                </div>
                <div className="flex items-center space-x-1.5" title="Lloyds BACS execution date (at least 3 banking working days ahead)">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-slate-500">BACS Date:</span>
                  <span className="font-mono font-semibold text-blue-900">{bacsExecutionDate}</span>
                  <span className="text-[10px] text-blue-600 font-sans">(+3d)</span>
                </div>
              </div>
            </div>

            {/* Total of Lloyds batches under Debtor */}
            <div className="flex items-center space-x-2 text-xs font-mono pt-0.5">
              <span className="text-slate-500 font-sans font-medium">Export Batches Combined:</span>
              <span className="font-bold text-slate-900">
                {combinedTotalCount} selected payments
              </span>
              <span>·</span>
              <span className="font-bold text-emerald-700">
                {formatGBP(combinedTotalAmount)}
              </span>
              <span className="text-slate-400 text-[11px] font-sans">
                (BACS: {bacsTxs.length} · FPS: {fpsTxs.length})
              </span>
            </div>
          </div>

          {/* Export All Batch Files Button (downloads both XML files separately) */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportAllBatchFiles}
              disabled={combinedTotalCount === 0}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold shadow-xs transition ${
                combinedTotalCount > 0
                  ? exportedAll
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="Download Lloyds BACS and FPS XML files separately"
            >
              {exportedAll ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Download className="w-3.5 h-3.5" />}
              <span>{exportedAll ? 'Downloaded Both Files' : 'Export All Batch Files'}</span>
            </button>
          </div>
        </div>

        {/* Compact Batch Summary as a tab selector (2 Rails: BACS and FPS with equal 1px small outline) */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* BACS Selector */}
            <button
              onClick={() => setActiveTab('BACS')}
              className={`p-3 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                activeTab === 'BACS'
                  ? 'bg-blue-50/80 border-blue-600 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Lloyds BACS XML</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    UKBACS · ReqdExctnDt: {bacsExecutionDate} (+3d)
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-blue-900">{formatGBP(bacsAmount)}</div>
                <div className="text-[10px] text-slate-500">{bacsTxs.length} selected</div>
              </div>
            </button>

            {/* FPS Selector (Red Theme) */}
            <button
              onClick={() => setActiveTab('FasterPay')}
              className={`p-3 rounded-lg border text-left transition flex items-center justify-between cursor-pointer ${
                activeTab === 'FasterPay'
                  ? 'bg-red-50/80 border-red-600 shadow-xs'
                  : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                <div>
                  <div className="text-xs font-bold text-slate-900">Lloyds FPS XML</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    FPS Instant · ReqdExctnDt: {fpsExecutionDate}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-red-900">{formatGBP(fpsAmount)}</div>
                <div className="text-[10px] text-slate-500">{fpsTxs.length} selected</div>
              </div>
            </button>
          </div>
        </div>

        {/* Toolbar: Toggle Code Window & Download XML button */}
        <div className="px-6 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-slate-400">File:</span>
            <span className="text-emerald-400 font-bold">
              {activeTab === 'BACS' ? 'Lloyds_BACS_pain001.xml' : 'Lloyds_FPS_pain001.xml'}
            </span>
            <span>·</span>
            <span>{activeCount} payments</span>
            <span>·</span>
            <span>{formatGBP(activeAmount)}</span>
          </div>

          <div className="flex items-center space-x-2">
            {isCodeOpen && (
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy XML'}</span>
              </button>
            )}

            {/* Expand / Close Code Window Button (defaults to closed) */}
            <button
              onClick={() => setIsCodeOpen(!isCodeOpen)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer font-medium"
              title={isCodeOpen ? 'Close code preview window' : 'Expand code preview window'}
            >
              {isCodeOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Close Preview</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expand Preview</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Window: Placed below the batch summary, collapsible */}
        {isCodeOpen ? (
          <div className="p-6 flex-1 overflow-y-auto bg-slate-900 text-slate-200 max-h-72">
            <pre className="text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed text-slate-300 selection:bg-emerald-500 selection:text-black">
              {activeContent}
            </pre>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 flex-1 flex flex-col justify-center items-center text-center">
            <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                {activeCount} selected payments ready for{' '}
                {activeTab === 'BACS'
                  ? 'Lloyds BACS Direct Credit (UKBACS)'
                  : 'Lloyds Faster Payments (FPS Instant)'}
                .
              </span>
            </div>
          </div>
        )}

        {/* Modal Footer: Download button stays synchronized with active file and state */}
        <div className="p-4 px-6 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            <span>Selected for {activeTab}: </span>
            <strong className="text-slate-800">{activeCount} payments ({formatGBP(activeAmount)})</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadActive}
              disabled={activeCount === 0}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition ${
                activeCount > 0
                  ? activeTab === 'FasterPay'
                    ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                    : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                Download {activeTab === 'BACS' ? 'Lloyds BACS XML' : 'Lloyds FPS XML'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

</details>

## 2. Assistant

I reviewed the modal, but it can only explain part of what went wrong in yesterday's files. `xmlGenerator.ts` and `types/payment.ts` aren't in this session, and that's where the XML actually gets built. The bad account number, long names and double spaces have to be fixed there. Below is what I can confirm from the modal alone.

### Problems that match yesterday's findings

**1. The BACS date can still end up as today (this caused the 2026-10-23 file)**
```ts
const bacsExecutionDate = debtor.bacsExecutionDate || calculateBacsEarliestExecutionDate(debtor.executionDate);
```
If `debtor.bacsExecutionDate` is set, it's used as is, with no check that it's far enough ahead. The BACS file was named `20261023`, the same date as the FPS file. So either that override held today's date, or `calculateBacsEarliestExecutionDate` returned its input unchanged. The `(+3d)` label is hardcoded, so the screen showed "+3d" even though the date wasn't moved. Make the earliest date a floor:
```ts
const earliestBacsDate = calculateBacsEarliestExecutionDate(debtor.executionDate);
const requestedBacsDate = debtor.bacsExecutionDate || earliestBacsDate;
// ISO yyyy-mm-dd strings compare correctly as strings
const bacsExecutionDate = requestedBacsDate < earliestBacsDate ? earliestBacsDate : requestedBacsDate;
const bacsDateWasAdjusted = bacsExecutionDate !== requestedBacsDate;
```
Then show the `(+3d)` badge, or a "date moved forward" warning, only when it's true. Also check that `calculateBacsEarliestExecutionDate` skips weekends and UK bank holidays, and allows for Lloyds' daily cut-off time. The file was generated at 17:15 on a Friday.

**2. Nothing checks the data, but the screen says it's ready**
The `ShieldCheck` icon and the text "N selected payments ready for…" appear no matter what. The 9-digit Furness Tradition account would have exported with a green tick. Add a validation pass and block downloads when errors are found:
```ts
type Issue = { level: 'error' | 'warning'; payee: string; message: string };

const validate = (txs: PaymentTransaction[]): Issue[] =>
  txs.flatMap((t) => {
    const issues: Issue[] = [];
    const name = t.beneficiaryName ?? '';
    if (!/^\d{6}$/.test(t.sortCode)) issues.push({ level: 'error', payee: name, message: `Sort code "${t.sortCode}" must be 6 digits` });
    if (!/^\d{8}$/.test(t.accountNumber)) issues.push({ level: 'error', payee: name, message: `Account "${t.accountNumber}" must be 8 digits` });
    if (!(t.amount > 0)) issues.push({ level: 'error', payee: name, message: 'Amount must be greater than 0' });
    if ((t.reference ?? '').length > 18) issues.push({ level: 'error', payee: name, message: 'Reference exceeds 18 characters' });
    if (/\s{2,}/.test(name)) issues.push({ level: 'warning', payee: name, message: 'Name contains double spaces' });
    if (name.length > 18) issues.push({ level: 'warning', payee: name, message: `Name is ${name.length} chars; bank will truncate to 18` });
    return issues;
  });

const bacsIssues = validate(bacsTxs);
const fpsIssues = validate(fpsTxs);
const activeIssues = activeTab === 'BACS' ? bacsIssues : fpsIssues;
const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');
```
The field names (`sortCode`, `accountNumber`, `beneficiaryName`, `reference`) are my guesses, so change them to match `PaymentTransaction`. Then:
- Disable the download button when `hasErrors(activeIssues)`.
- In "Export All", skip any file that has errors and tell the user, rather than quietly downloading only half.
- Show the list of problems where the ShieldCheck message is now, and only show ShieldCheck when the list is empty.

**3. Names are passed to the XML as they are**
The modal doesn't clean names, and from the output the generator doesn't either. The generator should do something like `name.replace(/\s+/g, ' ').trim().slice(0, 18)`, at least for BACS. Otherwise you get "Mr Darran Charles " as the cut-down name. Do the same for the FPS additional reference ("PAYMENT …", up to 26 characters) once you've checked Lloyds' limit for it.

### Smaller issues in the modal

| Where | Issue | Fix |
|---|---|---|
| `bacsAmount` / `fpsAmount` | Amounts are added up as decimals, which can be slightly off by fractions of a penny. That's fine for display, but don't reuse these totals for a control total. | Add up whole pence: `Math.round(t.amount * 100)`. |
| `generate…Xml` calls | Both XML files are rebuilt on every re-render, including each tab click and copy. | Wrap them in `useMemo`. Note `useMemo` has to go before the `if (!isOpen) return null`. |
| Initial `activeTab` | Always opens on BACS, even when BACS has 0 payments and FPS has some. | Default to whichever rail has payments. |
| `handleCopy` | `clipboard.writeText` isn't awaited and failures aren't caught, so it shows "Copied" even if the copy failed. | `await` it inside try/catch. |
| Toolbar file name | Shows `Lloyds_BACS_pain001.xml` without the date, so it doesn't match the name of the file that downloads. | Use the same name as the download. |
| FPS date | `fpsExecutionDate` isn't checked against today, so a past date could go out. | Apply the same floor, set to today. |
| Debtor reference | The modal doesn't show the `CtgyPurp` value (`SUPP`). That's the reference on your own statement. | Show it in the debtor bar so it's easy to check before exporting. |

### What already matches the templates
- The debit account is shown as sort code, dash, account number, matching `<DbtrAcct><Othr><Id>`.
- Payments are split into the two files using `assignedRail`, and each file is downloaded separately with the naming `Lloyds_{BACS|FPS}_pain001_YYYYMMDD.xml`.
- Download buttons are disabled for an empty file.

If you paste `xmlGenerator.ts` and `types/payment.ts`, I'll check the code that writes the XML against both templates and turn the changes above into an edited version of the modal.

---

## 3. User

<details>
<summary>Pasted code: <code>types/payment.ts</code></summary>

```ts
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
```

</details>

## 3. Assistant *(interrupted by user before completion)*

The types explain most of yesterday's problems. Your data model has the fields of an Australian ABA payment file: `bankCode`, `indicator`, `transactionCode: "50"`, `title` and `lodgementRef`. ABA allows 9-digit account numbers and 32-character payee names, and nothing converts those values to UK rules before they reach the Lloyds XML. That's why the 9-digit Furness Tradition account and the long names came through.

### New problems found in the types

**1. Your account reference setting isn't being used**

*[Response interrupted]*

---

## 4. User

<details>
<summary>Pasted code: <code>utils/xmlGenerator.ts</code></summary>

```ts
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
  const debtorAccountFormatted = `${debtor.debtorSortCode.replace(/\D/g, '')}-${debtor.debtorAccountNo.replace(/\D/g, '')}`;
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
  const debtorAccountFormatted = `${debtor.debtorSortCode.replace(/\D/g, '')}-${debtor.debtorAccountNo.replace(/\D/g, '')}`;

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
    return `"${bNum}","${cleanSortCodeForXml(t.bankCode)}","${cleanAccountNoForXml(t.accountNo)}","","50","${t.amount.toFixed(2)}","${t.title.replace(/"/g, '""')}","${(t.lodgementRef || '').replace(/"/g, '""')}","${debtor.debtorSortCode}","${debtor.debtorAccountNo}","${debtor.debtorName.replace(/"/g, '""')}"`;
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
```

</details>

## 4. Assistant

This generator is newer than the code that made yesterday's files. It already collapses double spaces, cuts names to 18 characters, gives each payment its own ID and uses `categoryPurpose`, and yesterday's files had none of those. Regenerate those two batches with this build before uploading anything.

Your account-number cleaner (`cleanAccountNoForXml`) is in `bankLookup.ts`, which I haven't seen, so I can't yet say whether the 9-digit account problem is fixed. Two issues remain open, and I found a few new ones.

### Must fix

**1. A 9-digit account number still isn't blocked**
The generator only uses whatever `cleanAccountNoForXml` returns and never checks the length. Your type copies the Australian ABA format, which allows 9-digit accounts. If the cleaner cuts or pads a 9-digit number to 8 digits, the money goes to a different account and the bank raises no error. That's worse than having it rejected. Please paste `bankLookup.ts`. Whatever it does, the generator should refuse anything that isn't exactly 6 + 8 digits (see the validation code below).

**2. The BACS date still isn't kept to the earliest valid date**
```ts
const bacsExecutionDate = customBacsDate || debtor.bacsExecutionDate || calculateBacsEarliestExecutionDate(debtor.executionDate);
```
A date passed in or saved in settings is still used without checking. The modal always passes one, so the calculation only runs when nothing is set. On top of that, the date it counts from is out of date:
- `DEFAULT_DEBTOR_CONFIG.executionDate` is calculated **once, when the app loads**, using `toISOString()`, which gives the UTC date. If the app was opened yesterday and is still running, both files are still dated 2026-10-23. Between midnight and 1am during British Summer Time, UTC is still the previous day, so a freshly opened app gets yesterday's date too.
- FPS has the same issue. Its `ReqdExctnDt` is `debtor.executionDate` with no check, so it can be a date in the past.

**3. No bank holidays**
The working-day calculation only skips weekends. The next problem dates are 25 and 28 December 2026. Boxing Day is a Saturday this year, so the bank holiday moves to Monday the 28th. BACS works to the England and Wales bank holiday calendar.

**4. The BACS fallback reference is too short**
When there's no reference, `REF${idx + 1}` makes `REF1`. Bacs requires at least 6 letters or numbers in a reference, so that payment will fail. Use a longer fallback such as `TRYBOOKING`.

### Should fix

| Where | Issue | Fix |
|---|---|---|
| `calculateBacsEarliestExecutionDate` | `new Date("2026-10-23")` reads the date as UTC midnight, then takes the year, month and day in the computer's local time zone. That's fine in the UK, but on a computer in a time zone behind UTC (e.g. the Americas) it becomes the day before. | Split `YYYY-MM-DD` into numbers and build the date from those (code below). |
| `sanitizeReference` | Allows `_`, which isn't one of the characters BACS accepts. Leaves out `&`, which BACS does accept. | Allow `A-Z a-z 0-9 space . / & -` only. |
| `sanitizePayeeName` | Removes extra spaces but not invalid characters. Apostrophes ("O'Brien"), accented letters ("Zoë") and emoji all pass through. | Turn accented letters into plain ones and use the same allowed-characters filter. |
| FPS `additionalRef` | If there's no reference, it produces `PAYMENT PAYMENT`, because `sanitizeReference('')` returns `'PAYMENT'`. | Build it from the same value as `beneRef`. |
| `EndToEndId` | This is now `<ref>-01`, which can be 21 characters. The schema allows 35, but yesterday's files never had more than 18 here. | Confirm Lloyds accepts it with one test upload. |
| `amount.toFixed(2)` | A missing or invalid amount writes `NaN`, and a zero or negative amount goes into the file. | Covered by the validation code below. |
| Fallback `PmtInfId` | `'1'` for BACS but `'12345'` for FPS. | Make them the same; it's only a default. |
| `generateO4bBatchCsv` | Puts `debtor.debtorSortCode` in with its dashes (`30-14-40`), while payee sort codes are cleaned. It also always writes `"50"` and `""` instead of `t.transactionCode` / `t.indicator`. | Clean the sort code, and use the transaction's own fields if they matter for O4B. |

### Code changes

```ts
// --- Dates (all YYYY-MM-DD, UK calendar) ---------------------------------

// England & Wales bank holidays (Bacs calendar). Better: load from https://www.gov.uk/bank-holidays.json
const UK_BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
]);

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isBankingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !UK_BANK_HOLIDAYS.has(formatYmd(date));
}

/** Today's date in London, evaluated at call time (not module load) */
export function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

export function calculateBacsEarliestExecutionDate(fromDateStr: string = todayInLondon()): string {
  const date = parseYmd(fromDateStr);
  let workingDaysCount = 0;
  while (workingDaysCount < 3) {
    date.setDate(date.getDate() + 1);
    if (isBankingDay(date)) workingDaysCount++;
  }
  return formatYmd(date);
}

/** Never earlier than the Bacs minimum, and rolled forward off weekends/holidays */
export function resolveBacsExecutionDate(requested?: string): string {
  const earliest = calculateBacsEarliestExecutionDate(todayInLondon());
  const date = parseYmd(requested && requested > earliest ? requested : earliest);
  while (!isBankingDay(date)) date.setDate(date.getDate() + 1);
  return formatYmd(date);
}

export function resolveFpsExecutionDate(requested?: string): string {
  const today = todayInLondon();
  return requested && requested > today ? requested : today;
}
```
In the BACS generator, use `resolveBacsExecutionDate(customBacsDate || debtor.bacsExecutionDate)`. In the FPS generator, use `resolveFpsExecutionDate(debtor.executionDate)`. The modal should call the same functions so the date on screen matches the date in the file. Also change `DEFAULT_DEBTOR_CONFIG.executionDate` to `todayInLondon()`, or better, work it out when the modal opens rather than when the app loads.

```ts
// --- Character set & validation -------------------------------------------

const toBacsCharset = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\/&-]/g, '');

export function sanitizeReference(ref: string, maxLength: number = 18): string {
  const cleaned = toBacsCharset(ref || '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLength).trim() || 'TRYBOOKING';
}

export function sanitizePayeeName(name: string, maxLength: number = 18): string {
  const cleaned = toBacsCharset(name || '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLength).trim() || 'PAYEE';
}

export interface LloydsValidationIssue {
  level: 'error' | 'warning';
  txId: string;
  payee: string;
  message: string;
}

export function validateLloydsTransactions(transactions: PaymentTransaction[]): LloydsValidationIssue[] {
  return transactions.flatMap((tx) => {
    const issues: LloydsValidationIssue[] = [];
    const add = (level: LloydsValidationIssue['level'], message: string) =>
      issues.push({ level, txId: tx.id, payee: tx.title, message });

    const sort = (tx.bankCode || '').replace(/\D/g, '');
    const acc = (tx.accountNo || '').replace(/\D/g, '');
    if (sort.length !== 6) add('error', `Sort code "${tx.bankCode}" must be 6 digits`);
    if (acc.length !== 8) add('error', `Account "${tx.accountNo}" must be 8 digits (has ${acc.length})`);
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) add('error', `Invalid amount ${tx.amount}`);

    const ref = sanitizeReference(tx.lodgementRef);
    if (ref.replace(/[^A-Za-z0-9]/g, '').length < 6) add('error', `Reference "${ref}" needs at least 6 letters/digits`);
    if (ref !== (tx.lodgementRef || '').trim()) add('warning', `Reference will be sent as "${ref}"`);

    const name = sanitizePayeeName(tx.title);
    if (name !== (tx.title || '').trim()) add('warning', `Name will be sent as "${name}"`);
    return issues;
  });
}
```
With this, the BACS fallback becomes `sanitizeReference(tx.lodgementRef)`, with no `REF${idx+1}`. For FPS, `additionalRef` becomes `` `PAYMENT ${beneRef}` ``. The modal changes from my last reply now run on `validateLloydsTransactions(bacsTxs)` and `validateLloydsTransactions(fpsTxs)`. Any `error` turns off that file's download button, and every `warning` shows exactly what the payee will see.

### Already matching the templates
- The XML structure, element order, namespace and spacing match each template line for line.
- Debit account `301440-14438260` with dashes removed, `UKBACS` / `FPS`, `TRA`, the GBP amounts and the FPS additional reference (the template's "ADDITIONAL REFERENCE FPS") are all correct.
- Special XML characters are escaped, and the payee-facing reference is capped at 18 characters.

One thing I'm not sure about: you count 3 working days after the submission date. Under the standard Bacs cycle (submit on day 1, money arrives on day 3), the earliest arrival date is 2 working days after submission, if you submit before Lloyds' daily cut-off. Your rule is safe but pays a day later than necessary. Check with Lloyds which date `ReqdExctnDt` means for CBO bulk BACS before you shorten it.

Next, paste `bankLookup.ts` and I'll check how 9-digit accounts are handled. After that I can write the full updated `xmlGenerator.ts` and modal as files.

---

## 5. User

> export chat history to chat_history.md file
