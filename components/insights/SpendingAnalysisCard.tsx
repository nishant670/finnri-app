import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { CategoryDonut } from '@/components/insights/CategoryDonut';
import { SpendTrendChart } from '@/components/insights/SpendTrendChart';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { openFilteredTransactions } from '@/lib/transaction-links';
import { SectionHeader } from './SectionHeader';

/**
 * Spending Analysis — the section this tab was missing.
 *
 * It used to be one card: a ring drawn from the single largest category with
 * that category's share printed in the middle, the top two categories beside
 * it, and two merchants underneath. Nothing on the screen showed spending over
 * time, and the ring showed a part while looking like a whole.
 *
 * It is now the two charts the data always supported — a bar per day against
 * the daily average, and a donut over the complete category breakdown — with
 * the merchant list kept as it was.
 */
export function SpendingAnalysisCard({
  dashboard,
  onDetails,
}: {
  dashboard: DashboardResponse;
  onDetails: () => void;
}) {
  const theme = useThemeTokens();
  const merchants = dashboard.top_merchants.slice(0, 2);

  return (
    <SectionHeader title="Spending Analysis" actionLabel="Details" onAction={onDetails}>
      <View className="gap-4">
        <SpendTrendChart
          dashboard={dashboard}
          onOpenRange={(bucket) =>
            openFilteredTransactions({
              startDate: bucket.start,
              endDate: bucket.end,
              type: 'Expense',
            })
          }
        />

        {dashboard.summary.total_spent > 0 && (
          <CategoryDonut
            categories={dashboard.top_categories}
            totalSpent={dashboard.summary.total_spent}
            period={dashboard.period}
            onSelectCategory={(category) =>
              openFilteredTransactions({
                category,
                startDate: dashboard.period.start,
                endDate: dashboard.period.end,
                type: 'Expense',
              })
            }
          />
        )}

        {merchants.length > 0 && (
          <View
            className="rounded-[24px] border p-5 shadow-sm"
            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
            <ThemedText
              tone="muted"
              className="mb-2 text-[10px] font-black uppercase tracking-widest">
              Top Merchants
            </ThemedText>
            {merchants.map((merchant) => (
              <MerchantRow key={merchant.merchant} merchant={merchant} />
            ))}
          </View>
        )}
      </View>
    </SectionHeader>
  );
}
function MerchantRow({ merchant }: { merchant: DashboardResponse['top_merchants'][number] }) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-2"
      onPress={() =>
        router.push({
          pathname: '/merchant-history',
          params: { merchant: merchant.merchant },
        })
      }>
      <View className="flex-row items-center">
        <View
          className="mr-3 h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.colors.secondary }}>
          <MaterialCommunityIcons name="storefront-outline" size={16} color={theme.colors.accent} />
        </View>
        <View>
          <ThemedText className="text-xs font-bold">{merchant.merchant}</ThemedText>
          <ThemedText tone="muted" className="text-[10px]">
            {merchant.transaction_count} transactions
          </ThemedText>
        </View>
      </View>
      <ThemedText className="text-xs font-black">{formatMoney(merchant.amount)}</ThemedText>
    </TouchableOpacity>
  );
}
