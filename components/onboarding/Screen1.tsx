import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CheckTag } from '@/components/ui/LabelRow';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import {
  FIRST_ENTRY_PHRASE,
  SPEAK_LANGUAGES,
  setSpeakLanguage,
  useSpeakLanguage,
} from '@/lib/speak-language';

import { IllustrationPanel, MockCard, MockTile, MOCK_TILES, SlideText } from './onboarding-ui';

/**
 * Say it, check it, done (board R13-Ob-Proposals, P68 + P69).
 *
 * What used to be two slides — say it, then check the draft — is one: the
 * sentence and the draft it makes, side by side, which is the whole idea.
 * "I mostly speak" sets the language the examples are in, here and later on
 * Home. Only English and Hindi are offered, the two whose parsing has been
 * checked.
 */
export default function Screen1() {
  const { colors } = useThemeTokens();
  const language = useSpeakLanguage();
  const phrase = FIRST_ENTRY_PHRASE[language];

  return (
    <View style={styles.slide}>
      <IllustrationPanel testID="onboarding-panel">
        <View style={styles.stack}>
          <View style={styles.languages}>
            <ThemedText tone="muted" style={styles.languagesLabel}>
              I mostly speak
            </ThemedText>
            <View accessibilityRole="radiogroup" accessibilityLabel="I mostly speak" style={styles.chips}>
              {SPEAK_LANGUAGES.map((option) => {
                const selected = option.key === language;
                return (
                  <PressableView
                    key={option.key}
                    testID={`onboarding-language-${option.key}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      haptics.select();
                      setSpeakLanguage(option.key);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.selectedFill : colors.card,
                        borderColor: selected ? colors.selectedBorder : colors.border,
                      },
                    ]}
                    pressedStyle={styles.pressed}>
                    <ThemedText
                      style={[styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
                      {option.label}
                    </ThemedText>
                  </PressableView>
                );
              })}
            </View>
          </View>

          <MockCard>
            <ThemedText tone="muted" style={styles.said}>
              {`You said “${phrase}”`}
            </ThemedText>
            <ThemedText style={styles.amount}>₹250</ThemedText>
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
          </MockCard>
        </View>
      </IllustrationPanel>
      <SlideText
        title="Say it. Check it. Done."
        body="Speak or type what you spent in your language. Finnri fills in the details, and nothing is saved until you have looked."
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
  stack: {
    alignSelf: 'stretch',
    gap: 16,
  },
  languages: {
    alignItems: 'center',
    gap: 8,
  },
  languagesLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 14,
    lineHeight: 18,
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
  pressed: {
    opacity: 0.7,
  },
});
