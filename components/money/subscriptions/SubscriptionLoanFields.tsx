import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { DateRow } from '@/components/money/subscriptions/DateRow';
import { Field } from '@/components/money/subscriptions/Field';
import { LoanType } from '@/lib/subscriptions';
import { Pill } from '@/components/money/subscriptions/Pill';
import { ThemedText } from '@/components/themed-text';
import { formatMoney } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { loanTypeOptions } from '@/lib/recurring';
import { suggestLoanFigures, sanitizeAmount } from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionLoanFieldsProps = {
  amount: string;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  emisPaid: string;
  foreclosurePct: string;
  lender: string;
  loanSuggestion: ReturnType<typeof suggestLoanFigures>;
  loanType: LoanType | '';
  muted: string;
  name: string;
  openStartDatePicker: () => void;
  principal: string;
  processingFee: string;
  ratePct: string;
  setAmount: Dispatch<SetStateAction<string>>;
  setEmisPaid: Dispatch<SetStateAction<string>>;
  setForeclosurePct: Dispatch<SetStateAction<string>>;
  setLender: Dispatch<SetStateAction<string>>;
  setLoanType: Dispatch<SetStateAction<LoanType | ''>>;
  setPrincipal: Dispatch<SetStateAction<string>>;
  setProcessingFee: Dispatch<SetStateAction<string>>;
  setRatePct: Dispatch<SetStateAction<string>>;
  setTotalEmis: Dispatch<SetStateAction<string>>;
  startDate: string;
  totalEmis: string;
};

export function SubscriptionLoanFields({
  amount,
  colors,
  emisPaid,
  foreclosurePct,
  lender,
  loanSuggestion,
  loanType,
  muted,
  name,
  openStartDatePicker,
  principal,
  processingFee,
  ratePct,
  setAmount,
  setEmisPaid,
  setForeclosurePct,
  setLender,
  setLoanType,
  setPrincipal,
  setProcessingFee,
  setRatePct,
  setTotalEmis,
  startDate,
  totalEmis,
}: SubscriptionLoanFieldsProps) {
  return (
    <View testID="recurring-loan-fields">
      <ThemedText className="mb-2 text-[11px] font-black uppercase" style={{ color: muted }}>
        Loan type
      </ThemedText>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {loanTypeOptions.map((option) => (
          <Pill
            key={option.value}
            label={option.label}
            selected={loanType === option.value}
            onPress={() => setLoanType(loanType === option.value ? '' : option.value)}
            colors={colors}
          />
        ))}
      </View>
      <Field
        label="Lender (optional)"
        value={lender}
        onChangeText={setLender}
        colors={colors}
        placeholder="HDFC Bank, Bajaj Finance"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label="Loan amount"
            value={principal}
            onChangeText={(value) => setPrincipal(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder="3,00,000"
          />
        </View>
        <View className="flex-1">
          <Field
            label="Interest % a year"
            value={ratePct}
            onChangeText={(value) => setRatePct(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder="10.5"
          />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label="Total EMIs"
            value={totalEmis}
            onChangeText={(value) => setTotalEmis(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            colors={colors}
            placeholder="36"
          />
        </View>
        <View className="flex-1">
          <Field
            label="EMIs already paid"
            value={emisPaid}
            onChangeText={(value) => setEmisPaid(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            colors={colors}
            placeholder="0"
          />
        </View>
      </View>
      {Object.keys(loanSuggestion).length > 0 ? (
        <Pressable
          testID="recurring-loan-suggestion"
          accessibilityRole="button"
          onPress={() => {
            haptics.select();
            if (loanSuggestion.emi != null) setAmount(String(Math.round(loanSuggestion.emi)));
            if (loanSuggestion.principal != null)
              setPrincipal(String(Math.round(loanSuggestion.principal)));
            if (loanSuggestion.months != null) setTotalEmis(String(loanSuggestion.months));
            if (loanSuggestion.annualRatePct != null)
              setRatePct(String(loanSuggestion.annualRatePct));
          }}
          className="mb-3 flex-row items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ backgroundColor: colors.secondary }}>
          <MaterialCommunityIcons
            name="calculator-variant-outline"
            size={18}
            color={colors.accent}
          />
          <ThemedText className="flex-1 text-xs font-bold" style={{ color: colors.text }}>
            {loanSuggestion.emi != null
              ? `EMI works out to ${formatMoney(loanSuggestion.emi)}. Use it`
              : loanSuggestion.months != null
                ? `That is ${loanSuggestion.months} EMIs. Use it`
                : loanSuggestion.principal != null
                  ? `Loan amount works out to ${formatMoney(loanSuggestion.principal)}. Use it`
                  : `Interest works out to ${loanSuggestion.annualRatePct}% a year. Use it`}
          </ThemedText>
        </Pressable>
      ) : null}
      <DateRow
        label="First EMI on (optional)"
        value={startDate}
        onPress={openStartDatePicker}
        colors={colors}
        muted={muted}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label="Processing fee"
            value={processingFee}
            onChangeText={(value) => setProcessingFee(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder="0"
          />
        </View>
        <View className="flex-1">
          <Field
            label="Foreclosure charge %"
            value={foreclosurePct}
            onChangeText={(value) => setForeclosurePct(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder="4"
          />
        </View>
      </View>
    </View>
  );
}
