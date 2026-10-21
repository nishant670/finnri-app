import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { RECURRING_LABEL_WIDTH } from '@/components/money/subscriptions/FormRows';
import { ThemedText } from '@/components/themed-text';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  getAccountsForPaymentMode,
  getPreferredAccountForPaymentMode,
  normalizeAccountType,
  type Account,
} from '@/lib/accounts';
import { haptics } from '@/lib/haptics';

/** How a recurring payment can leave an account. Cash has no account to draw on. */
export const RECURRING_PAYMENT_MODES = ['Bank Account', 'UPI', 'Credit Card'] as const;

const MODE_NOUN: Record<string, string> = {
  'Bank Account': 'bank account',
  UPI: 'UPI account',
  'Credit Card': 'credit card',
};

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const MODE_ICON: Record<string, IconName> = {
  'Bank Account': 'bank-outline',
  UPI: 'cellphone',
  'Credit Card': 'credit-card-outline',
};

const accountIcon = (account: Account): IconName => {
  switch (normalizeAccountType(account.type)) {
    case 'credit_card':
    case 'debit_card':
      return 'credit-card-outline';
    case 'upi':
      return 'cellphone';
    case 'wallet':
      return 'wallet-outline';
    default:
      return 'bank-outline';
  }
};

/** The line under an account's name that tells two of the same kind apart. */
const accountDetail = (account: Account) =>
  [
    account.provider_details?.display_name || account.provider,
    account.last4 ? `•• ${account.last4}` : account.upi_handle,
  ]
    .filter((part) => part && part.trim() && part.trim() !== account.name.trim())
    .join(' · ');

/** The account a mode starts on: the default of that kind, else the first. */
export function selectPaymentMode(accounts: Account[], mode: string) {
  return getPreferredAccountForPaymentMode(accounts, mode)?.id ?? null;
}

/**
 * A mode and account to start on when a payment now needs one — Autopay turned
 * on, Daily chosen, a payment logged. The current pick if it is usable; Cash,
 * the form's starting mode, is not, so that becomes a bank account and its
 * default rather than nothing selected.
 */
export function usablePayment(
  accounts: Account[],
  paymentMode: string,
  accountID: number | null
): { paymentMode: string; accountID: number | null } {
  if (!(RECURRING_PAYMENT_MODES as readonly string[]).includes(paymentMode)) {
    return { paymentMode: 'Bank Account', accountID: selectPaymentMode(accounts, 'Bank Account') };
  }
  return { paymentMode, accountID: accountID ?? selectPaymentMode(accounts, paymentMode) };
}

type PaymentAccountPickerProps = {
  accounts: Account[];
  accountID: number | null;
  paymentMode: string;
  onChange: (next: { paymentMode: string; accountID: number | null }) => void;
  onAddAccount: () => void;
  /** The account row's name: "Pay from" for autopay, "Paid from" for a payment made. */
  accountLabel: string;
  /** The mode row's name; "Pay via" beside "Pay from", "Paid via" beside "Paid from". */
  modeLabel?: string;
  /** Draws the rule above the first row, when the rows follow others in a card. */
  divider?: boolean;
  testID?: string;
};

/**
 * A mode, then the account under it, as two rows of the card they sit in
 * (boards R5-NewLoan, R2-Payment). Each opens its own picker sheet.
 *
 * Reported from a device: the accounts were once drawn as the same pills as
 * the modes, so "Bank Account" the mode and "Bank Account" the account read
 * as one question asked twice. The account is its own row, named for what is
 * being chosen. Choosing a mode picks its default account, so the common case
 * is one choice.
 */
export function PaymentAccountPicker({
  accounts,
  accountID,
  paymentMode,
  onChange,
  onAddAccount,
  accountLabel,
  modeLabel = accountLabel.startsWith('Paid') ? 'Paid via' : 'Pay via',
  divider = false,
  testID,
}: PaymentAccountPickerProps) {
  const { colors } = useThemeTokens();
  const [sheet, setSheet] = useState<'mode' | 'account' | null>(null);
  const compatible = getAccountsForPaymentMode(accounts, paymentMode);
  const noun = MODE_NOUN[paymentMode] ?? 'account';
  const selected = compatible.find((account) => account.id === accountID);
  const selectedDetail = selected ? accountDetail(selected) : '';

  return (
    <View testID={testID}>
      <LabelRow
        label={modeLabel}
        value={paymentMode}
        icon={MODE_ICON[paymentMode]}
        iconColor={colors.text}
        divider={divider}
        labelWidth={RECURRING_LABEL_WIDTH}
        onPress={() => setSheet('mode')}
      />
      <LabelRow
        label={accountLabel}
        value={selected ? selected.name : compatible.length > 0 ? 'Choose' : `No ${noun} yet`}
        valueMuted={!selected}
        icon={selected ? accountIcon(selected) : undefined}
        iconColor={colors.text}
        detail={selectedDetail || undefined}
        divider
        labelWidth={RECURRING_LABEL_WIDTH}
        accessibilityLabel={selected ? `${accountLabel} ${selected.name}` : accountLabel}
        onPress={() => setSheet('account')}
      />

      <PickerSheet visible={sheet === 'mode'} title={modeLabel} onClose={() => setSheet(null)}>
        <PickerOptionList
          accessibilityLabel={modeLabel}
          options={RECURRING_PAYMENT_MODES.map((mode) => ({ key: mode, label: mode, icon: MODE_ICON[mode] }))}
          selectedKey={paymentMode}
          onSelect={(mode) => {
            haptics.select();
            onChange({ paymentMode: mode, accountID: selectPaymentMode(accounts, mode) });
            setSheet(null);
          }}
        />
      </PickerSheet>

      <PickerSheet visible={sheet === 'account'} title={accountLabel} onClose={() => setSheet(null)}>
        {compatible.length === 0 ? (
          <ThemedText tone="muted" style={styles.empty}>
            No {noun} added yet.
          </ThemedText>
        ) : (
          <PickerOptionList
            accessibilityLabel={accountLabel}
            options={compatible.map((account) => ({
              key: String(account.id),
              label: account.name,
              caption: accountDetail(account) || undefined,
              icon: accountIcon(account),
            }))}
            selectedKey={accountID != null ? String(accountID) : null}
            onSelect={(key) => {
              haptics.select();
              onChange({ paymentMode, accountID: Number(key) });
              setSheet(null);
            }}
          />
        )}
        <PressableView
          accessibilityRole="button"
          onPress={() => {
            setSheet(null);
            onAddAccount();
          }}
          style={styles.add}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
          <ThemedText style={[styles.addLabel, { color: colors.text }]}>Add a {noun}</ThemedText>
        </PressableView>
      </PickerSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  add: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    paddingHorizontal: 14,
  },
  addLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
