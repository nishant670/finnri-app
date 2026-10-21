import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { PressableView } from '@/components/ui/PressableView';
import {
  ThemeMoods,
  getMoodIconName,
  type IconStyle,
  type ThemeMoodId,
} from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile, categoryVisual } from '@/lib/categories';
import { haptics } from '@/lib/haptics';
import { MINUS_SIGN } from '@/lib/money';


const iconStyleOptions: {
  id: IconStyle;
  label: string;
  caption: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { id: 'whimsical', label: 'Whimsical', caption: 'Filled when active', icon: 'emoticon-happy-outline' },
  { id: 'minimal', label: 'Minimal', caption: 'Outlines only', icon: 'circle-outline' },
];

export default function AppMoodScreen() {
  const router = useRouter();
  const themeTokens = useThemeTokens();
  const colors = themeTokens.colors;
  const themeColor = useAppMoodStore((state) => state.themeColor);
  const nightMode = useAppMoodStore((state) => state.nightMode);
  const iconStyle = useAppMoodStore((state) => state.iconStyle);
  const setThemeColor = useAppMoodStore((state) => state.setThemeColor);
  const setNightMode = useAppMoodStore((state) => state.setNightMode);
  const setIconStyle = useAppMoodStore((state) => state.setIconStyle);
  const resetMood = useAppMoodStore((state) => state.resetMood);
  const selected = ThemeMoods[themeColor] ?? ThemeMoods.finnri;
  const tile = categoryTile(categoryVisual('Shopping'), themeTokens.mode);

  /**
   * App Mood is a tab screen without a tab of its own, and the tab navigator's
   * default back behaviour is `firstRoute` — so `router.back()` from here
   * landed on Insights rather than on Profile, the only screen that opens it.
   * Naming the destination keeps the return trip honest, and `navigate` reuses
   * the Profile tab that is already mounted instead of remounting it.
   */
  const goBack = React.useCallback(() => {
    router.navigate('/(tabs)/profile');
  }, [router]);

  // The hardware back button reaches the navigator, not the header, so it needs
  // the same redirection while this screen is the focused one.
  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => subscription.remove();
    }, [goBack])
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader title="App mood" onBack={goBack} rightText="Reset" onRightPress={resetMood} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* A small piece of the app in the chosen mood: a row, the accent
            button, a selected chip and the tab marker. */}
        <View
          accessibilityLabel="Preview"
          style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <ThemedText tone="muted" style={styles.previewLabel}>
            Preview
          </ThemedText>
          <View style={[styles.previewRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.previewTile, { backgroundColor: tile.background }]}>
              <MaterialCommunityIcons
                name={getMoodIconName('cart-outline', iconStyle) as keyof typeof MaterialCommunityIcons.glyphMap}
                size={18}
                color={tile.foreground}
              />
            </View>
            <View style={styles.previewText}>
              <ThemedText style={[styles.previewTitle, { color: colors.text }]}>Groceries</ThemedText>
              <ThemedText tone="muted" style={styles.small}>
                Shopping · Today
              </ThemedText>
            </View>
            <ThemedText style={[styles.previewAmount, { color: colors.text }]}>{MINUS_SIGN}₹840</ThemedText>
          </View>
          <View style={styles.previewControls}>
            <View style={[styles.previewButton, { backgroundColor: colors.accent }]}>
              <ThemedText style={[styles.previewButtonLabel, { color: colors.onAccent }]}>Save</ThemedText>
            </View>
            <View style={[styles.previewChip, { backgroundColor: colors.selectedFill }]}>
              <ThemedText style={[styles.previewChipLabel, { color: colors.text }]}>Food</ThemedText>
            </View>
            <ThemedText tone="muted" style={[styles.small, styles.marginLeftAuto]}>
              Tab marker
            </ThemedText>
            <View style={[styles.marker, { backgroundColor: colors.accent }]} />
          </View>
        </View>

        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          Theme colour
        </ThemedText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Theme colour" style={styles.swatches}>
          {Object.values(ThemeMoods).map((option) => {
            const active = option.id === themeColor;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={option.label}
                onPress={() => {
                  haptics.select();
                  setThemeColor(option.id as ThemeMoodId);
                }}
                style={styles.swatch}>
                <View
                  style={[
                    styles.swatchRing,
                    { borderColor: active ? colors.text : 'transparent' },
                  ]}>
                  <View style={[styles.swatchFace, { backgroundColor: option.preview, borderColor: colors.border }]}>
                    <View style={[styles.swatchDot, { backgroundColor: option.accent }]} />
                  </View>
                  {active ? (
                    <View style={[styles.swatchCheck, { backgroundColor: colors.text }]}>
                      <MaterialCommunityIcons name="check" size={12} color={colors.background} />
                    </View>
                  ) : null}
                </View>
                <ThemedText style={[styles.swatchLabel, { color: colors.text, fontWeight: active ? '700' : '500' }]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <ThemedText tone="muted" style={styles.caption}>
          {selected.message}
        </ThemedText>

        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          Appearance
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="weather-night"
            title="Night owl mode"
            subtitle="Use the dark theme everywhere"
            accessory={<HapticSwitch accessibilityLabel="Night owl mode" value={nightMode} onValueChange={setNightMode} />}
          />
        </View>

        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          Icon style
        </ThemedText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Icon style" style={styles.iconStyles}>
          {iconStyleOptions.map((option) => {
            const active = iconStyle === option.id;
            return (
              <PressableView
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => {
                  haptics.select();
                  setIconStyle(option.id);
                }}
                style={[
                  styles.iconStyle,
                  active
                    ? { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                pressedStyle={styles.pressed}>
                <MaterialCommunityIcons name={option.icon} size={20} color={active ? colors.text : colors.muted} />
                <View style={styles.iconStyleText}>
                  <ThemedText style={[styles.iconStyleTitle, { color: colors.text, fontWeight: active ? '700' : '500' }]}>
                    {option.label}
                  </ThemedText>
                  <ThemedText tone="muted" style={styles.small}>
                    {option.caption}
                  </ThemedText>
                </View>
                {active ? <MaterialCommunityIcons name="check" size={16} color={colors.text} /> : null}
              </PressableView>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
  },
  preview: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  previewLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  previewTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  previewAmount: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  previewControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewButton: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  previewButtonLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  previewChip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  previewChipLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  marginLeftAuto: {
    marginLeft: 'auto',
  },
  marker: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  swatches: {
    flexDirection: 'row',
    gap: 8,
  },
  swatch: {
    flex: 1,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  swatchRing: {
    padding: 2,
    borderWidth: 2,
    borderRadius: 30,
  },
  swatchFace: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  swatchCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  iconStyles: {
    flexDirection: 'row',
    gap: 8,
  },
  iconStyle: {
    flex: 1,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  iconStyleText: {
    flex: 1,
    minWidth: 0,
  },
  iconStyleTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
