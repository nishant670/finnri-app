import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { HistoryDetailSkeleton } from '@/components/transactions/TransactionListSkeleton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { StateView } from '@/components/ui/StateView';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import { loadTransactions, resolveCategoryMetadata } from '@/lib/transactions';
import { Transaction } from '@/types/transaction';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const formatSectionDate = (value?: string | null) => {
  if (!value) return 'RECENT';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.toUpperCase();
  return parsed
    .toLocaleDateString('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric',
    })
    .toUpperCase();
};

const groupByDate = (transactions: Transaction[]) => {
  const groups = new Map<string, Transaction[]>();
  transactions.forEach((transaction) => {
    const key = formatSectionDate(transaction.rawDate ?? transaction.dateLabel);
    const existing = groups.get(key) ?? [];
    existing.push(transaction);
    groups.set(key, existing);
  });
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
};

const openTransaction = (transaction: Transaction) => {
  const amount = Math.abs(transaction.amount);
  router.push({
    pathname: '/entry/[id]',
    params: {
      id: transaction.id,
      name: transaction.name,
      category: transaction.category,
      amount: String(amount),
      entryType: transaction.entryType ?? 'expense',
      section: transaction.section,
      mode: transaction.mode ?? '',
      notes: transaction.notes ?? '',
      merchant: transaction.merchant ?? '',
      dateLabel: transaction.dateLabel ?? '',
      rawDate: transaction.rawDate ?? '',
      tag: transaction.tag ?? '',
    },
  });
};

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams();
  const category = toParam(params.category) ?? 'Category';
  const start = toParam(params.start);
  const end = toParam(params.end);
  const label = toParam(params.label);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const meta = resolveCategoryMetadata(category);
  const { token } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const loaded = await loadTransactions(token, {
          category,
          start_date: start,
          end_date: end,
          page: 1,
          page_size: 100,
        });
        setTransactions(
          loaded.filter(
            (transaction) => transaction.category.toLowerCase() === category.toLowerCase()
          )
        );
      } catch (loadError) {
        setError(getFriendlyErrorMessage(loadError, 'Unable to load category details.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [category, end, start, token]
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        void load(true);
      }),
    [load]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return transactions;
    return transactions.filter((transaction) =>
      [transaction.name, transaction.merchant, transaction.mode, transaction.accountName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [query, transactions]);

  const total = useMemo(
    () => filtered.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
    [filtered]
  );
  const average = filtered.length > 0 ? total / filtered.length : 0;
  const largest = useMemo(
    () =>
      filtered.reduce<Transaction | null>(
        (max, transaction) =>
          !max || Math.abs(transaction.amount) > Math.abs(max.amount) ? transaction : max,
        null
      ),
    [filtered]
  );
  const topMerchants = useMemo(() => {
    const groups = new Map<string, { merchant: string; amount: number; count: number }>();
    filtered.forEach((transaction) => {
      const merchant = transaction.merchant || transaction.name || 'Unknown merchant';
      const existing = groups.get(merchant) ?? { merchant, amount: 0, count: 0 };
      existing.amount += Math.abs(transaction.amount);
      existing.count += 1;
      groups.set(merchant, existing);
    });
    return Array.from(groups.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [filtered]);
  const paymentModes = useMemo(() => {
    const groups = new Map<string, { mode: string; amount: number; count: number }>();
    filtered.forEach((transaction) => {
      const mode = transaction.mode || transaction.accountName || 'Not set';
      const existing = groups.get(mode) ?? { mode, amount: 0, count: 0 };
      existing.amount += Math.abs(transaction.amount);
      existing.count += 1;
      groups.set(mode, existing);
    });
    return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  }, [filtered]);
  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  if (loading && transactions.length === 0) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <HistoryDetailSkeleton label="Loading category details" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="chevron-left" size={30} color={theme.text} />
        </TouchableOpacity>
        <ThemedText className="text-lg font-black">Category Detail</ThemedText>
        <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          {loading ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color={theme.accent} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={theme.accent}
          />
        }>
        <View className="items-center px-5 py-8">
          <View
            className="h-24 w-24 items-center justify-center rounded-[32px] shadow-sm"
            style={{ backgroundColor: meta.bgColor }}>
            <MaterialCommunityIcons name={meta.icon} size={38} color={meta.color} />
          </View>
          <ThemedText className="mt-6 text-center text-3xl font-black">
            {category} - {formatMoney(total)}
          </ThemedText>
          <View
            className="mt-5 flex-row items-center rounded-full px-5 py-3"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="chart-donut" size={18} color={theme.accent} />
            <ThemedText className="ml-2 text-base font-black" style={{ color: theme.accent }}>
              {filtered.length} transactions{label ? ` • ${label}` : ''}
            </ThemedText>
          </View>
        </View>

        <View className="mx-5 mb-7 flex-row gap-3">
          <MetricCard label="Average" value={formatMoney(average)} />
          <MetricCard
            label="Largest"
            value={largest ? formatMoney(Math.abs(largest.amount)) : formatMoney(0)}
          />
        </View>

        <View className="mx-5 mb-7 flex-row items-center rounded-[24px] bg-white px-5 py-4 shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="magnify" size={25} color="#817B77" />
          <TextInput
            className="ml-3 flex-1 text-base font-semibold text-gray-900"
            placeholder="Search this category..."
            placeholderTextColor="#817B77"
            value={query}
            onChangeText={setQuery}
          />
          {loading && <ActivityIndicator color={theme.accent} />}
        </View>

        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => void load()}
            style={{ marginHorizontal: 20, marginBottom: 20 }}
          />
        )}

        {topMerchants.length > 0 && (
          <View className="mb-7 px-5">
            <ThemedText className="mb-4 text-lg font-black">Top Merchants</ThemedText>
            <View className="overflow-hidden rounded-[26px] border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {topMerchants.map((merchant, index) => (
                <TouchableOpacity
                  key={merchant.merchant}
                  className={`flex-row items-center p-4 ${index < topMerchants.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                  onPress={() =>
                    router.push({
                      pathname: '/merchant-history',
                      params: {
                        merchant: merchant.merchant,
                        start,
                        end,
                        label,
                      },
                    })
                  }>
                  <View className="mr-4 h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                    <ThemedText tone="muted" className="text-[10px] font-black">
                      {merchant.merchant.slice(0, 3).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View className="flex-1">
                    <ThemedText className="text-sm font-black">{merchant.merchant}</ThemedText>
                    <ThemedText tone="muted" className="mt-1 text-[11px]">
                      {merchant.count} transactions
                    </ThemedText>
                  </View>
                  <View className="items-end">
                    <ThemedText className="text-sm font-black">
                      {formatMoney(merchant.amount)}
                    </ThemedText>
                    <ThemedText
                      className="mt-1 text-[10px] font-bold"
                      style={{ color: theme.accent }}>
                      Details
                    </ThemedText>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#CFCAC6" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {paymentModes.length > 0 && (
          <View className="mb-7 px-5">
            <ThemedText className="mb-4 text-lg font-black">Payment Mix</ThemedText>
            <View className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {paymentModes.slice(0, 3).map((mode) => (
                <View key={mode.mode} className="mb-4 last:mb-0">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-sm font-bold">{mode.mode}</ThemedText>
                    <ThemedText className="text-sm font-black">
                      {formatMoney(mode.amount)}
                    </ThemedText>
                  </View>
                  <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${total > 0 ? Math.min(100, (mode.amount / total) * 100) : 0}%`,
                        backgroundColor: meta.color,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {sections.length === 0 ? (
          <StateView
            icon={meta.icon}
            title="No category transactions"
            message="Try a wider period or a different search inside this category."
            compact
          />
        ) : (
          sections.map((section) => (
            <View key={section.title} className="mb-7 px-5">
              <ThemedText tone="muted" className="mb-4 text-[13px] font-black uppercase tracking-[3px]">
                {section.title}
              </ThemedText>
              <View className="overflow-hidden rounded-[26px] border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {section.data.map((transaction, index) => (
                  <CategoryTransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    isLast={index === section.data.length - 1}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[22px] border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
        {label}
      </ThemedText>
      <ThemedText className="mt-2 text-lg font-black">{value}</ThemedText>
    </View>
  );
}

function CategoryTransactionRow({
  transaction,
  isLast,
}: {
  transaction: Transaction;
  isLast: boolean;
}) {
  const amount = Math.abs(transaction.amount);
  const isIncome = transaction.entryType === 'income';

  return (
    <TouchableOpacity
      className={`flex-row items-center p-4 ${!isLast ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
      onPress={() => openTransaction(transaction)}>
      <View
        className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: transaction.bgColor }}>
        <MaterialCommunityIcons
          name={transaction.icon as any}
          size={23}
          color={transaction.color}
        />
      </View>
      <View className="flex-1 pr-3">
        <ThemedText className="text-base font-black">{transaction.name}</ThemedText>
        <View className="mt-1 flex-row items-center">
          <ThemedText
            className="mr-2 rounded-md px-2 py-1 text-[11px] font-black"
            style={{ color: transaction.color, backgroundColor: transaction.bgColor }}>
            {transaction.merchant || 'Merchant'}
          </ThemedText>
          <ThemedText tone="muted" className="text-xs">
            {transaction.accountName ?? transaction.mode ?? 'Account not set'}
          </ThemedText>
        </View>
      </View>
      <View className="items-end">
        <ThemedText className="text-base font-black">
          {isIncome ? '+' : ''}
          {formatMoney(amount)}
        </ThemedText>
        <ThemedText tone="muted" className="mt-1 text-xs">
          {transaction.dateLabel?.split(' ').slice(0, 2).join(' ') ?? ''}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}
