import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateRow } from '@/components/money/subscriptions/DateRow';
import { InputRow, RECURRING_LABEL_WIDTH, RowsCard } from '@/components/money/subscriptions/FormRows';
import { ThemedText } from '@/components/themed-text';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { formatMoney } from '@/lib/money';
import { haptics } from '@/lib/haptics';
import { loanTypeOptions } from '@/lib/recurring';
import { suggestLoanFigures, sanitizeAmount } from '@/lib/subscription-form';
import { LoanType } from '@/lib/subscriptions';

type SubscriptionLoanFieldsProps = {
  amount: string;
  emisPaid: string;
  foreclosurePct: string;
  lender: string;
  loanSuggestion: ReturnType<typeof suggestLoanFigures>;
  loanType: LoanType | '';
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

/**
 * Under "Loan details": the loan itself, as rows of two cards (the rows of
 * board R5-NewLoan). Its figures, then the EMI the figures work out to, then
 * the dates and charges.
 */
export function SubscriptionLoanFields({
  emisPaid,
  foreclosurePct,
  lender,
  loanSuggestion,
  loanType,
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
  const { colors } = useThemeTokens();
  const [isTypePickerVisible, setIsTypePickerVisible] = useState(false);
  const typeLabel = loanTypeOptions.find((option) => option.value === loanType)?.label;

  return (
    <View testID="recurring-loan-fields" style={styles.stack}>
      <RowsCard>
        <LabelRow
          testID="recurring-loan-type"
          label="Loan type"
          value={typeLabel ?? 'Choose'}
          valueMuted={!typeLabel}
          labelWidth={RECURRING_LABEL_WIDTH}
          onPress={() => setIsTypePickerVisible(true)}
        />
        <InputRow
          label="Lender"
          value={lender}
          onChangeText={setLender}
          placeholder="HDFC Bank, Bajaj Finance"
          divider
        />
        <InputRow
          label="Loan amount"
          value={principal}
          onChangeText={(value) => setPrincipal(sanitizeAmount(value))}
          keyboardType="decimal-pad"
          prefix={CURRENCY_SYMBOL}
          placeholder="3,00,000"
          divider
        />
        <InputRow
          label="Interest"
          accessibilityLabel="Interest % a year"
          value={ratePct}
          onChangeText={(value) => setRatePct(sanitizeAmount(value))}
          keyboardType="decimal-pad"
          suffix="% a year"
          placeholder="10.5"
          divider
        />
        <InputRow
          label="Total EMIs"
          value={totalEmis}
          onChangeText={(value) => setTotalEmis(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="36"
          divider
        />
        <InputRow
          label="EMIs paid"
          accessibilityLabel="EMIs already paid"
          value={emisPaid}
          onChangeText={(value) => setEmisPaid(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          divider
        />
      </RowsCard>

      {Object.keys(loanSuggestion).length > 0 ? (
        <PressableView
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
          style={[styles.suggestion, { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="calculator-variant-outline" size={18} color={colors.text} />
          <ThemedText style={[styles.suggestionText, { color: colors.text }]}>
            {loanSuggestion.emi != null
              ? `EMI works out to ${formatMoney(loanSuggestion.emi)}. Use it`
              : loanSuggestion.months != null
                ? `That is ${loanSuggestion.months} EMIs. Use it`
                : loanSuggestion.principal != null
                  ? `Loan amount works out to ${formatMoney(loanSuggestion.principal)}. Use it`
                  : `Interest works out to ${loanSuggestion.annualRatePct}% a year. Use it`}
          </ThemedText>
        </PressableView>
      ) : null}

      <RowsCard>
        <DateRow label="First EMI on" value={startDate} onPress={openStartDatePicker} />
        <InputRow
          label="Processing fee"
          value={processingFee}
          onChangeText={(value) => setProcessingFee(sanitizeAmount(value))}
          keyboardType="decimal-pad"
          prefix={CURRENCY_SYMBOL}
          placeholder="0"
          divider
        />
        <InputRow
          label="Foreclosure"
          accessibilityLabel="Foreclosure charge %"
          value={foreclosurePct}
          onChangeText={(value) => setForeclosurePct(sanitizeAmount(value))}
          keyboardType="decimal-pad"
          suffix="% charge"
          placeholder="4"
          divider
        />
      </RowsCard>

      <PickerSheet
        visible={isTypePickerVisible}
        title="Loan type"
        onClose={() => setIsTypePickerVisible(false)}>
        <PickerOptionList
          accessibilityLabel="Loan type"
          options={loanTypeOptions.map((option) => ({ key: option.value, label: option.label }))}
          selectedKey={loanType || null}
          onSelect={(key) => {
            haptics.select();
            // Choosing the chosen type again clears it, as tapping its chip did.
            setLoanType(loanType === key ? '' : (key as LoanType));
            setIsTypePickerVisible(false);
          }}
        />
      </PickerSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  suggestion: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
