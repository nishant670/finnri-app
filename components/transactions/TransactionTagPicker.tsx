import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';

/** The tags an expense can carry. EMI, Refundable and Subscription each open their own card. */
export const tagOptions = ['Investment', 'Lending', 'EMI', 'Refundable', 'Subscription', 'General'];

const TAG_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Investment: 'chart-line',
  Lending: 'hand-coin-outline',
  EMI: 'calendar-sync-outline',
  Refundable: 'cash-refund',
  Subscription: 'autorenew',
  General: 'tag-outline',
};

export const tagIcon = (tag: string): keyof typeof MaterialCommunityIcons.glyphMap =>
  TAG_ICONS[tag] ?? 'tag-outline';

type TransactionTagPickerProps = {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (tag: string) => void;
};

/** The tag sheet opened from the Tag row under More details, drawn like R2-Payment. */
export function TransactionTagPicker({ visible, selected, onClose, onSelect }: TransactionTagPickerProps) {
  return (
    <PickerSheet visible={visible} title="Tag" onClose={onClose}>
      <PickerOptionList
        accessibilityLabel="Tag"
        options={tagOptions.map((tag) => ({ key: tag, label: tag, icon: tagIcon(tag) }))}
        selectedKey={selected || 'General'}
        onSelect={onSelect}
      />
    </PickerSheet>
  );
}
