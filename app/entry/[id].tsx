import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { DEFAULT_CURRENCY } from '@/constants/Currency';
import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { EntryDetailSkeleton } from '@/components/transactions/TransactionListSkeleton';
import { useTransactionDelete } from '@/components/transactions/TransactionDeleteProvider';
import { useAuthStore } from '@/hooks/use-auth-store';
import { decodeFrame, useSharedElementTarget } from '@/hooks/use-shared-element';
import { Account, fetchAccounts } from '@/lib/accounts';
import { fetchEntry, updateEntry } from '@/lib/entries';
import { buildTransactionPayload } from '@/lib/transaction-composer';
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
  toTitleCase,
  resolveCategoryMetadata,
} from '@/lib/transactions';
import { formatTime } from '@/lib/datetime';
import { formatMoney, toAmountInputValue } from '@/lib/money';
import { updateRefundStatus } from '@/lib/refundables';

export default function TransactionDetailsScreen() {
  const dialog = useAppDialog();
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
  const [splitBill, setSplitBill] = useState<SplitBill | null>(null);
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);

  const [isExpanded, setIsExpanded] = useState(true);

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
        .catch(() => setAccounts([]));
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

  const handleEdit = () => {
    setIsEditModalVisible(true);
  };

  const handleDelete = () => {
    setIsDeleteConfirmVisible(true);
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
      if (!token) throw new Error('Missing session.');

      const payload = await buildTransactionPayload(token, formData, {
        refundStatus: displayData.refund_status ?? 'pending',
      });
      if (!formData.splitEnabled && splitBill) payload.split = null;

      if (!token) throw new Error('Missing session.');
      const budgetNotificationIds =
        formData.type === 'Expense'
          ? await fetchUnreadBudgetNotificationIds(token).catch(() => new Set<number>())
          : new Set<number>();
      await updateEntry(token, params.id, payload);

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
        const notification = await fetchNewUnreadBudgetNotification(
          token,
          budgetNotificationIds
        ).catch(() => null);
        if (notification) {
          if (
            await dialog.confirm({
              title: notification.title,
              message: notification.body,
              confirmLabel: 'View Budgets',
              cancelLabel: 'Later',
              iconName: 'wallet-outline',
            })
          ) {
            router.push('/budgets');
          }
        }
      }
    } catch (error) {
      console.error(error);
      throw error instanceof Error ? error : new Error('Failed to update transaction');
    }
  };

  const hasMerchant = displayData.merchant && displayData.merchant !== 'Unknown Location';
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

      {/* Custom Header */}
      <View className="flex-row items-center px-6 py-4">
        <Pressable
          onPress={dismiss}
          className="h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800">
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <ThemedText
          className="text-base font-bold ml-4 flex-1 text-center pr-10"
          style={{ color: theme.text }}>
          Transaction
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        {/* HERO SECTION */}
        <View className="items-center mb-10">
          <Animated.View
            ref={heroIconRef}
            collapsable={false}
            onLayout={iconTravel.onLayout}
            className="h-28 w-28 rounded-[32px] items-center justify-center shadow-lg mb-6"
            style={[
              {
                shadowColor: theme.accent,
                shadowOpacity: 0.1,
                shadowRadius: 15,
                backgroundColor: bgColor || 'white',
              },
              iconTravel.style,
            ]}>
            <MaterialCommunityIcons name={icon as any} size={52} color={iconColor} />
          </Animated.View>

          <Animated.View
            ref={heroAmountRef}
            collapsable={false}
            onLayout={amountTravel.onLayout}
            style={amountTravel.style}>
            <ThemedText
              className="text-4xl font-black mb-2 tracking-tight"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: theme.text }}>
              {formatMoney(amountValue, { sign: 'never' })}
            </ThemedText>
          </Animated.View>

          <ThemedText className="text-lg font-black mb-3" style={{ color: '#1E293B' }}>
            {displayData.title || 'Untitled Transaction'}
          </ThemedText>

          {hasMerchant && (
            <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-full px-4 py-1.5 shadow-sm border border-gray-100">
              <ThemedText tone="mutedStrong" className="text-sm font-bold mr-2">
                {displayData.merchant}
              </ThemedText>
              <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
            </View>
          )}
        </View>

        {/* DETAILS CARD */}
        <View className="bg-white dark:bg-gray-800 rounded-[40px] p-8 shadow-sm mb-8">
          {/* Date */}
          <View className="flex-row gap-5 mb-8">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.secondary }}>
              <MaterialCommunityIcons name="calendar-blank" size={24} color={theme.accent} />
            </View>
            <View>
              <ThemedText
                tone="muted"
                className="text-[10px] uppercase font-black tracking-widest mb-1">
                DATE &amp; TIME
              </ThemedText>
              <ThemedText className="text-base font-black">
                {displayData.date || 'No date'}
              </ThemedText>
              {displayData.time ? (
                <ThemedText tone="muted" className="text-xs font-bold">
                  At {displayData.time}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {/* Category */}
          <View className="flex-row gap-5 mb-8">
            <View
              className="h-12 w-12 rounded-full items-center justify-center"
              style={{ backgroundColor: bgColor || theme.accent }}>
              <MaterialCommunityIcons name={icon as any} size={24} color={iconColor} />
            </View>
            <View>
              <ThemedText
                tone="muted"
                className="text-[10px] uppercase font-black tracking-widest mb-1">
                CATEGORY
              </ThemedText>
              <ThemedText className="text-base font-black">
                {displayData.category || 'Uncategorised'}
              </ThemedText>
            </View>
          </View>

          {/* Separator */}
          <View className="h-[1px] bg-gray-50 mb-8 border-b border-dashed border-gray-100" />

          {/* More Details Header - Collapsible */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsExpanded(!isExpanded)}
            className="flex-row items-center justify-between mb-6">
            <ThemedText
              className="text-[10px] uppercase font-black tracking-widest"
              style={{ color: theme.accent }}>
              MORE DETAILS
            </ThemedText>
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.accent}
            />
          </TouchableOpacity>

          {isExpanded && (
            <View>
              <View className="flex-row mb-8">
                {/* Payment Method */}
                <View className="flex-1 flex-row items-center gap-3">
                  <View className="h-10 w-10 rounded-xl bg-gray-50 items-center justify-center border border-gray-100">
                    <MaterialCommunityIcons name="wallet-outline" size={20} color="#64748B" />
                  </View>
                  <View>
                    <ThemedText tone="muted" className="text-[9px] uppercase font-black">
                      PAID VIA
                    </ThemedText>
                    <ThemedText className="text-sm font-black">
                      {displayData.mode || 'Not set'}
                    </ThemedText>
                  </View>
                </View>

                {/* Account */}
                <View className="flex-1 flex-row items-center gap-3">
                  <View className="h-10 w-10 rounded-xl bg-gray-50 items-center justify-center border border-gray-100">
                    <MaterialCommunityIcons name="bank-outline" size={20} color="#64748B" />
                  </View>
                  <View>
                    <ThemedText tone="muted" className="text-[9px] uppercase font-black">
                      ACCOUNT
                    </ThemedText>
                    <ThemedText className="text-sm font-black">
                      {displayData.account?.name || 'Not linked'}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Tags */}
              <View className="flex-row items-start gap-3 mb-8">
                <View className="h-10 w-10 rounded-xl bg-gray-50 items-center justify-center border border-gray-100">
                  <MaterialCommunityIcons name="tag-outline" size={20} color="#64748B" />
                </View>
                <View className="flex-1">
                  <ThemedText tone="muted" className="text-[9px] uppercase font-black mb-2">
                    TAG
                  </ThemedText>
                  {/* An untagged entry showed a "Personal" chip that looked like a
                      real tag but was never stored and was not in the tag picker. */}
                  <View className="flex-row gap-2">
                    {displayData.tag ? (
                      <View
                        className="rounded-full border px-3 py-1"
                        style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
                        <ThemedText
                          className="text-[10px] font-black"
                          style={{ color: theme.accent }}>
                          {displayData.tag}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText className="text-[11px]" style={{ color: `${theme.text}66` }}>
                        No tag
                      </ThemedText>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Separator */}
          <View className="h-[1px] bg-gray-50 mb-8 border-b border-dashed border-gray-100" />

          {/* Notes Inside Card */}
          <View className="flex-row gap-5">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.secondary }}>
              <MaterialCommunityIcons name="comment-text-outline" size={24} color={theme.accent} />
            </View>
            <View className="flex-1">
              <ThemedText
                tone="muted"
                className="text-[10px] uppercase font-black tracking-widest mb-1">
                NOTES
              </ThemedText>
              {/* The quotation marks belong to the user's own words. Wrapping
                  the empty state in them too put "No notes added." on the
                  screen as though somebody had written it. */}
              {displayData.notes ? (
                <ThemedText tone="muted" className="text-sm font-bold italic leading-relaxed">
                  {`"${displayData.notes}"`}
                </ThemedText>
              ) : (
                <ThemedText tone="muted" className="text-sm font-bold leading-relaxed">
                  No notes
                </ThemedText>
              )}
            </View>
          </View>
        </View>

        {splitBill && (
          <View className="bg-white dark:bg-gray-800 rounded-[32px] p-6 shadow-sm mb-8">
            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: theme.secondary }}>
                  <MaterialCommunityIcons
                    name="account-multiple-outline"
                    size={22}
                    color={theme.accent}
                  />
                </View>
                <View>
                  <ThemedText
                    tone="muted"
                    className="text-[10px] uppercase font-black tracking-widest">
                    SPLIT WITH
                  </ThemedText>
                  <ThemedText className="text-base font-black">
                    {splitBill.group?.name || 'Friends'}
                  </ThemedText>
                </View>
              </View>
              <ThemedText className="text-sm font-black" style={{ color: theme.accent }}>
                {formatMoney(splitBill.total_amount || amountValue, { sign: 'never' })}
              </ThemedText>
            </View>

            <View className="gap-3">
              {splitParticipants.map((participant) => (
                <View
                  key={`${participant.friend_id}-${participant.direction}`}
                  className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900">
                  <View className="flex-1 pr-3">
                    <ThemedText className="text-sm font-black">
                      {participant.friend?.name || 'Friend'}
                    </ThemedText>
                    <ThemedText tone="muted" className="text-xs font-bold">
                      {participant.direction === 'friend_owes_user' ? 'Owes you' : 'You owe'}
                    </ThemedText>
                  </View>
                  <ThemedText className="text-sm font-black">
                    {formatMoney(participant.share_amount, { sign: 'never' })}
                  </ThemedText>
                </View>
              ))}
            </View>

            <View className="mt-5 flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-emerald-50 p-4">
                <ThemedText tone="positive" className="text-[10px] uppercase font-black">
                  OWED TO YOU
                </ThemedText>
                <ThemedText tone="positive" className="mt-1 text-base font-black">
                  {formatMoney(splitExpectedBack, { sign: 'never' })}
                </ThemedText>
              </View>
              <View className="flex-1 rounded-2xl bg-rose-50 p-4">
                <ThemedText tone="negative" className="text-[10px] uppercase font-black">
                  YOU OWE
                </ThemedText>
                <ThemedText tone="negative" className="mt-1 text-base font-black">
                  {formatMoney(splitYouOwe, { sign: 'never' })}
                </ThemedText>
              </View>
            </View>
          </View>
        )}
        {/* PAPER TRAIL */}
        {receiptUrl ? (
          <View className="mb-8">
            <ThemedText
              tone="muted"
              className="text-[10px] font-black uppercase tracking-[2px] mb-4 ml-6">
              THE PAPER TRAIL
            </ThemedText>
            {isPdfAttachment(receiptUrl) ? (
              <Pressable
                onPress={handleOpenReceipt}
                accessibilityRole="button"
                accessibilityLabel="Open receipt PDF"
                className="rounded-[32px] p-6 flex-row items-center justify-between border"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                <View className="flex-row items-center gap-4">
                  <View className="h-14 w-14 rounded-full items-center justify-center bg-rose-50">
                    <MaterialCommunityIcons name="file-pdf-box" size={28} color="#E11D48" />
                  </View>
                  <View>
                    <ThemedText className="text-base font-black" style={{ color: theme.text }}>
                      Receipt PDF
                    </ThemedText>
                    <ThemedText tone="muted" className="text-xs font-bold">
                      Tap to open
                    </ThemedText>
                  </View>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={22} color={theme.accent} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleOpenReceipt}
                accessibilityRole="imagebutton"
                accessibilityLabel="Open receipt image"
                className="rounded-[32px] overflow-hidden border"
                style={{ borderColor: theme.border }}>
                <Image
                  source={{ uri: displayReceiptUrl ?? undefined }}
                  style={{ width: '100%', height: 220 }}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            )}
          </View>
        ) : null}

        {/* ACTIONS */}
        {displayData.refundable_amount && displayData.refund_status === 'pending' ? (
          <View
            className="mb-6 rounded-[28px] border p-5"
            style={{ backgroundColor: theme.card, borderColor: theme.accent }}>
            <ThemedText className="text-base font-black" style={{ color: theme.text }}>
              {formatMoney(Number(displayData.refundable_amount))} expected back
            </ThemedText>
            <ThemedText tone="muted" className="mt-1 text-xs">
              Expected{' '}
              {displayData.refund_expected_on
                ? normalizeDateLabel(displayData.refund_expected_on)
                : 'date not set'}
            </ThemedText>
            <View className="mt-4 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleRefundStatus('received')}
                className="flex-1 items-center rounded-full py-3"
                style={{ backgroundColor: theme.accent }}>
                <ThemedText tone="onAccent" className="text-xs font-black">
                  Mark received
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleRefundStatus('written_off')}
                className="flex-1 items-center rounded-full border py-3"
                style={{ borderColor: theme.border }}>
                <ThemedText className="text-xs font-black" style={{ color: theme.text }}>
                  Write off
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={handleEdit}
          className="w-full py-5 rounded-full items-center justify-center shadow-xl mb-6 active:opacity-90"
          style={{ backgroundColor: theme.accent }}>
          <View className="flex-row items-center gap-3">
            <MaterialCommunityIcons name="pencil-outline" size={24} color="#FFF" />
            <ThemedText tone="onAccent" className="font-black text-lg">
              Edit
            </ThemedText>
          </View>
        </Pressable>

        <Pressable onPress={handleDelete} className="items-center py-2 mb-10 active:opacity-50">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
            <ThemedText className="font-bold text-[#FF6B6B]">Delete</ThemedText>
          </View>
        </Pressable>
      </ScrollView>

      <TransactionFormModal
        visible={isEditModalVisible}
        onClose={() => setIsEditModalVisible(false)}
        initialData={editInitialData}
        onSave={handleSaveUpdate}
        isEdit={true}
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

      <AnimatedBottomSheet
        visible={isDeleteConfirmVisible}
        onClose={closeDeleteConfirm}
        backdropOpacity={0.45}>
        <View
          className="rounded-t-[32px] border px-6 pb-10 pt-5"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
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
              style={{ backgroundColor: '#FF6B6B' }}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="trash-can-outline" size={19} color="#FFFFFF" />
                <ThemedText tone="onAccent" className="text-base font-black">
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
