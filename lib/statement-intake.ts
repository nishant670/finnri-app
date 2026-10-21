import { toAccountPayload, type Account, type AccountPayload } from './accounts';
import type {
  StatementCardUpdate,
  StatementCardUpdateField,
  StatementLine,
  StatementRead,
} from './statements';

/**
 * What the Add statement sheet read, handed to the statement check once the
 * bill is saved.
 *
 * Held in memory and passed by key, not as route params: a statement can
 * carry a few hundred rows, and a route param is part of a URL. Taken once —
 * reading it removes it — so a revisited screen never replays an old read.
 */
export type StatementIntake = {
  lines: StatementLine[];
  cardUpdates: StatementCardUpdate[];
  warnings: string[];
  /** The card as it was when read, to apply accepted updates on top of. */
  account: Account;
};

const intakes = new Map<string, StatementIntake>();
let nextKey = 0;

export const putStatementIntake = (intake: StatementIntake): string => {
  nextKey += 1;
  const key = `intake-${Date.now()}-${nextKey}`;
  intakes.set(key, intake);
  return key;
};

export const takeStatementIntake = (key: string | undefined): StatementIntake | undefined => {
  if (!key) return undefined;
  const intake = intakes.get(key);
  intakes.delete(key);
  return intake;
};

export const intakeFromRead = (read: StatementRead, account: Account): StatementIntake => ({
  lines: read.lines,
  cardUpdates: read.card_updates,
  warnings: read.warnings,
  account,
});

/**
 * The account payload with the accepted statement values applied. Everything
 * else is sent back as it was, because the update endpoint replaces the whole
 * account.
 */
export const applyCardUpdates = (
  account: Account,
  updates: StatementCardUpdate[],
  accepted: Partial<Record<StatementCardUpdateField, boolean>>
): AccountPayload => {
  const payload = toAccountPayload(account);
  for (const update of updates) {
    if (!accepted[update.field]) continue;
    switch (update.field) {
      case 'statement_day':
      case 'due_day':
      case 'credit_limit':
      case 'annual_fee':
      case 'fee_waiver_spend':
        payload[update.field] = Number(update.proposed);
        break;
      case 'fee_month':
      case 'last4':
        payload[update.field] = String(update.proposed);
        break;
    }
  }
  return payload;
};
