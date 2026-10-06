import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { inferNextSubscriptionDate } from '@/lib/subscription-schedule';
import type { BillingInterval } from '@/lib/subscriptions';
import type { EntryForm } from './TransactionFormModal';

// `business_daily` — "Market days", which skips weekends and market holidays —
// is an SIP concept and is no longer offered anywhere subscriptions are
// created. Existing rows can still hold it, so `formatSubscriptionInterval`
// below still knows how to render it.
const subscriptionIntervalOptions: BillingInterval[] = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
];

const formatSubscriptionInterval = (interval: BillingInterval) =>
  interval === 'business_daily' ? 'Market days' : interval;

type TransactionSubscriptionFieldsProps = {
  form: EntryForm;
  setForm: Dispatch<SetStateAction<EntryForm>>;
  onOpenNextPaymentDatePicker: () => void;
  onOpenCancellationDatePicker: () => void;
};

/**
 * The "Add subscription" card: recurring details saved alongside a personal
 * payment. The date pickers belong to the sheet, so it only asks to open them.
 */
export function TransactionSubscriptionFields({
  form,
  setForm,
  onOpenNextPaymentDatePicker,
  onOpenCancellationDatePicker,
}: TransactionSubscriptionFieldsProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  return (
    <View className="px-5 mb-6">
      <View
        className="rounded-[24px] border p-3"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accentSurface }}>
              <MaterialCommunityIcons name="calendar-sync-outline" size={20} color={accent} />
            </View>
            <View>
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Add subscription
              </ThemedText>
              <ThemedText tone="muted" className="text-xs">
                Save recurring details with this payment.
              </ThemedText>
            </View>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: form.subscriptionEnabled }}
            onPress={() =>
              setForm((prev) => ({
                ...prev,
                subscriptionEnabled: !prev.subscriptionEnabled,
                subscriptionName:
                  !prev.subscriptionEnabled && !prev.subscriptionName
                    ? prev.merchant || prev.title
                    : prev.subscriptionName,
                subscriptionAmount:
                  !prev.subscriptionEnabled && !prev.subscriptionAmount
                    ? prev.amount
                    : prev.subscriptionAmount,
                subscriptionCategory:
                  !prev.subscriptionEnabled && !prev.subscriptionCategory
                    ? prev.category
                    : prev.subscriptionCategory,
              }))
            }
            className="h-8 w-14 justify-center rounded-full px-1"
            style={{
              backgroundColor: form.subscriptionEnabled ? accent : '#E5E7EB',
            }}>
            <View
              className="h-6 w-6 rounded-full bg-white"
              style={{
                alignSelf: form.subscriptionEnabled ? 'flex-end' : 'flex-start',
              }}
            />
          </Pressable>
        </View>

        {form.subscriptionEnabled && (
          <View className="mt-5 gap-4">
            <View className="flex-row gap-3">
              <TextInput
                value={form.subscriptionName}
                onChangeText={(text) => setForm((p) => ({ ...p, subscriptionName: text }))}
                placeholder="Subscription name"
                placeholderTextColor="#9CA3AF"
                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                style={{ color: theme.text }}
              />
              <TextInput
                value={form.subscriptionAmount}
                onChangeText={(text) =>
                  setForm((p) => ({
                    ...p,
                    subscriptionAmount: text.replace(/[^0-9.]/g, ''),
                  }))
                }
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor="#9CA3AF"
                className="w-28 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                style={{ color: theme.text }}
              />
            </View>
            <View className="flex-row gap-3">
              <TextInput
                value={form.subscriptionMerchant}
                onChangeText={(text) => setForm((p) => ({ ...p, subscriptionMerchant: text }))}
                placeholder="Merchant"
                placeholderTextColor="#9CA3AF"
                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                style={{ color: theme.text }}
              />
              <TextInput
                value={form.subscriptionCategory}
                onChangeText={(text) => setForm((p) => ({ ...p, subscriptionCategory: text }))}
                placeholder="Category"
                placeholderTextColor="#9CA3AF"
                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                style={{ color: theme.text }}
              />
            </View>

            <View>
              <ThemedText
                tone="muted"
                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Billing interval
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {subscriptionIntervalOptions.map((interval) => (
                  <Pressable
                    key={interval}
                    onPress={() =>
                      setForm((p) => ({
                        ...p,
                        subscriptionBillingInterval: interval,
                        subscriptionNextDueDate:
                          p.subscriptionNextDueDate || inferNextSubscriptionDate(p.date, interval),
                        subscriptionAutopay:
                          interval === 'daily' || interval === 'business_daily'
                            ? true
                            : p.subscriptionAutopay,
                        subscriptionReminderDays:
                          interval === 'daily' || interval === 'business_daily'
                            ? '0'
                            : p.subscriptionReminderDays || '3',
                      }))
                    }
                    className="rounded-full border px-3 py-2"
                    style={{
                      backgroundColor:
                        form.subscriptionBillingInterval === interval
                          ? accentSurface
                          : 'transparent',
                      borderColor:
                        form.subscriptionBillingInterval === interval ? accent : theme.border,
                    }}>
                    <ThemedText
                      className="text-xs font-bold capitalize"
                      style={{
                        color: form.subscriptionBillingInterval === interval ? accent : theme.text,
                      }}>
                      {formatSubscriptionInterval(interval)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              {form.subscriptionBillingInterval !== 'daily' &&
              form.subscriptionBillingInterval !== 'business_daily' ? (
                <Pressable
                  testID="subscription-next-payment-picker"
                  accessibilityRole="button"
                  accessibilityLabel="Choose next payment date"
                  onPress={onOpenNextPaymentDatePicker}
                  className="flex-1 flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                  <View className="flex-1">
                    <ThemedText
                      tone="muted"
                      className="text-[10px] font-black uppercase tracking-widest">
                      Next payment date
                    </ThemedText>
                    <ThemedText
                      className="mt-1 text-sm font-bold"
                      style={{
                        color: form.subscriptionNextDueDate
                          ? theme.text
                          : detailInputPlaceholderColor,
                      }}>
                      {form.subscriptionNextDueDate || 'Choose date'}
                    </ThemedText>
                  </View>
                  <MaterialCommunityIcons name="calendar-month-outline" size={20} color={accent} />
                </Pressable>
              ) : (
                <View
                  className="flex-1 rounded-2xl px-4 py-3"
                  style={{ backgroundColor: accentSurface }}>
                  <ThemedText
                    className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: accent }}>
                    Automatic schedule
                  </ThemedText>
                  <ThemedText className="mt-1 text-xs font-bold" style={{ color: theme.text }}>
                    {form.subscriptionBillingInterval === 'business_daily'
                      ? 'Next market day; weekends and holidays are skipped.'
                      : 'Runs every day automatically.'}
                  </ThemedText>
                </View>
              )}
              {form.subscriptionBillingInterval !== 'daily' &&
              form.subscriptionBillingInterval !== 'business_daily' ? (
                <View className="w-28 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <ThemedText
                    tone="muted"
                    className="text-[9px] font-black uppercase tracking-wider">
                    Remind before
                  </ThemedText>
                  <TextInput
                    value={form.subscriptionReminderDays}
                    onChangeText={(text) =>
                      setForm((p) => ({
                        ...p,
                        subscriptionReminderDays: text.replace(/[^0-9]/g, ''),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="Days"
                    placeholderTextColor="#9CA3AF"
                    className="p-0 pt-1 text-sm font-bold"
                    style={{ color: theme.text }}
                  />
                  <ThemedText tone="muted" className="text-[10px]">
                    days
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() =>
                setForm((p) => ({
                  ...p,
                  subscriptionAutopay: !p.subscriptionAutopay,
                }))
              }
              className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
              <View className="flex-1 pr-3">
                <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
                  Autopay
                </ThemedText>
                <ThemedText tone="muted" className="mt-1 text-[11px]">
                  Automatically add each payment from the selected account, then ask you to confirm
                  or correct it.
                </ThemedText>
              </View>
              <MaterialCommunityIcons
                name={form.subscriptionAutopay ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={34}
                color={form.subscriptionAutopay ? accent : '#9CA3AF'}
              />
            </Pressable>

            <Pressable
              onPress={() =>
                setForm((p) => ({
                  ...p,
                  subscriptionCancelBeforeDue: !p.subscriptionCancelBeforeDue,
                }))
              }
              className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
              <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
                Remind me to cancel
              </ThemedText>
              <MaterialCommunityIcons
                name={
                  form.subscriptionCancelBeforeDue
                    ? 'checkbox-marked-circle'
                    : 'checkbox-blank-circle-outline'
                }
                size={22}
                color={form.subscriptionCancelBeforeDue ? accent : '#9CA3AF'}
              />
            </Pressable>

            {form.subscriptionCancelBeforeDue && (
              <Pressable
                accessibilityRole="button"
                onPress={onOpenCancellationDatePicker}
                className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                <View>
                  <ThemedText
                    tone="muted"
                    className="text-[10px] font-black uppercase tracking-widest">
                    Cancellation reminder date
                  </ThemedText>
                  <ThemedText className="mt-1 text-sm font-bold">
                    {form.subscriptionCancelOnDate || 'Choose date'}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name="calendar-month-outline" size={20} color={accent} />
              </Pressable>
            )}

            <TextInput
              multiline
              value={form.subscriptionNotes}
              onChangeText={(text) => setForm((p) => ({ ...p, subscriptionNotes: text }))}
              placeholder="Plan tier, cancellation link, or renewal notes"
              placeholderTextColor="#9CA3AF"
              className="min-h-[78px] rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
              textAlignVertical="top"
              style={{ color: theme.text }}
            />
          </View>
        )}
      </View>
    </View>
  );
}
