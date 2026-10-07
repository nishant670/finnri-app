import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

export type AddDetailOption<Key extends string> = {
  key: Key;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

type AddDetailChipsProps<Key extends string> = {
  /** Only the details not already on screen — a chip is gone once it is used. */
  options: readonly AddDetailOption<Key>[];
  onAdd: (key: Key) => void;
  /** The small heading above the chips. */
  title?: string;
  testIDPrefix?: string;
  /**
   * `scroll` keeps the chips on one line that scrolls sideways — for a screen
   * where every row of height is spoken for, like the capture sheet above its
   * keypad. A chip cut off at the edge says there are more.
   */
  layout?: 'wrap' | 'scroll';
};

/**
 * Optional fields as offers instead of blanks.
 *
 * A form that shows every optional field asks every question at once, and the
 * first impression is the length — "who is going to fill all this?" — before a
 * single field has been read. Most people need none of these on most entries.
 * A chip costs a glance, says the detail exists, and turns into the field only
 * when someone wants that one: the form grows by exactly what they chose to
 * add, the way Gmail's Cc or a calendar's "add location" does.
 *
 * A detail that already holds something is not offered here — the caller
 * shows it as a field, because a value tucked behind a chip reads as lost.
 */
export function AddDetailChips<Key extends string>({
  options,
  onAdd,
  title = 'Add details',
  testIDPrefix = 'add-detail',
  layout = 'wrap',
}: AddDetailChipsProps<Key>) {
  const theme = useThemeTokens().colors;

  if (options.length === 0) return null;

  const chips = options.map((option) => (
    <Pressable
      key={option.key}
      testID={`${testIDPrefix}-${option.key}`}
      accessibilityRole="button"
      accessibilityLabel={`Add ${option.label.toLowerCase()}`}
      onPress={() => {
        haptics.select();
        onAdd(option.key);
      }}
      hitSlop={6}
      className="min-h-[36px] flex-row items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 active:opacity-60"
      style={{ borderColor: theme.border, backgroundColor: theme.card }}>
      <MaterialCommunityIcons name="plus" size={14} color={theme.accent} />
      <MaterialCommunityIcons name={option.icon} size={15} color={theme.muted} />
      <ThemedText className="text-xs font-black" style={{ color: theme.text }}>
        {option.label}
      </ThemedText>
    </Pressable>
  ));

  return (
    <View>
      {title ? (
        <ThemedText tone="muted" className="mb-2 text-[11px] font-black uppercase tracking-widest">
          {title}
        </ThemedText>
      ) : null}
      {layout === 'scroll' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          {chips}
        </ScrollView>
      ) : (
        <View className="flex-row flex-wrap gap-2">{chips}</View>
      )}
    </View>
  );
}
