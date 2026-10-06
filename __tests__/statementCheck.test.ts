import {
  defaultMissingSelection,
  defaultProbableDecisions,
  missingLineKey,
  planStatementCheck,
  probableKey,
} from '@/lib/statement-check';
import { normalizeStatementDiff, type StatementDiff, type StatementLine } from '@/lib/statements';

const line = (description: string, amount: number, extra: Partial<StatementLine> = {}) =>
  ({
    date: '2026-09-10',
    description,
    amount,
    type: 'expense',
    kind: 'spend',
    ...extra,
  }) as StatementLine;

const baseDiff = (overrides: Partial<StatementDiff> = {}): StatementDiff => ({
  matched: [],
  probable: [],
  missing: [],
  extra: [],
  ignored: [],
  charges: [],
  summary: {
    statement_lines: 0,
    matched_count: 0,
    missing_count: 0,
    extra_count: 0,
    ignored_count: 0,
    probable_count: 0,
    charges_count: 0,
    charges_amount: 0,
    missing_amount: 0,
    extra_amount: 0,
  },
  ...overrides,
});

const reconciliation = (gap: number) => ({
  cycle_start: '2026-09-06',
  cycle_end: '2026-10-05',
  itemized_total: 12400 - gap,
  entries_count: 5,
  previous_unpaid: 0,
  statement_total: 12400,
  unitemized_amount: Math.max(gap, 0),
  gap,
  state: 'under' as const,
});

describe('planStatementCheck', () => {
  it('projects a balanced bill when the ticked rows explain the gap', () => {
    const diff = baseDiff({
      missing: [line('MYNTRA', 2000), line('ANNUAL FEE', 590, { kind: 'fee' })],
      reconciliation: reconciliation(2590),
    });

    const plan = planStatementCheck(diff, defaultMissingSelection(diff), {});

    expect(plan.linesToImport).toHaveLength(2);
    expect(plan.importNet).toBe(2590);
    expect(plan.projectedGap).toBe(0);
    expect(plan.projectedState).toBe('balanced');
  });

  it('counts refunds against the gap and leaves unticked rows out', () => {
    const missing = [
      line('MYNTRA', 2000),
      line('MYNTRA REFUND', 500, { type: 'income', kind: 'refund' }),
    ];
    const diff = baseDiff({ missing, reconciliation: reconciliation(2000) });
    const selected = { ...defaultMissingSelection(diff), [missingLineKey(missing[1], 1)]: false };

    const ticked = planStatementCheck(diff, defaultMissingSelection(diff), {});
    expect(ticked.importNet).toBe(1500);
    expect(ticked.projectedState).toBe('under');

    const refundSkipped = planStatementCheck(diff, selected, {});
    expect(refundSkipped.projectedGap).toBe(0);
  });

  it('adds a probable line only when the user says it was a different purchase', () => {
    const pair = {
      line: line('SWIGGY', 640),
      entry: { entry_id: 9, date: '2026-09-02', title: 'Dinner', amount: 640, type: 'expense' },
      day_gap: 8,
      amount_gap: 0,
      similarity: 0,
      reason: 'date' as const,
    };
    const diff = baseDiff({ probable: [pair], reconciliation: reconciliation(0) });

    const same = planStatementCheck(diff, {}, defaultProbableDecisions(diff));
    expect(same.linesToImport).toHaveLength(0);
    expect(same.projectedState).toBe('balanced');

    const different = planStatementCheck(diff, {}, { [probableKey(pair, 0)]: 'different' });
    expect(different.linesToImport).toEqual([pair.line]);
    expect(different.projectedState).toBe('over');
  });

  it('has no projection for a bill without an amount', () => {
    const diff = baseDiff({ missing: [line('MYNTRA', 2000)] });
    expect(planStatementCheck(diff, defaultMissingSelection(diff), {}).projectedGap).toBeNull();
  });
});

describe('normalizeStatementDiff', () => {
  it('reads a diff from an older API without the new buckets', () => {
    const old = {
      ...baseDiff(),
      probable: undefined,
      charges: undefined,
    } as unknown as StatementDiff;
    const diff = normalizeStatementDiff(old);
    expect(diff.probable).toEqual([]);
    expect(diff.charges).toEqual([]);
    expect(planStatementCheck(diff, {}, {}).linesToImport).toEqual([]);
  });
});
