import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { type CreditActionState } from '@/lib/home-capture';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type CreditActionCardProps = {
  creditAction: CreditActionState;
  /** A quiet line under the message, such as "950 total credits left". */
  footnote?: string | null;
  onPress: () => void;
};

/**
 * Why a capture was refused, and the way past it (board R1-Home-UsedUp): an
 * amber block, the state in warning ink, the action as an outlined pill so the
 * screen's one accent stays on capture.
 */
export function CreditActionCard({ creditAction, footnote, onPress }: CreditActionCardProps) {
  const { colors } = useThemeTokens();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
      ]}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.warning} />
      <View style={styles.text}>
        <ThemedText style={[styles.title, { color: colors.warning }]}>
          {creditAction.title}
        </ThemedText>
        <ThemedText style={[styles.message, { color: colors.mutedStrong }]}>
          {creditAction.message}
        </ThemedText>
        {footnote ? (
          <ThemedText tone="muted" style={styles.footnote}>
            {footnote}
          </ThemedText>
        ) : null}
        <View style={styles.actionRow}>
          <Button
            label={creditAction.actionLabel}
            variant="outline"
            height={40}
            onPress={onPress}
            style={{ backgroundColor: colors.card, borderColor: colors.warningOutline }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingTop: 14,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
});
