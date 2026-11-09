import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  getAccountTypeForPaymentMode,
  getAccountsForPaymentMode,
  normalizeAccountType,
  type Account,
  type AccountSuggestion,
} from '@/lib/accounts';
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

/** From this many accounts the sheet folds them (board R16-PaidWith-A). */
export const COMPACT_PAYMENT_ACCOUNTS = 6;
const USUAL_ACCOUNTS = 3;

type AccountChoice = { mode: string; account: Account };

/** Each account once, under the method that pays from it. */
const accountChoices = (modes: readonly string[], accounts: Account[]): AccountChoice[] =>
  accounts.flatMap((account) => {
    const mode = modes.find(
      (candidate) => getAccountTypeForPaymentMode(candidate) === normalizeAccountType(account.type)
    );
    return mode ? [{ mode, account }] : [];
  });

const usedLessRecently = (a: Account, b: Account) => {
  const month = (b.summary?.entries_this_month ?? 0) - (a.summary?.entries_this_month ?? 0);
  if (month !== 0) return month;
  const last = (b.summary?.last_activity_date ?? '').localeCompare(a.summary?.last_activity_date ?? '');
  if (last !== 0) return last;
  return (b.summary?.entries_total ?? 0) - (a.summary?.entries_total ?? 0);
};

/**
 * The few accounts worth one tap: the most used lately, in that order so they
 * stay put between opens. The chosen account always makes the list, or its
 * tick would be folded away. A never-used account only earns a place by being
 * a default.
 */
export const usualPaymentAccounts = ({
  modes,
  accounts,
  selectedAccountId,
}: Pick<TransactionPaymentPickerProps, 'modes' | 'accounts' | 'selectedAccountId'>) => {
  const ranked = accountChoices(modes, accounts)
    .filter(
      ({ account }) =>
        (account.summary?.entries_total ?? 0) > 0 ||
        account.is_default ||
        account.id === selectedAccountId
    )
    .sort((a, b) => usedLessRecently(a.account, b.account));
  const usual = ranked.slice(0, USUAL_ACCOUNTS);
  const chosen = ranked.find(({ account }) => account.id === selectedAccountId);
  if (chosen && !usual.includes(chosen)) usual[usual.length - 1] = chosen;
  return usual;
};

/** Accounts whose name, bank, last digits or method match what was typed. */
export const searchPaymentAccounts = (
  modes: readonly string[],
  accounts: Account[],
  query: string
) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return accountChoices(modes, accounts).filter(({ mode, account }) =>
    [account.name, account.provider, account.last4, mode].some((field) =>
      field?.toLowerCase().includes(needle)
    )
  );
};

const accountCaption = ({ mode, account }: AccountChoice) =>
  normalizeAccountType(account.type) === 'cash'
    ? 'Money in hand'
    : [mode, account.last4 ? `••${account.last4}` : ''].filter(Boolean).join(' ');

