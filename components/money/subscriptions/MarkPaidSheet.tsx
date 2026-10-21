import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RowsCard, ToggleRow } from '@/components/money/subscriptions/FormRows';
import {
  PaymentAccountPicker,
  usablePayment,
} from '@/components/money/subscriptions/PaymentAccountPicker';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import {
  formatDueDateLabel,
  shiftByInterval,
  toApiDateOnly,
  todayISO,
} from '@/lib/subscription-form';
import type { Subscription } from '@/lib/subscriptions';

export type MarkPaidChoice = {
  logTransaction: boolean;
  paymentMode: string;
  accountId: number | null;
};

/** The next date once this payment is in: a cadence on, and past today. */
const nextDueAfterPaying = (subscription: Subscription) => {
  const today = todayISO();
  let next = shiftByInterval(
    toApiDateOnly(subscription.next_due_date),
    subscription.billing_interval,
    1
  );
  for (let guard = 0; next <= today && guard < 400; guard += 1) {
    next = shiftByInterval(next, subscription.billing_interval, 1);
  }
  return next;
};

type MarkPaidSheetProps = {
  visible: boolean;
  /** Kept while the sheet slides away, so it does not empty mid-exit. */
  subscription: Subscription | null;
  accounts: Account[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (choice: MarkPaidChoice) => void;
  onAddAccount: () => void;
};

/**
 * "Mark paid", with the payment written to the transactions.
 *
 * Marking a recurring payment paid used to move its date on and nothing else,
 * so the money never showed up anywhere. It now adds the payment as a
 * transaction, from the account it came from. That is on by default and can be
 * turned off — for a payment already logged by hand, or by a bill scan, which
 * would otherwise be counted twice.
 *
 * Mount it with a `key` per item: the choices start from that item's account.
 *
 * Drawn like the recurring sheet (board R5-NewLoan): handle, title on the left
 * with the round close, then one card of rows and the primary button.
 */
export function MarkPaidSheet({
  visible,
  subscription,
  accounts,
  submitting,
  error,
  onClose,
  onConfirm,
  onAddAccount,
}: MarkPaidSheetProps) {
  const { colors } = useThemeTokens();
  const [logTransaction, setLogTransaction] = useState(true);
  const [payment, setPayment] = useState(() =>
    usablePayment(accounts, subscription?.payment_mode ?? '', subscription?.account_id ?? null)
  );

  const amount = Number(subscription?.amount ?? 0);
  const today = todayISO();

  return (
    <AnimatedBottomSheet
      visible={visible && subscription != null}
      onClose={onClose}
      sheetStyle={{
        backgroundColor: colors.background,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '85%',
      }}>
      {subscription ? (
        <ScrollView
          testID="mark-paid-sheet"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheet}>
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.header}>
            <ThemedText
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: colors.text }]}>
              Mark {subscription.name} paid
            </ThemedText>
            <SheetCloseButton onPress={onClose} />
          </View>
          <ThemedText tone="muted" style={styles.lede}>
            {formatMoney(amount)} due{' '}
            {formatDueDateLabel(toApiDateOnly(subscription.next_due_date))}. The next one moves to{' '}
            {formatDueDateLabel(nextDueAfterPaying(subscription))}.
          </ThemedText>

          <RowsCard>
            <ToggleRow
              title="Add to transactions"
              caption={
                logTransaction
                  ? `Adds ${formatMoney(amount)} on ${formatDueDateLabel(today)}. Turn off if you already logged it.`
                  : 'Only the date moves on. Nothing is added to your transactions.'
              }
              value={logTransaction}
              onValueChange={setLogTransaction}
            />
            {logTransaction ? (
              <PaymentAccountPicker
                testID="mark-paid-account"
                accounts={accounts}
                accountID={payment.accountID}
                paymentMode={payment.paymentMode}
                onChange={setPayment}
                onAddAccount={onAddAccount}
                accountLabel="Paid from"
                divider
              />
            ) : null}
          </RowsCard>

          {error ? (
            <ThemedText tone="negative" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Mark paid"
            loading={submitting}
            onPress={() =>
              onConfirm({
                logTransaction,
                paymentMode: payment.paymentMode,
                accountId: payment.accountID,
              })
            }
            style={styles.button}
          />
        </ScrollView>
      ) : null}
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginLeft: 4,
    marginRight: -8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  lede: {
    marginHorizontal: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    marginTop: 10,
    marginHorizontal: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    marginTop: 16,
  },
});
