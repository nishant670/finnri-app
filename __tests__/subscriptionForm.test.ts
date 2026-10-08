import {
  advancedIntervalOptions,
  apiDateToLocalDate,
  dateToApiDate,
  formatDueDateLabel,
  intervalLabel,
  intervalOptions,
  nextMonthISO,
  parseAmount,
  reminderLabel,
  sanitizeAmount,
  statusOptions,
  todayISO,
  toParam,
} from '@/lib/subscription-form';

describe('date helpers', () => {
  it('round-trips an API date through a local date without drifting a day', () => {
    expect(dateToApiDate(apiDateToLocalDate('2026-03-09'))).toBe('2026-03-09');
    expect(dateToApiDate(apiDateToLocalDate('2026-12-31'))).toBe('2026-12-31');
  });

  it('reads the date part of an RFC3339 timestamp', () => {
    const d = apiDateToLocalDate('2026-09-13T00:00:00Z');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 13]);
  });

  it('falls back to today for something that is not a date', () => {
    const before = Date.now();
    const d = apiDateToLocalDate('garbage');
    expect(Math.abs(d.getTime() - before)).toBeLessThan(5000);
  });

  it('pads month and day', () => {
    expect(dateToApiDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('todayISO is today, and nextMonthISO is a month on', () => {
    const t = new Date();
    expect(todayISO()).toBe(dateToApiDate(t));
    const next = apiDateToLocalDate(nextMonthISO());
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 1);
    expect(next.getMonth()).toBe(expected.getMonth());
  });

  it('formats a due date for en-IN display', () => {
    expect(formatDueDateLabel('2026-09-05')).toMatch(/^05 Sep(t)? 2026$/);
  });
});

describe('amounts', () => {
  it('parses amounts with thousands separators', () => {
    expect(parseAmount('1,299.50')).toBe(1299.5);
    expect(parseAmount(' 199 ')).toBe(199);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });

  it('keeps only digits and dots while typing', () => {
    expect(sanitizeAmount('₹1,2a9.5')).toBe('129.5');
    expect(sanitizeAmount('')).toBe('');
  });
});

describe('toParam', () => {
  it('takes the first of a repeated route param', () => {
    expect(toParam(['a', 'b'])).toBe('a');
    expect(toParam('a')).toBe('a');
    expect(toParam(undefined)).toBeUndefined();
  });
});

describe('labels', () => {
  it('words the reminder lead time', () => {
    expect(reminderLabel(0)).toBe('On due date');
    expect(reminderLabel(1)).toBe('1 day before');
    expect(reminderLabel(7)).toBe('7 days before');
  });

  it('names every selectable interval and the legacy market-days one', () => {
    for (const o of [...intervalOptions, ...advancedIntervalOptions]) {
      expect(intervalLabel(o.value)).toBe(o.label);
    }
    expect(intervalLabel('business_daily')).toBe('Market days');
  });
});

describe('option lists', () => {
  it('offers four cadences up front and keeps daily and biweekly under Advanced', () => {
    expect(intervalOptions.map((o) => o.value)).toEqual([
      'weekly',
      'monthly',
      'quarterly',
      'yearly',
    ]);
    expect(advancedIntervalOptions.map((o) => o.value)).toEqual(['daily', 'biweekly']);
  });

  it('never offers market days when creating', () => {
    expect(
      [...intervalOptions, ...advancedIntervalOptions].some((o) => o.value === 'business_daily')
    ).toBe(false);
  });

  it('has the three statuses', () => {
    expect(statusOptions.map((o) => o.value)).toEqual(['active', 'paused', 'cancelled']);
  });
});
