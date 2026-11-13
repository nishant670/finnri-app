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
  batchSummary,
  billFailureFor,
  billItemsFromUris,
  billNeedsAttention,
  createBatchId,
  flagBatchDuplicates,
  isPendingSave,
  ledgerDuplicateLabel,
  mergeBillsIntoOne,
  nextBillsToRead,
  roomForMoreBills,
  shortBillDate,
  spendableCredits,
  tickAffordable,
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
  createDefaultEntryForm,
  resolveAccountForEntry,
} from '@/lib/home-capture';
import { formatMoney } from '@/lib/money';
import { parseReceiptDraft } from '@/lib/parse';
import { pickReceiptPhotos } from '@/lib/receipt-photo';
import { resolveSplitDraft } from '@/lib/split-draft';
import {
  describeLikelyDuplicate,
  findLikelyDuplicate,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { notifyTransactionsChanged } from '@/lib/transaction-events';

/** How long a saved row shows its tick before it folds away (board R20-Motion). */
const SAVED_FOLD_MS = 420;
/** Delay between rows during Save all, so the ticks land one after another. */
const SAVE_STAGGER_MS = 60;
/** How long "Bill removed · Undo" stays up. */
const UNDO_MS = 4000;
const MERGED_KEY = '__one_total__';
/** See BillTrayRow: list motion is phone-only, as Reanimated web piles the tiles up. */
const LIST_MOTION = Platform.OS !== 'web';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rupees = (value: number) => formatMoney(value, { sign: 'never' });
const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

const blankForm = (): EntryForm => ({
  ...createDefaultEntryForm(),
  accountId: null,
  account: '',
  merchant: '',
  notes: '',
});

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
  const { token } = useAuthStore();
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
  const progress = useRef<Record<string, TransactionSaveProgress>>({});
  const saved = useRef({ count: 0, total: 0 });
  const closing = useRef(false);

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
        const stored = intake.origin === 'camera' ? await loadBillBatch() : null;
        if (cancelled) return;
        const keep = stored?.phase === 'pick' ? stored.items : [];
        const room = Math.max(0, MAX_BILLS_PER_BATCH - keep.length);
        setItems([...keep, ...billItemsFromUris(intake.uris.slice(0, room))]);
        if (stored?.phase === 'pick') setBatchId(stored.batchId);
        setOrigin(intake.origin);
        setReady(true);
      })();
    } else {
      void loadBillBatch().then((stored) => {
        if (cancelled) return;
        if (!stored) {
          router.back();
          return;
        }
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
  }, [intake, router]);

  // Keep the scan on disk while it is open, so Android stopping Finnri for the
  // camera does not lose the photos already taken.
  useEffect(() => {
    if (!ready || closing.current) return;
    const kept = items.filter((item) => item.status !== 'saved');
    if (kept.length === 0) return;
    void saveBillBatch({ batchId, phase, origin, items: kept });
  }, [batchId, items, origin, phase, ready]);

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

  const finish = useCallback(() => {
    closing.current = true;
    void clearBillBatch();
    if (saved.current.count > 0) {
      putBillsSavedToast(
        `${saved.current.count} ${plural(saved.current.count, 'bill')} saved · ${rupees(saved.current.total)}`
      );
      notifyTransactionsChanged();
    }
    router.back();
  }, [router]);

  const handleClose = useCallback(async () => {
    const unsaved = itemsRef.current.filter((item) => item.status === 'read').length;
    const spent = batchSummary(itemsRef.current).creditsUsed;
    if (phase === 'tray' && unsaved > 0 && spent > 0) {
      const discard = await dialog.confirm({
        title: `Discard ${unsaved} read ${plural(unsaved, 'bill')}?`,
        message: `Nothing gets saved. The ${spent} credits used for reading won't come back.`,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep checking',
        tone: 'danger',
        iconName: 'receipt-text-remove-outline',
      });
      if (!discard) return;
    }
    finish();
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
        const form = applyParsedDraftToForm(blankForm(), draft, {
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
        const match = await findLikelyDuplicate(token, form, account?.id ?? null);
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
    if (index < 0) return;
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

  /* ---- Tray: saving ------------------------------------------------------ */

  const markSaved = useCallback(
    (key: string, amount: number) => {
      saved.current = { count: saved.current.count + 1, total: saved.current.total + amount };
      update(key, (item) => ({ ...item, status: 'saved', saveError: undefined }));
      setTimeout(() => {
        if (!mounted.current) return;
        setItems((current) => current.filter((item) => item.key !== key));
      }, SAVED_FOLD_MS);
    },
    [update]
  );

  const saveForm = useCallback(
    async (form: EntryForm, item: BillItem | null, key: string, askAboutDuplicate: boolean) => {
      if (!token) throw new Error('Please sign in again before saving.');
      progress.current[key] ??= {};
      await saveNewTransaction({
        token,
        form,
        account: resolveAccountForEntry(accountsRef.current, form),
        idempotencyKey: `${batchId}-${key}`,
        source: 'receipt',
        sourceText: item?.draft?.source_text ?? 'Receipt photo',
        aiRequestId: item?.draft?.ai_request_id ?? null,
        progress: progress.current[key],
        refund:
          item?.draft?.refund_received && item.draft.refund_received.amount > 0
            ? item.draft.refund_received
            : null,
        confirmDuplicate: askAboutDuplicate
          ? (match) => dialog.confirm(describeLikelyDuplicate(match))
          : undefined,
      });
    },
    [batchId, dialog, token]
  );

  const allDone = useCallback(
    (list: BillItem[]) =>
      list.every((item) => item.status === 'saved' || !item.included || item.status === 'failed'),
    []
  );

  const saveAll = useCallback(async () => {
    if (isSavingAll) return;
    setIsSavingAll(true);
    try {
      if (saveMode === 'one') {
        const merged = mergeBillsIntoOne(itemsRef.current);
        if (!merged) return;
        const lead = itemsRef.current.find((item) => isPendingSave(item)) ?? null;
        try {
          await saveForm(merged, lead, MERGED_KEY, false);
        } catch (error) {
          void dialog.alert({
            title: "Couldn't save",
            message: error instanceof Error ? error.message : 'Try again in a moment.',
            tone: 'error',
          });
          return;
        }
        const pending = itemsRef.current.filter(isPendingSave);
        haptics.saved();
        saved.current = { count: 1, total: Number(merged.amount) };
        for (const item of pending) update(item.key, (current) => ({ ...current, status: 'saved' }));
        await wait(SAVED_FOLD_MS);
        putBillsSavedToast(`${pending.length} bills saved as one · ${rupees(Number(merged.amount))}`);
        saved.current = { count: 0, total: 0 };
        notifyTransactionsChanged();
        closing.current = true;
        void clearBillBatch();
        router.back();
        return;
      }

      const pending = itemsRef.current.filter(isPendingSave);
      for (const item of pending) {
        if (!mounted.current) return;
        if (billNeedsAttention(item) || !item.form) continue;
        update(item.key, (current) => ({ ...current, status: 'saving', saveError: undefined }));
        try {
          await saveForm(item.form, item, item.key, false);
          markSaved(item.key, Number(item.form.amount) || 0);
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
      const left = itemsRef.current;
      if (saved.current.count > 0) haptics.saved();
      if (allDone(left) && !left.some((item) => item.saveError)) finish();
    } finally {
      if (mounted.current) setIsSavingAll(false);
    }
  }, [allDone, dialog, finish, isSavingAll, markSaved, router, saveForm, saveMode, update]);

  /* ---- The form, for one bill or for One total --------------------------- */

  const openItem = openKey && openKey !== MERGED_KEY ? items.find((item) => item.key === openKey) : null;
  const mergedForm = useMemo(() => mergeBillsIntoOne(items), [items]);
  const formData = openKey === MERGED_KEY ? mergedForm : openItem?.form;

  const saveFromForm = useCallback(
    async (data: EntryForm) => {
      if (openKey === MERGED_KEY) {
        setSaveMode('one');
        const pending = itemsRef.current.filter(isPendingSave);
        const lead = pending[0] ?? null;
        await saveForm(data, lead, MERGED_KEY, true);
        haptics.saved();
        setOpenKey(null);
        putBillsSavedToast(`${pending.length} bills saved as one · ${rupees(Number(data.amount))}`);
        notifyTransactionsChanged();
        closing.current = true;
        void clearBillBatch();
        router.back();
        return;
      }
      const item = itemsRef.current.find((candidate) => candidate.key === openKey);
      if (!item || !openKey) return;
      await saveForm(data, item, openKey, true);
      haptics.saved();
      setOpenKey(null);
      markSaved(openKey, Number(data.amount) || 0);
      setTimeout(() => {
        if (mounted.current && itemsRef.current.every((candidate) => candidate.status === 'saved' || !candidate.included || candidate.status === 'failed')) {
          if (!itemsRef.current.some(isPendingSave) && batchSummary(itemsRef.current).reading === 0) {
            finish();
          }
        }
      }, SAVED_FOLD_MS + 40);
    },
    [finish, markSaved, openKey, router, saveForm]
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
    <View style={styles.header}>
      <PressableView
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => void handleClose()}
        style={styles.headerButton}
        pressedStyle={styles.pressed}>
        <MaterialCommunityIcons name="close" size={24} color={colors.text} />
      </PressableView>
      <ThemedText variant="screenTitle" style={styles.headerTitle} numberOfLines={1}>
        {title}
      </ThemedText>
      {chip ? (
        <View style={[styles.headerChip, { backgroundColor: colors.secondary }]}>
          <ThemedText variant="captionStrong">{chip}</ThemedText>
        </View>
      ) : null}
    </View>
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
                entering={LIST_MOTION ? motion.rowEntering(index) : undefined}
                exiting={LIST_MOTION && !motion.reduced ? FadeOut.duration(motion.exitDuration('base')) : undefined}
                layout={LIST_MOTION ? motion.reflow() : undefined}>
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
  const creditLine = [
    summary.creditsUsed > 0 ? `${summary.creditsUsed} credits used` : null,
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
  } else if (saveMode === 'separate' && summary.needingAttention > 0 && firstAttention) {
    primaryLabel = `${summary.needingAttention} ${plural(summary.needingAttention, 'bill needs', 'bills need')} an amount`;
    primaryAction = () => setOpenKey(firstAttention.key);
  } else if (summary.toSave === 0) {
    primaryLabel = 'Done';
    primaryAction = finish;
  } else if (saveMode === 'one') {
    primaryLabel = `Save 1 · ${rupees(mergedTotal)}`;
    primaryAction = () => void saveAll();
  } else {
    primaryLabel = `Save ${summary.toSave} · ${rupees(summary.total)}`;
    primaryAction = () => void saveAll();
  }
  const primaryDisabled = !primaryAction || isSavingAll;
  const notIncluded = items.filter((item) => !isPendingSave(item) && item.status !== 'saved');

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
          <View accessibilityRole="radiogroup" style={[styles.switchTrack, { backgroundColor: colors.secondary }]}>
            {(['separate', 'one'] as const).map((mode) => {
              const selected = saveMode === mode;
              return (
                <PressableView
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptics.select();
                    setSaveMode(mode);
                  }}
                  style={[
                    styles.switchOption,
                    selected && { backgroundColor: theme.mode === 'dark' ? colors.border : colors.card },
                  ]}
                  pressedStyle={styles.pressed}>
                  <ThemedText variant={selected ? 'bodyStrong' : 'body'}>
                    {mode === 'separate' ? `Separate (${summary.toSave})` : 'One total'}
                  </ThemedText>
                </PressableView>
              );
            })}
          </View>
        ) : null}

        {saveMode === 'one' && mergedForm ? (
          <Animated.View entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}>
            <PressableView
              accessibilityRole="button"
              accessibilityLabel={`${mergedForm.title}, ${rupees(mergedTotal)}. Open to check or change.`}
              onPress={() => setOpenKey(MERGED_KEY)}
              style={[styles.card, styles.mergedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              pressedStyle={styles.pressed}>
              <View style={styles.mergedHead}>
                <View style={styles.mergedStack}>
                  {items
                    .filter(isPendingSave)
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
                  MADE FROM {items.filter(isPendingSave).length} BILLS
                </ThemedText>
                {items.filter(isPendingSave).map((item) => (
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
                        : `${item.form?.title || 'Bill'} ${rupees(Number(item.form?.amount) || 0)}${item.duplicate ? ' · already logged' : ''}`}
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

      {undo ? (
        <Animated.View
          entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('instant'))}
          exiting={motion.reduced ? undefined : FadeOut.duration(motion.exitDuration('instant'))}
          style={[styles.undo, { bottom: bottomInset + 84, backgroundColor: theme.mode === 'dark' ? colors.card : colors.text }]}>
          <ThemedText variant="bodyStrong" style={{ color: theme.mode === 'dark' ? colors.text : colors.background }}>
            Bill removed
          </ThemedText>
          <PressableView
            accessibilityRole="button"
            onPress={restoreDropped}
            style={styles.undoButton}
            pressedStyle={styles.pressed}>
            <ThemedText variant="bodyStrong" style={{ color: colors.accent }}>
              Undo
            </ThemedText>
          </PressableView>
        </Animated.View>
      ) : null}

      <View style={[styles.footer, styles.footerRow, { paddingBottom: bottomInset, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <PressableView
          accessibilityRole="button"
          onPress={() => void handleClose()}
          style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.card }]}
          pressedStyle={styles.pressed}>
          <ThemedText variant="button">Cancel</ThemedText>
        </PressableView>
        <PressableView
          accessibilityRole="button"
          accessibilityState={{ disabled: primaryDisabled, busy: isSavingAll }}
          disabled={primaryDisabled}
          onPress={primaryAction ?? undefined}
          style={[styles.primary, styles.flex, { backgroundColor: primaryAction ? colors.accent : colors.secondary }]}
          pressedStyle={styles.pressed}>
          <ThemedText variant="button" tone={primaryAction ? 'onAccent' : 'muted'} numberOfLines={1}>
            {primaryLabel}
          </ThemedText>
        </PressableView>
      </View>

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
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  headerChip: {
    marginRight: 12,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
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
  footerRow: { flexDirection: 'row', gap: 10 },
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondary: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryWide: { height: 48, alignItems: 'center', justifyContent: 'center' },
  trayContent: { paddingBottom: 24 },
  totalBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, gap: 2 },
  total: { fontVariant: ['tabular-nums'] },
  progressTrack: { marginTop: 10, marginBottom: 4, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  switchTrack: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 4,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 4,
  },
  switchOption: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  undo: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 52,
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
});
