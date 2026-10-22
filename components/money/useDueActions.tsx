import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { MarkPaidSheet, type MarkPaidChoice } from '@/components/money/subscriptions/MarkPaidSheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import type { Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { dueAction } from '@/lib/money-overview';
import { updateRefundStatus } from '@/lib/refundables';
import { todayISO } from '@/lib/subscription-form';
import { markSubscriptionPaid, type Subscription } from '@/lib/subscriptions';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import { formatDueLabel, type UpcomingDue } from '@/lib/upcoming';

/**
 * Finishing a due where it is listed (P20): "Mark paid" opens the same sheet
 * the Recurring list uses, and "Got it" marks money that was expected back as
 * received. Both reload the list through `onChanged`.
 */
export function useDueActions({
  token,
  accounts,
  subscriptions,
  onChanged,
}: {
  token: string | null | undefined;
  accounts: Account[];
  subscriptions: Subscription[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [payingFor, setPayingFor] = useState<Subscription | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<number | null>(null);

  const markPaid = async (choice: MarkPaidChoice) => {
    if (!token || !payingFor || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await markSubscriptionPaid(token, payingFor.id, todayISO(), choice);
      haptics.saved();
      setIsSheetVisible(false);
      if (choice.logTransaction) notifyTransactionsChanged();
      onChanged();
    } catch (paidError) {
      haptics.rejected();
      setError(getFriendlyErrorMessage(paidError, 'Unable to mark this paid.'));
    } finally {
      setSubmitting(false);
    }
  };

  const gotIt = async (due: UpcomingDue) => {
    if (!token || receivingId !== null) return;
    setReceivingId(due.sourceID);
    try {
      await updateRefundStatus(token, due.sourceID, 'received');
      haptics.saved();
      onChanged();
    } catch (refundError) {
      haptics.rejected();
      void dialog.alert({
        title: "Couldn't update this refund",
        message: getFriendlyErrorMessage(refundError, 'Try again in a moment.'),
        tone: 'danger',
      });
    } finally {
      setReceivingId(null);
    }
  };

  const accessoryFor = (due: UpcomingDue) => {
    const action = dueAction(due);
    if (action === 'got-it') {
      return (
        <Button
          testID={`due-got-it-${due.sourceID}`}
          label="Got it"
          variant="outline"
          height={36}
          loading={receivingId === due.sourceID}
          accessibilityLabel={`Got ${due.title} back`}
          onPress={() => void gotIt(due)}
        />
      );
    }
    if (action === 'mark-paid') {
      const subscription = subscriptions.find((item) => item.id === due.sourceID);
      if (!subscription) return undefined;
      return (
        <Button
          testID={`due-mark-paid-${due.sourceID}`}
          label="Mark paid"
          variant="outline"
          height={36}
          accessibilityLabel={`Mark ${due.title} paid`}
          onPress={() => {
            setError(null);
            setPayingFor(subscription);
            setIsSheetVisible(true);
          }}
        />
      );
    }
    return undefined;
  };

  const sheet = (
    <MarkPaidSheet
      key={payingFor?.id ?? 'none'}
      visible={isSheetVisible}
      subscription={payingFor}
      accounts={accounts}
      submitting={submitting}
      error={error}
      onClose={() => setIsSheetVisible(false)}
      onConfirm={(choice) => void markPaid(choice)}
      onAddAccount={() => {
        setIsSheetVisible(false);
        router.push('/accounts/manage');
      }}
    />
  );

  return { accessoryFor, sheet };
}

/**
 * The second line of a due that can be finished in place: what it costs, then
 * how late it is in the status colour — "₹399 · 23 days overdue". The title
 * line stays the name alone, so a long name never hides the amount.
 */
export function DueStatusLine({ due }: { due: UpcomingDue }) {
  const { colors } = useThemeTokens();
  const isRefund = due.kind === 'refund';
  const amount =
    due.amount === null ? null : isRefund ? formatMoney(due.amount, { sign: 'always' }) : formatMoney(due.amount);
  const status = isRefund ? `Expected back · ${formatDueLabel(due)}` : formatDueLabel(due);
  const tone =
    due.state === 'overdue' ? colors.negative : due.state === 'scheduled' ? colors.muted : colors.warning;
  return (
    <ThemedText numberOfLines={2} style={styles.line}>
      {amount ? (
        <ThemedText
          style={[styles.line, styles.amount, { color: isRefund ? colors.positive : colors.text }]}>
          {amount}
        </ThemedText>
      ) : null}
      {amount ? <ThemedText style={[styles.line, { color: colors.muted }]}> · </ThemedText> : null}
      <ThemedText style={[styles.line, styles.status, { color: tone }]}>{status}</ThemedText>
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: 13,
    lineHeight: 18,
  },
  amount: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontWeight: '600',
  },
});
