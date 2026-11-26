import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { Account } from './accounts';
import { ApiError } from './api-error';
import { SAVE_STEP_DEADLINE_MS, withDeadline } from './deadline';
import { cancelEntryKey, type EntryKeyCancel } from './entries';
import { formatMoney } from './money';
import {
  saveFingerprint,
  saveNewTransaction,
  type ReceivedRefund,
  type TransactionSaveProgress,
} from './transaction-composer';
import type { Transaction } from '@/types/transaction';

/**
 * Safe saving for the capture trays (`app/batch.tsx`, `app/bills.tsx`).
 *
 * `POST /v1/entries` answers a repeated Idempotency-Key with the first entry,
 * whatever the new payload says, and a request whose answer was lost may or may
 * not be in the ledger. So a tray keeps every request it has sent and not seen
 * finish: it is written to disk before it goes, it is only ever sent again
 * exactly as it was, and nothing else that holds one of its rows is saved until
 * it is finished. That is what keeps each rupee in the ledger once.
 *
 * Before saving those rows another way, the server is asked to cancel the key.
 * It answers with the entry if it has one; if not, the key can never save one,
 * so the request is dropped. A server too old to do that leaves only the resend,
 * which the person is asked about.
 */

export type TraySaveRequest = {
  /** The Idempotency-Key's suffix after the tray's batch id. */
  key: string;
  /** The tray rows this request puts in the ledger. */
  rowKeys: string[];
  form: EntryForm;
  account: Account | null;
  source: 'manual' | 'text' | 'voice' | 'receipt';
  sourceText: string;
  aiRequestId: string | null;
  refund: ReceivedRefund | null;
};

export type UnconfirmedSave = TraySaveRequest & {
  /** The Idempotency-Key it goes out with. */
  idempotencyKey: string;
  /** Which steps are done; `entry` present means the transaction is saved. */
  progress: TransactionSaveProgress;
  /** Where the receipt photo was uploaded, so a resend needn't find the file. */
  uploadedAttachment?: string | null;
};

/** The server has this one: only its later steps are left to do. */
const markEntrySaved = (
  sent: UnconfirmedSave,
  entry: NonNullable<TransactionSaveProgress['entry']>
) => {
  sent.progress.entry = entry;
  sent.progress.fingerprint = saveFingerprint(sent);
};

