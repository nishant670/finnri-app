import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayTrayRow, TimeTile } from '@/components/batch/DayTrayRow';
import { ThemedText } from '@/components/themed-text';
import {
  SaveModeSwitch,
  TrayFooter,
  TrayHeader,
  UndoToast,
  trayStyles,
  type SaveMode,
} from '@/components/tray/TrayParts';
import { TransactionFormModal, type EntryForm } from '@/components/transactions/TransactionFormModal';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useCountUp } from '@/hooks/use-count-up';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { withAlpha } from '@/constants/theme';
import { fetchAccounts, type Account } from '@/lib/accounts';
import {
  clearDayBatch,
  loadDayBatch,
  putDaySavedToast,
  saveDayBatch,
  takeDayBatch,
} from '@/lib/batch-store';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { captureCreditsFor } from '@/lib/credit-gate';
import { haptics } from '@/lib/haptics';
import { resolveAccountForEntry } from '@/lib/home-capture';
import { formatMoney } from '@/lib/money';
import { describeParseFailure, isParseAnswer, isParseBatch, parseEntryDraft, type ParseBatch } from '@/lib/parse';
import { fetchSplitFriends, fetchSplitGroups } from '@/lib/splits';
import {
  DuplicateSaveCancelled,
  describeLikelyDuplicate,
  findLikelyDuplicate,
} from '@/lib/transaction-composer';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import {
  finishBeforeSaving,
  sendTraySave,
  totalSaveKey,
  type TraySaveRequest,
  type UnconfirmedSave,
} from '@/lib/tray-save';
import {
  MAX_ITEMS_PER_PROMPT,
  alreadyLoggedLabel,
  createDayBatchId,
  dayChipLabel,
  dayItemsFromBatch,
  daySummary,
  dayTrayIsFinished,
  foldsIntoTotal,
  isIncome,
  isPendingSave,
  itemAmount,
  itemNeedsAttention,
  mergeDayByPayment,
  mergeDayIntoOne,
  paymentWays,
  phraseRanges,
  savedToastMessage,
  tileTimeLabel,
  type DayItem,
} from '@/lib/voice-batch';

/** How long a saved row shows its tick before it folds away (bill tray timings, R20-Motion). */
const SAVED_FOLD_MS = 420;
/** Delay between rows during Save all. */
const SAVE_STAGGER_MS = 60;
/** How long "Removed · Undo" stays up. */
const UNDO_MS = 4000;
/** "We heard" folds to a link this long after the last row lands. */
const HEARD_HOLD_MS = 1600;
const MERGED_KEY = '__day_total__';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rupees = (value: number) => formatMoney(value, { sign: 'never' });
const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

type OneMode = 'one' | 'perWay';

/** What saving from the total's form would put in the ledger, as rows. */
const totalContents = (items: DayItem[]) =>
  JSON.stringify(
    items
      .filter((item) => foldsIntoTotal(item) || (isPendingSave(item) && isIncome(item)))
      .map((item) => [item.key, itemAmount(item)])
  );

/** The expenses one "per way paid" total is made of. */
const rowsPaidBy = (expenses: DayItem[], way: string) =>
  expenses.filter((item) => paymentWays([item])[0]?.label === way);

/**
 * Speak your day (canvas Round 21, P103–P117).
 *
 * One spoken or typed prompt, read once, lands here as up to ten rows in the
 * order they were said, each with its time of day. Check, fix or drop them,
 * then save them separately or as one total for the day. The screen is the
 * bill tray's sibling (P117): the same parts, its own reading rules.
 */
