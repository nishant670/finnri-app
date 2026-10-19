import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { BillingInterval, RecurringKind, SubscriptionStatus } from '@/lib/subscriptions';
import { ChipPicker } from '@/components/money/subscriptions/ChipPicker';
import { Field } from '@/components/money/subscriptions/Field';
import { Fonts } from '@/constants/theme';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { Pill } from '@/components/money/subscriptions/Pill';
import {
  PaymentAccountPicker,
  usablePayment,
} from '@/components/money/subscriptions/PaymentAccountPicker';
import { SegmentedControl } from '@/components/money/subscriptions/SegmentedControl';
import { ThemedText } from '@/components/themed-text';
import { type Account } from '@/lib/accounts';
import {
  reminderOptions,
  reminderLabel,
  categoryOptions,
  statusOptions,
} from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** What each kind's notes usually hold. */
const NOTES_PLACEHOLDER: Record<RecurringKind, string> = {
  subscription: 'Plan tier, cancellation link, family plan details',
  loan: 'Loan account number, branch, prepayment terms',
  investment: 'Folio number, goal, nominee',
  bill: 'Consumer number, biller ID',
};

type SubscriptionAdvancedFieldsProps = {
  accountID: number | null;
  accounts: Account[];
  autopay: boolean;
  cancelBeforeDue: boolean;
  cancelOnDate: string;
  category: string;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  formKind: RecurringKind;
  interval: BillingInterval;
  isEditing: boolean;
  merchant: string;
  muted: string;
  name: string;
  notes: string;
  onAddAccount: () => void;
  openCancellationDatePicker: () => void;
  paymentMode: string;
  reminderDays: number;
  setAccountID: Dispatch<SetStateAction<number | null>>;
  setAutopay: Dispatch<SetStateAction<boolean>>;
  setCancelBeforeDue: Dispatch<SetStateAction<boolean>>;
  setCategory: Dispatch<SetStateAction<string>>;
  setName: Dispatch<SetStateAction<string>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setPaymentMode: Dispatch<SetStateAction<string>>;
  setReminderDays: Dispatch<SetStateAction<number>>;
  setStatus: Dispatch<SetStateAction<SubscriptionStatus>>;
  status: SubscriptionStatus;
};

export function SubscriptionAdvancedFields({
  accountID,
  accounts,
  autopay,
  cancelBeforeDue,
  cancelOnDate,
  category,
  colors,
  formKind,
  interval,
  isEditing,
  merchant,
  muted,
  name,
  notes,
  onAddAccount,
  openCancellationDatePicker,
  paymentMode,
  reminderDays,
  setAccountID,
  setAutopay,
  setCancelBeforeDue,
  setCategory,
  setName,
  setNotes,
  setPaymentMode,
  setReminderDays,
  setStatus,
  status,
}: SubscriptionAdvancedFieldsProps) {
  return (
    <View>
      {isEditing && (
        <SegmentedControl
          label="Status"
          values={statusOptions}
          active={status}
          onSelect={setStatus}
          colors={colors}
        />
      )}

      <Field
        label="Display name"
        value={name}
        onChangeText={setName}
        colors={colors}
        placeholder={merchant.trim() || 'Same as merchant'}
      />

      {/* The spending category each payment is filed under. An investment
          is not spending, and offering "Food & Drinks" for a PPF instalment
          was the first thing questioned on device, so it is not asked. */}
      {formKind !== 'investment' ? (
        <ChipPicker
          label="Spending category"
          hint="Each payment this adds is filed under it."
          options={categoryOptions}
          active={category}
          onSelect={setCategory}
          colors={colors}
        />
      ) : null}

      {interval !== 'daily' && interval !== 'business_daily' ? (
        <View className="mb-4">
          <ThemedText className="mb-2 text-[11px] font-black uppercase" style={{ color: muted }}>
            Reminder
          </ThemedText>
          <View className="flex-row flex-wrap gap-2">
            {reminderOptions.map((days) => (
              <Pill
                key={days}
                label={reminderLabel(days)}
                selected={reminderDays === days}
                onPress={() => setReminderDays(days)}
                colors={colors}
              />
            ))}
          </View>
        </View>
      ) : (
        <View className="mb-4 rounded-2xl p-3" style={{ backgroundColor: colors.secondary }}>
          <ThemedText className="text-xs font-bold" style={{ color: colors.text }}>
            Daily transactions are added automatically. No daily reminder is sent.
          </ThemedText>
        </View>
      )}

      <View
        className="mb-4 rounded-2xl border p-4"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <ThemedText className="text-sm font-black">Autopay</ThemedText>
            <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
              Finnri adds each payment for you, then asks you to confirm it.
            </ThemedText>
          </View>
          <HapticSwitch
            value={autopay}
            onValueChange={(enabled) => {
              setAutopay(enabled);
              if (!enabled) return;
              const next = usablePayment(accounts, paymentMode, accountID);
              setPaymentMode(next.paymentMode);
              setAccountID(next.accountID);
            }}
            trackColor={{ false: '#E0E0E0', true: colors.accent }}
            thumbColor="white"
          />
        </View>
        {autopay && (
          <PaymentAccountPicker
            testID="recurring-autopay-account"
            accounts={accounts}
            accountID={accountID}
            paymentMode={paymentMode}
            onChange={(next) => {
              setPaymentMode(next.paymentMode);
              setAccountID(next.accountID);
            }}
            onAddAccount={onAddAccount}
            accountLabel="Pay from"
            colors={colors}
            muted={muted}
          />
        )}
      </View>

      {/* For a trial or a plan to stop — not a loan or an SIP. Still shown
          when an older item already has it on, so it can be turned off. */}
      {formKind === 'subscription' || formKind === 'bill' || cancelBeforeDue ? (
        <View
          className="mb-4 rounded-2xl border p-4"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <ThemedText className="text-sm font-black" style={{ fontFamily: Fonts.title }}>
                Remind me to cancel
              </ThemedText>
              <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
                For a trial or a plan you mean to stop. You’ll get a nudge before it renews.
              </ThemedText>
            </View>
            <HapticSwitch
              value={cancelBeforeDue}
              onValueChange={(enabled) => {
                setCancelBeforeDue(enabled);
                if (enabled && reminderDays === 0) setReminderDays(1);
              }}
              trackColor={{ false: '#E0E0E0', true: colors.accent }}
              thumbColor="white"
            />
          </View>
        </View>
      ) : null}

      {cancelBeforeDue && (
        <Pressable
          onPress={openCancellationDatePicker}
          className="mb-4 flex-row items-center justify-between rounded-2xl border p-4"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}>
          <View>
            <ThemedText className="text-[11px] font-black uppercase" style={{ color: muted }}>
              Cancellation reminder date
            </ThemedText>
            <ThemedText className="mt-1 text-sm font-black">
              {cancelOnDate || 'Choose date'}
            </ThemedText>
          </View>
          <MaterialCommunityIcons name="calendar-month-outline" size={22} color={colors.accent} />
        </Pressable>
      )}

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        colors={colors}
        placeholder={NOTES_PLACEHOLDER[formKind]}
      />
    </View>
  );
}
