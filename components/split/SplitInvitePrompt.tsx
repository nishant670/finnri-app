import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { ThemedConfirmDialog } from '@/components/ui/ThemedConfirmDialog';
import { useAuthStore } from '@/hooks/use-auth-store';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { deferSplitInvite, isSplitInviteDeferred } from '@/lib/split-invite-deferrals';
import {
  acceptSplitGroupInvite,
  fetchPendingSplitGroupInvites,
  type PendingSplitGroupInvite,
} from '@/lib/splits';

/**
 * The invite, brought to the user instead of left in a screen they may never
 * open.
 *
 * Being added to a group is somebody else's decision about you, so it is put in
 * front of you on open with both answers available: accept, and you are in the
 * group; check later, and it waits unread in notifications exactly as it was.
 * Neither answer is the quiet one — closing the dialog is a deferral, not a
 * refusal, and nothing is marked read until it is actually acted on.
 */
export function SplitInvitePrompt() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const dialog = useAppDialog();
  const [invites, setInvites] = useState<PendingSplitGroupInvite[]>([]);
  const [accepting, setAccepting] = useState(false);
  const loadingRef = useRef(false);

  const loadPendingInvites = useCallback(async () => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const pending = await fetchPendingSplitGroupInvites(token);
      setInvites(pending.filter((invite) => !isSplitInviteDeferred(invite.id)));
    } finally {
      loadingRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setInvites([]);
      return;
    }
    void loadPendingInvites();
  }, [loadPendingInvites, token]);

  // Coming back from the background is opening the app too. Anything already
  // deferred stays deferred, so this can only surface something new.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void loadPendingInvites();
    });
    return () => subscription.remove();
  }, [loadPendingInvites]);

  const current = invites[0] ?? null;

  const deferInvite = () => {
    if (!current) return;
    deferSplitInvite(current.id);
    setInvites((pending) => pending.filter((invite) => invite.id !== current.id));
  };

  const acceptInvite = async () => {
    if (!token || !current || accepting) return;
    setAccepting(true);
    try {
      await acceptSplitGroupInvite(token, current.token);
      const remaining = invites.filter((invite) => invite.id !== current.id);
      setInvites(remaining);
      // Land where the group now is, so "you have joined" is something the user
      // sees rather than something they are told.
      if (remaining.length === 0) router.push('/split');
    } catch (acceptError) {
      // The dialog owns the screen, so the failure has to replace it rather
      // than sit behind it. Deferring keeps the invite in notifications, where
      // the full invite screen can explain a paywall or a revoked link.
      deferInvite();
      void dialog.alert({
        title: `Could not join ${current.group_name}`,
        message: getFriendlyErrorMessage(acceptError, 'Unable to join this split group right now.'),
        tone: 'error',
      });
    } finally {
      setAccepting(false);
    }
  };

  if (!current) return null;

  return (
    <ThemedConfirmDialog
      visible
      title={`Join ${current.group_name}?`}
      message={`${current.owner_name} added you to ${current.group_name} on Finnri. Accept to see the group and everything already split in it.`}
      iconName="account-group-outline"
      confirmLabel="Accept"
      cancelLabel="Check later"
      loading={accepting}
      onCancel={deferInvite}
      onConfirm={() => void acceptInvite()}
    />
  );
}
