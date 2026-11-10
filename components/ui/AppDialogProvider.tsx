import type { ComponentProps } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  ThemedAlertDialog,
  ThemedConfirmDialog,
  type DialogTone,
} from '@/components/ui/ThemedConfirmDialog';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AppAlertOptions = {
  title: string;
  message: string;
  /** How it should feel: see `DialogTone`. Failures are `error`, not `danger`. */
  tone?: DialogTone;
  buttonLabel?: string;
  iconName?: IconName;
};

export type AppConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** How serious the question is. `destructive` wins over it. */
  tone?: 'info' | 'warning' | 'danger';
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
  // What the dialogs draw, which outlives `current` so a dialog keeps its words
  // and its colour while it fades out instead of blanking to the default look.
  const [shown, setShown] = useState<Queued | null>(null);
  if (current && current !== shown) setShown(current);

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

  const alertShown = shown?.kind === 'alert' ? shown : null;
  const confirmShown = shown?.kind === 'confirm' ? shown : null;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <ThemedAlertDialog
        visible={current?.kind === 'alert'}
        title={alertShown?.title ?? ''}
        message={alertShown?.message ?? ''}
        buttonLabel={alertShown?.buttonLabel}
        iconName={alertShown?.iconName}
        tone={alertShown?.tone ?? 'info'}
        onDismiss={() => settle(true)}
      />
      <ThemedConfirmDialog
        visible={current?.kind === 'confirm'}
        title={confirmShown?.title ?? ''}
        message={confirmShown?.message ?? ''}
        confirmLabel={confirmShown?.confirmLabel ?? ''}
        cancelLabel={confirmShown?.cancelLabel}
        tone={confirmShown?.tone}
        destructive={confirmShown?.destructive ?? false}
        iconName={confirmShown?.iconName}
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
