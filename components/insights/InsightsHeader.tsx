import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The Insights chrome (board R7-Insights) — the tab's title, the period under
 * it as a chooser, and search.
 *
 * Extracted only because the loading frame wears it too. A screen whose header
 * appears a beat after its body is a screen that visibly assembles itself, and
 * this one already knows its period before the first byte arrives.
 */
export function InsightsHeader({
  rangeLabel,
  refreshing,
  onPickPeriod,
}: {
  rangeLabel: string;
  /** A reload behind content that is already on screen. Never true while the
   *  skeleton is up — that frame is already saying the same thing. */
  refreshing: boolean;
  onPickPeriod: () => void;
}) {
  const { colors } = useThemeTokens();

  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Insights
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Period, ${rangeLabel}. Choose a period`}
          onPress={onPickPeriod}
          hitSlop={8}
          style={styles.period}>
          <ThemedText numberOfLines={1} style={[styles.periodLabel, { color: colors.text }]}>
            {rangeLabel}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        {refreshing ? <ActivityIndicator color={colors.muted} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
          onPress={() => router.push('/transactions')}
          style={styles.iconButton}>
          <MaterialCommunityIcons name="magnify" size={24} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  period: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 2,
  },
  periodLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
