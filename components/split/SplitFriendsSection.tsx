import { View } from 'react-native';

import {
  BalanceFilterButton,
  SettledHint,
  SplitEmptyCard,
  SplitListCard,
} from '@/components/split/primitives/SplitChrome';
import { GroupHeader } from '@/components/ui/theme-primitives';
import { type SplitFriend } from '@/lib/splits';

import type { ReactNode } from 'react';

type SplitFriendsSectionProps = {
  visibleFriends: SplitFriend[];
  hasAnyFriends: boolean;
  normalizedSearch: string;
  /** `divider`: the rule above the row — every row in the card but the first. */
  renderFriendRow: (friend: SplitFriend, entranceIndex: number, divider: boolean) => ReactNode;
  onAddFriend: () => void;
  /**
   * Friends the default "open" filter hides because nothing is owed. Without
   * this a settled friend simply vanished from Friends while still showing in
   * every picker, which read as the list being wrong.
   */
  hiddenSettledCount: number;
  onShowSettled: () => void;
  /** A balance filter other than the default "open" is set. */
  filterActive: boolean;
  onOpenFilter: () => void;
};

/** Friends: "Friends · N" over one card of rows, as Groups is laid out. */
export function SplitFriendsSection({
  visibleFriends,
  hasAnyFriends,
  normalizedSearch,
  renderFriendRow,
  onAddFriend,
  hiddenSettledCount,
  onShowSettled,
  filterActive,
  onOpenFilter,
}: SplitFriendsSectionProps) {
  const hasRows = visibleFriends.length > 0;
  return (
    <View>
      {hasRows || hasAnyFriends ? (
        <GroupHeader
          label={hasRows ? `Friends · ${visibleFriends.length}` : 'Friends'}
          accessory={<BalanceFilterButton active={filterActive} onPress={onOpenFilter} />}
        />
      ) : null}
      {hasRows ? (
        <>
          <SplitListCard>
            {visibleFriends.map((friend, index) => renderFriendRow(friend, index, index > 0))}
          </SplitListCard>
          <SettledHint noun="friend" settledCount={hiddenSettledCount} onShowSettled={onShowSettled} />
        </>
      ) : (
        <View style={hasAnyFriends ? undefined : { marginTop: 16 }}>
          <SplitEmptyCard
            icon={!hasAnyFriends ? 'account-plus-outline' : 'account-search-outline'}
            title={normalizedSearch ? 'No matching friends' : 'Add friends to split bills'}
            message={
              normalizedSearch
                ? 'Try another search or balance filter.'
                : 'Create friends, then add them to groups, bills, and settlements.'
            }
            actionLabel={normalizedSearch ? undefined : 'Add friend'}
            onAction={onAddFriend}
          />
          <SettledHint noun="friend" settledCount={hiddenSettledCount} onShowSettled={onShowSettled} />
        </View>
      )}
    </View>
  );
}
