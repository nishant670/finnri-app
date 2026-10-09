import type { Account } from '@/lib/accounts';
import { applyCardUpdates, putStatementIntake, takeStatementIntake } from '@/lib/statement-intake';
import type { StatementCardUpdate } from '@/lib/statements';

const card: Account = {
  id: 7,
  type: 'credit_card',
  name: 'Regalia',
  color: '#000000',
  credit_limit: 100000,
  due_day: 20,
  statement_day: 5,
  fee_month: 'March',
  last4: '4321',
};

const updates: StatementCardUpdate[] = [
  { field: 'due_day', label: 'Due day', current: 20, proposed: 25 },
  { field: 'credit_limit', label: 'Credit limit', current: 100000, proposed: 150000 },
  { field: 'annual_fee', label: 'Annual fee', current: 0, proposed: 500 },
];

describe('applyCardUpdates', () => {
  it('applies only the accepted values and keeps the rest of the card', () => {
    const payload = applyCardUpdates(card, updates, { due_day: true, annual_fee: true });

    expect(payload.due_day).toBe(25);
    expect(payload.annual_fee).toBe(500);
    expect(payload.credit_limit).toBe(100000);
    expect(payload.statement_day).toBe(5);
    expect(payload.fee_month).toBe('March');
    expect(payload.name).toBe('Regalia');
  });
});

describe('statement intake hand-off', () => {
  it('is taken once', () => {
    const key = putStatementIntake({
      lines: [],
      cardUpdates: updates,
      warnings: [],
      account: card,
    });

    expect(takeStatementIntake(key)?.cardUpdates).toHaveLength(3);
    expect(takeStatementIntake(key)).toBeUndefined();
    expect(takeStatementIntake(undefined)).toBeUndefined();
  });
});
