import { View } from 'react-native';

import {
  BalanceFilterButton,
  SettledHint,
  SplitEmptyCard,
  SplitListCard,
} from '@/components/split/primitives/SplitChrome';
import { GroupHeader } from '@/components/ui/theme-primitives';
import { type SplitGroupSummary } from '@/components/split/split-types';

import type { ReactNode } from 'react';

type SplitGroupsSectionProps = {
  groups: SplitGroupSummary[];
  showNonGroupSummary: boolean;
  hiddenSettledCount: number;
  normalizedSearch: string;
  /** `divider`: the rule above the row — every row in the card but the first. */
  renderGroupCard: (summary: SplitGroupSummary, entranceIndex: number, divider: boolean) => ReactNode;
  renderNonGroupRow: (entranceIndex: number, divider: boolean) => ReactNode;
  onShowSettled: () => void;
  onNewGroup: () => void;
  /** A balance filter other than the default "open" is set. */
  filterActive: boolean;
  onOpenFilter: () => void;
};

/** Groups (board R6-Groups): "Groups · N" over one card of rows, or R6-Empty's card. */
export function SplitGroupsSection({
  groups,
  showNonGroupSummary,
  hiddenSettledCount,
  normalizedSearch,
  renderGroupCard,
  renderNonGroupRow,
  onShowSettled,
  onNewGroup,
  filterActive,
  onOpenFilter,
}: SplitGroupsSectionProps) {
  const hasRows = groups.length > 0 || showNonGroupSummary;
  return (
    <View>
      {hasRows || filterActive || hiddenSettledCount > 0 ? (
        <GroupHeader
          label={groups.length > 0 ? `Groups · ${groups.length}` : 'Groups'}
          accessory={<BalanceFilterButton active={filterActive} onPress={onOpenFilter} />}
        />
      ) : null}
      {hasRows ? (
        <>
          <SplitListCard>
            {groups.map((summary, index) => renderGroupCard(summary, index, index > 0))}
            {showNonGroupSummary ? renderNonGroupRow(groups.length, groups.length > 0) : null}
          </SplitListCard>
          <SettledHint settledCount={hiddenSettledCount} onShowSettled={onShowSettled} />
        </>
      ) : (
        <View style={filterActive || hiddenSettledCount > 0 ? undefined : { marginTop: 16 }}>
          <SplitEmptyCard
            icon="account-multiple-plus-outline"
            title={normalizedSearch ? 'No matching groups' : 'Create your first group'}
            message={
              normalizedSearch
                ? 'Try another search or balance filter.'
                : 'Start a group now. Members can be added later.'
            }
            actionLabel={normalizedSearch ? undefined : 'New group'}
            onAction={onNewGroup}
          />
          <SettledHint settledCount={hiddenSettledCount} onShowSettled={onShowSettled} />
        </View>
      )}
    </View>
  );
}
