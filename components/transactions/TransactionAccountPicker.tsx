import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account, AccountSuggestion } from '@/lib/accounts';

type TransactionAccountPickerProps = {
  visible: boolean;
  /** Accounts that can pay for the chosen mode. */
  accounts: Account[];
  selectedAccountId?: number | null;
  /** The chosen payment mode, named in the empty state. */
  mode: string;
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

/** The account sheet opened from the composer's account row. */
export function TransactionAccountPicker({
  visible,
  accounts,
  selectedAccountId,
  mode,
  suggestion,
  isAutoCreating,
  autoCreateError,
  onClose,
  onSelect,
  onSetupSuggestedAccount,
  onAutoCreateSuggestedAccount,
  onManageAccounts,
}: TransactionAccountPickerProps) {
  const theme = useThemeTokens().colors;
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-10 pt-4" style={{ backgroundColor: theme.background }}>
        <ThemedText className="text-center text-base font-bold mb-6">Choose an account</ThemedText>
        <View className="gap-2">
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => onSelect(account)}
              className="p-4 rounded-2xl flex-row items-center justify-between border"
              style={{
                // Theme tokens, not bg-gray-50 / text-gray-700: those are
                // fixed light-mode colours, so in dark mode the rows were
                // near-white with near-white labels.
                backgroundColor: selectedAccountId === account.id ? `${accent}1F` : theme.card,
                borderColor: selectedAccountId === account.id ? accent : theme.border,
              }}>
              <View>
                <ThemedText
                  className="font-bold"
                  style={{ color: selectedAccountId === account.id ? accent : theme.text }}>
                  {account.name}
                </ThemedText>
                <ThemedText tone="muted" className="text-xs">
                  {account.provider || account.type}
                </ThemedText>
              </View>
              {selectedAccountId === account.id && (
                <MaterialCommunityIcons name="check" size={20} color={accent} />
              )}
            </Pressable>
          ))}
          {accounts.length === 0 && (
            <View className="items-center gap-4 py-4">
              <ThemedText tone="muted" className="text-center text-sm">
                {`No ${mode || 'matching'} account found.`}
              </ThemedText>
              {suggestion && onSetupSuggestedAccount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onSetupSuggestedAccount(suggestion);
                  }}
                  className="rounded-2xl px-5 py-3"
                  style={{ backgroundColor: accent }}>
                  <ThemedText tone="onAccent" className="font-bold">
                    Set up account
                  </ThemedText>
                </Pressable>
              ) : null}
              {suggestion && onAutoCreateSuggestedAccount ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isAutoCreating}
                  onPress={() => onAutoCreateSuggestedAccount(suggestion)}
                  className="rounded-2xl border px-5 py-3"
                  style={{ borderColor: accent }}>
                  <ThemedText className="font-bold" style={{ color: accent }}>
                    {isAutoCreating ? 'Creating…' : 'Create one for me'}
                  </ThemedText>
                </Pressable>
              ) : null}
              {autoCreateError ? (
                <ThemedText tone="negative" className="text-center text-xs">
                  {autoCreateError}
                </ThemedText>
              ) : null}
              {onManageAccounts ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onManageAccounts(suggestion ?? undefined);
                  }}
                  className="px-3 py-2">
                  <ThemedText tone="muted" className="text-xs font-bold">
                    Manage accounts
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}
          {accounts.length > 0 && onManageAccounts && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onManageAccounts();
              }}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl border p-4"
              style={{ borderColor: accent }}>
              <MaterialCommunityIcons name="plus-circle-outline" size={20} color={accent} />
              <ThemedText className="font-bold" style={{ color: accent }}>
                Add or manage payment accounts
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}
