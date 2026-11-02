import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { ListRow } from '@/components/ui/ListRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { appVersionLabel } from '@/lib/app-version';

/** What Finnri does, one row each (board R8-About). */
const values = [
  { icon: 'microphone-outline', hue: '#1E6FB8', title: 'Fast capture', body: 'Say it, type it or tap a quick prompt.' },
  {
    icon: 'creation-outline',
    hue: '#6A4BBC',
    title: 'Assistive AI',
    body: 'Fills category, merchant, date and payment. Nothing saves until you say so.',
  },
  {
    icon: 'chart-donut',
    hue: '#B45309',
    title: 'Budgets and alerts',
    body: 'Monthly limits, with a nudge before you cross them.',
  },
  { icon: 'repeat-variant', hue: '#00897B', title: 'Recurring', body: 'EMIs, SIPs, subscriptions and bills in one place.' },
  { icon: 'account-multiple-outline', hue: '#C2185B', title: 'Splits', body: 'Shared expenses with friends and groups.' },
  { icon: 'shield-check-outline', hue: '#16825D', title: 'Private by design', body: 'PIN lock, fingerprint and stealth mode.' },
] as const;

export default function AboutFinnriScreen() {
  const router = useRouter();
  const { colors } = useThemeTokens();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title="About Finnri" onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={[styles.mark, { backgroundColor: colors.text }]}>
            <ThemedText style={[styles.markLetter, { color: colors.background }]}>f</ThemedText>
          </View>
          <View>
            <ThemedText style={[styles.name, { color: colors.text }]}>Finnri</ThemedText>
            {/* Read from the manifest, with the build number, so two builds can
                be told apart from this screen (a fix on board R8-About). */}
            <ThemedText tone="muted" style={styles.caption}>
              Version {appVersionLabel}
            </ThemedText>
          </View>
        </View>

        <ThemedText style={[styles.intro, { color: colors.text }]}>
          Your money, easier to read. Finnri helps you log spending fast, see where it goes, and keep bills,
          budgets and splits in one place.
        </ThemedText>

        <ThemedText tone="muted" accessibilityRole="header" style={styles.groupTitle}>
          What Finnri does
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {values.map((item, index) => (
            <ListRow key={item.title} icon={item.icon} hue={item.hue} title={item.title} meta={item.body} metaLines={2} divider={index > 0} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markLetter: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  name: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  intro: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
  },
  groupTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
