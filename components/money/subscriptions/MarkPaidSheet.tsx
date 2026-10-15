import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import {
  PaymentAccountPicker,
  usablePayment,
} from '@/components/money/subscriptions/PaymentAccountPicker';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';
import { haptics } from '@/lib/haptics';
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
  const muted = `${colors.text}99`;
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
        backgroundColor: colors.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: '85%',
      }}>
      {subscription ? (
        <ScrollView
          testID="mark-paid-sheet"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
          <View className="mb-1 flex-row items-center justify-between gap-3">
            <ThemedText
              className="flex-1 text-lg font-black"
              numberOfLines={1}
              style={{ fontFamily: Fonts.title }}>
              Mark {subscription.name} paid
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={muted} />
            </Pressable>
          </View>
          <ThemedText className="mb-4 text-xs" style={{ color: muted }}>
            {formatMoney(amount)} due{' '}
            {formatDueDateLabel(toApiDateOnly(subscription.next_due_date))}. The next one moves to{' '}
            {formatDueDateLabel(nextDueAfterPaying(subscription))}.
          </ThemedText>

          <View
            className="mb-4 rounded-2xl border p-4"
            style={{
              borderColor: logTransaction ? colors.accent : colors.border,
              backgroundColor: colors.background,
            }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: logTransaction }}
              accessibilityLabel="Add to transactions"
              onPress={() => {
                haptics.select();
                setLogTransaction((on) => !on);
              }}
              className="flex-row items-center gap-3">
              <MaterialCommunityIcons
                name={logTransaction ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={logTransaction ? colors.accent : muted}
              />
              <View className="flex-1">
                <ThemedText
                  className="text-sm"
                  style={{ color: colors.text, fontFamily: Fonts.title }}>
                  Add to transactions
                </ThemedText>
                <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
                  {logTransaction
                    ? `Adds ${formatMoney(amount)} on ${formatDueDateLabel(today)}. Turn off if you already logged it.`
                    : 'Only the date moves on. Nothing is added to your transactions.'}
                </ThemedText>
              </View>
            </Pressable>
            {logTransaction ? (
              <PaymentAccountPicker
                testID="mark-paid-account"
                accounts={accounts}
                accountID={payment.accountID}
                paymentMode={payment.paymentMode}
                onChange={setPayment}
                onAddAccount={onAddAccount}
                accountLabel="Paid from"
                colors={colors}
                muted={muted}
              />
            ) : null}
          </View>

          {error ? (
            <View className="mb-3 rounded-2xl px-3 py-2" style={{ backgroundColor: '#FFEBEE' }}>
              <ThemedText className="text-xs font-bold" style={{ color: '#D32F2F' }}>
                {error}
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() =>
              onConfirm({
                logTransaction,
                paymentMode: payment.paymentMode,
                accountId: payment.accountID,
              })
            }
            className="h-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.accent, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <ThemedText className="text-sm font-black" style={{ color: 'white' }}>
                Mark paid
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      ) : null}
    </AnimatedBottomSheet>
  );
}
