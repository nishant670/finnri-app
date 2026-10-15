import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { cssInterop } from 'nativewind';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { Colors, Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { deleteUserAccount, getFriendlyAuthErrorMessage, revokeAllSessions } from '@/lib/auth';
import { deleteLocalSecurityPin, hasLocalSecurityPin } from '@/lib/security';

const TText = cssInterop(ThemedText, { className: 'style' });

export default function SecurityScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();
  const { user, token, updateUser, clearAuth } = useAuthStore();
  const dialog = useAppDialog();
  const [isCheckingLock, setIsCheckingLock] = React.useState(false);
  const [isCheckingBiometrics, setIsCheckingBiometrics] = React.useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = React.useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState('');
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = React.useState(false);

  const backgroundColor = colorScheme === 'light' ? '#FDFBFF' : theme.background;
  const cardColor = colorScheme === 'light' ? '#FFFFFF' : '#1E1E1E';
  const mutedTextColor = colorScheme === 'light' ? '#6B7280' : 'rgba(255,255,255,0.58)';

  const showSecurityAlert = (message: string) => {
    void dialog.alert({ title: 'Security settings', message, tone: 'danger' });
  };

  const toggleLock = async (enabled: boolean) => {
    if (!user?.uuid || isCheckingLock) return;

    setIsCheckingLock(true);
    try {
      if (enabled) {
        if (await hasLocalSecurityPin(user.uuid)) {
          updateUser({ has_pin: true });
          return;
        }
        router.push('/change-pin');
        return;
      }

      await deleteLocalSecurityPin(user.uuid);
      updateUser({ has_pin: false });
    } catch {
      showSecurityAlert('Unable to update your app lock right now.');
    } finally {
      setIsCheckingLock(false);
    }
  };

  const toggleBiometrics = async (enabled: boolean) => {
    if (!user?.uuid || isCheckingBiometrics) return;

    if (!enabled) {
      updateUser({ biometrics_enabled: false });
      return;
    }

    setIsCheckingBiometrics(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        showSecurityAlert('This device does not support biometric unlock.');
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        showSecurityAlert('Set up Face ID, Touch ID, or device biometrics before enabling this.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable biometric unlock',
        fallbackLabel: 'Use device passcode',
      });

      if (!result.success) {
        showSecurityAlert('Biometric verification was cancelled or failed.');
        return;
      }

      updateUser({ biometrics_enabled: true });
    } catch {
      showSecurityAlert('Unable to enable biometric unlock right now.');
    } finally {
      setIsCheckingBiometrics(false);
    }
  };

  const toggleStealthMode = (enabled: boolean) => updateUser({ stealth_mode: enabled });
  const closeDeleteAccount = () => {
    if (isDeletingAccount) return;
    setShowDeleteAccount(false);
    setDeleteConfirmation('');
  };

  const handleDeleteAccount = async () => {
    if (!token || !user?.uuid || deleteConfirmation !== 'DELETE' || isDeletingAccount) return;

    setIsDeletingAccount(true);
    try {
      await deleteUserAccount(token);
      await deleteLocalSecurityPin(user.uuid);
      clearAuth();
      setShowDeleteAccount(false);
      setDeleteConfirmation('');
      router.replace('/auth');
    } catch (error) {
      void dialog.alert({
        title: 'Could not delete account',
        message: getFriendlyAuthErrorMessage(error, 'Unable to delete your account right now.'),
        tone: 'danger',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!token || isRevokingSessions) return;
    const confirmed = await dialog.confirm({
      title: 'Sign out everywhere?',
      message:
        'Every Finnri session, including this device, will be signed out. You can sign in again at any time.',
      confirmLabel: 'Sign out all devices',
      destructive: true,
      iconName: 'logout-variant',
    });
    if (!confirmed) return;
    setIsRevokingSessions(true);
    try {
      await revokeAllSessions(token);
      clearAuth();
      router.replace('/auth');
    } catch (error) {
      void dialog.alert({
        title: 'Could not sign out devices',
        message: getFriendlyAuthErrorMessage(error, 'Unable to sign out all devices right now.'),
        tone: 'danger',
      });
    } finally {
      setIsRevokingSessions(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor }}>
      <AppHeader title="Security & privacy" onBack={() => router.back()} />

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-6 items-center mt-6">
          {/* Shield Illustration */}
          <View
            className="w-28 h-28 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: '#E0F2F1' }}>
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: '#26A69A' }}>
              <MaterialCommunityIcons name="shield-check" size={24} color="white" />
            </View>
          </View>

          <TText
            className="text-2xl font-black mb-2"
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            Security & Privacy
          </TText>
          <TText
            className="text-sm opacity-50 font-medium"
            style={{ fontFamily: Fonts.body, color: theme.text }}>
            {"You're in control of your data adventure!"}
          </TText>
        </View>

        <View className="px-6 mt-10 gap-8">
          {/* APP ACCESS Section */}
          <View>
            <TText
              className="text-xs font-black tracking-widest opacity-40 mb-4 px-2"
              style={{ fontFamily: Fonts.body, color: theme.text }}>
              APP ACCESS
            </TText>
            <View
              className="rounded-[32px] overflow-hidden"
              style={{
                backgroundColor: cardColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.03,
                shadowRadius: 10,
                elevation: 2,
              }}>
              <View
                className="flex-row items-center p-5 justify-between border-b"
                style={{ borderColor: 'rgba(0,0,0,0.03)' }}>
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                    style={{ backgroundColor: theme.secondary }}>
                    <MaterialCommunityIcons name="lock-outline" size={22} color={theme.accent} />
                  </View>
                  <View>
                    <TText
                      className="text-base font-black"
                      style={{ fontFamily: Fonts.title, color: theme.text }}>
                      App lock
                    </TText>
                    <TText
                      className="text-xs opacity-50 font-medium"
                      style={{ fontFamily: Fonts.body, color: theme.text }}>
                      Require PIN to open Finnri
                    </TText>
                  </View>
                </View>
                <HapticSwitch
                  value={!!user?.has_pin}
                  onValueChange={(enabled) => void toggleLock(enabled)}
                  disabled={isCheckingLock}
                  trackColor={{ false: '#E0E0E0', true: theme.accent }}
                  thumbColor="white"
                />
                {isCheckingLock && (
                  <ActivityIndicator
                    size="small"
                    color={theme.accent}
                    style={{ position: 'absolute', right: 22 }}
                  />
                )}
              </View>

              <Pressable
                onPress={() => router.push('/change-pin')}
                className="flex-row items-center p-5 justify-between">
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                    style={{ backgroundColor: '#F3E5F5' }}>
                    <MaterialCommunityIcons name="dots-horizontal" size={22} color="#7B1FA2" />
                  </View>
                  <View>
                    <TText
                      className="text-base font-black"
                      style={{ fontFamily: Fonts.title, color: theme.text }}>
                      Change PIN
                    </TText>
                    <TText
                      className="text-xs opacity-50 font-medium"
                      style={{ fontFamily: Fonts.body, color: theme.text }}>
                      Update your 4-digit code
                    </TText>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#D1D5DB" />
              </Pressable>
            </View>
          </View>

          {/* BIOMETRICS Section */}
          <View>
            <TText
              className="text-xs font-black tracking-widest opacity-40 mb-4 px-2"
              style={{ fontFamily: Fonts.body, color: theme.text }}>
              BIOMETRICS
            </TText>
            <View
              className="rounded-[32px] flex-row items-center p-5 justify-between"
              style={{
                backgroundColor: cardColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.03,
                shadowRadius: 10,
                elevation: 2,
              }}>
              <View className="flex-row items-center flex-1">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mr-4"
                  style={{ backgroundColor: '#E1F5FE' }}>
                  <MaterialCommunityIcons name="face-recognition" size={22} color="#0288D1" />
                </View>
                <View>
                  <TText
                    className="text-base font-black"
                    style={{ fontFamily: Fonts.title, color: theme.text }}>
                    Unlock with Face ID
                  </TText>
                  <TText
                    className="text-xs opacity-50 font-medium"
                    style={{ fontFamily: Fonts.body, color: theme.text }}>
                    Quick and secure access
                  </TText>
                </View>
              </View>
              <HapticSwitch
                value={!!user?.biometrics_enabled}
                onValueChange={(enabled) => void toggleBiometrics(enabled)}
                disabled={isCheckingBiometrics}
                trackColor={{ false: '#E0E0E0', true: theme.accent }}
                thumbColor="white"
              />
              {isCheckingBiometrics && (
                <ActivityIndicator
                  size="small"
                  color={theme.accent}
                  style={{ position: 'absolute', right: 22 }}
                />
              )}
            </View>
          </View>

          {/* PRIVACY Section */}
          <View>
            <TText
              className="text-xs font-black tracking-widest opacity-40 mb-4 px-2"
              style={{ fontFamily: Fonts.body, color: theme.text }}>
              PRIVACY
            </TText>
            <View
              className="rounded-[32px] flex-row items-center p-5 justify-between"
              style={{
                backgroundColor: cardColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.03,
                shadowRadius: 10,
                elevation: 2,
              }}>
              <View className="flex-row items-center flex-1">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mr-4"
                  style={{ backgroundColor: '#FFF9C4' }}>
                  <MaterialCommunityIcons name="eye-off-outline" size={22} color="#FBC02D" />
                </View>
                <View>
                  <TText
                    className="text-base font-black"
                    style={{ fontFamily: Fonts.title, color: theme.text }}>
                    Stealth mode
                  </TText>
                  <TText
                    className="text-xs opacity-50 font-medium"
                    style={{ fontFamily: Fonts.body, color: theme.text }}>
                    Hide balances on home screen
                  </TText>
                </View>
              </View>
              <HapticSwitch
                value={!!user?.stealth_mode}
                onValueChange={toggleStealthMode}
                trackColor={{ false: '#E0E0E0', true: theme.accent }}
                thumbColor="white"
              />
            </View>
          </View>

          {/* ACCOUNT DELETION Section */}
          <View>
            <TText
              className="text-xs font-black tracking-widest opacity-40 mb-4 px-2"
              style={{ fontFamily: Fonts.body, color: theme.text }}>
              ACCOUNT
            </TText>
            <View className="rounded-[32px] overflow-hidden" style={{ backgroundColor: cardColor }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out of all devices"
                accessibilityHint="Revokes every Finnri login session, including this device"
                disabled={isRevokingSessions}
                onPress={() => void handleRevokeAllSessions()}
                className="flex-row items-center p-5 justify-between border-b"
                style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mr-4"
                    style={{ backgroundColor: theme.secondary }}>
                    {isRevokingSessions ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <MaterialCommunityIcons
                        name="logout-variant"
                        size={22}
                        color={theme.accent}
                      />
                    )}
                  </View>
                  <View className="flex-1">
                    <TText
                      className="text-base font-black"
                      style={{ fontFamily: Fonts.title, color: theme.text }}>
                      Sign out all devices
                    </TText>
                    <TText
                      className="text-xs opacity-60 font-medium"
                      style={{ fontFamily: Fonts.body, color: theme.text }}>
                      Use this if a phone or browser is lost
                    </TText>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#D1D5DB" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete Finnri account"
                accessibilityHint="Permanently deletes your Finnri account and data after confirmation"
                onPress={() => setShowDeleteAccount(true)}
                className="flex-row items-center p-5 justify-between"
                style={{
                  backgroundColor: cardColor,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.03,
                  shadowRadius: 10,
                  elevation: 2,
                }}>
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center mr-4"
                    style={{ backgroundColor: colorScheme === 'light' ? '#FFF0EC' : '#3A2424' }}>
                    <MaterialCommunityIcons name="delete-outline" size={22} color="#D32F2F" />
                  </View>
                  <View className="flex-1">
                    <TText
                      className="text-base font-black"
                      style={{ fontFamily: Fonts.title, color: '#D32F2F' }}>
                      Delete Finnri account
                    </TText>
                    <TText
                      className="text-xs opacity-60 font-medium"
                      style={{ fontFamily: Fonts.body, color: theme.text }}>
                      Permanently remove your profile and data
                    </TText>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#D1D5DB" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Footer */}
        <TText
          className="text-center text-[10px] font-black tracking-widest opacity-20 mt-16 uppercase px-10"
          style={{ fontFamily: Fonts.body, color: theme.text }}>
          YOUR PRIVACY IS OUR PRIORITY
        </TText>
      </KeyboardAvoidingScreen>

      <Modal
        transparent
        animationType="fade"
        visible={showDeleteAccount}
        statusBarTranslucent
        onRequestClose={closeDeleteAccount}>
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel account deletion"
            disabled={isDeletingAccount}
            onPress={closeDeleteAccount}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.62)',
            }}
          />
          <View
            className="w-full max-w-[384px] rounded-[32px] p-6"
            style={{
              backgroundColor: cardColor,
              borderColor: colorScheme === 'light' ? '#F3D7D1' : 'rgba(255,255,255,0.12)',
              borderWidth: 1,
            }}>
            <View
              className="w-14 h-14 rounded-full items-center justify-center self-center mb-4"
              style={{ backgroundColor: colorScheme === 'light' ? '#FFF0EC' : '#3A2424' }}>
              <MaterialCommunityIcons name="delete-alert-outline" size={28} color="#D32F2F" />
            </View>
            <TText
              className="text-xl font-black text-center"
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              Delete your account?
            </TText>
            <TText
              className="text-sm text-center mt-3 leading-5"
              style={{ fontFamily: Fonts.body, color: mutedTextColor }}>
              This permanently removes your profile, transactions, accounts, AI credit history, and
              billing records from Finnri.
            </TText>
            <TText
              className="text-xs font-black tracking-widest mt-6 mb-2"
              style={{ fontFamily: Fonts.body, color: '#D32F2F' }}>
              TYPE DELETE TO CONFIRM
            </TText>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeletingAccount}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              placeholder="DELETE"
              placeholderTextColor={colorScheme === 'light' ? '#C9A8A1' : 'rgba(255,255,255,0.32)'}
              className="h-14 rounded-2xl px-4 text-base font-black"
              style={{
                backgroundColor: colorScheme === 'light' ? '#FFF8F6' : 'rgba(255,255,255,0.06)',
                borderColor:
                  deleteConfirmation && deleteConfirmation !== 'DELETE' ? '#D32F2F' : '#F3D7D1',
                borderWidth: 1,
                color: colorScheme === 'light' ? '#1A1A1A' : '#FFFFFF',
                fontFamily: Fonts.body,
              }}
            />
            <View className="flex-row gap-3 mt-6">
              <Pressable
                accessibilityRole="button"
                disabled={isDeletingAccount}
                onPress={closeDeleteAccount}
                className="flex-1 rounded-2xl items-center justify-center"
                style={{
                  backgroundColor: colorScheme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                  borderColor: colorScheme === 'light' ? '#EEE7E4' : 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  minHeight: 52,
                }}>
                <TText className="font-black" style={{ fontFamily: Fonts.title, color: theme.text }}>
                  Cancel
                </TText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deleteConfirmation !== 'DELETE' || isDeletingAccount}
                onPress={() => void handleDeleteAccount()}
                className="flex-1 rounded-2xl items-center justify-center"
                style={{
                  backgroundColor: '#D32F2F',
                  minHeight: 52,
                  opacity: deleteConfirmation === 'DELETE' && !isDeletingAccount ? 1 : 0.45,
                }}>
                {isDeletingAccount ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <TText
                    className="font-black"
                    style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
                    Delete
                  </TText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