export default function DayBatchScreen() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  /** Whose tray this is, for as long as it is open. */
  const [owner] = useState(() => user?.uuid);
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const dialog = useAppDialog();
  const bottomInset = useBottomInset(16);
  const smartSorting = useAppSettingsStore((state) => state.smartSorting);

  const [batch, setBatch] = useState<ParseBatch | null>(null);
  const [inputSource, setInputSource] = useState<'voice' | 'text'>('voice');
  const [items, setItems] = useState<DayItem[]>([]);
  const [batchId, setBatchId] = useState(() => createDayBatchId());
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>('separate');
  const [oneMode, setOneMode] = useState<OneMode>('one');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [undo, setUndo] = useState<{ item: DayItem; index: number } | null>(null);
  const [lit, setLit] = useState(0);
  const [showHeard, setShowHeard] = useState(true);
  const [readingMore, setReadingMore] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const mounted = useRef(true);
  const closing = useRef(false);
  const confirmOpen = useRef(false);
  /** Sent but not seen to finish; kept on disk with the tray. */
  const unconfirmed = useRef<UnconfirmedSave[]>([]);
  /** One save at a time, so two can't send the same rows. */
  const saving = useRef(false);
  /** What the total held when its form opened. */
  const totalAtOpen = useRef('');
  /** What was saved, for the toast and for Undo (P115). */
  const saved = useRef({ count: 0, out: 0, in: 0, ids: [] as number[], extras: false });
  const recorded = useRef(new Set<string>());

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  /* ---- Open: a batch from Home, or the tray Finnri was closed on --------- */

  const [intake] = useState(takeDayBatch);

  const flagLedgerDuplicates = useCallback(
    async (rows: DayItem[]) => {
      if (!token) return;
      await Promise.all(
        rows.map(async (row) => {
          try {
            const account = resolveAccountForEntry(accountsRef.current, row.form);
            const match = await findLikelyDuplicate(token, row.form, account?.id ?? null, undefined, { untick: true });
            if (!match || !mounted.current) return;
            setItems((current) =>
              current.map((candidate) =>
                candidate.key === row.key && !candidate.duplicate
                  ? { ...candidate, included: false, duplicate: { label: alreadyLoggedLabel(match) } }
                  : candidate
              )
            );
          } catch {
            // A failed check is no reason to stop anyone saving.
          }
        })
      );
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!intake) {
        const stored = await loadDayBatch(Date.now(), owner);
        if (cancelled) return;
        if (!stored) {
          router.back();
          return;
        }
        unconfirmed.current = stored.unconfirmed ?? [];
        setBatch(stored.batch);
        setInputSource(stored.inputSource);
        setBatchId(stored.batchId);
        setItems(stored.items);
        setLit(stored.items.length);
        setShowHeard(false);
        setReady(true);
        return;
      }
      // The rows need the accounts (a spoken "HDFC card" is one of them) and
      // the split people before they are built, so wait for both, briefly.
      const [accountList, friends, groups] = token
        ? await Promise.all([
            fetchAccounts(token).catch(() => [] as Account[]),
            fetchSplitFriends(token).catch(() => []),
            fetchSplitGroups(token).catch(() => []),
          ])
        : [[] as Account[], [], []];
      if (cancelled) return;
      setAccounts(accountList);
      accountsRef.current = accountList;
      const rows = dayItemsFromBatch(intake.batch, {
        accounts: accountList,
        smartSorting,
        inputSource: intake.inputSource,
        splitFriends: friends,
        splitGroups: groups,
      });
      setBatch(intake.batch);
      setInputSource(intake.inputSource);
      setItems(rows);
      setReady(true);
      void flagLedgerDuplicates(rows);
    })();
    return () => {
      cancelled = true;
    };
    // The intake is read once; the rest are stable for this screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake]);

  useEffect(() => {
    if (!token) return;
    void fetchBillingStatus(token)
      .then((status) => mounted.current && setBilling(status))
      .catch(() => undefined);
    if (!intake) {
      void fetchAccounts(token)
        .then((list) => mounted.current && setAccounts(list))
        .catch(() => undefined);
    }
  }, [intake, token]);

  // Keep the tray on disk while it is open.
  const persist = useCallback(async () => {
    if (!ready || closing.current || !batch) return true;
    const kept = itemsRef.current.filter((item) => item.status !== 'saved');
    if (kept.length === 0) {
      await clearDayBatch();
      return true;
    }
    return saveDayBatch({ batchId, owner, batch, inputSource, items: kept, unconfirmed: unconfirmed.current });
  }, [batch, batchId, inputSource, owner, ready]);

  useEffect(() => {
    void persist();
  }, [items, persist]);

  /* ---- Deal-in: the words light up as their rows land (P107) ------------- */

  const total = items.length;
  useEffect(() => {
    if (!ready || lit >= total) return undefined;
    if (motion.reduced) {
      setLit(total);
      return undefined;
    }
    const timers = Array.from({ length: total - lit }, (_, offset) => {
      const index = lit + offset;
      return setTimeout(() => mounted.current && setLit((value) => Math.max(value, index + 1)), motion.stagger(index));
    });
    return () => timers.forEach(clearTimeout);
    // Only a new set of rows restarts the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, total, motion.reduced]);

  useEffect(() => {
    if (!ready || lit < total || !showHeard) return undefined;
    haptics.select();
    const timer = setTimeout(() => mounted.current && setShowHeard(false), HEARD_HOLD_MS);
    return () => clearTimeout(timer);
    // Folds once, after the last row lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit >= total, ready]);

  /* ---- Leaving ----------------------------------------------------------- */

  /** `warned`: the person has just been told a save is unconfirmed. */
  const finish = useCallback((warned = false) => {
    if (closing.current) return;
    closing.current = true;
    void clearDayBatch();
    const done = saved.current;
    if (done.count > 0) {
      putDaySavedToast({
        message: savedToastMessage(done.count, done.out, done.in),
        undoIds: done.extras ? [] : done.ids,
      });
    }
    const unsure = unconfirmed.current.length > 0;
    if (done.count > 0 || unsure) notifyTransactionsChanged();
    router.back();
    // The record goes with the tray, so it must not go quietly.
    if (unsure && !warned) {
      void dialog.alert({
        title: "One save couldn't be confirmed",
        message: 'Check Home before adding any of it again.',
        tone: 'warning',
      });
    }
  }, [dialog, router]);

  const handleClose = useCallback(async () => {
    // Closing now would drop the tray before its save says how it went.
    if (saving.current) {
      void dialog.alert({ title: 'Still saving', message: 'Wait a moment, then close.', tone: 'info' });
      return;
    }
    const unsaved = itemsRef.current.filter((item) => item.status === 'ready').length;
    const spent = batch?.credits_charged ?? 0;
    const unsure = unconfirmed.current.length > 0;
    if (unsaved > 0 || unsure) {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      const someSaved = saved.current.count > 0;
      const discard = await dialog
        .confirm({
          title: unsaved === 0
            ? 'Close this tray?'
            : someSaved
            ? `Discard the other ${unsaved}?`
            : `Discard ${unsaved} ${plural(unsaved, 'expense')}?`,
          message: unsure
            ? "Finnri couldn't confirm the last save, so some of this may already be saved. Check Home before adding any of it again."
            : someSaved
              ? `The ${saved.current.count} already saved stay saved. These ${unsaved} won't be.`
              : spent > 0
                ? `Nothing gets saved. The ${spent} credits used for reading won't come back.`
                : 'Nothing gets saved.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep checking',
          tone: 'danger',
          iconName: 'playlist-remove',
        })
        .finally(() => {
          confirmOpen.current = false;
        });
      if (!discard) return;
    }
    finish(unsure);
  }, [batch?.credits_charged, dialog, finish]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openKey) return false;
      void handleClose();
      return true;
    });
    return () => subscription.remove();
  }, [handleClose, openKey]);

  /* ---- Rows -------------------------------------------------------------- */

  const update = useCallback((key: string, change: (item: DayItem) => DayItem) => {
    setItems((current) => current.map((item) => (item.key === key ? change(item) : item)));
  }, []);

  const toggle = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((candidate) => candidate.key === key);
      haptics.toggle(!item?.included);
      update(key, (current) => ({ ...current, included: !current.included }));
    },
    [update]
  );

  const dropFromTray = useCallback((key: string) => {
    const index = itemsRef.current.findIndex((item) => item.key === key);
    if (index < 0 || itemsRef.current[index].status !== 'ready') return;
    haptics.removed();
    setUndo({ item: itemsRef.current[index], index });
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const restoreDropped = useCallback(() => {
    if (!undo) return;
    setItems((current) => {
      const next = [...current];
      next.splice(Math.min(undo.index, next.length), 0, undo.item);
      return next;
    });
    setUndo(null);
  }, [undo]);

  /* ---- More than ten: read the rest as text (P114) ----------------------- */

  const overCap = batch?.over_cap_text?.trim() || null;
  const textPrice = captureCreditsFor(billing, 'text');

  const readTheRest = useCallback(async () => {
    if (!overCap || !token || readingMore) return;
    setReadingMore(true);
    try {
      const result = await parseEntryDraft({ token, hintText: overCap, multi: true });
      if (!mounted.current) return;
      if (isParseAnswer(result)) throw new Error('That reads as a question, not expenses.');
      const more: ParseBatch = isParseBatch(result)
        ? result
        : { stage: 'batch', kind: 'batch', source_text: overCap, items: [result] };
      const room = Math.max(0, MAX_ITEMS_PER_PROMPT * 2 - itemsRef.current.length);
      const rows = dayItemsFromBatch(
        { ...more, items: more.items.slice(0, room) },
        { accounts: accountsRef.current, smartSorting, inputSource: 'text' }
      );
      haptics.select();
      setBatch((current) =>
        current
          ? {
              ...current,
              over_cap_text: null,
              credits_charged: (current.credits_charged ?? 0) + (more.credits_charged ?? 0),
            }
          : current
      );
      setItems((current) => [...current, ...rows]);
      void flagLedgerDuplicates(rows);
    } catch (error) {
      if (!mounted.current) return;
      haptics.rejected();
      const failure = describeParseFailure(error);
      void dialog.alert({ title: failure.title, message: failure.message, tone: 'error' });
    } finally {
      if (mounted.current) setReadingMore(false);
    }
  }, [dialog, flagLedgerDuplicates, overCap, readingMore, smartSorting, token]);

  /* ---- Saving ------------------------------------------------------------ */

  const record = useCallback((sent: UnconfirmedSave) => {
    // A retried save lands on the same key and must not be counted, or offered
    // to Undo, twice.
    if (recorded.current.has(sent.key)) return;
    recorded.current.add(sent.key);
    const { form, progress } = sent;
    const amount = Number(form.amount) || 0;
    const id = progress.entry?.id;
    saved.current = {
      count: saved.current.count + 1,
      out: saved.current.out + (form.type.toLowerCase() === 'income' ? 0 : amount),
      in: saved.current.in + (form.type.toLowerCase() === 'income' ? amount : 0),
      ids: typeof id === 'number' ? [...saved.current.ids, id] : saved.current.ids,
      extras:
        saved.current.extras ||
        typeof id !== 'number' ||
        form.splitEnabled ||
        !!progress.subscriptionCreated ||
        !!progress.emiCreated ||
        !!progress.refundCreated,
    };
  }, []);

  /** A save finished: its rows show their tick, then fold away. */
  const onSaved = useCallback(
    (sent: UnconfirmedSave) => {
      record(sent);
      const done = new Set(sent.rowKeys);
      const tick = (item: DayItem): DayItem =>
        done.has(item.key) ? { ...item, status: 'saved', saveError: undefined } : item;
      // The ref first: the tray is written to disk before the next render.
      itemsRef.current = itemsRef.current.map(tick);
      setItems((current) => current.map(tick));
      // A dropped row that is now saved must not come back as unsaved.
      setUndo((current) => (current && done.has(current.item.key) ? null : current));
      setTimeout(() => {
        if (!mounted.current) return;
        setItems((current) => current.filter((item) => !done.has(item.key)));
      }, SAVED_FOLD_MS);
    },
    [record]
  );

  const requestFor = useCallback(
    (form: EntryForm, item: DayItem): TraySaveRequest => ({
      key: item.key,
      rowKeys: [item.key],
      form,
      account: resolveAccountForEntry(accountsRef.current, form),
      source: inputSource,
      sourceText: item.draft.source_text ?? batch?.source_text ?? '',
      aiRequestId: batch?.ai_request_id ?? null,
      refund:
        item.draft.refund_received && item.draft.refund_received.amount > 0 ? item.draft.refund_received : null,
    }),
    [batch?.ai_request_id, batch?.source_text, inputSource]
  );

  /** A total belongs to no single item's refund. */
  const totalRequestFor = useCallback(
    (form: EntryForm, rows: DayItem[]): TraySaveRequest => {
      const rowKeys = rows.map((row) => row.key);
      return {
        key: totalSaveKey(rowKeys),
        rowKeys,
        form,
        account: resolveAccountForEntry(accountsRef.current, form),
        source: inputSource,
        sourceText: batch?.source_text ?? '',
        aiRequestId: batch?.ai_request_id ?? null,
        refund: null,
      };
    },
    [batch?.ai_request_id, batch?.source_text, inputSource]
  );

  const send = useCallback(
    async (request: TraySaveRequest, askAboutDuplicate: boolean) => {
      if (!token) throw new Error('Please sign in again before saving.');
      await sendTraySave({
        token,
        batchId,
        request,
        unconfirmed,
        persist,
        onSaved,
        confirmDuplicate: askAboutDuplicate ? (match) => dialog.confirm(describeLikelyDuplicate(match)) : undefined,
      });
    },
    [batchId, dialog, onSaved, persist, token]
  );

  /** Finishes any earlier save holding one of these rows (`lib/tray-save.ts`). */
  const finishFirst = useCallback(
    async (planned: TraySaveRequest[]) => {
      const outcome = await finishBeforeSaving({
        planned,
        dialog,
        token,
        batchId,
        unconfirmed,
        persist,
        onSaved,
      });
      // Undo can't take back what may only be half made.
      if (outcome === 'step-missed') saved.current.extras = true;
      return outcome;
    },
    [batchId, dialog, onSaved, persist, token]
  );

  const finishSoonIfDone = useCallback(() => {
    setTimeout(() => {
      if (mounted.current && dayTrayIsFinished(itemsRef.current)) finish();
    }, SAVED_FOLD_MS + 40);
  }, [finish]);

  const saveOne = useCallback(
    async (item: DayItem) => {
      update(item.key, (current) => ({ ...current, status: 'saving', saveError: undefined }));
      try {
        await send(requestFor(item.form, item), false);
      } catch (error) {
        update(item.key, (current) => ({
          ...current,
          status: 'ready',
          saveError: error instanceof Error ? error.message : "Couldn't save. Tap to try again.",
        }));
      }
    },
    [requestFor, send, update]
  );

  const saveAll = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setIsSavingAll(true);
    try {
      const pending = itemsRef.current.filter(isPendingSave);
      // Income never folds into the day's spends (P111): it saves on its own.
      const alone = saveMode === 'one' ? pending.filter(isIncome) : pending.filter((item) => !itemNeedsAttention(item));
      const totals: TraySaveRequest[] = [];
      if (saveMode === 'one') {
        const expenses = pending.filter(foldsIntoTotal);
        const folded =
          oneMode === 'perWay'
            ? mergeDayByPayment(expenses).map((form, index) => ({
                form,
                rows: rowsPaidBy(expenses, paymentWays(expenses)[index].label),
              }))
            : [{ form: mergeDayIntoOne(expenses), rows: expenses }];
        for (const { form, rows } of folded) {
          if (form) totals.push(totalRequestFor(form, rows));
        }
      }
      try {
        const first = await finishFirst([...totals, ...alone.map((item) => requestFor(item.form, item))]);
        if (first === 'declined') return;
        if (first !== 'clear') {
          finishSoonIfDone();
          return;
        }
        for (const total of totals) await send(total, false);
      } catch (error) {
        void dialog.alert({
          title: "Couldn't save",
          message: error instanceof Error ? error.message : 'Try again in a moment.',
          tone: 'error',
        });
        return;
      }
      for (const item of alone) {
        if (!mounted.current) return;
        await saveOne(item);
        await wait(SAVE_STAGGER_MS);
      }
      await wait(SAVED_FOLD_MS);
      if (saved.current.count > 0) haptics.saved();
      if (dayTrayIsFinished(itemsRef.current)) finish();
      // What a total left behind is fixed and saved as rows.
      else if (totals.length > 0) setSaveMode('separate');
    } finally {
      saving.current = false;
      if (mounted.current) setIsSavingAll(false);
    }
  }, [
    dialog,
    finish,
    finishFirst,
    finishSoonIfDone,
    oneMode,
    requestFor,
    saveMode,
    saveOne,
    send,
    totalRequestFor,
  ]);

  /* ---- The form, for one row or for the day's total ---------------------- */

  const openItem = openKey && openKey !== MERGED_KEY ? items.find((item) => item.key === openKey) : null;
  // "One per way paid" with only one way left (the others have saved) is that
  // way's total, and must read and save the same from the card and the button.
  const mergedForm = useMemo(() => {
    const byWay = oneMode === 'perWay' ? mergeDayByPayment(items) : [];
    return byWay.length === 1 ? byWay[0] : mergeDayIntoOne(items);
  }, [items, oneMode]);
  const formData = openKey === MERGED_KEY ? mergedForm : openItem?.form;
  const openPosition = openItem ? items.filter((item) => item.status !== 'saved').indexOf(openItem) + 1 : 0;
  const openCount = items.filter((item) => item.status !== 'saved').length;

  const saveFromForm = useCallback(
    async (data: EntryForm) => {
      if (saving.current) throw new Error('Finnri is still saving. Try again in a moment.');
      const isTotal = openKey === MERGED_KEY;
      const item = isTotal ? null : itemsRef.current.find((candidate) => candidate.key === openKey);
      const pending = itemsRef.current.filter(isPendingSave);
      const income = isTotal ? pending.filter(isIncome) : [];
      const request = isTotal
        ? totalRequestFor(data, pending.filter(foldsIntoTotal))
        : item
          ? requestFor(data, item)
          : null;
      if (!request) return;
      // The form filled itself when it opened; rows can arrive or untick under it.
      if (isTotal && totalContents(itemsRef.current) !== totalAtOpen.current) {
        throw new Error("What's in this total changed while it was open. Close it and open it again.");
      }
      saving.current = true;
      try {
        if (isTotal) setSaveMode('one');
        const first = await finishFirst([request, ...income.map((row) => requestFor(row.form, row))]);
        // The form stays as it is, with no error on it.
        if (first === 'declined') throw new DuplicateSaveCancelled();
        if (first !== 'clear') {
          setOpenKey(null);
          finishSoonIfDone();
          return;
        }
        await send(request, true);
        setOpenKey(null);
        for (const row of income) await saveOne(row);
        if (isTotal && !dayTrayIsFinished(itemsRef.current)) setSaveMode('separate');
        haptics.saved();
        finishSoonIfDone();
      } finally {
        saving.current = false;
      }
    },
    [finishFirst, finishSoonIfDone, openKey, requestFor, saveOne, send, totalRequestFor]
  );

  const keepDraft = useCallback(
    (data: EntryForm) => {
      if (!openKey || openKey === MERGED_KEY) return;
      update(openKey, (item) => (item.status === 'ready' ? { ...item, form: data } : item));
    },
    [openKey, update]
  );

  /* ---- Render ------------------------------------------------------------ */

  const summary = useMemo(() => daySummary(items), [items]);
  const ways = useMemo(() => paymentWays(items), [items]);
  const mergedOut = Number(mergedForm?.amount ?? 0);
  const incomeToSave = items.filter((item) => isPendingSave(item) && isIncome(item));
  const unpriced = items.filter((item) => isPendingSave(item) && !isIncome(item) && itemAmount(item) <= 0);
  const shownOut = useCountUp(summary.out);
  const landing = lit < items.length;
  const chip = dayChipLabel(items);
  const ranges = useMemo(
    () => (batch ? phraseRanges(batch.source_text, items.map((item) => item.draft)) : []),
    [batch, items]
  );

  if (!ready || !batch) {
    return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} />;
  }

  const firstAttention = items.find((item) => itemNeedsAttention(item));
  const splitByWay = oneMode === 'perWay' && ways.length > 1;
  const showSwitch = saveMode === 'one' || summary.toSave - incomeToSave.length >= 2;
  const credits = batch.credits_charged ?? 0;
  const savingCount =
    saveMode === 'one' ? (oneMode === 'perWay' ? ways.length : mergedForm ? 1 : 0) + incomeToSave.length : summary.toSave;

  let primaryLabel: string;
  let primaryAction: (() => void) | null;
  if (landing) {
    primaryLabel = `Adding ${items.length - lit} more…`;
    primaryAction = null;
  } else if ((saveMode === 'separate' || savingCount === 0) && summary.needingAttention > 0 && firstAttention) {
    primaryLabel = `${summary.needingAttention} ${plural(summary.needingAttention, 'needs', 'need')} an amount`;
    primaryAction = () => setOpenKey(firstAttention.key);
  } else if (summary.toSave === 0) {
    primaryLabel = 'Done';
    // Done leaves quietly, unless a save is still unconfirmed.
    primaryAction = () => (unconfirmed.current.length > 0 ? void handleClose() : finish());
  } else {
    const out = saveMode === 'one' ? mergedOut : summary.out;
    primaryLabel = out > 0 ? `Save ${savingCount} · ${rupees(out)} out` : `Save ${savingCount}`;
    primaryAction = () => void saveAll();
  }

  const heardText = (
    <ThemedText variant="body" tone="muted" style={styles.heardText}>
      {(() => {
        const parts: React.ReactNode[] = [];
        let cursor = 0;
        const source = batch.source_text;
        ranges
          .map((range, index) => (range ? { ...range, index } : null))
          .filter((range): range is { start: number; end: number; index: number } => !!range)
          .sort((a, b) => a.start - b.start)
          .forEach((range) => {
            if (range.start < cursor) return;
            if (range.start > cursor) parts.push(source.slice(cursor, range.start));
            const on = range.index < lit;
            parts.push(
              <ThemedText
                key={range.index}
                variant="body"
                style={on ? { color: colors.text, backgroundColor: withAlpha(colors.accent, 0.22) } : undefined}>
                {source.slice(range.start, range.end)}
              </ThemedText>
            );
            cursor = range.end;
          });
        if (cursor < source.length) parts.push(source.slice(cursor));
        return parts;
      })()}
    </ThemedText>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <TrayHeader
        title={landing ? `Found ${items.length} in your day` : 'Check your day'}
        chip={chip}
        onClose={() => void handleClose()}
      />
      <ScrollView contentContainerStyle={trayStyles.trayContent}>
        <View style={trayStyles.totalBlock}>
          <ThemedText variant="caption" tone="muted">
            {landing
              ? 'So far'
              : saveMode === 'one'
                ? `${savingCount} to save`
                : `${summary.toSave} to save`}
          </ThemedText>
          <View style={styles.totalRow}>
            <ThemedText variant="amountHero" accessibilityLiveRegion="polite" style={trayStyles.total}>
              {rupees(Math.round(saveMode === 'one' ? mergedOut : shownOut))}
            </ThemedText>
            {summary.in > 0 ? (
              <ThemedText variant="bodyStrong" tone="positive">
                +{rupees(summary.in)} in
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.creditRow}>
            <ThemedText variant="caption" tone="muted">
              {credits > 0 ? `${credits} credits for the whole list` : 'Read once for the whole list'}
            </ThemedText>
            {!landing ? (
              <PressableView
                accessibilityRole="button"
                onPress={() => setShowHeard((value) => !value)}
                style={styles.linkButton}
                pressedStyle={trayStyles.pressed}>
                <ThemedText variant="captionStrong" style={styles.link}>
                  {showHeard ? 'Hide what we heard' : 'What we heard'}
                </ThemedText>
              </PressableView>
            ) : null}
          </View>
        </View>

        {showHeard ? (
          <Animated.View
            entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}
            layout={motion.reflow()}
            style={[trayStyles.card, styles.heardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText variant="micro" tone="muted">
              WE HEARD
            </ThemedText>
            {heardText}
          </Animated.View>
        ) : null}

        {showSwitch && !landing ? (
          <SaveModeSwitch
            mode={saveMode}
            onChange={setSaveMode}
            separateLabel={`Separate (${summary.toSave})`}
            oneLabel="One total for the day"
          />
        ) : null}

        {saveMode === 'one' && mergedForm ? (
          <Animated.View entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}>
            <PressableView
              accessibilityRole="button"
              accessibilityLabel={`${mergedForm.title}, ${rupees(mergedOut)}. Open to check or change.`}
              onPress={() => {
                totalAtOpen.current = totalContents(itemsRef.current);
                setOpenKey(MERGED_KEY);
              }}
              disabled={splitByWay}
              style={[trayStyles.card, styles.mergedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              pressedStyle={trayStyles.pressed}>
              <View style={styles.mergedHead}>
                <TimeTile slot={items.find(isPendingSave)?.slot ?? null} label="" />
                <View style={styles.mergedText}>
                  <ThemedText variant="bodyStrong" numberOfLines={1}>
                    {splitByWay ? `Day's spends, ${ways.length} ways paid` : mergedForm.title}
                  </ThemedText>
                  <ThemedText variant="caption" tone="muted" numberOfLines={1}>
                    {splitByWay
                      ? ways.map((way) => `${way.label} ${rupees(way.total)}`).join(' · ')
                      : [mergedForm.category, mergedForm.account || mergedForm.mode, chip].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText variant="bodyStrong">{rupees(mergedOut)}</ThemedText>
              </View>
              <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  MADE FROM {items.filter(foldsIntoTotal).length} EXPENSES
                </ThemedText>
                {items
                  .filter(foldsIntoTotal)
                  .map((item) => (
                    <View key={item.key} style={styles.breakdownRow}>
                      <ThemedText variant="body" tone="muted" style={styles.breakdownTime}>
                        {tileTimeLabel(item.form)}
                      </ThemedText>
                      <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                        {item.form.title || 'Expense'}
                      </ThemedText>
                      <ThemedText variant="body">{rupees(itemAmount(item))}</ThemedText>
                    </View>
                  ))}
              </View>
            </PressableView>

            {ways.length > 1 ? (
              <View
                accessibilityRole="summary"
                style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }]}>
                <ThemedText variant="body">
                  {oneMode === 'perWay'
                    ? `Saved as ${ways.length} totals, one per way you paid, so each balance stays right.`
                    : `Paid ${ways.length} ways. As one, all ${rupees(mergedOut)} is saved on ${ways[0].label}, so ${ways
                        .slice(1)
                        .map((way) => way.label)
                        .join(' and ')} won't show ${ways.length > 2 ? 'their share' : rupees(ways[1].total)}.`}
                </ThemedText>
                <PressableView
                  accessibilityRole="button"
                  onPress={() => {
                    haptics.select();
                    setOneMode((mode) => (mode === 'one' ? 'perWay' : 'one'));
                  }}
                  style={[styles.noticeButton, { borderColor: colors.warningBorder, backgroundColor: colors.card }]}
                  pressedStyle={trayStyles.pressed}>
                  <ThemedText variant="captionStrong">
                    {oneMode === 'one' ? `One per way paid (${ways.length})` : 'Back to one total'}
                  </ThemedText>
                </PressableView>
              </View>
            ) : null}

            {incomeToSave.length > 0 ? (
              <View style={[trayStyles.card, styles.sideCard, { borderColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  SAVED ON ITS OWN
                </ThemedText>
                {incomeToSave.map((item) => (
                  <View key={item.key} style={styles.breakdownRow}>
                    <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                      {item.form.title || 'Income'} · income is never folded in
                    </ThemedText>
                    <ThemedText variant="bodyStrong" tone="positive">
                      +{rupees(itemAmount(item))}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
            {unpriced.length > 0 ? (
              <View style={[trayStyles.card, styles.sideCard, { borderColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  NOT IN THE TOTAL · NEEDS AN AMOUNT
                </ThemedText>
                {unpriced.map((item) => (
                  <ThemedText key={item.key} variant="body" numberOfLines={1}>
                    {item.form.title || 'Expense'}
                  </ThemedText>
                ))}
              </View>
            ) : null}
            {oneMode === 'one' ? (
              <ThemedText variant="caption" tone="muted" style={trayStyles.hint}>
                Category and payment come from where most of the money went. The breakdown is kept in the note. Tap
                to change anything.
              </ThemedText>
            ) : null}
          </Animated.View>
        ) : (
          <View style={[trayStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {items.map((item, index) => (
              <DayTrayRow
                key={item.key}
                item={item}
                index={index}
                onToggle={toggle}
                onOpen={setOpenKey}
                onRemove={dropFromTray}
              />
            ))}
          </View>
        )}

        {overCap ? (
          <View
            accessibilityRole="summary"
            style={[styles.notice, { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }]}>
            <ThemedText variant="bodyStrong">More heard, not added</ThemedText>
            <ThemedText variant="body">
              “{overCap}” One read takes {MAX_ITEMS_PER_PROMPT} at most.
            </ThemedText>
            <PressableView
              accessibilityRole="button"
              accessibilityState={{ busy: readingMore }}
              disabled={readingMore}
              onPress={() => void readTheRest()}
              style={[styles.noticeButton, { borderColor: colors.warningBorder, backgroundColor: colors.card }]}
              pressedStyle={trayStyles.pressed}>
              <ThemedText variant="captionStrong">
                {readingMore ? 'Reading…' : `Read these too · ${textPrice} credits`}
              </ThemedText>
            </PressableView>
          </View>
        ) : null}

        {saveMode === 'separate' && !landing ? (
          <ThemedText variant="caption" tone="muted" style={trayStyles.hint}>
            Tap one to change anything. Swipe left to drop it.
          </ThemedText>
        ) : null}
      </ScrollView>

      {undo ? <UndoToast message="Removed" onUndo={restoreDropped} bottom={bottomInset + 84} /> : null}

      <TrayFooter
        bottomInset={bottomInset}
        onCancel={() => void handleClose()}
        primaryLabel={primaryLabel}
        onPrimary={primaryAction}
        busy={isSavingAll}
      />

      <TransactionFormModal
        visible={openKey !== null && !!formData}
        onClose={() => setOpenKey(null)}
        initialData={formData ?? undefined}
        onSave={saveFromForm}
        onDraftChange={keepDraft}
        mode="audio"
        heading={
          openKey === MERGED_KEY
            ? 'One total for the day'
            : openCount > 1
              ? `Check this expense · ${openPosition} of ${openCount}`
              : 'Check this expense'
        }
        aiReview={openItem?.aiReview ?? (openKey === MERGED_KEY ? { inputSource } : null)}
        accounts={accounts}
        authToken={token}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  creditRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  linkButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  link: { textDecorationLine: 'underline' },
  heardCard: { padding: 14, gap: 6, marginBottom: 14 },
  heardText: { lineHeight: 22 },
  mergedCard: { padding: 16, gap: 12 },
  mergedHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mergedText: { flex: 1, minWidth: 0, gap: 2 },
  breakdown: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 10, gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownTime: { width: 64, fontVariant: ['tabular-nums'] },
  notice: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  noticeButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sideCard: { marginTop: 12, padding: 14, gap: 6 },
});
