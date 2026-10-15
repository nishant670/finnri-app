import { useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/money/subscriptions/Field';
import { Pill } from '@/components/money/subscriptions/Pill';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import { investmentTypeOptions, isListedInvestmentType } from '@/lib/subscription-form';

type InvestmentTypePickerProps = {
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
};

/**
 * What an investment is, as one tap.
 *
 * It was a blank text box headed "Investment", and on device the question was
 * what it wanted — the kind of investment, which has a short, well-known list.
 * The pick becomes the item's name; Other opens a box for anything else. An
 * item saved with a name that is not on the list opens on Other with that name.
 *
 * Mount it with a `key` per item being edited: whether Other is open is held
 * here, and only read from `value` when the picker first appears.
 */
export function InvestmentTypePicker({
  value,
  onChange,
  colors,
  muted,
}: InvestmentTypePickerProps) {
  const [otherOpen, setOtherOpen] = useState(
    () => value.trim() !== '' && !isListedInvestmentType(value)
  );
  return (
    // The box under Other brings its own bottom margin.
    <View className={otherOpen ? '' : 'mb-3'} testID="recurring-investment-type">
      <ThemedText className="mb-2 text-[11px] font-black uppercase" style={{ color: muted }}>
        Investment type
      </ThemedText>
      <View className="flex-row flex-wrap gap-2">
        {investmentTypeOptions.map((option) => (
          <Pill
            key={option}
            label={option}
            selected={!otherOpen && value.trim().toLowerCase() === option.toLowerCase()}
            onPress={() => {
              haptics.select();
              setOtherOpen(false);
              onChange(option);
            }}
            colors={colors}
          />
        ))}
        <Pill
          label="Other"
          selected={otherOpen}
          onPress={() => {
            haptics.select();
            if (otherOpen) return;
            setOtherOpen(true);
            onChange('');
          }}
          colors={colors}
        />
      </View>
      {otherOpen ? (
        <View className="mt-3">
          <Field
            label="What is it?"
            value={value}
            onChangeText={onChange}
            colors={colors}
            placeholder="ULIP, Sukanya Samriddhi, chit fund"
            autoFocus
          />
        </View>
      ) : null}
    </View>
  );
}
