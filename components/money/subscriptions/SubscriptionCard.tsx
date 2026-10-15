import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { RecurringScheduleLine } from '@/components/money/RecurringParts';
import { Subscription } from '@/lib/subscriptions';
import { ThemedText } from '@/components/themed-text';
import { formatDueDateLabel, intervalLabel, reminderLabel } from '@/lib/subscription-form';
import { formatMoney } from '@/lib/money';
import { kindOf, recurringKindMeta } from '@/lib/recurring';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionCardProps = {
  subscription: Subscription;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
  onPress: () => void;
  onMarkPaid: () => void;
  onCancelNow: () => void;
  onDelete: () => void;
};

export function SubscriptionCard({
  subscription,
  colors,
  muted,
  onPress,
  onMarkPaid,
  onCancelNow,
  onDelete,
}: SubscriptionCardProps) {
  const urgent = subscription.due_state === 'overdue' || subscription.due_state === 'due_soon';
  const totalInstalments = subscription.total_instalments ?? 0;
  const instalmentsPaid = subscription.instalments_paid ?? 0;
  const loanFinished = totalInstalments > 0 && instalmentsPaid >= totalInstalments;
  const stateLabel = loanFinished ? 'completed' : subscription.due_state.replace('_', ' ');
  const instalmentLine =
    totalInstalments > 0
      ? loanFinished
        ? `All ${totalInstalments} payments done`
        : `${instalmentsPaid} of ${totalInstalments} paid · ${totalInstalments - instalmentsPaid} left`
      : null;
  const isActive = subscription.status === 'active';
  const kind = kindOf(subscription);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${subscription.name}`}
      onPress={onPress}
      className="rounded-[28px] border p-4"
      style={{
        backgroundColor: colors.card,
        borderColor: urgent ? '#F9A825' : colors.border,
      }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
            {subscription.name}
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
            {recurringKindMeta[kind].label} ·{' '}
            {kind === 'loan' && subscription.lender
              ? subscription.lender
              : kind === 'investment' && subscription.platform
                ? subscription.platform
                : subscription.category || 'Uncategorized'}{' '}
            · {intervalLabel(subscription.billing_interval)}
          </ThemedText>
        </View>
        <ThemedText className="text-base font-black" style={{ color: colors.accent }}>
          {formatMoney(subscription.amount)}
        </ThemedText>
      </View>
      <View className="mt-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <ThemedText
            className="text-xs font-bold capitalize"
            style={{ color: urgent ? '#F57F17' : muted }}>
            {stateLabel}
          </ThemedText>
          {instalmentLine ? (
            <ThemedText className="mt-1 text-[11px] font-bold" style={{ color: colors.text }}>
              {instalmentLine}
            </ThemedText>
          ) : null}
          <RecurringScheduleLine item={subscription} kind={kind} />
          {loanFinished ? null : (
            <ThemedText className="mt-1 text-[11px]" style={{ color: muted }}>
              Due {formatDueDateLabel(subscription.next_due_date)} ·{' '}
              {reminderLabel(subscription.reminder_days)}
            </ThemedText>
          )}
          {subscription.cancel_before_due && (
            <View
              className="mt-2 self-start rounded-full px-2 py-1"
              style={{ backgroundColor: '#FFF3E0' }}>
              <ThemedText className="text-[10px] font-black uppercase" style={{ color: '#EF6C00' }}>
                Cancel reminder
              </ThemedText>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-4">
          {isActive && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${subscription.name} paid`}
              onPress={onMarkPaid}
              hitSlop={12}>
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.accent} />
            </Pressable>
          )}
          {isActive && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${subscription.name}`}
              onPress={onCancelNow}
              hitSlop={12}>
              <MaterialCommunityIcons name="calendar-remove-outline" size={21} color="#EF6C00" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${subscription.name}`}
            onPress={onDelete}
            hitSlop={12}>
            <MaterialCommunityIcons name="trash-can-outline" size={21} color="#D32F2F" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
