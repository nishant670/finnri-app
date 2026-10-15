import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type ThemedConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  iconName?: IconName;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ThemedConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  iconName = 'alert-circle-outline',
  destructive = false,
  loading = false,
  onCancel,
  onConfirm,
}: ThemedConfirmDialogProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const actionColor = destructive ? '#EF5B5B' : colors.accent;
  const iconBackground = destructive
    ? theme.mode === 'dark'
      ? '#3A2424'
      : '#FFF0EC'
    : colors.secondary;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={loading ? undefined : onCancel}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          disabled={loading}
          onPress={onCancel}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.dialog,
            theme.shadows.soft,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <View style={[styles.iconShell, { backgroundColor: iconBackground }]}>
            <MaterialCommunityIcons name={iconName} size={27} color={actionColor} />
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
          <ThemedText
            style={[
              styles.message,
              { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.58)' : '#6B7280' },
            ]}>
            {message}
          </ThemedText>

          <View style={styles.actions}>
            <PressableView
              accessibilityRole="button"
              disabled={loading}
              onPress={onCancel}
              style={[
                styles.button,
                styles.cancelButton,
                {
                  // The card is white in the light theme now, so the cancel
                  // button takes the page colour to stay a visible second
                  // option rather than a white rectangle on white.
                  backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : colors.background,
                  borderColor: colors.border,
                  opacity: loading ? 0.72 : 1,
                },
              ]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.cancelLabel, { color: colors.text }]}>
                {cancelLabel}
              </ThemedText>
            </PressableView>
            <PressableView
              accessibilityRole="button"
              disabled={loading}
              onPress={onConfirm}
              style={[
                styles.button,
                styles.confirmButton,
                {
                  borderColor: actionColor,
                  opacity: loading ? 0.72 : 1,
                },
              ]}
              pressedStyle={styles.pressed}>
              {loading ? (
                <ActivityIndicator color={actionColor} />
              ) : (
                <ThemedText style={[styles.confirmLabel, { color: actionColor }]}>
                  {confirmLabel}
                </ThemedText>
              )}
            </PressableView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Both dialogs sit on `colors.card`, not `colors.background`.
 *
 * `background` is the colour of the page the dialog is covering — in the light
 * theme they are the same `#FDF5F7` — so the card had nothing but a hairline
 * border and a soft shadow separating it from what it interrupted, and its
 * contents read as loose text on the screen rather than as a dialog.
 */

type AlertTone = 'info' | 'success' | 'danger';

type ThemedAlertDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  iconName?: IconName;
  tone?: AlertTone;
  onDismiss: () => void;
};

/**
 * The one-button counterpart to the confirm dialog, for the places that were
 * still reaching for `Alert.alert` — a system dialog carries none of the app's
 * type, colour, or corner radius, so an otherwise themed flow ended on a stock
 * Android box.
 */
export function ThemedAlertDialog({
  visible,
  title,
  message,
  buttonLabel = 'OK',
  iconName,
  tone = 'info',
  onDismiss,
}: ThemedAlertDialogProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const isDark = theme.mode === 'dark';
  const accentByTone: Record<AlertTone, string> = {
    info: colors.accent,
    success: '#2E9E6B',
    danger: '#EF5B5B',
  };
  const iconByTone: Record<AlertTone, IconName> = {
    info: 'information-outline',
    success: 'check-decagram',
    danger: 'alert-circle-outline',
  };
  const actionColor = accentByTone[tone];
  const iconBackground =
    tone === 'info' ? colors.secondary : isDark ? 'rgba(255,255,255,0.08)' : `${actionColor}1A`;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.dialog,
            theme.shadows.soft,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <View style={[styles.iconShell, { backgroundColor: iconBackground }]}>
            <MaterialCommunityIcons
              name={iconName ?? iconByTone[tone]}
              size={27}
              color={actionColor}
            />
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
          <ThemedText
            style={[styles.message, { color: isDark ? 'rgba(255,255,255,0.58)' : '#6B7280' }]}>
            {message}
          </ThemedText>

          <View style={styles.actions}>
            <PressableView
              accessibilityRole="button"
              onPress={onDismiss}
              style={[styles.button, { backgroundColor: actionColor }]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.confirmLabel, { color: '#FFFFFF' }]}>
                {buttonLabel}
              </ThemedText>
            </PressableView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ThemedDeleteDialog(
  props: Omit<ThemedConfirmDialogProps, 'destructive' | 'iconName'>
) {
  return <ThemedConfirmDialog {...props} destructive iconName="delete-outline" />;
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.72,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dialog: {
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 384,
    padding: 24,
    width: '100%',
  },
  iconShell: {
    alignItems: 'center',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmButton: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelLabel: {
    fontWeight: '900',
    textAlign: 'center',
  },
  confirmLabel: {
    fontWeight: '900',
    textAlign: 'center',
  },
});
