import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

import { Pill } from '@/components/money/subscriptions/Pill';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
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
  /** Heading over the accounts: "Pay from" for autopay, "Paid from" for a payment made. */
  accountLabel: string;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
  testID?: string;
};

/**
 * A mode, then the account under it.
 *
 * Reported from a device: the accounts were drawn as the same pills as the
 * modes, so choosing "Bank Account" showed a second row holding one more pill
 * called "Bank Account" — the user's account, named after its type — and the
 * screen read as asking the same question twice. Accounts are now rows with an
 * icon, a heading saying what is being chosen, and a plain line when there is
 * none of that kind yet. Choosing a mode picks its default account, so the
 * common case is one tap.
 */
export function PaymentAccountPicker({
  accounts,
  accountID,
  paymentMode,
  onChange,
  onAddAccount,
  accountLabel,
  colors,
  muted,
  testID,
}: PaymentAccountPickerProps) {
  const compatible = getAccountsForPaymentMode(accounts, paymentMode);
  const noun = MODE_NOUN[paymentMode] ?? 'account';
  return (
    <View testID={testID}>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {RECURRING_PAYMENT_MODES.map((mode) => (
          <Pill
            key={mode}
            label={mode}
            selected={paymentMode === mode}
            onPress={() => {
              haptics.select();
              onChange({ paymentMode: mode, accountID: selectPaymentMode(accounts, mode) });
            }}
            colors={colors}
          />
        ))}
      </View>

      <ThemedText className="mb-2 mt-4 text-[11px] font-black uppercase" style={{ color: muted }}>
        {accountLabel}
      </ThemedText>
      {compatible.length === 0 ? (
        <ThemedText className="text-xs" style={{ color: muted }}>
          No {noun} added yet.
        </ThemedText>
      ) : (
        <View className="gap-2">
          {compatible.map((account) => {
            const selected = accountID === account.id;
            const detail = accountDetail(account);
            return (
              <Pressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${accountLabel} ${account.name}`}
                onPress={() => {
                  haptics.select();
                  onChange({ paymentMode, accountID: account.id });
                }}
                className="flex-row items-center gap-3 rounded-2xl border px-3 py-3"
                style={{
                  backgroundColor: selected ? colors.secondary : colors.card,
                  borderColor: selected ? colors.accent : colors.border,
                }}>
                <View
                  className="h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: selected ? colors.card : colors.secondary }}>
                  <MaterialCommunityIcons
                    name={accountIcon(account)}
                    size={18}
                    color={colors.accent}
                  />
                </View>
                <View className="flex-1">
                  <ThemedText
                    className="text-sm"
                    numberOfLines={1}
                    style={{ color: colors.text, fontFamily: Fonts.title }}>
                    {account.name}
                  </ThemedText>
                  {detail ? (
                    <ThemedText
                      className="mt-0.5 text-xs"
                      numberOfLines={1}
                      style={{ color: muted }}>
                      {detail}
                    </ThemedText>
                  ) : null}
                </View>
                <MaterialCommunityIcons
                  name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={selected ? colors.accent : muted}
                />
              </Pressable>
            );
          })}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        className="mt-3 flex-row items-center gap-2"
        onPress={onAddAccount}>
        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.accent} />
        <ThemedText className="text-xs font-black" style={{ color: colors.text }}>
          Add a {noun}
        </ThemedText>
      </Pressable>
    </View>
  );
}
