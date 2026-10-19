import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { cardVisual } from '@/components/money/money-visuals';
import { ThemedText } from '@/components/themed-text';
import { ListRow } from '@/components/ui/ListRow';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import {
  recurringKindMeta,
  recurringKinds,
  type RecurringCardEMI,
  type RecurringFilter,
  type RecurringSummary,
} from '@/lib/recurring';
import type { RecurringKind, Subscription } from '@/lib/subscriptions';

type Colors = ReturnType<typeof useThemeTokens>['colors'];

const formatDay = (value?: string) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const formatMonthYear = (value?: string) => {
  const match = value?.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

/**
 * What every recurring payment commits a month to, split by kind. The kind
 * chips double as the filter: the user taps "Loans & EMIs" to see only those.
 * Investments and card EMIs are in the total because that money leaves the
 * account today, whatever it becomes later. Drawn like Upcoming's summary
 * card (board R5-Upcoming), with the redesign's tinted chips under it.
 */
export function RecurringOverviewCard({
  summary,
  filter,
  onFilter,
}: {
  summary: RecurringSummary;
  filter: RecurringFilter;
  onFilter: (next: RecurringFilter) => void;
}) {
  const colors = useThemeTokens().colors;
  const loanTotal = (summary.by_kind.loan ?? 0) + (summary.by_kind.card_emi ?? 0);
  const amountFor = (kind: RecurringKind) =>
    kind === 'loan' ? loanTotal : (summary.by_kind[kind] ?? 0);

  return (
    <View testID="recurring-overview">
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ThemedText tone="muted" style={styles.eyebrow}>
          Committed each month
        </ThemedText>
        <ThemedText testID="recurring-monthly-total" style={[styles.total, { color: colors.text }]}>
          {formatMoney(summary.monthly_total)}
        </ThemedText>
        {summary.next_due ? (
          <ThemedText tone="muted" style={styles.caption}>
            Next: {summary.next_due.name} · {formatMoney(summary.next_due.amount)} on{' '}
            {formatDay(summary.next_due.date)}
          </ThemedText>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}>
        <FilterChip
          label="All"
          active={filter === 'all'}
          onPress={() => onFilter('all')}
          colors={colors}
        />
        {recurringKinds.map((kind) => (
          <FilterChip
            key={kind}
            testID={`recurring-filter-${kind}`}
            label={recurringKindMeta[kind].plural}
            amount={amountFor(kind)}
            active={filter === kind}
            onPress={() => onFilter(kind)}
            colors={colors}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  amount,
  active,
  onPress,
  colors,
  testID,
}: {
  label: string;
  amount?: number;
  active: boolean;
  onPress: () => void;
  colors: Colors;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.selectedFill : colors.card,
          borderColor: active ? colors.selectedBorder : colors.border,
        },
      ]}>
      <ThemedText style={[styles.chipLabel, { color: colors.text, fontWeight: active ? '700' : '500' }]}>
        {label}
        {amount ? ` · ${formatMoney(amount)}` : ''}
      </ThemedText>
    </Pressable>
  );
}

/**
 * A card EMI plan, read-only here. It is a purchase converted on the card:
 * its instalments land on statements and block the card's limit, so it is
 * managed on its own screen, which this row opens.
 */
export function CardEMIRow({
  emi,
  onPress,
  divider = false,
}: {
  emi: RecurringCardEMI;
  onPress: () => void;
  divider?: boolean;
}) {
  const colors = useThemeTokens().colors;
  const remaining = Math.max(0, emi.total_instalments - emi.instalments_paid);
  return (
    <ListRow
      testID={`card-emi-${emi.plan_id}`}
      accessibilityLabel={`${emi.title}, card EMI. Opens the plan`}
      icon={cardVisual.icon}
      hue={cardVisual.hue}
      title={emi.title}
      meta={`Card EMI · ${emi.card_name || 'Credit card'}`}
      amount={formatMoney(emi.monthly_amount)}
      status={emi.next_due_date ? `Next ${formatDay(emi.next_due_date)}` : 'Managed on the card'}
      divider={divider}
      onPress={onPress}>
      <ProgressBar paid={emi.instalments_paid} total={emi.total_instalments} colors={colors} />
      <ThemedText style={[styles.caption, styles.strong, { color: colors.text }]}>
        {emi.instalments_paid} of {emi.total_instalments} billed · {remaining} left
      </ThemedText>
    </ListRow>
  );
}

function ProgressBar({ paid, total, colors }: { paid: number; total: number; colors: Colors }) {
  const share = total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
  return (
    <View style={[styles.bar, { backgroundColor: colors.track }]}>
      <View
        testID="recurring-progress"
        style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.accent }]}
      />
    </View>
  );
}

/**
 * The line under an item that says where its schedule stands: a loan's
 * progress, outstanding and end; an investment's running total.
 */
export function RecurringScheduleLine({ item, kind }: { item: Subscription; kind: RecurringKind }) {
  const colors = useThemeTokens().colors;
  const schedule = item.schedule;

  if (kind === 'loan' && schedule?.total_instalments) {
    const paid = schedule.instalments_paid ?? 0;
    const parts = [
      schedule.outstanding_principal != null && !schedule.completed
        ? `${formatMoney(schedule.outstanding_principal)} left`
        : null,
      schedule.end_date && !schedule.completed
        ? `ends ${formatMonthYear(schedule.end_date)}`
        : null,
    ].filter(Boolean);
    return (
      <View testID="recurring-loan-progress">
        <ProgressBar paid={paid} total={schedule.total_instalments} colors={colors} />
        {parts.length > 0 ? (
          <ThemedText tone="muted" style={styles.caption}>
            {parts.join(' · ')}
          </ThemedText>
        ) : null}
      </View>
    );
  }
  if (kind === 'investment' && schedule?.invested_so_far) {
    return (
      <ThemedText
        testID="recurring-invested"
        style={[styles.caption, styles.strong, { color: colors.text }]}>
        About {formatMoney(schedule.invested_so_far)} invested so far
      </ThemedText>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  summary: {
    gap: 2,
    marginHorizontal: SCREEN_GUTTER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  total: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  strong: {
    marginTop: 2,
    fontWeight: '600',
  },
  chipScroll: {
    flexGrow: 0,
    marginTop: 12,
  },
  chips: {
    gap: 8,
    paddingHorizontal: SCREEN_GUTTER,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  bar: {
    height: 6,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
});
