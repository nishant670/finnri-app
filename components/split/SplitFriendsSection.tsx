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
  /** The heading's word: "People" on Balances (P23). */
  label?: string;
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
  label = 'Friends',
}: SplitFriendsSectionProps) {
  const hasRows = visibleFriends.length > 0;
  // On Balances, friends who are all settled simply leave People empty; the
  // groups below are the rest of the list (P23). A search still says so.
  if (label === 'People' && hasAnyFriends && !hasRows && !normalizedSearch) return null;
  return (
    <View>
      {hasRows || hasAnyFriends ? (
        <GroupHeader
          label={hasRows ? `${label} · ${visibleFriends.length}` : label}
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
