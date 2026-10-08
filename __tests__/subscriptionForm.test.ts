import { recurringKindMeta } from '@/lib/recurring';
import type { Subscription } from '@/lib/subscriptions';
import {
  advancedIntervalOptions,
  buildRecurringPayload,
  buildSummaryLine,
  countDueSoon,
  projectMonthlyTotal,
  suggestLoanFigures,
  validateRecurringForm,
  type RecurringFormValues,
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

const base = (over: Partial<RecurringFormValues> = {}): RecurringFormValues => ({
  name: '',
  merchant: 'Netflix',
  category: 'Entertainment',
  amount: '649',
  interval: 'monthly',
  nextDueDate: '2026-11-05',
  status: 'active',
  reminderDays: 3,
  cancelBeforeDue: false,
  cancelOnDate: '',
  autopay: false,
  paymentMode: 'Cash',
  accountID: null,
  notes: '',
  formKind: 'subscription',
  startDate: '',
  totalEmis: '',
  emisPaid: '',
  loanType: '',
  lender: '',
  principal: '',
  ratePct: '',
  processingFee: '',
  foreclosurePct: '',
  platform: '',
  stepUpPct: '',
  editing: null,
  kindMeta: recurringKindMeta.subscription,
  ...over,
});
const validate = (over: Partial<RecurringFormValues> = {}) => {
  const v = base(over);
  return validateRecurringForm({ ...v, nameLabel: v.kindMeta.nameLabel });
};

describe('validateRecurringForm', () => {
  it('accepts a minimal valid subscription, using the merchant as the name', () => {
    expect(validate()).toEqual([]);
  });

  it('requires a name, an amount and a valid renewal date', () => {
    const messages = validate({ merchant: ' ', amount: '0', nextDueDate: 'soon' });
    expect(messages).toEqual([
      `${recurringKindMeta.subscription.nameLabel} name is required.`,
      'Amount must be positive.',
      'Choose a valid renewal date.',
    ]);
  });

  it('rejects an unparseable amount', () => {
    expect(validate({ amount: 'abc' })).toContain('Amount must be positive.');
  });

  it('bounds the reminder to whole days between 0 and 30', () => {
    expect(validate({ reminderDays: 31 })).toContain('Reminder must be between 0 and 30 days.');
    expect(validate({ reminderDays: -1 })).toContain('Reminder must be between 0 and 30 days.');
    expect(validate({ reminderDays: 1.5 })).toContain('Reminder must be between 0 and 30 days.');
    expect(validate({ reminderDays: 0 })).toEqual([]);
  });

  it('wants a cancellation date only when cancellation reminders are on', () => {
    expect(validate({ cancelBeforeDue: true })).toContain('Choose a cancellation reminder date.');
    expect(validate({ cancelBeforeDue: true, cancelOnDate: '2026-11-01' })).toEqual([]);
  });

  it('requires Autopay for daily schedules and an account for Autopay', () => {
    expect(validate({ interval: 'daily' })).toContain('Daily schedules require Autopay.');
    expect(validate({ interval: 'business_daily' })).toContain('Daily schedules require Autopay.');
    expect(validate({ autopay: true })).toContain('Select the account used for Autopay.');
    expect(validate({ interval: 'daily', autopay: true, accountID: 4 })).toEqual([]);
  });

  describe('for a loan', () => {
    const loan = (over: Partial<RecurringFormValues> = {}) =>
      validate({ formKind: 'loan', kindMeta: recurringKindMeta.loan, ...over });

    it('checks the EMI counts', () => {
      expect(loan({ totalEmis: '601' })).toContain('Total EMIs must be a whole number up to 600.');
      expect(loan({ totalEmis: '12.5' })).toContain('Total EMIs must be a whole number up to 600.');
      expect(loan({ emisPaid: '-1' })).toContain('EMIs paid must be a whole number.');
      expect(loan({ totalEmis: '12', emisPaid: '13' })).toContain(
        'EMIs paid cannot be more than the total.'
      );
      expect(loan({ totalEmis: '12', emisPaid: '12' })).toEqual([]);
    });

    it('allows paid EMIs with an unknown total', () => {
      expect(loan({ emisPaid: '5' })).toEqual([]);
    });

    it('keeps the interest rate within 0–60%', () => {
      expect(loan({ ratePct: '61' })).toContain('Interest rate must be between 0 and 60%.');
      expect(loan({ ratePct: '-1' })).toContain('Interest rate must be between 0 and 60%.');
      expect(loan({ ratePct: '12.5' })).toEqual([]);
    });

    it('does not apply loan rules to other kinds', () => {
      expect(validate({ totalEmis: '9999', ratePct: '99' })).toEqual([]);
    });
  });
});

describe('buildRecurringPayload', () => {
  it('builds a subscription payload with the merchant standing in for the name', () => {
    const payload = buildRecurringPayload(base({ merchant: ' Netflix ', notes: ' hi ' }));
    expect(payload).toMatchObject({
      name: 'Netflix',
      merchant: 'Netflix',
      category: 'Entertainment',
      amount: 649,
      billing_interval: 'monthly',
      next_due_date: '2026-11-05',
      status: 'active',
      reminder_days: 3,
      cancel_before_due: false,
      cancel_on_date: '',
      autopay: false,
      payment_mode: 'Cash',
      purpose_type: 'normal_spend',
      account_id: null,
      notes: 'hi',
      kind: 'subscription',
      start_date: '',
    });
    expect(payload).not.toHaveProperty('total_instalments');
    expect(payload).not.toHaveProperty('platform');
  });

  it('prefers an explicit name, and drops the cancel date when reminders are off', () => {
    const payload = buildRecurringPayload(base({ name: ' Prime ', cancelOnDate: '2026-11-01' }));
    expect(payload.name).toBe('Prime');
    expect(payload.cancel_on_date).toBe('');
    expect(
      buildRecurringPayload(base({ cancelBeforeDue: true, cancelOnDate: '2026-11-01' }))
        .cancel_on_date
    ).toBe('2026-11-01');
  });

  it('only lets an existing subscription’s status through when editing', () => {
    expect(buildRecurringPayload(base({ status: 'paused' })).status).toBe('active');
    const editing = {
      id: 1,
      transaction_tag: 'Subscription',
      purpose_type: 'normal_spend',
    } as unknown as Subscription;
    expect(buildRecurringPayload(base({ status: 'paused', editing })).status).toBe('paused');
  });

  it('keeps the existing tag only when the kind has not changed', () => {
    const editing = {
      id: 1,
      transaction_tag: 'MyTag',
      purpose_type: 'normal_spend',
      kind: 'subscription',
    } as unknown as Subscription;
    expect(buildRecurringPayload(base({ editing })).transaction_tag).toBe('MyTag');
    expect(
      buildRecurringPayload(
        base({ editing, formKind: 'investment', kindMeta: recurringKindMeta.investment })
      ).transaction_tag
    ).toBe(recurringKindMeta.investment.defaultTag);
  });

  it('adds the loan block with parsed numbers and zero defaults', () => {
    const payload = buildRecurringPayload(
      base({
        formKind: 'loan',
        kindMeta: recurringKindMeta.loan,
        startDate: '2026-10-01',
        loanType: 'home',
        lender: ' SBI ',
        totalEmis: '24',
        emisPaid: '3',
        principal: '5,00,000',
        ratePct: '8.5',
      })
    );
    expect(payload).toMatchObject({
      start_date: '2026-10-01',
      total_instalments: 24,
      instalments_paid: 3,
      loan_type: 'home',
      lender: 'SBI',
      principal: 500000,
      annual_rate_pct: 8.5,
      processing_fee: 0,
      foreclosure_charge_pct: 0,
    });
  });

  it('adds the investment block and marks the purpose', () => {
    const payload = buildRecurringPayload(
      base({
        formKind: 'investment',
        kindMeta: recurringKindMeta.investment,
        startDate: '2026-10-01',
        platform: ' Zerodha ',
        stepUpPct: '10',
      })
    );
    expect(payload).toMatchObject({
      purpose_type: 'investment',
      platform: 'Zerodha',
      step_up_pct: 10,
      start_date: '2026-10-01',
    });
  });
});

describe('summary helpers', () => {
  const sub = (over: Record<string, unknown>) =>
    ({
      amount: 100,
      billing_interval: 'monthly',
      due_state: 'scheduled',
      ...over,
    }) as unknown as Subscription;

  it('counts only overdue and due-soon subscriptions', () => {
    expect(
      countDueSoon([sub({ due_state: 'due_soon' }), sub({ due_state: 'overdue' }), sub({})])
    ).toBe(2);
  });

  it('projects a monthly total across cadences', () => {
    expect(
      projectMonthlyTotal([
        sub({ amount: 1200, billing_interval: 'yearly' }),
        sub({ amount: 100 }),
        sub({ amount: '' }),
      ])
    ).toBe(200);
  });

  it('words the headline for empty, loading, singular, plural and due-soon', () => {
    const args = {
      loading: false,
      overview: null,
      activeCount: 0,
      projectedMonthly: 0,
      dueCount: 0,
    };
    expect(buildSummaryLine({ ...args, loading: true })).toBe('Loading recurring payments…');
    expect(buildSummaryLine(args)).toBe('Nothing recurring tracked yet');
    expect(buildSummaryLine({ ...args, activeCount: 1, projectedMonthly: 100 })).toMatch(
      /\/month across 1 recurring payment$/
    );
    expect(buildSummaryLine({ ...args, activeCount: 3, projectedMonthly: 100 })).toMatch(
      /across 3 recurring payments$/
    );
    expect(
      buildSummaryLine({ ...args, activeCount: 3, projectedMonthly: 100, dueCount: 2 })
    ).toMatch(/ · 2 due soon$/);
  });

  it('prefers the server’s overview figures', () => {
    const overview = { active_count: 5, monthly_total: 999 } as never;
    const line = buildSummaryLine({
      loading: false,
      overview,
      activeCount: 1,
      projectedMonthly: 1,
      dueCount: 0,
    });
    expect(line).toContain('across 5 recurring payments');
  });
});

describe('suggestLoanFigures', () => {
  it('suggests nothing for other kinds', () => {
    expect(
      suggestLoanFigures({
        formKind: 'subscription',
        principal: '',
        ratePct: '',
        totalEmis: '',
        amount: '',
      })
    ).toEqual({});
  });

  it('works out the missing EMI from principal, rate and tenure', () => {
    const result = suggestLoanFigures({
      formKind: 'loan',
      principal: '100000',
      ratePct: '12',
      totalEmis: '12',
      amount: '',
    }) as { emi?: number };
    expect(result.emi).toBeGreaterThan(8800);
    expect(result.emi).toBeLessThan(8900);
  });
});
