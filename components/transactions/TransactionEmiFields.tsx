import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EMICalculation } from '@/lib/emi';
import { formatEMIProgress } from '@/lib/emi-plans';
import { formatMoney } from '@/lib/money';
import { parseDateLabel } from '@/lib/transactions';
import type { EMILink } from './TransactionFormModal';

const emiTenureOptions = [3, 6, 9, 12, 18, 24];

const formatNiceDate = (iso: string) => {
  const parsed = parseDateLabel(iso);
  return parsed
    ? parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : iso;
};

type TransactionEmiFieldsProps = {
  isEdit?: boolean;
  emiLink?: EMILink | null;
  paymentMode: string;
  /** Converting this purchase into an EMI plan on the selected credit card. */
  isCardConversion: boolean;
  cardName?: string;
  /** A loan EMI the bank debits itself, which can repeat as a subscription. */
  canRepeat: boolean;
  repeatActive: boolean;
  nextDebit: string;
  totalInstalments: string;
  paidInstalments: string;
  tenureMonths: string;
  ratePct: string;
  firstInstallment: string;
  calculation: EMICalculation | null;
  calculationError: string | null;
  isCalculating: boolean;
  onChangeRepeat: (value: boolean) => void;
  onChangeTotalInstalments: (value: string) => void;
  onChangePaidInstalments: (value: string) => void;
  onChangeTenure: (months: string) => void;
  onChangeRate: (value: string) => void;
};

