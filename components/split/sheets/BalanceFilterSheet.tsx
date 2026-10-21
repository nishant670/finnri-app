import { PickerOptionList, PickerSheet, type PickerOption } from '@/components/ui/PickerSheet';
import { haptics } from '@/lib/haptics';

export type BalanceFilter = 'all' | 'open' | 'owed_to_me' | 'i_owe' | 'settled';

const OPTIONS: readonly (PickerOption & { key: BalanceFilter })[] = [
  {
    key: 'open',
    label: 'Open balances',
    caption: 'Hide settled groups and friends.',
    icon: 'scale-balance',
  },
  {
    key: 'owed_to_me',
    label: 'Owed to me',
    caption: 'Show only people and groups that owe you.',
    icon: 'arrow-down-bold-circle-outline',
  },
  {
    key: 'i_owe',
    label: 'I owe',
    caption: 'Show only balances you need to pay.',
    icon: 'arrow-up-bold-circle-outline',
  },
  {
    key: 'settled',
    label: 'Settled up',
    caption: 'Show settled groups and friends.',
    icon: 'check-circle-outline',
  },
  {
    key: 'all',
    label: 'Everything',
    caption: 'Show open and settled split records.',
    icon: 'format-list-bulleted',
  },
];

export function BalanceFilterSheet({
  visible,
  selectedFilter,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedFilter: BalanceFilter;
  onSelect: (filter: BalanceFilter) => void;
  onClose: () => void;
}) {
  return (
    <PickerSheet visible={visible} title="Filter balances" onClose={onClose}>
      <PickerOptionList
        accessibilityLabel="Balance filter"
        options={OPTIONS}
        selectedKey={selectedFilter}
        onSelect={(key) => {
          haptics.select();
          onSelect(key as BalanceFilter);
        }}
      />
    </PickerSheet>
  );
}
