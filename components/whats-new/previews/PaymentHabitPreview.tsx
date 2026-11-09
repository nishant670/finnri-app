import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { LabelRow } from '@/components/ui/LabelRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** The transaction form picking the usual card for fuel, as `usePaymentSuggestion` does. */
export function PaymentHabitPreview() {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.screen}>
      <ThemedText style={[styles.title, { color: colors.text }]}>New expense</ThemedText>
      <ThemedText style={[styles.amount, { color: colors.text }]}>₹1,500</ThemedText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <LabelRow label="Category" value="Fuel" icon="gas-station-outline" />
        <LabelRow label="Paid from" value="SBI BPCL card" icon="credit-card-outline" divider />
        <ThemedText tone="muted" style={styles.hint}>
          You usually pay fuel with SBI BPCL card (3 of 3)
        </ThemedText>
      </View>
      <View style={[styles.offer, { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder }]}>
        <ThemedText style={[styles.offerText, { color: colors.text }]}>Always use SBI BPCL card for fuel?</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 10 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  amount: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  hint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 10 },
  offer: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  offerText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
