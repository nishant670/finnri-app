import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventFormSheet } from '@/components/events/EventFormSheet';
import { TransactionItem } from '@/components/home/TransactionItem';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { TransactionFormModal, type EntryForm } from '@/components/transactions/TransactionFormModal';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { Button } from '@/components/ui/Button';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useTransactionPages } from '@/hooks/use-transaction-pages';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  DEFAULT_EVENT_EMOJI,
  defaultDayForEvent,
  deleteEvent,
  describeEventDates,
  eventLabel,
  fetchEvent,
  fetchEventCategories,
  updateEvent,
  useEvents,
  type EventCategoryShare,
  type EventInput,
  type EventWithSummary,
} from '@/lib/events';
import { shareTransactionExport } from '@/lib/export';
import { haptics } from '@/lib/haptics';
import { createDefaultEntryForm, resolveAccountForEntry } from '@/lib/home-capture';
import { formatApiDate } from '@/lib/datetime';
import { formatMoney, toAmountString } from '@/lib/money';
import { fetchSplitFriends, fetchSplitGroups, type SplitFriend, type SplitGroup } from '@/lib/splits';
import {
  describeLikelyDuplicate,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { notifyTransactionsChanged, subscribeTransactionsChanged } from '@/lib/transaction-events';
import { formatDateLabel } from '@/lib/transactions';
import type { Transaction } from '@/types/transaction';

/**
 * One occasion and what it cost.
 *
 * The headline is the user's real cost: what they paid, less what the split
 * bills on those payments say friends owe them back. That is the number no
 * other screen has — a group shows who owes whom, the transaction list shows
 * what left the account, and neither says what the party actually cost.
 */
export default function EventScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const dialog = useAppDialog();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const eventId = Number(idParam);
  const token = useAuthStore((state) => state.token);
  const replaceInStore = useEvents((state) => state.replace);
  const dropFromStore = useEvents((state) => state.drop);
  const invalidateEvents = useEvents((state) => state.invalidate);

  const [data, setData] = useState<EventWithSummary | null>(null);
  const [categories, setCategories] = useState<EventCategoryShare[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const query = useMemo(() => ({ event_id: eventId }), [eventId]);
  const {
    transactions,
    total: transactionCount,
    hasMore,
    isLoadingMore,
    refresh: refreshTransactions,
    loadMore,
  } = useTransactionPages({ token, query });

  const loadEvent = useCallback(async () => {
    if (!token || !Number.isFinite(eventId)) return;
    setError(null);
    try {
      const [next, shares] = await Promise.all([
        fetchEvent(token, eventId),
        fetchEventCategories(token, eventId).catch(() => [] as EventCategoryShare[]),
      ]);
      setData(next);
      setCategories(shares);
      replaceInStore(next.event);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load this event.'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, replaceInStore, token]);

  const isFocused = useRef(false);
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      void loadEvent();
      if (hasFocused.current) void refreshTransactions();
      hasFocused.current = true;
      return () => {
        isFocused.current = false;
      };
    }, [loadEvent, refreshTransactions])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        if (!isFocused.current) return;
        void loadEvent();
        void refreshTransactions();
      }),
    [loadEvent, refreshTransactions]
  );

  // Adding a transaction from here: the shared form, with this event chosen.
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<EntryForm>(createDefaultEntryForm);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const addIdempotencyKey = useRef<string | null>(null);
  const addSaveProgress = useRef<TransactionSaveProgress>({});

  const openAdd = useCallback(() => {
    if (!data) return;
    haptics.select();
    addIdempotencyKey.current = null;
    addSaveProgress.current = {};
    const day = defaultDayForEvent(data.event, formatApiDate(new Date()));
    setAddForm({
      ...createDefaultEntryForm(),
      date: formatDateLabel(new Date(`${day}T12:00:00`)),
      eventId: data.event.id,
    });
    setIsAddOpen(true);
    if (token) {
      void fetchAccounts(token)
        .then(setAccounts)
        .catch(() => setAccounts([]));
      void Promise.all([fetchSplitFriends(token), fetchSplitGroups(token)])
        .then(([friends, groups]) => {
          setSplitFriends(friends);
          setSplitGroups(groups);
        })
        .catch(() => {
          setSplitFriends([]);
          setSplitGroups([]);
        });
    }
  }, [data, token]);

  const saveNew = useCallback(
    async (formData: EntryForm) => {
      if (!token) throw new Error('Please sign in again before saving this transaction.');
      if (!addIdempotencyKey.current) {
        addIdempotencyKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      await saveNewTransaction({
        token,
        form: formData,
        account: resolveAccountForEntry(accounts, formData),
        idempotencyKey: addIdempotencyKey.current,
        progress: addSaveProgress.current,
        confirmDuplicate: (match) => dialog.confirm(describeLikelyDuplicate(match)),
      });
      addIdempotencyKey.current = null;
      addSaveProgress.current = {};
      setIsAddOpen(false);
      invalidateEvents();
      notifyTransactionsChanged();
    },
    [accounts, dialog, invalidateEvents, token]
  );

  const openExisting = () => {
    if (!data) return;
    haptics.select();
    router.push({
      pathname: '/transactions',
      params: {
        pickFor: String(data.event.id),
        // Around the event's dates, where its transactions most likely are.
        ...(data.event.start_date ? { start_date: shiftDay(data.event.start_date, -3) } : {}),
        ...(data.event.end_date ? { end_date: shiftDay(data.event.end_date, 3) } : {}),
      },
    });
  };

  const handleEdit = async (input: EventInput) => {
    if (!token) throw new Error('Please sign in again.');
    const next = await updateEvent(token, eventId, input);
    haptics.saved();
    setData(next);
    replaceInStore(next.event);
    setIsEditOpen(false);
  };

  const handleDelete = async () => {
    setIsMenuOpen(false);
    if (!token || !data) return;
    const count = data.summary.entry_count;
    const confirmed = await dialog.confirm({
      title: `Delete ${data.event.name}?`,
      message:
        count === 0
          ? 'The event goes. Nothing else changes.'
          : `Its ${count === 1 ? 'transaction stays' : `${count} transactions stay`} in your list — they just won’t be grouped any more.`,
      confirmLabel: 'Delete event',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteEvent(token, eventId);
      haptics.saved();
      dropFromStore(eventId);
      notifyTransactionsChanged();
      router.back();
    } catch (err) {
      await dialog.alert({
        title: 'Could not delete the event',
        message: getFriendlyErrorMessage(err, 'Try again in a moment.'),
        tone: 'danger',
      });
    }
  };

  const handleExport = async () => {
    if (!token || isExporting) return;
    setIsExporting(true);
    try {
      await shareTransactionExport(token, 'csv', { event_id: eventId });
      haptics.saved();
    } catch (err) {
      await dialog.alert({
        title: 'Export failed',
        message: getFriendlyErrorMessage(err, 'Unable to export these transactions.'),
        tone: 'danger',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const openDetail = (item: Transaction) => {
    router.push({
      pathname: '/entry/[id]',
      params: {
        id: item.id,
        name: item.name,
        category: item.category,
        amount: toAmountString(Math.abs(item.amount)),
        entryType: item.entryType ?? 'expense',
        section: item.section,
        mode: item.mode ?? '',
        notes: item.notes ?? '',
        merchant: item.merchant ?? '',
        dateLabel: item.dateLabel ?? '',
        rawDate: item.rawDate ?? '',
        tag: item.tag ?? '',
      },
    });
  };

  const event = data?.event;
  const summary = data?.summary;
  const budget = event?.budget ?? null;
  const budgetUsed = budget && summary ? Math.min(Math.max(summary.net_cost / budget, 0), 1) : 0;
  const overBudget = budget != null && summary != null && summary.net_cost > budget;

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={event ? eventLabel(event) : 'Event'}
        onBack={() => router.back()}
        rightIcon={event ? 'dots-horizontal' : undefined}
        rightAccessibilityLabel="Event actions"
        onRightPress={() => setIsMenuOpen(true)}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoading && !data ? (
          <SkeletonFrame label="Loading event" testID="event-skeleton">
            <SkeletonRows count={4} showAmount lines={2} />
          </SkeletonFrame>
        ) : error && !data ? (
          <StateView
            icon="wifi-off"
            title="This event did not load"
            message={error}
            actionLabel="Try again"
            onAction={() => void loadEvent()}
          />
        ) : event && summary ? (
          <>
            <View
              testID="event-hero"
              style={[styles.card, styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.heroTile, { backgroundColor: colors.selectedFill }]}>
                <ThemedText style={styles.heroEmoji}>{event.emoji || DEFAULT_EVENT_EMOJI}</ThemedText>
              </View>
              {describeEventDates(event) ? (
                <ThemedText tone="muted" style={styles.small}>
                  {describeEventDates(event)}
                </ThemedText>
              ) : null}
              <ThemedText tone="muted" style={styles.heroLabel}>
                Your real cost
              </ThemedText>
              <ThemedText testID="event-net-cost" style={[styles.heroAmount, { color: colors.text }]}>
                {formatMoney(summary.net_cost)}
              </ThemedText>
              <ThemedText tone="muted" style={[styles.body, styles.center]}>
                {summary.owed_back > 0
                  ? `You paid ${formatMoney(summary.total_paid)} · Friends owe you ${formatMoney(summary.owed_back)}`
                  : summary.entry_count === 0
                    ? 'Nothing added yet'
                    : `You paid ${formatMoney(summary.total_paid)} across ${
                        summary.entry_count === 1 ? '1 transaction' : `${summary.entry_count} transactions`
                      }`}
              </ThemedText>
              {budget != null ? (
                <View style={styles.budget}>
                  <View style={[styles.track, { backgroundColor: colors.track }]}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.round(budgetUsed * 100)}%`,
                          backgroundColor: overBudget ? colors.negative : colors.accent,
                        },
                      ]}
                    />
                  </View>
                  <ThemedText tone={overBudget ? 'negative' : 'muted'} style={styles.small}>
                    {overBudget
                      ? `${formatMoney(summary.net_cost - budget)} over the ${formatMoney(budget)} budget`
                      : `${formatMoney(summary.budget_left ?? budget - summary.net_cost)} left of ${formatMoney(budget)}`}
                  </ThemedText>
                </View>
              ) : null}
              {summary.split_entry_count > 0 ? (
                <ThemedText tone="muted" style={[styles.small, styles.center]}>
                  Owed back is what your split bills say. A bill a friend paid counts once you log
                  your share.
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.actions}>
              <Button
                testID="event-add-transaction"
                label="Add transaction"
                icon="plus"
                height={44}
                style={styles.flex}
                onPress={openAdd}
              />
              <Button
                testID="event-add-existing"
                label="Add existing"
                icon="playlist-plus"
                variant="outline"
                height={44}
                style={styles.flex}
                onPress={openExisting}
              />
            </View>

            {categories.length > 0 ? (
              <View>
                <ThemedText tone="muted" style={styles.sectionTitle}>
                  Where it went
                </ThemedText>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {categories.map((share, index) => (
                    <View
                      key={share.label}
                      style={[styles.shareRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={styles.shareHead}>
                        <ThemedText numberOfLines={1} style={[styles.shareLabel, { color: colors.text }]}>
                          {share.label}
                        </ThemedText>
                        <ThemedText style={[styles.shareAmount, { color: colors.text }]}>
                          {formatMoney(share.amount)}
                        </ThemedText>
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.track }]}>
                        <View
                          style={[
                            styles.fill,
                            {
                              width: `${Math.max(2, Math.round(share.percentage))}%`,
                              backgroundColor: colors.accent,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View>
              <View style={styles.sectionHead}>
                <ThemedText tone="muted" style={[styles.sectionTitle, styles.flush]}>
                  {transactionCount === 1 ? '1 transaction' : `${transactionCount} transactions`}
                </ThemedText>
                {transactionCount > 0 ? (
                  <Button
                    testID="event-export"
                    label="Export CSV"
                    icon="tray-arrow-up"
                    variant="outline"
                    height={36}
                    loading={isExporting}
                    onPress={() => void handleExport()}
                  />
                ) : null}
              </View>
              {transactions.length === 0 ? (
                <View style={[styles.card, styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialCommunityIcons name="receipt-text-plus-outline" size={24} color={colors.muted} />
                  <ThemedText tone="muted" style={[styles.body, styles.center]}>
                    Add what you spent for this occasion, or pick transactions you already logged.
                  </ThemedText>
                </View>
              ) : (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {transactions.map((transaction, index) => (
                    <TransactionItem
                      key={transaction.id}
                      icon={transaction.icon}
                      title={transaction.name}
                      category={transaction.category}
                      subtitle={transaction.section}
                      amount={Math.abs(transaction.amount)}
                      date={transaction.timeLabel ?? ''}
                      color={transaction.color}
                      bgColor={transaction.bgColor}
                      isIncome={transaction.entryType === 'income'}
                      variant="list"
                      showDivider={index < transactions.length - 1}
                      onPress={() => openDetail(transaction)}
                    />
                  ))}
                </View>
              )}
              {hasMore ? (
                <View style={styles.more}>
                  {isLoadingMore ? (
                    <ActivityIndicator color={colors.muted} />
                  ) : (
                    <Button
                      label="Show more"
                      variant="outline"
                      height={36}
                      onPress={() => void loadMore()}
                    />
                  )}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      <PickerSheet visible={isMenuOpen} title={event?.name ?? 'Event'} onClose={() => setIsMenuOpen(false)}>
        <PickerOptionList
          accessibilityLabel="Event actions"
          selectedKey={null}
          options={[
            { key: 'edit', label: 'Edit event', icon: 'pencil-outline', testID: 'event-menu-edit' },
            { key: 'delete', label: 'Delete event', icon: 'trash-can-outline', testID: 'event-menu-delete' },
          ]}
          onSelect={(key) => {
            if (key === 'edit') {
              setIsMenuOpen(false);
              setIsEditOpen(true);
            } else {
              void handleDelete();
            }
          }}
        />
      </PickerSheet>

      <EventFormSheet
        visible={isEditOpen}
        event={event}
        onClose={() => setIsEditOpen(false)}
        onSave={handleEdit}
      />

      <TransactionFormModal
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        initialData={addForm}
        onSave={saveNew}
        mode="manual"
        heading={event ? `Add to ${event.name}` : undefined}
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        authToken={token}
        onManageAccounts={() => router.push('/money?segment=accounts')}
      />
    </SafeAreaView>
  );
}

/** A `YYYY-MM-DD` day moved by whole days, for the window "Add existing" opens on. */
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  date.setDate(date.getDate() + days);
  return formatApiDate(date);
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  heroTile: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  heroLabel: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  heroAmount: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  budget: {
    alignSelf: 'stretch',
    gap: 6,
    marginTop: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  flush: {
    marginBottom: 0,
  },
  shareRow: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shareHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  shareAmount: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  more: {
    alignItems: 'center',
    paddingTop: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  center: {
    textAlign: 'center',
  },
});
