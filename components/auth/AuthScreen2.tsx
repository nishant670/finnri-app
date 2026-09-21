import { PHONE_IDENTIFIER_ENABLED } from '@/lib/auth';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { GoogleGlyph } from './GoogleGlyph';
import { styles } from './styles';
import { ScreenProps } from './types';

type AuthScreen2Props = ScreenProps & {
  errorMessage?: string | null;
  isLoading?: boolean;
  onInputChange?: () => void;
  secondaryLabel?: string;
  /**
   * Google sign-in used to live only on Welcome, which a guest never sees: the
   * upgrade path enters this screen directly from Profile, so the one account
   * type most likely to want a one-tap sign-in was the one type that could not
   * reach it. Omitted, the button is not drawn — callers that have no Google
   * flow to offer keep the plain email/mobile screen.
   */
  onGoogle?: () => void;
  isGoogleLoading?: boolean;
};

export const AuthScreen2 = ({
  onContinue,
  onSecondary,
  errorMessage,
  isLoading,
  onInputChange,
  secondaryLabel = 'Continue as Guest',
  onGoogle,
  isGoogleLoading,
}: AuthScreen2Props) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [input, setInput] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const isBusy = !!isLoading || !!isGoogleLoading;

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isValidPhone = (value: string) => /^\d{10}$/.test(value);
  const normalizedInput = input.trim();
  const isEmail = isValidEmail(normalizedInput);
  const isPhone = isValidPhone(normalizedInput);
  const isValid = isEmail || (PHONE_IDENTIFIER_ENABLED && isPhone);

  const identifierPlaceholder = PHONE_IDENTIFIER_ENABLED
    ? 'Email address or mobile number'
    : 'Email address';
  // Someone who typed ten digits has not made a typo — they have chosen a
  // channel that does not exist yet. Telling them "that is invalid" would send
  // them back to correct a number that was already correct.
  const invalidIdentifierMessage =
    !PHONE_IDENTIFIER_ENABLED && isPhone
      ? 'Codes by SMS are not available yet. Please use an email address.'
      : PHONE_IDENTIFIER_ENABLED
        ? 'Enter a valid 10-digit mobile number or email.'
        : 'Enter a valid email address.';

  const showValidationError = touched && normalizedInput.length > 0 && !isValid;
  const mergedErrorMessage =
    showValidationError && !localError
      ? invalidIdentifierMessage
      : localError || errorMessage || null;

  const handleInputChange = (value: string) => {
    setTouched(false);
    setLocalError(null);
    onInputChange?.();
    setInput(value);
  };

  const handleContinue = () => {
    setTouched(true);
    if (!isValid) {
      setLocalError(invalidIdentifierMessage);
      return;
    }
    onContinue(isPhone ? normalizedInput : normalizedInput.toLowerCase());
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // Android's manifest already declares `adjustResize`, so the window is
      // resized for the keyboard before this component sees it. `height` then
      // subtracts the keyboard a second time, and the layout it settles on is
      // not the one on screen when the touch starts — which is why a tap on a
      // button near the keyboard lands on nothing and has to be repeated. The
      // rest of the app passes `undefined` here for exactly that reason.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.topSection}>
            <View style={styles.imageContainer}>
              <View style={styles.glowCircle} />
              <View style={[styles.mainCircle, { borderColor: theme.border }]}>
                <View style={[styles.iconBox, { backgroundColor: '#FFCCBC' }]}>
                  <MaterialCommunityIcons name="lock" size={30} color="#E64A19" />
                </View>
                <View style={[styles.smallIcon, styles.pos1, { backgroundColor: '#BBDEFB' }]}>
                  <MaterialCommunityIcons name="account-group" size={12} color="#1976D2" />
                </View>
                <View style={[styles.smallIcon, styles.pos2, { backgroundColor: '#FFF9C4' }]}>
                  <MaterialCommunityIcons name="database" size={12} color="#FBC02D" />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.textSection}>
            <Text style={[styles.title, { color: theme.text }]}>Sign in to save your progress</Text>
            <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6 }]}>
              Sync your data securely across devices.
            </Text>
          </View>

          <View style={styles.formSection}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.border, color: theme.text }]}
              placeholder={identifierPlaceholder}
              keyboardType={PHONE_IDENTIFIER_ENABLED ? 'default' : 'email-address'}
              placeholderTextColor={theme.text + '66'}
              value={input}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={handleInputChange}
              onBlur={() => setTouched(true)}
            />
            {mergedErrorMessage ? (
              <View style={styles.smartErrorContainer}>
                <View style={styles.errorIconBox}>
                  <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
                </View>
                <Text style={styles.smartErrorText} numberOfLines={2}>
                  {mergedErrorMessage}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.buttonSection}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.primaryButton,
                { backgroundColor: theme.accent, opacity: isValid && !isBusy ? 1 : 0.6 },
              ]}
              disabled={!isValid || isBusy}
              onPress={handleContinue}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </TouchableOpacity>

            {onGoogle ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.dividerText, { color: theme.text, opacity: 0.4 }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>

                <TouchableOpacity
                  accessibilityRole="button"
                  style={[
                    styles.googleButton,
                    { borderColor: theme.border, opacity: isBusy ? 0.6 : 1 },
                  ]}
                  disabled={isBusy}
                  onPress={onGoogle}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color={theme.text} />
                  ) : (
                    <>
                      <View style={styles.googleMark}>
                        <GoogleGlyph size={20} />
                      </View>
                      <Text style={[styles.googleButtonText, { color: theme.text }]}>
                        Continue with Google
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Play's user-generated content policy wants the terms
                    accepted before anyone can create content other members
                    will see — a shared split group is exactly that. The links
                    open in a browser sheet rather than leaving the app. */}
                <Text
                  style={{
                    marginTop: 18,
                    textAlign: 'center',
                    fontSize: 12,
                    lineHeight: 18,
                    color: theme.text,
                    opacity: 0.55,
                  }}>
                  By continuing you agree to our{' '}
                  <Text
                    accessibilityRole="link"
                    style={{ textDecorationLine: 'underline' }}
                    onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}>
                    Terms
                  </Text>{' '}
                  and{' '}
                  <Text
                    accessibilityRole="link"
                    style={{ textDecorationLine: 'underline' }}
                    onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}>
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.textButton}
              disabled={isBusy}
              onPress={() => onSecondary?.()}
            >
              <Text style={[styles.textButtonText, { color: theme.text, opacity: 0.6 }]}>
                {secondaryLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
