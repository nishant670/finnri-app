import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { PaymentAccountPicker } from '@/components/money/subscriptions/PaymentAccountPicker';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import {
  currentPaymentPeriod,
  formatDueDateLabel,
  parseAmount,
  paymentToLog,
  shiftByInterval,
  todayISO,
} from '@/lib/subscription-form';
import type { BillingInterval } from '@/lib/subscriptions';

type LogCurrentPaymentCardProps = {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  amount: string;
  interval: BillingInterval;
  nextDueDate: string;
  autopay: boolean;
  accounts: Account[];
  accountID: number | null;
  paymentMode: string;
  onPaymentChange: (next: { paymentMode: string; accountID: number | null }) => void;
  onAddAccount: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
};

/**
 * "Also log this month's payment", under the schedule it belongs to.
 *
 * A new recurring item used to write nothing until its next date came round,
 * so one added on the day it was paid — or with next month's date, because
 * this month's was already paid — left that payment out of the transactions.
 * Ticked, the item is created with that payment already logged; the line under
 * it says which date and what happens to the schedule.
 */
export function LogCurrentPaymentCard({
  checked,
  onToggle,
  amount,
  interval,
  nextDueDate,
  autopay,
  accounts,
  accountID,
  paymentMode,
  onPaymentChange,
  onAddAccount,
  colors,
  muted,
}: LogCurrentPaymentCardProps) {
  const logged = paymentToLog(nextDueDate, interval);
  if (!logged) return null;
  const amountValue = parseAmount(amount);
  const adds =
    Number.isFinite(amountValue) && amountValue > 0
      ? `Adds ${formatMoney(amountValue)}`
      : 'Adds the payment';
  const loggedToday = logged.date === todayISO();
  const title = logged.isDuePayment
    ? `Log ${loggedToday ? "today's" : 'this'} payment now`
    : `Also log ${currentPaymentPeriod(interval)} payment`;
  const schedule = logged.isDuePayment
    ? `The next one moves to ${formatDueDateLabel(shiftByInterval(nextDueDate, interval, 1))}.`
    : `Next payment stays ${formatDueDateLabel(nextDueDate)}.`;
  const autopayAccount = accounts.find((account) => account.id === accountID)?.name;

  return (
    <View
      testID="recurring-log-payment"
      className="mb-3 rounded-2xl border p-4"
      style={{
        borderColor: checked ? colors.selectedBorder : colors.border,
        backgroundColor: checked ? colors.selectedFill : colors.card,
      }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={title}
        onPress={() => onToggle(!checked)}
        className="flex-row items-center gap-3">
        <MaterialCommunityIcons
          name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={24}
          color={checked ? colors.text : muted}
        />
        <View className="flex-1">
          <ThemedText className="text-sm" style={{ color: colors.text, fontFamily: Fonts.title }}>
            {title}
          </ThemedText>
          <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
            {`${adds} on ${formatDueDateLabel(logged.date)} to your transactions. ${schedule}`}
          </ThemedText>
        </View>
      </Pressable>

      {/* Autopay already names the account below; without it, ask here. */}
      {checked && !autopay ? (
        <PaymentAccountPicker
          testID="recurring-log-payment-account"
          accounts={accounts}
          accountID={accountID}
          paymentMode={paymentMode}
          onChange={onPaymentChange}
          onAddAccount={onAddAccount}
          accountLabel="Paid from"
          colors={colors}
          muted={muted}
        />
      ) : null}
      {checked && autopay && autopayAccount ? (
        <ThemedText className="mt-2 text-xs" style={{ color: muted }}>
          From {autopayAccount}, the Autopay account.
        </ThemedText>
      ) : null}
    </View>
  );
}
