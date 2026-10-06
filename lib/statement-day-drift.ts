import type { Account, AccountPayload } from './accounts';
import { applyCardUpdates } from './statement-intake';
import type { StatementDaySuggestion } from './statements';

/**
 * When a saved statement is dated off the card's usual billing day.
 *
 * One statement cannot tell a bank that moved the date for good from one that
 * shifted a single cycle around a holiday, so the server only suggests and
 * the user decides. Accepting moves the card's `statement_day`, which is what
 * future drafts and reminders anchor on; declining leaves the card alone.
 * Either way the statement itself is already saved on its real date.
 */

/** 1st, 2nd, 3rd, 11th, 21st … */
export const ordinal = (day: number) => {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th');
  return `${day}${suffix}`;
};

export const isStatementDaySuggestion = (value: unknown): value is StatementDaySuggestion => {
  if (!value || typeof value !== 'object') return false;
  const { current_day, observed_day } = value as Record<string, unknown>;
  const valid = (day: unknown) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
  return valid(current_day) && valid(observed_day) && current_day !== observed_day;
};

export const statementDayDriftCopy = (suggestion: StatementDaySuggestion, cardName: string) => {
  const observed = ordinal(suggestion.observed_day);
  const current = ordinal(suggestion.current_day);
  return {
    title: 'Did the billing date move?',
    message:
      `This statement is dated the ${observed}, but ${cardName} usually bills on the ${current}. ` +
      `If your bank moved it, Finnri will expect future statements on the ${observed}.`,
    confirmLabel: `Bill on the ${observed}`,
    cancelLabel: 'Just this once',
  };
};

/** The account update that accepts the suggestion; everything else is sent back unchanged. */
export const statementDayUpdatePayload = (account: Account, suggestion: StatementDaySuggestion): AccountPayload =>
  applyCardUpdates(
    account,
    [
      {
        field: 'statement_day',
        label: 'Statement day',
        current: suggestion.current_day,
        proposed: suggestion.observed_day,
      },
    ],
    { statement_day: true }
  );
