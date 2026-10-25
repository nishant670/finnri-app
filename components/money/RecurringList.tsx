import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { cardVisual, recurringVisuals } from '@/components/money/money-visuals';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { categoryTile } from '@/lib/categories';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import {
  kindOf,
  recurringKindMeta,
  recurringKinds,
  type RecurringCardEMI,
  type RecurringFilter,
  type RecurringSummary,
} from '@/lib/recurring';
import { currentPaymentPeriod, intervalLabel, reminderLabel } from '@/lib/subscription-form';
import type { RecurringKind, Subscription } from '@/lib/subscriptions';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** "4 Nov": every date on the list in one form (the list mixed "Next 9 Nov" with "Due 04 Nov 2026"). */
export const formatRecurringDay = (value?: string | null) => {
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

/** A kind's monthly total, with card EMIs counted under Loans & EMIs. */
export const recurringKindTotal = (summary: RecurringSummary | null, kind: RecurringKind) =>
  kind === 'loan'
    ? (summary?.by_kind.loan ?? 0) + (summary?.by_kind.card_emi ?? 0)
    : (summary?.by_kind[kind] ?? 0);

/**
 * What every recurring payment commits a month to (board R5-RecurringList),
 * with the one Add on the screen and what comes next. It was said twice — a
 * line above this card and the card itself — and is said once now.
 */
export function RecurringSummaryCard({
  summary,
  onAdd,
}: {
  summary: RecurringSummary;
  onAdd: () => void;
}) {
  const { colors } = useThemeTokens();
  const next = summary.next_due;
  return (
    <View testID="recurring-overview" style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.summaryHead}>
        <View style={styles.flex}>
          <ThemedText tone="muted" style={styles.body}>
            Committed each month
          </ThemedText>
          <ThemedText
            testID="recurring-monthly-total"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.total, { color: colors.text }]}>
            {formatMoney(summary.monthly_total)}
          </ThemedText>
        </View>
        <PressableView
          accessibilityRole="button"
          accessibilityLabel="Add"
          onPress={onAdd}
          style={[styles.addPill, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
          <ThemedText style={[styles.addLabel, { color: colors.text }]}>Add</ThemedText>
        </PressableView>
      </View>
      <ThemedText tone="muted" style={[styles.body, styles.summaryLine]}>
        {summary.active_count} active
        {next ? ` · next is ${next.name}, ${formatMoney(next.amount)} on ${formatRecurringDay(next.date)}` : ''}
      </ThemedText>
    </View>
  );
}

/** The kind filter: All, then each kind, chosen as a tint (board R5-RecurringList). */
export function RecurringKindChips({
  filter,
  onFilter,
}: {
  filter: RecurringFilter;
  onFilter: (next: RecurringFilter) => void;
}) {
  const { colors } = useThemeTokens();
  const chip = (key: RecurringFilter, label: string) => {
    const active = filter === key;
    return (
      <PressableView
        key={key}
        testID={key === 'all' ? 'recurring-filter-all' : `recurring-filter-${key}`}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        onPress={() => onFilter(key)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.selectedFill : colors.card,
            borderColor: active ? colors.selectedBorder : colors.borderStrong,
          },
        ]}
        pressedStyle={styles.pressed}>
        <ThemedText style={[styles.chipLabel, { color: colors.text, fontWeight: active ? '700' : '500' }]}>
          {label}
        </ThemedText>
      </PressableView>
    );
  };
  return (
    <ScrollView
      horizontal
      accessibilityRole="radiogroup"
      accessibilityLabel="Kind"
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chips}>
      {chip('all', 'All')}
      {recurringKinds.map((kind) => chip(kind, recurringKindMeta[kind].plural))}
    </ScrollView>
  );
}

