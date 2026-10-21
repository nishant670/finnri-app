import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  InsightCard,
  MetricStrip,
  insightText,
  periodRangeLabel,
} from '@/components/insights/insight-ui';
import { SectionHeader } from '@/components/insights/SectionHeader';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
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

  const hue = severity === 'warning' ? colors.warning : colors.accent;
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
  const sourceTitle = isBudgetInsight ? 'Budget source transactions' : 'Source transactions';
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

  const metrics = [
    limitAmount ? { label: 'Limit', value: formatPositiveMoney(limitAmount) ?? formatMoney(0) } : null,
    remainingAmount
      ? { label: 'Left', value: formatPositiveMoney(remainingAmount) ?? formatMoney(0) }
      : null,
    change ? { label: 'Change', value: formatChangeMetric(Number(change)) } : null,
    percentage ? { label: 'Share', value: `${Math.round(Number(percentage))}%` } : null,
    accountName ? { label: 'Account', value: accountName } : null,
    confidencePercent != null ? { label: 'Match', value: `${confidencePercent}%` } : null,
  ].filter((item): item is { label: string; value: string } => item != null);
  const range = periodRangeLabel(start, end);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={title}
        subtitle={range || label}
        onBack={() => router.back()}
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        rightNode={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reload"
            onPress={load}
            style={styles.headerIcon}>
            {loading ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={24} color={colors.text} />
            )}
          </Pressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <InsightCard>
          <View style={styles.heroHead}>
            <MaterialCommunityIcons
              name={severity === 'warning' ? 'alarm-light-outline' : categoryMeta.icon}
              size={18}
              color={hue}
            />
            <ThemedText style={[styles.heroLabel, { color: severity === 'warning' ? colors.warning : colors.text }]}>
              {label}
            </ThemedText>
          </View>
          {primaryStat ? (
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[insightText.figure, { color: colors.text }]}>
              {primaryStat}
            </ThemedText>
          ) : null}
          {body ? (
            <ThemedText tone="muted" style={[insightText.body, styles.heroBody]}>
              {body}
            </ThemedText>
          ) : null}
          {metrics.length > 0 ? <MetricStrip items={metrics} /> : null}
        </InsightCard>

        {/* Shown before the reasoning, as on the board: the expense itself is
            the first thing anybody checks. */}
        <SectionHeader title={sourceTitle}>
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
            <InsightCard flush>
              {transactions.map((transaction, index) => {
                const meta = resolveCategoryMetadata(transaction.category);
                return (
                  <ListRow
                    key={transaction.id}
                    icon={meta.icon}
                    hue={meta.color}
                    title={transaction.name}
                    meta={transaction.category}
                    amount={formatPositiveMoney(Math.abs(transaction.amount)) ?? formatMoney(0)}
                    status={transaction.dateLabel ?? transaction.section}
                    divider={index > 0}
                    onPress={() => openTransaction(transaction)}
                  />
                );
              })}
            </InsightCard>
          )}
        </SectionHeader>

        <View>
          <ThemedText accessibilityRole="header" style={[styles.whyTitle, { color: colors.text }]}>
            Why this appeared
          </ThemedText>
          <ThemedText tone="muted" style={insightText.body}>
            {explanation ?? insightExplainer[kind] ?? 'This is calculated from confirmed transactions inside the selected date range.'}
          </ThemedText>
          {nextExpectedDate && (
            <ThemedText style={[insightText.body, styles.bold, { color: colors.text, marginTop: 8 }]}>
              Next expected around {nextExpectedDate}
            </ThemedText>
          )}
        </View>

        <View style={styles.actions}>
          <Button
            variant="outline"
            icon={kind === 'unusual_spending' ? 'magnify' : 'arrow-right-circle-outline'}
            label={actionLabel ?? insightActionLabel[kind] ?? 'Review transactions'}
            onPress={openPrimaryAction}
          />
          {(category || budgetId) && (
            <Button
              variant="outline"
              icon="chart-donut"
              label={budgetId ? 'Adjust budget' : 'Set category budget'}
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
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginRight: -8,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heroLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  heroBody: {
    marginTop: 4,
  },
  whyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  bold: {
    fontWeight: '700',
  },
  actions: {
    gap: 10,
  },
});
