import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthOtpSendError, authOtpSend, getFriendlyAuthErrorMessage } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/transactions';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';

import { styles } from './styles';
import { ScreenProps } from './types';

/**
 * What a verified OTP is worth: the claim token, and the moment it stops being
 * one. The expiry rides along so the flow can persist the token and know, on
 * resume, whether it is still worth resuming into.
 */
export type ClaimTokenResult = {
  claimToken: string;
  expiresAt: number | null;
};

type AuthOtpProps = Omit<ScreenProps, 'onContinue'> & {
  data?: string;
  onContinue: (result: ClaimTokenResult) => void;
  /** Copy for the confirm button — "Verify" while signing up, "Sign in" on return. */
  continueLabel?: string;
};

export const AuthOTPVerificationScreen = ({
  onContinue,
  onSecondary,
  data,
  continueLabel = 'Verify',
}: AuthOtpProps) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [otp, setOtp] = React.useState(['', '', '', '', '', '']);
  const [timer, setTimer] = React.useState(45);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const inputRefs = React.useRef<(TextInput | null)[]>([]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (text: string, index: number) => {
    setErrorMessage(null);
    const newOtp = [...otp];

    if (text.length > 1) {
      const pastedDigits = text.replace(/\D/g, '').slice(0, otp.length - index).split('');
      pastedDigits.forEach((digit, pastedIndex) => {
        newOtp[index + pastedIndex] = digit;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + pastedDigits.length, otp.length - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = text.replace(/\D/g, '').slice(-1);
    setOtp(newOtp);

    if (newOtp[index] && index < otp.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (event: { nativeEvent: { key: string } }, index: number) => {
    if (event.nativeEvent.key !== 'Backspace') {
      return;
    }

    setErrorMessage(null);
    const newOtp = [...otp];

    if (newOtp[index]) {
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    if (index > 0) {
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!data) {
      setErrorMessage('Missing email or phone number.');
      return;
    }
    if (!otp.every((digit) => digit !== '')) {
      setErrorMessage('Enter the 6-digit code.');
      return;
    }
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/auth/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: data, otp: otp.join('') }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Unable to verify code right now.');
      }
      const result = (await response.json()) as { claim_token: string; expires_at?: string };
      const expiresAt = result.expires_at ? Date.parse(result.expires_at) : NaN;
      onContinue({
        claimToken: result.claim_token,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      });
    } catch (error) {
      setErrorMessage(getFriendlyAuthErrorMessage(error, 'Unable to verify code.'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!data || timer > 0 || isResending) {
      return;
    }

    setIsResending(true);
    setErrorMessage(null);
    try {
      await authOtpSend(data);
      setTimer(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (error) {
      // The server keeps its own per-address cooldown, and it is the one that
      // decides. If it says wait, restart the local timer from its number
      // rather than leaving the button live and inviting another rejection.
      if (error instanceof AuthOtpSendError && error.retryAfterSeconds) {
        setTimer(error.retryAfterSeconds);
      }
      setErrorMessage(getFriendlyAuthErrorMessage(error, 'Unable to resend code.'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    // `KeyboardAvoidingView` used to wrap this screen, on the reasoning that
    // Android's `adjustResize` had already resized the window so the component
    // needed no Android behavior of its own. That stopped being true when the
    // app moved to Expo 57 / RN 0.86, where Android edge-to-edge is mandatory
    // and `adjustResize` no longer resizes anything — leaving the wrapper a
    // no-op and the keypad squarely on top of the six code boxes, on the one
    // screen a user cannot skip.
    <KeyboardAvoidingScreen
      style={{ flex: 1 }}
      contentContainerStyle={[styles.authScrollContent, { flexGrow: 1, justifyContent: 'center' }]}
      showsVerticalScrollIndicator={false}
    >
        <View style={styles.topSection}>
          <View style={styles.imageContainer}>
            <View style={styles.glowCircle} />
            <View style={[styles.mainCircle, { borderColor: theme.border }]}>
              <View style={[styles.iconBox, { backgroundColor: '#FFCCBC' }]}>
                <MaterialCommunityIcons name="email" size={30} color="#E64A19" />
              </View>
              <View style={[styles.smallIcon, styles.pos1, { backgroundColor: '#BBDEFB' }]}>
                <MaterialCommunityIcons name="tag" size={12} color="#1976D2" />
              </View>
              <View style={[styles.smallIcon, styles.pos2, { backgroundColor: '#C8E6C9' }]}>
                <MaterialCommunityIcons name="lock-clock" size={12} color="#43A047" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.textSection}>
          <Text style={[styles.title, { color: theme.text }]}>A quick check!</Text>
          <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6 }]}>
            {"We've sent a 6-digit code to"}
          </Text>
          <Text style={[styles.subtitle, { color: theme.text, fontWeight: 'bold' }]}>
            {data || '+91 98XXX XXXXX'}
          </Text>
        </View>

        <View style={styles.otpSection}>
          {otp.map((digit, index) => (
            <View
              key={index}
              style={[styles.otpInput, { backgroundColor: 'white', borderColor: theme.border }]}
            >
              <TextInput
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.otpText, { color: theme.text }]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(text) => handleOtpChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
              />
            </View>
          ))}
        </View>

        <View style={styles.resendSection}>
          <View style={styles.resendRow}>
            <Text style={[styles.footerText, { color: theme.text, opacity: 0.6 }]}>
              {"Didn't get the code?"}
            </Text>
            <TouchableOpacity onPress={handleResend} disabled={timer > 0 || isResending}>
              <Text style={[styles.resendText, { color: theme.accent }]}>
                {isResending ? 'Sending...' : timer > 0 ? `Resend in ${formatTime(timer)}` : 'Resend now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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

        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                backgroundColor: theme.accent,
                opacity: otp.every((d) => d !== '') && !isVerifying ? 1 : 0.6,
              },
            ]}
            disabled={!otp.every((d) => d !== '') || isVerifying}
            onPress={handleVerify}
          >
            {isVerifying ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>{continueLabel}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.textButton} onPress={() => onSecondary?.()}>
            <Text style={[styles.textButtonText, { color: theme.text, opacity: 0.6 }]}>
              Change Number/Email
            </Text>
          </TouchableOpacity>
        </View>
    </KeyboardAvoidingScreen>
  );
};
