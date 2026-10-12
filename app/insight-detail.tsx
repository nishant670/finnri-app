import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatChangeMagnitude } from '@/lib/insights';
import { formatMoney, toAmount } from '@/lib/money';
import { loadTransactions, resolveCategoryMetadata } from '@/lib/transactions';
import { Transaction } from '@/types/transaction';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The same magnitude rule the card that led here uses, so the drill-down never
 * contradicts it. A decrease keeps its sign; an increase past 300% becomes a
 * multiplier rather than four digits.
 */
const formatChangeMetric = (change: number) => {
  if (!Number.isFinite(change)) return '—';
  return change < 0 ? `-${formatChangeMagnitude(change)}` : formatChangeMagnitude(change);
};

/**
 * An amount only if there is one worth showing. These cards drop a metric
 * entirely rather than print a hollow zero.
 */
const formatPositiveMoney = (value?: string | number | null) => {
  const parsed = toAmount(value);
  return parsed > 0 ? formatMoney(parsed) : null;
};

const insightExplainer: Record<string, string> = {
  // Fallbacks only — the backend sends the exact window it compared, and that
  // wins. These must not contradict it: a month-to-date range is compared with
  // the same days of the previous month, not with the days just before it.
  period_comparison:
    'This compares confirmed expense totals against a matching earlier window, and only when that window held enough activity to divide by.',
  category_increase:
    'This appears when a category rises by at least 20% against a matching earlier window that held enough activity to divide by.',
  top_merchant:
    'This identifies the merchant with the highest confirmed expense total in the selected period.',
  account_usage:
    'This shows which linked account or payment source handled the largest share of spending.',
  unusual_spending:
    'This flags an expense that is substantially above the selected period average.',
  recurring_candidate:
    'This appears when repeated merchant or category behavior looks like a weekly or monthly payment pattern.',
  budget_watch:
    'This appears when confirmed expenses have crossed the alert threshold for an active monthly budget.',
  budget_exceeded:
    'This appears when confirmed expenses have crossed an active monthly budget limit.',
};

const insightActionLabel: Record<string, string> = {
  period_comparison: 'Review period transactions',
  category_increase: 'Open category',
  top_merchant: 'Open merchant',
  account_usage: 'Review account spend',
  unusual_spending: 'Find large expenses',
  recurring_candidate: 'Review recurring pattern',
  budget_watch: 'Review budget',
  budget_exceeded: 'Review budget',
};

