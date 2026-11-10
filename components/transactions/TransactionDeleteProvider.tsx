import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { UNDO_WINDOW_MS, useUndoableDelete } from '@/hooks/use-undoable-delete';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { deleteEntry } from '@/lib/entries';
import { notifyTransactionsChanged } from '@/lib/transaction-events';

export type PendingTransactionDelete = {
  id: string;
  name: string;
};

/**
 * Where the toast is with a delete. `waiting` is the Undo window; `sending`
 * the request after it; `done` a short confirmation once the server agrees.
 * Before these, the toast said "Deleted" while nothing had been sent and then
 * vanished, so the request itself happened with nothing on screen.
 */
export type DeleteToastPhase = 'waiting' | 'sending' | 'done';

/** How long "Deleted" stays up once the server has confirmed it. */
const DONE_TOAST_MS = 1500;

type DeleteStatus = { item: PendingTransactionDelete; phase: 'sending' | 'done' };
type DeleteToastState = { item: PendingTransactionDelete; phase: DeleteToastPhase };

type TransactionDeleteContextValue = {
  pending: PendingTransactionDelete | null;
  /**
   * Rows whose delete has been sent: in flight, or done but perhaps still in a
   * list that has not refreshed. A list leaves them out. Without this a row
   * stopped being `pending` the moment its request went, grew back to full
   * height, and only vanished again when the refresh after the delete landed.
   * A failed delete takes its row out of here, so it comes back.
   */
  removedIds: ReadonlySet<string>;
  /** What the toast is showing, if anything. */
  toast: DeleteToastState | null;
  requestDelete: (transaction: PendingTransactionDelete) => void;
  undoDelete: () => void;
  /**
   * Claims the toast for the screen calling it, and releases it on unmount.
   *
   * The provider sits above the navigator, so its own toast is a sibling of
   * `<Stack>` — which puts it *behind* any screen the stack has pushed. That is
   * invisible on the tab screens, where nothing is pushed over it, and total on
   * `/transactions`, where the delete then looks like it happened silently and
   * the five seconds the confirmation promises are unreachable.
   *
   * A pushed screen that can delete therefore renders its own
   * `TransactionUndoToast`, and claiming makes the provider stand down while it
   * does — two toasts would otherwise draw twice and, worse, announce twice to
   * a screen reader.
   */
  claimToastHost: () => () => void;
};

const TransactionDeleteContext = createContext<TransactionDeleteContextValue | null>(null);

export function TransactionDeleteProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  const dialog = useAppDialog();
  const [toastHosts, setToastHosts] = useState(0);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState<DeleteStatus | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const { pending, request, undo } = useUndoableDelete<PendingTransactionDelete>((target) => {
    if (!token) return;
    // Same tick as `pending` clearing, so no render sees the row as neither.
    setRemovedIds((current) => new Set(current).add(target.id));
    if (doneTimer.current) clearTimeout(doneTimer.current);
    setStatus({ item: target, phase: 'sending' });
    // Only the delete this status is about may move it on: a second one may
    // have been sent since, and the toast speaks for the latest.
    const settle = (next: DeleteStatus | null) =>
      setStatus((current) => (current?.item.id === target.id ? next : current));
    void deleteEntry(token, target.id)
      .then(() => {
        settle({ item: target, phase: 'done' });
        doneTimer.current = setTimeout(() => settle(null), DONE_TOAST_MS);
        notifyTransactionsChanged();
      })
      .catch(() => {
        settle(null);
        setRemovedIds((current) => {
          const next = new Set(current);
          next.delete(target.id);
          return next;
        });
        void dialog.alert({
          title: 'Delete failed',
          message: `${target.name} is still in your ledger. Check your connection and try again.`,
          tone: 'error',
        });
        notifyTransactionsChanged();
      });
  });
  const claimToastHost = useCallback(() => {
    setToastHosts((count) => count + 1);
    return () => setToastHosts((count) => Math.max(0, count - 1));
  }, []);

  // The Undo window outranks a request already on its way: it is the one the
  // user can still act on.
  const toast = useMemo<DeleteToastState | null>(
    () => (pending ? { item: pending, phase: 'waiting' } : status),
    [pending, status]
  );

  const value = useMemo(
    () => ({ pending, removedIds, toast, requestDelete: request, undoDelete: undo, claimToastHost }),
    [claimToastHost, pending, removedIds, request, toast, undo]
  );

  return (
    <TransactionDeleteContext.Provider value={value}>
      {children}
      {toastHosts === 0 && <UndoDeleteToast toast={toast} onUndo={undo} />}
    </TransactionDeleteContext.Provider>
  );
}