/** The EMI schedule card: card conversion, the linked plan, and monthly repeat. */
export function TransactionEmiFields({
  isEdit,
  emiLink,
  paymentMode,
  isCardConversion,
  cardName,
  canRepeat,
  repeatActive,
  nextDebit,
  totalInstalments,
  paidInstalments,
  tenureMonths,
  ratePct,
  firstInstallment,
  calculation,
  calculationError,
  isCalculating,
  onChangeRepeat,
  onChangeTotalInstalments,
  onChangePaidInstalments,
  onChangeTenure,
  onChangeRate,
}: TransactionEmiFieldsProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  return (
    <View className="px-5 mb-6">
      <View
        className="rounded-[24px] border p-4"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-start gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentSurface }}>
            <MaterialCommunityIcons name="calendar-month-outline" size={20} color={accent} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
              EMI schedule
            </ThemedText>
            <ThemedText tone="muted" className="mt-1 text-xs">
              {isCardConversion
                ? `Convert this purchase on ${cardName ?? 'the selected card'}.`
                : isEdit && emiLink?.kind === 'plan'
                  ? 'This purchase is on an EMI plan.'
                  : isEdit && emiLink?.kind === 'recurring'
                    ? 'This EMI repeats automatically.'
                    : canRepeat
                      ? 'Saved as a normal payment. Turn on the repeat below to get a reminder and a ready-to-confirm entry each month.'
                      : paymentMode === 'Cash'
                        ? 'Saved as an EMI-tagged payment. Pick a bank or UPI account to repeat it automatically each month.'
                        : 'Saved as an EMI-tagged payment.'}
            </ThemedText>
          </View>
        </View>

        {isEdit && emiLink?.kind === 'plan' ? (
          <View
            testID="emi-link-plan"
            className="mt-4 gap-2 rounded-2xl border p-3"
            style={{ borderColor: theme.border }}>
            <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
              {formatMoney(emiLink.plan.monthly_amount)} × {emiLink.plan.tenure_months} months
              {emiLink.plan.annual_rate_pct === 0
                ? ' · No-cost'
                : ` · ${emiLink.plan.annual_rate_pct}% a year`}
            </ThemedText>
            <ThemedText tone="muted" className="text-xs">
              {formatEMIProgress(emiLink.plan.progress)}
              {emiLink.plan.progress.next_due_date
                ? ` · next ${formatNiceDate(emiLink.plan.progress.next_due_date)}`
                : ''}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={emiLink.onOpen}
              className="mt-1 self-start rounded-full border px-4 py-2"
              style={{ borderColor: accent }}>
              <ThemedText className="text-xs font-black" style={{ color: accent }}>
                View full schedule
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {isEdit && emiLink?.kind === 'recurring' ? (
          <View
            testID="emi-link-recurring"
            className="mt-4 gap-1 rounded-2xl border p-3"
            style={{ borderColor: theme.border }}>
            <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
              Auto-debit {formatMoney(emiLink.subscription.amount)} every month
            </ThemedText>
            <ThemedText tone="muted" className="text-xs">
              {emiLink.subscription.total_instalments > 0
                ? `${emiLink.subscription.instalments_paid} of ${emiLink.subscription.total_instalments} paid · ${Math.max(emiLink.subscription.total_instalments - emiLink.subscription.instalments_paid, 0)} left`
                : 'No end date set'}
              {emiLink.subscription.status === 'active'
                ? ` · next ${formatNiceDate(String(emiLink.subscription.next_due_date).slice(0, 10))}`
                : ' · finished'}
            </ThemedText>
          </View>
        ) : null}

        {canRepeat ? (
          <View
            className="mt-4 flex-row items-center justify-between gap-3 rounded-2xl border p-3"
            style={{ borderColor: theme.border }}>
            <View className="flex-1">
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Repeats monthly (auto-debit)
              </ThemedText>
              <ThemedText tone="muted" className="mt-0.5 text-xs">
                {repeatActive
                  ? `Next debit ${formatNiceDate(nextDebit)}. You'll be reminded 3 days before and asked to confirm it.`
                  : 'For loan EMIs the bank takes automatically.'}
              </ThemedText>
            </View>
            <HapticSwitch
              value={repeatActive}
              onValueChange={onChangeRepeat}
              trackColor={{ false: theme.border, true: accent }}
            />
          </View>
        ) : null}

        {repeatActive ? (
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1 rounded-2xl border p-3" style={{ borderColor: theme.border }}>
              <ThemedText
                tone="muted"
                className="mb-1 text-[10px] font-black uppercase tracking-widest">
                Total EMIs
              </ThemedText>
              <TextInput
                value={totalInstalments}
                onChangeText={(text) =>
                  onChangeTotalInstalments(text.replace(/\D/g, '').slice(0, 3))
                }
                placeholder="Leave empty if unknown"
                placeholderTextColor={detailInputPlaceholderColor}
                keyboardType="number-pad"
                className="p-0 text-sm font-bold"
                style={{ color: theme.text }}
              />
            </View>
            <View className="flex-1 rounded-2xl border p-3" style={{ borderColor: theme.border }}>
              <ThemedText
                tone="muted"
                className="mb-1 text-[10px] font-black uppercase tracking-widest">
                Paid so far
              </ThemedText>
              <TextInput
                value={paidInstalments}
                onChangeText={(text) =>
                  onChangePaidInstalments(text.replace(/\D/g, '').slice(0, 3))
                }
                placeholder="1 (this one)"
                placeholderTextColor={detailInputPlaceholderColor}
                keyboardType="number-pad"
                className="p-0 text-sm font-bold"
                style={{ color: theme.text }}
              />
            </View>
          </View>
        ) : null}

        {isCardConversion ? (
          <View className="mt-4 gap-4">
            <View>
              <ThemedText
                tone="muted"
                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Tenure
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {emiTenureOptions.map((months) => (
                    <Pressable
                      key={months}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: tenureMonths === String(months),
                      }}
                      onPress={() => onChangeTenure(String(months))}
                      className="rounded-full border px-4 py-2"
                      style={{
                        borderColor: tenureMonths === String(months) ? accent : theme.border,
                        backgroundColor: tenureMonths === String(months) ? accent : theme.card,
                      }}>
                      <ThemedText
                        className="text-xs font-black"
                        style={{
                          color: tenureMonths === String(months) ? '#FFFFFF' : theme.text,
                        }}>
                        {months} mo
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <ThemedText
                tone="muted"
                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Annual interest rate
              </ThemedText>
              <TextInput
                value={ratePct}
                onChangeText={(text) => onChangeRate(text)}
                placeholder="0 for no-cost EMI"
                placeholderTextColor={detailInputPlaceholderColor}
                keyboardType="decimal-pad"
                className="p-0 text-sm font-bold"
                style={{ color: theme.text }}
              />
            </View>
            <View className="rounded-2xl p-4" style={{ backgroundColor: theme.secondary }}>
              {isCalculating ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={accent} />
                  <ThemedText tone="muted" className="text-xs">
                    Calculating schedule…
                  </ThemedText>
                </View>
              ) : calculation ? (
                <>
                  <ThemedText className="text-base font-black" style={{ color: theme.text }}>
                    {formatMoney(calculation.principal_amount)} ÷ {calculation.tenure_months} ={' '}
                    {formatMoney(calculation.monthly_emi)}/mo
                  </ThemedText>
                  <ThemedText tone="muted" className="mt-1 text-xs">
                    First instalment {firstInstallment || 'one month after purchase'}
                    {calculation.total_interest > 0
                      ? ` · ${formatMoney(calculation.total_interest)} total interest`
                      : ' · No-cost EMI'}
                  </ThemedText>
                </>
              ) : (
                <ThemedText tone={calculationError ? 'negative' : 'muted'} className="text-xs">
                  {calculationError ?? 'Choose a tenure to preview the monthly schedule.'}
                </ThemedText>
              )}
            </View>
            <View className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-900/20">
              <ThemedText tone="warning" className="text-xs font-bold">
                Saving replaces this purchase entry with the EMI plan. Only each monthly instalment
                will appear as spending, so the purchase is not counted twice.
              </ThemedText>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
