import { useState } from 'react';

import { ThemedConfirmDialog } from '@/components/ui/ThemedConfirmDialog';
import { type Account, updateAccount } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { statementDayDriftCopy, statementDayUpdatePayload } from '@/lib/statement-day-drift';
import type { StatementDaySuggestion } from '@/lib/statements';

type StatementDayDriftDialogProps = {
  token: string | null;
  card: Account | null;
  /** Shown while non-null. */
  suggestion: StatementDaySuggestion | null;
  /** `moved` is true once the card's billing day was updated. */
  onClose: (moved: boolean) => void;
  onError: (message: string) => void;
};

/**
 * Asks whether the bank moved the card's billing date, after a statement was
 * saved on a different day. The statement is already saved either way; this
 * only decides where future drafts and reminders anchor.
 */
export function StatementDayDriftDialog({ token, card, suggestion, onClose, onError }: StatementDayDriftDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const copy = suggestion && card ? statementDayDriftCopy(suggestion, card.name) : null;

  const accept = async () => {
    if (!token || !card || !suggestion || isSaving) return;
    setIsSaving(true);
    try {
      await updateAccount(token, card.id, statementDayUpdatePayload(card, suggestion));
      onClose(true);
    } catch (error) {
      onClose(false);
      onError(getFriendlyErrorMessage(error, 'Unable to update the card’s billing day.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedConfirmDialog
      visible={Boolean(copy)}
      title={copy?.title ?? ''}
      message={copy?.message ?? ''}
      confirmLabel={copy?.confirmLabel ?? ''}
      cancelLabel={copy?.cancelLabel}
      iconName="calendar-sync-outline"
      loading={isSaving}
      onCancel={() => {
        if (!isSaving) onClose(false);
      }}
      onConfirm={() => void accept()}
    />
  );
}
