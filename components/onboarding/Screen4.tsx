import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import { IllustrationPanel, MockCard, MockTile, MOCK_TILES, SlideText } from './onboarding-ui';

/** "October" for a date in October; the month card reads as this month. */
const monthName = (date: Date) => date.toLocaleDateString('en-IN', { month: 'long' });

/** "26 Oct": the renewal is drawn a few days out, as the board has it. */
const shortDate = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * R13-Ob4: the month at a glance and what is coming up. The body says plainly
 * that budgets, reminders and the weekly review need a pass — they do
 * (`internal/billing/entitlements.go`), and finding that out after signing up
 * is worse than reading it here.
 */
export default function Screen4() {
  const { colors } = useThemeTokens();
  const today = new Date();
  const renewal = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);

  return (
    <View style={styles.slide}>
      <IllustrationPanel>
        <View style={styles.stack}>
          <MockCard>
            <ThemedText tone="muted" style={styles.caption}>
              {`${monthName(today)} so far`}
            </ThemedText>
            <ThemedText style={styles.total}>₹24,500</ThemedText>
            <View style={styles.topCategory}>
              <MockTile {...MOCK_TILES.food} size={20} radius={6} iconSize={12} />
              <ThemedText style={styles.categoryName}>Food & Drinks</ThemedText>
              <ThemedText tone="muted" style={styles.caption}>
                · most of your spend
              </ThemedText>
            </View>
          </MockCard>
          <MockCard style={styles.upcoming}>
            <ThemedText tone="muted" style={[styles.caption, styles.upcomingLabel]}>
              Coming up
            </ThemedText>
            <View style={styles.due}>
              <MockTile {...MOCK_TILES.card} size={28} radius={8} iconSize={16} />
              <View style={styles.grow}>
                <ThemedText style={styles.dueName}>One Card bill</ThemedText>
                <ThemedText tone="warning" style={[styles.dueMeta, styles.dueSoon]}>
                  Due in 3 days
                </ThemedText>
              </View>
              <ThemedText style={styles.dueAmount}>₹6,558</ThemedText>
            </View>
            <View style={[styles.due, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <MockTile {...MOCK_TILES.renewal} size={28} radius={8} iconSize={16} />
              <View style={styles.grow}>
                <ThemedText style={styles.dueName}>Netflix</ThemedText>
                <ThemedText tone="muted" style={styles.dueMeta}>
                  {`Renews ${shortDate(renewal)}`}
                </ThemedText>
              </View>
              <ThemedText style={styles.dueAmount}>₹649</ThemedText>
            </View>
          </MockCard>
        </View>
      </IllustrationPanel>
      <SlideText
        title="See where it all goes"
        body="Your month at a glance, with card bills and renewals before they’re due. Budgets, reminders and the weekly review come with a Finnri pass."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  stack: {
    alignItems: 'center',
    gap: 12,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  total: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  topCategory: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  upcoming: {
    paddingVertical: 12,
  },
  upcomingLabel: {
    marginBottom: 4,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
  },
  grow: {
    flex: 1,
  },
  dueName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  dueMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
  dueSoon: {
    fontWeight: '600',
  },
  dueAmount: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
