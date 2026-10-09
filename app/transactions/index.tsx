import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionItem, type RowOrigin } from '@/components/home/TransactionItem';
import { ThemedText } from '@/components/themed-text';
import { AdvancedFilter } from '@/components/transactions/AdvancedFilter';
import { TransactionListSkeleton } from '@/components/transactions/TransactionListSkeleton';
import {
  TransactionUndoToast,
  useTransactionDelete,
} from '@/components/transactions/TransactionDeleteProvider';
import { Colors } from '@/constants/theme';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { encodeFrame } from '@/hooks/use-shared-element';
import { StateView } from '@/components/ui/StateView';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useAuthStore } from '@/hooks/use-auth-store';
import { Account, fetchAccounts } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { shareTransactionExport, type ExportFormat } from '@/lib/export';
import { haptics } from '@/lib/haptics';
import { formatMoney, toAmountString } from '@/lib/money';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import {
  groupTransactionsBySection,
  isAmountSort,
  loadTransactionPage,
} from '@/lib/transactions';
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

export default function TransactionsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const motion = useMotion();
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [matchCount, setMatchCount] = useState(0);
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

  // Initial Load & Filtered Load
  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const page = await loadTransactionPage(token, {
        ...toTransactionFilters(filters),
        q: debouncedSearchQuery || undefined,
        page: 1,
        page_size: 100,
      });
      setTransactions(
        reviewMode ? page.transactions.filter(needsTransactionReview) : page.transactions
      );
      setCategoryCounts(page.categoryCounts);
      setMatchCount(page.total);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load transactions.'));
    } finally {
      setIsLoading(false);
    }
  }, [token, filters, debouncedSearchQuery, reviewMode]);

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
        await shareTransactionExport(token, format, {
          ...toTransactionFilters(filters),
          q: debouncedSearchQuery || undefined,
        });
        haptics.saved();
        setIsExportOpen(false);
      } catch (err) {
        haptics.rejected();
        setExportError(getFriendlyErrorMessage(err, 'Unable to export these transactions.'));
      } finally {
        setExportingFormat(null);
      }
    },
    [debouncedSearchQuery, exportingFormat, filters, token]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      if (token) {
        void fetchAccounts(token)
          .then(setAccounts)
          .catch(() => setAccounts([]));
      }
    }, [load, token])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        void load();
      }),
    [load]
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
   * Sorting by amount ranks the whole filtered set, and the day sections cannot
   * survive that: `groupTransactionsBySection` re-sorts inside each day and
   * orders the days by date, so "highest" would show the biggest expense of
   * *today* first and the biggest of the month somewhere further down. When the
   * sort is money rather than time, the list goes flat and each row carries its
   * own date instead.
   */
  const isRankedByAmount = isAmountSort(filters.sort);
  const sections = useMemo(
    () => (isRankedByAmount ? [] : groupTransactionsBySection(transactions)),
    [isRankedByAmount, transactions]
  );

  // Navigating away commits too — the hook covers unmount and backgrounding,
  // but pushing the detail screen leaves this one mounted and merely blurred.
  /**
   * Where each day's rows start in the list as a whole.
   *
   * The stagger has to count down the screen, not restart at every date
   * heading: `Motion.stagger.list` caps at the eighth row precisely so a long
   * list stops cascading, and a per-section index hands row 8 of section 3 the
   * same delay as row 8 of section 1 — the cascade comes back, once per day.
   */
  const sectionOffsets = useMemo(() => {
    let seen = 0;
    return sections.map((section) => {
      const offset = seen;
      seen += section.data.length;
      return offset;
    });
  }, [sections]);

  // A row on its way out is already spent as far as the screen is concerned, so
  // the day's total drops with it rather than waiting for the API call the
  // window is holding back. Undo puts both back together.
  const calculateDailyTotal = (items: Transaction[]) =>
    items.reduce(
      (sum, item) => (item.id === pendingDelete?.id ? sum : sum + item.amount),
      0
    );

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

  const renderTransactionCard = useCallback(
    (item: Transaction, index: number) => {
    const isIncome = item.entryType === 'income' || item.amount >= 0;
    const magnitude = Math.abs(item.amount);

    return (
      <TransactionItem
        key={item.id}
        icon={item.icon as any}
        title={item.name}
        category={item.category}
        subtitle={item.accountName ?? item.mode ?? ''}
        amount={magnitude}
        // A flat, amount-ranked list has no section heading to date it, so the
        // row has to carry its own.
        date={isRankedByAmount ? (item.section ?? item.dateLabel ?? '') : ''}
        color={item.color}
        bgColor={item.bgColor}
        isIncome={isIncome}
        unlinked={item.accountId == null}
        entranceIndex={index}
        onEdit={() => {
          setOpenSwipeId(null);
          openDetail(item, 'edit');
        }}
        onDelete={() => requestDelete(item)}
        onRepeat={() => {
          setOpenSwipeId(null);
          openDetail(item, 'repeat');
        }}
        swipeOpen={openSwipeId === item.id}
        onSwipeOpenChange={(open) => setOpenSwipeId(open ? item.id : null)}
        collapsed={pendingDelete?.id === item.id}
        onPress={(origin) => openDetail(item, undefined, origin)}
      />
    );
    },
    [isRankedByAmount, openDetail, openSwipeId, pendingDelete, requestDelete]
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800 shadow-sm">
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
        </Pressable>

        <ThemedText className="text-base font-bold" style={{ color: theme.text }}>
          &nbsp; {reviewMode ? 'Needs review' : 'Transactions'}&nbsp;
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Export transactions"
          onPress={() => {
            haptics.select();
            setExportError(null);
            setIsExportOpen(true);
          }}
          className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="tray-arrow-up" size={21} color={theme.text} />
        </Pressable>
      </View>

      {/* Header and Search */}
      <View className="px-5 mb-4">
        <View className="flex-row items-center gap-3">
          <View className="flex-1 flex-row items-center bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              placeholder="Search transactions…"
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-3 text-sm text-gray-900 font-medium"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity
            onPress={() => setIsFilterOpen(true)}
            className="h-12 w-12 items-center justify-center rounded-2xl border shadow-sm"
            style={{
              backgroundColor: isFilterActive ? theme.secondary : theme.card,
              borderColor: isFilterActive ? theme.accent : theme.border,
            }}>
            <View>
              <Ionicons
                name="options-outline"
                size={22}
                color={isFilterActive ? theme.accent : '#6B7280'}
              />
              {isFilterActive && (
                <View
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                  style={{ backgroundColor: theme.accent }}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Every applied filter, however it was set — by the sheet, by a preset,
            or by a tap on an Insights chart — with its own ×. Filter state that
            is real but invisible reads as a broken list. */}
        {appliedChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="mt-3"
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {appliedChips.map((chip) => (
              <TouchableOpacity
                key={chip.key}
                testID={`applied-filter-${chip.key}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${chip.label}`}
                onPress={() => {
                  haptics.select();
                  setFilters((prev) => clearFilterFields(prev, chip.clears));
                  clearRouteParams();
                }}
                className="flex-row items-center gap-1.5 rounded-full border px-3 py-2"
                style={{ backgroundColor: theme.secondary, borderColor: theme.accent }}>
                <ThemedText className="text-xs font-black" style={{ color: theme.accent }}>
                  {chip.label}
                </ThemedText>
                <Ionicons name="close" size={13} color={theme.accent} />
              </TouchableOpacity>
            ))}
            {appliedChips.length > 1 && (
              <TouchableOpacity
                testID="applied-filter-clear-all"
                accessibilityRole="button"
                onPress={() => {
                  haptics.select();
                  clearFilters();
                }}
                className="flex-row items-center rounded-full px-3 py-2">
                <ThemedText className="text-xs font-bold" style={{ color: '#9CA3AF' }}>
                  Clear all
                </ThemedText>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}>
        {error && transactions.length > 0 && (
          <ErrorBanner
            message={error}
            onRetry={() => void load()}
            style={{ marginHorizontal: 24, marginBottom: 16 }}
          />
        )}

        {isLoading && transactions.length === 0 ? (
          <TransactionListSkeleton />
        ) : error && transactions.length === 0 ? (
          <StateView
            icon="wifi-off"
            title="Transactions did not load"
            message={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : transactions.length === 0 ? (
          <StateView
            icon={hasActiveConstraints ? 'filter-off-outline' : 'receipt-text-plus-outline'}
            title={hasActiveConstraints ? 'No matching transactions' : 'No transactions yet'}
            message={
              hasActiveConstraints
                ? reviewMode
                  ? 'No transactions need category or account cleanup.'
                  : 'Adjust your search or filters to see more activity.'
                : 'Capture your first spend or income from the home screen.'
            }
            actionLabel={hasActiveConstraints ? 'Clear filters' : 'Capture transaction'}
            onAction={hasActiveConstraints ? clearFilters : () => router.push('/(tabs)')}
          />
        ) : (
          // Applying a filter leaves the previous rows on screen until the new
          // ones arrive — the full-screen loader only covers the empty case.
          // Without this the list spends a beat showing results that contradict
          // the chip above it, which reads as the filter being broken.
          <View style={{ opacity: isLoading ? 0.4 : 1 }}>
            {isRankedByAmount && (
              <View className="mb-3 px-6">
                <ThemedText tone="muted" className="text-xs font-bold uppercase tracking-widest">
                  {filters.sort === 'highest' ? 'Highest first' : 'Lowest first'}
                </ThemedText>
              </View>
            )}

            {isRankedByAmount ? (
              <View className="px-6">
                {transactions.map((item, index) => renderTransactionCard(item, index))}
              </View>
            ) : (
            /* Dynamic Sections */
            sections.map((section, sectionIndex) => {
              const total = calculateDailyTotal(section.data);
              const totalColor = total >= 0 ? '#27AE60' : '#808080';

              return (
                // A day whose only row was filtered out takes its heading with
                // it, and everything below has to move up rather than jump.
                <Animated.View key={section.title} layout={motion.reflow()} className="mb-6">
                  <View className="flex-row justify-between items-center px-6 mb-3">
                    <ThemedText tone="muted" className="text-xs font-bold uppercase tracking-widest">
                      {section.title.toUpperCase()}
                    </ThemedText>
                    <View className="bg-white dark:bg-gray-800 px-2 py-1 rounded-lg">
                      <ThemedText className="text-xs font-bold" style={{ color: totalColor }}>
                        {formatMoney(total, { sign: 'always' })}
                      </ThemedText>
                    </View>
                  </View>
                  <View className="px-6">
                    {section.data.map((item, index) =>
                      renderTransactionCard(item, sectionOffsets[sectionIndex] + index)
                    )}
                  </View>
                </Animated.View>
              );
            })
            )}

            {/* Footer */}
            <View className="items-center py-8 gap-3 opacity-50">
              <View className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center">
                <MaterialCommunityIcons name="history" size={20} color={theme.text} />
              </View>
              <ThemedText className="text-xs" style={{ color: theme.text }}>
                That’s everything for now.
              </ThemedText>
            </View>
          </View>
        )}
      </KeyboardAvoidingScreen>

      {/* Advanced Filters Bottom Sheet */}
      <AnimatedBottomSheet
        visible={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        sheetStyle={{ height: '92%', width: '100%' }}>
        <AdvancedFilter
          onClose={() => setIsFilterOpen(false)}
          // Rows matching the applied filters across the whole set, not the
          // page — the badge on a filter button that says 100 when there are
          // 154 is the kind of number that quietly teaches distrust.
          count={matchCount}
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

      <AnimatedBottomSheet
        visible={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        sheetStyle={{ backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <View className="p-6" style={{ gap: 12 }}>
          <ThemedText className="text-lg font-black" style={{ color: theme.text }}>
            Export
          </ThemedText>
          {/* The count is the scope, stated before the choice rather than
              discovered in the file. */}
          <ThemedText className="text-xs leading-5" style={{ color: `${theme.text}99` }}>
            {matchCount === 1
              ? '1 transaction matches what you are looking at.'
              : `${matchCount} transactions match what you are looking at.`}
            {isFilterActive || debouncedSearchQuery ? ' Your filters are included.' : ''}
          </ThemedText>

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
          />

          {exportError && (
            <ThemedText className="text-xs font-bold" style={{ color: '#D32F2F' }}>
              {exportError}
            </ThemedText>
          )}
        </View>
      </AnimatedBottomSheet>
      {/* Mounted here, not left to the provider: this screen is pushed over the
          navigator, and the provider's own toast draws underneath it. Without
          this the delete is silent and the five seconds the confirmation
          promises cannot be reached — on the screen where most deletes happen. */}
      <TransactionUndoToast />
    </SafeAreaView>
  );
}

function ExportOption({
  icon,
  title,
  subtitle,
  busy,
  disabled,
  onPress,
  theme,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useThemeTokens>['colors'];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 rounded-2xl border p-4"
      style={{
        backgroundColor: theme.background,
        borderColor: theme.border,
        opacity: disabled && !busy ? 0.5 : 1,
      }}>
      <View
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: theme.secondary }}>
        {busy ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <MaterialCommunityIcons name={icon} size={21} color={theme.accent} />
        )}
      </View>
      <View className="flex-1">
        <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
          {title}
        </ThemedText>
        <ThemedText className="mt-0.5 text-xs" style={{ color: `${theme.text}99` }}>
          {subtitle}
        </ThemedText>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={`${theme.text}66`} />
    </Pressable>
  );
}
