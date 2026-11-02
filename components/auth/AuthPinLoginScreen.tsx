import { Colors } from '@/constants/theme';
import { categoryTile } from '@/lib/categories';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { styles } from './styles';
import { ScreenProps } from './types';

import { useAuthStore } from '@/hooks/use-auth-store';
import * as LocalAuthentication from 'expo-local-authentication';

export const AuthPinLoginScreen = ({
  onContinue,
  onSecondary,
  onForgotPin,
  errorMessage,
  isLoading,
}: ScreenProps) => {
  const { user } = useAuthStore();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  // The illustration's pastel tiles, dimmed for a dark page the way category
  // tiles are; the fixed pastels glared there.
  const tileFill = (color: string, bgColor: string) => categoryTile({ color, bgColor }, colorScheme).background;
  const tileInk = (color: string, bgColor: string) => categoryTile({ color, bgColor }, colorScheme).foreground;
  const [pin, setPin] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const displayError = localError || errorMessage;

  React.useEffect(() => {
    if (errorMessage) {
      setPin('');
    }
  }, [errorMessage]);

  const handleBiometricAuth = async () => {
    try {
      setLocalError(null);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setLocalError('Biometrics not available or not set up on this device.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login with Biometrics',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        onContinue('biometric_success');
      }
    } catch {
      setLocalError('Biometric authentication failed.');
    }
  };

  const handleDigitPress = (digit: string) => {
    if (pin.length >= 4 || isLoading) {
      return;
    }
    const nextPin = `${pin}${digit}`;
    setPin(nextPin);
    if (nextPin.length === 4) {
      onContinue(nextPin);
    }
  };

  const handleBackspace = () => {
    if (!pin.length || isLoading) {
      return;
    }
    setPin(pin.slice(0, -1));
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.authScrollContent, { flexGrow: 1, justifyContent: 'center' }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.textSection}>
        <Text style={[styles.title, { color: theme.text }]}>Welcome back!</Text>
        <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6 }]}>
          Enter your PIN to access finnri
        </Text>
      </View>

      <View style={styles.pinDotsRow}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.pinDot,
              {
                borderColor: theme.border,
                backgroundColor: pin.length > index ? theme.accent : theme.card,
              },
            ]}
          />
        ))}
      </View>

      {onForgotPin ? (
        <TouchableOpacity
          style={styles.forgotPinButton}
          onPress={onForgotPin}
          disabled={isLoading}
        >
          <Text style={[styles.forgotPinText, { color: theme.accent }]}>Forgot PIN?</Text>
        </TouchableOpacity>
      ) : null}

      {user?.biometrics_enabled && (
        <TouchableOpacity
          style={styles.faceIdButton}
          onPress={handleBiometricAuth}
          disabled={isLoading}
        >
          <View style={[styles.faceIdIconBox, { backgroundColor: tileFill('#E64A19', '#FFF4F1') }]}>
            <MaterialCommunityIcons name="face-recognition" size={22} color={tileInk('#E64A19', '#FFF4F1')} />
          </View>
          <Text style={[styles.faceIdText, { color: theme.text }]}>Login with Biometrics</Text>
        </TouchableOpacity>
      )}

      {/* Error Display */}
      {displayError ? (
        <View style={[styles.smartErrorContainer, { marginTop: 20 }]}>
          <View style={styles.errorIconBox}>
            <MaterialCommunityIcons name="alert-circle" size={18} color="#D32F2F" />
          </View>
          <Text style={styles.smartErrorText} numberOfLines={2}>
            {displayError}
          </Text>
        </View>
      ) : null}

      {/* Loading Indicator */}
      {isLoading && (
        <View style={{ marginTop: 20 }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      )}

      <View style={styles.keypadGrid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <TouchableOpacity
            key={digit}
            style={styles.keypadButton}
            onPress={() => handleDigitPress(digit)}
            disabled={isLoading}
          >
            <Text style={[styles.keypadDigit, { color: theme.text }]}>{digit}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.keypadButton} onPress={() => onSecondary?.()} disabled={isLoading}>
          <Text style={[styles.keypadHelper, { color: theme.text, opacity: 0.5 }]}>
            Switch{'\n'}Account
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.keypadButton} onPress={() => handleDigitPress('0')} disabled={isLoading}>
          <Text style={[styles.keypadDigit, { color: theme.text }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.keypadButton} onPress={handleBackspace} disabled={isLoading}>
          <MaterialCommunityIcons name="backspace-outline" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