/**
 * The undo toast, mounted inside a screen rather than above the navigator.
 *
 * Any screen the stack *pushes* has to render this, because the provider's own
 * copy is drawn underneath it. Screens that sit at the stack's root do not need
 * it — the provider already covers them.
 */
export function TransactionUndoToast() {
  const { toast, undoDelete, claimToastHost } = useTransactionDelete();
  useEffect(() => claimToastHost(), [claimToastHost]);
  return <UndoDeleteToast toast={toast} onUndo={undoDelete} />;
}

export function useTransactionDelete() {
  const value = useContext(TransactionDeleteContext);
  if (!value) {
    throw new Error('useTransactionDelete must be used inside TransactionDeleteProvider');
  }
  return value;
}

function UndoDeleteToast({
  toast,
  onUndo,
}: {
  toast: DeleteToastState | null;
  onUndo: () => void;
}) {
  const themeTokens = useThemeTokens();
  const motion = useMotion();
  const reveal = useSharedValue(0);
  /** What the Undo window has left, drawn as a bar draining along the bottom. */
  const remaining = useSharedValue(1);
  const [shown, setShown] = useState<DeleteToastState | null>(null);
  const toastBottom = useBottomInset(28);
  const visible = toast !== null;
  const waitingId = toast?.phase === 'waiting' ? toast.item.id : null;

  useEffect(() => {
    if (toast) setShown(toast);
  }, [toast]);

  useEffect(() => {
    if (visible) {
      reveal.value = withTiming(1, motion.enter('base'));
      return undefined;
    }
    reveal.value = withTiming(0, motion.exit('base'));
    const clear = setTimeout(() => setShown(null), motion.exitDuration('base'));
    return () => clearTimeout(clear);
  }, [motion, reveal, visible]);

  // Restarts for each delete that opens a window. A clock, not a flourish, so
  // it runs under reduced motion too: it is the only thing saying how long
  // Undo has left.
  useEffect(() => {
    cancelAnimation(remaining);
    if (!waitingId) return;
    remaining.value = 1;
    remaining.value = withTiming(0, { duration: UNDO_WINDOW_MS, easing: Easing.linear });
  }, [remaining, waitingId]);

  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [10, 0]) }],
  }));
  const countdownStyle = useAnimatedStyle(() => ({ width: `${remaining.value * 100}%` }));

  if (!shown) return null;

  const ink = themeTokens.colors.background;
  const label =
    shown.phase === 'done' ? `Deleted ${shown.item.name}` : `Deleting ${shown.item.name}`;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={visible ? 'auto' : 'none'}
      className="absolute left-5 right-5 z-50 overflow-hidden rounded-2xl shadow-md"
      style={[{ backgroundColor: themeTokens.colors.text, bottom: toastBottom }, style]}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-1 flex-row items-center gap-2 pr-3">
          {shown.phase === 'sending' ? (
            <ActivityIndicator size="small" color={ink} />
          ) : (
            <MaterialCommunityIcons
              name={shown.phase === 'done' ? 'check-circle-outline' : 'trash-can-outline'}
              size={16}
              color={ink}
            />
          )}
          <ThemedText numberOfLines={1} className="flex-1 text-xs font-bold" style={{ color: ink }}>
            {shown.phase === 'sending' ? `${label}…` : label}
          </ThemedText>
        </View>
        {shown.phase === 'waiting' ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Undo delete"
            onPress={onUndo}
            hitSlop={12}>
            <ThemedText
              className="text-xs font-black uppercase"
              style={{ color: themeTokens.colors.accent }}>
              Undo
            </ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
      {shown.phase === 'waiting' ? (
        <Animated.View
          testID="undo-delete-countdown"
          style={[
            { height: 3, backgroundColor: themeTokens.colors.accent, opacity: 0.8 },
            countdownStyle,
          ]}
        />
      ) : null}
    </Animated.View>
  );
}