/** A kind's heading over its card, with what it commits a month to. */
export function RecurringSection({
  title,
  total,
  children,
}: {
  title: string;
  total?: string;
  children: ReactNode;
}) {
  const { colors } = useThemeTokens();
  return (
    <View>
      <View style={styles.sectionHead}>
        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          {title}
        </ThemedText>
        {total ? (
          <ThemedText tone="muted" style={styles.caption}>
            {total}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

type Tone = 'muted' | 'warning' | 'negative' | 'positive';

/**
 * The row frame both recurring rows share: kind tile; name and amount; what it
 * is and when it is due on one line; then any progress.
 */
function RecurringRowFrame({
  hue,
  icon,
  title,
  amount,
  meta,
  due,
  dueTone = 'muted',
  dueIcon,
  divider,
  onPress,
  testID,
  accessibilityLabel,
  children,
}: {
  hue: string;
  icon: IconName;
  title: string;
  amount: string;
  meta: string;
  due: string;
  dueTone?: Tone;
  dueIcon?: IconName;
  divider: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
  children?: ReactNode;
}) {
  const theme = useThemeTokens();
  const { colors } = theme;
  const tile = categoryTile({ color: hue, bgColor: mixHex('#FFFFFF', hue, 0.14) }, theme.mode);
  const dueColor =
    dueTone === 'negative'
      ? colors.negative
      : dueTone === 'warning'
        ? colors.warning
        : dueTone === 'positive'
          ? colors.positive
          : colors.muted;
  return (
    <PressableView
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <View style={[styles.tile, { backgroundColor: tile.background }]}>
        <MaterialCommunityIcons name={icon} size={18} color={tile.foreground} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleLine}>
          <ThemedText numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.rowAmount, { color: colors.text }]}>{amount}</ThemedText>
        </View>
        <View style={styles.metaLine}>
          <ThemedText tone="muted" numberOfLines={1} style={[styles.caption, styles.flex]}>
            {meta}
          </ThemedText>
          {due ? (
            <View style={styles.due}>
              {dueIcon ? <MaterialCommunityIcons name={dueIcon} size={12} color={dueColor} /> : null}
              <ThemedText style={[styles.caption, { color: dueColor, fontWeight: dueTone === 'muted' ? '400' : '600' }]}>
                {due}
              </ThemedText>
            </View>
          ) : null}
        </View>
        {children}
      </View>
    </PressableView>
  );
}

/** Paid of total, as a bar in the positive colour and the words under it. */
function Progress({ paid, total, testID }: { paid: number; total: number; testID?: string }) {
  const { colors } = useThemeTokens();
  const share = total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
  const done = total > 0 && paid >= total;
  return (
    <View testID={testID} style={styles.progress}>
      <View style={[styles.bar, { backgroundColor: colors.track }]}>
        <View
          testID="recurring-progress"
          style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.positive }]}
        />
      </View>
      <ThemedText tone="muted" style={styles.caption}>
        {done ? `All ${total} payments done` : `${paid} of ${total} paid · ${total - paid} left`}
      </ThemedText>
    </View>
  );
}

/** What a recurring payment is, after its name: "Loan · ICICI Bank · monthly". */
export const describeRecurring = (item: Subscription) => {
  const kind = kindOf(item);
  const interval = intervalLabel(item.billing_interval).toLowerCase();
  if (kind === 'loan') return ['Loan', item.lender, interval].filter(Boolean).join(' · ');
  if (kind === 'investment') {
    const type = item.merchant && item.merchant !== item.name ? item.merchant : '';
    return [type || 'Investment', item.platform, interval].filter(Boolean).join(' · ');
  }
  return [item.category || 'Uncategorized', interval].join(' · ');
};

/** Where an item's schedule stands, said in one word or a date. */
export const recurringDue = (item: Subscription): { label: string; tone: Tone; icon?: IconName } => {
  const total = item.total_instalments ?? item.schedule?.total_instalments ?? 0;
  const paid = item.instalments_paid ?? item.schedule?.instalments_paid ?? 0;
  if (total > 0 && paid >= total) return { label: 'Completed', tone: 'positive' };
  if (item.status === 'cancelled' || item.due_state === 'cancelled') return { label: 'Cancelled', tone: 'muted' };
  if (item.status === 'paused' || item.due_state === 'paused') return { label: 'Paused', tone: 'muted' };
  const day = formatRecurringDay(item.next_due_date);
  if (item.due_state === 'overdue') return { label: `Overdue · ${day}`, tone: 'negative', icon: 'alert-circle-outline' };
  if (item.due_state === 'due_soon') return { label: `Due ${day}`, tone: 'warning', icon: 'bell-outline' };
  return { label: day ? `Due ${day}` : '', tone: 'muted', icon: 'bell-outline' };
};

