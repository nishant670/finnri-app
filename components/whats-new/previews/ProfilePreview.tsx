import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SettingsRow, SettingsSection } from '@/components/profile/SettingsRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** The redesigned Profile, drawn from its own rows. */
export function ProfilePreview() {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.screen}>
      <ThemedText style={[styles.title, { color: colors.text }]}>Profile</ThemedText>
      <SettingsSection title="Your Finnri">
        <SettingsRow icon="palette-outline" title="App mood" subtitle="Colours, light and dark" />
        <SettingsRow icon="star-four-points-outline" title="Plans & credits" subtitle="820 credits left" divider />
        <SettingsRow icon="shield-lock-outline" title="Security & privacy" subtitle="PIN and fingerprint" divider />
        <SettingsRow icon="lifebuoy" title="Help & support" divider />
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginBottom: 4 },
});
