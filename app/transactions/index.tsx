import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionItem, type RowOrigin } from '@/components/home/TransactionItem';
import { ThemedText } from '@/components/themed-text';
import { AdvancedFilter } from '@/components/transactions/AdvancedFilter';
import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { TransactionListSkeleton } from '@/components/transactions/TransactionListSkeleton';
import {
  TransactionUndoToast,
  useTransactionDelete,
} from '@/components/transactions/TransactionDeleteProvider';
import { Colors } from '@/constants/theme';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { GroupHeader, SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { encodeFrame } from '@/hooks/use-shared-element';
import { StateView } from '@/components/ui/StateView';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useTransactionPages } from '@/hooks/use-transaction-pages';
import { Account, fetchAccounts } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { shareTransactionExport, type ExportFormat } from '@/lib/export';
import { haptics } from '@/lib/haptics';
import { createDefaultEntryForm, resolveAccountForEntry } from '@/lib/home-capture';
import { formatMoney, toAmountString } from '@/lib/money';
import {
  fetchNewUnreadBudgetNotification,
  fetchUnreadBudgetNotificationIds,
} from '@/lib/notifications';
import {
  fetchSplitFriends,
  fetchSplitGroups,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import {
  describeLikelyDuplicate,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { notifyTransactionsChanged, subscribeTransactionsChanged } from '@/lib/transaction-events';
import { buildTransactionListItems, type TransactionListItem } from '@/lib/transaction-list';
import { isAmountSort } from '@/lib/transactions';
import {
  clearFilterFields,
  describeFilters,
  emptyFilterState,
  isFilterActive as hasFilterConstraints,
  toTransactionFilters,
  type TransactionFilterState,
} from '@/lib/transaction-filters';
import { Transaction } from '@/types/transaction';

const needsTransactionReview = (transaction: Transaction) => {
  const category = String(transaction.category ?? '').trim().toLowerCase();
  return !category || category === 'uncategorized' || transaction.accountId == null;
};

/** Long enough for the row stagger to finish: eight steps of 28ms plus the fade. */
const ENTRANCE_WINDOW_MS = 800;

/** How long a just-saved row stays marked as new once it is on screen. Home's figure. */
const NEW_ROW_HIGHLIGHT_MS = 1200;

/** How long to wait for a just-saved row the filters may be hiding. */
const NEW_ROW_WAIT_MS = 5000;

export default function TransactionsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { token } = useAuthStore();
  const {
    accountId: accountIdParam,
    review,
    start_date: routeStartDate,
    end_date: routeEndDate,
    category: routeCategory,
    type: routeType,
    q: routeSearch,
    mode: routeMode,
  } = useLocalSearchParams<{
    accountId?: string;
    review?: string;
    start_date?: string;
    end_date?: string;
    category?: string;
    type?: string;
    q?: string;
    mode?: string;
  }>();
  const routeAccountId = accountIdParam ? Number(accountIdParam) : null;
  const reviewMode = review === '1';
  // The Insights charts plot expenses, so they arrive asking for expenses. An
  // unrecognised value is dropped rather than guessed at.
  const routeFilterType =
    routeType === 'Expense' || routeType === 'Income' ? routeType : null;

  // Logic States
  // A search arriving as a route param seeds both halves, so the first load
  // already carries it — waiting for the debounce would fetch the unfiltered
  // list first and show rows the answer that opened it did not count.
  const [searchQuery, setSearchQuery] = useState(routeSearch ?? '');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(routeSearch?.trim() ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Filter State — one object, the same shape the sheet edits and
  // `toTransactionFilters` turns into a query.
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<TransactionFilterState>(() => ({
    ...emptyFilterState,
    type: routeFilterType ?? 'All',
    category: routeCategory ?? null,
    mode: routeMode ?? null,
    accountId: Number.isFinite(routeAccountId) && routeAccountId ? routeAccountId : null,
    startDate: routeStartDate ?? null,
    endDate: routeEndDate ?? null,
  }));
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const patchFilters = useCallback(
    (updates: Partial<TransactionFilterState>) =>
      setFilters((prev) => ({ ...prev, ...updates })),
    []
  );

  useEffect(() => {
    patchFilters({
      accountId: Number.isFinite(routeAccountId) && routeAccountId ? routeAccountId : null,
    });
  }, [patchFilters, routeAccountId]);

  useEffect(() => {
    patchFilters({ startDate: routeStartDate ?? null, endDate: routeEndDate ?? null });
  }, [patchFilters, routeEndDate, routeStartDate]);

  // Arriving from a chart replaces the category and type filters rather than
  // merging with them: the screen can already be mounted with a stale category
  // chosen by hand, and the tap has to land on what the bar or slice showed.
  useEffect(() => {
    patchFilters({ category: routeCategory ?? null });
  }, [patchFilters, routeCategory]);

  useEffect(() => {
    patchFilters({ type: routeFilterType ?? 'All' });
  }, [patchFilters, routeFilterType]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const query = useMemo(
    () => ({ ...toTransactionFilters(filters), q: debouncedSearchQuery || undefined }),
    [debouncedSearchQuery, filters]
  );

  /**
   * The list arrives a page at a time. It used to be one request for 100 rows,
   * all of them rendered at once into a ScrollView: every row a gesture
   * handler and a set of animated styles, mounted before the first frame, and
   * the rows past the hundredth simply missing.
   */
  const {
    transactions,
    total: matchCount,
    categoryCounts,
    hasMore,
    isLoading,
    error,
    isLoadingMore,
    loadMoreError,
    reload,
    refresh,
    loadMore,
    retryLoadMore,
  } = useTransactionPages({
    token,
    query,
    keep: reviewMode ? needsTransactionReview : undefined,
  });

  /**
   * Export what the list is currently showing.
   *
   * The same filter state the list was built from goes to the server, so the
   * file answers the question on screen rather than "everything you have ever
   * logged" — an export that quietly widened its own scope would be worse than
   * no export, because nothing about the resulting file says it did.
   */
  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (!token || exportingFormat) return;
      setExportingFormat(format);
      setExportError(null);
      try {
        await shareTransactionExport(token, format, query);
        haptics.saved();
        setIsExportOpen(false);
      } catch (err) {
        haptics.rejected();
        setExportError(getFriendlyErrorMessage(err, 'Unable to export these transactions.'));
      } finally {
        setExportingFormat(null);
      }
    },
    [exportingFormat, query, token]
  );

  /**
   * Coming back to the list re-reads what it already shows, as it always has —
   * not every change elsewhere announces itself. The first focus is the mount,
   * which the new query is already loading. A change announced while the list
   * is behind another screen is left to that same re-read: answering it there
   * as well would fetch every page twice for one edit.
   */
  const isFocused = useRef(false);
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      if (hasFocused.current) void refresh();
      hasFocused.current = true;
      if (token) {
        void fetchAccounts(token)
          .then(setAccounts)
          .catch(() => setAccounts([]));
      }
      return () => {
        isFocused.current = false;
      };
    }, [refresh, token])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        if (isFocused.current) void refresh();
      }),
    [refresh]
  );

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  /**
   * The delete is held, not sent — see `useUndoableDelete` for why a reversal
   * would not be one against a hard-deleting endpoint. This screen only supplies
   * what happens when the window closes.
   */
  const { pending: pendingDelete, requestDelete } = useTransactionDelete();

  const isFilterActive = useMemo(() => hasFilterConstraints(filters), [filters]);

  const accountNameFor = useCallback(
    (id: number) => accounts.find((account) => account.id === id)?.name,
    [accounts]
  );

  /**
   * Every applied filter, as a removable chip.
   *
   * This replaces the banner that only ever described what a chart handed over.
   * The old one was honest about its own scope but left a filter chosen by hand
   * invisible the moment the sheet closed — the state was real and nothing on
   * screen said so.
   */
  const appliedChips = useMemo(
    () => (reviewMode ? [] : describeFilters(filters, accountNameFor)),
    [accountNameFor, filters, reviewMode]
  );

  const clearRouteParams = useCallback(() => {
    if (reviewMode || routeStartDate || routeEndDate || routeCategory || routeFilterType) {
      router.setParams({
        review: undefined,
        start_date: undefined,
        end_date: undefined,
        category: undefined,
        type: undefined,
      });
    }
  }, [reviewMode, routeCategory, routeEndDate, routeFilterType, routeStartDate]);

  const hasSearchQuery = searchQuery.trim().length > 0 || debouncedSearchQuery.length > 0;
  const hasActiveConstraints = isFilterActive || hasSearchQuery || reviewMode;

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setFilters((prev) => ({ ...emptyFilterState, sort: prev.sort }));
    clearRouteParams();
  }, [clearRouteParams]);

  /**
   * Sorting by amount ranks the whole filtered set, so the list goes flat and
   * each row carries its own date — see `buildTransactionListItems`.
   */
  const isRankedByAmount = isAmountSort(filters.sort);
  const listItems = useMemo(
    () =>
      buildTransactionListItems(transactions, {
        sort: filters.sort,
        hasMore,
        pendingDeleteId: pendingDelete?.id,
      }),
    [filters.sort, hasMore, pendingDelete?.id, transactions]
  );

  /**
   * Rows cascade in when a list arrives, and only then. `FlatList` unmounts
   * rows far off screen and mounts them again on the way back, and a row that
   * replayed its entrance there would fade in under the user's thumb as if it
   * had only just loaded.
   */
  const [entranceSpent, setEntranceSpent] = useState(false);
  useEffect(() => {
    if (isLoading) {
      setEntranceSpent(false);
      return undefined;
    }
    const timer = setTimeout(() => setEntranceSpent(true), ENTRANCE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const openDetail = useCallback(
    (item: Transaction, intent?: 'edit' | 'repeat', origin?: RowOrigin) => {
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
        // Edit is the detail screen's job — it owns the form, the receipt upload
        // and the split editor. Building a second one here to save a push would
        // be two edit screens to keep in step. Repeat is the same form, so the
        // same argument puts it there too.
        ...(intent ? { [intent]: '1' } : {}),
        // C9: where the row's icon and amount were when it was tapped. Absent
        // when a swipe action was used — that push lands on a sheet, and an icon
        // flying to a place the sheet is about to cover is motion with nothing
        // to say.
        ...(origin?.icon && !intent ? { originIcon: encodeFrame(origin.icon) } : {}),
        ...(origin?.amount && !intent ? { originAmount: encodeFrame(origin.amount) } : {}),
      },
    });
    },
    []
  );

  const openFromSwipe = useCallback(
    (item: Transaction, intent: 'edit' | 'repeat') => {
      setOpenSwipeId(null);
      openDetail(item, intent);
    },
    [openDetail]
  );

  // Closing only clears the row that closed: the list may already have opened
  // another one on the same tick.
  const changeSwipeOpen = useCallback((id: string, open: boolean) => {
    setOpenSwipeId((current) => (open ? id : current === id ? null : current));
  }, []);

  // A new transaction, from the + in the header. The same save Home's add
  // button does, so it gets the same idempotency, EMI and budget handling.
  const dialog = useAppDialog();
  const listRef = useRef<FlatList<TransactionListItem>>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<EntryForm>(createDefaultEntryForm);
  const addIdempotencyKey = useRef<string | null>(null);
  const addSaveProgress = useRef<TransactionSaveProgress>({});
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    haptics.select();
    addIdempotencyKey.current = null;
    addSaveProgress.current = {};
    // Dated now, not when the screen opened.
    setAddForm(createDefaultEntryForm());
    setIsAddOpen(true);
    // Only the split editor needs these, so they wait for the form rather than
    // adding two requests to every visit to the list.
    if (token) {
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
  }, [token]);

  const offerBudgetAlert = useCallback(
    async (budgetNotificationIds: Set<number>) => {
      if (!token) return;
      const notification = await fetchNewUnreadBudgetNotification(
        token,
        budgetNotificationIds
      ).catch(() => null);
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
    },
    [dialog, token]
  );

  const saveNew = useCallback(
    async (formData: EntryForm) => {
      if (!token) throw new Error('Please sign in again before saving this transaction.');
      if (!addIdempotencyKey.current) {
        addIdempotencyKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const budgetNotificationIds =
        formData.type === 'Expense'
          ? await fetchUnreadBudgetNotificationIds(token).catch(() => new Set<number>())
          : new Set<number>();
      const { entry, convertedToEMI } = await saveNewTransaction({
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
      if (!convertedToEMI) {
        setNewTransactionId(String(entry.id));
        // Newest first, a transaction dated today lands at the top — which is
        // where the user is taken to see it arrive.
        if (filters.sort === 'newest') {
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
      }
      notifyTransactionsChanged();
      if (formData.type === 'Expense' && !convertedToEMI) {
        void offerBudgetAlert(budgetNotificationIds);
      }
    },
    [accounts, dialog, filters.sort, offerBudgetAlert, token]
  );

  /**
   * The new row's highlight plays once it is on screen, then lets go. The
   * clock starts when the row arrives rather than at the save, because the row
   * comes with the refresh after it. A row the filters hide is let go of too,
   * or it would light up whenever the filters next let it through.
   */
  const isNewRowShown =
    newTransactionId != null &&
    transactions.some((transaction) => transaction.id === newTransactionId);
  useEffect(() => {
    if (!newTransactionId) return undefined;
    const timer = setTimeout(
      () => setNewTransactionId(null),
      isNewRowShown ? NEW_ROW_HIGHLIGHT_MS : NEW_ROW_WAIT_MS
    );
    return () => clearTimeout(timer);
  }, [isNewRowShown, newTransactionId]);

  const renderItem = useCallback<ListRenderItem<TransactionListItem>>(
    ({ item }) => {
      if (item.kind === 'day') {
        return <DayHeading title={item.title} total={item.total} first={item.first} />;
      }
      const { transaction, position, groupFirst, groupLast } = item;
      return (
        <TransactionRow
          transaction={transaction}
          groupFirst={groupFirst}
          groupLast={groupLast}
          // A flat, amount-ranked list has no section heading to date it, so the
          // row has to carry its own.
          showDate={isRankedByAmount}
          entranceIndex={entranceSpent ? undefined : position}
          swipeOpen={openSwipeId === transaction.id}
          collapsed={pendingDelete?.id === transaction.id}
          isNew={newTransactionId === transaction.id}
          onOpen={openDetail}
          onSwipeAction={openFromSwipe}
          onSwipeOpenChange={changeSwipeOpen}
          onDelete={requestDelete}
        />
      );
    },
    [
      changeSwipeOpen,
      entranceSpent,
      isRankedByAmount,
      newTransactionId,
      openDetail,
      openFromSwipe,
      openSwipeId,
      pendingDelete?.id,
      requestDelete,
    ]
  );

  const listHeader = (
    <>
      {error && transactions.length > 0 && (
        <ErrorBanner
          message={error}
          onRetry={() => void refresh()}
          style={{ marginHorizontal: SCREEN_GUTTER, marginTop: 12 }}
        />
      )}
      {isRankedByAmount && transactions.length > 0 && (
        <GroupHeader label={filters.sort === 'highest' ? 'Highest first' : 'Lowest first'} />
      )}
    </>
  );

  const listEmpty = isLoading ? (
    <TransactionListSkeleton />
  ) : error ? (
    <StateView
      icon="wifi-off"
      title="Transactions did not load"
      message={error}
      actionLabel="Try again"
      onAction={() => void reload()}
    />
  ) : (
    <StateView
      icon={hasActiveConstraints ? 'filter-off-outline' : 'receipt-text-plus-outline'}
      title={hasActiveConstraints ? 'No matching transactions' : 'No transactions yet'}
      message={
        hasActiveConstraints
          ? reviewMode
            ? 'No transactions need category or account cleanup.'
            : 'Adjust your search or filters to see more activity.'
          : 'Capture your first spend or income to see it here.'
      }
      actionLabel={hasActiveConstraints ? 'Clear filters' : 'Add transaction'}
      onAction={hasActiveConstraints ? clearFilters : openAdd}
      style={styles.emptyState}
    />
  );

  // A failed load leaves the previous rows up under its banner, and a footer
  // calling them "everything" would contradict it.
  const listFooter =
    transactions.length === 0 || error ? null : loadMoreError ? (
      <View style={styles.footer}>
        <ThemedText tone="muted" style={[styles.caption, styles.centered]}>
          {loadMoreError}
        </ThemedText>
        <Button
          label="Try again"
          variant="outline"
          height={36}
          onPress={() => void retryLoadMore()}
        />
      </View>
    ) : hasMore || isLoadingMore ? (
      <View style={styles.footer}>
        <ActivityIndicator color={theme.muted} />
      </View>
    ) : (
      <View style={styles.footer}>
        <MaterialCommunityIcons name="history" size={20} color={theme.muted} />
        <ThemedText tone="muted" style={styles.caption}>
          That’s everything for now.
        </ThemedText>
      </View>
    );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header (board R3-List): back, the title, and the screen's two actions. */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <ThemedText
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: theme.text }]}>
          {reviewMode ? 'Needs review' : 'Transactions'}
        </ThemedText>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export transactions"
            onPress={() => {
              haptics.select();
              setExportError(null);
              setIsExportOpen(true);
            }}
            style={styles.headerButton}>
            <MaterialCommunityIcons name="tray-arrow-up" size={22} color={theme.text} />
          </Pressable>
          <Pressable
            testID="transactions-add"
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
            onPress={openAdd}
            style={styles.headerButton}>
            <MaterialCommunityIcons name="plus" size={26} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.muted} />
          <TextInput
            accessibilityLabel="Search transactions"
            placeholder="Search transactions"
            placeholderTextColor={theme.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFilterActive ? 'Filters, some applied' : 'Filters'}
          onPress={() => setIsFilterOpen(true)}
          style={[
            styles.filterButton,
            {
              backgroundColor: isFilterActive ? theme.selectedFill : theme.card,
              borderColor: isFilterActive ? theme.selectedBorder : theme.border,
            },
          ]}>
          <MaterialCommunityIcons name="tune-variant" size={20} color={theme.text} />
          {isFilterActive && (
            <View
              style={[styles.filterDot, { backgroundColor: theme.accent, borderColor: theme.card }]}
            />
          )}
        </Pressable>
      </View>

      {/* Every applied filter, however it was set — by the sheet, by a preset,
          or by a tap on an Insights chart — with its own ×. Filter state that
          is real but invisible reads as a broken list. */}
      {appliedChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chips}>
          {appliedChips.map((chip) => (
            <PressableView
              key={chip.key}
              testID={`applied-filter-${chip.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
              onPress={() => {
                haptics.select();
                setFilters((prev) => clearFilterFields(prev, chip.clears));
                clearRouteParams();
              }}
              style={[
                styles.chip,
                { backgroundColor: theme.selectedFill, borderColor: theme.selectedBorder },
              ]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.chipLabel, { color: theme.text }]}>{chip.label}</ThemedText>
              <MaterialCommunityIcons name="close" size={14} color={theme.text} />
            </PressableView>
          ))}
          {appliedChips.length > 1 && (
            <PressableView
              testID="applied-filter-clear-all"
              accessibilityRole="button"
              onPress={() => {
                haptics.select();
                clearFilters();
              }}
              style={styles.clearAll}
              pressedStyle={styles.pressed}>
              <ThemedText tone="muted" style={styles.chipLabel}>
                Clear all
              </ThemedText>
            </PressableView>
          )}
        </ScrollView>
      )}
      <FlatList
        ref={listRef}
        data={listItems}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={() => void loadMore()}
        // About a screen ahead, so the next page is usually in before the
        // spinner is ever seen.
        onEndReachedThreshold={1}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        // Applying a filter leaves the previous rows on screen until the new
        // ones arrive — the full-screen loader only covers the empty case.
        // Without this the list spends a beat showing results that contradict
        // the chip above it, which reads as the filter being broken.
        style={{ opacity: isLoading && transactions.length > 0 ? 0.4 : 1 }}
      />

      {/* Advanced Filters Bottom Sheet */}
      <AnimatedBottomSheet
        visible={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        sheetStyle={{ height: '92%', width: '100%' }}>
        <AdvancedFilter
          onClose={() => setIsFilterOpen(false)}
          onApply={(next) => {
            setFilters(next);
            clearRouteParams();
            setIsFilterOpen(false);
          }}
          currentFilters={filters}
          categoryCounts={categoryCounts}
          accounts={accounts}
        />
      </AnimatedBottomSheet>

      <PickerSheet visible={isExportOpen} title="Export" onClose={() => setIsExportOpen(false)}>
        <View style={styles.exportBody}>
          {/* The count is the scope, stated before the choice rather than
              discovered in the file. */}
          <ThemedText tone="muted" style={styles.exportScope}>
            {matchCount === 1
              ? '1 transaction matches what you are looking at.'
              : `${matchCount} transactions match what you are looking at.`}
            {isFilterActive || debouncedSearchQuery ? ' Your filters are included.' : ''}
          </ThemedText>

          <View style={[styles.exportCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ExportOption
              icon="file-delimited-outline"
              title="Spreadsheet (CSV)"
              subtitle="Every column, for Excel or Sheets"
              busy={exportingFormat === 'csv'}
              disabled={exportingFormat !== null}
              onPress={() => void runExport('csv')}
              theme={theme}
            />
            <ExportOption
              icon="file-document-outline"
              title="Statement (PDF)"
              subtitle="Totals and the transaction table, ready to print"
              busy={exportingFormat === 'pdf'}
              disabled={exportingFormat !== null}
              onPress={() => void runExport('pdf')}
              theme={theme}
              divider
            />
          </View>

          {exportError && (
            <ThemedText tone="negative" style={styles.caption}>
              {exportError}
            </ThemedText>
          )}
        </View>
      </PickerSheet>

      <TransactionFormModal
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        initialData={addForm}
        onSave={saveNew}
        mode="manual"
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        // The quick-fill chips read "recent, newest first", which this list is
        // only while nothing narrows or reorders it. A search for "rent" would
        // otherwise offer rent as the only thing worth repeating.
        recentEntries={
          !hasActiveConstraints && filters.sort === 'newest' ? transactions : undefined
        }
        authToken={token}
        onManageAccounts={() => router.push('/money?segment=accounts')}
      />
      {/* Mounted here, not left to the provider: this screen is pushed over the
          navigator, and the provider's own toast draws underneath it. Without
          this the delete is silent and the five seconds the confirmation
          promises cannot be reached — on the screen where most deletes happen. */}
      <TransactionUndoToast />
    </SafeAreaView>
  );
}

/** A day over its card (board R3-List): the label, and the day's total when it is complete. */
function DayHeading({
  title,
  total,
}: {
  title: string;
  total: number | null;
  first: boolean;
}) {
  return (
    <GroupHeader
      label={title}
      total={total !== null ? formatMoney(total, { sign: total > 0 ? 'always' : 'auto' }) : undefined}
    />
  );
}

/**
 * One row of the list, memoised.
 *
 * Every callback it takes is stable, so a row re-renders only when its own
 * state changes. Before, swiping one row open re-rendered every row on screen,
 * because each was handed fresh closures and the open row's id.
 */
const TransactionRow = memo(function TransactionRow({
  transaction,
  groupFirst,
  groupLast,
  showDate,
  entranceIndex,
  swipeOpen,
  collapsed,
  isNew,
  onOpen,
  onSwipeAction,
  onSwipeOpenChange,
  onDelete,
}: {
  transaction: Transaction;
  groupFirst: boolean;
  groupLast: boolean;
  showDate: boolean;
  entranceIndex?: number;
  swipeOpen: boolean;
  collapsed: boolean;
  isNew: boolean;
  onOpen: (item: Transaction, intent?: 'edit' | 'repeat', origin?: RowOrigin) => void;
  onSwipeAction: (item: Transaction, intent: 'edit' | 'repeat') => void;
  onSwipeOpenChange: (id: string, open: boolean) => void;
  onDelete: (item: Transaction) => void;
}) {
  const isIncome = transaction.entryType === 'income' || transaction.amount >= 0;
  const theme = useThemeTokens().colors;

  // Each row draws its slice of the day's card, so the list stays one flat,
  // virtualised list while it reads as a card per day.
  return (
    <View
      style={[
        styles.rowSlice,
        { backgroundColor: theme.card, borderColor: theme.border },
        groupFirst && styles.sliceFirst,
        groupLast && styles.sliceLast,
      ]}>
      <TransactionItem
        icon={transaction.icon as any}
        title={transaction.name}
        category={transaction.category}
        subtitle={transaction.accountName ?? transaction.mode ?? ''}
        amount={Math.abs(transaction.amount)}
        date={
          showDate
            ? (transaction.section ?? transaction.dateLabel ?? '')
            : (transaction.timeLabel ?? '')
        }
        color={transaction.color}
        bgColor={transaction.bgColor}
        isIncome={isIncome}
        unlinked={transaction.accountId == null}
        variant="list"
        showDivider={!groupLast}
        isNew={isNew}
        entranceIndex={entranceIndex}
        onEdit={() => onSwipeAction(transaction, 'edit')}
        onDelete={() => onDelete(transaction)}
        onRepeat={() => onSwipeAction(transaction, 'repeat')}
        swipeOpen={swipeOpen}
        onSwipeOpenChange={(open) => onSwipeOpenChange(transaction.id, open)}
        collapsed={collapsed}
        onPress={(origin) => onOpen(transaction, undefined, origin)}
      />
    </View>
  );
});

function ExportOption({
  icon,
  title,
  subtitle,
  busy,
  disabled,
  onPress,
  theme,
  divider = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useThemeTokens>['colors'];
  divider?: boolean;
}) {
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.exportOption,
        divider && { borderTopWidth: 1, borderTopColor: theme.border },
        { opacity: disabled && !busy ? 0.5 : 1 },
      ]}
      pressedStyle={styles.pressed}>
      <View style={[styles.exportTile, { backgroundColor: theme.selectedFill }]}>
        {busy ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <MaterialCommunityIcons name={icon} size={20} color={theme.text} />
        )}
      </View>
      <View style={styles.exportText}>
        <ThemedText style={[styles.exportTitle, { color: theme.text }]}>{title}</ThemedText>
        <ThemedText tone="muted" style={styles.caption}>
          {subtitle}
        </ThemedText>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.muted} />
    </PressableView>
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
  headerActions: {
    width: 88,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // Centred between equal sides: the back button's 44 is padded to the
  // actions' 88 so the title sits in the middle of the screen.
  title: {
    flex: 1,
    marginLeft: 44,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginHorizontal: SCREEN_GUTTER,
  },
  search: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    padding: 0,
    fontSize: 15,
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  // On the search row's gutter, and clear of it: the card used to sit flush
  // under the search box and 8pt narrower on each side than it.
  emptyState: {
    marginHorizontal: SCREEN_GUTTER,
    marginTop: 16,
  },
  chipScroll: {
    flexGrow: 0,
    marginTop: 10,
  },
  chips: {
    gap: 8,
    paddingHorizontal: SCREEN_GUTTER,
  },
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  clearAll: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rowSlice: {
    marginHorizontal: SCREEN_GUTTER,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  sliceFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sliceLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  footer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  centered: {
    textAlign: 'center',
    paddingHorizontal: SCREEN_GUTTER,
  },
  exportBody: {
    gap: 12,
  },
  exportScope: {
    fontSize: 13,
    lineHeight: 18,
  },
  exportCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  exportOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exportTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportText: {
    flex: 1,
    minWidth: 0,
  },
  exportTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
