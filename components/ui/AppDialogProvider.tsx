import type { ComponentProps } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedAlertDialog, ThemedConfirmDialog } from '@/components/ui/ThemedConfirmDialog';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AppAlertOptions = {
  title: string;
  message: string;
  /** Colours the icon and the button: accent, green, red. */
  tone?: 'info' | 'success' | 'danger';
  buttonLabel?: string;
  iconName?: IconName;
};

export type AppConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm action red and swaps the icon for a bin. */
  destructive?: boolean;
  iconName?: IconName;
};

type AppDialogContextValue = {
  /** Resolves when the user dismisses it. */
  alert: (options: AppAlertOptions) => Promise<void>;
  /** Resolves true on confirm, false on cancel or backdrop tap. */
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

type QueuedAlert = AppAlertOptions & { kind: 'alert'; resolve: () => void };
type QueuedConfirm = AppConfirmOptions & { kind: 'confirm'; resolve: (ok: boolean) => void };
type Queued = QueuedAlert | QueuedConfirm;

/**
 * One themed dialog host for the whole app.
 *
 * `ThemedAlertDialog` and `ThemedConfirmDialog` already existed, but using them
 * meant a `useState` and a block of JSX in every screen that wanted to say
 * anything — so most screens kept reaching for `Alert.alert`, and a flow that
 * was themed from the first tap to the last ended on a stock system box with
 * the platform's own type, corners and blue. The group composer was the worst
 * of them: an entire bottom sheet in Finnri's colours, and then "Added to the
 * group" in Android's.
 *
 * A provider makes the themed path the shorter one. `await alert(...)` is less
 * code than `Alert.alert(...)`, which is what actually stops the regression —
 * the rule was already agreed and kept being broken because following it cost
 * more than breaking it.
 *
 * Requests queue rather than replace each other: two dialogs raised in the same
 * tick both get shown, in order, instead of the second silently winning.
 */
export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Queued | null>(null);
  const queue = useRef<Queued[]>([]);

  const push = useCallback((request: Queued) => {
    setCurrent((active) => {
      if (active) {
        queue.current.push(request);
        return active;
      }
      return request;
    });
  }, []);

  const advance = useCallback(() => {
    setCurrent(queue.current.shift() ?? null);
  }, []);

  const alert = useCallback(
    (options: AppAlertOptions) =>
      new Promise<void>((resolve) => push({ ...options, kind: 'alert', resolve })),
    [push]
  );

  const confirm = useCallback(
    (options: AppConfirmOptions) =>
      new Promise<boolean>((resolve) => push({ ...options, kind: 'confirm', resolve })),
    [push]
  );

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  const settle = useCallback(
    (result: boolean) => {
      const active = current;
      advance();
      if (!active) return;
      if (active.kind === 'alert') active.resolve();
      else active.resolve(result);
    },
    [advance, current]
  );

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <ThemedAlertDialog
        visible={current?.kind === 'alert'}
        title={current?.kind === 'alert' ? current.title : ''}
        message={current?.kind === 'alert' ? current.message : ''}
        buttonLabel={current?.kind === 'alert' ? current.buttonLabel : undefined}
        iconName={current?.kind === 'alert' ? current.iconName : undefined}
        tone={current?.kind === 'alert' ? (current.tone ?? 'info') : 'info'}
        onDismiss={() => settle(true)}
      />
      <ThemedConfirmDialog
        visible={current?.kind === 'confirm'}
        title={current?.kind === 'confirm' ? current.title : ''}
        message={current?.kind === 'confirm' ? current.message : ''}
        confirmLabel={current?.kind === 'confirm' ? current.confirmLabel : ''}
        cancelLabel={current?.kind === 'confirm' ? current.cancelLabel : undefined}
        destructive={current?.kind === 'confirm' ? current.destructive : false}
        iconName={
          current?.kind === 'confirm'
            ? (current.iconName ?? (current.destructive ? 'delete-outline' : 'alert-circle-outline'))
            : undefined
        }
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
      />
    </AppDialogContext.Provider>
  );
}

/**
 * The themed replacement for `Alert.alert`.
 *
 * Screens should have no reason to import `Alert` from react-native at all —
 * see `AppDialogProvider` for why the stock dialog is not an acceptable ending
 * to a themed flow.
 */
/**
 * The same, or null outside the provider: for a component that can do without
 * a question (the transaction sheet's "Always use …?") and is rendered alone
 * in tests and previews.
 */
export function useOptionalAppDialog() {
  return useContext(AppDialogContext);
}

export function useAppDialog() {
  const value = useContext(AppDialogContext);
  if (!value) {
    throw new Error('useAppDialog must be used inside AppDialogProvider');
  }
  return value;
}
