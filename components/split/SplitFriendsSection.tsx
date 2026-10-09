import { View } from 'react-native';

import { StateView } from '@/components/ui/StateView';
import { type SplitFriend } from '@/lib/splits';

import type { ReactNode } from 'react';

type SplitFriendsSectionProps = {
  visibleFriends: SplitFriend[];
  hasAnyFriends: boolean;
  normalizedSearch: string;
  renderFriendRow: (friend: SplitFriend, entranceIndex: number) => ReactNode;
  onAddFriend: () => void;
};

export function SplitFriendsSection({
  visibleFriends,
  hasAnyFriends,
  normalizedSearch,
  renderFriendRow,
  onAddFriend,
}: SplitFriendsSectionProps) {
  return (
    <View className="mt-6 gap-4">
      {visibleFriends.length > 0 ? (
        visibleFriends.map(renderFriendRow)
      ) : (
        <StateView
          compact
          icon={!hasAnyFriends ? 'account-multiple-plus-outline' : 'account-search-outline'}
          title={normalizedSearch ? 'No matching friends' : 'Add friends to split bills'}
          message={
            normalizedSearch
              ? 'Try another search or balance filter.'
              : 'Create friends, then add them to groups, bills, and settlements.'
          }
          actionLabel={normalizedSearch ? undefined : 'Add friend'}
          onAction={onAddFriend}
        />
      )}
    </View>
  );
}
