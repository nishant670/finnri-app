import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { FinnriLogoMark } from '@/components/FinnriLogoMark';

import { EMAIL_LOGIN_ENABLED } from '@/lib/auth';
import { GoogleGlyph } from './GoogleGlyph';
import { GOOGLE_BUTTON_INK, styles } from './styles';
import { HERO_BASE_SIZE, welcomeHeroSize } from './welcome-layout';

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
 * The Welcome screen. Guest is the primary button because it is the only option
 * here that ends in the user seeing their own money — every other path spends
 * screens before it does anything. Signing in stays one tap away, and the
 * upgrade prompt on Home asks again once there is data worth keeping.
 *
 * All three of those paths have to be on screen at once, which is what drives
 * the layout: the illustration is sized from the space actually left over
 * rather than at a fixed 260 (see `welcome-layout`). The `ScrollView` stays
 * behind it as a floor for the cases arithmetic cannot cover — a very large
 * system font, a split-screen window — but on a handset at default settings
 * nothing here needs scrolling to be reached.
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
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const isBusy = !!isGuestLoading || !!isGoogleLoading;

  const { height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setViewportHeight((current) => (current === height ? current : height));
  };

  const heroSize = welcomeHeroSize(viewportHeight ?? windowHeight - ASSUMED_SYSTEM_CHROME);

  return (
    <ScrollView
      onLayout={handleLayout}
      contentContainerStyle={[
        styles.authScrollContent,
        welcomeStyles.scrollContent,
        { flexGrow: 1, justifyContent: 'center' },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={welcomeStyles.topSection}>
        <View style={welcomeStyles.logoRow}>
          <FinnriLogoMark size={36} style={styles.logoMark} />
          <Text style={[styles.logoText, { color: theme.text }]}>finnri</Text>
        </View>

        {/* Scaled rather than re-laid-out: the artwork is a stack of circles
            positioned against each other, and a transform keeps those relations
            exact at any size where redoing the arithmetic per-element would not. */}
        {heroSize > 0 ? (
          <View style={[welcomeStyles.heroFrame, { width: heroSize, height: heroSize }]}>
            <View
              style={[styles.imageContainer, { transform: [{ scale: heroSize / HERO_BASE_SIZE }] }]}
            >
              <View style={styles.glowCircle} />
              <View style={[styles.mainCircle, { borderColor: theme.border }]}>
                <View style={[styles.iconBox, { backgroundColor: theme.accent }]}>
                  <MaterialCommunityIcons name="wallet" size={30} color={theme.onAccent} />
                </View>
                <View style={[styles.smallIcon, styles.pos1, { backgroundColor: '#E1BEE7' }]}>
                  <MaterialCommunityIcons name="star" size={12} color="#9C27B0" />
                </View>
                <View style={[styles.smallIcon, styles.pos2, { backgroundColor: '#C8E6C9' }]}>
                  <MaterialCommunityIcons name="trending-up" size={12} color="#43A047" />
                </View>
                <View style={[styles.smallIcon, styles.pos3, { backgroundColor: '#FFCCBC' }]}>
                  <MaterialCommunityIcons name="emoticon-happy" size={12} color="#E64A19" />
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={welcomeStyles.textSection}>
        <Text style={[styles.title, welcomeStyles.title, { color: theme.text }]}>
          {mode === 'link' ? 'Save your workspace' : 'Welcome to Finnri'}
        </Text>
        <Text style={[styles.subtitle, welcomeStyles.subtitle, { color: theme.text, opacity: 0.6 }]}>
          {mode === 'link'
            ? 'Sign in to back up everything you have tracked so far and reach it from any device.'
            : 'Track your money intelligently — your way.'}
        </Text>
      </View>

      <View style={styles.buttonSection}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.primaryButton,
            welcomeStyles.actionButton,
            { backgroundColor: theme.accent, opacity: isBusy ? 0.6 : 1 },
          ]}
          disabled={isBusy}
          onPress={onGuest}
        >
          {isGuestLoading ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <>
              <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>
                {mode === 'link' ? 'Keep using guest' : "Start tracking — it's free"}
              </Text>
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color={theme.onAccent}
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        </TouchableOpacity>

        {/* The guest terms, stated before the tap rather than on a screen after
            it. This is what the interstitial used to say. */}
        <Text style={[styles.helperText, { color: theme.text, opacity: 0.55 }]}>
          {mode === 'link'
            ? 'Guest data lives only on this device. Clearing app data or changing phone loses it.'
            : 'No account needed. Your data stays on this device — sign in any time to back it up.'}
        </Text>

        <View style={[styles.dividerRow, welcomeStyles.dividerRow]}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.text, opacity: 0.4 }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.googleButton,
            welcomeStyles.actionButton,
            { borderColor: theme.border, opacity: isBusy ? 0.6 : 1 },
          ]}
          disabled={isBusy || !onGoogle}
          onPress={onGoogle}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color={GOOGLE_BUTTON_INK} />
          ) : (
            <>
              <View style={styles.googleMark}>
                <GoogleGlyph size={20} />
              </View>
              <Text style={styles.googleButtonText}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/*
          Email and mobile sign-in are switched off for launch — Google and
          guest are the two doors in, and the backend refuses OTP outright.
          Offering the button anyway would walk someone into a dead end on the
          one screen they cannot get past.
        */}
        {EMAIL_LOGIN_ENABLED ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.textButton, welcomeStyles.textButton]}
            disabled={isBusy}
            onPress={onIdentifier}
          >
            <Text style={[styles.textButtonText, { color: theme.text, opacity: 0.75 }]}>
              Use email or mobile
            </Text>
          </TouchableOpacity>
        ) : null}

        {errorMessage ? (
          <View style={styles.smartErrorContainer}>
            <View style={styles.errorIconBox}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
            </View>
            <Text style={styles.smartErrorText} numberOfLines={2}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={[styles.trustNote, welcomeStyles.trustNote]}>
          <MaterialCommunityIcons name="lock" size={12} color={theme.text} style={{ opacity: 0.4 }} />
          <Text style={[styles.trustNoteText, { color: theme.text, opacity: 0.4 }]}>
            No bank connection required
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

/**
 * Welcome's own spacing, tighter than the shared auth values it overrides.
 *
 * It is kept here rather than in `styles.ts` because the other auth screens
 * carry a fraction of this one's content — a keypad, an OTP row — and have room
 * to spare. Squeezing them to fit a screen they already fit on would cost
 * legibility for nothing. The numbers below are the ones `CHROME_HEIGHT` in
 * `welcome-layout` is summed from.
 */
const welcomeStyles = StyleSheet.create({
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  actionButton: {
    height: 56,
    borderRadius: 28,
    marginBottom: 10,
  },
  dividerRow: {
    marginVertical: 12,
  },
  textButton: {
    padding: 9,
  },
  trustNote: {
    marginTop: 10,
  },
});
