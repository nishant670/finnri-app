import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillTrayRow } from '@/components/bills/BillTrayRow';
import { SaveModeSwitch, TrayFooter, TrayHeader, UndoToast } from '@/components/tray/TrayParts';
import { ThemedText } from '@/components/themed-text';
import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useCountUp } from '@/hooks/use-count-up';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { accountForParsedDraft, fetchAccounts, type Account } from '@/lib/accounts';
import {
  MAX_BILLS_PER_BATCH,
  affordableBills,
  billAmount,
  batchSummary,
  billFailureFor,
  billItemsFromUris,
  billNeedsAttention,
  createBatchId,
  flagBatchDuplicates,
  foldsIntoTotal,
  isPendingSave,
  ledgerDuplicateLabel,
  mergeBillsIntoOne,
  nextBillsToRead,
  roomForMoreBills,
  shortBillDate,
  spendableCredits,
  tickAffordable,
  trayIsFinished,
  type BillItem,
} from '@/lib/bill-batch';
import {
  clearBillBatch,
  loadBillBatch,
  putBillsSavedToast,
  putSingleBill,
  saveBillBatch,
  takeBillPhotos,
  type BillPhotoOrigin,
} from '@/lib/bill-batch-store';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { captureCreditsFor } from '@/lib/credit-gate';
import { haptics } from '@/lib/haptics';
import {
  applyParsedDraftToForm,
  buildAiReview,
  createBlankEntryForm,
  resolveAccountForEntry,
} from '@/lib/home-capture';
import { formatMoney } from '@/lib/money';
import { parseReceiptDraft } from '@/lib/parse';
import { pickReceiptPhotos } from '@/lib/receipt-photo';
import { resolveSplitDraft } from '@/lib/split-draft';
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

/** How long a saved row shows its tick before it folds away (board R20-Motion). */
const SAVED_FOLD_MS = 420;
/** Delay between rows during Save all, so the ticks land one after another. */
const SAVE_STAGGER_MS = 60;
/** How long "Bill removed · Undo" stays up. */
const UNDO_MS = 4000;
const MERGED_KEY = '__one_total__';

/** What saving from the total's form would put in the ledger, as bills. */
const totalContents = (items: BillItem[]) =>
  JSON.stringify(items.filter(foldsIntoTotal).map((item) => [item.key, billAmount(item)]));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rupees = (value: number) => formatMoney(value, { sign: 'never' });
const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);


/**
 * Several bills at once (canvas Round 20, P95–P102).
 *
 * Two steps on one screen. **Pick**: the photos, ticked, with the price shown
 * before anything is read — untick or drop a photo for free. **Tray**: each bill
 * read by the ordinary bill reader, two at a time, landing in the list while
 * the rest are read; check, fix or drop them, then Save all or save them as
 * One total. One photo is handed back to Home's own scan, unchanged.
 */
