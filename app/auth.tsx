import { OnboardingScreenWrapper } from '@/components/onboarding/OnboardingScreenWrapper';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useMotion } from '@/hooks/use-motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';

import {
  AuthOTPVerificationScreen,
  AuthPinLoginScreen,
  AuthPinSetupScreen,
  AuthScreen1,
  AuthScreen2,
  AuthScreen4,
  AuthSecuritySetupScreen,
} from '@/components/auth';
import type { ClaimTokenResult } from '@/components/auth/AuthOTPVerificationScreen';
import {
  EMAIL_LOGIN_ENABLED,
  authOtpSend,
  getFriendlyAuthErrorMessage,
  guestCheckin,
  identifyUser,
  loginWithGoogle,
  loginUser,
  registerUser,
  resetPin,
} from '@/lib/auth';
import {
  clearAuthProgress,
  loadAuthProgress,
  previousAuthStep,
  saveAuthProgress,
  type AuthStep,
} from '@/lib/auth-progress';
import { getDeviceId } from '@/lib/device';
import { saveLocalSecurityPin } from '@/lib/security';

WebBrowser.maybeCompleteAuthSession();

const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// Read from the app config so it cannot drift from the package name Google has
// registered against the Android OAuth client; a mismatch fails the whole flow.
const GOOGLE_ANDROID_REDIRECT_SCHEME = Constants.expoConfig?.android?.package ?? 'com.finnri.app';

/**
 * The custom scheme an iOS OAuth client redirects to.
 *
 * Google does not use the bundle identifier here the way Android uses the
 * package name — it uses the client id reversed, so
 * `123-abc.apps.googleusercontent.com` becomes `com.googleusercontent.apps.123-abc`.
 * Deriving it from the client id keeps the two from drifting apart.
 */
export const reversedIOSClientScheme = (clientId: string) => {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
};

/**
 * The OAuth client for the platform actually running.
 *
 * Never falls back across platforms. Google rejects an Android client
 * presented from iOS, and the old chain did exactly that — `_ANDROID_` is set,
 * so an iOS build would have picked it up and failed inside Google's consent
 * screen rather than saying plainly that iOS has no client yet.
 *
 * `_MOBILE_` is honoured as a deliberate cross-platform override; `_ANDROID_`
 * and `_IOS_` are each only ever used on their own platform.
 */
const googleClientIdForPlatform = () => {
  const shared = process.env.EXPO_PUBLIC_GOOGLE_MOBILE_CLIENT_ID;
  if (shared) return shared;
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
};