const openTransaction = (transaction: Transaction) => {
  router.push({
    pathname: '/entry/[id]',
    params: {
      id: transaction.id,
      name: transaction.name,
      category: transaction.category,
      amount: String(Math.abs(transaction.amount)),
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

export default function InsightDetailScreen() {
  const params = useLocalSearchParams();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const { token } = useAuthStore();

  const kind = toParam(params.kind) ?? 'period_comparison';
  const title = toParam(params.title) ?? 'Insight';
  const body = toParam(params.body) ?? '';
  const explanation = toParam(params.explanation);
  const actionLabel = toParam(params.actionLabel);
  const severity = toParam(params.severity) ?? 'info';
  const start = toParam(params.start);
  const end = toParam(params.end);
  const label = toParam(params.label) ?? 'Selected period';
  const category = toParam(params.category);
  const merchant = toParam(params.merchant);
  const budgetId = toParam(params.budgetId);
  const accountId = toParam(params.accountId);
  const accountName = toParam(params.accountName);
  const amount = toParam(params.amount);
  const limitAmount = toParam(params.limitAmount);
  const remainingAmount = toParam(params.remainingAmount);
  const change = toParam(params.change);
  const percentage = toParam(params.percentage);
  const nextExpectedDate = toParam(params.nextExpectedDate);
  const confidence = toParam(params.confidence);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accent = severity === 'warning' ? '#FF6680' : colors.accent;
  const categoryMeta = resolveCategoryMetadata(category);

  const filters = useMemo(() => {
    const next: Record<string, string | number | undefined> = {
      start_date: start,
      end_date: end,
      type: 'expense',
      page: 1,
      page_size: 25,
    };
    if ((kind === 'category_increase' || kind === 'budget_watch' || kind === 'budget_exceeded') && category) next.category = category;
    if ((kind === 'top_merchant' || kind === 'recurring_candidate') && merchant) next.q = merchant;
    if (kind === 'account_usage' && accountId) next.account_id = Number(accountId);
    if (kind === 'unusual_spending') next.min_amount = Number(amount) || undefined;
    return next;
  }, [accountId, amount, category, end, kind, merchant, start]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadTransactions(token, filters);
      setTransactions(loaded.slice(0, 8));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load source transactions.'));
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const primaryStat = formatPositiveMoney(amount);
  const confidencePercent = confidence ? Math.round(Number(confidence) * 100) : null;
  const isBudgetInsight = kind === 'budget_watch' || kind === 'budget_exceeded';
  const sourceTitle = isBudgetInsight ? 'Budget Source Transactions' : 'Source Transactions';
  const emptySourceMessage = isBudgetInsight
    ? 'No matching expenses were found for this budget and period.'
    : 'This insight may come from an aggregate comparison rather than one direct transaction filter.';

  const openPrimaryAction = () => {
    if (kind === 'recurring_candidate') {
      router.push({
        pathname: '/recurring-review',
        params: { merchant: merchant ?? '', start, end },
      });
      return;
    }
    if ((kind === 'budget_watch' || kind === 'budget_exceeded') && !category) {
      router.push('/transactions');
      return;
    }
    if ((kind === 'category_increase' || kind === 'budget_watch' || kind === 'budget_exceeded') && category) {
      router.push({ pathname: '/category-detail', params: { category, start, end, label } });
      return;
    }
    if ((kind === 'top_merchant' || kind === 'recurring_candidate') && merchant) {
      router.push({ pathname: '/merchant-history', params: { merchant, start, end, label } });
      return;
    }
    router.push('/transactions');
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: colors.card }}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.text} />
        </TouchableOpacity>
        <ThemedText className="text-base font-black">Insight Detail</ThemedText>
        <TouchableOpacity
          onPress={load}
          className="h-10 w-10 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: colors.card }}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={19} color={colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 18 }}>
        <View className="rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <View className="flex-row items-start gap-4">
            <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${accent}1A` }}>
              <MaterialCommunityIcons
                name={severity === 'warning' ? 'alarm-light-outline' : categoryMeta.icon}
                size={23}
                color={accent}
              />
            </View>
            <View className="flex-1">
              <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
                {label}
              </ThemedText>
              <ThemedText className="mt-2 text-2xl font-black">{title}</ThemedText>
              <ThemedText tone="muted" className="mt-2 text-sm leading-6">{body}</ThemedText>
            </View>
          </View>

          <View className="mt-5 flex-row gap-3">
            {primaryStat && <Metric label="Amount" value={primaryStat} />}
            {limitAmount && <Metric label="Limit" value={formatPositiveMoney(limitAmount) ?? formatMoney(0)} />}
            {remainingAmount && <Metric label="Left" value={formatPositiveMoney(remainingAmount) ?? formatMoney(0)} />}
            {change && <Metric label="Change" value={formatChangeMetric(Number(change))} />}
            {percentage && <Metric label="Share" value={`${Math.round(Number(percentage))}%`} />}
            {accountName && <Metric label="Account" value={accountName} />}
            {confidencePercent != null && <Metric label="Match" value={`${confidencePercent}%`} />}
          </View>
        </View>

        <View className="rounded-[24px] border p-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <ThemedText className="text-sm font-black">Why this appeared</ThemedText>
          <ThemedText tone="muted" className="mt-2 text-xs leading-5">
            {explanation ?? insightExplainer[kind] ?? 'This is calculated from confirmed transactions inside the selected date range.'}
          </ThemedText>
          {nextExpectedDate && (
            <ThemedText className="mt-3 text-xs font-bold" style={{ color: colors.accent }}>
              Next expected around {nextExpectedDate}
            </ThemedText>
          )}
        </View>

        <View className="gap-3">
          <TouchableOpacity
            onPress={openPrimaryAction}
            className="h-12 flex-row items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.accent }}>
            <MaterialCommunityIcons name="arrow-right-circle-outline" size={20} color={colors.onAccent} />
            <ThemedText tone="onAccent" className="ml-2 text-sm font-black">
              {actionLabel ?? insightActionLabel[kind] ?? 'Review transactions'}
            </ThemedText>
          </TouchableOpacity>
          {(category || budgetId) && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/budgets',
                  params: {
                    source: 'insight',
                    budgetId: budgetId ?? '',
                    category: category ?? '',
                    suggestedLimit: limitAmount ?? amount ?? '',
                  },
                })
              }
              className="h-12 flex-row items-center justify-center rounded-2xl border"
              style={{ borderColor: colors.border, backgroundColor: colors.card }}>
              <MaterialCommunityIcons name="chart-donut" size={20} color={colors.accent} />
              <ThemedText className="ml-2 text-sm font-black" style={{ color: colors.accent }}>
                {budgetId ? 'Adjust budget' : 'Set category budget'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <View>
          <ThemedText className="mb-3 px-1 text-lg font-black">{sourceTitle}</ThemedText>
          {error ? (
            <StateView icon="wifi-off" title="Sources did not load" message={error} compact />
          ) : loading && transactions.length === 0 ? (
            <SkeletonFrame label="Loading source rows" testID="insight-detail-skeleton">
              <SkeletonRows count={4} />
            </SkeletonFrame>
          ) : transactions.length === 0 ? (
            <StateView
              icon="text-search"
              title="No matching source rows"
              message={emptySourceMessage}
              compact
            />
          ) : (
            <View className="overflow-hidden rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              {transactions.map((transaction, index) => (
                <TouchableOpacity
                  key={transaction.id}
                  onPress={() => openTransaction(transaction)}
                  className={`flex-row items-center p-4 ${index < transactions.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: resolveCategoryMetadata(transaction.category).bgColor }}>
                    <MaterialCommunityIcons
                      name={resolveCategoryMetadata(transaction.category).icon}
                      size={19}
                      color={resolveCategoryMetadata(transaction.category).color}
                    />
                  </View>
                  <View className="flex-1 pr-3">
                    <ThemedText className="text-sm font-bold" numberOfLines={1}>
                      {transaction.name}
                    </ThemedText>
                    <ThemedText tone="muted" className="mt-1 text-[11px]" numberOfLines={1}>
                      {transaction.category} · {transaction.dateLabel ?? transaction.section}
                    </ThemedText>
                  </View>
                  <ThemedText className="text-sm font-black">
                    {formatPositiveMoney(Math.abs(transaction.amount)) ?? formatMoney(0)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useThemeTokens();

  return (
    <View className="flex-1 rounded-2xl border px-3 py-3" style={{ backgroundColor: theme.colors.secondary, borderColor: theme.colors.border }}>
      <ThemedText tone="muted" className="text-[10px] font-black uppercase">{label}</ThemedText>
      <ThemedText className="mt-1 text-sm font-black" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}
