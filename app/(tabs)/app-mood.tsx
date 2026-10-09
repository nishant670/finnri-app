import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { cssInterop } from 'nativewind';
import React from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import {
  Fonts,
  ThemeMoods,
  getMoodIconName,
  type IconStyle,
  type ThemeMoodId,
} from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

const TText = cssInterop(ThemedText, { className: 'style' });

const iconStyleOptions: {
  id: IconStyle;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { id: 'whimsical', label: 'Whimsical', icon: 'emoticon-happy-outline' },
  { id: 'minimal', label: 'Minimal', icon: 'circle-outline' },
];

const previewRows = [
  { icon: 'cash', labelWidth: '74%', tone: 'accent' },
  { icon: 'piggy-bank', labelWidth: '58%', tone: 'success' },
] as const;

export default function AppMoodScreen() {
  const router = useRouter();
  const themeTokens = useThemeTokens();
  const colors = themeTokens.colors;
  const isDark = themeTokens.mode === 'dark';
  const themeColor = useAppMoodStore((state) => state.themeColor);
  const nightMode = useAppMoodStore((state) => state.nightMode);
  const iconStyle = useAppMoodStore((state) => state.iconStyle);
  const setThemeColor = useAppMoodStore((state) => state.setThemeColor);
  const setNightMode = useAppMoodStore((state) => state.setNightMode);
  const setIconStyle = useAppMoodStore((state) => state.setIconStyle);
  const resetMood = useAppMoodStore((state) => state.resetMood);
  const selected = ThemeMoods[themeColor] ?? ThemeMoods.finnri;
  const mutedText = isDark ? 'rgba(255,255,255,0.58)' : '#7B6F75';
  const softSurface = isDark ? colors.secondary : selected.light.secondary;
  const previewCard = isDark ? colors.card : '#FFFFFF';

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
    <SafeAreaView
      className="flex-1"
      edges={['top', 'left', 'right']}
      style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-6 py-4">
        <Pressable onPress={goBack} hitSlop={20}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <TText className="text-base font-black" style={{ color: colors.text, fontFamily: Fonts.title }}>
          App Mood
        </TText>
        <Pressable onPress={resetMood} hitSlop={16}>
          <MaterialCommunityIcons name="restore" size={22} color={mutedText} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 120 }}>
        <TText
          className="mb-4 text-xs font-black tracking-widest"
          style={{ color: mutedText, fontFamily: Fonts.body }}>
          LIVE PREVIEW
        </TText>

        <View
          className="mb-9 px-6 py-6"
          style={[
            {
              backgroundColor: previewCard,
              borderColor: colors.border,
              borderRadius: themeTokens.radius.xxl,
              borderWidth: 1,
            },
            themeTokens.shadows.soft,
          ]}>
          <View className="mb-7 flex-row items-start justify-between">
            <View>
              <View
                className="mb-3 h-3 w-24 rounded-full"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1ECEE' }}
              />
              <View
                className="h-6 w-36 rounded-full"
                style={{ backgroundColor: softSurface }}
              />
            </View>
            <View
              className="h-9 w-9 items-center justify-center"
              style={{
                backgroundColor: colors.accent,
                borderRadius: themeTokens.icon.activeContainerRadius,
              }}>
              <MaterialCommunityIcons
                name={getMoodIconName('star-four-points', iconStyle) as any}
                size={18}
                color="#FFFFFF"
              />
            </View>
          </View>

          {previewRows.map((item, index) => (
            <View
              key={item.icon}
              className={index === 0 ? 'mb-5 flex-row items-center' : 'flex-row items-center'}>
              <View
                className="mr-4 h-11 w-11 items-center justify-center"
                style={{
                  backgroundColor: item.tone === 'accent' ? colors.secondary : '#DDF6EA',
                  borderRadius: themeTokens.icon.containerRadius,
                }}>
                <MaterialCommunityIcons
                  name={getMoodIconName(item.icon, iconStyle) as any}
                  size={20}
                  color={item.tone === 'accent' ? colors.accent : '#17A978'}
                />
              </View>
              <View className="flex-1">
                <View
                  className="mb-3 h-2.5 rounded-full"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F4F0F2' }}
                />
                <View
                  className="h-2.5 rounded-full"
                  style={{
                    width: item.labelWidth,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F4F0F2',
                  }}
                />
              </View>
            </View>
          ))}
        </View>

        <TText
          className="mb-5 text-xs font-black tracking-widest"
          style={{ color: mutedText, fontFamily: Fonts.body }}>
          THEME COLOR
        </TText>
        <View className="mb-4 flex-row items-center justify-between">
          {Object.values(ThemeMoods).map((option) => {
            const active = option.id === themeColor;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  haptics.select();
                  setThemeColor(option.id as ThemeMoodId);
                }}
                className="h-16 w-16 items-center justify-center"
                style={{
                  borderColor: active ? option.accent : 'transparent',
                  borderRadius: 32,
                  borderWidth: 2,
                }}>
                <View
                  className="h-12 w-12 items-center justify-center border-4"
                  style={{
                    backgroundColor: option.preview,
                    borderColor: isDark ? colors.background : '#FFFFFF',
                    borderRadius: 24,
                  }}>
                  {active ? (
                    <View className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: option.accent }} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <TText className="mb-9 text-sm italic" style={{ color: mutedText, fontFamily: Fonts.body }}>
          {selected.message}
        </TText>

        <View
          className="mb-9 flex-row items-center justify-between px-6 py-6"
          style={[
            {
              backgroundColor: previewCard,
              borderColor: colors.border,
              borderRadius: themeTokens.radius.xxl,
              borderWidth: 1,
            },
            themeTokens.shadows.soft,
          ]}>
          <View className="mr-4 flex-1 flex-row items-center">
            <View
              className="mr-4 h-12 w-12 items-center justify-center"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : softSurface,
                borderRadius: themeTokens.icon.containerRadius,
              }}>
              <MaterialCommunityIcons name="moon-waning-crescent" size={24} color={colors.accent} />
            </View>
            <View className="flex-1">
              <TText className="text-lg font-black" style={{ color: colors.text, fontFamily: Fonts.title }}>
                Night owl mode
              </TText>
              <TText className="text-xs font-medium" style={{ color: mutedText, fontFamily: Fonts.body }}>
                Use the dark theme everywhere
              </TText>
            </View>
          </View>
          <HapticSwitch
            value={nightMode}
            onValueChange={setNightMode}
            trackColor={{ false: isDark ? '#3A3A3A' : '#D9E1EA', true: colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TText
          className="mb-5 text-xs font-black tracking-widest"
          style={{ color: mutedText, fontFamily: Fonts.body }}>
          ICON STYLE
        </TText>
        <View className="flex-row gap-4">
          {iconStyleOptions.map((option) => (
            <IconStyleOption
              key={option.id}
              active={iconStyle === option.id}
              label={option.label}
              icon={option.icon}
              colors={colors}
              mutedText={mutedText}
              isDark={isDark}
              radius={themeTokens.icon.activeContainerRadius}
              onPress={() => {
                haptics.select();
                setIconStyle(option.id);
              }}
            />
          ))}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

function IconStyleOption({
  active,
  label,
  icon,
  colors,
  mutedText,
  isDark,
  radius,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  colors: ReturnType<typeof useThemeTokens>['colors'];
  mutedText: string;
  isDark: boolean;
  radius: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="h-36 flex-1 items-center justify-center"
      style={{
        backgroundColor: active ? colors.card : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.48)',
        borderColor: active ? colors.accent : colors.border,
        borderRadius: 28,
        borderWidth: 1.5,
      }}>
      <View
        className="mb-5 h-12 w-12 items-center justify-center"
        style={{
          backgroundColor: active ? colors.secondary : isDark ? 'rgba(255,255,255,0.08)' : '#ECEFF3',
          borderRadius: radius,
        }}>
        <MaterialCommunityIcons name={icon} size={28} color={active ? colors.accent : mutedText} />
      </View>
      <TText
        className="text-base font-black"
        style={{ color: active ? colors.text : mutedText, fontFamily: Fonts.title }}>
        {label}
      </TText>
      {active ? (
        <TText className="mt-2 text-[10px] font-black" style={{ color: colors.accent, fontFamily: Fonts.body }}>
          ACTIVE
        </TText>
      ) : null}
    </Pressable>
  );
}
