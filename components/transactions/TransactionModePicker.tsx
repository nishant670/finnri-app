import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { paymentModeVisual } from '@/lib/payment-modes';

type TransactionModePickerProps = {
  visible: boolean;
  options: readonly string[];
  selected: string;
  /** "Paid via" on an expense, "Received via" on income. */
  title?: string;
  onClose: () => void;
  onSelect: (mode: string) => void;
};

/** The payment-method sheet opened from the form's "Paid via" row (board R2-Payment). */
export function TransactionModePicker({
  visible,
  options,
  selected,
  title = 'Paid via',
  onClose,
  onSelect,
}: TransactionModePickerProps) {
  return (
    <PickerSheet visible={visible} title={title} onClose={onClose}>
      <PickerOptionList
        accessibilityLabel={title}
        options={options.map((mode) => ({
          key: mode,
          label: mode,
          icon: paymentModeVisual(mode).icon,
        }))}
        selectedKey={selected}
        onSelect={onSelect}
      />
    </PickerSheet>
  );
}
