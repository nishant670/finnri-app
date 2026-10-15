import type { Account } from '@/lib/accounts';
import {
  isStatementDaySuggestion,
  ordinal,
  statementDayDriftCopy,
  statementDayUpdatePayload,
} from '@/lib/statement-day-drift';

const card: Account = {
  id: 7,
  type: 'credit_card',
  name: 'Regalia',
  color: '#000000',
  credit_limit: 100000,
  due_day: 5,
  statement_day: 15,
  fee_month: 'March',
  last4: '4321',
};

describe('statement day drift', () => {
  it('writes ordinals the way people say dates', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ]);
  });

  it('accepts only a real, different pair of days', () => {
    expect(isStatementDaySuggestion({ current_day: 15, observed_day: 20 })).toBe(true);
    expect(isStatementDaySuggestion(undefined)).toBe(false);
    expect(isStatementDaySuggestion(null)).toBe(false);
    expect(isStatementDaySuggestion({ current_day: 15, observed_day: 15 })).toBe(false);
    expect(isStatementDaySuggestion({ current_day: 0, observed_day: 20 })).toBe(false);
    expect(isStatementDaySuggestion({ current_day: 15, observed_day: 32 })).toBe(false);
    expect(isStatementDaySuggestion({ current_day: '15', observed_day: 20 })).toBe(false);
  });

  it('names both days and what accepting changes', () => {
    const copy = statementDayDriftCopy({ current_day: 15, observed_day: 20 }, 'Regalia');
    expect(copy.message).toContain('dated the 20th');
    expect(copy.message).toContain('Regalia usually bills on the 15th');
    expect(copy.confirmLabel).toBe('Bill on the 20th');
    expect(copy.cancelLabel).toBe('Just this once');
  });

  it('moves only the statement day and sends the rest of the card back unchanged', () => {
    const payload = statementDayUpdatePayload(card, { current_day: 15, observed_day: 20 });
    expect(payload.statement_day).toBe(20);
    expect(payload.due_day).toBe(5);
    expect(payload.credit_limit).toBe(100000);
    expect(payload.name).toBe('Regalia');
    expect(payload.last4).toBe('4321');
  });
});
