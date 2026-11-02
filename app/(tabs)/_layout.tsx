import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { SplitInvitePrompt } from '@/components/split/SplitInvitePrompt';
import {
  TabMarker,
  TabMarkerProvider,
  TabRouteFocus,
  useTabMarkerAnchor,
} from '@/components/tab-marker';
import { Fonts, type IconStyle } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type GlyphName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** One size for every tab, focused or not (board R3-Home). */
const ICON_SIZE = 24;

/**
 * The bar's height above the system inset, and the part of it left empty at
 * the bottom. React Navigation pads each item by 5 and centres the 24 glyph in
 * a 28-tall box, so a 4 top padding puts the icon 11 down and the label 39
 * down — the board's positions.
 */
const BAR_HEIGHT = 76;
const BAR_PADDING_TOP = 4;
const BAR_PADDING_BOTTOM = 12;

type TabIconProps = {
  /** The glyph's outline form, drawn on every tab. */
  outlineName: GlyphName;
  /**
   * The solid form, laid under the outline at 25% on the focused tab — the
   * board's "accent fill at a quarter, accent stroke". Omitted for a glyph that
   * is only a line, which has nothing to fill.
   */
  filledName?: GlyphName;
  /** The screen's route name, which is how the marker keys this tab's frame. */
  route: string;
  focused: boolean;
  color: ColorValue;
  accent: string;
  iconStyle: IconStyle;
};

function TabIcon({ outlineName, filledName, route, focused, color, accent, iconStyle }: TabIconProps) {
  const anchor = useTabMarkerAnchor(route);
  // The minimal mood is outline-only everywhere, so it keeps the stroke alone.
  const fill = focused && filledName && iconStyle !== 'minimal' ? filledName : null;

  return (
    <View ref={anchor.ref} onLayout={anchor.onLayout} style={styles.icon}>
      {fill ? (
        <MaterialCommunityIcons
          name={fill}
          size={ICON_SIZE}
          color={accent}
          style={[StyleSheet.absoluteFill, styles.fill]}
        />
      ) : null}
      <MaterialCommunityIcons size={ICON_SIZE} name={outlineName} color={focused ? accent : color} />
    </View>
  );
}

function TabLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: ColorValue;
  children: string;
}) {
  return (
    <Text
      numberOfLines={1}
      style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>
      {children}
    </Text>
  );
}

export default function TabLayout() {
  /**
   * The room the system's own bar takes at the bottom of the window.
   *
   * Android has been edge-to-edge since SDK 54 and there is no opting out, so
   * the tab bar is laid out over the gesture pill or the three-button bar
   * rather than above it. React Navigation already adds this inset itself — but
   * only when `tabBarStyle` names neither a `height` nor a `paddingBottom`, and
   * this bar names both, so the library's version was being overwritten and the
   * labels ended up underneath the system buttons. Adding it back here is what
   * keeps the bar tappable; the same applies to the iPhone home indicator.
   */
  const insets = useSafeAreaInsets();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const iconStyle = theme.mood.iconStyle;
  const tabIcon = (route: string, outlineName: GlyphName, filledName?: GlyphName) =>
    function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <TabIcon
          outlineName={outlineName}
          filledName={filledName}
          route={route}
          focused={focused}
          color={color}
          accent={colors.accent}
          iconStyle={iconStyle}
        />
      );
    };

  return (
    // The provider sits outside the navigator because the two halves that feed
    // the marker — the icons and the bar background — are on different branches
    // of what the navigator renders, and this is their nearest common ancestor.
    <TabMarkerProvider>
    {/*
      * Mounted here rather than at the root so an invite can only interrupt
      * somebody already inside the app — never over the lock screen, auth, or
      * onboarding.
      */}
    <SplitInvitePrompt />
    <Tabs
      /*
       * Home is where Back goes, and where a cold launch starts.
       *
       * The tab router's default is `firstRoute`, which returns to
       * `routes[0]` — the first `Tabs.Screen` declared below, which is
       * Insights. So the device back button from Money, Splits or Profile
       * landed on a tab the user had not asked for and might never have
       * opened. The bar is ordered Insights · Money · Home · Splits · Profile
       * because Home belongs under the thumb, not first, so the first tab and
       * the home tab are different routes and the default cannot be right here.
       *
       * `initialRouteName` has to be spelled out for `initialRoute` to mean
       * anything: the router resolves it with `findIndex`, and falls back to
       * index 0 — Insights again — when the name matches nothing. It also
       * fixes a smaller thing, that the navigator used to mount on Insights and
       * be navigated to Home a frame later, because `/` resolves to `index`.
       */
      backBehavior="initialRoute"
      initialRouteName="index"
      screenOptions={{
        // The focused tab is marked by the bar, the filled icon and bolder
        // ink — not by accent text, which the palette keeps off light surfaces.
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        // `TabRouteFocus` rides along here because this is the only place
        // rendered *inside* the navigator: it is what lets the marker read the
        // same focused route the icons are handed, rather than the URL.
        tabBarBackground: () => (
          <>
            <TabRouteFocus />
            <TabMarker color={colors.accent} />
          </>
        ),
        tabBarLabel: ({ focused, color, children }) => (
          <TabLabel focused={focused} color={color}>
            {children}
          </TabLabel>
        ),
        headerShown: false,
        animation: 'shift',
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          // Flat, as drawn: the border is the bar's only edge.
          elevation: 0,
          ...Platform.select({ ios: { shadowOpacity: 0 } }),
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: BAR_PADDING_TOP,
          paddingBottom: BAR_PADDING_BOTTOM + insets.bottom,
        },
      }}>
      <Tabs.Screen
        name="insight"
        options={{ title: 'Insights', tabBarIcon: tabIcon('insight', 'chart-timeline-variant') }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: 'Money',
          tabBarIcon: tabIcon('money', 'wallet-bifold-outline', 'wallet-bifold'),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('index', 'home-variant-outline', 'home-variant'),
        }}
      />
      <Tabs.Screen
        name="split"
        options={{
          title: 'Splits',
          tabBarIcon: tabIcon('split', 'account-multiple-outline', 'account-multiple'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('profile', 'account-circle-outline', 'account-circle'),
        }}
      />
      <Tabs.Screen
        name="app-mood"
        options={{
          href: null,
          title: 'App Mood',
          // No tab of its own, so no pill. `tabBarBackground` is read from the
          // *focused* screen's options, which makes opting out a property of
          // this screen rather than something the marker has to infer — and
          // stops the pill hovering under whichever tab the user arrived from.
          tabBarBackground: undefined,
        }}
      />
    </Tabs>
    </TabMarkerProvider>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    opacity: 0.25,
  },
  label: {
    fontFamily: Fonts.title,
    fontSize: 12,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
});
