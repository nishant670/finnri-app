import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * What a dialog is saying, which decides how it feels before it is read.
 *
 * - `info`: nothing is wrong. A question or a note.
 * - `success`: it worked.
 * - `warning`: careful. Amber, a caution triangle, and a buzz: nearing a limit,
 *   something blocking the next step, an entry that needs fixing.
 * - `error`: the app could not do it. Soft and apologetic on purpose, with a calm
 *   button: it is not the person's fault, and if every failed request looked
 *   alarming the one alert that matters would stop being noticed.
 * - `danger`: stop. The loudest thing the app can say, kept for a line that has
 *   been crossed, such as a blown budget: a stop sign, a red card over a red
 *   dimmed screen, and a buzz.
 */
export type DialogTone = 'info' | 'success' | 'warning' | 'error' | 'danger';

/** A one-button alert reports something, so it is never a stop: failures are `error`. */
export type AlertTone = Exclude<DialogTone, 'danger'>;

/** `destructive` is its own look: serious, but the person asked for it. */
type Look = DialogTone | 'destructive';

const RED = '#D92D20';

type LookStyle = {
  icon: IconName;
  iconColor: string;
  shell: string;
  /** The halo around the icon, for the one tone that needs to shout. */
  ring?: string;
  title: string;
  card: string;
  border: string;
  thickBorder: boolean;
  scrim: string;
  buttonFill: string;
  buttonLabel: string;
  buzz: boolean;
};

function useLookStyle(look: Look): LookStyle {
  const theme = useThemeTokens();
  const { colors } = theme;
  const isDark = theme.mode === 'dark';
  const scrim = 'rgba(0,0,0,0.6)';
  const plain = {
    title: colors.text,
    card: colors.card,
    border: colors.border,
    thickBorder: false,
    scrim,
    buzz: false,
  };
  const roseShell = mixHex(colors.card, RED, isDark ? 0.22 : 0.09);

  switch (look) {
    case 'danger':
      return {
        icon: 'alert-octagon',
        iconColor: '#FFFFFF',
        shell: RED,
        ring: mixHex(colors.card, RED, isDark ? 0.3 : 0.14),
        title: isDark ? colors.negative : '#B42318',
        card: mixHex(colors.card, RED, isDark ? 0.1 : 0.035),
        border: mixHex(colors.card, RED, isDark ? 0.6 : 0.4),
        thickBorder: true,
        scrim: isDark ? 'rgba(36,4,4,0.76)' : 'rgba(70,10,10,0.66)',
        buttonFill: RED,
        buttonLabel: '#FFFFFF',
        buzz: true,
      };
    case 'warning':
      return {
        ...plain,
        icon: 'alert-outline',
        iconColor: colors.warning,
        shell: colors.warningSurface,
        border: colors.warningOutline,
        thickBorder: true,
        buttonFill: colors.warning,
        // The dark theme's amber is a pale one, which white cannot be read on.
        buttonLabel: isDark ? '#2A1A05' : '#FFFFFF',
        buzz: true,
      };
    case 'destructive':
      return {
        ...plain,
        icon: 'delete-outline',
        iconColor: isDark ? colors.negative : RED,
        shell: roseShell,
        buttonFill: RED,
        buttonLabel: '#FFFFFF',
      };
    case 'error':
      return {
        ...plain,
        icon: 'alert-circle-outline',
        iconColor: isDark ? colors.negative : RED,
        shell: roseShell,
        buttonFill: colors.accent,
        buttonLabel: colors.onAccent,
      };
    case 'success':
      return {
        ...plain,
        icon: 'check-decagram',
        iconColor: '#2E9E6B',
        shell: isDark ? 'rgba(255,255,255,0.08)' : '#2E9E6B1A',
        buttonFill: '#2E9E6B',
        buttonLabel: '#FFFFFF',
      };
    default:
      return {
        ...plain,
        icon: 'information-outline',
        iconColor: colors.accent,
        shell: colors.secondary,
        buttonFill: colors.accent,
        buttonLabel: colors.onAccent,
      };
  }
}

type DialogFrameProps = {
  visible: boolean;
  lookStyle: LookStyle;
  iconName: IconName;
  title: string;
  message: string;
  dismissLabel: string;
  dismissDisabled?: boolean;
  onDismiss: () => void;
  children: ReactNode;
};

/**
 * Both dialogs sit on `colors.card`, or a tint of it, not `colors.background`.
 *
 * `background` is the colour of the page the dialog is covering — in the light
 * theme they are the same `#FDF5F7` — so the card had nothing but a hairline
 * border and a soft shadow separating it from what it interrupted, and its
 * contents read as loose text on the screen rather than as a dialog.
 */
