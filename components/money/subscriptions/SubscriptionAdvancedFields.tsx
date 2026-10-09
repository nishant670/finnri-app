import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { BillingInterval, SubscriptionStatus } from '@/lib/subscriptions';
import { ChipPicker } from '@/components/money/subscriptions/ChipPicker';
import { Field } from '@/components/money/subscriptions/Field';
import { Fonts } from '@/constants/theme';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { Pill } from '@/components/money/subscriptions/Pill';
import { SegmentedControl } from '@/components/money/subscriptions/SegmentedControl';
import { ThemedText } from '@/components/themed-text';
import { getAccountsForPaymentMode, type Account } from '@/lib/accounts';
import {
  reminderOptions,
  reminderLabel,
  categoryOptions,
  advancedIntervalOptions,
  statusOptions,
} from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionAdvancedFieldsProps = {
  accountID: number | null;
  accounts: Account[];
  autopay: boolean;
  cancelBeforeDue: boolean;
  cancelOnDate: string;
  category: string;
  colors: ReturnType<typeof useThemeTokens>['colors'];
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
  setInterval: Dispatch<SetStateAction<BillingInterval>>;
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
  setInterval,
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

      <ChipPicker
        label="Category"
        options={categoryOptions}
        active={category}
        onSelect={setCategory}
        colors={colors}
      />

      <View className="mb-4">
        <ThemedText className="mb-2 text-[11px] font-black uppercase" style={{ color: muted }}>
          Other intervals
        </ThemedText>
        <View className="flex-row flex-wrap gap-2">
          {advancedIntervalOptions.map((option) => (
            <Pill
              key={option.value}
              label={option.label}
              selected={interval === option.value}
              onPress={() => {
                setInterval(option.value);
                if (option.value === 'daily') {
                  setAutopay(true);
                  setReminderDays(0);
                }
              }}
              colors={colors}
            />
          ))}
        </View>
      </View>

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
          <ThemedText className="text-xs font-bold" style={{ color: colors.accent }}>
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
              Add each recurring payment automatically and ask you to confirm it.
            </ThemedText>
          </View>
          <HapticSwitch
            value={autopay}
            onValueChange={setAutopay}
            trackColor={{ false: '#E0E0E0', true: colors.accent }}
            thumbColor="white"
          />
        </View>
        {autopay && (
          <>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {['Bank Account', 'UPI', 'Credit Card'].map((mode) => (
                <Pill
                  key={mode}
                  label={mode}
                  selected={paymentMode === mode}
                  onPress={() => {
                    setPaymentMode(mode);
                    setAccountID(null);
                  }}
                  colors={colors}
                />
              ))}
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {getAccountsForPaymentMode(accounts, paymentMode).map((account) => (
                <Pill
                  key={account.id}
                  label={account.name}
                  selected={accountID === account.id}
                  onPress={() => setAccountID(account.id)}
                  colors={colors}
                />
              ))}
            </View>
            <Pressable className="mt-3 flex-row items-center gap-2" onPress={onAddAccount}>
              <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.accent} />
              <ThemedText className="text-xs font-black" style={{ color: colors.accent }}>
                Add or manage payment account
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>

      <View
        className="mb-4 rounded-2xl border p-4"
        style={{ borderColor: colors.border, backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <ThemedText className="text-sm font-black" style={{ fontFamily: Fonts.title }}>
              Remind me to cancel
            </ThemedText>
            <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
              Reminder notification will explicitly ask you to cancel before the next payment.
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
        placeholder="Plan tier, cancellation link, family plan details"
      />
    </View>
  );
}
