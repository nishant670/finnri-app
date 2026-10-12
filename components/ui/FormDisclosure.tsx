import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { withAlpha } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

type FormDisclosureProps = {
  /** What is folded away, by name — "More options", "Loan details". Never "Advanced". */
  label: string;
  /**
   * The folded settings as they stand right now, on one line:
   * "Reminder 3 days before · Autopay off".
   *
   * This line is the reason the fold can be closed by default without costing
   * anything. A closed "Advanced" section is a question the user has to open
   * to answer — *did I miss something in there?* — and people who cannot see
   * a default tend to go and check it. Read out loud, the defaults are a
   * decision already made, and the form looks as short as it actually is.
   */
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
  children: ReactNode;
};

/**
 * The second level of a form: optional settings behind one labelled row.
 *
 * One level only. A fold inside a fold is where progressive disclosure stops
 * helping — people lose track of where a setting lives — so anything that
 * would want a third level belongs in its own screen instead.
 *
 * The content is unmounted while closed, not hidden. A hidden field still
 * validates, and a form that refuses to save over a field nobody can see is
 * the worst version of this pattern; every form that uses it opens the fold
 * itself when a message points inside it.
 *
 * Drawn as the boards draw it (R5-NewLoan): an outlined 52-tall row on the
 * sheet's own background, the label over the summary, a small chevron. No
 * icon tile — the summary already says what is inside.
 */
export function FormDisclosure({
  label,
  summary,
  expanded,
  onToggle,
  testID,
  children,
}: FormDisclosureProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();

  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={summary ? `${label}. ${summary}` : label}
        onPress={() => {
          haptics.toggle(!expanded);
          onToggle();
        }}
        style={({ pressed }) => [
          styles.row,
          { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <View style={styles.text}>
          <ThemedText style={[styles.label, { color: theme.text }]}>{label}</ThemedText>
          {summary ? (
            <ThemedText
              tone="muted"
              numberOfLines={expanded ? undefined : 1}
              style={styles.summary}>
              {summary}
            </ThemedText>
          ) : null}
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={withAlpha(theme.text, 0.6)}
        />
      </Pressable>
      {expanded ? (
        <Animated.View entering={motion.revealEntering()} className="mt-3">
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  summary: {
    fontSize: 12,
    lineHeight: 16,
  },
});
