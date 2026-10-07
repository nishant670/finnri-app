import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { inferNextSubscriptionDate } from '@/lib/subscription-schedule';
import type { BillingInterval } from '@/lib/subscriptions';
import type { EntryForm } from './TransactionFormModal';

/**
 * The four intervals nearly every subscription is, as one segmented row —
 * the same four the Recurring sheet leads with.
 *
 * Daily and every-two-weeks are real but rare, so they wait under More
 * options. `business_daily` — "Market days", which skips weekends and market
 * holidays — is an SIP concept and is no longer offered anywhere subscriptions
 * are created. Existing rows can still hold it, so it still renders.
 */
const primaryIntervals: { value: BillingInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const otherIntervals: { value: BillingInterval; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];

const isDailyInterval = (interval: EntryForm['subscriptionBillingInterval']) =>
  interval === 'daily' || interval === 'business_daily';

const reminderPhrase = (days: string) => {
  const count = Number(days || 0);
  if (!Number.isFinite(count) || count <= 0) return 'Reminder on the day';
  return `Reminder ${count} day${count === 1 ? '' : 's'} before`;
};

type TransactionSubscriptionFieldsProps = {
  form: EntryForm;
  setForm: Dispatch<SetStateAction<EntryForm>>;
  onOpenNextPaymentDatePicker: () => void;
  onOpenCancellationDatePicker: () => void;
  /**
   * Whether More options is open. Optional so the card can stand alone; the
   * sheet passes it because a refused save that names a folded setting has to
   * be able to open the fold.
   */
  optionsOpen?: boolean;
  onToggleOptions?: () => void;
};

/**
 * Track this payment as a subscription, saved alongside it.
 *
 * Switching it on is the whole job for most people: the interval defaults to
 * monthly and the next date is worked out from the payment, so the card asks
 * nothing it can answer itself. Name, amount, reminder, autopay and notes all
 * start from the payment and wait under More options, which reads its
 * defaults back so nobody has to open it to know what they are.
 *
 * The date pickers belong to the sheet, so the card only asks to open them.
 */
export function TransactionSubscriptionFields({
  form,
  setForm,
  onOpenNextPaymentDatePicker,
  onOpenCancellationDatePicker,
  optionsOpen,
  onToggleOptions,
}: TransactionSubscriptionFieldsProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const [ownOptionsOpen, setOwnOptionsOpen] = useState(false);
  const isOptionsOpen = optionsOpen ?? ownOptionsOpen;
  const toggleOptions = onToggleOptions ?? (() => setOwnOptionsOpen((open) => !open));
  const isDaily = isDailyInterval(form.subscriptionBillingInterval);
  const inputStyle = { color: theme.text, backgroundColor: theme.background };

  const selectInterval = (interval: BillingInterval) =>
    setForm((p) => ({
      ...p,
      subscriptionBillingInterval: interval,
      subscriptionNextDueDate:
        p.subscriptionNextDueDate || inferNextSubscriptionDate(p.date, interval),
      subscriptionAutopay: isDailyInterval(interval) ? true : p.subscriptionAutopay,
      subscriptionReminderDays: isDailyInterval(interval)
        ? '0'
        : p.subscriptionReminderDays && p.subscriptionReminderDays !== '0'
          ? p.subscriptionReminderDays
          : '3',
    }));

  const summary = [
    form.subscriptionName.trim() || form.merchant.trim() || form.title.trim(),
    form.subscriptionAmount || form.amount
      ? formatMoney(Number(form.subscriptionAmount || form.amount))
      : '',
    isDaily ? '' : reminderPhrase(form.subscriptionReminderDays),
    isDaily ? '' : form.subscriptionAutopay ? 'Autopay on' : 'Autopay off',
    form.subscriptionCancelBeforeDue ? 'Cancel reminder set' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const autopayRow = (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: form.subscriptionAutopay }}
      onPress={() =>
        setForm((p) => ({
          ...p,
          subscriptionAutopay: !p.subscriptionAutopay,
        }))
      }
      className="flex-row items-center justify-between rounded-2xl px-4 py-3"
      style={{ backgroundColor: theme.background }}>
      <View className="flex-1 pr-3">
        <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
          Autopay
        </ThemedText>
        <ThemedText tone="muted" className="mt-1 text-[11px]">
          Finnri adds each payment for you, then asks you to confirm it.
        </ThemedText>
      </View>
      <MaterialCommunityIcons
        name={form.subscriptionAutopay ? 'toggle-switch' : 'toggle-switch-off-outline'}
        size={34}
        color={form.subscriptionAutopay ? accent : theme.muted}
      />
    </Pressable>
  );

  return (
    <View className="px-5 mb-6">
      <View
        className="rounded-[24px] border p-3"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3 pr-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accentSurface }}>
              <MaterialCommunityIcons name="calendar-sync-outline" size={20} color={accent} />
            </View>
            <View className="flex-1">
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Track as a subscription
              </ThemedText>
              <ThemedText tone="muted" className="text-xs">
                Get a reminder before it renews.
              </ThemedText>
            </View>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Track as a subscription"
            accessibilityState={{ checked: form.subscriptionEnabled }}
            onPress={() =>
              setForm((prev) => {
                if (prev.subscriptionEnabled) return { ...prev, subscriptionEnabled: false };
                const interval = prev.subscriptionBillingInterval || 'monthly';
                return {
                  ...prev,
                  subscriptionEnabled: true,
                  subscriptionName: prev.subscriptionName || prev.merchant || prev.title,
                  subscriptionAmount: prev.subscriptionAmount || prev.amount,
                  subscriptionCategory: prev.subscriptionCategory || prev.category,
                  // The two questions the switch can answer itself. Monthly is
                  // what nearly every subscription is, and the next date
                  // follows from the payment being logged.
                  subscriptionBillingInterval: interval,
                  subscriptionNextDueDate:
                    prev.subscriptionNextDueDate || inferNextSubscriptionDate(prev.date, interval),
                  subscriptionReminderDays: isDailyInterval(interval)
                    ? '0'
                    : prev.subscriptionReminderDays || '3',
                };
              })
            }
            className="h-8 w-14 justify-center rounded-full px-1"
            style={{
              backgroundColor: form.subscriptionEnabled ? accent : theme.border,
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
            <View>
              <ThemedText
                tone="muted"
                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Repeats
              </ThemedText>
              <View
                className="flex-row rounded-2xl p-1"
                style={{ backgroundColor: theme.background }}>
                {primaryIntervals.map((option) => {
                  const selected = form.subscriptionBillingInterval === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectInterval(option.value)}
                      className="min-h-11 flex-1 items-center justify-center rounded-xl py-2"
                      style={{ backgroundColor: selected ? theme.card : 'transparent' }}>
                      <ThemedText
                        className="text-xs font-black"
                        style={{ color: selected ? accent : theme.muted }}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!isDaily ? (
              <Pressable
                testID="subscription-next-payment-picker"
                accessibilityRole="button"
                accessibilityLabel="Choose next payment date"
                onPress={onOpenNextPaymentDatePicker}
                className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                style={{ backgroundColor: theme.background }}>
                <View className="flex-1">
                  <ThemedText
                    tone="muted"
                    className="text-[10px] font-black uppercase tracking-widest">
                    Next payment date
                  </ThemedText>
                  <ThemedText
                    className="mt-1 text-sm font-bold"
                    style={{
                      color: form.subscriptionNextDueDate ? theme.text : theme.muted,
                    }}>
                    {form.subscriptionNextDueDate || 'Choose date'}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name="calendar-month-outline" size={20} color={accent} />
              </Pressable>
            ) : (
              <>
                <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: accentSurface }}>
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
                {/* Daily payments cannot be saved without Autopay, so the switch
                    is never folded away while it is the thing in question. */}
                {autopayRow}
              </>
            )}

            <FormDisclosure
              testID="subscription-more-options"
              label="More options"
              summary={summary}
              expanded={isOptionsOpen}
              onToggle={toggleOptions}>
              <View className="gap-4">
                <View className="flex-row gap-3">
                  <TextInput
                    value={form.subscriptionName}
                    onChangeText={(text) => setForm((p) => ({ ...p, subscriptionName: text }))}
                    placeholder="Subscription name"
                    placeholderTextColor={theme.muted}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                    style={inputStyle}
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
                    placeholderTextColor={theme.muted}
                    className="w-28 rounded-2xl px-4 py-3 text-sm font-bold"
                    style={inputStyle}
                  />
                </View>
                <View className="flex-row gap-3">
                  <TextInput
                    value={form.subscriptionMerchant}
                    onChangeText={(text) => setForm((p) => ({ ...p, subscriptionMerchant: text }))}
                    placeholder="Merchant"
                    placeholderTextColor={theme.muted}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                    style={inputStyle}
                  />
                  <TextInput
                    value={form.subscriptionCategory}
                    onChangeText={(text) => setForm((p) => ({ ...p, subscriptionCategory: text }))}
                    placeholder="Category"
                    placeholderTextColor={theme.muted}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                    style={inputStyle}
                  />
                </View>

                <View>
                  <ThemedText
                    tone="muted"
                    className="mb-2 text-[10px] font-black uppercase tracking-widest">
                    Other intervals
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {otherIntervals.map((option) => {
                      const selected = form.subscriptionBillingInterval === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => selectInterval(option.value)}
                          className="rounded-full border px-3 py-2"
                          style={{
                            backgroundColor: selected ? accentSurface : 'transparent',
                            borderColor: selected ? accent : theme.border,
                          }}>
                          <ThemedText
                            className="text-xs font-bold"
                            style={{ color: selected ? accent : theme.text }}>
                            {option.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {!isDaily ? (
                  <View
                    className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                    style={{ backgroundColor: theme.background }}>
                    <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
                      Remind me before
                    </ThemedText>
                    <View className="flex-row items-center gap-2">
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
                        placeholderTextColor={theme.muted}
                        className="min-w-[48px] rounded-xl px-2 py-1 text-center text-sm font-bold"
                        style={{ color: theme.text, backgroundColor: theme.card }}
                      />
                      <ThemedText tone="muted" className="text-xs">
                        days
                      </ThemedText>
                    </View>
                  </View>
                ) : null}

                {!isDaily ? autopayRow : null}

                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: form.subscriptionCancelBeforeDue }}
                  onPress={() =>
                    setForm((p) => ({
                      ...p,
                      subscriptionCancelBeforeDue: !p.subscriptionCancelBeforeDue,
                    }))
                  }
                  className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                  style={{ backgroundColor: theme.background }}>
                  <View className="flex-1 pr-3">
                    <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
                      Remind me to cancel
                    </ThemedText>
                    <ThemedText tone="muted" className="mt-1 text-[11px]">
                      For a trial or a plan you mean to stop.
                    </ThemedText>
                  </View>
                  <MaterialCommunityIcons
                    name={
                      form.subscriptionCancelBeforeDue
                        ? 'checkbox-marked-circle'
                        : 'checkbox-blank-circle-outline'
                    }
                    size={22}
                    color={form.subscriptionCancelBeforeDue ? accent : theme.muted}
                  />
                </Pressable>

                {form.subscriptionCancelBeforeDue && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onOpenCancellationDatePicker}
                    className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                    style={{ backgroundColor: theme.background }}>
                    <View>
                      <ThemedText
                        tone="muted"
                        className="text-[10px] font-black uppercase tracking-widest">
                        Cancellation reminder date
                      </ThemedText>
                      <ThemedText className="mt-1 text-sm font-bold" style={{ color: theme.text }}>
                        {form.subscriptionCancelOnDate || 'Choose date'}
                      </ThemedText>
                    </View>
                    <MaterialCommunityIcons
                      name="calendar-month-outline"
                      size={20}
                      color={accent}
                    />
                  </Pressable>
                )}

                <TextInput
                  multiline
                  value={form.subscriptionNotes}
                  onChangeText={(text) => setForm((p) => ({ ...p, subscriptionNotes: text }))}
                  placeholder="Plan tier, cancellation link or renewal notes"
                  placeholderTextColor={theme.muted}
                  className="min-h-[78px] rounded-2xl px-4 py-3 text-sm font-bold"
                  textAlignVertical="top"
                  style={inputStyle}
                />
              </View>
            </FormDisclosure>
          </View>
        )}
      </View>
    </View>
  );
}
