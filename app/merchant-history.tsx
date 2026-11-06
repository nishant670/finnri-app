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
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import { loadTransactions, resolveCategoryMetadata } from '@/lib/transactions';
import { Transaction } from '@/types/transaction';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const merchantInitials = (merchant: string) =>
  merchant
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 3) || 'M';

const formatSectionDate = (value?: string | null) => {
  if (!value) return 'Recent';
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

export default function MerchantHistoryScreen() {
  const params = useLocalSearchParams();
  const merchant = toParam(params.merchant) ?? 'Merchant';
  const start = toParam(params.start);
  const end = toParam(params.end);
  const label = toParam(params.label);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const actionsBottom = useBottomInset(32);
  const contentBottom = useBottomInset(120);
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
          q: merchant,
          start_date: start,
          end_date: end,
          page: 1,
          page_size: 100,
        });
        setTransactions(
          loaded.filter((transaction) =>
            (transaction.merchant || transaction.name)
              .toLowerCase()
              .includes(merchant.toLowerCase())
          )
        );
      } catch (loadError) {
        setError(getFriendlyErrorMessage(loadError, 'Unable to load merchant history.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [end, merchant, start, token]
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
      [transaction.name, transaction.category, transaction.mode, transaction.accountName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [query, transactions]);

  const total = useMemo(
    () =>
      filtered
        .filter((transaction) => transaction.entryType !== 'income')
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
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
  const topCategories = useMemo(() => {
    const groups = new Map<string, { category: string; amount: number; count: number }>();
    filtered.forEach((transaction) => {
      const existing = groups.get(transaction.category) ?? {
        category: transaction.category,
        amount: 0,
        count: 0,
      };
      existing.amount += Math.abs(transaction.amount);
      existing.count += 1;
      groups.set(transaction.category, existing);
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
        edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <HistoryDetailSkeleton label="Loading merchant history" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="chevron-left" size={30} color={theme.text} />
        </TouchableOpacity>
        <ThemedText className="text-lg font-black">Merchant Detail</ThemedText>
        <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="calendar-month-outline" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottom }}
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
          <View className="h-24 w-24 items-center justify-center rounded-full bg-gray-100 shadow-sm">
            <ThemedText tone="muted" className="text-3xl font-black">
              {merchantInitials(merchant)}
            </ThemedText>
          </View>
          <ThemedText className="mt-6 text-3xl font-black text-center">
            {merchant} - {formatMoney(total)}
          </ThemedText>
          <View
            className="mt-5 flex-row items-center rounded-full px-5 py-3"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="receipt-text-outline" size={18} color={theme.accent} />
            <ThemedText className="ml-2 text-base font-black" style={{ color: theme.accent }}>
              {filtered.length} transactions{label ? ` • ${label}` : ''}
            </ThemedText>
          </View>
        </View>

        <View className="mx-5 mb-7 flex-row gap-3">
          <MerchantMetricCard label="Average" value={formatMoney(average)} />
          <MerchantMetricCard
            label="Largest"
            value={largest ? formatMoney(Math.abs(largest.amount)) : formatMoney(0)}
          />
        </View>

        <View className="mx-5 mb-7 flex-row items-center rounded-[24px] bg-white px-5 py-4 shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="magnify" size={25} color="#817B77" />
          <TextInput
            className="ml-3 flex-1 text-base font-semibold text-gray-900"
            placeholder="Search within history..."
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

        {topCategories.length > 0 && (
          <View className="mb-7 px-5">
            <ThemedText className="mb-4 text-lg font-black">Category Split</ThemedText>
            <View className="overflow-hidden rounded-[26px] border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {topCategories.map((category, index) => {
                const meta = resolveCategoryMetadata(category.category);
                return (
                  <TouchableOpacity
                    key={category.category}
                    className={`flex-row items-center p-4 ${index < topCategories.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
                    onPress={() =>
                      router.push({
                        pathname: '/category-detail',
                        params: {
                          category: category.category,
                          start,
                          end,
                          label,
                        },
                      })
                    }>
                    <View
                      className="mr-4 h-11 w-11 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: meta.bgColor }}>
                      <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-sm font-black">{category.category}</ThemedText>
                      <ThemedText tone="muted" className="mt-1 text-[11px]">
                        {category.count} transactions
                      </ThemedText>
                    </View>
                    <View className="items-end">
                      <ThemedText className="text-sm font-black">
                        {formatMoney(category.amount)}
                      </ThemedText>
                      <View className="mt-2 h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${total > 0 ? Math.min(100, (category.amount / total) * 100) : 0}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#CFCAC6" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {paymentModes.length > 0 && (
          <View className="mb-7 px-5">
            <ThemedText className="mb-4 text-lg font-black">Payment Mix</ThemedText>
            <View className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {paymentModes.slice(0, 3).map((mode, index) => (
                <View
                  key={mode.mode}
                  className={index < Math.min(paymentModes.length, 3) - 1 ? 'mb-4' : ''}>
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
                        backgroundColor: theme.accent,
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
            icon="store-search-outline"
            title="No merchant transactions"
            message="Try a wider period or a different search within this merchant history."
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
                  <MerchantTransactionRow
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

      <View className="absolute left-5 right-5 flex-row gap-4" style={{ bottom: actionsBottom }}>
        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center rounded-[24px] py-5 shadow-lg"
          style={{ backgroundColor: theme.accent }}>
          <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={22} color={theme.onAccent} />
          <ThemedText tone="onAccent" className="ml-3 text-lg font-black">Merchant Insights</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity className="h-[64px] w-[64px] items-center justify-center rounded-[24px] bg-white shadow-sm">
          <MaterialCommunityIcons name="download-outline" size={26} color={theme.text} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function MerchantMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[22px] border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
        {label}
      </ThemedText>
      <ThemedText className="mt-2 text-lg font-black">{value}</ThemedText>
    </View>
  );
}

function MerchantTransactionRow({
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
      onPress={() =>
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
        })
      }>
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
            {transaction.category}
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
