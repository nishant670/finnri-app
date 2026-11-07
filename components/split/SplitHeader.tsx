import { type ActiveSection } from '@/components/split/primitives/SplitChrome';
import { TabHeader } from '@/components/ui/TabHeader';

type SplitHeaderProps = {
  loading: boolean;
  searchVisible: boolean;
  activeSection: ActiveSection;
  onToggleSearch: () => void;
  onCreate: () => void;
};

/** The Splits tab's header (board R6-Groups): search, and add for the section. */
export function SplitHeader({
  loading,
  searchVisible,
  activeSection,
  onToggleSearch,
  onCreate,
}: SplitHeaderProps) {
  return (
    <TabHeader
      title="Splits"
      busy={loading}
      actions={[
        {
          icon: searchVisible ? 'close' : 'magnify',
          accessibilityLabel: searchVisible ? 'Hide split search' : 'Search splits',
          onPress: onToggleSearch,
        },
        {
          icon: activeSection === 'activity' ? 'account-group-outline' : 'account-plus-outline',
          accessibilityLabel:
            activeSection === 'activity' ? 'Create split group' : 'Add split friend',
          onPress: onCreate,
        },
      ]}
    />
  );
}
