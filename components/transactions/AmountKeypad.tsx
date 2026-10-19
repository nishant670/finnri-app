import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import { formatAmountEntry } from '@/lib/money';

export type AmountKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | 'delete';

/** ₹99,99,99,999 is the ceiling. Past that the field is a typo, not an amount. */
const MAX_RUPEE_DIGITS = 9;
const MAX_PAISE_DIGITS = 2;

const KEY_ROWS: AmountKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'delete'],
];

const KEY_HEIGHT = 50;

/**
 * One keystroke against the raw amount string.
 *
 * The value edited here is the same plain string the form saves — grouping
 * and the ₹ live in {@link formatAmountEntry}, never in state, so the digits
 * that reach `Number()` are the digits that were typed.
 */
export const appendAmountKey = (current: string, key: AmountKey): string => {
  const value = current ?? '';
  if (key === 'delete') {
    return value.slice(0, -1);
  }
  if (key === '.') {
    if (value.includes('.')) {
      return value;
    }
    return value === '' ? '0.' : `${value}.`;
  }

  const pointIndex = value.indexOf('.');
  if (pointIndex !== -1) {
    return value.length - pointIndex - 1 >= MAX_PAISE_DIGITS ? value : `${value}${key}`;
  }
  // A lone leading zero is a placeholder, not a digit: 0 then 5 is 5, not 05.
  if (value === '0') {
    return key;
  }
  return value.length >= MAX_RUPEE_DIGITS ? value : `${value}${key}`;
};

/** True once the string holds an amount worth saving. */
export const hasEnteredAmount = (value: string) => Number(value || 0) > 0;

const CARET_BLINK_MS = 560;

/**
 * The amount under the caret. Full width, and the only thing on the screen
 * with this much weight — it is what the sheet exists to collect.
 *
 * Rendered only while the keypad is up, so the caret is unconditional: it is
 * the affordance standing in for the missing system keyboard, saying where
 * the next digit lands.
 */
export function AmountDisplay({ value }: { value: string }) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const reducedMotion = useReducedMotion();
  const caretOpacity = useRef(new Animated.Value(1)).current;
  const isEmpty = value.trim().length === 0;

  useEffect(() => {
    if (reducedMotion) {
      // A caret that never stops moving is exactly what this setting is for.
      caretOpacity.setValue(1);
      return;
    }
    caretOpacity.setValue(1);
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(caretOpacity, {
          toValue: 0,
          duration: CARET_BLINK_MS,
          useNativeDriver: true,
        }),
        Animated.timing(caretOpacity, {
          toValue: 1,
          duration: CARET_BLINK_MS,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [caretOpacity, reducedMotion]);

  const display = formatAmountEntry(value);
  // The symbol is drawn smaller and muted beside the figure (board R2-Entry).
  const figure = display.startsWith(CURRENCY_SYMBOL) ? display.slice(CURRENCY_SYMBOL.length) : display;

  return (
    <View
      testID="entry-amount-display"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Amount ${display}`}
      style={styles.display}>
      <ThemedText tone="muted" style={styles.symbol}>
        {CURRENCY_SYMBOL}
      </ThemedText>
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.figure,
          {
            color: theme.text,
            // ₹0 is a placeholder until a digit lands, so it reads as one.
            opacity: isEmpty ? 0.28 : 1,
          },
        ]}>
        {figure}
      </ThemedText>
      <Animated.View
        style={[styles.caret, { opacity: caretOpacity, backgroundColor: theme.accent }]}
      />
    </View>
  );
}

export function AmountKeypad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  const press = useCallback(
    (key: AmountKey) => {
      const next = appendAmountKey(value, key);
      if (next !== value) {
        haptics.select();
      }
      onChange(next);
    },
    [onChange, value]
  );

  const clear = useCallback(() => {
    if (value.length > 0) {
      haptics.removed();
    }
    onChange('');
  }, [onChange, value]);

  return (
    <View style={styles.pad} accessibilityLabel="Amount keypad">
      {KEY_ROWS.map((row) => (
        <View key={row.join('')} style={styles.padRow}>
          {row.map((key) => (
            <PressableView
              key={key}
              testID={`amount-key-${key}`}
              accessibilityRole="button"
              accessibilityLabel={
                key === 'delete' ? 'Delete last digit' : key === '.' ? 'Decimal point' : key
              }
              accessibilityHint={key === 'delete' ? 'Hold to clear the amount' : undefined}
              disabled={disabled}
              onPress={() => press(key)}
              onLongPress={key === 'delete' ? clear : undefined}
              style={[styles.key, { backgroundColor: theme.card, opacity: disabled ? 0.4 : 1 }]}
              pressedStyle={styles.keyPressed}>
              {key === 'delete' ? (
                <MaterialCommunityIcons name="backspace-outline" size={22} color={theme.text} />
              ) : (
                <ThemedText style={[styles.keyLabel, { color: theme.text }]}>{key}</ThemedText>
              )}
            </PressableView>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Board R2-Entry: 50dp keys, radius 12, on the card with no outline, 6 apart. */
const styles = StyleSheet.create({
  display: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  symbol: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '500',
  },
  figure: {
    flexShrink: 1,
    fontSize: 46,
    lineHeight: 56,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  caret: {
    width: 2,
    height: 40,
    marginLeft: 3,
    borderRadius: 1,
  },
  pad: {
    gap: 6,
  },
  padRow: {
    flexDirection: 'row',
    gap: 6,
  },
  key: {
    flex: 1,
    height: KEY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyLabel: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
  },
});
