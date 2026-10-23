import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { Colors } from '@/constants/theme';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { LabelRow } from '@/components/ui/LabelRow';
import { PressableView } from '@/components/ui/PressableView';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { categoryTile } from '@/lib/categories';
import { paymentModeVisual } from '@/lib/payment-modes';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { DEFAULT_CURRENCY } from '@/constants/Currency';
import {
  TransactionFormModal,
  type EMILink,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { EntryDetailSkeleton } from '@/components/transactions/TransactionListSkeleton';
import { useTransactionDelete } from '@/components/transactions/TransactionDeleteProvider';
import { useAuthStore } from '@/hooks/use-auth-store';
import { decodeFrame, useSharedElementTarget } from '@/hooks/use-shared-element';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { Account, fetchAccounts, normalizeAccountType } from '@/lib/accounts';
import { fetchCardEMIPlans } from '@/lib/emi-plans';
import { fetchSubscriptions } from '@/lib/subscriptions';
import { fetchEntry, updateEntry } from '@/lib/entries';
import {
  buildTransactionPayload,
  createRecurringFromForm,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { buildRepeatForm } from '@/lib/repeat-entry';
import { isPdfAttachment, resolveAttachmentForDisplay } from '@/lib/uploads';
import {
  fetchNewUnreadBudgetNotification,
  fetchUnreadBudgetNotificationIds,
} from '@/lib/notifications';
import {
  fetchSplitBills,
  fetchSplitFriends,
  fetchSplitGroups,
  type SplitBill,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import {
  normalizeDateLabel,
  formatDateLabel,
  parseDateLabel,
  toTitleCase,
  resolveCategoryMetadata,
} from '@/lib/transactions';
import { formatTime, rowTimeLabel } from '@/lib/datetime';
import { formatMoney, toAmountInputValue } from '@/lib/money';
import { updateRefundStatus } from '@/lib/refundables';

export default function TransactionDetailsScreen() {
  const dialog = useAppDialog();
  const sheetBottom = useBottomInset(40);
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    category?: string;
    amount?: string;
    entryType?: 'income' | 'expense';
    section?: string;
    mode?: string;
    notes?: string;
    merchant?: string;
    dateLabel?: string;
    tag?: string;
    edit?: string;
    repeat?: string;
    originIcon?: string;
    originAmount?: string;
    reviewFocus?: 'category' | 'account' | '';
    reviewFields?: string;
    categorySuggestions?: string;
  }>();

  const { token } = useAuthStore();
  const [transaction, setTransaction] = useState<any>(null); // Using any to be flexible with API response initially
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const { requestDelete } = useTransactionDelete();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [isRepeatModalVisible, setIsRepeatModalVisible] = useState(false);
  const [repeatForm, setRepeatForm] = useState<EntryForm | null>(null);
  const repeatIdempotencyKey = useRef<string | null>(null);
  const repeatSaveProgress = useRef<TransactionSaveProgress>({});
  const repeatRequested = useRef(false);
  // What an EMI-tagged entry is already tied to: a card's EMI plan, or a bank EMI
  // that repeats as an auto-debit. Shown in the edit sheet.
  const [emiLink, setEmiLink] = useState<EMILink | null>(null);
  const [splitBill, setSplitBill] = useState<SplitBill | null>(null);
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);


  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const entryID = Number(params.id);

  /**
   * Arriving with `edit=1` — from the row's swipe action — opens the sheet, but
   * only once this screen has finished being pushed.
   *
   * **Not a nicety: without the wait the sheet does not open at all.** The push
   * runs for `motion.exitDuration('sheet')`, and the entry that satisfies this
   * condition (the fetch landing) reliably falls inside it. The sheet's own
   * entrance is a Reanimated spring assigned to a shared value, and a spring
   * started while the native stack is still animating the screen it lives on is
   * lost — `visible` goes true, the modal mounts, and the panel stays parked at
   * `SCREEN_HEIGHT` off the bottom of the screen. What you get is the detail
   * screen with an invisible sheet on top of it, which is what C5's Edit action
   * did on every tap.
   *
   * `transitionEnd` rather than a timeout, because the number would be a second
   * copy of the navigator's duration — and the two would drift the first time
   * C6's 240ms is retuned. `e.data.closing` is checked so a *pop* cannot open
   * a sheet on the way out.
   */
  const navigation = useNavigation();
  const [pushSettled, setPushSettled] = useState(false);

  /**
   * C9 — the icon and the amount arrive from the row that was tapped.
   *
   * Two elements rather than one, and they are not the same kind of thing: the
   * icon is a box and scales by width, the amount is *text* and scales by
   * height. The row says `-₹150` and this screen says `₹150`, so a width ratio
   * would scale the figure by the width of a minus sign.
   *
   * Both degrade to nothing when the screen was reached any other way — a deep
   * link, the Edit action, the notification feed — because there is no frame to
   * come from and a transition out of nowhere is worse than none.
   */
  const heroIconRef = useRef<View>(null);
  const heroAmountRef = useRef<View>(null);
  const originIcon = useMemo(() => decodeFrame(params.originIcon), [params.originIcon]);
  const originAmount = useMemo(() => decodeFrame(params.originAmount), [params.originAmount]);
  const iconTravel = useSharedElementTarget(heroIconRef, originIcon, 'width', pushSettled);
  const amountTravel = useSharedElementTarget(heroAmountRef, originAmount, 'height', pushSettled);

  /**
   * Going back plays the travel in reverse, then pops.
   *
   * Both halves are asked to reverse and the *pop* waits for the icon only —
   * they run on the same clock and finish together, and threading two
   * completions into one navigation is a race with nothing to gain. The amount
   * is simply told to go home at the same moment.
   */
  const dismiss = useCallback(() => {
    amountTravel.reverse(() => {});
    iconTravel.reverse(() => router.back());
  }, [amountTravel, iconTravel, router]);

  // The hardware and gesture back have to play it too, or the one route out
  // that most people use is the one that snaps.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!iconTravel.active) return false;
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [dismiss, iconTravel.active]);

  useEffect(() => {
    const unsubscribe = navigation.addListener(
      // @ts-expect-error — `transitionEnd` is a native-stack event and is not in
      // the base navigation event map that expo-router's types expose.
      'transitionEnd',
      (event: { data?: { closing?: boolean } }) => {
        if (!event?.data?.closing) setPushSettled(true);
      }
    );
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (params.edit === '1' && transaction && !isLoading && pushSettled) {
      setIsEditModalVisible(true);
    }
  }, [isLoading, params.edit, pushSettled, transaction]);

  // Hydrate state from params initially, then update with API data
  const displayData = transaction || {
    id: params.id,
    title: params.name,
    category: params.category,
    amount: Number(params.amount ?? 0),
    type: params.entryType,
    mode: params.mode,
    notes: params.notes,
    merchant: params.merchant,
    date: params.dateLabel, // formatted date label
    tag: params.tag,
    // missing fields from params will be undefined
  };

  const fetchTransactionDetails = useCallback(async () => {
    if (!token || !params.id) return;
    try {
      const data = await fetchEntry(token, params.id);
      // Normalize API data to match display structure
      const normalized = {
        ...data,
        // Ensure consistency in naming
        title: data.title,
        type: data.type,
        amount: Number(data.amount),
        date: data.date ? normalizeDateLabel(data.date) : params.dateLabel,
        rawDate: data.date,
        time: formatTime(data.time),
        tag: data.tag ? toTitleCase(data.tag) : data.tag,
      };
      setTransaction(normalized);
    } catch (error) {
      console.error('Failed to fetch transaction details', error);
    } finally {
      setIsLoading(false);
    }
  }, [params.dateLabel, params.id, token]);

  const fetchSplitDetails = useCallback(async () => {
    if (!token || !Number.isFinite(entryID) || entryID <= 0) {
      return;
    }

    try {
      const [bills, friends, groups] = await Promise.all([
        fetchSplitBills(token),
        fetchSplitFriends(token),
        fetchSplitGroups(token),
      ]);
      setSplitBill(bills.find((bill) => Number(bill.entry_id) === entryID) ?? null);
      setSplitFriends(friends);
      setSplitGroups(groups);
    } catch (error) {
      console.error('Failed to fetch split details', error);
      setSplitBill(null);
      setSplitFriends([]);
      setSplitGroups([]);
    }
  }, [entryID, token]);

  useEffect(() => {
    void fetchTransactionDetails();
    if (token) {
      fetchAccounts(token)
        .then(setAccounts)
        .catch(() => setAccounts([]))
        .finally(() => setAccountsLoaded(true));
      void fetchSplitDetails();
    }
  }, [fetchSplitDetails, fetchTransactionDetails, token]);

  const amountValue = Math.abs(Number(displayData.amount || 0));
  const reviewFields = String(params.reviewFields ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  const isReviewEdit = params.edit === '1' && reviewFields.length > 0;
  const categorySuggestions = useMemo(() => {
    if (!params.categorySuggestions) return [];
    try {
      const parsed = JSON.parse(params.categorySuggestions);
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        : [];
    } catch {
      return [];
    }
  }, [params.categorySuggestions]);

  const meta = resolveCategoryMetadata(displayData.category, displayData.type);
  const isIncomeEntry = String(displayData.type ?? '').toLowerCase() === 'income';
  const icon = meta.icon;
  const iconColor = meta.color;
  const bgColor = meta.bgColor;

  const receiptUrl = displayData.attachment || null;
  const [displayReceiptUrl, setDisplayReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDisplayReceiptUrl(null);
    if (!receiptUrl || !token)
      return () => {
        active = false;
      };
    resolveAttachmentForDisplay(token, receiptUrl)
      .then((url) => {
        if (active) setDisplayReceiptUrl(url);
      })
      .catch(() => {
        if (active) setDisplayReceiptUrl(null);
      });
    return () => {
      active = false;
    };
  }, [receiptUrl, token]);

  const handleOpenReceipt = async () => {
    if (!displayReceiptUrl) return;
    try {
      await WebBrowser.openBrowserAsync(displayReceiptUrl);
    } catch {
      void dialog.alert({
        title: 'Receipt unavailable',
        message: 'This receipt could not be opened right now.',
        tone: 'danger',
      });
    }
  };

  const loadEmiLink = useCallback(async () => {
    if (!token || !transaction || transaction.tag !== 'EMI') {
      setEmiLink(null);
      return;
    }
    try {
      const account = accounts.find((item) => item.id === transaction.account_id);
      if (account && normalizeAccountType(account.type) === 'credit_card') {
        const plans = await fetchCardEMIPlans(token, account.id);
        const plan = plans.find(
          (item) =>
            item.source_entry_id === entryID ||
            item.installments?.some((installment) => installment.entry_id === entryID)
        );
        setEmiLink(
          plan ? { kind: 'plan', plan, onOpen: () => router.push(`/emi-plans/${plan.id}`) } : null
        );
        return;
      }
      // A bank EMI has no foreign key to its recurring payment, so it is found
      // by what identifies one: an EMI-tagged recurring payment on the same
      // account for the same amount, under this entry's title or merchant.
      const subscriptions = await fetchSubscriptions(token, 'all');
      const names = [transaction.title, transaction.merchant]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter(Boolean);
      const match = subscriptions.find(
        (item) =>
          item.transaction_tag === 'EMI' &&
          item.account_id === transaction.account_id &&
          Number(item.amount) === Number(transaction.amount) &&
          names.includes(item.name.trim().toLowerCase())
      );
      setEmiLink(match ? { kind: 'recurring', subscription: match } : null);
    } catch {
      // The sheet still works without it; it just offers the repeat again.
      setEmiLink(null);
    }
  }, [accounts, entryID, router, token, transaction]);

  useEffect(() => {
    void loadEmiLink();
  }, [loadEmiLink]);

  const handleEdit = () => {
    setIsEditModalVisible(true);
  };

  const handleDelete = () => {
    setIsDeleteConfirmVisible(true);
  };

  /** After a save that may have crossed a budget: offer to go and look. */
  const offerBudgetAlert = async (budgetNotificationIds: Set<number>) => {
    if (!token) return;
    const notification = await fetchNewUnreadBudgetNotification(token, budgetNotificationIds).catch(
      () => null
    );
    if (
      notification &&
      (await dialog.confirm({
        title: notification.title,
        message: notification.body,
        confirmLabel: 'View Budgets',
        cancelLabel: 'Later',
        iconName: 'wallet-outline',
      }))
    ) {
      router.push('/budgets');
    }
  };

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmVisible(false);
  };

  const confirmDelete = () => {
    requestDelete({
      id: params.id,
      name: displayData.title || displayData.merchant || 'Untitled transaction',
    });
    setIsDeleteConfirmVisible(false);
    router.back();
  };

  const handleSaveUpdate = async (formData: EntryForm) => {
    try {
      if (!token) throw new Error('Please sign in again.');

      const payload = await buildTransactionPayload(token, formData, {
        refundStatus: displayData.refund_status ?? 'pending',
      });
      if (!formData.splitEnabled && splitBill) payload.split = null;

      if (!token) throw new Error('Please sign in again.');
      const budgetNotificationIds =
        formData.type === 'Expense'
          ? await fetchUnreadBudgetNotificationIds(token).catch(() => new Set<number>())
          : new Set<number>();
      await updateEntry(token, params.id, payload);

      // An EMI that was not repeating can start to, from here: the same record a
      // new transaction creates. Skipped when one is already tied to this entry.
      if (formData.subscriptionEnabled && formData.subscriptionBillingInterval && !emiLink) {
        const account = accounts.find((item) => item.id === formData.accountId) ?? null;
        await createRecurringFromForm(token, formData, account);
      }

      // Refresh logic
      await fetchTransactionDetails();
      await fetchSplitDetails();
      notifyTransactionsChanged();
      setIsEditModalVisible(false);
      if (isReviewEdit) {
        router.back();
        return;
      }
      if (formData.type === 'Expense') {
        await offerBudgetAlert(budgetNotificationIds);
      }
    } catch (error) {
      console.error(error);
      throw error instanceof Error ? error : new Error("Couldn't update this transaction.");
    }
  };

  /**
   * A new transaction, not an update: the same save Home does, so a repeat
   * gets the same idempotency, EMI and budget handling as any other entry.
   */
  const handleSaveRepeat = async (formData: EntryForm) => {
    if (!token) throw new Error('Please sign in again before saving this transaction.');
    if (!repeatIdempotencyKey.current) {
      repeatIdempotencyKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const budgetNotificationIds =
      formData.type === 'Expense'
        ? await fetchUnreadBudgetNotificationIds(token).catch(() => new Set<number>())
        : new Set<number>();
    const { convertedToEMI } = await saveNewTransaction({
      token,
      form: formData,
      account: accounts.find((account) => account.id === formData.accountId) ?? null,
      idempotencyKey: repeatIdempotencyKey.current,
      progress: repeatSaveProgress.current,
    });
    repeatIdempotencyKey.current = null;
    repeatSaveProgress.current = {};
    notifyTransactionsChanged();
    setIsRepeatModalVisible(false);
    // This entry has done its job. Back on the list, the copy is the first row
    // under Today — which is the confirmation, without a toast to say so.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/transactions');
    }
    if (formData.type === 'Expense' && !convertedToEMI) {
      void offerBudgetAlert(budgetNotificationIds);
    }
  };

  const hasMerchant = Boolean(displayData.merchant) && displayData.merchant !== 'Unknown Location';
  const splitParticipants = splitBill?.participants ?? [];
  const splitExpectedBack = splitParticipants
    .filter((participant) => participant.direction === 'friend_owes_user')
    .reduce((sum, participant) => sum + Number(participant.share_amount || 0), 0);
  const splitYouOwe = splitParticipants
    .filter((participant) => participant.direction === 'user_owes_friend')
    .reduce((sum, participant) => sum + Number(participant.share_amount || 0), 0);

  const handleRefundStatus = async (status: 'received' | 'written_off') => {
    if (!token || !displayData.refundable_amount) return;
    const verb = status === 'received' ? 'mark this refund received' : 'write this refund off';
    if (
      !(await dialog.confirm({
        title: status === 'received' ? 'Refund received?' : 'Write off refund?',
        message:
          status === 'received'
            ? 'This closes the reminder. Record the incoming money separately if it should appear in your ledger.'
            : 'This closes the reminder and keeps the original expense unchanged.',
        confirmLabel: status === 'received' ? 'Mark received' : 'Write off',
        cancelLabel: 'Cancel',
      }))
    ) {
      return;
    }
    try {
      const updated = await updateRefundStatus(token, params.id, status);
      setTransaction((current: any) => ({ ...current, ...updated }));
      notifyTransactionsChanged();
    } catch (error) {
      await dialog.alert({
        title: 'Refund not updated',
        message: error instanceof Error ? error.message : `Could not ${verb}.`,
        tone: 'danger',
      });
    }
  };

  // Prepare initial form data for Modal
  const editInitialData: EntryForm = {
    title: displayData.title || '',
    amount: amountValue.toString(),
    type: displayData.type ? (toTitleCase(displayData.type) ?? 'Expense') : 'Expense',
    mode: displayData.mode || 'Cash',
    category: isReviewEdit ? (displayData.category ?? '') : displayData.category || 'Food',
    date: displayData.date || formatDateLabel(new Date()),
    time: displayData.time || formatTime(new Date()) || '',
    notes: displayData.notes || '',
    tag: displayData.tag || 'General',
    currency: displayData.currency || DEFAULT_CURRENCY,
    accountId: displayData.account_id || null,
    account:
      displayData.account?.name ||
      accounts.find((account) => account.id === displayData.account_id)?.name ||
      '',
    merchant: displayData.merchant || '',
    attachment: displayData.attachment || null,
    splitEnabled: Boolean(splitBill),
    splitGroupId: splitBill?.group_id ?? null,
    splitGroupName: '',
    splitParticipants: splitParticipants.map((participant) => ({
      friendId: participant.friend_id,
      friendName: participant.friend?.name ?? '',
      shareAmount: toAmountInputValue(participant.share_amount),
      direction: participant.direction,
    })),
    refundableAmount:
      displayData.refundable_amount != null
        ? toAmountInputValue(displayData.refundable_amount)
        : '',
    refundExpectedOn: displayData.refund_expected_on
      ? normalizeDateLabel(displayData.refund_expected_on)
      : '',
    refundReminderEnabled: Boolean(displayData.refund_reminder_at),
    emiTenureMonths: '',
    emiRatePct: '',
    emiTotalInstalments: '',
    emiPaidInstalments: '',
    subscriptionEnabled: false,
    subscriptionName: '',
    subscriptionMerchant: '',
    subscriptionCategory: '',
    subscriptionAmount: '',
    subscriptionBillingInterval: '',
    subscriptionNextDueDate: '',
    subscriptionReminderDays: '3',
    subscriptionCancelBeforeDue: false,
    subscriptionCancelOnDate: '',
    subscriptionAutopay: false,
    subscriptionNotes: '',
  };

  /**
   * Repeat waits for the saved entry and the accounts. The row's params carry
   * no account or time, and the sheet drops an account it cannot find in its
   * list — so opening any earlier would repeat the spend into the wrong place.
   */
  const repeatReady = Boolean(transaction) && accountsLoaded;

  const openRepeat = () => {
    if (!repeatReady) return;
    repeatIdempotencyKey.current = null;
    repeatSaveProgress.current = {};
    setRepeatForm(
      buildRepeatForm(
        { ...editInitialData, category: displayData.category || 'Food' },
        {
          accountType:
            displayData.account?.type ??
            accounts.find((account) => account.id === displayData.account_id)?.type,
        }
      )
    );
    setIsRepeatModalVisible(true);
  };

  // `repeat=1` comes from the row's swipe action, and waits for the push to
  // land for the same reason `edit=1` does. Once only: the refetch after a save
  // must not open it again.
  useEffect(() => {
    if (params.repeat === '1' && !repeatRequested.current && repeatReady && pushSettled) {
      repeatRequested.current = true;
      openRepeat();
    }
    // `openRepeat` is rebuilt every render; the ref is what keeps this to once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.repeat, pushSettled, repeatReady]);

  /**
   * The skeleton is for arriving with *nothing*, which on this screen is rarer
   * than it looks.
   *
   * A tap on a row hands over the title, the amount, the category and the date
   * as params — that is what `displayData` hydrates from, and it is why the
   * hero can be drawn in the first frame. Gating the whole screen on the fetch
   * replaces content the screen already has with placeholders for it, which is
   * a slower screen wearing the costume of a faster one. It also breaks C9
   * outright: the icon the row travels into does not exist until the fetch
   * lands, by which point the screen has finished arriving and the travel plays
   * to an audience that has already looked away.
   *
   * A deep link from a notification carries only an id, and that is the case
   * the skeleton is for.
   */
  const hasPreview = Boolean(params.name || params.amount);

  const tile = categoryTile({ color: iconColor, bgColor }, colorScheme);
  const accountName =
    displayData.account?.name ||
    accounts.find((account) => account.id === displayData.account_id)?.name ||
    '';
  /** "Expense · Sun, 11 Oct 2026, 8:53 pm" (board R4-Detail). */
  const heroCaption = (() => {
    const day = parseDateLabel(displayData.date);
    const date = day
      ? day.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : displayData.date || 'No date';
    const time = displayData.time ? rowTimeLabel(displayData.time) : '';
    return [isIncomeEntry ? 'Income' : 'Expense', [date, time].filter(Boolean).join(', ')].join(' · ');
  })();

  if (isLoading && !transaction && !hasPreview) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <EntryDetailSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header (board R4-Detail): back, and the title centred. */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={dismiss}
          style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          Transaction
        </ThemedText>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* HERO: icon, amount, title, one caption. */}
        <View style={styles.hero}>
          <Animated.View
            ref={heroIconRef}
            collapsable={false}
            onLayout={iconTravel.onLayout}
            style={[styles.heroIcon, { backgroundColor: tile.background }, iconTravel.style]}>
            <MaterialCommunityIcons name={icon as any} size={24} color={tile.foreground} />
          </Animated.View>

          <Animated.View
            ref={heroAmountRef}
            collapsable={false}
            onLayout={amountTravel.onLayout}
            style={amountTravel.style}>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.amount, { color: isIncomeEntry ? theme.positive : theme.text }]}>
              {formatMoney(isIncomeEntry ? amountValue : -amountValue, { sign: 'always' })}
            </ThemedText>
          </Animated.View>

          <ThemedText style={[styles.heroTitle, { color: theme.text }]}>
            {displayData.title || 'Untitled transaction'}
          </ThemedText>
          <ThemedText tone="muted" style={styles.heroCaption}>
            {heroCaption}
          </ThemedText>
        </View>

        {/* DETAILS: read-only rows; an empty field has no row. */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <LabelRow
            label="Category"
            value={displayData.category || 'Uncategorised'}
            icon={icon as any}
            iconColor={tile.foreground}
          />
          <LabelRow
            label={isIncomeEntry ? 'Received via' : 'Paid with'}
            value={displayData.mode || 'Not set'}
            icon={paymentModeVisual(displayData.mode).icon}
            iconColor={theme.text}
            detail={`· ${accountName || 'no account linked'}`}
            divider
          />
          {hasMerchant ? (
            <LabelRow
              label="Merchant"
              value={displayData.merchant}
              icon="storefront-outline"
              iconColor={theme.text}
              divider
            />
          ) : null}
          {/* Not on income: every tag but General is about money going out. */}
          {!isIncomeEntry && displayData.tag ? (
            <LabelRow label="Tag" value={displayData.tag} divider />
          ) : null}
          {displayData.notes ? (
            <LabelRow label="Note" divider>
              <ThemedText style={[styles.note, { color: theme.text }]}>{displayData.notes}</ThemedText>
            </LabelRow>
          ) : null}
        </View>

        {splitBill && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.splitHeader}>
              <View style={[styles.splitTile, { backgroundColor: theme.selectedFill }]}>
                <MaterialCommunityIcons name="account-multiple-outline" size={20} color={theme.text} />
              </View>
              <View style={styles.flex}>
                <ThemedText tone="muted" style={styles.caption}>
                  Split with
                </ThemedText>
                <ThemedText style={[styles.rowTitle, { color: theme.text }]}>
                  {splitBill.group?.name || 'Friends'}
                </ThemedText>
              </View>
              <ThemedText style={[styles.rowAmount, { color: theme.text }]}>
                {formatMoney(splitBill.total_amount || amountValue, { sign: 'never' })}
              </ThemedText>
            </View>
            {splitParticipants.map((participant) => (
              <LabelRow
                key={`${participant.friend_id}-${participant.direction}`}
                label={participant.direction === 'friend_owes_user' ? 'Owes you' : 'You owe'}
                divider>
                <ThemedText numberOfLines={1} style={[styles.flex, styles.rowValue, { color: theme.text }]}>
                  {participant.friend?.name || 'Friend'}
                </ThemedText>
                <ThemedText style={[styles.rowValue, { color: theme.text }]}>
                  {formatMoney(participant.share_amount, { sign: 'never' })}
                </ThemedText>
              </LabelRow>
            ))}
            <View style={[styles.splitTotals, { borderTopColor: theme.border }]}>
              <View style={styles.flex}>
                <ThemedText tone="muted" style={styles.caption}>
                  Owed to you
                </ThemedText>
                <ThemedText tone="positive" style={styles.rowAmount}>
                  {formatMoney(splitExpectedBack, { sign: 'never' })}
                </ThemedText>
              </View>
              <View style={styles.flex}>
                <ThemedText tone="muted" style={styles.caption}>
                  You owe
                </ThemedText>
                <ThemedText tone="negative" style={styles.rowAmount}>
                  {formatMoney(splitYouOwe, { sign: 'never' })}
                </ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* PAPER TRAIL */}
        {receiptUrl ? (
          isPdfAttachment(receiptUrl) ? (
            <PressableView
              onPress={handleOpenReceipt}
              accessibilityRole="button"
              accessibilityLabel="Open receipt PDF"
              style={[styles.card, styles.receiptRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name="file-pdf-box" size={24} color={theme.text} />
              <View style={styles.flex}>
                <ThemedText style={[styles.rowTitle, { color: theme.text }]}>Receipt PDF</ThemedText>
                <ThemedText tone="muted" style={styles.caption}>
                  Tap to open
                </ThemedText>
              </View>
              <MaterialCommunityIcons name="open-in-new" size={18} color={theme.muted} />
            </PressableView>
          ) : (
            <Pressable
              onPress={handleOpenReceipt}
              accessibilityRole="imagebutton"
              accessibilityLabel="Open receipt image"
              style={[styles.card, { borderColor: theme.border }]}>
              <Image
                source={{ uri: displayReceiptUrl ?? undefined }}
                style={{ width: '100%', height: 220 }}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          )
        ) : null}

        {displayData.refundable_amount && displayData.refund_status === 'pending' ? (
          <View style={[styles.card, styles.refund, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText style={[styles.rowTitle, { color: theme.text }]}>
              {formatMoney(Number(displayData.refundable_amount))} expected back
            </ThemedText>
            <ThemedText tone="muted" style={styles.caption}>
              Expected{' '}
              {displayData.refund_expected_on
                ? normalizeDateLabel(displayData.refund_expected_on)
                : 'date not set'}
            </ThemedText>
            <View style={styles.refundActions}>
              <Button
                label="Mark received"
                variant="outline"
                height={40}
                style={styles.flex}
                onPress={() => void handleRefundStatus('received')}
              />
              <Button
                label="Write off"
                variant="outline"
                height={40}
                style={styles.flex}
                onPress={() => void handleRefundStatus('written_off')}
              />
            </View>
          </View>
        ) : null}

        {/* Delete stays out of the bottom bar, on a card of its own. */}
        <PressableView
          accessibilityRole="button"
          onPress={handleDelete}
          style={[styles.card, styles.deleteRow, { backgroundColor: theme.card, borderColor: theme.border }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.negative} />
          <ThemedText tone="negative" style={styles.deleteLabel}>
            Delete transaction
          </ThemedText>
        </PressableView>
      </ScrollView>

      {/* The bar: an outlined secondary beside the screen's one orange action. */}
      <View
        style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Button
          testID="entry-repeat-button"
          label="Repeat for today"
          variant="outline"
          icon="repeat"
          height={48}
          accessibilityHint="Opens a copy of this transaction dated today"
          disabled={!repeatReady}
          onPress={openRepeat}
          style={styles.flex}
        />
        <PrimaryButton
          label="Edit"
          icon="pencil-outline"
          height={48}
          onPress={handleEdit}
          style={styles.flex}
        />
      </View>

      <TransactionFormModal
        visible={isEditModalVisible}
        onClose={() => setIsEditModalVisible(false)}
        initialData={editInitialData}
        onSave={handleSaveUpdate}
        isEdit={true}
        emiLink={emiLink}
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        authToken={token}
        onManageAccounts={() => router.push('/money?segment=accounts')}
        initialFocus={params.reviewFocus || undefined}
        categorySuggestions={categorySuggestions}
        aiReview={
          isReviewEdit
            ? {
                missingFields: reviewFields.map((field) =>
                  field === 'account' ? 'accountId' : field
                ),
              }
            : undefined
        }
      />

      <TransactionFormModal
        visible={isRepeatModalVisible}
        onClose={() => setIsRepeatModalVisible(false)}
        initialData={repeatForm ?? undefined}
        onSave={handleSaveRepeat}
        heading="Repeat transaction"
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        authToken={token}
        onManageAccounts={() => router.push('/money?segment=accounts')}
      />

      <AnimatedBottomSheet
        visible={isDeleteConfirmVisible}
        onClose={closeDeleteConfirm}
        backdropOpacity={0.45}>
        <View
          className="rounded-t-[32px] border px-6 pt-5"
          style={{ backgroundColor: theme.card, borderColor: theme.border, paddingBottom: sheetBottom }}>
          <View className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />

          <View className="items-center">
            <View
              className="mb-5 h-16 w-16 items-center justify-center rounded-full"
              style={{
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,107,107,0.16)' : '#FFE7E7',
              }}>
              <MaterialCommunityIcons name="trash-can-outline" size={30} color="#FF6B6B" />
            </View>

            <ThemedText className="text-center text-xl font-black" style={{ color: theme.text }}>
              Delete this transaction?
            </ThemedText>
            <ThemedText tone="muted" className="mt-2 text-center text-sm font-semibold leading-5">
              It will leave this screen now, with 5 seconds to Undo. After that it is removed from
              your activity, insights, and any split linked to it.
            </ThemedText>
          </View>

          <View
            className="my-6 rounded-3xl border p-4"
            style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <ThemedText
                  tone="muted"
                  className="text-[10px] font-black uppercase tracking-widest">
                  Transaction
                </ThemedText>
                <ThemedText
                  numberOfLines={1}
                  className="mt-1 text-base font-black"
                  style={{ color: theme.text }}>
                  {displayData.title || displayData.merchant || 'Untitled transaction'}
                </ThemedText>
              </View>
              <ThemedText className="text-base font-black" style={{ color: theme.text }}>
                {formatMoney(amountValue, { sign: 'never' })}
              </ThemedText>
            </View>
          </View>

          <View className="gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              className="h-14 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.negative }}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="trash-can-outline" size={19} color={theme.onNegative} />
                <ThemedText className="text-base font-black" style={{ color: theme.onNegative }}>
                  Delete
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={closeDeleteConfirm}
              className="h-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#F7F2F3',
              }}>
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </AnimatedBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  scroll: {
    paddingBottom: 32,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: SCREEN_GUTTER,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    marginTop: 12,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  heroTitle: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  heroCaption: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    marginTop: 12,
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  note: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  rowAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  splitHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  splitTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTotals: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  receiptRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  refund: {
    gap: 4,
    padding: 14,
  },
  refundActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  deleteRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  deleteLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  bar: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
