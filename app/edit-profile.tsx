import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { ThemedAlertDialog } from '@/components/ui/ThemedConfirmDialog';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  updateProfile,
  authOtpSend,
  authOtpVerify,
  getFriendlyAuthErrorMessage,
  PHONE_IDENTIFIER_ENABLED,
  EMAIL_LOGIN_ENABLED,
} from '@/lib/auth';
import { getMonogram } from '@/lib/monogram';


/** The backend issues six-digit codes; the boxes on screen have to say so. */
const OTP_LENGTH = 6;

type AlertState = {
  title: string;
  message: string;
  tone?: 'info' | 'success' | 'danger';
  onDismiss?: () => void;
};

export default function EditProfileScreen() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { user, token, updateUser } = useAuthStore();

  const [name, setName] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isLoading, setIsLoading] = useState(false);
  // Off the field rather than off the stored user, so the monogram follows the
  // name as it is typed — it is the same identity being edited.
  const monogram = getMonogram(name || user?.username);

  // OTP State
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [verifyingIdentifier, setVerifyingIdentifier] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  // Every message this screen raises goes through the themed dialog rather than
  // `Alert.alert`, so the flow never ends on a stock system box.
  const [alert, setAlert] = useState<AlertState | null>(null);
  const showAlert = useCallback((next: AlertState) => setAlert(next), []);
  const dismissAlert = useCallback(() => {
    const onDismiss = alert?.onDismiss;
    setAlert(null);
    onDismiss?.();
  }, [alert]);

  const handleChangePhoto = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        showAlert({
          title: 'Photo not selected',
          message: 'Please choose an image file to use as your profile photo.',
        });
        return;
      }

      if (!FileSystem.documentDirectory) {
        updateUser({ profile_photo_uri: asset.uri });
        return;
      }

      const profileDir = `${FileSystem.documentDirectory}profile/`;
      const extension = (asset.name?.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const photoUri = `${profileDir}avatar-${user?.uuid ?? 'local'}-${Date.now()}.${extension}`;
      await FileSystem.makeDirectoryAsync(profileDir, { intermediates: true });
      await FileSystem.copyAsync({ from: asset.uri, to: photoUri });

      const previousPhoto = user?.profile_photo_uri;
      updateUser({ profile_photo_uri: photoUri });
      if (previousPhoto?.startsWith(profileDir) && previousPhoto !== photoUri) {
        await FileSystem.deleteAsync(previousPhoto, { idempotent: true });
      }
    } catch {
      showAlert({
        title: 'Photo not updated',
        message: 'Unable to select that image right now.',
        tone: 'danger',
      });
    }
  };

  const handleUpdate = async () => {
    if (!name.trim()) {
      showAlert({ title: 'Add your name', message: "Your name can't be blank.", tone: 'danger' });
      return;
    }
    if (!token) return;

    const emailChanged = (user?.email || '') !== email.trim();
    const phoneChanged = (user?.phone || '') !== phone.trim();

    if (emailChanged && phoneChanged) {
      showAlert({
        title: 'One at a time',
        message: 'For your security, change your email and phone number one at a time.',
      });
      return;
    }

    if (emailChanged && email.trim() !== '') {
      setVerifyingIdentifier(email.trim());
      triggerOtp(email.trim());
      return;
    }

    if (phoneChanged && phone.trim() !== '') {
      setVerifyingIdentifier(phone.trim());
      triggerOtp(phone.trim());
      return;
    }

    // Proceed without OTP if only name changed or fields cleared (if allowed)
    performUpdate();
  };

  const triggerOtp = async (identifier: string) => {
    setIsLoading(true);
    try {
      await authOtpSend(identifier);
      setOtpCode('');
      setShowOtp(true);
    } catch (error) {
      // "Failed to send OTP" covered a provider outage, a throttled resend and
      // an unsupported channel alike, and told the user nothing about which.
      showAlert({
        title: "Code not sent",
        message: getFriendlyAuthErrorMessage(error, "We couldn't send your code. Try again in a moment."),
        tone: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length < OTP_LENGTH) {
      showAlert({
        title: 'Enter the code',
        message: `Enter the ${OTP_LENGTH}-digit code we sent you.`,
        tone: 'danger',
      });
      return;
    }
    setIsVerifying(true);
    try {
      const res = await authOtpVerify(verifyingIdentifier, otpCode);
      setShowOtp(false);
      setOtpCode('');
      performUpdate(res.claim_token);
    } catch {
      showAlert({ title: 'Code didn’t match', message: "That code didn't work. Check it and try again.", tone: 'danger' });
    } finally {
      setIsVerifying(false);
    }
  };

  const performUpdate = async (claimToken?: string) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await updateProfile({
        token,
        username: name,
        email: email.trim(),
        phone: phone.trim(),
        claim_token: claimToken,
      });
      updateUser(result.user);
      showAlert({
        title: 'Saved',
        message: 'Your profile is up to date.',
        tone: 'success',
        onDismiss: () => router.back(),
      });
    } catch (error: any) {
      // Handle specific errors
      const msg = getFriendlyErrorMessage(error, "Couldn't save your profile. Try again.");
      if (msg.includes('Username is already taken')) {
        showAlert({
          title: 'Username taken',
          message: 'This username is already in use. Please choose another.',
          tone: 'danger',
        });
      } else if (msg.includes('verification required')) {
        showAlert({ title: 'Verify it’s you', message: msg, tone: 'danger' });
      } else {
        showAlert({ title: 'Not saved', message: msg, tone: 'danger' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Edit profile" onBack={() => router.back()} />

        <KeyboardAvoidingView
          // `adjustResize` already handles Android; see the note in AuthScreen2.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}>
            <View style={styles.avatarBlock}>
              {user?.profile_photo_uri ? (
                <Image source={{ uri: user.profile_photo_uri }} style={styles.avatar} resizeMode="cover" />
              ) : (
                <View
                  accessible
                  accessibilityLabel="Profile monogram"
                  style={[styles.avatar, styles.monogram, { backgroundColor: colors.selectedFill }]}>
                  <ThemedText style={[styles.monogramText, { color: colors.text }]}>{monogram}</ThemedText>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleChangePhoto()}
                hitSlop={6}
                style={styles.changePhoto}>
                <MaterialCommunityIcons name="camera-outline" size={18} color={colors.text} />
                <ThemedText style={[styles.changePhotoLabel, { color: colors.text }]}>Change photo</ThemedText>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.row}>
                <ThemedText tone="muted" style={styles.rowLabel}>
                  Your name
                </ThemedText>
                <TextInput
                  accessibilityLabel="Your name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.text }]}
                />
              </View>

              {/*
                Changing an email address has to be proved by an OTP, and OTP
                sign-in is off. The address also *is* the Google identity the
                account signs in with, so editing it here could only ever
                disagree with the thing that actually authenticates. Shown as
                text with a lock, not as a faded field that looks broken.
              */}
              {EMAIL_LOGIN_ENABLED ? (
                <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <ThemedText tone="muted" style={styles.rowLabel}>
                    Email
                  </ThemedText>
                  <TextInput
                    accessibilityLabel="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={[styles.input, { color: colors.text }]}
                  />
                </View>
              ) : (
                <View style={[styles.row, styles.readOnlyRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <ThemedText tone="muted" style={styles.rowLabel}>
                    Email
                  </ThemedText>
                  <View style={styles.readOnly}>
                    <ThemedText numberOfLines={1} style={[styles.readOnlyValue, { color: colors.text }]}>
                      {email || 'No email on this account'}
                    </ThemedText>
                    {email ? (
                      <ThemedText tone="muted" style={styles.caption}>
                        From your Google sign-in
                      </ThemedText>
                    ) : null}
                  </View>
                  <MaterialCommunityIcons name="lock-outline" size={16} color={colors.muted} />
                </View>
              )}

              {/*
                Changing a mobile number has to be proved by an OTP, and there
                is no SMS channel to carry one — the backend answers
                otp_channel_unavailable. An editable field that can never be
                saved is worse than no field, so it is hidden until SMS lands.
                The existing value is still submitted unchanged by
                performUpdate, so nothing is lost by not showing it.
              */}
              {PHONE_IDENTIFIER_ENABLED ? (
                <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <ThemedText tone="muted" style={styles.rowLabel}>
                    Mobile
                  </ThemedText>
                  <TextInput
                    accessibilityLabel="Mobile number"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter your mobile number"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    style={[styles.input, { color: colors.text }]}
                  />
                </View>
              ) : null}
            </View>

            <ThemedText tone="muted" style={styles.note}>
              Keep these up to date so your account stays easy to recover.
            </ThemedText>
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <PrimaryButton label="Save changes" loading={isLoading} onPress={() => void handleUpdate()} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* OTP Modal */}
      {/*
        * `avoidKeyboard` is what keeps the code field visible: the sheet lives
        * in its own Android window, which `adjustResize` never reaches, so
        * without it the number pad slid straight over the boxes being typed in.
        */}
      <AnimatedBottomSheet visible={showOtp} onClose={() => setShowOtp(false)} avoidKeyboard>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
            <View style={[styles.sheetIcon, { backgroundColor: colors.selectedFill }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={26} color={colors.text} />
            </View>
            <ThemedText accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
              Verify it’s you
            </ThemedText>
            <ThemedText tone="muted" style={styles.sheetBody}>
              We sent a code to {verifyingIdentifier}.{'\n'}Enter it below to confirm this change.
            </ThemedText>

            {/*
              * One input behind six boxes rather than a single free-text field:
              * the boxes say how many digits are expected without a placeholder
              * having to imply it, and the real caret stays hidden so it can
              * never sit off to one side of centred text.
              */}
            <Pressable
              accessibilityRole="none"
              style={styles.otpWrap}
              onPress={() => otpInputRef.current?.focus()}>
              <View style={styles.otpRow}>
                {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                  const digit = otpCode[index] ?? '';
                  const isCaret =
                    otpFocused &&
                    (index === otpCode.length ||
                      (otpCode.length === OTP_LENGTH && index === OTP_LENGTH - 1));
                  return (
                    <View
                      key={index}
                      style={[
                        styles.otpBox,
                        {
                          backgroundColor: colors.card,
                          borderColor: isCaret ? colors.text : digit ? colors.borderStrong : colors.border,
                          borderWidth: isCaret ? 2 : 1,
                        },
                      ]}>
                      <Text style={[styles.otpDigit, { color: colors.text }]}>{digit}</Text>
                    </View>
                  );
                })}
              </View>
              <TextInput
                ref={otpInputRef}
                value={otpCode}
                onChangeText={(text) => setOtpCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                caretHidden
                autoFocus
                style={styles.otpInput}
              />
            </Pressable>

            <PrimaryButton
              label="Verify and save"
              loading={isVerifying}
              disabled={isVerifying || otpCode.length < OTP_LENGTH}
              onPress={() => void verifyOtp()}
              style={styles.fullWidth}
            />
            <Pressable accessibilityRole="button" onPress={() => setShowOtp(false)} style={styles.cancel}>
              <ThemedText style={[styles.cancelLabel, { color: colors.text }]}>Cancel</ThemedText>
            </Pressable>
          </View>
      </AnimatedBottomSheet>

      <ThemedAlertDialog
        visible={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        tone={alert?.tone ?? 'info'}
        onDismiss={dismissAlert}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 4,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  monogram: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  changePhoto: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  changePhotoLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  readOnlyRow: {
    minHeight: 64,
    paddingVertical: 8,
  },
  rowLabel: {
    width: 96,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    padding: 0,
    fontSize: 15,
    fontWeight: '500',
  },
  readOnly: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  readOnlyValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  note: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  sheet: {
    alignItems: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginVertical: 8,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  sheetBody: {
    marginTop: 6,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  otpWrap: {
    width: '100%',
    marginBottom: 20,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  otpInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  cancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
});
