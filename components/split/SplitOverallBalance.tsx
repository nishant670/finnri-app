import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { zeroBalanceLabel } from '@/components/split/split-utils';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitOverallBalanceProps = {
  value: number;
  color: string;
  /** False when nothing is on the ledger, so zero reads "nothing yet", not "settled". */
  hasActivity: boolean;
  /** Omitted until there is a friend to split with: the composer needs one. */
  onAddExpense?: () => void;
};

/**
 * The overall balance card at the top of every Splits section (boards
 * R6-Groups, R6-Empty). "Add expense" lives here now; it was the floating
 * button, and it is the same action.
 */
export function SplitOverallBalance({
  value,
  color,
  hasActivity,
  onAddExpense,
}: SplitOverallBalanceProps) {
  const { colors } = useThemeTokens();
  return (
    <View
      testID="split-overall-balance"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.figure}>
        {value === 0 ? (
          <>
            <ThemedText style={[styles.zeroTitle, { color: colors.text }]}>
              {zeroBalanceLabel({ hasActivity, overall: true })}
            </ThemedText>
            {hasActivity ? null : (
              <ThemedText tone="muted" style={styles.caption}>
                Balances with friends and groups show here.
              </ThemedText>
            )}
          </>
        ) : (
          <>
            <ThemedText tone="muted" style={styles.eyebrow}>
              {value > 0 ? 'Overall, you’re owed' : 'Overall, you owe'}
            </ThemedText>
            <CountUpMoney
              amount={Math.abs(value)}
              sign="never"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.amount, { color }]}
            />
          </>
        )}
      </View>
      {onAddExpense ? (
        <PrimaryButton
          testID="split-add-expense"
          label="Add expense"
          icon="receipt-text-plus-outline"
          height={44}
          onPress={onAddExpense}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  figure: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  amount: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  zeroTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    flexShrink: 0,
    paddingHorizontal: 16,
  },
});
