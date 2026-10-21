import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { formatCycleRange, type StatementReconciliation } from '@/lib/statements';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * What the bill and the ledger disagree about.
 *
 * The tone here matters, because the gap is *not* a problem with the user's
 * money. Their outstanding, available limit and amount to pay were all exact
 * the moment they typed the bill. What is incomplete is the breakdown — some
 * of their spending has no category and no merchant behind it.
 *
 * So this is a nudge, never a blocker, and "Later" is a real option with no
 * penalty: the unaccounted amount is already booked to a real entry, so the
 * monthly spending total stays right either way.
 */
export function ItemizationBanner({
  reconciliation,
  onReview,
}: {
  reconciliation: StatementReconciliation;
  /** Opens this cycle's transactions, so the user can see what is already in. */
  onReview: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const light = themeTokens.mode === 'light';

  if (reconciliation.state === 'balanced') {
    return (
      <View
        className="mt-4 flex-row items-center gap-3 rounded-[22px] px-4 py-3"
        style={{ backgroundColor: light ? '#F0FDF4' : '#12281A' }}>
        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#16A34A" />
        <TText
          className="min-w-0 flex-1 text-xs"
          style={{ fontFamily: Fonts.body, color: light ? '#166534' : '#86EFAC' }}>
          Every rupee on this bill is accounted for in Finnri.
        </TText>
      </View>
    );
  }

  // Finnri holds more than the bank billed. Almost always a duplicate, a spend
  // logged against the wrong card, or a transaction that posted into the next
  // cycle — never something to resolve by deleting the user's own records.
  if (reconciliation.state === 'over') {
    return (
      <View
        className="mt-4 rounded-[22px] px-4 py-4"
        style={{ backgroundColor: light ? '#FFF7ED' : '#2A1C0E' }}>
        <View className="flex-row items-start gap-3">
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#F97316" />
          <View className="min-w-0 flex-1">
            <TText
              className="text-sm"
              style={{ fontFamily: Fonts.title, color: light ? '#9A3412' : '#FDBA74' }}>
              {formatMoney(Math.abs(reconciliation.gap))} more than the bill
            </TText>
            <TText
              className="mt-1 text-xs"
              style={{ fontFamily: Fonts.body, color: light ? '#9A3412' : '#FDBA74' }}>
              Finnri has more tracked for{' '}
              {formatCycleRange(reconciliation.cycle_start, reconciliation.cycle_end)} than the bank
              billed. Something may be duplicated, on the wrong card, or dated into the next cycle.
            </TText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onReview}
          className="mt-3 self-start rounded-full px-4 py-2"
          style={{ backgroundColor: light ? '#FFFFFF' : '#3A2712' }}>
          <TText
            className="text-xs"
            style={{ fontFamily: Fonts.title, color: light ? '#9A3412' : '#FDBA74' }}>
            Review these transactions
          </TText>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="mt-4 rounded-[22px] px-4 py-4"
      style={{ backgroundColor: light ? '#EFF6FF' : '#12233A' }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons name="information-outline" size={18} color="#3B82F6" />
        <View className="min-w-0 flex-1">
          <TText
            className="text-sm"
            style={{ fontFamily: Fonts.title, color: light ? '#1E40AF' : '#93C5FD' }}>
            {formatMoney(reconciliation.unitemized_amount)} not itemised yet
          </TText>
          <TText
            className="mt-1 text-xs"
            style={{ fontFamily: Fonts.body, color: light ? '#1E40AF' : '#93C5FD' }}>
            Your bill is {formatMoney(reconciliation.statement_total)} and Finnri can account for{' '}
            {formatMoney(reconciliation.itemized_total)} of it. Your total spending is still correct
            — only the category breakdown is missing this much. Add the missing transactions
            whenever you like and this shrinks on its own.
          </TText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onReview}
        className="mt-3 self-start rounded-full px-4 py-2"
        style={{ backgroundColor: theme.accent }}>
        <TText className="text-xs" style={{ fontFamily: Fonts.title, color: theme.onAccent }}>
          Add a missing transaction
        </TText>
      </Pressable>
    </View>
  );
}
