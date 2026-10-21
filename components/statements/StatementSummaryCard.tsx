import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { CurrentStatementSummary } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';
import { formatDueLabel, formatStatementMonth } from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * The bill to pay: the action underneath the limit ring.
 *
 * Deliberately never says "Pay now". Finnri does not move money, and a button
 * implying otherwise becomes a lie the moment someone taps it — so the verb is
 * "Record payment", which is what actually happens.
 */
export function StatementSummaryCard({
  statement,
  onRecordPayment,
  onPress,
}: {
  statement: CurrentStatementSummary;
  onRecordPayment: () => void;
  onPress: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  const settled = statement.status === 'paid';
  const paidFraction =
    statement.total_due > 0 ? Math.min(1, statement.paid_amount / statement.total_due) : 1;
  const dueLabel = formatDueLabel(statement);

  const accent = settled ? '#16A34A' : statement.is_overdue ? '#EF4444' : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Statement for ${formatStatementMonth(statement.statement_date)}`}
      onPress={onPress}
      className="mt-7 rounded-[26px] border px-5 py-5"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <TText
            className="text-xs uppercase"
            style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1.2 }}>
            {settled ? 'Last bill' : 'Total due'}
          </TText>
          <TText
            className="mt-1 text-[28px]"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontFamily: Fonts.title, color: accent }}>
            {formatMoney(settled ? statement.total_due : statement.remaining_due)}
          </TText>
          <TText
            className="mt-1 text-xs"
            style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
            {formatStatementMonth(statement.statement_date)} statement
          </TText>
        </View>

        <View
          className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
          style={{
            backgroundColor: settled
              ? 'rgba(22,163,74,0.12)'
              : statement.is_overdue
                ? 'rgba(239,68,68,0.12)'
                : themeTokens.mode === 'light'
                  ? '#F1F5F9'
                  : '#243142',
          }}>
          <MaterialCommunityIcons
            name={settled ? 'check-circle-outline' : 'clock-outline'}
            size={14}
            color={settled ? '#16A34A' : statement.is_overdue ? '#EF4444' : '#64748B'}
          />
          <TText
            className="text-xs"
            style={{
              fontFamily: Fonts.title,
              color: settled ? '#16A34A' : statement.is_overdue ? '#EF4444' : '#64748B',
            }}>
            {settled ? 'Paid' : dueLabel}
          </TText>
        </View>
      </View>

      {/* Partial payments are the norm on cards, so the bar is always drawn
          once anything has been paid — it is the only place the user can see
          how much of the bill is behind them. */}
      {statement.paid_amount > 0 && !settled && (
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <TText className="text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {formatMoney(statement.paid_amount)} of {formatMoney(statement.total_due)} paid
            </TText>
            <TText className="text-xs" style={{ fontFamily: Fonts.title, color: '#7C8EA8' }}>
              {Math.round(paidFraction * 100)}%
            </TText>
          </View>
          <View
            className="mt-2 h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: theme.secondary }}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(paidFraction * 100) }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${Math.max(3, paidFraction * 100)}%`, backgroundColor: '#16A34A' }}
            />
          </View>
        </View>
      )}

      {/* Paying only the minimum clears the late fee but accrues interest on
          the whole balance, and new spends lose their interest-free period.
          It is the most expensive ordinary mistake a card user makes, so it
          is worth the line. */}
      {!settled && statement.minimum_due > 0 && statement.paid_amount < statement.minimum_due && (
        <TText className="mt-3 text-xs" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
          Minimum due {formatMoney(statement.minimum_due)}. Paying only the minimum means interest
          on the full balance.
        </TText>
      )}

      {!settled && (
        <Pressable
          accessibilityRole="button"
          onPress={onRecordPayment}
          className="mt-4 flex-row items-center justify-center gap-2 rounded-full py-3"
          style={{ backgroundColor: theme.accent }}>
          <MaterialCommunityIcons name="checkbook" size={16} color={theme.onAccent} />
          <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.onAccent }}>
            Record payment
          </TText>
        </Pressable>
      )}
    </Pressable>
  );
}
