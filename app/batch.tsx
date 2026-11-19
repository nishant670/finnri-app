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
  describeLikelyDuplicate,
  findLikelyDuplicate,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import {
  MAX_ITEMS_PER_PROMPT,
  alreadyLoggedLabel,
  createDayBatchId,
  dayChipLabel,
  dayItemsFromBatch,
  daySummary,
  dayTrayIsFinished,
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
  const { token } = useAuthStore();
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
  const progress = useRef<Record<string, TransactionSaveProgress>>({});
  /** What was saved, for the toast and for Undo (P115). */
  const saved = useRef({ count: 0, out: 0, in: 0, ids: [] as number[], extras: false });

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
            const match = await findLikelyDuplicate(token, row.form, account?.id ?? null);
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
        const stored = await loadDayBatch();
        if (cancelled) return;
        if (!stored) {
          router.back();
          return;
        }
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
  useEffect(() => {
    if (!ready || closing.current || !batch) return;
    const kept = items.filter((item) => item.status !== 'saved');
    if (kept.length === 0) return;
    void saveDayBatch({ batchId, batch, inputSource, items: kept });
  }, [batch, batchId, inputSource, items, ready]);

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

  const finish = useCallback(() => {
    closing.current = true;
    void clearDayBatch();
    const done = saved.current;
    if (done.count > 0) {
      putDaySavedToast({
        message: savedToastMessage(done.count, done.out, done.in),
        undoIds: done.extras ? [] : done.ids,
      });
      notifyTransactionsChanged();
    }
    router.back();
  }, [router]);

  const handleClose = useCallback(async () => {
    const unsaved = itemsRef.current.filter((item) => item.status === 'ready').length;
    const spent = batch?.credits_charged ?? 0;
    if (unsaved > 0 && saved.current.count === 0) {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      const discard = await dialog
        .confirm({
          title: `Discard ${unsaved} ${plural(unsaved, 'expense')}?`,
          message:
            spent > 0
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
    finish();
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

  const record = useCallback((form: EntryForm, key: string) => {
    const amount = Number(form.amount) || 0;
    const entryProgress = progress.current[key] ?? {};
    const id = entryProgress.entry?.id;
    saved.current = {
      count: saved.current.count + 1,
      out: saved.current.out + (form.type.toLowerCase() === 'income' ? 0 : amount),
      in: saved.current.in + (form.type.toLowerCase() === 'income' ? amount : 0),
      ids: typeof id === 'number' ? [...saved.current.ids, id] : saved.current.ids,
      extras:
        saved.current.extras ||
        typeof id !== 'number' ||
        form.splitEnabled ||
        !!entryProgress.subscriptionCreated ||
        !!entryProgress.emiCreated ||
        !!entryProgress.refundCreated,
    };
  }, []);

  const saveForm = useCallback(
    async (form: EntryForm, item: DayItem | null, key: string, askAboutDuplicate: boolean) => {
      if (!token) throw new Error('Please sign in again before saving.');
      progress.current[key] ??= {};
      await saveNewTransaction({
        token,
        form,
        account: resolveAccountForEntry(accountsRef.current, form),
        idempotencyKey: `${batchId}-${key}`,
        source: inputSource,
        sourceText: item?.draft.source_text ?? batch?.source_text ?? '',
        aiRequestId: batch?.ai_request_id ?? null,
        progress: progress.current[key],
        refund:
          item?.draft.refund_received && item.draft.refund_received.amount > 0 ? item.draft.refund_received : null,
        confirmDuplicate: askAboutDuplicate ? (match) => dialog.confirm(describeLikelyDuplicate(match)) : undefined,
      });
      record(form, key);
    },
    [batch?.ai_request_id, batch?.source_text, batchId, dialog, inputSource, record, token]
  );

  const markSaved = useCallback(
    (key: string) => {
      update(key, (item) => ({ ...item, status: 'saved', saveError: undefined }));
      setTimeout(() => {
        if (!mounted.current) return;
        setItems((current) => current.filter((item) => item.key !== key));
      }, SAVED_FOLD_MS);
    },
    [update]
  );

  const saveOne = useCallback(
    async (item: DayItem) => {
      update(item.key, (current) => ({ ...current, status: 'saving', saveError: undefined }));
      try {
        await saveForm(item.form, item, item.key, false);
        markSaved(item.key);
      } catch (error) {
        update(item.key, (current) => ({
          ...current,
          status: 'ready',
          saveError: error instanceof Error ? error.message : "Couldn't save. Tap to try again.",
        }));
      }
    },
    [markSaved, saveForm, update]
  );

  const saveAll = useCallback(async () => {
    if (isSavingAll) return;
    setIsSavingAll(true);
    try {
      const pending = itemsRef.current.filter(isPendingSave);
      if (saveMode === 'one') {
        const folded = oneMode === 'perWay' ? mergeDayByPayment(itemsRef.current) : [mergeDayIntoOne(itemsRef.current)];
        const forms = folded.filter((form): form is EntryForm => !!form);
        try {
          for (const [index, form] of forms.entries()) {
            // A total belongs to no single item's refund or AI read.
            await saveForm(form, null, `${MERGED_KEY}-${index}`, false);
          }
        } catch (error) {
          void dialog.alert({
            title: "Couldn't save",
            message: error instanceof Error ? error.message : 'Try again in a moment.',
            tone: 'error',
          });
          return;
        }
        for (const item of pending) {
          if (!isIncome(item)) update(item.key, (current) => ({ ...current, status: 'saved' }));
        }
        // Income never folds into the day's spends (P111): it saves on its own.
        for (const item of pending.filter(isIncome)) {
          if (!mounted.current) return;
          await saveOne(item);
          await wait(SAVE_STAGGER_MS);
        }
      } else {
        for (const item of pending) {
          if (!mounted.current) return;
          if (itemNeedsAttention(item)) continue;
          await saveOne(item);
          await wait(SAVE_STAGGER_MS);
        }
      }
      await wait(SAVED_FOLD_MS);
      if (saved.current.count > 0) haptics.saved();
      if (saveMode === 'one' || dayTrayIsFinished(itemsRef.current)) finish();
    } finally {
      if (mounted.current) setIsSavingAll(false);
    }
  }, [dialog, finish, isSavingAll, oneMode, saveForm, saveMode, saveOne, update]);

  /* ---- The form, for one row or for the day's total ---------------------- */

  const openItem = openKey && openKey !== MERGED_KEY ? items.find((item) => item.key === openKey) : null;
  const mergedForm = useMemo(() => mergeDayIntoOne(items), [items]);
  const formData = openKey === MERGED_KEY ? mergedForm : openItem?.form;
  const openPosition = openItem ? items.filter((item) => item.status !== 'saved').indexOf(openItem) + 1 : 0;
  const openCount = items.filter((item) => item.status !== 'saved').length;

  const saveFromForm = useCallback(
    async (data: EntryForm) => {
      if (openKey === MERGED_KEY) {
        setSaveMode('one');
        await saveForm(data, null, MERGED_KEY, true);
        const pending = itemsRef.current.filter(isPendingSave);
        for (const item of pending) {
          if (!isIncome(item)) update(item.key, (current) => ({ ...current, status: 'saved' }));
        }
        setOpenKey(null);
        for (const item of pending.filter(isIncome)) await saveOne(item);
        haptics.saved();
        finish();
        return;
      }
      const item = itemsRef.current.find((candidate) => candidate.key === openKey);
      if (!item || !openKey) return;
      await saveForm(data, item, openKey, true);
      haptics.saved();
      setOpenKey(null);
      markSaved(openKey);
      setTimeout(() => {
        if (mounted.current && dayTrayIsFinished(itemsRef.current)) finish();
      }, SAVED_FOLD_MS + 40);
    },
    [finish, markSaved, openKey, saveForm, saveOne, update]
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
  const showSwitch = saveMode === 'one' || summary.toSave - incomeToSave.length >= 2;
  const credits = batch.credits_charged ?? 0;
  const savingCount =
    saveMode === 'one' ? (oneMode === 'perWay' ? ways.length : mergedForm ? 1 : 0) + incomeToSave.length : summary.toSave;

  let primaryLabel: string;
  let primaryAction: (() => void) | null;
  if (landing) {
    primaryLabel = `Adding ${items.length - lit} more…`;
    primaryAction = null;
  } else if (saveMode === 'separate' && summary.needingAttention > 0 && firstAttention) {
    primaryLabel = `${summary.needingAttention} ${plural(summary.needingAttention, 'needs', 'need')} an amount`;
    primaryAction = () => setOpenKey(firstAttention.key);
  } else if (summary.toSave === 0) {
    primaryLabel = 'Done';
    primaryAction = finish;
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
              onPress={() => setOpenKey(MERGED_KEY)}
              disabled={oneMode === 'perWay'}
              style={[trayStyles.card, styles.mergedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              pressedStyle={trayStyles.pressed}>
              <View style={styles.mergedHead}>
                <TimeTile slot={items.find(isPendingSave)?.slot ?? null} label="" />
                <View style={styles.mergedText}>
                  <ThemedText variant="bodyStrong" numberOfLines={1}>
                    {oneMode === 'perWay' ? `Day's spends, ${ways.length} ways paid` : mergedForm.title}
                  </ThemedText>
                  <ThemedText variant="caption" tone="muted" numberOfLines={1}>
                    {oneMode === 'perWay'
                      ? ways.map((way) => `${way.label} ${rupees(way.total)}`).join(' · ')
                      : [mergedForm.category, mergedForm.account || mergedForm.mode, chip].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText variant="bodyStrong">{rupees(mergedOut)}</ThemedText>
              </View>
              <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  MADE FROM {items.filter((item) => isPendingSave(item) && !isIncome(item)).length} EXPENSES
                </ThemedText>
                {items
                  .filter((item) => isPendingSave(item) && !isIncome(item))
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
