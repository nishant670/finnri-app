import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
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
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
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
 */
export function FormDisclosure({
  label,
  summary,
  expanded,
  onToggle,
  icon = 'tune-variant',
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
        className="min-h-[56px] flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-70"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View
          className="h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.secondary }}>
          <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
            {label}
          </ThemedText>
          {summary ? (
            <ThemedText
              tone="muted"
              numberOfLines={expanded ? undefined : 1}
              className="mt-0.5 text-xs">
              {summary}
            </ThemedText>
          ) : null}
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={theme.muted}
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
