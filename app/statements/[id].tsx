import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemizationBanner } from '@/components/statements/ItemizationBanner';
import { PaymentFormSheet } from '@/components/statements/PaymentFormSheet';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { Account, fetchAccounts } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { calendarDay } from '@/lib/statement-dates';
import {
  CardStatement,
  StatementPayment,
  StatementPaymentPayload,
  deleteStatementPayment,
  fetchStatement,
  formatCycleRange,
  formatDueLabel,
  formatStatementMonth,
  recordStatementPayment,
} from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

const formatDay = (value: string) => {
  const parsed = new Date(`${calendarDay(value)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * One bill: what is owed, what is accounted for, and every payment against it.
 *
 * The header carries two numbers deliberately — what the bank asked for and
 * what is still outstanding after payments. On a card that has been partly
 * paid these differ, and collapsing them into one would hide exactly the thing
 * the user opened this screen to check.
 */
export default function StatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const statementId = Number(id);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();

  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaymentSheetVisible, setIsPaymentSheetVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [paymentToRemove, setPaymentToRemove] = useState<StatementPayment | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(statementId) || statementId <= 0) {
      setIsLoading(false);
      setError('Statement not found.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [loaded, allAccounts] = await Promise.all([
        fetchStatement(token, statementId),
        fetchAccounts(token),
      ]);
      setStatement(loaded);
      setAccounts(allAccounts);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load this statement.'));
    } finally {
      setIsLoading(false);
    }
  }, [statementId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleRecordPayment = async (payload: StatementPaymentPayload) => {
    if (!token || !statement) return;
    setIsSubmitting(true);
    setSheetError(null);
    try {
      setStatement(await recordStatementPayment(token, statement.id, payload));
      setIsPaymentSheetVisible(false);
    } catch (paymentError) {
      setSheetError(getFriendlyErrorMessage(paymentError, 'Unable to record this payment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePayment = async () => {
    if (!token || !statement || !paymentToRemove) return;
    setIsSubmitting(true);
    try {
      setStatement(await deleteStatementPayment(token, statement.id, paymentToRemove.id));
      setPaymentToRemove(null);
    } catch (removeError) {
      setError(getFriendlyErrorMessage(removeError, 'Unable to remove this payment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const card = accounts.find((account) => account.id === statement?.account_id) ?? null;

  const openCycleTransactions = () => {
    if (!statement) return;
    router.push({
      pathname: '/transactions',
      params: {
        accountId: String(statement.account_id),
        // The filter takes YYYY-MM-DD and nothing else; see `calendarDay`.
        start_date: calendarDay(statement.cycle_start),
        end_date: calendarDay(statement.cycle_end),
      },
    });
  };

  const openCycleComposer = () => {
    if (!statement) return;
    router.push({
      pathname: '/',
      params: {
        compose: '1',
        composeKey: String(Date.now()),
        accountId: String(statement.account_id),
        start_date: calendarDay(statement.cycle_start),
        end_date: calendarDay(statement.cycle_end),
        statementId: String(statement.id),
      },
    });
  };

  if (!statement) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-1 justify-center">
          {isLoading ? null : (
            <StateView
              icon="file-document-outline"
              title="Statement did not load"
              message={error ?? 'This statement could not be found.'}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const settled = statement.status === 'paid';

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <TText
            className="text-sm uppercase"
            style={{ fontFamily: Fonts.title, color: theme.text, letterSpacing: 1.2 }}>
            Statement
          </TText>
          <View className="h-11 w-11" />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }}>
          {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

          <View
            className="rounded-[28px] border px-5 py-6"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
            <TText className="text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {card?.name ?? 'Credit card'} · {formatStatementMonth(statement.statement_date)}
            </TText>

            <TText
              className="mt-3 text-xs uppercase"
              style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1.3 }}>
              {settled ? 'Bill total' : 'Still to pay'}
            </TText>
            <TText
              className="mt-1 text-[34px]"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontFamily: Fonts.title,
                color: settled ? '#16A34A' : statement.is_overdue ? '#EF4444' : theme.text,
              }}>
              {formatMoney(settled ? statement.total_due : statement.remaining_due)}
            </TText>

            {/* Once anything has been paid the bill total and the remainder are
                different numbers, and both matter. */}
            {statement.paid_amount > 0 && !settled && (
              <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                {formatMoney(statement.paid_amount)} paid of {formatMoney(statement.total_due)}
              </TText>
            )}

            <View className="mt-4 flex-row flex-wrap gap-x-6 gap-y-3">
              <MetaItem label="Due" value={formatDay(statement.due_date)} />
              <MetaItem
                label="Status"
                value={settled ? 'Paid' : formatDueLabel(statement)}
                tone={settled ? '#16A34A' : statement.is_overdue ? '#EF4444' : undefined}
              />
              {statement.minimum_due > 0 && (
                <MetaItem label="Minimum" value={formatMoney(statement.minimum_due)} />
              )}
              <MetaItem
                label="Cycle"
                value={formatCycleRange(statement.cycle_start, statement.cycle_end)}
              />
            </View>

            {!settled && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsPaymentSheetVisible(true)}
                className="mt-5 h-12 flex-row items-center justify-center gap-2 rounded-full"
                style={{ backgroundColor: theme.accent }}>
                <MaterialCommunityIcons name="checkbook" size={16} color="#FFFFFF" />
                <TText className="text-sm" style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
                  Record payment
                </TText>
              </Pressable>
            )}
          </View>

          {statement.reconciliation && (
            <ItemizationBanner
              reconciliation={statement.reconciliation}
              onReview={
                statement.reconciliation.state === 'under'
                  ? openCycleComposer
                  : openCycleTransactions
              }
            />
          )}

          {/* The fastest way to close a gap: let the bank's own statement say
              what is missing, rather than making the user remember. */}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/statements/review',
                params: { id: String(statement.id) },
              })
            }
            className="mt-4 flex-row items-center justify-center gap-2 rounded-full border py-3.5"
            style={{ borderColor: theme.border, backgroundColor: theme.card }}>
            <MaterialCommunityIcons name="file-search-outline" size={17} color={theme.accent} />
            <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.accent }}>
              Read statement PDF
            </TText>
          </Pressable>

          <View className="mt-8 flex-row items-center justify-between">
            <TText className="text-lg" style={{ fontFamily: Fonts.title, color: theme.text }}>
              This cycle
            </TText>
            <Pressable accessibilityRole="button" onPress={openCycleTransactions}>
              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.accent }}>
                See all
              </TText>
            </Pressable>
          </View>
          <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
            {statement.reconciliation
              ? `${statement.reconciliation.entries_count} transaction${
                  statement.reconciliation.entries_count === 1 ? '' : 's'
                } totalling ${formatMoney(statement.reconciliation.itemized_total)}`
              : 'Transactions logged against this card in the cycle.'}
          </TText>

          <View className="mt-8">
            <TText className="text-lg" style={{ fontFamily: Fonts.title, color: theme.text }}>
              Payments
            </TText>

            {statement.payments.length === 0 ? (
              <TText className="mt-2 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                Nothing recorded yet. Payments you log here are a record — Finnri does not move
                money.
              </TText>
            ) : (
              <View className="mt-4 gap-3">
                {statement.payments.map((payment) => (
                  <View
                    key={payment.id}
                    className="flex-row items-center justify-between rounded-[22px] border px-4 py-4"
                    style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                    <View className="min-w-0 flex-1">
                      <TText
                        className="text-base"
                        style={{ fontFamily: Fonts.title, color: theme.text }}>
                        {formatMoney(payment.amount)}
                      </TText>
                      <TText
                        className="mt-1 text-xs"
                        numberOfLines={1}
                        style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                        {formatDay(payment.paid_on)}
                        {payment.method ? ` · ${payment.method}` : ''}
                      </TText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove this payment"
                      onPress={() => setPaymentToRemove(payment)}
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: theme.secondary }}>
                      <MaterialCommunityIcons name="close" size={16} color="#64748B" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <PaymentFormSheet
          visible={isPaymentSheetVisible}
          remainingDue={statement.remaining_due}
          minimumDue={statement.minimum_due}
          accounts={accounts}
          cardId={statement.account_id}
          submitting={isSubmitting}
          error={sheetError}
          onClose={() => setIsPaymentSheetVisible(false)}
          onSubmit={handleRecordPayment}
        />

        <ThemedDeleteDialog
          visible={paymentToRemove !== null}
          title="Remove this payment?"
          message="The bill will go back to showing this amount as unpaid."
          confirmLabel="Remove"
          onCancel={() => setPaymentToRemove(null)}
          onConfirm={() => void handleRemovePayment()}
        />
      </View>
    </SafeAreaView>
  );
}

function MetaItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const theme = useThemeTokens().colors;
  return (
    <View>
      <TText
        className="text-[10px] uppercase"
        style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1 }}>
        {label}
      </TText>
      <TText
        className="mt-1 text-sm"
        style={{ fontFamily: Fonts.title, color: tone ?? theme.text }}>
        {value}
      </TText>
    </View>
  );
}
