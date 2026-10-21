import {
  buildGroupRoster,
  formatBalance,
  formatMonthYear,
  groupMatchesSearch,
} from '@/components/split/split-utils';
import { type FriendDetailSummary, type SplitGroupSummary } from '@/components/split/split-types';
import { type BalanceFilter } from '@/components/split/sheets/BalanceFilterSheet';
import {
  settlementPaymentCaption,
  type SplitActivityItem,
  type SplitBalance,
  type SplitBill,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import { getActivityIcon } from '@/lib/split-screen-helpers';
import { formatRelativeDay } from '@/lib/datetime';

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

const localDay = (value: Date) =>
  [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');

/** `13 Oct`, or `13 Oct 2025` from another year. */
const shortDate = (value: string, now: Date) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const month = day.toLocaleString('en-US', { month: 'short' });
  return day.getFullYear() === now.getFullYear()
    ? `${day.getDate()} ${month}`
    : `${day.getDate()} ${month} ${day.getFullYear()}`;
};

/** Saves within this long of the first one are the same "added", not an edit. */
const EDIT_GRACE_MS = 60_000;

/**
 * When a row happened, for its time line.
 *
 * The feed is in the order things happened, not by the dates they carry: on
 * device, an expense added today for the 13th sat below one added yesterday
 * for the 14th. So the line says when it happened — `Today`, `Yesterday`,
 * `12 Oct` — and, when an expense or payment is dated another day, that day as
 * well: `Added today · for 13 Oct`. An edit says so: `Edited today`.
 *
 * Rows from a server that predates `activity_at` show their own date, as before.
 */
export const activityDateLabel = (item: SplitActivityItem, now: Date = new Date()) => {
  const stamp = item.activity_at || item.created_at;
  const at = stamp ? new Date(stamp) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return formatRelativeDay(item.date) ?? item.date;
  }
  const when = formatRelativeDay(at) ?? shortDate(localDay(at), now);
  if (item.type !== 'bill' && item.type !== 'settlement') return when;

  const created = item.created_at ? new Date(item.created_at).getTime() : at.getTime();
  const edited = item.type === 'bill' && at.getTime() - created > EDIT_GRACE_MS;
  const datedElsewhere =
    /^\d{4}-\d{2}-\d{2}/.test(item.date) && item.date.slice(0, 10) !== localDay(at);
  if (!edited && !datedElsewhere) return when;
  const verb = edited ? 'Edited' : 'Added';
  const relative = when === 'Today' || when === 'Yesterday' ? when.toLowerCase() : when;
  return datedElsewhere
    ? `${verb} ${relative} · for ${shortDate(item.date, now)}`
    : `${verb} ${relative}`;
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
    // A settlement says how it was paid before anything else: it is what
    // the other person checks it against, and it was not shown anywhere.
    const baseCaption =
      item.type === 'settlement'
        ? [settlementPaymentCaption(item.payment_mode), item.notes].filter(Boolean).join(' · ') ||
          fallbackCaption
        : item.notes || fallbackCaption;
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
      date: activityDateLabel(item),
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

export type ActivityRowModel = ReturnType<typeof buildRecentActivity>[number];

export type ActivityListItem =
  | {
      kind: 'day';
      key: string;
      /** "Today", "Yesterday", "Sat, 10 Oct". */
      title: string;
      /** What the day's expenses came to; null where it would be wrong. */
      total: number | null;
      first: boolean;
    }
  | {
      kind: 'row';
      key: string;
      row: ActivityRowModel;
      position: number;
      /** Where the row falls in its day's card: top edge, bottom edge. */
      groupFirst: boolean;
      groupLast: boolean;
    };

/** The local day a feed item belongs to, as `YYYY-MM-DD`. */
const activityDayKey = (item: SplitActivityItem) => {
  const stamp = item.activity_at || item.created_at;
  const at = stamp ? new Date(stamp) : null;
  if (at && !Number.isNaN(at.getTime())) return localDay(at);
  return /^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.slice(0, 10) : item.date;
};

/** `Today`, `Yesterday`, `Sat, 10 Oct`, or `Sat, 10 Oct 2025` from another year. */
export const activityDayTitle = (dayKey: string, now: Date = new Date()) => {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dayKey;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const weekday = day.toLocaleString('en-US', { weekday: 'short' });
  return `${weekday}, ${shortDate(dayKey, now)}`;
};

/**
 * The Activity feed as one flat list: each day's heading, then its rows, so
 * each day reads as one card (board R6-Activity) while the list stays
 * virtualised. Days follow the feed's own order; nothing is re-sorted.
 *
 * - The total is the day's expenses only. A settlement moves money that was
 *   already counted, and a new friend or group moves none.
 * - `hasMore`: the last day on screen may continue on the next page, so its
 *   total is left off rather than shown short.
 */
export const buildActivityListItems = (
  rows: ActivityRowModel[],
  { hasMore, now = new Date() }: { hasMore: boolean; now?: Date }
): ActivityListItem[] => {
  const days: { key: string; rows: ActivityRowModel[] }[] = [];
  rows.forEach((row) => {
    const key = activityDayKey(row.item);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else days.push({ key, rows: [row] });
  });

  const items: ActivityListItem[] = [];
  let position = 0;
  days.forEach((day, index) => {
    const bills = day.rows.filter((row) => row.item.type === 'bill' && row.amount != null);
    const mayContinue = hasMore && index === days.length - 1;
    items.push({
      kind: 'day',
      // A day can appear twice when the feed is out of order; the index keeps keys unique.
      key: `day:${day.key}:${index}`,
      title: activityDayTitle(day.key, now),
      total:
        mayContinue || bills.length === 0
          ? null
          : bills.reduce((sum, row) => sum + Math.abs(row.amount ?? 0), 0),
      first: index === 0,
    });
    day.rows.forEach((row, rowIndex) => {
      items.push({
        kind: 'row',
        key: `row:${row.id}`,
        row,
        position,
        groupFirst: rowIndex === 0,
        groupLast: rowIndex === day.rows.length - 1,
      });
      position += 1;
    });
  });
  return items;
};

export type BillMonthGroup = {
  key: string;
  /** "October 2026"; null for the one ungrouped run an amount sort gives. */
  title: string | null;
  bills: SplitBill[];
  /** The viewer's side of the month, summed: positive is lent, negative borrowed. */
  net: number;
};

/**
 * A group's expenses by month (board R6-Group), in the order they arrive —
 * each month a card, headed by what the viewer lent or borrowed in it.
 *
 * Only a date sort has months to show. Ranked by amount or by last edit, the
 * dates jump about, so the list stays one card with no headings.
 */
export const groupBillsByMonth = (
  bills: SplitBill[],
  netOf: (bill: SplitBill) => number,
  byMonth: boolean
): BillMonthGroup[] => {
  if (!byMonth) {
    return bills.length === 0
      ? []
      : [{ key: 'all', title: null, bills, net: bills.reduce((sum, bill) => sum + netOf(bill), 0) }];
  }
  const groups: BillMonthGroup[] = [];
  bills.forEach((bill) => {
    const key = bill.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.bills.push(bill);
      last.net += netOf(bill);
    } else {
      groups.push({ key, title: formatMonthYear(bill.date), bills: [bill], net: netOf(bill) });
    }
  });
  return groups.map((group, index) => ({ ...group, key: `${group.key}:${index}` }));
};
