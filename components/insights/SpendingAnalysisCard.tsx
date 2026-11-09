import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CategoryDonut } from '@/components/insights/CategoryDonut';
import { SpendTrendChart } from '@/components/insights/SpendTrendChart';
import { ListRow } from '@/components/ui/ListRow';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { openFilteredTransactions } from '@/lib/transaction-links';
import { Eyebrow, InsightCard, MonogramTile } from './insight-ui';
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
  showTrend = true,
}: {
  dashboard: DashboardResponse;
  onDetails: () => void;
  /** Off on the Insights tab, where the glance card already draws the days (P29). */
  showTrend?: boolean;
}) {
  const merchants = dashboard.top_merchants.slice(0, 2);

  return (
    <SectionHeader title="Spending breakdown" actionLabel="Details" onAction={onDetails}>
      <View className="gap-4">
        {showTrend ? (
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
        ) : null}

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
          <InsightCard flush>
            <View style={styles.merchantsHead}>
              <Eyebrow>Top merchants</Eyebrow>
            </View>
            {merchants.map((merchant, index) => (
              <MerchantRow key={merchant.merchant} merchant={merchant} divider={index > 0} />
            ))}
          </InsightCard>
        )}
      </View>
    </SectionHeader>
  );
}
function MerchantRow({
  merchant,
  divider,
}: {
  merchant: DashboardResponse['top_merchants'][number];
  divider: boolean;
}) {
  return (
    <ListRow
      icon="storefront-outline"
      hue={MERCHANT_HUE}
      leading={<MonogramTile name={merchant.merchant} />}
      title={merchant.merchant}
      meta={`${merchant.transaction_count} transaction${merchant.transaction_count === 1 ? '' : 's'}`}
      amount={formatMoney(merchant.amount)}
      divider={divider}
      onPress={() =>
        router.push({
          pathname: '/merchant-history',
          params: { merchant: merchant.merchant },
        })
      }
    />
  );
}

/** Unused under a monogram, but ListRow wants a hue for its fallback tile. */
const MERCHANT_HUE = '#64748B';

const styles = StyleSheet.create({
  merchantsHead: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
});
