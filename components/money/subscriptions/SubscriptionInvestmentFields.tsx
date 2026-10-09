import type { Dispatch, SetStateAction } from 'react';
import { View } from 'react-native';

import { DateRow } from '@/components/money/subscriptions/DateRow';
import { Field } from '@/components/money/subscriptions/Field';
import { sanitizeAmount } from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionInvestmentFieldsProps = {
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
  openStartDatePicker: () => void;
  platform: string;
  setPlatform: Dispatch<SetStateAction<string>>;
  setStepUpPct: Dispatch<SetStateAction<string>>;
  startDate: string;
  stepUpPct: string;
};

export function SubscriptionInvestmentFields({
  colors,
  muted,
  openStartDatePicker,
  platform,
  setPlatform,
  setStepUpPct,
  startDate,
  stepUpPct,
}: SubscriptionInvestmentFieldsProps) {
  return (
    <View testID="recurring-investment-fields">
      <Field
        label="Fund or platform (optional)"
        value={platform}
        onChangeText={setPlatform}
        colors={colors}
        placeholder="Zerodha Coin, Groww, Post office"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateRow
            label="Started on (optional)"
            value={startDate}
            onPress={openStartDatePicker}
            colors={colors}
            muted={muted}
          />
        </View>
        <View className="flex-1">
          <Field
            label="Yearly step-up %"
            value={stepUpPct}
            onChangeText={(value) => setStepUpPct(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder="10"
          />
        </View>
      </View>
    </View>
  );
}