const fnv1a = (text: string, seed: number) => {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * One key for a total, from the rows it holds: the same total gets the same key
 * from the button and from the form, and a different set of rows never reuses
 * it. A "total" of one row is that row, so it shares the row's key. Hashed to
 * stay inside the API's 128 characters.
 */
export const totalSaveKey = (rowKeys: string[]) => {
  if (rowKeys.length === 1) return rowKeys[0];
  const joined = [...rowKeys].sort().join('|');
  return `total-${fnv1a(joined, 0x811c9dc5)}${fnv1a(joined, 0x01234567)}`;
};

/** Whether the person is asking for exactly what was already sent. */
const sameRequest = (sent: TraySaveRequest, wanted: TraySaveRequest) =>
  sent.key === wanted.key &&
  JSON.stringify([sent.form, sent.refund]) === JSON.stringify([wanted.form, wanted.refund]);

/**
 * The unconfirmed saves that must be finished before `planned` is sent: they
 * hold one of its rows, and are not simply being retried by it.
 */
const savesToFinishFirst = (unconfirmed: UnconfirmedSave[], planned: TraySaveRequest[]) => {
  const wanted = new Set(planned.flatMap((request) => request.rowKeys));
  return unconfirmed.filter(
    (sent) =>
      sent.rowKeys.some((key) => wanted.has(key)) &&
      !planned.some((request) => sameRequest(sent, request))
  );
};

/** A refusal that says this request wrote nothing. */
const wasRefused = (error: unknown, firstSend: boolean) => {
  if (!(error instanceof ApiError)) return false;
  // On a first send any 4xx (bar a timeout) means nothing was written. On a
  // resend the first one may have landed, so a passing refusal (signed out,
  // rate limited) proves nothing; only a payload that can never be accepted is
  // worth settling.
  if (firstSend) return error.status >= 400 && error.status < 500 && error.status !== 408;
  return error.status === 400 || error.status === 422;
};

type Ref<T> = { current: T };

export type SendTraySaveOptions = {
  token: string;
  batchId: string;
  request: TraySaveRequest;
  unconfirmed: Ref<UnconfirmedSave[]>;
  /** Writes the tray, with its unconfirmed saves, to disk; false if it couldn't. */
  persist: () => Promise<boolean>;
  /** Marks the rows saved, before the tray is next written. */
  onSaved: (sent: UnconfirmedSave) => void;
  confirmDuplicate?: (match: Transaction) => Promise<boolean>;
};

const cancelWithin = (token: string, key: string) =>
  withDeadline(cancelEntryKey(token, key), SAVE_STEP_DEADLINE_MS).catch((): EntryKeyCancel => ({
    state: 'unknown',
  }));

/** The server refused the key because it was cancelled: it saved nothing. */
const wasCancelled = (error: unknown) =>
  error instanceof ApiError && error.status === 409 && error.code === 'entry_key_cancelled';

/** How many cancelled keys one send steps past before giving up. */
const MAX_KEY_GENERATIONS = 20;

export const sendTraySave = async ({
  token,
  batchId,
  request,
  unconfirmed,
  persist,
  onSaved,
  confirmDuplicate,
}: SendTraySaveOptions) => {
  const earlier = unconfirmed.current.find((sent) => sent.key === request.key);
  // A key that has gone out is never sent with anything else.
  const sending: UnconfirmedSave = earlier ?? {
    ...request,
    idempotencyKey: `${batchId}-${request.key}`,
    progress: {},
  };
  const forget = () => {
    unconfirmed.current = unconfirmed.current.filter((sent) => sent.key !== sending.key);
  };
  /** True until the current key has gone to the server. */
  let unsent = !earlier;
  for (let generation = 2; ; generation += 1) {
    /** This attempt is the first time the current key goes out. */
    const firstSend = unsent;
    try {
      await saveNewTransaction({
        token,
        form: sending.form,
        account: sending.account,
        idempotencyKey: sending.idempotencyKey,
        source: sending.source,
        sourceText: sending.sourceText,
        aiRequestId: sending.aiRequestId,
        refund: sending.refund,
        progress: sending.progress,
        uploadedAttachment: sending.uploadedAttachment,
        confirmDuplicate,
        deadlines: true,
        beforeCreate: async (payload) => {
          sending.uploadedAttachment = payload.attachment;
          if (!unconfirmed.current.includes(sending)) {
            unconfirmed.current = [...unconfirmed.current, sending];
          }
          if (!(await persist())) {
            if (unsent) forget();
            throw new Error(
              "Couldn't keep a record of this save on your phone, so it wasn't sent. Free some space and try again."
            );
          }
          unsent = false;
        },
        // The next step may remove the transaction (an EMI conversion does),
        // so it waits until the disk knows the transaction was saved.
        afterStep: async () => {
          if (!(await persist())) {
            throw new Error(
              "Saved, but your phone couldn't keep a record of it, so the rest is waiting. Free some space and try again."
            );
          }
        },
      });
      break;
    } catch (error) {
      if (!sending.progress.entry && wasCancelled(error) && generation <= MAX_KEY_GENERATIONS) {
        // This key can never save anything, so the same request takes the next.
        sending.idempotencyKey = `${batchId}-${sending.key}~${generation}`;
        unsent = true;
        continue;
      }
      if (!sending.progress.entry && wasRefused(error, firstSend)) {
        if (firstSend) {
          forget();
        } else {
          // A refused resend says nothing about the first send, so settle it.
          const settled = await cancelWithin(token, sending.idempotencyKey);
          if (settled.state === 'saved') markEntrySaved(sending, settled.entry);
          if (settled.state === 'cancelled') forget();
        }
        await persist();
      }
      throw error;
    }
  }
  forget();
  onSaved(sending);
  await persist();
  return sending;
};

const rupeesIn = (saves: UnconfirmedSave[]) =>
  formatMoney(
    saves.reduce((sum, sent) => sum + (Number(sent.form.amount.replace(/,/g, '')) || 0), 0),
    { sign: 'never' }
  );

/** Asked before a save that may not be in the ledger is sent again. */
const describeFinishFirst = (saves: UnconfirmedSave[]) => ({
  title: 'Finish the last save first?',
  message: `Finnri couldn't tell whether ${rupeesIn(saves)} was saved. So it isn't counted twice, it will be sent again exactly as before. Then check what's left and save.`,
  confirmLabel: 'Send it again',
  cancelLabel: 'Go back',
  iconName: 'cloud-question' as const,
  tone: 'warning' as const,
});

/**
 * Sends each of `saves` again, unchanged. One whose transaction is saved but
 * whose later step (EMI plan, repeat, refund) still fails is let go with its
 * rows marked saved, so it can't hold the tray for ever. Throws, keeping what
 * is left, when it can't tell whether a transaction is saved.
 */
const finishEarlierSaves = async (
  saves: UnconfirmedSave[],
  options: Omit<SendTraySaveOptions, 'request' | 'confirmDuplicate'>
) => {
  let stepMissed = false;
  for (const sent of saves) {
    try {
      await sendTraySave({ ...options, request: sent });
    } catch (error) {
      if (!sent.progress.entry) throw error;
      options.unconfirmed.current = options.unconfirmed.current.filter(
        (other) => other.key !== sent.key
      );
      options.onSaved(sent);
      await options.persist();
      stepMissed = true;
    }
  }
  return stepMissed;
};

type FinishDialog = {
  confirm: (options: ReturnType<typeof describeFinishFirst>) => Promise<boolean>;
  alert: (options: {
    title: string;
    message: string;
    tone: 'info' | 'warning';
  }) => Promise<unknown>;
};

/**
 * Cancels the key of each save the server isn't known to have. Drops those it
 * cancelled. Returns whether any couldn't be settled.
 */
const settleByCancelling = async (
  saves: UnconfirmedSave[],
  { token, unconfirmed, persist }: Omit<SendTraySaveOptions, 'request' | 'confirmDuplicate'>
) => {
  let unsure = false;
  for (const sent of saves) {
    if (sent.progress.entry) continue;
    const settled = await cancelWithin(token, sent.idempotencyKey);
    if (settled.state === 'saved') {
      markEntrySaved(sent, settled.entry);
    } else if (settled.state === 'cancelled') {
      unconfirmed.current = unconfirmed.current.filter((other) => other.key !== sent.key);
    } else {
      unsure = true;
    }
  }
  await persist();
  return unsure;
};

/**
 * Before saving `planned`, settles any earlier save that holds one of its rows:
 * cancels what never arrived, and finishes the rest, asking the person first
 * when it can't tell. 'clear': nothing is in the way, carry on. 'finished' and
 * 'step-missed': those rows are saved now, so what was planned is out of date
 * and the person looks at what's left. 'declined': leave everything.
 */
export const finishBeforeSaving = async ({
  planned,
  dialog,
  ...options
}: Omit<SendTraySaveOptions, 'request' | 'confirmDuplicate' | 'token'> & {
  token: string | null;
  planned: TraySaveRequest[];
  dialog: FinishDialog;
}): Promise<'clear' | 'finished' | 'step-missed' | 'declined'> => {
  const inTheWay = savesToFinishFirst(options.unconfirmed.current, planned);
  if (inTheWay.length === 0) return 'clear';
  const { token } = options;
  if (!token) throw new Error('Please sign in again before saving.');
  const unsure = await settleByCancelling(inTheWay, { ...options, token });
  const earlier = inTheWay.filter((sent) =>
    options.unconfirmed.current.some((other) => other.key === sent.key)
  );
  if (earlier.length === 0) return 'clear';
  if (unsure && !(await dialog.confirm(describeFinishFirst(earlier)))) return 'declined';
  const stepMissed = await finishEarlierSaves(earlier, { ...options, token });
  const amount = rupeesIn(earlier);
  await dialog.alert({
    title: 'Earlier save finished',
    message: stepMissed
      ? `${amount} is saved, but its repeat, EMI plan or refund may be missing. Check it from Home.`
      : `${amount} is saved as you first sent it. To change it, edit it from Home.`,
    tone: stepMissed ? 'warning' : 'info',
  });
  return stepMissed ? 'step-missed' : 'finished';
};
