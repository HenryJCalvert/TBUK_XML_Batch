/**
 * UK banking calendar helpers. All dates are ISO "YYYY-MM-DD" strings in UK local time.
 *
 * Dates are deliberately handled as calendar strings rather than via `new Date("YYYY-MM-DD")`,
 * which parses as UTC midnight and shifts by a day on machines west of UTC.
 */

// England & Wales bank holidays (the calendar Bacs and Faster Payments settlement follows).
// Source: https://www.gov.uk/bank-holidays.json — extend this list each year.
export const UK_BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  // 2028
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
]);

// Last year covered by UK_BANK_HOLIDAYS; dates after this are checked for weekends only.
export const UK_BANK_HOLIDAYS_LAST_YEAR = 2028;

/** Number of banking days after the submission date used as the earliest BACS ReqdExctnDt. */
export const BACS_MIN_WORKING_DAYS = 3;

export function isIsoDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isUkBankingDay(value: string): boolean {
  const day = parseYmd(value).getDay();
  // 0 = Sunday, 6 = Saturday
  return day !== 0 && day !== 6 && !UK_BANK_HOLIDAYS.has(value);
}

/** Today's date in London, evaluated at call time (not at module load). */
export function todayInLondon(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

export function addUkBankingDays(fromDate: string, days: number): string {
  const date = parseYmd(fromDate);
  let counted = 0;
  while (counted < days) {
    date.setDate(date.getDate() + 1);
    if (isUkBankingDay(formatYmd(date))) counted++;
  }
  return formatYmd(date);
}

/** Rolls a date forward to the next UK banking day (returns the date itself if it already is one). */
export function nextUkBankingDayOnOrAfter(value: string): string {
  const date = parseYmd(value);
  while (!isUkBankingDay(formatYmd(date))) date.setDate(date.getDate() + 1);
  return formatYmd(date);
}

/**
 * Earliest BACS execution date: BACS_MIN_WORKING_DAYS UK banking days after the submission date
 * (Day 1 input, Day 2 processing, Day 3 entry/settlement), skipping weekends and bank holidays.
 */
export function calculateBacsEarliestExecutionDate(submissionDate: string = todayInLondon()): string {
  const from = isIsoDate(submissionDate) ? submissionDate : todayInLondon();
  return addUkBankingDays(from, BACS_MIN_WORKING_DAYS);
}

export interface ResolvedExecutionDate {
  date: string; // The date that will be written to ReqdExctnDt
  requested?: string; // What was configured, if anything
  adjusted: boolean; // True when the requested date was moved forward
  reason?: string;
}

/** BACS date: the requested date, but never before the BACS minimum and never on a non-banking day. */
export function resolveBacsExecutionDate(requested?: string, today: string = todayInLondon()): ResolvedExecutionDate {
  const earliest = calculateBacsEarliestExecutionDate(today);
  const validRequest = isIsoDate(requested) ? requested : undefined;
  const candidate = validRequest && validRequest > earliest ? validRequest : earliest;
  const date = nextUkBankingDayOnOrAfter(candidate);

  if (!validRequest) {
    return { date, requested, adjusted: false };
  }
  if (date === validRequest) {
    return { date, requested, adjusted: false };
  }
  const reason =
    validRequest < earliest
      ? `Requested ${validRequest} is earlier than the BACS minimum of ${BACS_MIN_WORKING_DAYS} banking days; moved to ${date}`
      : `Requested ${validRequest} is not a UK banking day; moved to ${date}`;
  return { date, requested, adjusted: true, reason };
}

/** FPS date: the requested date, but never in the past and never on a non-banking day. */
export function resolveFpsExecutionDate(requested?: string, today: string = todayInLondon()): ResolvedExecutionDate {
  const validRequest = isIsoDate(requested) ? requested : undefined;
  const candidate = validRequest && validRequest > today ? validRequest : today;
  // Faster Payments run 24/7, but a future-dated (forward) payment must fall on a banking day.
  const date = candidate === today ? today : nextUkBankingDayOnOrAfter(candidate);

  if (!validRequest || date === validRequest) {
    return { date, requested, adjusted: false };
  }
  const reason =
    validRequest < today
      ? `Requested ${validRequest} is in the past; moved to today (${date})`
      : `Requested ${validRequest} is not a UK banking day; moved to ${date}`;
  return { date, requested, adjusted: true, reason };
}

export function isBeyondBankHolidayCalendar(value: string): boolean {
  return Number(value.slice(0, 4)) > UK_BANK_HOLIDAYS_LAST_YEAR;
}
