import type { Dispatch, SetStateAction } from 'react';
import { View } from 'react-native';

import { DateRow } from '@/components/money/subscriptions/DateRow';
import { InputRow, RowsCard } from '@/components/money/subscriptions/FormRows';
import { sanitizeAmount } from '@/lib/subscription-form';

type SubscriptionInvestmentFieldsProps = {
  openStartDatePicker: () => void;
  platform: string;
  setPlatform: Dispatch<SetStateAction<string>>;
  setStepUpPct: Dispatch<SetStateAction<string>>;
  startDate: string;
  stepUpPct: string;
};

/** Under "Investment details": where it is held, when it began, and its yearly step-up, as rows. */
export function SubscriptionInvestmentFields({
  openStartDatePicker,
  platform,
  setPlatform,
  setStepUpPct,
  startDate,
  stepUpPct,
}: SubscriptionInvestmentFieldsProps) {
  return (
    <View testID="recurring-investment-fields">
      <RowsCard>
        <InputRow
          label="Platform"
          accessibilityLabel="Fund or platform"
          value={platform}
          onChangeText={setPlatform}
          placeholder="Zerodha Coin, Groww, Post office"
        />
        <DateRow label="Started on" value={startDate} onPress={openStartDatePicker} divider />
        <InputRow
          label="Step-up"
          accessibilityLabel="Yearly step-up %"
          value={stepUpPct}
          onChangeText={(value) => setStepUpPct(sanitizeAmount(value))}
          keyboardType="decimal-pad"
          suffix="% a year"
          placeholder="10"
          divider
        />
      </RowsCard>
    </View>
  );
}
