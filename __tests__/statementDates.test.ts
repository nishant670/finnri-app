import {
  clampDayToMonth,
  defaultDueDate,
  defaultStatementDate,
  parseAmountInput,
  toISODate,
  statementDateProblem,
} from '@/lib/statement-dates';
import { formatCycleRange, formatDueLabel, statementStatusLabels } from '@/lib/statements';

const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe('clampDayToMonth', () => {
  it.each([
    ['an ordinary day', 2026, 7, 5, '2026-08-05'],
    ['the 31st of a 31-day month', 2026, 7, 31, '2026-08-31'],
    ['the 31st of a 30-day month', 2026, 10, 31, '2026-11-30'],
    ['the 31st of a short February', 2026, 1, 31, '2026-02-28'],
    ['the 29th of a leap February', 2028, 1, 29, '2028-02-29'],
    ['the 29th of a non-leap February', 2026, 1, 29, '2026-02-28'],
  ])('handles %s', (_label, year, month, day, expected) => {
    expect(toISODate(clampDayToMonth(year, month as number, day as number))).toBe(expected);
  });

  it('rolls a month index out of range into the neighbouring year', () => {
    // "The month before January 2026" is December 2025.
    expect(toISODate(clampDayToMonth(2026, -1, 10))).toBe('2025-12-10');
  });
});

describe('defaultStatementDate', () => {
  it('uses this month once the billing day has come round', () => {
    expect(defaultStatementDate(5, on('2026-08-18'))).toBe('2026-08-05');
  });

  it('falls back to last month before the billing day', () => {
    expect(defaultStatementDate(25, on('2026-08-18'))).toBe('2026-07-25');
  });

  it('treats the billing day itself as already billed', () => {
    expect(defaultStatementDate(18, on('2026-08-18'))).toBe('2026-08-18');
  });

  it('crosses a year boundary', () => {
    expect(defaultStatementDate(20, on('2026-01-05'))).toBe('2025-12-20');
  });

  it('clamps a 31st card in a short month', () => {
    expect(defaultStatementDate(31, on('2026-02-28'))).toBe('2026-02-28');
  });

  it('falls back to today when the card has no billing day', () => {
    expect(defaultStatementDate(undefined, on('2026-08-18'))).toBe('2026-08-18');
    expect(defaultStatementDate(0, on('2026-08-18'))).toBe('2026-08-18');
  });
});

describe('defaultDueDate', () => {
  it('finds the due day later in the same month', () => {
    expect(defaultDueDate('2026-08-05', 25)).toBe('2026-08-25');
  });

  it('rolls to next month when the due day has already passed', () => {
    expect(defaultDueDate('2026-08-25', 14)).toBe('2026-09-14');
  });

  it('never lands a bill due on the day it billed', () => {
    expect(defaultDueDate('2026-08-05', 5)).toBe('2026-09-05');
  });

  it('clamps into a short month', () => {
    expect(defaultDueDate('2026-01-31', 31)).toBe('2026-02-28');
  });

  it('crosses a year boundary', () => {
    expect(defaultDueDate('2026-12-20', 8)).toBe('2027-01-08');
  });

  it('always lands after the statement, for every pair of anchor days', () => {
    for (let statementDay = 1; statementDay <= 31; statementDay += 1) {
      const statement = toISODate(clampDayToMonth(2026, 0, statementDay));
      for (let dueDay = 1; dueDay <= 31; dueDay += 1) {
        expect(defaultDueDate(statement, dueDay) > statement).toBe(true);
      }
    }
  });

  it('offers a correctable placeholder when the card has no due day', () => {
    expect(defaultDueDate('2026-08-05', undefined)).toBe('2026-08-25');
  });
});

describe('parseAmountInput', () => {
  it.each([
    ['12400', 12400],
    ['12,400', 12400],
    ['₹12,400.50', 12400.5],
    ['', 0],
    ['abc', 0],
    // The server's money parser rejects more than two decimals, so a stray
    // third would come back as a validation error on a field the user has no
    // reason to think is wrong.
    ['12400.555', 12400.56],
  ])('reads %s', (input, expected) => {
    expect(parseAmountInput(input as string)).toBe(expected);
  });
});

describe('formatDueLabel', () => {
  it('counts down to the due date', () => {
    expect(formatDueLabel({ days_to_due: 7, is_overdue: false })).toBe('Due in 7 days');
    expect(formatDueLabel({ days_to_due: 1, is_overdue: false })).toBe('Due tomorrow');
    expect(formatDueLabel({ days_to_due: 0, is_overdue: false })).toBe('Due today');
  });

  it('counts up once the bill is late', () => {
    expect(formatDueLabel({ days_to_due: -1, is_overdue: true })).toBe('1 day overdue');
    expect(formatDueLabel({ days_to_due: -5, is_overdue: true })).toBe('5 days overdue');
  });
});

describe('formatCycleRange', () => {
  it('reads as a span', () => {
    expect(formatCycleRange('2026-07-06', '2026-08-05')).toBe('6 Jul – 5 Aug');
  });
});

describe('statementStatusLabels', () => {
  // A draft is a bill Finnri expects but does not have. Calling it "unpaid"
  // would claim a total it has never been told.
  it('does not describe a draft as unpaid', () => {
    expect(statementStatusLabels.draft).toBe('Amount needed');
    expect(statementStatusLabels.unpaid).toBe('Unpaid');
  });
});

describe('statementDateProblem', () => {
  const rows = [{ date: '2026-10-23' }, { date: '2026-10-30' }];

  it('refuses a date before a transaction on the statement', () => {
    expect(statementDateProblem('2026-10-23', rows)).toContain('30 Oct 2026');
  });

  it('accepts the day of the last transaction and later', () => {
    expect(statementDateProblem('2026-10-30', rows)).toBeNull();
    expect(statementDateProblem('2026-11-05', rows)).toBeNull();
  });

  it('has nothing to say without rows', () => {
    expect(statementDateProblem('2026-10-23', [])).toBeNull();
  });
});
