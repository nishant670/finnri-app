import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { recurringVisuals } from '@/components/money/money-visuals';
import { RecurringScheduleLine } from '@/components/money/RecurringParts';
import { Subscription } from '@/lib/subscriptions';
import { ThemedText } from '@/components/themed-text';
import { ListRow, type ListRowTone } from '@/components/ui/ListRow';
import { formatDueDateLabel, intervalLabel, reminderLabel } from '@/lib/subscription-form';
import { formatMoney } from '@/lib/money';
import { kindOf, recurringKindMeta } from '@/lib/recurring';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionCardProps = {
  subscription: Subscription;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted?: string;
  /** The rule above the row: every row in the card but the first. */
  divider?: boolean;
  onPress: () => void;
  onMarkPaid: () => void;
  onCancelNow: () => void;
  onDelete: () => void;
};

/**
 * One recurring payment as a row of the Recurring card (boards R5-*): its kind
 * tile, name and what it is, the amount with where it stands under it — red
 * overdue, amber due soon — then a loan's progress and the row's own actions.
 */
export function SubscriptionCard({
  subscription,
  colors,
  divider = false,
  onPress,
  onMarkPaid,
  onCancelNow,
  onDelete,
}: SubscriptionCardProps) {
  const totalInstalments = subscription.total_instalments ?? 0;
  const instalmentsPaid = subscription.instalments_paid ?? 0;
  const loanFinished = totalInstalments > 0 && instalmentsPaid >= totalInstalments;
  const instalmentLine =
    totalInstalments > 0
      ? loanFinished
        ? `All ${totalInstalments} payments done`
        : `${instalmentsPaid} of ${totalInstalments} paid · ${totalInstalments - instalmentsPaid} left`
      : null;
  const isActive = subscription.status === 'active';
  const kind = kindOf(subscription);
  const visual = recurringVisuals[kind];
  const detail =
    kind === 'loan' && subscription.lender
      ? subscription.lender
      : kind === 'investment' && subscription.platform
        ? subscription.platform
        : subscription.category || 'Uncategorized';

  const [status, statusTone]: [string, ListRowTone] = loanFinished
    ? ['Completed', 'positive']
    : subscription.due_state === 'overdue'
      ? ['Overdue', 'negative']
      : subscription.due_state === 'due_soon'
        ? [`Due ${formatDueDateLabel(subscription.next_due_date)}`, 'warning']
        : subscription.due_state === 'paused'
          ? ['Paused', 'muted']
          : subscription.due_state === 'cancelled'
            ? ['Cancelled', 'muted']
            : [`Due ${formatDueDateLabel(subscription.next_due_date)}`, 'muted'];

  return (
    <ListRow
      icon={visual.icon}
      hue={visual.hue}
      title={subscription.name}
      meta={`${recurringKindMeta[kind].label} · ${detail} · ${intervalLabel(subscription.billing_interval)}`}
      amount={formatMoney(subscription.amount)}
      status={status}
      statusTone={statusTone}
      divider={divider}
      accessibilityLabel={`Edit ${subscription.name}`}
      onPress={onPress}>
      {instalmentLine ? (
        <ThemedText style={[styles.caption, styles.strong, { color: colors.text }]}>
          {instalmentLine}
        </ThemedText>
      ) : null}
      <RecurringScheduleLine item={subscription} kind={kind} />
      <View style={styles.footer}>
        <ThemedText tone="muted" numberOfLines={1} style={[styles.caption, styles.flex]}>
          {loanFinished ? '' : reminderLabel(subscription.reminder_days)}
        </ThemedText>
        {subscription.cancel_before_due && (
          <View style={[styles.tag, { backgroundColor: colors.warningSurface }]}>
            <ThemedText tone="warning" style={styles.tagLabel}>
              Cancel reminder
            </ThemedText>
          </View>
        )}
        {isActive && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${subscription.name} paid`}
            onPress={onMarkPaid}
            hitSlop={8}
            style={styles.action}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.text} />
          </Pressable>
        )}
        {isActive && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${subscription.name}`}
            onPress={onCancelNow}
            hitSlop={8}
            style={styles.action}>
            <MaterialCommunityIcons name="calendar-remove-outline" size={20} color={colors.warning} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${subscription.name}`}
          onPress={onDelete}
          hitSlop={8}
          style={styles.action}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.negative} />
        </Pressable>
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  strong: {
    marginTop: 2,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  action: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
