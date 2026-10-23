import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { FinnriLogoMark } from '@/components/FinnriLogoMark';
import { MockCard, MockTile, MOCK_TILES, useBubbleFill } from '@/components/onboarding/onboarding-ui';
import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { EMAIL_LOGIN_ENABLED } from '@/lib/auth';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { MINUS_SIGN } from '@/lib/money';

import { GoogleGlyph } from './GoogleGlyph';
import { styles as authStyles } from './styles';
import { welcomeHeroSize } from './welcome-layout';

type AuthScreen1Props = {
  /** Guest check-in. The primary path: it goes straight to the app. */
  onGuest: () => void;
  onGoogle?: () => void;
  /** The email/mobile signup path, demoted to a text link. */
  onIdentifier: () => void;
  /**
   * 'link' is a guest arriving from "save your workspace" rather than a first
   * run. They already have data, so the screen has to be about keeping it, not
   * about starting.
   */
  mode?: 'welcome' | 'link';
  errorMessage?: string | null;
  isGuestLoading?: boolean;
  isGoogleLoading?: boolean;
};

/**
 * What the status bar and the system's bottom bar take between them, used only
 * for the first frame. The real number arrives from the scroll view's own
 * layout a moment later; this is here so the illustration is drawn close to its
 * final size straight away rather than snapping once the measurement lands.
 */
const ASSUMED_SYSTEM_CHROME = 90;

/**
 * The Welcome screen (R13-Welcome). Guest is the primary button because it is
 * the only option here that ends in the user seeing their own money — every
 * other path spends screens before it does anything. Signing in stays one tap
 * away, and the upgrade prompt on Home asks again once there is data worth
 * keeping.
 *
 * All of those paths have to be on screen at once, which is what drives the
 * layout: the illustration panel takes the height left over rather than a fixed
 * 210 (see `welcome-layout`). The `ScrollView` stays behind it as a floor for
 * the cases arithmetic cannot cover — a very large system font, a split-screen
 * window — but on a handset at default settings nothing here needs scrolling.
 *
 * The guest wording is exact on purpose. Guest entries are stored on Finnri's
 * server under a guest ID this phone keeps (`/v1/auth/guest`), so "your data
 * stays on this device" was untrue; what is true is that they are reachable
 * only from this phone until the person signs in.
 */
