import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import { IllustrationPanel, MockCard, MockTile, MOCK_TILES, SlideText } from './onboarding-ui';

/**
 * ₹2,400 split equally four ways: each of the other three owes ₹600, so you
 * are owed ₹1,800. The old slide's figures did not add up, which is a poor
 * first impression for the feature whose whole job is getting the sum right.
 */
const PEOPLE = ['Aarav', 'Meera', 'Rohan'];

/** R13-Ob3: split bills without the awkward math. */
export default function Screen3() {
  const { colors } = useThemeTokens();

  return (
    <View style={styles.slide}>
      <IllustrationPanel>
        <View style={styles.frame}>
          <MockCard>
            <View style={styles.group}>
              <MockTile {...MOCK_TILES.group} size={32} radius={10} iconSize={18} />
              <View style={styles.grow}>
                <ThemedText style={styles.groupName}>Goa trip</ThemedText>
                <ThemedText tone="muted" style={styles.caption}>
                  4 people
                </ThemedText>
              </View>
            </View>
            <View style={[styles.bill, { backgroundColor: colors.background }]}>
              <View style={styles.grow}>
                <ThemedText style={styles.billName}>Dinner</ThemedText>
                <ThemedText tone="muted" style={styles.caption}>
                  You paid · split equally
                </ThemedText>
              </View>
              <ThemedText style={styles.billAmount}>₹2,400</ThemedText>
            </View>
            <View style={styles.people}>
              {PEOPLE.map((name, index) => (
                <View
                  key={name}
                  style={[
                    styles.person,
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}>
                  <View style={[styles.avatar, { backgroundColor: colors.track }]}>
                    <ThemedText style={styles.initial}>{name[0]}</ThemedText>
                  </View>
                  <ThemedText style={[styles.name, styles.grow]}>{name}</ThemedText>
                  <View style={styles.owes}>
                    <ThemedText tone="positive" style={styles.share}>
                      ₹600
                    </ThemedText>
                    <ThemedText tone="muted" style={styles.owesLabel}>
                      owes you
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </MockCard>
          <View style={[styles.owed, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: colors.positive }]} />
            <View>
              <ThemedText tone="muted" style={styles.owesLabel}>
                You’re owed
              </ThemedText>
              <ThemedText style={styles.owedAmount}>₹1,800</ThemedText>
            </View>
          </View>
        </View>
      </IllustrationPanel>
      <SlideText
        title="Split bills without the awkward math"
        body="Trips, dinners, rent. Add friends from your contacts, split equally or by amount, and Finnri keeps the balance until everyone has settled up."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  frame: {
    // Room under the card for the "You're owed" pill that overlaps its corner.
    paddingBottom: 38,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  groupName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  bill: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  billName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  billAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  people: {
    marginTop: 4,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  owes: {
    alignItems: 'flex-end',
  },
  share: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  owesLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  owed: {
    position: 'absolute',
    left: -7,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  owedAmount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
