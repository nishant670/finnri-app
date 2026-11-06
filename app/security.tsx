import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { Button } from '@/components/ui/Button';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { deleteUserAccount, getFriendlyAuthErrorMessage, revokeAllSessions } from '@/lib/auth';
import { deleteLocalSecurityPin, hasLocalSecurityPin } from '@/lib/security';

/** What this phone's biometric unlock is called, for the row that turns it on. */
const biometric: { name: string; icon: 'face-recognition' | 'fingerprint' } =
  Platform.OS === 'ios' ? { name: 'Face ID', icon: 'face-recognition' } : { name: 'fingerprint', icon: 'fingerprint' };

export default function SecurityScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { user, token, updateUser, clearAuth } = useAuthStore();
  const dialog = useAppDialog();
  const [isCheckingLock, setIsCheckingLock] = React.useState(false);
  const [isCheckingBiometrics, setIsCheckingBiometrics] = React.useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = React.useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState('');
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = React.useState(false);

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
        showSecurityAlert(
          Platform.OS === 'ios'
            ? 'Set up Face ID or Touch ID before turning this on.'
            : 'Add a fingerprint in your phone’s settings before turning this on.'
        );
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
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title="Security & privacy" onBack={() => router.back()} />

      <KeyboardAvoidingScreen showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ThemedText tone="muted" style={styles.intro}>
          Control who can open Finnri on this phone and what shows on screen.
        </ThemedText>

        <GroupTitle>App lock</GroupTitle>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="lock-outline"
            title="App lock"
            subtitle="Ask for your PIN when Finnri opens"
            accessory={
              isCheckingLock ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <HapticSwitch
                  accessibilityLabel="App lock"
                  value={!!user?.has_pin}
                  onValueChange={(enabled) => void toggleLock(enabled)}
                  disabled={isCheckingLock}
                />
              )
            }
          />
          {/* Android phones unlock with a fingerprint; this said Face ID on
              every phone (a fix on board R8-Security). */}
          <SettingsRow
            icon={biometric.icon}
            title={`Unlock with ${biometric.name}`}
            subtitle={`Use your ${biometric.name} instead of the PIN`}
            divider
            accessory={
              isCheckingBiometrics ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <HapticSwitch
                  accessibilityLabel={`Unlock with ${biometric.name}`}
                  value={!!user?.biometrics_enabled}
                  onValueChange={(enabled) => void toggleBiometrics(enabled)}
                  disabled={isCheckingBiometrics}
                />
              )
            }
          />
          <SettingsRow
            icon="dialpad"
            title="Change PIN"
            subtitle="Update your 4-digit code"
            onPress={() => router.push('/change-pin')}
            divider
          />
        </View>

        <GroupTitle>Privacy</GroupTitle>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="eye-off-outline"
            title="Stealth mode"
            subtitle="Hide amounts on Home"
            accessory={
              <HapticSwitch accessibilityLabel="Stealth mode" value={!!user?.stealth_mode} onValueChange={toggleStealthMode} />
            }
          />
        </View>

        <GroupTitle>Account</GroupTitle>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="logout-variant"
            title="Sign out of all devices"
            subtitle="Use this if a phone or browser is lost"
            accessibilityLabel="Sign out of all devices"
            onPress={isRevokingSessions ? undefined : () => void handleRevokeAllSessions()}
            accessory={isRevokingSessions ? <ActivityIndicator color={colors.muted} /> : undefined}
          />
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Delete Finnri account"
            accessibilityHint="Permanently deletes your Finnri account and data after confirmation"
            onPress={() => setShowDeleteAccount(true)}
            style={[styles.deleteRow, { borderTopColor: colors.border }]}
            pressedStyle={styles.pressed}>
            <View style={[styles.dangerTile, { backgroundColor: withAlpha(colors.negative, 0.12) }]}>
              <MaterialCommunityIcons name="delete-outline" size={18} color={colors.negative} />
            </View>
            <View style={styles.flexText}>
              <ThemedText style={[styles.rowTitle, { color: colors.negative }]}>Delete Finnri account</ThemedText>
              <ThemedText tone="muted" style={styles.small}>
                Permanently removes your profile and data
              </ThemedText>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </PressableView>
        </View>
      </KeyboardAvoidingScreen>

      <Modal
        transparent
        animationType="fade"
        visible={showDeleteAccount}
        statusBarTranslucent
        onRequestClose={closeDeleteAccount}>
        <View style={styles.modalWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel account deletion"
            disabled={isDeletingAccount}
            onPress={closeDeleteAccount}
            style={styles.scrim}
          />
          <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dialogIcon, { backgroundColor: withAlpha(colors.negative, 0.12) }]}>
              <MaterialCommunityIcons name="delete-alert-outline" size={26} color={colors.negative} />
            </View>
            <ThemedText style={[styles.dialogTitle, { color: colors.text }]}>Delete your account?</ThemedText>
            <ThemedText tone="muted" style={styles.dialogBody}>
              This permanently removes your profile, transactions, accounts, AI credit history, and billing
              records from Finnri.
            </ThemedText>
            <ThemedText style={[styles.confirmLabel, { color: colors.text }]}>Type DELETE to confirm</ThemedText>
            <TextInput
              accessibilityLabel="Type DELETE to confirm account deletion"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeletingAccount}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              style={[
                styles.confirmInput,
                {
                  backgroundColor: colors.background,
                  borderColor:
                    deleteConfirmation && deleteConfirmation !== 'DELETE' ? colors.negative : colors.border,
                  color: colors.text,
                },
              ]}
            />
            <View style={styles.dialogActions}>
              <Button
                variant="outline"
                height={48}
                label="Cancel"
                disabled={isDeletingAccount}
                onPress={closeDeleteAccount}
                style={styles.flexButton}
              />
              <PressableView
                accessibilityRole="button"
                disabled={deleteConfirmation !== 'DELETE' || isDeletingAccount}
                onPress={() => void handleDeleteAccount()}
                style={[
                  styles.deleteButton,
                  { backgroundColor: colors.negative, opacity: deleteConfirmation === 'DELETE' && !isDeletingAccount ? 1 : 0.45 },
                ]}
                pressedStyle={styles.pressed}>
                {isDeletingAccount ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <ThemedText style={[styles.deleteLabel, { color: colors.background }]}>Delete</ThemedText>
                )}
              </PressableView>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <ThemedText tone="muted" accessibilityRole="header" style={styles.groupTitle}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 13,
    lineHeight: 18,
  },
  groupTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  deleteRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 12,
    borderTopWidth: 1,
  },
  dangerTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 384,
    padding: 20,
    borderWidth: 1,
    borderRadius: 24,
  },
  dialogIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  dialogBody: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  confirmLabel: {
    marginTop: 20,
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  confirmInput: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  flexButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
