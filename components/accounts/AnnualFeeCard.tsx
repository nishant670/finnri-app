import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { AnnualFeeStatus } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';

const TText = cssInterop(ThemedText, { className: 'style' });

const MUTED = '#7C8EA8';

const renewalLabel = (status: AnnualFeeStatus) => {
  const renewal = new Date(`${status.renewal_date}T00:00:00`);
  return Number.isNaN(renewal.getTime())
    ? status.fee_month
    : renewal.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const lastDayBefore = (date: string) => {
  const day = new Date(`${date}T00:00:00`);
  if (Number.isNaN(day.getTime())) return '';
  day.setDate(day.getDate() - 1);
  return day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * The card's annual fee and how this card year's spend stands against the
 * waiver. The figure is Finnri's count of net spend on the card — a guide,
 * since banks exclude some charges — and the card says so.
 */
export function AnnualFeeCard({ status, onEdit }: { status: AnnualFeeStatus; onEdit: () => void }) {
  const theme = useThemeTokens().colors;
  const hasWaiver = status.waiver_spend != null && status.waiver_spend > 0;
  const progress = hasWaiver
    ? Math.max(0, Math.min(1, status.spent / (status.waiver_spend as number)))
    : 0;
  const waived = Boolean(status.waived);

  return (
    <Pressable
      testID="annual-fee-card"
      accessibilityRole="button"
      accessibilityLabel="Annual fee. Edit fee details"
      onPress={onEdit}
      className="mt-3 rounded-[22px] border px-4 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-center">
        <MaterialCommunityIcons
          name={waived ? 'shield-check-outline' : 'calendar-refresh-outline'}
          size={22}
          color={waived ? '#16A34A' : theme.accent}
        />
        <View className="ml-3 flex-1">
          <TText
            className="text-xs uppercase"
            style={{ fontFamily: Fonts.title, color: '#8EA0B8' }}>
            Annual fee
          </TText>
          <TText className="mt-1 text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
            {formatMoney(status.fee)} · renews {renewalLabel(status)}
          </TText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#8EA0B8" />
      </View>

      {hasWaiver ? (
        <>
          <View
            className="mt-3 h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <View
              testID="annual-fee-progress"
              className="h-2 rounded-full"
              style={{
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: waived ? '#16A34A' : theme.accent,
              }}
            />
          </View>
          <TText
            testID="annual-fee-message"
            className="mt-2 text-xs"
            style={{ fontFamily: Fonts.body, color: theme.text }}>
            {waived
              ? `About ${formatMoney(status.spent)} spent this card year, past the ${formatMoney(status.waiver_spend as number)} that waives it. Check your ${status.fee_month} statement to make sure it isn’t charged.`
              : `About ${formatMoney(status.spent)} of ${formatMoney(status.waiver_spend as number)} spent this card year. ${formatMoney(status.remaining_to_waive ?? 0)} more by ${lastDayBefore(status.renewal_date)} should waive it.`}
          </TText>
        </>
      ) : (
        <TText
          testID="annual-fee-message"
          className="mt-2 text-xs"
          style={{ fontFamily: Fonts.body, color: theme.text }}>
          About {formatMoney(status.spent)} spent this card year. Add the spend that waives the fee
          to track it.
        </TText>
      )}
      <TText className="mt-1 text-[11px]" style={{ fontFamily: Fonts.body, color: MUTED }}>
        Counted from your entries on this card. Your bank’s count may differ.
      </TText>
    </Pressable>
  );
}