export default function BillsScreen() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  /** Whose tray this is, for as long as it is open. */
  const [owner] = useState(() => user?.uuid);
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const dialog = useAppDialog();
  const bottomInset = useBottomInset(16);
  const { width: windowWidth } = useWindowDimensions();
  const smartSorting = useAppSettingsStore((state) => state.smartSorting);

  const [phase, setPhase] = useState<'pick' | 'tray'>('pick');
  const [origin, setOrigin] = useState<BillPhotoOrigin>('library');
  const [items, setItems] = useState<BillItem[]>([]);
  const [batchId, setBatchId] = useState(() => createBatchId());
  const [ready, setReady] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saveMode, setSaveMode] = useState<'separate' | 'one'>('separate');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [undo, setUndo] = useState<{ item: BillItem; index: number } | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const mounted = useRef(true);
  /** Sent but not seen to finish; kept on disk with the tray. */
  const unconfirmed = useRef<UnconfirmedSave[]>([]);
  /** One save at a time, so two can't send the same bills. */
  const saving = useRef(false);
  /** What the total held when its form opened. */
  const totalAtOpen = useRef('');
  /** Bills saved and their money; `asOne` while the only save is one total. */
  const saved = useRef({ count: 0, total: 0, asOne: false });
  const recorded = useRef(new Set<string>());
  /** Credits used by bills no longer in the list (saved and folded away, or dropped). */
  const goneCredits = useRef(0);
  const closing = useRef(false);
  /** The discard question is on screen; a second back press must not ask again. */
  const confirmOpen = useRef(false);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  /* ---- Open: photos from Home, or the tray Finnri was closed on ---------- */

  // Taken once, on first render: an effect can run twice in development, and
  // the hand-off is read-once.
  const [intake] = useState(takeBillPhotos);

  useEffect(() => {
    let cancelled = false;
    if (intake) {
      void (async () => {
        // Photos handed over now start a new scan. If Android stopped Finnri
        // in the middle of "Take another", the earlier photos come back too.
        const stored = intake.origin === 'camera' ? await loadBillBatch(Date.now(), owner) : null;
        if (cancelled) return;
        const keep = stored?.phase === 'pick' ? stored.items : [];
        const room = Math.max(0, MAX_BILLS_PER_BATCH - keep.length);
        setItems([...keep, ...billItemsFromUris(intake.uris.slice(0, room))]);
        if (stored?.phase === 'pick') setBatchId(stored.batchId);
        setOrigin(intake.origin);
        setReady(true);
      })();
    } else {
      void loadBillBatch(Date.now(), owner).then((stored) => {
        if (cancelled) return;
        if (!stored) {
          router.back();
          return;
        }
        unconfirmed.current = stored.unconfirmed ?? [];
        setBatchId(stored.batchId);
        setPhase(stored.phase);
        setOrigin(stored.origin);
        setItems(stored.items);
        setReady(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [intake, owner, router]);

  // Keep the scan on disk while it is open, so Android stopping Finnri for the
  // camera does not lose the photos already taken.
  const persist = useCallback(async () => {
    if (!ready || closing.current) return true;
    const kept = itemsRef.current.filter((item) => item.status !== 'saved');
    if (kept.length === 0) {
      await clearBillBatch();
      return true;
    }
    return saveBillBatch({ batchId, owner, phase, origin, items: kept, unconfirmed: unconfirmed.current });
  }, [batchId, origin, owner, phase, ready]);

  useEffect(() => {
    void persist();
  }, [items, persist]);

  useEffect(() => {
    if (!token) return;
    void fetchBillingStatus(token)
      .then((status) => mounted.current && setBilling(status))
      .catch(() => undefined);
    void fetchAccounts(token)
      .then((list) => mounted.current && setAccounts(list))
      .catch(() => undefined);
  }, [token]);

  const price = captureCreditsFor(billing, 'receipt');
  const spendable = spendableCredits(billing);
  const summary = useMemo(() => batchSummary(items), [items]);

  /* ---- Leaving ----------------------------------------------------------- */

  /** `warned`: the person has just been told a save is unconfirmed. */
  const finish = useCallback((warned = false) => {
    if (closing.current) return;
    closing.current = true;
    void clearBillBatch();
    const done = saved.current;
    if (done.count > 0) {
      putBillsSavedToast(
        done.asOne
          ? `${done.count} bills saved as one · ${rupees(done.total)}`
          : `${done.count} ${plural(done.count, 'bill')} saved · ${rupees(done.total)}`
      );
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
    const unsaved = itemsRef.current.filter((item) => item.status === 'read').length;
    const spent = batchSummary(itemsRef.current).creditsUsed;
    const unsure = unconfirmed.current.length > 0;
    if (phase === 'tray' && (unsure || (unsaved > 0 && spent > 0))) {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      const discard = await dialog.confirm({
        title: unsaved === 0 ? 'Close this tray?' : `Discard ${unsaved} read ${plural(unsaved, 'bill')}?`,
        message: unsure
          ? "Finnri couldn't confirm the last save, so some of this may already be saved. Check Home before adding any of it again."
          : `Nothing gets saved. The ${spent} credits used for reading won't come back.`,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep checking',
        tone: 'danger',
        iconName: 'receipt-text-remove-outline',
      }).finally(() => {
        confirmOpen.current = false;
      });
      if (!discard) return;
    }
    finish(unsure);
  }, [dialog, finish, phase]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openKey) return false;
      void handleClose();
      return true;
    });
    return () => subscription.remove();
  }, [handleClose, openKey]);

  /* ---- Pick -------------------------------------------------------------- */

  const update = useCallback((key: string, change: (item: BillItem) => BillItem) => {
    setItems((current) => current.map((item) => (item.key === key ? change(item) : item)));
  }, []);

  const toggle = useCallback(
    (key: string) => {
      haptics.select();
      update(key, (item) => ({ ...item, included: !item.included }));
    },
    [update]
  );

  const removePhoto = useCallback(
    (key: string) => {
      haptics.removed();
      const next = itemsRef.current.filter((item) => item.key !== key);
      setItems(next);
      if (next.length === 0) finish();
    },
    [finish]
  );

  const addMore = useCallback(async () => {
    const room = roomForMoreBills(itemsRef.current);
    if (room <= 0) return;
    const pick = await pickReceiptPhotos(origin, room);
    if (pick.status === 'picked') {
      setItems((current) => [...current, ...billItemsFromUris(pick.uris.slice(0, roomForMoreBills(current)))]);
      return;
    }
    if (pick.status === 'camera-denied' && !pick.canAskAgain) {
      const openSettings = await dialog.confirm({
        title: 'Camera is off for Finnri',
        tone: 'warning',
        iconName: 'camera-off',
        message: 'Turn on camera access in Settings to photograph a bill, or choose a photo instead.',
        confirmLabel: 'Open Settings',
        cancelLabel: 'Not now',
      });
      if (openSettings) void Linking.openSettings();
      return;
    }
    if (pick.status === 'failed') {
      void dialog.alert({
        title: 'That photo did not open',
        message: 'Try again, or pick a different photo of the bill.',
        tone: 'error',
      });
    }
  }, [dialog, origin]);

  const tickedCount = items.filter((item) => item.included).length;
  const affordable = affordableBills(spendable, price, tickedCount);

  const startReading = useCallback(() => {
    const chosen = tickAffordable(itemsRef.current, affordable).filter((item) => item.included);
    if (chosen.length === 0) return;
    if (chosen.length === 1) {
      // One bill reads best through Home's own scan and review sheet.
      closing.current = true;
      void clearBillBatch();
      putSingleBill(chosen[0].uri);
      router.back();
      return;
    }
    haptics.select();
    setItems(chosen);
    setPhase('tray');
  }, [affordable, router]);

  /* ---- Tray: reading ----------------------------------------------------- */

  const readBill = useCallback(
    async (key: string) => {
      const item = itemsRef.current.find((candidate) => candidate.key === key);
      if (!item || !token) return;
      try {
        const draft = await parseReceiptDraft({ token, uri: item.uri, batchId });
        if (!mounted.current) return;
        const splitDraft = resolveSplitDraft(draft, [], []);
        const form = applyParsedDraftToForm(createBlankEntryForm(), draft, {
          fallbackText: 'Receipt photo',
          attachment: item.uri,
          smartSorting,
          splitDraft,
          hintedAccount: accountForParsedDraft(draft, accountsRef.current),
        });
        const aiReview = buildAiReview(draft, 'Receipt photo', 'receipt', splitDraft, smartSorting);
        haptics.select();
        setItems((current) =>
          flagBatchDuplicates(
            current.map((candidate) =>
              candidate.key === key
                ? {
                    ...candidate,
                    status: 'read',
                    draft,
                    form,
                    aiReview,
                    failure: undefined,
                    creditsCharged: draft.credits_charged ?? price,
                  }
                : candidate
            )
          )
        );
        const account = resolveAccountForEntry(accountsRef.current, form);
        const match = await findLikelyDuplicate(token, form, account?.id ?? null, undefined, { untick: true });
        if (match && mounted.current) {
          update(key, (current) =>
            current.duplicate
              ? current
              : { ...current, included: false, duplicate: { kind: 'ledger', label: ledgerDuplicateLabel(match) } }
          );
        }
      } catch (error) {
        if (!mounted.current) return;
        haptics.rejected();
        const failure = billFailureFor(error);
        update(key, (current) => ({
          ...current,
          status: 'failed',
          failure,
          creditsCharged: failure.free ? 0 : (current.creditsCharged ?? 0),
        }));
      }
    },
    [batchId, price, smartSorting, token, update]
  );

  useEffect(() => {
    if (phase !== 'tray' || !token) return;
    const keys = nextBillsToRead(items);
    if (keys.length === 0) return;
    setItems((current) =>
      current.map((item) => (keys.includes(item.key) ? { ...item, status: 'reading' } : item))
    );
    keys.forEach((key) => void readBill(key));
  }, [items, phase, readBill, token]);

  const retry = useCallback(
    (key: string) => {
      haptics.select();
      update(key, (item) => ({ ...item, included: true, status: 'waiting', failure: undefined }));
    },
    [update]
  );

  const dropFromTray = useCallback((key: string) => {
    const index = itemsRef.current.findIndex((item) => item.key === key);
    if (index < 0 || itemsRef.current[index].status === 'reading') return;
    haptics.removed();
    goneCredits.current += itemsRef.current[index].creditsCharged ?? 0;
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
    goneCredits.current -= undo.item.creditsCharged ?? 0;
    setItems((current) => {
      const next = [...current];
      next.splice(Math.min(undo.index, next.length), 0, undo.item);
      return next;
    });
    setUndo(null);
  }, [undo]);

  /* ---- Tray: saving ------------------------------------------------------ */

  /** A save finished: its bills show their tick, then fold away. */
  const onSaved = useCallback((sent: UnconfirmedSave) => {
    if (!recorded.current.has(sent.key)) {
      recorded.current.add(sent.key);
      saved.current = {
        asOne: saved.current.count === 0 && sent.rowKeys.length > 1,
        count: saved.current.count + sent.rowKeys.length,
        total: saved.current.total + (Number(sent.form.amount) || 0),
      };
    }
    const done = new Set(sent.rowKeys);
    const tick = (item: BillItem): BillItem =>
      done.has(item.key) ? { ...item, status: 'saved', saveError: undefined } : item;
    // The ref first: the tray is written to disk before the next render.
    itemsRef.current = itemsRef.current.map(tick);
    setItems((current) => current.map(tick));
    // A dropped bill that is now saved must not come back as unsaved.
    setUndo((current) => (current && done.has(current.item.key) ? null : current));
    setTimeout(() => {
      if (!mounted.current) return;
      for (const item of itemsRef.current) {
        if (done.has(item.key)) goneCredits.current += item.creditsCharged ?? 0;
      }
      setItems((current) => current.filter((item) => !done.has(item.key)));
    }, SAVED_FOLD_MS);
  }, []);

  const requestFor = useCallback(
    (form: EntryForm, item: BillItem): TraySaveRequest => ({
      key: item.key,
      rowKeys: [item.key],
      form,
      account: resolveAccountForEntry(accountsRef.current, form),
      source: 'receipt',
      sourceText: item.draft?.source_text ?? 'Receipt photo',
      aiRequestId: item.draft?.ai_request_id ?? null,
      refund:
        item.draft?.refund_received && item.draft.refund_received.amount > 0 ? item.draft.refund_received : null,
    }),
    []
  );

  /** No single bill's refund or AI read belongs to the combined entry. */
  const totalRequestFor = useCallback((form: EntryForm, rows: BillItem[]): TraySaveRequest => {
    const rowKeys = rows.map((row) => row.key);
    return {
      key: totalSaveKey(rowKeys),
      rowKeys,
      form,
      account: resolveAccountForEntry(accountsRef.current, form),
      source: 'receipt',
      sourceText: 'Receipt photos',
      aiRequestId: null,
      refund: null,
    };
  }, []);

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
        confirmDuplicate: askAboutDuplicate
          ? (match) => dialog.confirm(describeLikelyDuplicate(match))
          : undefined,
      });
    },
    [batchId, dialog, onSaved, persist, token]
  );

  /** Finishes any earlier save holding one of these bills (`lib/tray-save.ts`). */
  const finishFirst = useCallback(
    (planned: TraySaveRequest[]) =>
      finishBeforeSaving({ planned, dialog, token, batchId, unconfirmed, persist, onSaved }),
    [batchId, dialog, onSaved, persist, token]
  );

  const finishSoonIfDone = useCallback(() => {
    setTimeout(() => {
      if (mounted.current && trayIsFinished(itemsRef.current)) finish();
    }, SAVED_FOLD_MS + 40);
  }, [finish]);

  const saveAll = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setIsSavingAll(true);
    try {
      const pending = itemsRef.current.filter(isPendingSave);
      if (saveMode === 'one') {
        const merged = mergeBillsIntoOne(pending);
        if (!merged) return;
        const folded = pending.filter(foldsIntoTotal);
        const total = totalRequestFor(merged, folded);
        try {
          const first = await finishFirst([total]);
          if (first === 'declined') return;
          if (first !== 'clear') {
            finishSoonIfDone();
            return;
          }
          await send(total, false);
        } catch (error) {
          void dialog.alert({
            title: "Couldn't save",
            message: error instanceof Error ? error.message : 'Try again in a moment.',
            tone: 'error',
          });
          return;
        }
        haptics.saved();
        await wait(SAVED_FOLD_MS);
        // A bill with no total was left out: stay, so it can be fixed.
        if (folded.length < pending.length) setSaveMode('separate');
        else finish();
        return;
      }

      const ready = pending.filter((item) => !billNeedsAttention(item) && item.form);
      try {
        const first = await finishFirst(ready.map((item) => requestFor(item.form as EntryForm, item)));
        if (first === 'declined') return;
        if (first !== 'clear') {
          finishSoonIfDone();
          return;
        }
      } catch (error) {
        void dialog.alert({
          title: "Couldn't save",
          message: error instanceof Error ? error.message : 'Try again in a moment.',
          tone: 'error',
        });
        return;
      }
      for (const item of ready) {
        if (!mounted.current) return;
        update(item.key, (current) => ({ ...current, status: 'saving', saveError: undefined }));
        try {
          await send(requestFor(item.form as EntryForm, item), false);
        } catch (error) {
          update(item.key, (current) => ({
            ...current,
            status: 'read',
            saveError: error instanceof Error ? error.message : "Couldn't save. Tap to try again.",
          }));
        }
        await wait(SAVE_STAGGER_MS);
      }
      await wait(SAVED_FOLD_MS);
      if (saved.current.count > 0) haptics.saved();
      if (trayIsFinished(itemsRef.current)) finish();
    } finally {
      saving.current = false;
      if (mounted.current) setIsSavingAll(false);
    }
  }, [
    dialog,
    finish,
    finishFirst,
    finishSoonIfDone,
    requestFor,
    saveMode,
    send,
    totalRequestFor,
    update,
  ]);

  /* ---- The form, for one bill or for One total --------------------------- */

  const openItem = openKey && openKey !== MERGED_KEY ? items.find((item) => item.key === openKey) : null;
  const mergedForm = useMemo(() => mergeBillsIntoOne(items), [items]);
  const formData = openKey === MERGED_KEY ? mergedForm : openItem?.form;

  const saveFromForm = useCallback(
    async (data: EntryForm) => {
      if (saving.current) throw new Error('Finnri is still saving. Try again in a moment.');
      const isTotal = openKey === MERGED_KEY;
      const item = isTotal ? null : itemsRef.current.find((candidate) => candidate.key === openKey);
      const request = isTotal
        ? totalRequestFor(data, itemsRef.current.filter(foldsIntoTotal))
        : item
          ? requestFor(data, item)
          : null;
      if (!request) return;
      // The form filled itself when it opened; bills can finish reading under it.
      if (isTotal && totalContents(itemsRef.current) !== totalAtOpen.current) {
        throw new Error("What's in this total changed while it was open. Close it and open it again.");
      }
      saving.current = true;
      try {
        if (isTotal) setSaveMode('one');
        const first = await finishFirst([request]);
        // The form stays as it is, with no error on it.
        if (first === 'declined') throw new DuplicateSaveCancelled();
        if (first !== 'clear') {
          setOpenKey(null);
          finishSoonIfDone();
          return;
        }
        await send(request, true);
        haptics.saved();
        setOpenKey(null);
        const leftOver =
          isTotal &&
          itemsRef.current.some((candidate) => isPendingSave(candidate) && billAmount(candidate) <= 0);
        if (leftOver) setSaveMode('separate');
        if (isTotal && !leftOver) finish();
        else if (!isTotal) finishSoonIfDone();
      } finally {
        saving.current = false;
      }
    },
    [finish, finishFirst, finishSoonIfDone, openKey, requestFor, send, totalRequestFor]
  );

  const keepDraft = useCallback(
    (data: EntryForm) => {
      if (!openKey || openKey === MERGED_KEY) return;
      update(openKey, (item) => (item.status === 'read' ? { ...item, form: data } : item));
    },
    [openKey, update]
  );

  /* ---- Render ------------------------------------------------------------ */

  const shownTotal = useCountUp(saveMode === 'one' ? Number(mergedForm?.amount ?? 0) : summary.total);
  const [trackWidth, setTrackWidth] = useState(0);
  const readFraction = summary.ticked > 0 ? summary.read / summary.ticked : 0;
  const progressDuration = motion.duration('base');
  const progressStyle = useAnimatedStyle(() => ({
    width: withTiming(trackWidth * readFraction, { duration: progressDuration }),
  }));

  if (!ready) {
    return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} />;
  }

  const header = (title: string, chip?: string) => (
    <TrayHeader title={title} chip={chip} onClose={() => void handleClose()} />
  );

  if (phase === 'pick') {
    const room = roomForMoreBills(items);
    const tiles = items.length + (room > 0 ? 1 : 0);
    const columns = tiles <= 4 ? 2 : 3;
    const gap = columns === 2 ? 14 : 10;
    const tileWidth = Math.floor((windowWidth - 40 - gap * (columns - 1)) / columns);
    const tileHeight = Math.round(tileWidth * 1.25);
    const short = spendable != null && affordable < tickedCount;
    const reading = Math.min(tickedCount, affordable);
    const chip =
      origin === 'camera'
        ? `${items.length} of ${MAX_BILLS_PER_BATCH}`
        : `${tickedCount} of ${items.length} ticked`;

    return (
      <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
        {header('Your bills', chip)}
        <ScrollView contentContainerStyle={styles.pickContent}>
          <ThemedText variant="body" tone="muted" style={styles.lead}>
            {origin === 'camera'
              ? 'One bill per photo, filling the frame. Tap ✕ to drop a shot.'
              : "Untick anything that isn't a bill. Nothing is read or charged yet."}
          </ThemedText>
          <View style={[styles.grid, { gap }]}>
            {items.map((item, index) => (
              <Animated.View
                key={item.key}
                entering={motion.rowEntering(index)}
                exiting={motion.reduced ? undefined : FadeOut.duration(motion.exitDuration('base'))}
                layout={motion.reflow()}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.included }}
                  accessibilityLabel={`Photo ${index + 1}`}
                  onPress={() => toggle(item.key)}
                  style={[
                    styles.tile,
                    {
                      width: tileWidth,
                      height: tileHeight,
                      backgroundColor: colors.secondary,
                      borderColor: item.included ? colors.accent : 'transparent',
                    },
                  ]}>
                  <Image
                    source={{ uri: item.uri }}
                    style={[StyleSheet.absoluteFill, !item.included && styles.unticked]}
                    contentFit="cover"
                  />
                  <View style={styles.tileBadge}>
                    <ThemedText variant="micro" style={styles.onPhoto}>
                      {index + 1}
                    </ThemedText>
                  </View>
                </Pressable>
                {origin === 'camera' ? (
                  <PressableView
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    onPress={() => removePhoto(item.key)}
                    style={styles.tileCorner}
                    pressedStyle={styles.pressed}>
                    <View style={styles.tileRemove}>
                      <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
                    </View>
                  </PressableView>
                ) : (
                  <Pressable
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    onPress={() => toggle(item.key)}
                    style={styles.tileCorner}>
                    <View
                      style={[
                        styles.tileTick,
                        item.included
                          ? { backgroundColor: colors.accent }
                          : { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'rgba(26,26,26,0.35)' },
                      ]}>
                      {item.included ? (
                        <MaterialCommunityIcons name="check" size={15} color={colors.onAccent} />
                      ) : null}
                    </View>
                  </Pressable>
                )}
              </Animated.View>
            ))}
            {room > 0 ? (
              <PressableView
                accessibilityRole="button"
                accessibilityLabel={origin === 'camera' ? 'Take another photo' : 'Add more photos'}
                onPress={() => void addMore()}
                style={[
                  styles.addTile,
                  { width: tileWidth, height: tileHeight, borderColor: colors.selectedBorder, backgroundColor: colors.card },
                ]}
                pressedStyle={styles.pressed}>
                <View style={[styles.addIcon, { backgroundColor: colors.accent }]}>
                  <MaterialCommunityIcons
                    name={origin === 'camera' ? 'camera-outline' : 'image-plus'}
                    size={columns === 2 ? 26 : 22}
                    color={colors.onAccent}
                  />
                </View>
                <ThemedText variant="bodyStrong">{origin === 'camera' ? 'Take another' : 'Add photos'}</ThemedText>
                <ThemedText variant="caption" tone="muted">
                  {room} more allowed
                </ThemedText>
              </PressableView>
            ) : null}
          </View>

          {room === 0 ? (
            <View style={[styles.note, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="information-outline" size={18} color={colors.text} />
              <ThemedText variant="caption" style={styles.noteText}>
                {MAX_BILLS_PER_BATCH} is the most at once. Read these, then scan more.
              </ThemedText>
            </View>
          ) : null}

          {short ? (
            <View
              accessibilityRole="alert"
              style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.warning} />
              <View style={styles.noteText}>
                <ThemedText variant="bodyStrong">You have {spendable} credits</ThemedText>
                <ThemedText variant="caption">
                  {affordable === 0
                    ? `A bill needs ${price}. Get more credits to read these.`
                    : `That's enough for ${affordable} of your ${tickedCount} bills. The first ${affordable} will be read.`}
                </ThemedText>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomInset, borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {spendable != null && !short ? (
            <ThemedText variant="caption" tone="muted" style={styles.centered}>
              You have {spendable} credits
            </ThemedText>
          ) : null}
          {short && affordable === 0 ? (
            <PressableView
              accessibilityRole="button"
              onPress={() => router.push('/billing')}
              style={[styles.primary, { backgroundColor: colors.accent }]}
              pressedStyle={styles.pressed}>
              <ThemedText variant="button" tone="onAccent">
                Get more credits
              </ThemedText>
            </PressableView>
          ) : (
            <PressableView
              accessibilityRole="button"
              disabled={reading === 0}
              onPress={startReading}
              style={[styles.primary, { backgroundColor: reading === 0 ? colors.secondary : colors.accent }]}
              pressedStyle={styles.pressed}>
              <ThemedText variant="button" tone={reading === 0 ? 'muted' : 'onAccent'}>
                {reading === 0
                  ? 'Tick a bill to read'
                  : `Read ${reading} ${plural(reading, 'bill')} · ${reading * price} credits`}
              </ThemedText>
            </PressableView>
          )}
          {short && affordable > 0 ? (
            <PressableView
              accessibilityRole="button"
              onPress={() => router.push('/billing')}
              style={styles.secondaryWide}
              pressedStyle={styles.pressed}>
              <ThemedText variant="bodyStrong">Get more credits</ThemedText>
            </PressableView>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  /* ---- Tray -------------------------------------------------------------- */

  const isReading = summary.reading > 0;
  const failedFree = items.filter((item) => item.status === 'failed' && item.failure?.free).length;
  const creditsUsed = summary.creditsUsed + goneCredits.current;
  const creditLine = [
    creditsUsed > 0 ? `${creditsUsed} credits used` : null,
    failedFree === 1
      ? "the one we couldn't read was free"
      : failedFree > 1
        ? `the ${failedFree} we couldn't read were free`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showSwitch = saveMode === 'one' || summary.toSave >= 2;
  const firstAttention = items.find((item) => billNeedsAttention(item));
  const mergedTotal = Number(mergedForm?.amount ?? 0);

  let primaryLabel: string;
  let primaryAction: (() => void) | null;
  if (isReading) {
    primaryLabel = `Reading ${summary.reading} more…`;
    primaryAction = null;
  } else if ((saveMode === 'separate' || !mergedForm) && summary.needingAttention > 0 && firstAttention) {
    primaryLabel = `${summary.needingAttention} ${plural(summary.needingAttention, 'bill needs', 'bills need')} an amount`;
    primaryAction = () => setOpenKey(firstAttention.key);
  } else if (summary.toSave === 0) {
    primaryLabel = 'Done';
    // Done leaves quietly, unless a save is still unconfirmed.
    primaryAction = () => (unconfirmed.current.length > 0 ? void handleClose() : finish());
  } else if (saveMode === 'one') {
    primaryLabel = `Save 1 · ${rupees(mergedTotal)}`;
    primaryAction = () => void saveAll();
  } else {
    primaryLabel = `Save ${summary.toSave} · ${rupees(summary.total)}`;
    primaryAction = () => void saveAll();
  }
  const notIncluded = items.filter((item) => !foldsIntoTotal(item) && item.status !== 'saved');

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {header(isReading ? `Reading ${summary.ticked} bills` : 'Check your bills')}
      <ScrollView contentContainerStyle={styles.trayContent}>
        <View style={styles.totalBlock}>
          <ThemedText variant="caption" tone="muted">
            {isReading
              ? 'So far'
              : saveMode === 'one'
                ? '1 to save'
                : `${summary.toSave} to save`}
          </ThemedText>
          <ThemedText variant="amountHero" accessibilityLiveRegion="polite" style={styles.total}>
            {rupees(Math.round(shownTotal))}
          </ThemedText>
          {isReading ? (
            <>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Bills read"
                accessibilityValue={{ min: 0, max: summary.ticked, now: summary.read }}
                onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
                style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                <Animated.View style={[styles.progressFill, { backgroundColor: colors.accent }, progressStyle]} />
              </View>
              <ThemedText variant="caption" tone="muted">
                {summary.read} of {summary.ticked} read · you can check {summary.read === 1 ? 'it' : 'them'} while the rest finish
              </ThemedText>
            </>
          ) : creditLine ? (
            <ThemedText variant="caption" tone="muted">
              {creditLine}
            </ThemedText>
          ) : null}
        </View>

        {showSwitch ? (
          <SaveModeSwitch
            mode={saveMode}
            onChange={setSaveMode}
            separateLabel={`Separate (${summary.toSave})`}
            oneLabel="One total"
          />
        ) : null}

        {saveMode === 'one' && mergedForm ? (
          <Animated.View entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}>
            <PressableView
              accessibilityRole="button"
              accessibilityLabel={`${mergedForm.title}, ${rupees(mergedTotal)}. Open to check or change.`}
              onPress={() => {
                totalAtOpen.current = totalContents(itemsRef.current);
                setOpenKey(MERGED_KEY);
              }}
              style={[styles.card, styles.mergedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              pressedStyle={styles.pressed}>
              <View style={styles.mergedHead}>
                <View style={styles.mergedStack}>
                  {items
                    .filter(foldsIntoTotal)
                    .slice(0, 2)
                    .reverse()
                    .map((item, index) => (
                      <Image
                        key={item.key}
                        source={{ uri: item.uri }}
                        contentFit="cover"
                        style={[styles.mergedThumb, { left: index === 0 ? 12 : 0, top: index === 0 ? 0 : 6, transform: [{ rotate: index === 0 ? '6deg' : '0deg' }] }]}
                      />
                    ))}
                </View>
                <View style={styles.mergedText}>
                  <ThemedText variant="bodyStrong" numberOfLines={2}>
                    {mergedForm.title}
                  </ThemedText>
                  <ThemedText variant="caption" tone="muted" numberOfLines={1}>
                    {[mergedForm.category, shortBillDate(mergedForm.date), mergedForm.account || mergedForm.mode]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText variant="bodyStrong">{rupees(mergedTotal)}</ThemedText>
              </View>
              <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  MADE FROM {items.filter(foldsIntoTotal).length} BILLS
                </ThemedText>
                {items.filter(foldsIntoTotal).map((item) => (
                  <View key={item.key} style={styles.breakdownRow}>
                    <ThemedText variant="body" numberOfLines={1} style={styles.flex}>
                      {item.form?.title || 'Bill'}
                    </ThemedText>
                    <ThemedText variant="body">{rupees(Number(item.form?.amount) || 0)}</ThemedText>
                  </View>
                ))}
              </View>
            </PressableView>
            <ThemedText variant="caption" tone="muted" style={styles.hint}>
              Category and payment come from the bigger bill. The breakdown is kept in the note. Tap to change anything.
            </ThemedText>
            {notIncluded.length > 0 ? (
              <View style={[styles.card, styles.notIncluded, { borderColor: colors.border }]}>
                <ThemedText variant="micro" tone="muted">
                  NOT INCLUDED
                </ThemedText>
                {notIncluded.map((item) => (
                  <ThemedText key={item.key} variant="body" numberOfLines={1}>
                    {item.status === 'failed'
                      ? "A bill we couldn't read"
                      : item.status === 'waiting' || item.status === 'reading'
                        ? 'A bill still being read'
                        : billAmount(item) <= 0
                          ? `${item.form?.title || 'Bill'} · needs a total`
                          : `${item.form?.title || 'Bill'} ${rupees(billAmount(item))}${item.duplicate ? ' · already logged' : ''}`}
                  </ThemedText>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {items.map((item, index) => (
              <BillTrayRow
                key={item.key}
                item={item}
                index={index}
                onToggle={toggle}
                onOpen={setOpenKey}
                onRetry={retry}
                onRemove={dropFromTray}
              />
            ))}
          </View>
        )}
        {saveMode === 'separate' ? (
          <ThemedText variant="caption" tone="muted" style={styles.hint}>
            Tap a bill to change anything. Swipe left to drop it.
          </ThemedText>
        ) : null}
      </ScrollView>

      {undo ? <UndoToast message="Bill removed" onUndo={restoreDropped} bottom={bottomInset + 84} /> : null}

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
        heading={openKey === MERGED_KEY ? 'One total' : 'Check this bill'}
        aiReview={openItem?.aiReview ?? (openKey === MERGED_KEY ? { inputSource: 'receipt' } : null)}
        accounts={accounts}
        authToken={token}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  centered: { textAlign: 'center' },
  pickContent: { paddingHorizontal: 20, paddingBottom: 24 },
  lead: { marginTop: 4, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 3,
  },
  unticked: { opacity: 0.45 },
  tileBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,26,26,0.72)',
  },
  onPhoto: { color: '#FFFFFF' },
  tileCorner: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,26,26,0.72)',
  },
  tileTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  noteText: { flex: 1, gap: 2 },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderTopWidth: 1,
  },
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryWide: { height: 48, alignItems: 'center', justifyContent: 'center' },
  trayContent: { paddingBottom: 24 },
  totalBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, gap: 2 },
  total: { fontVariant: ['tabular-nums'] },
  progressTrack: { marginTop: 10, marginBottom: 4, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mergedCard: { padding: 16, gap: 14 },
  mergedHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mergedStack: { width: 56, height: 64 },
  mergedThumb: { position: 'absolute', width: 44, height: 56, borderRadius: 9 },
  mergedText: { flex: 1, minWidth: 0, gap: 2 },
  breakdown: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 12, gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  notIncluded: { marginTop: 16, padding: 14, gap: 6 },
  hint: { marginHorizontal: 20, marginTop: 10 },
});
