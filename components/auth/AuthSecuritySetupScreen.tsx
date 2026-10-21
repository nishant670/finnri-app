import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AuthPinSetupScreen } from './AuthPinSetupScreen';
import { styles } from './styles';
import { ScreenProps } from './types';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { HapticSwitch } from '@/components/ui/HapticSwitch';

type AuthSecuritySetupProps = ScreenProps & {
  /** Copy for the confirm button. "Continue" while signing up, "Done" later. */
  continueLabel?: string;
};

/**
 * PIN and biometrics, both optional. The PIN was previously mandatory while the
 * copy called it optional; the button now works with no PIN set and says what it
 * will do, because a lock nobody chose is a lock nobody remembers.
 */
export const AuthSecuritySetupScreen = ({
  onContinue,
  onSecondary,
  isLoading,
  errorMessage: externalError,
  continueLabel = 'Continue',
}: AuthSecuritySetupProps) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [biometricsEnabled, setBiometricsEnabled] = React.useState(false);
  const [isCheckingBiometrics, setIsCheckingBiometrics] = React.useState(false);
  const [pinConfigured, setPinConfigured] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [isSettingPin, setIsSettingPin] = React.useState(false);
  const [pin, setPin] = React.useState<string | null>(null);

  const displayError = localError || externalError;

  const handleBiometricsToggle = async (nextValue: boolean) => {
    setLocalError(null);
    if (!nextValue) {
      setBiometricsEnabled(false);
      return;
    }

    // Biometrics is a shortcut past the PIN, so it needs one behind it. Without
    // a fallback, a failed scan leaves the user staring at a keypad that will
    // never accept anything.
    if (!pinConfigured) {
      setLocalError('Set a PIN first — it is the fallback when biometrics fail.');
      setBiometricsEnabled(false);
      return;
    }

    setIsCheckingBiometrics(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        setLocalError('Biometrics not available on this device.');
        setBiometricsEnabled(false);
        return;
      }
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        setLocalError('No biometrics enrolled. Set up Face ID or Touch ID first.');
        setBiometricsEnabled(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your biometrics to continue',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setBiometricsEnabled(true);
      } else {
        setLocalError('Biometric verification failed.');
        setBiometricsEnabled(false);
      }
    } catch (error) {
      setLocalError(getFriendlyErrorMessage(error, 'Unable to verify biometrics.'));
      setBiometricsEnabled(false);
    } finally {
      setIsCheckingBiometrics(false);
    }
  };

  const handlePinComplete = (newPin: string) => {
    setPin(newPin);
    setPinConfigured(true);
    setIsSettingPin(false);
    setLocalError(null);
  };

  if (isSettingPin) {
    return (
      <AuthPinSetupScreen
        onComplete={handlePinComplete}
        onCancel={() => setIsSettingPin(false)}
        isLoading={isLoading}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.authScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <View style={styles.imageContainer}>
            <View style={styles.glowCircle} />
            <View style={[styles.mainCircle, { borderColor: theme.border }]}>
              <View style={[styles.iconBox, { backgroundColor: '#FFCCBC' }]}>
                <MaterialCommunityIcons name="shield-lock" size={40} color="#E64A19" />
              </View>
              <View style={[styles.smallIcon, styles.pos1, { backgroundColor: '#E1F5FE' }]}>
                <MaterialCommunityIcons name="fingerprint" size={16} color="#03A9F4" />
              </View>
              <View style={[styles.smallIcon, styles.pos2, { backgroundColor: '#E8F5E9' }]}>
                <MaterialCommunityIcons name="dialpad" size={16} color="#4CAF50" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.textSection}>
          <Text style={[styles.title, { color: theme.text, fontSize: 26 }]}>Protect your Finnri data</Text>
          <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6 }]}>
            A PIN or Biometrics keeps your spending records private on this device. Both are
            optional — you can add them later from Settings.
          </Text>
        </View>

        <View style={styles.securityOptionsSection}>
          <View style={[styles.securityCard, { backgroundColor: 'white' }]}>
            <View style={[styles.securityIconBox, { backgroundColor: '#F3E5F5' }]}>
              <MaterialCommunityIcons name="face-recognition" size={24} color="#7B1FA2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityTitle, { color: theme.text }]}>Biometrics</Text>
              <Text style={[styles.securitySubtitle, { color: theme.text, opacity: 0.4 }]}>
                Use Face ID or Touch ID
              </Text>
            </View>
            <HapticSwitch
              value={biometricsEnabled}
              onValueChange={handleBiometricsToggle}
              trackColor={{ false: '#f4f3f4', true: theme.accent }}
              thumbColor="white"
              disabled={isCheckingBiometrics}
            />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={pinConfigured ? 'Change your PIN' : 'Set up a PIN'}
            style={[styles.securityCard, { backgroundColor: 'white', marginTop: 12 }]}
            onPress={() => {
              setIsSettingPin(true);
              setLocalError(null);
            }}
          >
            <View style={[styles.securityIconBox, { backgroundColor: pinConfigured ? '#E8F5E9' : '#FFEBEE' }]}>
              <MaterialCommunityIcons
                name={pinConfigured ? "check-circle" : "dialpad"}
                size={24}
                color={pinConfigured ? "#2E7D32" : "#C62828"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityTitle, { color: theme.text }]}>
                {pinConfigured ? "PIN Configured" : "Set up a PIN"}
              </Text>
              <Text style={[styles.securitySubtitle, { color: theme.text, opacity: 0.4 }]}>
                {pinConfigured ? 'You can change your PIN here' : 'Create a 4-digit code — optional'}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.text}
              style={{ opacity: 0.3 }}
            />
          </TouchableOpacity>
        </View>
        {isCheckingBiometrics ? <ActivityIndicator color={theme.accent} /> : null}
        {displayError ? (
          <View style={styles.smartErrorContainer}>
            <View style={styles.errorIconBox}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
            </View>
            <Text style={styles.smartErrorText} numberOfLines={2}>
              {displayError}
            </Text>
          </View>
        ) : null}

        <View style={styles.buttonSection}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              styles.primaryButton,
              { backgroundColor: theme.accent, opacity: isLoading ? 0.6 : 1 },
            ]}
            disabled={isLoading}
            onPress={() => onContinue({ pin: pinConfigured ? pin : null, biometricsEnabled })}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>
                {pinConfigured ? continueLabel : 'Set up later'}
              </Text>
            )}
          </TouchableOpacity>

          {onSecondary ? (
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.textButton}
              onPress={onSecondary}
              disabled={isLoading}
            >
              <Text style={[styles.textButtonText, { color: theme.text, opacity: 0.6 }]}>
                Back
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};
