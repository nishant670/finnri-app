import { View } from 'react-native';

import { SettledHint } from '@/components/split/primitives/SplitChrome';
import { StateView } from '@/components/ui/StateView';
import { type SplitGroupSummary } from '@/components/split/split-types';

import type { ReactNode } from 'react';

type SplitGroupsSectionProps = {
  groups: SplitGroupSummary[];
  showNonGroupSummary: boolean;
  hiddenSettledCount: number;
  normalizedSearch: string;
  renderGroupCard: (summary: SplitGroupSummary, entranceIndex: number) => ReactNode;
  renderNonGroupRow: (entranceIndex: number) => ReactNode;
  onShowSettled: () => void;
  onNewGroup: () => void;
};

export function SplitGroupsSection({
  groups,
  showNonGroupSummary,
  hiddenSettledCount,
  normalizedSearch,
  renderGroupCard,
  renderNonGroupRow,
  onShowSettled,
  onNewGroup,
}: SplitGroupsSectionProps) {
  return (
    <View className="mt-6 gap-5">
      {groups.length > 0 || showNonGroupSummary ? (
        <>
          {groups.map(renderGroupCard)}
          {showNonGroupSummary ? renderNonGroupRow(groups.length) : null}
          <SettledHint settledCount={hiddenSettledCount} onShowSettled={onShowSettled} />
        </>
      ) : (
        <StateView
          compact
          icon="account-group-outline"
          title={normalizedSearch ? 'No matching groups' : 'Create your first group'}
          message={
            normalizedSearch
              ? 'Try another search or balance filter.'
              : 'Start a group now. Members can be added later.'
          }
          actionLabel={normalizedSearch ? undefined : 'New group'}
          onAction={onNewGroup}
        />
      )}
    </View>
  );
}