function DialogFrame({
  visible,
  lookStyle,
  iconName,
  title,
  message,
  dismissLabel,
  dismissDisabled = false,
  onDismiss,
  children,
}: DialogFrameProps) {
  const theme = useThemeTokens();
  const { buzz } = lookStyle;

  useEffect(() => {
    if (visible && buzz) haptics.rejected();
    // The words are here so a queued dialog that replaces this one buzzes too.
  }, [buzz, visible, title, message]);

  const icon = (
    <View style={[styles.iconShell, { backgroundColor: lookStyle.shell }]}>
      <MaterialCommunityIcons name={iconName} size={27} color={lookStyle.iconColor} />
    </View>
  );

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={dismissDisabled ? undefined : onDismiss}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          disabled={dismissDisabled}
          onPress={onDismiss}
          style={[styles.backdrop, { backgroundColor: lookStyle.scrim }]}
        />
        <View
          style={[
            styles.dialog,
            theme.shadows.soft,
            {
              backgroundColor: lookStyle.card,
              borderColor: lookStyle.border,
              borderWidth: lookStyle.thickBorder ? 1.5 : StyleSheet.hairlineWidth,
            },
          ]}>
          {lookStyle.ring ? (
            <View style={[styles.iconRing, { backgroundColor: lookStyle.ring }]}>{icon}</View>
          ) : (
            icon
          )}
          <ThemedText style={[styles.title, { color: lookStyle.title }]}>{title}</ThemedText>
          <ThemedText
            style={[
              styles.message,
              { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.58)' : '#6B7280' },
            ]}>
            {message}
          </ThemedText>
          {children}
        </View>
      </View>
    </Modal>
  );
}

type ThemedConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  iconName?: IconName;
  /** How serious this question is. `destructive` wins over it. */
  tone?: 'info' | 'warning' | 'danger';
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
  iconName,
  tone = 'info',
  destructive = false,
  loading = false,
  onCancel,
  onConfirm,
}: ThemedConfirmDialogProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const look: Look = destructive ? 'destructive' : tone;
  const lookStyle = useLookStyle(look);
  // An ordinary question keeps a quiet outlined action. Anything heavier fills
  // it, so the serious choice is also the visually serious one.
  const filled = look !== 'info';
  const confirmInk = filled ? lookStyle.buttonLabel : lookStyle.iconColor;

  return (
    <DialogFrame
      visible={visible}
      lookStyle={lookStyle}
      iconName={iconName ?? (look === 'info' ? 'help-circle-outline' : lookStyle.icon)}
      title={title}
      message={message}
      dismissLabel={cancelLabel}
      dismissDisabled={loading}
      onDismiss={onCancel}>
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
          <ThemedText style={[styles.cancelLabel, { color: colors.text }]}>{cancelLabel}</ThemedText>
        </PressableView>
        <PressableView
          accessibilityRole="button"
          disabled={loading}
          onPress={onConfirm}
          style={[
            styles.button,
            styles.confirmButton,
            {
              backgroundColor: filled ? lookStyle.buttonFill : 'transparent',
              borderColor: filled ? lookStyle.buttonFill : lookStyle.iconColor,
              opacity: loading ? 0.72 : 1,
            },
          ]}
          pressedStyle={styles.pressed}>
          {loading ? (
            <ActivityIndicator color={confirmInk} />
          ) : (
            <ThemedText style={[styles.confirmLabel, { color: confirmInk }]}>{confirmLabel}</ThemedText>
          )}
        </PressableView>
      </View>
    </DialogFrame>
  );
}

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
  const lookStyle = useLookStyle(tone);

  return (
    <DialogFrame
      visible={visible}
      lookStyle={lookStyle}
      iconName={iconName ?? lookStyle.icon}
      title={title}
      message={message}
      dismissLabel={buttonLabel}
      onDismiss={onDismiss}>
      <View style={styles.actions}>
        <PressableView
          accessibilityRole="button"
          onPress={onDismiss}
          style={[styles.button, { backgroundColor: lookStyle.buttonFill }]}
          pressedStyle={styles.pressed}>
          <ThemedText style={[styles.confirmLabel, { color: lookStyle.buttonLabel }]}>
            {buttonLabel}
          </ThemedText>
        </PressableView>
      </View>
    </DialogFrame>
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
  },
  dialog: {
    alignItems: 'center',
    borderRadius: 32,
    maxWidth: 384,
    padding: 24,
    width: '100%',
  },
  iconRing: {
    borderRadius: 999,
    padding: 7,
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
