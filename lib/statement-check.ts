import type {
  StatementDiff,
  StatementLine,
  StatementProbablePair,
  StatementReconciliation,
} from './statements';

/**
 * The decisions on the statement-check screen, turned into what gets imported
 * and what the bill will look like afterwards.
 *
 * Kept free of React so the arithmetic the user is promised — "after adding
 * these, Finnri matches your bill" — is tested on its own.
 */

/** Same as the user's entry (nothing added), or a different purchase (added). */
export type ProbableDecision = 'same' | 'different';

export const missingLineKey = (line: StatementLine, index: number) =>
  `m|${line.date}|${line.amount}|${line.description}|${index}`;

export const probableKey = (pair: StatementProbablePair, index: number) =>
  `p|${pair.entry.entry_id}|${pair.line.date}|${pair.line.amount}|${index}`;

/** New rows start ticked: adding is additive and reversible. */
export const defaultMissingSelection = (diff: StatementDiff): Record<string, boolean> =>
  Object.fromEntries(diff.missing.map((line, index) => [missingLineKey(line, index), true]));

/**
 * Probable pairs start as "same". The user's own entry is respected until they
 * say the bank line was a different purchase — the safe default, because the
 * wrong guess the other way is a duplicate transaction.
 */
export const defaultProbableDecisions = (diff: StatementDiff): Record<string, ProbableDecision> =>
  Object.fromEntries(diff.probable.map((pair, index) => [probableKey(pair, index), 'same']));

export const isChargeLine = (line: StatementLine) =>
  line.kind === 'fee' || line.kind === 'interest';

/** Expenses count up, refunds and other credits count down. */
export const netOf = (lines: StatementLine[]) =>
  lines.reduce((sum, line) => sum + (line.type === 'income' ? -line.amount : line.amount), 0);

export type StatementCheckPlan = {
  linesToImport: StatementLine[];
  /** What importing adds to the cycle's net spend. */
  importNet: number;
  /**
   * The bill against the ledger once these are imported: positive when the
   * bank still knows about more than Finnri does. Null without a priced bill.
   */
  projectedGap: number | null;
  projectedState: StatementReconciliation['state'] | null;
};

/** The server's tolerance for calling a bill balanced: one rupee. */
export const RECONCILE_TOLERANCE = 1;

export const stateForGap = (gap: number): StatementReconciliation['state'] =>
  gap > RECONCILE_TOLERANCE ? 'under' : gap < -RECONCILE_TOLERANCE ? 'over' : 'balanced';

export const planStatementCheck = (
  diff: StatementDiff,
  selected: Record<string, boolean>,
  decisions: Record<string, ProbableDecision>
): StatementCheckPlan => {
  const linesToImport = [
    ...diff.missing.filter((line, index) => selected[missingLineKey(line, index)]),
    ...diff.probable
      .filter((pair, index) => decisions[probableKey(pair, index)] === 'different')
      .map((pair) => pair.line),
  ];
  const importNet = netOf(linesToImport);
  const reconciliation = diff.reconciliation;
  if (!reconciliation) {
    return { linesToImport, importNet, projectedGap: null, projectedState: null };
  }
  const projectedGap = round2(reconciliation.gap - importNet);
  return { linesToImport, importNet, projectedGap, projectedState: stateForGap(projectedGap) };
};

const round2 = (value: number) => Math.round(value * 100) / 100;
