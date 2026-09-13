/**
 * Date defaulting for the statement sheet.
 *
 * These mirror the cycle arithmetic the server does in
 * `internal/http/card_statement_cycle.go`. They exist on the client only to
 * prefill the form — the server recomputes the cycle from what is submitted
 * and its answer is the one that gets stored, so a disagreement here shows up
 * as a slightly odd default rather than a wrong bill.
 *
 * They are still worth getting right, and worth testing: every interesting
 * case is a month boundary, which is exactly what nobody exercises by hand.
 */

/**
 * The calendar day out of anything the API might hand back for a date field.
 *
 * A `DATE` column read into a string arrives as an RFC3339 timestamp, so
 * `cycle_start` could reach the app as `2026-08-13T00:00:00Z`. The server now
 * trims it, but an app in somebody's hand talks to whichever build is
 * deployed, and two of these values are used as exact `YYYY-MM-DD` rather than
 * merely displayed: the transactions filter rejects any other spelling
 * outright, which is what made "Review these transactions" open onto an error.
 *
 * Idempotent, so it is safe to apply to a value that is already a plain day.
 */
export const calendarDay = (value: string) => (value ? value.slice(0, 10) : value);

export const toISODate = (value: Date) => {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
};

export const fromISODate = (value: string) => {
  const parsed = new Date(`${calendarDay(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Day `day` of the given month, pulled back to the last day when the month is
 * too short. Day 31 in November is the 30th; in a non-leap February, the 28th.
 *
 * `month` may be out of range — JavaScript rolls it into the neighbouring
 * year, which is what makes "the month before January" work without a special
 * case.
 */
export const clampDayToMonth = (year: number, month: number, day: number) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(day, 1), lastDay));
};

/**
 * The statement date the user most likely means: the card's billing day, this
 * month if it has already come round, last month if it has not.
 *
 * `today` is a parameter rather than `new Date()` so this can be tested at a
 * fixed point in time.
 */
export const defaultStatementDate = (statementDay: number | undefined, today = new Date()) => {
  if (!statementDay || statementDay < 1 || statementDay > 31) return toISODate(today);

  const thisMonth = clampDayToMonth(today.getFullYear(), today.getMonth(), statementDay);
  if (thisMonth.getTime() <= today.setHours(0, 0, 0, 0)) return toISODate(thisMonth);
  return toISODate(clampDayToMonth(today.getFullYear(), today.getMonth() - 1, statementDay));
};

/**
 * The next occurrence of the card's due day strictly after the statement date.
 *
 * "Strictly after" is the whole rule, and it covers both shapes without
 * knowing which it is looking at: a card billing on the 2nd and due on the
 * 22nd finds its due date in the same month, while one billing on the 25th and
 * due on the 14th finds the 14th already behind it and moves to the next.
 *
 * Without a due day, twenty days is the usual interest-free gap and is only a
 * placeholder for the user to correct.
 */
export const defaultDueDate = (statementISO: string, dueDay?: number) => {
  const statement = fromISODate(statementISO);
  if (!dueDay || dueDay < 1 || dueDay > 31) {
    const fallback = new Date(statement);
    fallback.setDate(fallback.getDate() + 20);
    return toISODate(fallback);
  }

  const sameMonth = clampDayToMonth(statement.getFullYear(), statement.getMonth(), dueDay);
  if (sameMonth.getTime() > statement.getTime()) return toISODate(sameMonth);
  return toISODate(clampDayToMonth(statement.getFullYear(), statement.getMonth() + 1, dueDay));
};

export const formatDisplayDate = (value: string) =>
  fromISODate(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * Reads an amount typed into a money field, in rupees.
 *
 * Rounded to paise because the server's money parser rejects anything finer:
 * a stray third decimal would come back as a validation error on a field the
 * user has no reason to think is wrong.
 */
export const parseAmountInput = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
};
