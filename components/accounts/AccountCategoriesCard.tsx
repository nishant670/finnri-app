import { StyleSheet, View } from 'react-native';

import { BarRow } from '@/components/insights/insight-ui';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { AccountCategories } from '@/lib/accounts';
import { categoryVisual } from '@/lib/categories';
import { formatMoney } from '@/lib/money';

const monthName = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return 'last month';
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
};

/** "↑ ₹1,200 vs September", or null when there is nothing to compare with. */
const changeLabel = (amount: number, previous: number, previousMonth: string) => {
  if (!(previous > 0)) return null;
  const difference = Math.round((amount - previous) * 100) / 100;
  if (difference === 0) return { label: `Same as ${previousMonth}`, tone: 'positive' as const };
  return {
    label: `${difference > 0 ? '↑' : '↓'} ${formatMoney(Math.abs(difference))} vs ${previousMonth}`,
    tone: difference > 0 ? ('negative' as const) : ('positive' as const),
  };
};

/**
 * Where an account's money went this month (P63, board
 * R5-AcctCard-Proposals): one bar per category, each with its change against
 * last month, and a line that says when last month had nothing to compare.
 */
export function AccountCategoriesCard({
  data,
  onOpenCategory,
}: {
  data: AccountCategories;
  onOpenCategory?: (category: string) => void;
}) {
  const { colors } = useThemeTokens();
  if (data.categories.length === 0) return null;
  const top = Math.max(...data.categories.map((item) => item.amount), 1);
  const previousMonth = monthName(data.previous_month);

  return (
    <View
      testID="account-categories"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {data.categories.map((item, index) => {
        const visual = categoryVisual(item.category, 'expense');
        return (
          <BarRow
            key={item.category}
            icon={visual.icon as never}
            hue={visual.color}
            title={item.category}
            amount={formatMoney(item.amount)}
            fraction={item.amount / top}
            caption={`${Math.round(item.percentage)}%`}
            trend={changeLabel(item.amount, item.previous_amount, previousMonth)}
            divider={index > 0}
            onPress={onOpenCategory ? () => onOpenCategory(item.category) : undefined}
          />
        );
      })}
      {data.previous_total > 0 ? null : (
        <ThemedText tone="muted" style={[styles.note, { borderTopColor: colors.border }]}>
          {`Nothing on this account in ${previousMonth} to compare with.`}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  note: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 18,
  },
});
