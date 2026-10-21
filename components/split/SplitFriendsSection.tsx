import { View } from 'react-native';

import {
  BalanceFilterButton,
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
        <SplitListCard>
          {visibleFriends.map((friend, index) => renderFriendRow(friend, index, index > 0))}
        </SplitListCard>
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
        </View>
      )}
    </View>
  );
}
