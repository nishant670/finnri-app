import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
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
 * rows double as the filter: the user taps "Loans & EMIs" to see only those.
 * Investments and card EMIs are in the total because that money leaves the
 * account today, whatever it becomes later.
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
  const muted = `${colors.text}99`;
  const loanTotal = (summary.by_kind.loan ?? 0) + (summary.by_kind.card_emi ?? 0);
  const amountFor = (kind: RecurringKind) =>
    kind === 'loan' ? loanTotal : (summary.by_kind[kind] ?? 0);

  return (
    <View
      testID="recurring-overview"
      className="rounded-[28px] border p-4"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}>
      <ThemedText className="text-xs font-black uppercase" style={{ color: muted }}>
        Committed each month
      </ThemedText>
      <ThemedText
        testID="recurring-monthly-total"
        className="mt-1 text-2xl font-black"
        style={{ fontFamily: Fonts.title, color: colors.text }}>
        {formatMoney(summary.monthly_total)}
      </ThemedText>
      {summary.next_due ? (
        <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
          Next: {summary.next_due.name} · {formatMoney(summary.next_due.amount)} on{' '}
          {formatDay(summary.next_due.date)}
        </ThemedText>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingTop: 14 }}>
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
            icon={recurringKindMeta[kind].icon}
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
  icon,
  active,
  onPress,
  colors,
  testID,
}: {
  label: string;
  amount?: number;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
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
      className="flex-row items-center gap-1.5 rounded-full border px-3 py-2"
      style={{
        backgroundColor: active ? colors.accent : 'transparent',
        borderColor: active ? colors.accent : colors.border,
      }}>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={14} color={active ? '#FFFFFF' : colors.accent} />
      ) : null}
      <ThemedText
        className="text-xs font-black"
        style={{ color: active ? '#FFFFFF' : colors.text }}>
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
export function CardEMIRow({ emi, onPress }: { emi: RecurringCardEMI; onPress: () => void }) {
  const colors = useThemeTokens().colors;
  const muted = `${colors.text}99`;
  const remaining = Math.max(0, emi.total_instalments - emi.instalments_paid);
  return (
    <Pressable
      testID={`card-emi-${emi.plan_id}`}
      accessibilityRole="button"
      accessibilityLabel={`${emi.title}, card EMI. Opens the plan`}
      onPress={onPress}
      className="rounded-[28px] border p-4"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
            {emi.title}
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
            Card EMI · {emi.card_name || 'Credit card'}
          </ThemedText>
        </View>
        <ThemedText className="text-base font-black" style={{ color: colors.accent }}>
          {formatMoney(emi.monthly_amount)}
        </ThemedText>
      </View>
      <ProgressBar paid={emi.instalments_paid} total={emi.total_instalments} colors={colors} />
      <View className="mt-2 flex-row items-center justify-between">
        <ThemedText className="text-[11px] font-bold" style={{ color: colors.text }}>
          {emi.instalments_paid} of {emi.total_instalments} billed · {remaining} left
        </ThemedText>
        <View className="flex-row items-center gap-1">
          <ThemedText className="text-[11px]" style={{ color: muted }}>
            {emi.next_due_date ? `Next ${formatDay(emi.next_due_date)}` : 'Managed on the card'}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={16} color={muted} />
        </View>
      </View>
    </Pressable>
  );
}

function ProgressBar({ paid, total, colors }: { paid: number; total: number; colors: Colors }) {
  const share = total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
  return (
    <View
      className="mt-3 h-2 overflow-hidden rounded-full"
      style={{ backgroundColor: colors.secondary }}>
      <View
        testID="recurring-progress"
        className="h-2 rounded-full"
        style={{ width: `${Math.round(share * 100)}%`, backgroundColor: colors.accent }}
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
  const muted = `${colors.text}99`;
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
          <ThemedText className="mt-1.5 text-[11px]" style={{ color: muted }}>
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
        className="mt-2 text-[11px] font-bold"
        style={{ color: colors.text }}>
        About {formatMoney(schedule.invested_so_far)} invested so far
      </ThemedText>
    );
  }
  return null;
}
