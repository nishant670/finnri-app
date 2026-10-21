import { useState } from 'react';
import { View } from 'react-native';

import { InputRow, RECURRING_LABEL_WIDTH, RowsCard } from '@/components/money/subscriptions/FormRows';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { haptics } from '@/lib/haptics';
import { investmentTypeOptions, isListedInvestmentType } from '@/lib/subscription-form';

const OTHER = 'Other';

type InvestmentTypePickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Spacing from the rows around it. */
  style?: object;
};

/**
 * What an investment is, in the slot the other kinds give their name field.
 *
 * It was a blank text box headed "Investment", and on device the question was
 * what it wanted — the kind of investment, which has a short, well-known list.
 * The pick becomes the item's name; Other adds a row to type anything else. An
 * item saved with a name that is not on the list opens on Other with that name.
 *
 * Drawn as a row that opens a picker, like Repeats on board R5-NewLoan.
 *
 * Mount it with a `key` per item being edited: whether Other is open is held
 * here, and only read from `value` when the picker first appears.
 */
export function InvestmentTypePicker({ value, onChange, style }: InvestmentTypePickerProps) {
  const [otherOpen, setOtherOpen] = useState(
    () => value.trim() !== '' && !isListedInvestmentType(value)
  );
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const listed = investmentTypeOptions.find(
    (option) => option.toLowerCase() === value.trim().toLowerCase()
  );
  const selectedKey = otherOpen ? OTHER : (listed ?? null);

  return (
    <View testID="recurring-investment-type" style={style}>
      <RowsCard>
        <LabelRow
          testID="recurring-investment-type-row"
          label="Investment"
          value={selectedKey ?? 'Choose a type'}
          valueMuted={selectedKey == null}
          labelWidth={RECURRING_LABEL_WIDTH}
          onPress={() => setIsPickerVisible(true)}
        />
        {otherOpen ? (
          <InputRow
            label="What is it?"
            value={value}
            onChangeText={onChange}
            placeholder="ULIP, Sukanya Samriddhi, chit fund"
            autoFocus
            divider
          />
        ) : null}
      </RowsCard>

      <PickerSheet
        visible={isPickerVisible}
        title="Investment type"
        onClose={() => setIsPickerVisible(false)}>
        <PickerOptionList
          accessibilityLabel="Investment type"
          options={[...investmentTypeOptions, OTHER].map((option) => ({ key: option, label: option }))}
          selectedKey={selectedKey}
          onSelect={(key) => {
            haptics.select();
            setIsPickerVisible(false);
            if (key === OTHER) {
              if (otherOpen) return;
              setOtherOpen(true);
              onChange('');
              return;
            }
            setOtherOpen(false);
            onChange(key);
          }}
        />
      </PickerSheet>
    </View>
  );
}
