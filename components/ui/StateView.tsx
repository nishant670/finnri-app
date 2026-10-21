import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFriendlyErrorMessage } from '@/lib/api-error';

/**
 * The empty and failed states — "nothing here yet", "that did not load".
 *
 * It used to carry a `loading` variant too: the same panel with a spinner in
 * the icon circle instead of an icon. That variant is gone, and the prop with
 * it, because it was the app's most-used way of showing a spinner on an empty
 * screen — nine screens, all of them saying "Loading X" over a blank frame and
 * none of them saying what X would look like. Waiting is a `Skeleton` now; this
 * component is for the two states where there genuinely is nothing to draw.
 *
 * The prop is deleted rather than deprecated so the pattern cannot come back by
 * copy-paste: `loading` on a `StateView` is a type error.
 */
type StateViewProps = {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
};

export function StateView({
  icon = 'information-outline',
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
}: StateViewProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const surfaceColor = colorScheme === 'light' ? '#FFFFFF' : theme.card;
  const mutedText = colorScheme === 'light' ? 'rgba(45,45,45,0.62)' : 'rgba(250,250,250,0.68)';
  const displayMessage = message ? getFriendlyErrorMessage(message, message) : null;

  return (
    <View
      style={[
        styles.container,
        compact ? styles.compactContainer : styles.fullContainer,
        {
          backgroundColor: surfaceColor,
          borderColor: theme.border,
        },
      ]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.secondary }]}>
        <MaterialCommunityIcons name={icon} size={compact ? 26 : 34} color={theme.accent} />
      </View>
      <ThemedText style={[styles.title, { color: theme.text }]}>{title}</ThemedText>
      {displayMessage ? (
        <ThemedText style={[styles.message, { color: mutedText }]}>{displayMessage}</ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={[styles.primaryButton, { backgroundColor: theme.accent }]}>
          <ThemedText style={[styles.primaryButtonText, { color: theme.onAccent }]}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSecondaryAction}
          style={styles.secondaryButton}>
          <ThemedText style={[styles.secondaryButtonText, { color: theme.text }]}>
            {secondaryActionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
  },
  fullContainer: {
    marginHorizontal: 24,
    paddingVertical: 32,
  },
  compactContainer: {
    paddingVertical: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: Fonts.title,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.title,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  secondaryButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontFamily: Fonts.title,
    fontWeight: '700',
  },
});
