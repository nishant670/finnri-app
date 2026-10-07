import {
  buildGroupRoster,
  formatBalance,
  groupMatchesSearch,
} from '@/components/split/split-utils';
import { type FriendDetailSummary, type SplitGroupSummary } from '@/components/split/split-types';
import { type BalanceFilter } from '@/components/split/sheets/BalanceFilterSheet';
import {
  type SplitActivityItem,
  type SplitBalance,
  type SplitBill,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import { getActivityIcon } from '@/lib/split-screen-helpers';

export const computeBalanceTotals = (balances: SplitBalance[]) => {
  return balances.reduce(
    (acc, balance) => {
      if (balance.net_balance > 0) {
        acc.owedByFriends += balance.net_balance;
      } else {
        acc.owedToFriends += Math.abs(balance.net_balance);
      }
      return acc;
    },
    { owedByFriends: 0, owedToFriends: 0 }
  );
};

export const buildFriendById = (
  friends: SplitFriend[],
  groups: SplitGroup[],
  bills: SplitBill[]
) => {
  const map = new Map(friends.map((friend) => [friend.id, friend]));
  groups.forEach((group) => {
    group.members?.forEach((member) => {
      if (member.friend) map.set(member.friend.id, member.friend);
    });
  });
  bills.forEach((bill) => {
    bill.participants?.forEach((participant) => {
      if (participant.friend) map.set(participant.friend.id, participant.friend);
    });
  });
  return map;
};

export const buildGroupSummaries = ({
  groups,
  bills,
  friendById,
  currentUserName,
  currentUserContact,
}: {
  groups: SplitGroup[];
  bills: SplitBill[];
  friendById: Map<number, SplitFriend>;
  currentUserName: string;
  currentUserContact: string;
}): SplitGroupSummary[] => {
  return groups.map((group) => {
    const kind = group.kind ?? 'other';
    const memberIds = (group.members ?? []).map((member) => member.friend_id);
    const groupBills = bills.filter((bill) => bill.group_id === group.id);
    // Both figures come from the server. Summing the group's participant
    // rows here read every bill as if its `direction` were absolute, but a
    // bill states the debts of whoever wrote it — so an expense a member
    // recorded arrived inverted, and the card claimed they owed money they
    // had actually laid out. The server is the only side that can tell, so
    // it is asked rather than guessed at.
    const groupBalancesByFriendId = new Map<number, number>(
      (group.viewer_balances ?? []).map((entry) => [entry.friend_id, entry.net_balance])
    );
    const netBalance = group.viewer_net_balance ?? 0;
    const latestBill = [...groupBills].sort((a, b) => b.date.localeCompare(a.date))[0];
    // Driven by the balances rather than the roster: for a member those name
    // their own friend rows, which is the only namespace they can resolve.
    const detailLines = [...groupBalancesByFriendId.entries()]
      .map(([friendId, balance]) => {
        const friend = friendById.get(friendId);
        if (!friend || balance === 0) return null;
        return balance > 0
          ? `${friend.name} owes you ${formatBalance(balance)}`
          : `You owe ${friend.name} ${formatBalance(balance)}`;
      })
      .filter((line): line is string => Boolean(line));

    return {
      group,
      billCount: groupBills.length,
      bills: [...groupBills].sort((a, b) => b.date.localeCompare(a.date)),
      detailLines,
      latestBill,
      kind,
      memberIds,
      roster: buildGroupRoster({ group, friendById, currentUserName, currentUserContact }),
      netBalance,
    };
  });
};

export const buildFriendDetailSummaries = ({
  friends,
  bills,
  groupSummaries,
  balanceByFriendId,
}: {
  friends: SplitFriend[];
  bills: SplitBill[];
  groupSummaries: SplitGroupSummary[];
  balanceByFriendId: Map<number, SplitBalance>;
}): FriendDetailSummary[] => {
  return friends.map((friend) => {
    // Matched through the viewer's restatement where there is one: a bill
    // somebody else wrote names *their* friend rows, so filtering on the raw
    // participants hid every shared-group expense from the card for the very
    // person it was split with.
    const friendBills = bills
      .filter((bill) =>
        bill.viewer_shares && bill.viewer_shares.length > 0
          ? bill.viewer_shares.some((share) => share.friend_id === friend.id)
          : bill.participants?.some((participant) => participant.friend_id === friend.id)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    // Matched on the roster rather than `memberIds`: those are the owner's
    // friend rows, so in a shared group a member's own friend never lined up
    // with one and the group never appeared on their card.
    const sharedGroups = groupSummaries.filter((summary) =>
      summary.roster.some((person) => person.friendId === friend.id)
    );
    const balance = balanceByFriendId.get(friend.id) ?? null;
    return {
      friend,
      balance,
      groups: sharedGroups,
      bills: friendBills,
      netBalance: balance?.net_balance ?? 0,
    };
  });
};

export const buildNonGroupSummary = (bills: SplitBill[], friendById: Map<number, SplitFriend>) => {
  const nonGroupBills = bills.filter((bill) => !bill.group_id);
  const participantBalances = new Map<number, number>();

  nonGroupBills.forEach((bill) => {
    bill.participants?.forEach((participant) => {
      const current = participantBalances.get(participant.friend_id) ?? 0;
      const signedShare =
        participant.direction === 'friend_owes_user'
          ? participant.share_amount
          : -participant.share_amount;
      participantBalances.set(participant.friend_id, current + signedShare);
    });
  });

  const netBalance = [...participantBalances.values()].reduce((sum, value) => sum + value, 0);
  const detailLines = [...participantBalances.entries()]
    .map(([friendId, value]) => {
      const friend = friendById.get(friendId);
      if (!friend || value === 0) return null;
      return value > 0
        ? `${friend.name} owes you ${formatBalance(value)}`
        : `You owe ${friend.name} ${formatBalance(value)}`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 2);
  const latestBill = [...nonGroupBills].sort((a, b) => b.date.localeCompare(a.date))[0];

  return {
    billCount: nonGroupBills.length,
    detailLines,
    latestBill,
    netBalance,
  };
};

export const buildRecentActivity = (activity: SplitActivityItem[]) => {
  return activity.map((item) => {
    const fallbackCaption =
      item.type === 'group_created'
        ? `${item.participant_count ?? 0} member${item.participant_count === 1 ? '' : 's'}`
        : item.type === 'friend_created'
          ? 'Friend added'
          : item.type === 'bill'
            ? item.group?.name
              ? `${item.group.name} group`
              : `${item.participant_count ?? item.participants?.length ?? 0} share${
                  (item.participant_count ?? item.participants?.length ?? 0) === 1 ? '' : 's'
                }`
            : 'Settlement';
    const baseCaption = item.notes || fallbackCaption;
    // Only on expenses. A settlement's title already names the other person
    // ("Priya paid you"), so repeating it here reads as a stutter.
    const caption =
      item.type === 'bill' && item.actor_name
        ? `${baseCaption} · added by ${item.actor_name}`
        : baseCaption;
    /*
     * A claimed payment and an agreed one used to read identically here, and
     * that is the difference the feed most needs to carry: a denial moves a
     * balance back, and this row is the only place that says why.
     */
    const status =
      item.type === 'settlement' && item.status && item.status !== 'confirmed' ? item.status : null;
    return {
      id: item.id,
      item,
      title: item.title,
      date: item.date,
      amount: item.amount,
      icon: getActivityIcon(item.type),
      caption,
      status,
    };
  });
};

export const matchesBalanceFilter = (filter: BalanceFilter, value: number) => {
  if (filter === 'all') return true;
  if (filter === 'open') return value !== 0;
  if (filter === 'owed_to_me') return value > 0;
  if (filter === 'i_owe') return value < 0;
  return value === 0;
};

export const filterVisibleGroups = ({
  groupSummaries,
  normalizedSearch,
  balanceFilter,
}: {
  groupSummaries: SplitGroupSummary[];
  normalizedSearch: string;
  balanceFilter: BalanceFilter;
}) => {
  return groupSummaries.filter((summary) => {
    const matchesSearch = groupMatchesSearch(summary, normalizedSearch);
    const isNewEmptyGroup = summary.billCount === 0 && summary.netBalance === 0;
    const matchesBalance =
      balanceFilter === 'open' && isNewEmptyGroup
        ? true
        : matchesBalanceFilter(balanceFilter, summary.netBalance);
    return matchesSearch && matchesBalance;
  });
};

export const filterVisibleFriends = ({
  friends,
  balanceByFriendId,
  normalizedSearch,
  balanceFilter,
}: {
  friends: SplitFriend[];
  balanceByFriendId: Map<number, SplitBalance>;
  normalizedSearch: string;
  balanceFilter: BalanceFilter;
}) => {
  return friends.filter((friend) => {
    const balance = balanceByFriendId.get(friend.id);
    const netBalance = balance?.net_balance ?? 0;
    const searchText = [friend.name, friend.phone, friend.email].filter(Boolean).join(' ');
    const matchesSearch = !normalizedSearch || searchText.toLowerCase().includes(normalizedSearch);
    return matchesSearch && matchesBalanceFilter(balanceFilter, netBalance);
  });
};

export const filterVisibleActivity = (
  recentActivity: ReturnType<typeof buildRecentActivity>,
  normalizedSearch: string
) => {
  if (!normalizedSearch) return recentActivity;
  return recentActivity.filter((item) =>
    [item.title, item.caption].join(' ').toLowerCase().includes(normalizedSearch)
  );
};