export const AuthScreen1 = ({
  onGuest,
  onGoogle,
  onIdentifier,
  mode = 'welcome',
  errorMessage,
  isGuestLoading,
  isGoogleLoading,
}: AuthScreen1Props) => {
  const { colors } = useThemeTokens();
  const bubble = useBubbleFill();
  const isBusy = !!isGuestLoading || !!isGoogleLoading;
  const isLink = mode === 'link';

  const { height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setViewportHeight((current) => (current === height ? current : height));
  };

  const heroHeight = welcomeHeroSize(viewportHeight ?? windowHeight - ASSUMED_SYSTEM_CHROME);

  return (
    <ScrollView
      onLayout={handleLayout}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.logoRow}>
        <FinnriLogoMark size={40} />
        <ThemedText style={styles.wordmark}>finnri</ThemedText>
      </View>

      {heroHeight > 0 ? (
        <View
          testID="welcome-illustration"
          style={[styles.panel, { height: heroHeight, backgroundColor: colors.track }]}>
          <View style={styles.illustration}>
            <View style={[styles.bubble, { backgroundColor: bubble }]}>
              <ThemedText style={styles.bubbleText}>Spent ₹250 on lunch via UPI</ThemedText>
            </View>
            <MockCard width={280} style={styles.entry}>
              <View style={styles.entryRow}>
                <MockTile {...MOCK_TILES.food} size={36} radius={10} iconSize={18} />
                <View style={styles.grow}>
                  <ThemedText style={styles.entryTitle}>Lunch</ThemedText>
                  <ThemedText tone="muted" style={styles.entryMeta}>
                    Food & Drinks · UPI
                  </ThemedText>
                </View>
                <ThemedText style={styles.entryAmount}>{`${MINUS_SIGN}₹250`}</ThemedText>
              </View>
            </MockCard>
          </View>
        </View>
      ) : null}

      <ThemedText accessibilityRole="header" style={styles.title}>
        {isLink ? 'Save your workspace' : 'Track money the way you talk'}
      </ThemedText>
      <ThemedText tone="muted" style={styles.subtitle}>
        {isLink
          ? 'Sign in to back up everything you have tracked so far and reach it from any device.'
          : 'Say or type what you spent. Finnri does the sorting.'}
      </ThemedText>

      <View style={styles.spacer} />

      <View style={styles.actions}>
        <PressableView
          accessibilityRole="button"
          disabled={isBusy}
          onPress={onGuest}
          style={[styles.button, { backgroundColor: colors.accent, opacity: isBusy ? 0.6 : 1 }]}
          pressedStyle={styles.pressed}>
          {isGuestLoading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <ThemedText style={[styles.primaryLabel, { color: colors.onAccent }]}>
                {isLink ? 'Keep using guest' : 'Start for free'}
              </ThemedText>
              <MaterialCommunityIcons name="arrow-right" size={20} color={colors.onAccent} />
            </>
          )}
        </PressableView>

        {/* The guest terms, stated before the tap rather than on a screen after it. */}
        <ThemedText tone="muted" style={styles.note}>
          {isLink
            ? 'Your guest entries are linked to this phone. Clearing app data or changing phone loses them.'
            : 'No sign-up needed. Your entries stay linked to this phone until you sign in.'}
        </ThemedText>

        <PressableView
          testID="welcome-google"
          accessibilityRole="button"
          disabled={isBusy || !onGoogle}
          onPress={onGoogle}
          style={[
            styles.button,
            styles.google,
            { backgroundColor: colors.card, borderColor: colors.borderStrong, opacity: isBusy ? 0.6 : 1 },
          ]}
          pressedStyle={styles.pressed}>
          {isGoogleLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <GoogleGlyph size={20} />
              <ThemedText style={styles.googleLabel}>Continue with Google</ThemedText>
            </>
          )}
        </PressableView>

        {/*
          Email and mobile sign-in are switched off for launch — Google and
          guest are the two doors in, and the backend refuses OTP outright.
          Offering the button anyway would walk someone into a dead end on the
          one screen they cannot get past.
        */}
        {EMAIL_LOGIN_ENABLED ? (
          <PressableView
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onIdentifier}
            style={styles.textButton}
            pressedStyle={styles.pressed}>
            <ThemedText tone="mutedStrong" style={styles.textButtonLabel}>
              Use email or mobile
            </ThemedText>
          </PressableView>
        ) : null}

        {errorMessage ? (
          <View style={authStyles.smartErrorContainer}>
            <View style={authStyles.errorIconBox}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
            </View>
            <ThemedText style={authStyles.smartErrorText} numberOfLines={2}>
              {errorMessage}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.bankNote}>
          <MaterialCommunityIcons name="lock-outline" size={14} color={colors.muted} />
          <ThemedText tone="muted" style={styles.noteText}>
            No bank login needed
          </ThemedText>
        </View>

        {/* Play's user-generated content policy wants the terms accepted before
            anyone can create content other members will see — a shared split
            group is exactly that. The links open in a browser sheet. */}
        <ThemedText tone="muted" style={styles.legal}>
          By continuing you agree to the{' '}
          <ThemedText
            tone="muted"
            accessibilityRole="link"
            style={[styles.legal, styles.link]}
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
            Terms
          </ThemedText>{' '}
          and{' '}
          <ThemedText
            tone="muted"
            accessibilityRole="link"
            style={[styles.legal, styles.link]}
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
            Privacy Policy
          </ThemedText>
          .
        </ThemedText>
      </View>
    </ScrollView>
  );
};

/**
 * R13-Welcome's spacing. The numbers here are the ones `CHROME_HEIGHT` in
 * `welcome-layout` is summed from; change one and change the other.
 */
const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 20,
    paddingBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  wordmark: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  panel: {
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  illustration: {
    alignItems: 'center',
    gap: 10,
  },
  bubble: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 16,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 18,
  },
  entry: {
    paddingVertical: 12,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  entryMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  entryAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  title: {
    marginTop: 28,
    marginHorizontal: 24,
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    marginHorizontal: 32,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 24,
  },
  actions: {
    paddingHorizontal: 16,
    gap: 10,
  },
  button: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  note: {
    marginHorizontal: 8,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
  },
  google: {
    marginTop: 6,
    borderWidth: 1,
    gap: 10,
  },
  googleLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  textButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  bankNote: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 17,
  },
  legal: {
    marginHorizontal: 8,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
  },
  link: {
    marginHorizontal: 0,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