/** One recurring payment as a row (board R5-RecurringList). Tapping it opens its actions. */
export function RecurringRow({
  item,
  divider,
  onPress,
}: {
  item: Subscription;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  const kind = kindOf(item);
  const visual = recurringVisuals[kind];
  const due = recurringDue(item);
  const total = item.total_instalments ?? item.schedule?.total_instalments ?? 0;
  const paid = item.instalments_paid ?? item.schedule?.instalments_paid ?? 0;
  const schedule = item.schedule;
  const loanLeft =
    kind === 'loan' && schedule && !schedule.completed
      ? [
          schedule.outstanding_principal != null ? `${formatMoney(schedule.outstanding_principal)} left` : null,
          schedule.end_date ? `ends ${formatMonthYear(schedule.end_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <RecurringRowFrame
      hue={visual.hue}
      icon={visual.icon}
      title={item.name}
      amount={formatMoney(item.amount)}
      meta={describeRecurring(item)}
      due={due.label}
      dueTone={due.tone}
      dueIcon={due.icon}
      divider={divider}
      accessibilityLabel={`${item.name}, ${formatMoney(item.amount)}. ${due.label}. Opens its actions`}
      onPress={onPress}>
      {kind === 'loan' && total > 0 ? <Progress paid={paid} total={total} testID="recurring-loan-progress" /> : null}
      {loanLeft ? (
        <ThemedText tone="muted" style={styles.caption}>
          {loanLeft}
        </ThemedText>
      ) : null}
      {kind === 'investment' && schedule?.invested_so_far ? (
        <ThemedText testID="recurring-invested" tone="muted" style={[styles.caption, styles.gapTop]}>
          About {formatMoney(schedule.invested_so_far)} invested so far
        </ThemedText>
      ) : null}
      {item.cancel_before_due ? (
        <View style={[styles.tag, { backgroundColor: colors.warningSurface }]}>
          <ThemedText tone="warning" style={styles.tagLabel}>
            Cancel reminder on
          </ThemedText>
        </View>
      ) : null}
    </RecurringRowFrame>
  );
}

/**
 * A card EMI plan. It is a purchase converted on the card: its instalments land
 * on statements and block the card's limit, so it is managed on its own
 * screen, which this row opens.
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
  return (
    <RecurringRowFrame
      testID={`card-emi-${emi.plan_id}`}
      hue={cardVisual.hue}
      icon={cardVisual.icon}
      title={emi.title}
      amount={formatMoney(emi.monthly_amount)}
      meta={`Card EMI · ${emi.card_name || 'Credit card'}`}
      due={emi.next_due_date ? `Next ${formatRecurringDay(emi.next_due_date)}` : 'Managed on the card'}
      divider={divider}
      accessibilityLabel={`${emi.title}, card EMI. Opens the plan`}
      onPress={onPress}>
      <Progress paid={emi.instalments_paid} total={emi.total_instalments} />
    </RecurringRowFrame>
  );
}

/**
 * Cancelled items, folded into one dashed row under the list (board
 * R5-RecurringList) instead of sitting among the active ones.
 */
export function CancelledRow({
  items,
  expanded,
  onToggle,
}: {
  items: Subscription[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useThemeTokens();
  const names = items.length <= 2 ? items.map((item) => item.name).join(', ') : `${items.length} items`;
  return (
    <PressableView
      testID="recurring-cancelled"
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={[styles.cancelled, { borderColor: colors.borderStrong }]}
      pressedStyle={styles.pressed}>
      <ThemedText tone="muted" numberOfLines={1} style={[styles.cancelledLabel, styles.flex]}>
        Cancelled · {names}
      </ThemedText>
      <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-right'} size={16} color={colors.muted} />
    </PressableView>
  );
}

/**
 * Everything a row can do, named (board R5-RecurringActions). The row used to
 * carry three unlabelled icons — mark paid, cancel and delete, delete in red
 * on every row.
 */
export function RecurringActionsSheet({
  item,
  visible,
  onClose,
  onMarkPaid,
  onEdit,
  onCancel,
  onDelete,
}: {
  item: Subscription | null;
  visible: boolean;
  onClose: () => void;
  onMarkPaid: (item: Subscription) => void;
  onEdit: (item: Subscription) => void;
  onCancel: (item: Subscription) => void;
  onDelete: (item: Subscription) => void;
}) {
  const theme = useThemeTokens();
  const { colors } = theme;
  if (!item) return null;
  const kind = kindOf(item);
  const visual = recurringVisuals[kind];
  const tile = categoryTile({ color: visual.hue, bgColor: mixHex('#FFFFFF', visual.hue, 0.14) }, theme.mode);
  const active = item.status === 'active';
  const daily = item.billing_interval === 'daily' || item.billing_interval === 'business_daily';
  const reminder = reminderLabel(item.reminder_days);
  const summary = [
    formatMoney(item.amount),
    active
      ? `due ${formatRecurringDay(item.next_due_date)}`
      : item.status === 'paused'
        ? 'paused'
        : 'cancelled',
    active && !daily ? `reminder ${reminder.charAt(0).toLowerCase()}${reminder.slice(1)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const run = (action: (target: Subscription) => void) => () => {
    onClose();
    action(item);
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} sheetStyle={[styles.sheet, { backgroundColor: colors.card }]}>
      <View testID="recurring-actions" accessibilityLabel={item.name}>
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.sheetHead}>
          <View style={[styles.tile, { backgroundColor: tile.background }]}>
            <MaterialCommunityIcons name={visual.icon} size={18} color={tile.foreground} />
          </View>
          <View style={styles.flex}>
            <ThemedText accessibilityRole="header" numberOfLines={1} style={[styles.sheetTitle, { color: colors.text }]}>
              {item.name}
            </ThemedText>
            <ThemedText tone="muted" numberOfLines={1} style={styles.caption}>
              {summary}
            </ThemedText>
          </View>
          <SheetCloseButton onPress={onClose} />
        </View>
        {active ? (
          <SettingsRow
            icon="check-circle-outline"
            title="Mark paid"
            subtitle={`Log ${currentPaymentPeriod(item.billing_interval)} ${formatMoney(item.amount)} payment`}
            accessibilityLabel={`Mark ${item.name} paid`}
            onPress={run(onMarkPaid)}
          />
        ) : null}
        <SettingsRow
          icon="pencil-outline"
          title="Edit"
          subtitle="Amount, date, account and reminder"
          accessibilityLabel={`Edit ${item.name}`}
          divider={active}
          onPress={run(onEdit)}
        />
        {active ? (
          <SettingsRow
            icon="calendar-remove-outline"
            title="Cancel"
            subtitle="Stops it from the next due date. Past payments stay."
            accessibilityLabel={`Cancel ${item.name}`}
            divider
            onPress={run(onCancel)}
          />
        ) : null}
        <SettingsRow
          tone="danger"
          icon="trash-can-outline"
          title="Delete"
          subtitle="Removes it from Recurring"
          accessibilityLabel={`Delete ${item.name}`}
          divider
          onPress={run(onDelete)}
        />
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  summary: {
    marginHorizontal: SCREEN_GUTTER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  total: {
    marginTop: 2,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summaryLine: {
    marginTop: 6,
  },
  addPill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  addLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  gapTop: {
    marginTop: 4,
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
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 17,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
    marginHorizontal: SCREEN_GUTTER,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  rowAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progress: {
    gap: 4,
    marginTop: 8,
  },
  bar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
  },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  cancelled: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: SCREEN_GUTTER,
    paddingLeft: 14,
    paddingRight: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  cancelledLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