const accountCount = (mode: string, count: number) => {
  const noun = getAccountTypeForPaymentMode(mode) === 'credit_card' ? 'card' : 'account';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

/**
 * One "Paid with" sheet for how and from where (board R2-Entry-Proposals, P6),
 * replacing the separate "Paid via" and "Paid from" pickers. Drawn like the
 * other pickers: one card of 52dp rows, the chosen one tinted, bold and ticked.
 *
 * With many accounts that card runs off the screen, so it becomes search, the
 * usual few, and every method folded behind a count. With only a handful the
 * plain list is shorter than the folds would be, and it stays.
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
  const [query, setQuery] = useState('');
  const [openMode, setOpenMode] = useState<string | null>(null);
  useEffect(() => {
    if (visible) return;
    setQuery('');
    setOpenMode(null);
  }, [visible]);
  const compact = showAccounts && accounts.length >= COMPACT_PAYMENT_ACCOUNTS;
  const rows = buildPaymentRows({ modes, accounts, selectedMode, selectedAccountId, showAccounts });
  const selectedModeHasAccount =
    !showAccounts || getAccountsForPaymentMode(accounts, selectedMode).length > 0;
  /**
   * The chosen method has no account yet: its row grows a short panel with
   * the two ways to add one, so the buttons sit with the row they are about.
   */
  const showSetupPanel =
    showAccounts &&
    !selectedModeHasAccount &&
    !!suggestion &&
    (!!onAutoCreateSuggestedAccount || !!onSetupSuggestedAccount);

  const divider = { borderTopWidth: 1, borderTopColor: colors.border };
  const cardColors = { backgroundColor: colors.card, borderColor: colors.border };

  const setupPanel = (mode: string) => (
    <View
      testID="payment-setup-panel"
      style={[styles.setupPanel, { backgroundColor: colors.selectedFill }]}>
      <ThemedText tone="muted" style={styles.setupText}>
        {`Add your ${mode} account so entries show where the money came from.`}
      </ThemedText>
      <View style={styles.setupActions}>
        {onAutoCreateSuggestedAccount && suggestion ? (
          <Button
            label={isAutoCreating ? 'Creating…' : 'Create one for me'}
            height={40}
            disabled={isAutoCreating}
            style={styles.setupAction}
            onPress={() => onAutoCreateSuggestedAccount(suggestion)}
          />
        ) : null}
        {onSetupSuggestedAccount && suggestion ? (
          <Button
            label="Set up"
            variant="outline"
            height={40}
            style={styles.setupAction}
            onPress={() => {
              onClose();
              onSetupSuggestedAccount(suggestion);
            }}
          />
        ) : null}
      </View>
      {autoCreateError ? (
        <ThemedText tone="negative" style={styles.error}>
          {autoCreateError}
        </ThemedText>
      ) : null}
    </View>
  );

  const manageRow =
    showAccounts && onManageAccounts ? (
      <PressableView
        testID="payment-manage-accounts"
        accessibilityRole="button"
        onPress={() => {
          onClose();
          onManageAccounts(suggestion ?? undefined);
        }}
        style={[styles.option, divider]}
        pressedStyle={styles.pressed}>
        <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
        <ThemedText style={[styles.optionLabel, styles.optionText, { color: colors.text }]}>
          Add or manage accounts
        </ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
      </PressableView>
    ) : null;

  /** An account with its method and last digits under its name. */
  const accountRow = (choice: AccountChoice, testID: string, withDivider: boolean) => {
    const selected = selectedMode === choice.mode && selectedAccountId === choice.account.id;
    return (
      <PressableView
        key={testID}
        testID={testID}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${choice.mode}, ${choice.account.name}`}
        onPress={() => onSelect(choice.mode, choice.account)}
        style={[
          styles.usualRow,
          withDivider ? divider : null,
          selected && { backgroundColor: colors.selectedFill },
        ]}
        pressedStyle={styles.pressed}>
        <View style={styles.optionText}>
          <ThemedText
            numberOfLines={1}
            style={[styles.optionLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
            {choice.account.name}
          </ThemedText>
          <ThemedText tone="muted" numberOfLines={1} style={styles.optionCaption}>
            {accountCaption(choice)}
          </ThemedText>
        </View>
        {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.text} /> : null}
      </PressableView>
    );
  };

  /** One method: a plain row with no account or one, a fold with several. */
  const methodRow = (mode: string, index: number) => {
    const modeAccounts = getAccountsForPaymentMode(accounts, mode);
    const withDivider = index > 0 ? divider : null;
    if (modeAccounts.length <= 1) {
      const account = modeAccounts[0] ?? null;
      const selected = selectedMode === mode;
      const panel = showSetupPanel && selected;
      return (
        <Fragment key={mode}>
          <PressableView
            testID={`payment-mode-${mode}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={mode}
            onPress={() => onSelect(mode, account)}
            style={[
              styles.option,
              withDivider,
              selected && { backgroundColor: colors.selectedFill },
            ]}
            pressedStyle={styles.pressed}>
            <ThemedText
              numberOfLines={1}
              style={[
                styles.optionLabel,
                styles.optionText,
                { color: colors.text, fontWeight: selected ? '700' : '500' },
              ]}>
              {mode}
            </ThemedText>
            {panel ? null : (
              <ThemedText tone="muted" numberOfLines={1} style={styles.count}>
                {account?.name ?? 'No account added'}
              </ThemedText>
            )}
            {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.text} /> : null}
          </PressableView>
          {panel ? setupPanel(mode) : null}
        </Fragment>
      );
    }
    const open = openMode === mode;
    const hasSelection = selectedMode === mode && modeAccounts.some((a) => a.id === selectedAccountId);
    return (
      <Fragment key={mode}>
        <PressableView
          testID={`payment-group-${mode}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${mode}, ${accountCount(mode, modeAccounts.length)}`}
          onPress={() => setOpenMode(open ? null : mode)}
          style={[styles.option, withDivider]}
          pressedStyle={styles.pressed}>
          <ThemedText
            numberOfLines={1}
            style={[
              styles.optionLabel,
              styles.optionText,
              { color: colors.text, fontWeight: open || hasSelection ? '700' : '500' },
            ]}>
            {mode}
          </ThemedText>
          <ThemedText tone="muted" style={styles.count}>
            {accountCount(mode, modeAccounts.length)}
          </ThemedText>
          <MaterialCommunityIcons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.muted}
          />
        </PressableView>
        {open ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={mode}>
            {modeAccounts.map((account) => {
              const selected = selectedMode === mode && selectedAccountId === account.id;
              return (
                <PressableView
                  key={account.id}
                  testID={`payment-account-${account.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${mode}, ${account.name}`}
                  onPress={() => onSelect(mode, account)}
                  style={[
                    styles.option,
                    styles.foldedAccount,
                    divider,
                    selected && { backgroundColor: colors.selectedFill },
                  ]}
                  pressedStyle={styles.pressed}>
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.optionLabel,
                      styles.optionText,
                      { color: colors.text, fontWeight: selected ? '700' : '500' },
                    ]}>
                    {account.name}
                  </ThemedText>
                  {account.last4 ? (
                    <ThemedText tone="muted" style={styles.count}>
                      {`••${account.last4}`}
                    </ThemedText>
                  ) : null}
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={20} color={colors.text} />
                  ) : null}
                </PressableView>
              );
            })}
          </View>
        ) : null}
      </Fragment>
    );
  };

  if (compact) {
    const searching = query.trim() !== '';
    const results = searchPaymentAccounts(modes, accounts, query);
    const usual = usualPaymentAccounts({ modes, accounts, selectedAccountId });
    return (
      <PickerSheet visible={visible} title={title} onClose={onClose} avoidKeyboard>
        <View style={[styles.search, cardColors]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search your accounts"
            value={query}
            onChangeText={setQuery}
            placeholder="Search your accounts"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>

        {searching ? (
          results.length > 0 ? (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Search results"
              style={[styles.card, styles.firstCard, cardColors]}>
              {results.map((choice, index) =>
                accountRow(choice, `payment-result-${choice.account.id}`, index > 0)
              )}
            </View>
          ) : (
            <ThemedText tone="muted" style={styles.noResults}>
              {`No account matches "${query.trim()}".`}
            </ThemedText>
          )
        ) : (
          <>
            {usual.length > 0 ? (
              <>
                <ThemedText accessibilityRole="header" style={[styles.section, { color: colors.text }]}>
                  Your usual
                </ThemedText>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Your usual"
                  style={[styles.card, cardColors]}>
                  {usual.map((choice, index) =>
                    accountRow(choice, `payment-usual-${choice.account.id}`, index > 0)
                  )}
                </View>
              </>
            ) : null}
            <ThemedText accessibilityRole="header" style={[styles.section, { color: colors.text }]}>
              All accounts
            </ThemedText>
            <View style={[styles.card, cardColors]}>
              {modes.map(methodRow)}
              {manageRow}
            </View>
          </>
        )}
      </PickerSheet>
    );
  }

  return (
    <PickerSheet visible={visible} title={title} onClose={onClose}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        style={[styles.card, cardColors]}>
        {rows.map((row, index) => {
          const rowDivider = index > 0 ? divider : null;
          if (row.kind === 'header') {
            const icon = paymentModeVisual(row.mode)
              .icon as keyof typeof MaterialCommunityIcons.glyphMap;
            return (
              <View key={row.key} style={[styles.header, rowDivider]}>
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
                  row.indent ? null : rowDivider,
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
                  {/* The setup panel under this row says it better. */}
                  {row.caption && !(showSetupPanel && row.selected && !row.indent) ? (
                    <ThemedText tone="muted" numberOfLines={1} style={styles.optionCaption}>
                      {row.caption}
                    </ThemedText>
                  ) : null}
                </View>
                {row.selected ? (
                  <MaterialCommunityIcons name="check" size={20} color={colors.text} />
                ) : null}
              </PressableView>
              {showSetupPanel && row.selected && !row.indent ? setupPanel(row.mode) : null}
            </Fragment>
          );
        })}

        {/* The way out to the accounts screen ends the list, as one more row,
            rather than a third button of another width under it. */}
        {manageRow}
      </View>
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
  setupPanel: {
    gap: 10,
    paddingLeft: 46,
    paddingRight: 14,
    paddingBottom: 14,
  },
  setupText: {
    fontSize: 13,
    lineHeight: 18,
  },
  setupActions: {
    flexDirection: 'row',
    gap: 8,
  },
  setupAction: {
    flex: 1,
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
  },
  search: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  section: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  firstCard: {
    marginTop: 12,
  },
  usualRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  foldedAccount: {
    minHeight: 48,
    paddingLeft: 28,
  },
  count: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  noResults: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 24,
  },
  pressed: {
    opacity: 0.7,
  },
});
