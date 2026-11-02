import { View, type StyleProp, type ViewStyle } from 'react-native';

import { RowsCard, RowsNote, ToggleRow } from '@/components/money/subscriptions/FormRows';
import { PaymentAccountPicker } from '@/components/money/subscriptions/PaymentAccountPicker';
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
  /** Spacing from the rows around it. */
  style?: StyleProp<ViewStyle>;
};

/**
 * "Also log this month's payment", under the schedule it belongs to.
 *
 * A new recurring item used to write nothing until its next date came round,
 * so one added on the day it was paid — or with next month's date, because
 * this month's was already paid — left that payment out of the transactions.
 * Ticked, the item is created with that payment already logged; the line under
 * it says which date and what happens to the schedule.
 *
 * Drawn as a switch row on a card (board R5-NewLoan's rows); when on, the
 * "Paid via" and "Paid from" rows join the same card.
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
  style,
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
    <View testID="recurring-log-payment" style={style}>
      <RowsCard>
        <ToggleRow
          title={title}
          caption={`${adds} on ${formatDueDateLabel(logged.date)} to your transactions. ${schedule}`}
          value={checked}
          onValueChange={onToggle}
          accessibilityLabel={title}
        />
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
            divider
          />
        ) : null}
      </RowsCard>
      {checked && autopay && autopayAccount ? (
        <RowsNote>From {autopayAccount}, the Autopay account.</RowsNote>
      ) : null}
    </View>
  );
}
