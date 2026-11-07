import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ListRow } from '@/components/ui/ListRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** A wallet's balance kept from its top-ups, and a Pay later account beside it. */
export function WalletsPreview() {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.screen}>
      <ThemedText tone="muted" style={styles.caption}>
        Pluxee wallet
      </ThemedText>
      <ThemedText style={[styles.balanceLabel, { color: colors.text }]}>Balance</ThemedText>
      <ThemedText style={[styles.balance, { color: colors.text }]}>₹2,340</ThemedText>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ListRow icon="wallet-plus-outline" hue="#16825D" title="Top-up" meta="Meal card load" amount="+₹3,000" amountTone="positive" />
        <ListRow icon="silverware-fork-knife" hue="#B45309" title="Lunch" meta="Paid from Pluxee" amount="₹660" divider />
        <ListRow icon="clock-outline" hue="#6A4BBC" title="CRED flash" meta="Pay later · repay by 5 Dec" status="Pay later" divider />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16 },
  caption: { fontSize: 12, lineHeight: 16 },
  balanceLabel: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  balance: { fontSize: 30, lineHeight: 36, fontWeight: '800', marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
});
