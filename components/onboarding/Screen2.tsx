import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CheckTag } from '@/components/ui/LabelRow';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import { IllustrationPanel, MockCard, MockTile, MOCK_TILES, SlideText } from './onboarding-ui';

/**
 * R13-Ob2: the review step, drawn from the real draft form — Title, Category,
 * Paid via and Paid from rows, the "Check" tag on what the parser was unsure
 * of, and Save. The categories and modes are ones the app has (Food & Drinks,
 * UPI), not the "Groceries" and "Visa ****" the old slide invented.
 */
export default function Screen2() {
  const { colors } = useThemeTokens();

  return (
    <View style={styles.slide}>
      <IllustrationPanel>
        <MockCard>
          <ThemedText tone="muted" style={styles.said}>
            You said “लंच पर UPI से ₹250 खर्च”
          </ThemedText>
          <ThemedText style={styles.amount}>₹250</ThemedText>
          <MockRow label="Title">
            <ThemedText style={styles.value}>Lunch</ThemedText>
          </MockRow>
          <MockRow label="Category">
            <MockTile {...MOCK_TILES.food} size={22} radius={6} iconSize={13} />
            <ThemedText style={styles.value}>Food & Drinks</ThemedText>
          </MockRow>
          <MockRow label="Paid via">
            <MockTile {...MOCK_TILES.upi} size={22} radius={6} iconSize={13} />
            <ThemedText style={styles.value}>UPI</ThemedText>
          </MockRow>
          <MockRow label="Paid from">
            <ThemedText tone="muted" style={[styles.value, styles.grow]}>
              Which account?
            </ThemedText>
            <CheckTag />
          </MockRow>
          <View style={[styles.save, { backgroundColor: colors.text }]}>
            <ThemedText style={[styles.saveLabel, { color: colors.background }]}>Save</ThemedText>
          </View>
        </MockCard>
      </IllustrationPanel>
      <SlideText
        title="You check it, then it’s saved"
        body="Finnri fills in the amount, category, payment and date. Anything it isn’t sure about is marked, and nothing is saved until you say so."
      />
    </View>
  );
}

function MockRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <ThemedText tone="muted" style={styles.label}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  said: {
    fontSize: 12,
    lineHeight: 16,
  },
  amount: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderTopWidth: 1,
  },
  label: {
    width: 76,
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  grow: {
    flex: 1,
  },
  save: {
    marginTop: 12,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
});
