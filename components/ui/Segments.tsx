import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

export type SegmentOption<Key extends string> = {
  key: Key;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /**
   * A dot on the segment, for "there is something in here you have not seen".
   *
   * Deliberately a boolean rather than a count: a segment is a place to go, and
   * the number of things waiting inside it is what the place itself is for.
   * Whoever sets this owns the harder half — a dot driven by "anything
   * happened" never goes out, so it has to be driven by something the user can
   * actually clear.
   */
  badge?: boolean;
};

type SegmentsProps<Key extends string> = {
  active: Key;
  options: readonly SegmentOption<Key>[];
  onChange: (key: Key) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** Shared scrolling segment row with selection feedback and active-item reveal. */
export function Segments<Key extends string>({
  active,
  options,
  onChange,
  contentContainerStyle,
}: SegmentsProps<Key>) {
  const theme = useThemeTokens().colors;
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Partial<Record<Key, LayoutRectangle>>>({});

  const scrollSegmentIntoView = useCallback((key: Key, animated: boolean) => {
    const box = layouts.current[key];
    if (!box) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, box.x - 22), animated });
  }, []);

  useEffect(() => {
    scrollSegmentIntoView(active, true);
  }, [active, scrollSegmentIntoView]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={[
        { gap: 8, paddingHorizontal: 22, paddingBottom: 14 },
        contentContainerStyle,
      ]}>
      {options.map((option) => {
        const selected = option.key === active;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.badge ? `${option.label}, new items` : option.label}
            onPress={() => {
              haptics.select();
              onChange(option.key);
            }}
            onLayout={(event) => {
              layouts.current[option.key] = event.nativeEvent.layout;
              if (option.key === active) scrollSegmentIntoView(option.key, false);
            }}
            className="h-11 flex-row items-center gap-2 rounded-full border px-4"
            style={{
              borderColor: selected ? theme.accent : theme.border,
              backgroundColor: selected ? theme.secondary : theme.card,
            }}>
            <MaterialCommunityIcons
              name={option.icon}
              size={16}
              color={selected ? theme.accent : theme.muted}
            />
            <ThemedText
              className="text-sm"
              style={{
                color: selected ? theme.accent : theme.text,
                fontFamily: Fonts.title,
              }}>
              {option.label}
            </ThemedText>
            {option.badge ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.negative,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
