import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Animated, {
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
import { useUndoableDelete } from '@/hooks/use-undoable-delete';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { deleteEntry } from '@/lib/entries';
import { notifyTransactionsChanged } from '@/lib/transaction-events';

export type PendingTransactionDelete = {
  id: string;
  name: string;
};

type TransactionDeleteContextValue = {
  pending: PendingTransactionDelete | null;
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
  const { pending, request, undo } = useUndoableDelete<PendingTransactionDelete>((target) => {
    if (!token) return;
    void deleteEntry(token, target.id)
      .then(notifyTransactionsChanged)
      .catch(() => {
        void dialog.alert({
          title: 'Delete failed',
          message: `${target.name} is still in your ledger. Check your connection and try again.`,
          tone: 'danger',
        });
        notifyTransactionsChanged();
      });
  });
  const claimToastHost = useCallback(() => {
    setToastHosts((count) => count + 1);
    return () => setToastHosts((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo(
    () => ({ pending, requestDelete: request, undoDelete: undo, claimToastHost }),
    [claimToastHost, pending, request, undo]
  );

  return (
    <TransactionDeleteContext.Provider value={value}>
      {children}
      {toastHosts === 0 && <UndoDeleteToast pending={pending} onUndo={undo} />}
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
  const { pending, undoDelete, claimToastHost } = useTransactionDelete();
  useEffect(() => claimToastHost(), [claimToastHost]);
  return <UndoDeleteToast pending={pending} onUndo={undoDelete} />;
}

export function useTransactionDelete() {
  const value = useContext(TransactionDeleteContext);
  if (!value) {
    throw new Error('useTransactionDelete must be used inside TransactionDeleteProvider');
  }
  return value;
}

function UndoDeleteToast({
  pending,
  onUndo,
}: {
  pending: PendingTransactionDelete | null;
  onUndo: () => void;
}) {
  const themeTokens = useThemeTokens();
  const motion = useMotion();
  const reveal = useSharedValue(0);
  const [shown, setShown] = useState<PendingTransactionDelete | null>(null);
  const toastBottom = useBottomInset(28);

  useEffect(() => {
    if (pending) setShown(pending);
  }, [pending]);

  useEffect(() => {
    if (pending) {
      reveal.value = withTiming(1, motion.enter('base'));
      return undefined;
    }
    reveal.value = withTiming(0, motion.exit('base'));
    const clear = setTimeout(() => setShown(null), motion.exitDuration('base'));
    return () => clearTimeout(clear);
  }, [motion, pending, reveal]);

  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [10, 0]) }],
  }));

  if (!shown) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={pending ? 'auto' : 'none'}
      className="absolute left-5 right-5 z-50 flex-row items-center justify-between rounded-2xl px-4 py-3 shadow-md"
      style={[{ backgroundColor: themeTokens.colors.text, bottom: toastBottom }, style]}>
      <View className="flex-1 flex-row items-center gap-2 pr-3">
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={16}
          color={themeTokens.colors.background}
        />
        <ThemedText
          numberOfLines={1}
          className="flex-1 text-xs font-bold"
          style={{ color: themeTokens.colors.background }}>
          Deleted {shown.name}
        </ThemedText>
      </View>
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
    </Animated.View>
  );
}
