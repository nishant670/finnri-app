import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import type { Account, AccountSuggestion } from '@/lib/accounts';

type TransactionAccountPickerProps = {
  visible: boolean;
  /** Accounts that can pay for the chosen mode. */
  accounts: Account[];
  selectedAccountId?: number | null;
  /** The chosen payment mode, named in the empty state. */
  mode: string;
  /** "Paid from" on an expense, "Received in" on income. */
  title?: string;
  /** What the empty state offers to set up when no account matches the mode. */
  suggestion: AccountSuggestion | null;
  isAutoCreating: boolean;
  autoCreateError: string | null;
  onClose: () => void;
  onSelect: (account: Account) => void;
  onSetupSuggestedAccount?: (suggestion: AccountSuggestion) => void;
  onAutoCreateSuggestedAccount?: (suggestion: AccountSuggestion) => void;
  onManageAccounts?: (suggestion?: AccountSuggestion) => void;
};

const ACCOUNT_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  cash: 'cash',
  bank: 'bank-outline',
  upi: 'cellphone',
  credit_card: 'credit-card-outline',
  wallet: 'wallet-outline',
};

/** The account sheet opened from the form's "Paid from" row, drawn like R2-Payment. */
export function TransactionAccountPicker({
  visible,
  accounts,
  selectedAccountId,
  mode,
  title = 'Paid from',
  suggestion,
  isAutoCreating,
  autoCreateError,
  onClose,
  onSelect,
  onSetupSuggestedAccount,
  onAutoCreateSuggestedAccount,
  onManageAccounts,
}: TransactionAccountPickerProps) {
  return (
    <PickerSheet visible={visible} title={title} onClose={onClose}>
      {accounts.length > 0 ? (
        <PickerOptionList
          accessibilityLabel={title}
          options={accounts.map((account) => ({
            key: String(account.id),
            label: account.name,
            caption: account.provider || account.type,
            icon: ACCOUNT_ICONS[account.type] ?? 'wallet-outline',
          }))}
          selectedKey={selectedAccountId == null ? null : String(selectedAccountId)}
          onSelect={(key) => {
            const account = accounts.find((candidate) => String(candidate.id) === key);
            if (account) onSelect(account);
          }}
        />
      ) : (
        <View style={styles.empty}>
          <ThemedText tone="muted" style={styles.emptyText}>
            {`No ${mode || 'matching'} account found.`}
          </ThemedText>
          {suggestion && onSetupSuggestedAccount ? (
            <Button
              label="Set up account"
              height={44}
              onPress={() => {
                onClose();
                onSetupSuggestedAccount(suggestion);
              }}
            />
          ) : null}
          {suggestion && onAutoCreateSuggestedAccount ? (
            <Button
              label={isAutoCreating ? 'Creating…' : 'Create one for me'}
              variant="outline"
              height={44}
              disabled={isAutoCreating}
              onPress={() => onAutoCreateSuggestedAccount(suggestion)}
            />
          ) : null}
          {autoCreateError ? (
            <ThemedText tone="negative" style={styles.error}>
              {autoCreateError}
            </ThemedText>
          ) : null}
          {onManageAccounts ? (
            <Button
              label="Manage accounts"
              variant="outline"
              height={36}
              onPress={() => {
                onClose();
                onManageAccounts(suggestion ?? undefined);
              }}
            />
          ) : null}
        </View>
      )}
      {accounts.length > 0 && onManageAccounts ? (
        <Button
          label="Add or manage payment accounts"
          variant="outline"
          icon="plus"
          height={44}
          style={styles.manage}
          onPress={() => {
            onClose();
            onManageAccounts();
          }}
        />
      ) : null}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  manage: {
    marginTop: 12,
  },
});
