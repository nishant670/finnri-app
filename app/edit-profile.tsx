import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { cssInterop } from 'nativewind';
import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ThemedAlertDialog } from '@/components/ui/ThemedConfirmDialog';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
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

const TText = cssInterop(ThemedText, { className: 'style' });

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
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
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

  const cardColor = colorScheme === 'light' ? '#FFFFFF' : '#1E1E1E';
  const backgroundColor = colorScheme === 'light' ? '#F9F7FB' : theme.background;
  const isDark = colorScheme === 'dark';
  const sheetSurface = isDark ? theme.card : '#FFFFFF';
  const otpBoxSurface = isDark ? 'rgba(255,255,255,0.06)' : '#F7F7F9';
  const otpBoxBorder = isDark ? 'rgba(255,255,255,0.12)' : '#EDEDF1';
  const otpFilledBorder = isDark ? 'rgba(33,150,243,0.55)' : '#C9DFF5';

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
      <SafeAreaView className="flex-1" style={{ backgroundColor }}>
        <AppHeader title="Edit profile" onBack={() => router.back()} />

        <KeyboardAvoidingView
          // `adjustResize` already handles Android; see the note in AuthScreen2.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1">
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
            {/* Avatar Section */}
            <View className="items-center mt-6 mb-8">
              <View className="relative">
                {user?.profile_photo_uri ? (
                  <View className="w-36 h-36 rounded-full border-4 border-white overflow-hidden shadow-md">
                    <Image
                      source={{ uri: user.profile_photo_uri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View
                    accessible
                    accessibilityLabel="Profile monogram"
                    className="w-36 h-36 rounded-full border-4 border-white items-center justify-center shadow-md"
                    style={{ backgroundColor: theme.secondary }}>
                    <TText
                      className="text-5xl"
                      style={{ color: theme.accent, fontFamily: Fonts.title }}>
                      {monogram}
                    </TText>
                  </View>
                )}
                <Pressable
                  onPress={() => void handleChangePhoto()}
                  className="absolute bottom-1 right-1 w-10 h-10 rounded-full border-2 border-white items-center justify-center shadow-lg"
                  style={{ backgroundColor: theme.accent }}>
                  <MaterialCommunityIcons name="camera" size={20} color="white" />
                </Pressable>
              </View>
              <Pressable className="mt-4" onPress={() => void handleChangePhoto()}>
                <TText
                  className="text-sm font-bold tracking-widest"
                  style={{ color: theme.accent, fontFamily: Fonts.body }}>
                  CHANGE PHOTO
                </TText>
              </Pressable>
            </View>

            {/* Form Fields */}
            <View className="gap-6">
              {/* Name */}
              <View>
                <TText
                  className="text-xs font-bold opacity-60 mb-2 ml-4 uppercase"
                  style={{ fontFamily: Fonts.body }}>
                  What should we call you?
                </TText>
                <View
                  className="flex-row items-center px-4 h-16 rounded-[28px] shadow-sm"
                  style={{ backgroundColor: cardColor }}>
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#F3E5F5' }}>
                    <MaterialCommunityIcons name="account-outline" size={22} color="#7B1FA2" />
                  </View>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                    style={{ flex: 1, fontFamily: Fonts.body, fontSize: 14, color: theme.text }}
                  />
                </View>
              </View>

              {/* Email */}
              <View>
                <TText
                  className="text-xs font-bold opacity-60 mb-2 ml-4 uppercase"
                  style={{ fontFamily: Fonts.body }}>
                  Email
                </TText>
                <View
                  className="flex-row items-center px-4 h-16 rounded-[28px] shadow-sm"
                  style={{ backgroundColor: cardColor }}>
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#FFEBEE' }}>
                    <MaterialCommunityIcons name="email-outline" size={22} color="#D32F2F" />
                  </View>
                  {/*
                    Changing an email address has to be proved by an OTP, and
                    OTP sign-in is off. The address also *is* the Google
                    identity the account signs in with, so editing it here
                    could only ever disagree with the thing that actually
                    authenticates. Shown, not edited.
                  */}
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    editable={EMAIL_LOGIN_ENABLED}
                    placeholder={EMAIL_LOGIN_ENABLED ? 'Enter your email' : 'No email on this account'}
                    keyboardType="email-address"
                    style={{
                      flex: 1,
                      fontFamily: Fonts.body,
                      fontSize: 14,
                      color: theme.text,
                      opacity: EMAIL_LOGIN_ENABLED ? 1 : 0.6,
                    }}
                  />
                </View>
              </View>

              {/* Mobile */}
              {/*
                Changing a mobile number has to be proved by an OTP, and there
                is no SMS channel to carry one — the backend answers
                otp_channel_unavailable. An editable field that can never be
                saved is worse than no field, so it is hidden until SMS lands.
                The existing value is still submitted unchanged by
                performUpdate, so nothing is lost by not showing it.
              */}
              <View style={{ display: PHONE_IDENTIFIER_ENABLED ? 'flex' : 'none' }}>
                <TText
                  className="text-xs font-bold opacity-60 mb-2 ml-4 uppercase"
                  style={{ fontFamily: Fonts.body }}>
                  Mobile number
                </TText>
                <View
                  className="flex-row items-center px-4 h-16 rounded-[28px] shadow-sm"
                  style={{ backgroundColor: cardColor }}>
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#FFF3E0' }}>
                    <MaterialCommunityIcons name="phone-outline" size={22} color="#EF6C00" />
                  </View>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter your mobile number"
                    keyboardType="phone-pad"
                    style={{ flex: 1, fontFamily: Fonts.body, fontSize: 14, color: theme.text }}
                  />
                </View>
              </View>
            </View>

            {/* Info Callout */}
            <View
              className="flex-row p-5 rounded-[28px] mt-8 items-center"
              style={{ backgroundColor: theme.secondary }}>
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-4"
                style={{ backgroundColor: '#9575CD' }}>
                <MaterialCommunityIcons name="information-variant" size={20} color="white" />
              </View>
              <Text
                className="flex-1 text-xs leading-relaxed opacity-70"
                style={{ fontFamily: Fonts.body, color: theme.text }}>
                Keep these up to date so your account stays easy to recover.
              </Text>
            </View>

            {/* Update Button */}
            <Pressable
              onPress={handleUpdate}
              disabled={isLoading}
              className={`flex-row items-center justify-center h-18 rounded-[32px] mt-10 shadow-lg p-4 ${isLoading ? 'opacity-70' : ''}`}
              style={{ backgroundColor: theme.accent }}>
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={24}
                    color="white"
                    style={{ marginRight: 10 }}
                  />
                  <TText
                    className="text-base font-black text-white"
                    style={{ fontFamily: Fonts.title }}>
                    Save changes
                  </TText>
                </>
              )}
            </Pressable>

            {/* Footer Text */}
            <TText
              className="text-center text-[10px] font-bold tracking-widest opacity-30 mt-6 uppercase"
              style={{ fontFamily: Fonts.body }}>
              CHANGES TAKE EFFECT IMMEDIATELY
            </TText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* OTP Modal */}
      {/*
        * `avoidKeyboard` is what keeps the code field visible: the sheet lives
        * in its own Android window, which `adjustResize` never reaches, so
        * without it the number pad slid straight over the boxes being typed in.
        */}
      <AnimatedBottomSheet visible={showOtp} onClose={() => setShowOtp(false)} avoidKeyboard>
          <View
            className="rounded-t-[32px] p-8 pb-12 items-center"
            style={{ backgroundColor: sheetSurface }}>
            <View
              className="w-12 h-1 rounded-full mb-6"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.24)' : '#D5D0D8' }}
            />
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: isDark ? 'rgba(33,150,243,0.18)' : '#E3F2FD' }}>
              <MaterialCommunityIcons name="shield-check" size={32} color="#2196F3" />
            </View>
            <TText
              className="text-lg font-bold mb-2 text-center"
              style={{ fontFamily: Fonts.title }}>
              {"Verify It's You"}
            </TText>
            <TText className="text-center opacity-60 mb-8" style={{ fontFamily: Fonts.body }}>
              We sent a code to {verifyingIdentifier}.{'\n'}Enter it below to confirm this change.
            </TText>

            {/*
              * One input behind six boxes rather than a single free-text field:
              * the boxes say how many digits are expected without a placeholder
              * having to imply it, and the real caret stays hidden so it can
              * never sit off to one side of centred text.
              */}
            <Pressable
              accessibilityRole="none"
              className="w-full mb-6"
              onPress={() => otpInputRef.current?.focus()}>
              <View className="flex-row justify-between">
                {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                  const digit = otpCode[index] ?? '';
                  const isCaret =
                    otpFocused &&
                    (index === otpCode.length ||
                      (otpCode.length === OTP_LENGTH && index === OTP_LENGTH - 1));
                  return (
                    <View
                      key={index}
                      className="h-16 flex-1 mx-1 rounded-2xl items-center justify-center border"
                      style={{
                        backgroundColor: otpBoxSurface,
                        borderColor: isCaret ? '#2196F3' : digit ? otpFilledBorder : otpBoxBorder,
                        borderWidth: isCaret ? 2 : 1,
                      }}>
                      <Text
                        style={{ fontFamily: Fonts.title, fontSize: 22, color: theme.text }}>
                        {digit}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <TextInput
                ref={otpInputRef}
                value={otpCode}
                onChangeText={(text) =>
                  setOtpCode(text.replace(/\D/g, '').slice(0, OTP_LENGTH))
                }
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                caretHidden
                autoFocus
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0,
                }}
              />
            </Pressable>

            <Pressable
              onPress={verifyOtp}
              disabled={isVerifying || otpCode.length < OTP_LENGTH}
              className="w-full h-14 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: '#2196F3',
                opacity: isVerifying || otpCode.length < OTP_LENGTH ? 0.6 : 1,
              }}>
              {isVerifying ? (
                <ActivityIndicator color="white" />
              ) : (
                <TText
                  className="text-white font-bold text-base"
                  style={{ fontFamily: Fonts.title }}>
                  Verify and save
                </TText>
              )}
            </Pressable>

            <Pressable onPress={() => setShowOtp(false)} className="p-2">
              <TText className="opacity-50 text-sm" style={{ fontFamily: Fonts.body }}>
                Cancel
              </TText>
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
