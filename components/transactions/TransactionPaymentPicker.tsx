import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getAccountsForPaymentMode, type Account, type AccountSuggestion } from '@/lib/accounts';
import { paymentModeVisual } from '@/lib/payment-modes';

type TransactionPaymentPickerProps = {
  visible: boolean;
  /** "Paid with" on an expense, "Received in" on income. */
  title: string;
  modes: readonly string[];
  /** Every account; each is listed under the method that pays from it. */
  accounts: Account[];
  selectedMode: string;
  selectedAccountId: number | null;
  /**
   * False for a split a friend paid: no account of yours is involved, so the
   * sheet lists methods only.
   */
  showAccounts: boolean;
  onClose: () => void;
  /** A method alone (null account) or a method and the account it paid from. */
  onSelect: (mode: string, account: Account | null) => void;
  /** Offered when the chosen method has no account yet. */
  suggestion?: AccountSuggestion | null;
  isAutoCreating?: boolean;
  autoCreateError?: string | null;
  onSetupSuggestedAccount?: (suggestion: AccountSuggestion) => void;
  onAutoCreateSuggestedAccount?: (suggestion: AccountSuggestion) => void;
  onManageAccounts?: (suggestion?: AccountSuggestion) => void;
};

type Row =
  | { kind: 'header'; key: string; mode: string }
  | {
      kind: 'option';
      key: string;
      mode: string;
      account: Account | null;
      label: string;
      caption?: string;
      icon: keyof typeof MaterialCommunityIcons.glyphMap;
      indent: boolean;
      selected: boolean;
    };

/**
 * Builds the sheet's rows (P6): one row for a method with no account or with
 * one, and for a method with several, the method as a small heading over one
 * row per account. Choosing an account sets both halves of the entry.
 */
export const buildPaymentRows = ({
  modes,
  accounts,
  selectedMode,
  selectedAccountId,
  showAccounts,
}: Pick<
  TransactionPaymentPickerProps,
  'modes' | 'accounts' | 'selectedMode' | 'selectedAccountId' | 'showAccounts'
>): Row[] => {
  const rows: Row[] = [];
  modes.forEach((mode) => {
    const icon = paymentModeVisual(mode).icon as keyof typeof MaterialCommunityIcons.glyphMap;
    const modeAccounts = showAccounts ? getAccountsForPaymentMode(accounts, mode) : [];
    const modeSelected = selectedMode === mode;

    if (modeAccounts.length <= 1) {
      const account = modeAccounts[0] ?? null;
      rows.push({
        kind: 'option',
        key: `mode:${mode}`,
        mode,
        account,
        label: mode,
        caption: showAccounts ? (account?.name ?? 'No account added') : undefined,
        icon,
        indent: false,
        selected: modeSelected,
      });
      return;
    }

    rows.push({ kind: 'header', key: `header:${mode}`, mode });
    modeAccounts.forEach((account) => {
      rows.push({
        kind: 'option',
        key: `account:${mode}:${account.id}`,
        mode,
        account,
        label: account.name,
        caption: account.provider || undefined,
        icon,
        indent: true,
        selected: modeSelected && selectedAccountId === account.id,
      });
    });
  });
  return rows;
};

/**
 * One "Paid with" sheet for how and from where (board R2-Entry-Proposals, P6),
 * replacing the separate "Paid via" and "Paid from" pickers. Drawn like the
 * other pickers: one card of 52dp rows, the chosen one tinted, bold and ticked.
 */
export function TransactionPaymentPicker({
  visible,
  title,
  modes,
  accounts,
  selectedMode,
  selectedAccountId,
  showAccounts,
  onClose,
  onSelect,
  suggestion,
  isAutoCreating = false,
  autoCreateError,
  onSetupSuggestedAccount,
  onAutoCreateSuggestedAccount,
  onManageAccounts,
}: TransactionPaymentPickerProps) {
  const { colors } = useThemeTokens();
  const rows = buildPaymentRows({ modes, accounts, selectedMode, selectedAccountId, showAccounts });
  const selectedModeHasAccount =
    !showAccounts || getAccountsForPaymentMode(accounts, selectedMode).length > 0;

  return (
    <PickerSheet visible={visible} title={title} onClose={onClose}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.map((row, index) => {
          const divider = index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null;
          if (row.kind === 'header') {
            const icon = paymentModeVisual(row.mode)
              .icon as keyof typeof MaterialCommunityIcons.glyphMap;
            return (
              <View key={row.key} style={[styles.header, divider]}>
                <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
                <ThemedText
                  accessibilityRole="header"
                  style={[styles.headerLabel, { color: colors.text }]}>
                  {row.mode}
                </ThemedText>
              </View>
            );
          }
          return (
            <Fragment key={row.key}>
              <PressableView
                testID={row.indent && row.account ? `payment-account-${row.account.id}` : `payment-mode-${row.mode}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: row.selected }}
                accessibilityLabel={row.indent ? `${row.mode}, ${row.label}` : row.label}
                onPress={() => onSelect(row.mode, row.account)}
                style={[
                  styles.option,
                  row.indent ? styles.optionIndent : null,
                  row.indent ? null : divider,
                  row.selected && { backgroundColor: colors.selectedFill },
                ]}
                pressedStyle={styles.pressed}>
                {row.indent ? null : (
                  <MaterialCommunityIcons name={row.icon} size={20} color={colors.text} />
                )}
                <View style={styles.optionText}>
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.optionLabel,
                      { color: colors.text, fontWeight: row.selected ? '700' : '500' },
                    ]}>
                    {row.label}
                  </ThemedText>
                  {row.caption ? (
                    <ThemedText tone="muted" numberOfLines={1} style={styles.optionCaption}>
                      {row.caption}
                    </ThemedText>
                  ) : null}
                </View>
                {row.selected ? (
                  <MaterialCommunityIcons name="check" size={20} color={colors.text} />
                ) : null}
              </PressableView>
            </Fragment>
          );
        })}
      </View>

      {showAccounts && !selectedModeHasAccount && suggestion ? (
        <View style={styles.setup}>
          {onSetupSuggestedAccount ? (
            <Button
              label="Set up account"
              height={44}
              onPress={() => {
                onClose();
                onSetupSuggestedAccount(suggestion);
              }}
            />
          ) : null}
          {onAutoCreateSuggestedAccount ? (
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
        </View>
      ) : null}

      {showAccounts && onManageAccounts ? (
        <Button
          label="Add or manage payment accounts"
          variant="outline"
          icon="plus"
          height={44}
          style={styles.manage}
          onPress={() => {
            onClose();
            onManageAccounts(suggestion ?? undefined);
          }}
        />
      ) : null}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  headerLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  // Under its method's heading, lined up with the heading's text.
  optionIndent: {
    minHeight: 48,
    paddingLeft: 46,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  optionCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  setup: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  manage: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