export default function AuthFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; inviteToken?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { user, setAuth } = useAuthStore();
  const isGuestLinking = params.mode === 'link' && !!user?.is_guest;
  // A guest linking used to land straight on the identifier form. With email
  // sign-in off there is no form to land on, so they get Welcome in its
  // "save your workspace" dress, which offers the Google button they need.
  const [step, setStep] = useState<AuthStep>(() =>
    isGuestLinking && EMAIL_LOGIN_ENABLED ? 'identifier' : 'welcome'
  );
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [identifier, setIdentifier] = useState('');
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [claimTokenExpiresAt, setClaimTokenExpiresAt] = useState<number | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isGuestChecking, setIsGuestChecking] = useState(false);
  const [isGoogleChecking, setIsGoogleChecking] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  /**
   * Restoring runs once and only forwards. Until it settles, nothing is written
   * back — otherwise the initial `welcome` would overwrite the very progress
   * being read.
   */
  const [hasRestoredProgress, setHasRestoredProgress] = useState(false);

  useEffect(() => {
    let isMounted = true;
    // Guest linking starts from a known place and carries no half-finished
    // state; restoring an older signup over it would swap the user's identifier
    // out from under them.
    if (isGuestLinking) {
      setHasRestoredProgress(true);
      return;
    }
    void loadAuthProgress().then((progress) => {
      if (!isMounted) return;
      if (progress) {
        setIdentifier(progress.identifier);
        setClaimToken(progress.claimToken);
        setClaimTokenExpiresAt(progress.claimTokenExpiresAt);
        setStep(progress.step);
      }
      setHasRestoredProgress(true);
    });
    return () => {
      isMounted = false;
    };
  }, [isGuestLinking]);

  /**
   * Every completed step is written straight after it completes, so a kill at
   * any point resumes where it left off rather than at Welcome. The claim token
   * goes with it — re-entering an OTP you already answered correctly is the
   * thing this exists to prevent.
   */
  useEffect(() => {
    if (!hasRestoredProgress) return;
    void saveAuthProgress({ step, identifier, claimToken, claimTokenExpiresAt });
  }, [claimToken, claimTokenExpiresAt, hasRestoredProgress, identifier, step]);

  const changeStep = useCallback(
    (newStep: AuthStep, transitionDirection: 'forward' | 'back' = 'forward') => {
      setDirection(transitionDirection);
      setStep(newStep);
    },
    []
  );

  const finish = useCallback(() => {
    void clearAuthProgress();
    const inviteToken = Array.isArray(params.inviteToken)
      ? params.inviteToken[0]
      : params.inviteToken;
    if (inviteToken) {
      router.replace({ pathname: '/invite/split/[token]', params: { token: inviteToken } });
      return;
    }
    router.replace('/(tabs)');
  }, [params.inviteToken, router]);

  /**
   * Kept in a ref so the Back subscription can read the current handler without
   * being torn down and re-registered on every keystroke-driven re-render.
   */
  const handleBackRef = useRef<() => boolean>(() => false);
  handleBackRef.current = () => {
    // A guest linking an account entered from Home, not from Welcome, so Back
    // at the first step belongs to the screen they came from.
    if (isGuestLinking && step === 'identifier') {
      finish();
      return true;
    }
    const previous = previousAuthStep(step);
    if (!previous) return false;
    if (step === 'existing-account') setIdentifier('');
    changeStep(previous, 'back');
    return true;
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleBackRef.current()
    );
    return () => subscription.remove();
  }, []);

  const handleGuestContinue = async () => {
    setGuestError(null);
    setIdentifyError(null);
    setIsGuestChecking(true);
    try {
      const deviceId = await getDeviceId();
      const response = await guestCheckin({
        device_id: deviceId,
      });
      if (response?.user) {
        setAuth(response.user, response.token);
      }
      finish();
    } catch (error) {
      setGuestError(getFriendlyAuthErrorMessage(error, 'Unable to continue as guest.'));
    } finally {
      setIsGuestChecking(false);
    }
  };

  const handleGoogleContinue = async () => {
    if (Constants.appOwnership === 'expo') {
      setIdentifyError(
        'Google sign-in requires a Finnri development build. Expo Go cannot complete Google OAuth redirects.'
      );
      return;
    }

    const googleClientId = googleClientIdForPlatform();
    if (!googleClientId) {
      setIdentifyError(
        Platform.OS === 'ios'
          ? 'Google sign-in is not set up for iOS yet.'
          : 'Google sign-in is not configured yet.'
      );
      return;
    }

    // Google's Android clients only accept a redirect whose scheme is the
    // package name, with a single slash: "com.finnri.app:/oauth2redirect".
    // makeRedirectUri emits "scheme://path", and Google rejects that double
    // slash, so this one is spelled out rather than generated. The app's own
    // "finnri" scheme stays registered for split-group invite links.
    //
    // Resolved before the spinner starts: every bail-out below it would
    // otherwise leave the button spinning with nothing on its way back.
    const nativeRedirectScheme =
      Platform.OS === 'ios'
        ? reversedIOSClientScheme(googleClientId)
        : GOOGLE_ANDROID_REDIRECT_SCHEME;
    if (Platform.OS !== 'web' && !nativeRedirectScheme) {
      setIdentifyError('Google sign-in is not set up correctly on this build.');
      return;
    }
    const redirectUri =
      Platform.OS === 'web'
        ? AuthSession.makeRedirectUri({ path: 'auth/google' })
        : `${nativeRedirectScheme}:/oauth2redirect`;

    setIdentifyError(null);
    setGuestError(null);
    setIsGoogleChecking(true);
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    try {
      const request = await AuthSession.loadAsync(
        {
          clientId: googleClientId,
          redirectUri,
          responseType: AuthSession.ResponseType.Code,
          scopes: ['openid', 'email', 'profile'],
          prompt: AuthSession.Prompt.SelectAccount,
          extraParams: { nonce },
        },
        googleDiscovery
      );

      const result = await request.promptAsync(googleDiscovery);
      if (result.type !== 'success') {
        return;
      }
      const authorizationCode = result.params.code;
      if (!authorizationCode) {
        throw new Error('Google did not return an authorization code.');
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: googleClientId,
          code: authorizationCode,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier ?? '',
          },
        },
        googleDiscovery
      );
      const idToken = tokenResponse.idToken;
      if (!idToken) {
        throw new Error('Google did not return a sign-in token.');
      }
      const deviceId = await getDeviceId();
      const response = await loginWithGoogle({
        id_token: idToken,
        nonce,
        guest_uuid: user?.is_guest ? user.uuid : undefined,
        device_id: deviceId,
        biometrics_enabled: false,
      });
      setAuth(response.user, response.token);
      finish();
    } catch (error) {
      setIdentifyError(getFriendlyAuthErrorMessage(error, 'Google sign-in failed.'));
    } finally {
      setIsGoogleChecking(false);
    }
  };

  const handleClaimToken = (result: ClaimTokenResult, nextStep: AuthStep) => {
    setClaimToken(result.claimToken);
    setClaimTokenExpiresAt(result.expiresAt);
    changeStep(nextStep, 'forward');
  };

  const handleRegister = async (data: { pin: string | null; biometricsEnabled: boolean }) => {
    if (!claimToken) return;
    setIsRegistering(true);
    try {
      const deviceId = await getDeviceId();
      const response = await registerUser({
        claim_token: claimToken,
        pin: data.pin ?? undefined,
        guest_uuid: user?.is_guest ? user.uuid : undefined,
        device_id: deviceId,
        biometrics_enabled: data.biometricsEnabled,
      });
      if (data.pin) {
        await saveLocalSecurityPin(response.user.uuid, data.pin);
      }
      setAuth(
        {
          ...response.user,
          has_pin: !!data.pin,
          biometrics_enabled: data.biometricsEnabled,
          email: identifier.includes('@') ? identifier : undefined,
          phone: identifier.includes('@') ? undefined : identifier,
        },
        response.token
      );
      // `signup-done` is not a resumable step, so reaching it is what clears the
      // stored progress — the account exists, there is nothing left to resume.
      changeStep('signup-done', 'forward');
    } catch (error) {
      setIdentifyError(getFriendlyAuthErrorMessage(error, 'Registration failed.'));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLogin = async (pin: string) => {
    if (pin === 'biometric_success') {
      finish();
      return;
    }
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const deviceId = await getDeviceId();
      const response = await loginUser({
        identifier: identifier,
        pin: pin,
        device_id: deviceId,
      });
      await saveLocalSecurityPin(response.user.uuid, pin);
      setAuth(
        {
          ...response.user,
          has_pin: true,
          email: identifier.includes('@') ? identifier : undefined,
          phone: identifier.includes('@') ? undefined : identifier,
        },
        response.token
      );
      finish();
    } catch (error) {
      setLoginError(getFriendlyAuthErrorMessage(error, 'Login failed.'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPin = async () => {
    if (!identifier) {
      changeStep('identifier', 'back');
      return;
    }

    setLoginError(null);
    setResetError(null);
    setClaimToken(null);
    setClaimTokenExpiresAt(null);
    setIsSendingResetOtp(true);
    try {
      await authOtpSend(identifier);
      changeStep('reset-otp', 'forward');
    } catch (error) {
      setLoginError(getFriendlyAuthErrorMessage(error, 'Unable to send reset code.'));
    } finally {
      setIsSendingResetOtp(false);
    }
  };

  /**
   * Shared by the forgot-PIN reset and by an account that never set a PIN
   * signing in on a new device. Both have proved control of the identifier by
   * OTP; the only difference is whether a PIN comes out the other end.
   */
  const completeClaimSignIn = async (pin: string | null, biometricsEnabled?: boolean) => {
    if (!claimToken) return;
    setResetError(null);
    setIsResettingPin(true);
    try {
      const deviceId = await getDeviceId();
      const response = await resetPin({
        claim_token: claimToken,
        pin: pin ?? undefined,
        device_id: deviceId,
        biometrics_enabled: biometricsEnabled,
      });
      if (pin) {
        await saveLocalSecurityPin(response.user.uuid, pin);
      }
      setAuth(
        {
          ...response.user,
          has_pin: !!pin,
          biometrics_enabled: biometricsEnabled,
          email: identifier.includes('@') ? identifier : undefined,
          phone: identifier.includes('@') ? undefined : identifier,
        },
        response.token
      );
      finish();
    } catch (error) {
      setResetError(getFriendlyAuthErrorMessage(error, 'Unable to sign in.'));
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleIdentify = async (id: string) => {
    setIdentifyError(null);
    setLoginError(null);
    setResetError(null);
    setClaimToken(null);
    setClaimTokenExpiresAt(null);
    setIsIdentifying(true);
    try {
      const result = await identifyUser(id);
      setIdentifier(id);
      if (!result.exists) {
        await authOtpSend(id);
        changeStep('signup-otp', 'forward');
        return;
      }
      // An account that skipped PIN setup has no keypad to be sent to. Send the
      // code straight away and verify by OTP instead.
      if (result.has_pin === false) {
        await authOtpSend(id);
        changeStep('otp-login', 'forward');
        return;
      }
      changeStep(isGuestLinking ? 'existing-account' : 'pin-login', 'forward');
    } catch (error) {
      setIdentifyError(getFriendlyAuthErrorMessage(error, 'Unable to verify that identifier.'));
    } finally {
      setIsIdentifying(false);
    }
  };

  const renderScreen = () => {
    switch (step) {
      case 'welcome':
        return (
          <AuthScreen1
            mode={isGuestLinking ? 'link' : 'welcome'}
            onGoogle={handleGoogleContinue}
            // A guest who is already signed in as a guest needs no check-in —
            // the button means "never mind", so it just leaves.
            onGuest={isGuestLinking ? finish : handleGuestContinue}
            onIdentifier={() => {
              setGuestError(null);
              changeStep('identifier', 'forward');
            }}
            errorMessage={guestError ?? identifyError}
            isGuestLoading={isGuestChecking}
            isGoogleLoading={isGoogleChecking}
          />
        );
      case 'identifier':
        return (
          <AuthScreen2
            onContinue={handleIdentify}
            onSecondary={() => {
              if (isGuestLinking) {
                finish();
                return;
              }
              setGuestError(null);
              changeStep('welcome', 'back');
            }}
            onInputChange={() => setIdentifyError(null)}
            errorMessage={identifyError}
            isLoading={isIdentifying}
            secondaryLabel={isGuestLinking ? 'Keep using guest' : 'Back'}
            // Only the guest arrives here without having passed Welcome, so
            // only the guest needs the button repeated. Offering it on the way
            // *back* from Welcome would put the same choice on two consecutive
            // screens, which reads as the first one not having worked.
            onGoogle={isGuestLinking ? handleGoogleContinue : undefined}
            isGoogleLoading={isGoogleChecking}
          />
        );
      case 'existing-account':
        return (
          <ExistingAccountPrompt
            identifier={identifier}
            onContinue={() => changeStep('pin-login', 'forward')}
            onDifferent={() => {
              setIdentifier('');
              changeStep('identifier', 'back');
            }}
            theme={theme}
          />
        );
      case 'pin-login':
        return (
          <AuthPinLoginScreen
            onContinue={handleLogin}
            onSecondary={() => changeStep('identifier', 'back')}
            onForgotPin={handleForgotPin}
            errorMessage={loginError}
            isLoading={isLoggingIn || isSendingResetOtp}
          />
        );
      case 'signup-otp':
        return (
          <AuthOTPVerificationScreen
            data={identifier}
            onContinue={(result) => handleClaimToken(result, 'signup-security')}
            onSecondary={() => changeStep('identifier', 'back')}
          />
        );
      case 'otp-login':
        return (
          <AuthOTPVerificationScreen
            data={identifier}
            continueLabel="Sign in"
            onContinue={(result) => handleClaimToken(result, 'otp-login-security')}
            onSecondary={() => changeStep('identifier', 'back')}
          />
        );
      case 'otp-login-security':
        // The account is verified at this point; the screen is an offer, and
        // "Set up later" finishes the sign-in with no PIN, same as before.
        return (
          <AuthSecuritySetupScreen
            onContinue={(data: { pin: string | null; biometricsEnabled: boolean }) =>
              completeClaimSignIn(data.pin, data.biometricsEnabled)
            }
            isLoading={isResettingPin}
            errorMessage={resetError}
            continueLabel="Sign in"
          />
        );
      case 'reset-otp':
        return (
          <AuthOTPVerificationScreen
            data={identifier}
            onContinue={(result) => handleClaimToken(result, 'reset-pin')}
            onSecondary={() => changeStep('pin-login', 'back')}
          />
        );
      case 'reset-pin':
        // No skip here on purpose: this user is resetting a PIN they could not
        // remember, so leaving the old one in place locks them out again.
        return (
          <AuthPinSetupScreen
            onComplete={(pin) => completeClaimSignIn(pin)}
            onCancel={() => changeStep('pin-login', 'back')}
            isLoading={isResettingPin}
            errorMessage={resetError}
          />
        );
      case 'signup-security':
        return (
          <AuthSecuritySetupScreen
            onContinue={handleRegister}
            onSecondary={() => changeStep('signup-otp', 'back')}
            isLoading={isRegistering}
            errorMessage={identifyError}
          />
        );
      case 'signup-done':
        return <AuthScreen4 onContinue={finish} />;
      default:
        return null;
    }
  };

  const motion = useMotion();

  // A screen push, on the `sheet` token. These used to run 400ms flat in both
  // directions and honoured nothing — the outgoing screen is already gone as
  // far as the user is concerned, and reduced motion could not switch them off.
  const enterMs = motion.duration('sheet');
  const exitMs = motion.exitDuration('sheet');
  const enteringAnimation =
    direction === 'forward' ? SlideInRight.duration(enterMs) : SlideInLeft.duration(enterMs);
  const exitingAnimation =
    direction === 'forward' ? SlideOutLeft.duration(exitMs) : SlideOutRight.duration(exitMs);

  // Rendering the Welcome screen for a frame and then swapping it for a restored
  // step would read as a glitch, so nothing renders until the restore settles.
  if (!hasRestoredProgress) {
    return (
      <OnboardingScreenWrapper>
        <View style={styles.container} />
      </OnboardingScreenWrapper>
    );
  }

  return (
    <OnboardingScreenWrapper>
      <View style={styles.container}>
        <Animated.View
          key={step}
          entering={enteringAnimation}
          exiting={exitingAnimation}
          style={styles.screenContainer}>
          {renderScreen()}
        </Animated.View>
      </View>
    </OnboardingScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  promptContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  promptCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: 'white',
  },
  promptTitle: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: Fonts.title,
  },
  promptBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    fontFamily: Fonts.body,
  },
  promptPrimaryButton: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  promptPrimaryText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: Fonts.title,
  },
  promptSecondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  promptSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.title,
  },
});

type ExistingAccountPromptProps = {
  identifier: string;
  onContinue: () => void;
  onDifferent: () => void;
  theme: typeof Colors.light;
};

function ExistingAccountPrompt({
  identifier,
  onContinue,
  onDifferent,
  theme,
}: ExistingAccountPromptProps) {
  return (
    <View style={styles.promptContainer}>
      <View style={styles.promptCard}>
        <Text style={[styles.promptTitle, { color: theme.text }]}>Account already exists</Text>
        <Text style={[styles.promptBody, { color: theme.text, opacity: 0.65 }]}>
          {identifier} is already registered. Sign in with that account to continue, or use a
          different email or mobile number.
        </Text>
        <TouchableOpacity
          style={[styles.promptPrimaryButton, { backgroundColor: theme.accent }]}
          onPress={onContinue}>
          <Text style={[styles.promptPrimaryText, { color: theme.onAccent }]}>Sign in to this account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.promptSecondaryButton} onPress={onDifferent}>
          <Text style={[styles.promptSecondaryText, { color: theme.text, opacity: 0.65 }]}>
            Use different email/mobile
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
