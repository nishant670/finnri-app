import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { formatBalance } from '@/components/split/split-utils';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitSettlement } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * A settlement is written from its author's side, so the direction has to be
 * turned around before it is read back to the person being asked about it.
 * `friend_paid_user` is the author saying *you* paid *them*.
 */
const settlementClaim = (settlement: SplitSettlement) => {
  const who = settlement.recorded_by_name?.trim() || 'Someone';
  const amount = formatBalance(settlement.amount);
  if (settlement.direction === 'friend_paid_user') {
    return `${who} says you paid them ${amount}.`;
  }
  if (settlement.direction === 'user_paid_friend') {
    return `${who} says they paid you ${amount}.`;
  }
  return `${who} recorded a settlement of ${amount}.`;
};

/**
 * The decisions waiting on the reader, at the top of the Splits screen.
 *
 * Deliberately not left to the activity feed. A settlement moves both ledgers,
 * and until it had a second side the person it named was never asked and never
 * told — the only record was one line among every expense, friend and group
 * they had ever added, worded from the other person's point of view. A prompt
 * that has to be gone looking for is not a prompt.
 */
export function SettlementRequests({
  settlements,
  decidingId,
  onDecide,
}: {
  settlements: SplitSettlement[];
  /** The settlement a decision is in flight for, so both buttons can lock. */
  decidingId: number | null;
  onDecide: (settlement: SplitSettlement, decision: 'confirm' | 'deny') => void;
}) {
  const theme = useThemeTokens().colors;
  if (settlements.length === 0) return null;

  return (
    <View className="mt-6 gap-3">
      {settlements.map((settlement) => {
        const busy = decidingId === settlement.id;
        return (
          <View
            key={settlement.id}
            className="rounded-3xl border p-5"
            style={{ backgroundColor: theme.card, borderColor: theme.accent }}>
            <View className="flex-row items-center gap-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.secondary }}>
                <MaterialCommunityIcons name="hand-coin-outline" size={20} color={theme.accent} />
              </View>
              <View className="flex-1">
                <TText className="text-base" style={{ color: theme.text, fontFamily: Fonts.title }}>
                  Confirm this settlement
                </TText>
                {settlement.group_name ? (
                  <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
                    In {settlement.group_name}
                  </TText>
                ) : null}
              </View>
            </View>

            <TText className="mt-4 text-base leading-6" style={{ color: theme.text }}>
              {settlementClaim(settlement)}
            </TText>
            {settlement.notes ? (
              <TText className="mt-2 text-sm leading-5" style={{ color: theme.muted }}>
                “{settlement.notes}”
              </TText>
            ) : null}
            <TText className="mt-2 text-xs" style={{ color: theme.muted }}>
              It is already counted in your balance. Deny it and the balance goes back.
            </TText>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deny this settlement"
                disabled={busy}
                onPress={() => onDecide(settlement, 'deny')}
                className="min-h-13 flex-1 flex-row items-center justify-center gap-2 rounded-full border"
                style={{ borderColor: theme.border, opacity: busy ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="close-circle-outline" size={19} color={theme.negative} />
                <TText className="text-sm" style={{ color: theme.negative, fontFamily: Fonts.title }}>
                  Deny
                </TText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm this settlement"
                disabled={busy}
                onPress={() => onDecide(settlement, 'confirm')}
                className="min-h-13 flex-1 flex-row items-center justify-center gap-2 rounded-full"
                style={{ backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }}>
                {busy ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={19}
                      color={theme.onAccent}
                    />
                    <TText
                      className="text-sm"
                      style={{ color: theme.onAccent, fontFamily: Fonts.title }}>
                      Confirm
                    </TText>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
