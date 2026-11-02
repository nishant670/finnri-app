import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type {
  DeviceContactOption,
  SplitGroupRosterPerson,
  SplitGroupSummary,
} from '@/components/split/split-types';
import { formatMoney } from '@/lib/money';
import { SPLIT_GROUP_OWNER_SLOT, type SplitBill, type SplitFriend, type SplitGroup } from '@/lib/splits';
import { friendSplitKey, viewerSplitSlot, type GroupKind } from '@/lib/split-preferences';

export const groupKindOptions: {
  kind: GroupKind;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { kind: 'trip', label: 'Trip', icon: 'airplane' },
  { kind: 'home', label: 'Home', icon: 'home-outline' },
  { kind: 'couple', label: 'Couple', icon: 'heart-outline' },
  { kind: 'other', label: 'Other', icon: 'format-list-bulleted' },
];

export const getGroupKindConfig = (kind: GroupKind) =>
  groupKindOptions.find((option) => option.kind === kind) ?? groupKindOptions[3];

// Split balances are always drawn with their own directional wording
// ("owes you" / "you owe"), so the sign would be redundant noise.
export const formatBalance = (value: number) => formatMoney(value, { sign: 'never' });

export const formatMonthYear = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year || 2000, (month || 1) - 1, day || 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

export const getFirstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * The last ten digits: a phone book writes "+91 98718 01518" where a friend
 * was saved as "9871801518", and comparing every digit never matched the two.
 */
const normalizePhone = (value?: string) => (value?.replace(/\D/g, '') ?? '').slice(-10);

const normalizeEmail = (value?: string) => value?.trim().toLowerCase() ?? '';

export const contactMatchesFriend = (contact: DeviceContactOption, friend: SplitFriend) => {
  const contactPhone = normalizePhone(contact.phone);
  const friendPhone = normalizePhone(friend.phone);
  const contactEmail = normalizeEmail(contact.email);
  const friendEmail = normalizeEmail(friend.email);
  return Boolean(
    (contactEmail && friendEmail && contactEmail === friendEmail) ||
      (contactPhone && friendPhone && contactPhone === friendPhone)
  );
};

export const formatBillListDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year || 2000, (month || 1) - 1, day || 1);
  return {
    month: date.toLocaleString('en-US', { month: 'short' }),
    day: String(day || date.getDate()).padStart(2, '0'),
  };
};

export const getExpenseIconConfig = (
  title: string
): {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
} => {
  const normalized = title.toLowerCase();
  if (/(dinner|lunch|snack|food|restaurant|meal)/.test(normalized)) {
    return { icon: 'silverware-fork-knife' };
  }
  if (/(airbnb|hotel|stay|room|rent)/.test(normalized)) {
    return { icon: 'office-building-outline' };
  }
  if (/(travel|cab|taxi|train|flight|trip)/.test(normalized)) {
    return { icon: 'car-outline' };
  }
  return { icon: 'receipt-text-outline' };
};

/**
 * Everyone in a group, resolved for whoever is holding the phone.
 *
 * A group's `members` are the *owner's* friend rows. Read as a roster by
 * anybody else they are somebody else's address book: on the member's phone
 * the group listed one person — her own row, labelled "(you)" — and the man who
 * owns the group appeared nowhere in it, while the header above counted two
 * people. The server now sends `viewer_members`, which is the same roster
 * written in the reader's own rows.
 *
 * The `members` path below is the fallback for a backend that predates that
 * field. It reconstructs the same list from `viewer_slot_friends`, which older
 * builds already served, so an app ahead of its API degrades to the right
 * names rather than to an empty group.
 */
export const buildGroupRoster = ({
  group,
  friendById,
  currentUserName,
  currentUserContact,
}: {
  group: SplitGroup;
  friendById: Map<number, SplitFriend>;
  currentUserName: string;
  currentUserContact: string;
}): SplitGroupRosterPerson[] => {
  const contactOf = (friend?: SplitFriend) =>
    [friend?.phone, friend?.email].filter(Boolean).join(' • ');

  if (group.viewer_members && group.viewer_members.length > 0) {
    return group.viewer_members.map((member) => {
      const friend = friendById.get(member.friend_id);
      return {
        slot: member.slot,
        friendId: member.is_viewer ? 0 : member.friend_id,
        name: member.is_viewer ? currentUserName : (friend?.name ?? member.name ?? 'Group member'),
        subtitle: member.is_viewer
          ? currentUserContact
          : (contactOf(friend) || [member.phone, member.email].filter(Boolean).join(' • ')),
        isViewer: member.is_viewer,
      };
    });
  }

  const isMember = group.viewer_role === 'member';
  // Not `viewerSplitSlot`, which answers "owner" for a member whose slot is not
  // known yet. Here that would hand the reader's own badge to the person who
  // owns the group. Nobody is marked instead, which is the honest reading.
  const viewerSlot = isMember && !group.viewer_friend_id ? null : viewerSplitSlot(group);
  const slotFriends = group.viewer_slot_friends ?? {};
  const slots = [
    SPLIT_GROUP_OWNER_SLOT,
    ...(group.members ?? []).map((member) => friendSplitKey(member.friend_id)),
  ];

  return slots.map((slot) => {
    if (slot === viewerSlot) {
      return {
        slot,
        friendId: 0,
        name: currentUserName,
        subtitle: currentUserContact,
        isViewer: true,
      };
    }
    const friendId = isMember ? (slotFriends[slot] ?? 0) : Number(slot);
    const friend = friendById.get(friendId);
    // Whatever the group itself calls them, for a slot the viewer has no row
    // for: the owner's account name, or the owner's name for that member row.
    const groupSideName =
      slot === SPLIT_GROUP_OWNER_SLOT
        ? group.owner_name || 'Group owner'
        : (friendById.get(Number(slot))?.name ?? 'Group member');
    return {
      slot,
      friendId: Number.isFinite(friendId) ? friendId : 0,
      name: friend?.name ?? groupSideName,
      subtitle: contactOf(friend),
      isViewer: false,
    };
  });
};

/**
 * One bill's people, amounts and direction, read from the viewer's side.
 *
 * `bill.participants` cannot answer this. It records the debts of whoever wrote
 * the bill, against friend rows only they own, with `direction` stated from
 * their side — so read by anybody else, an expense the owner entered claimed
 * "You paid ₹5,880" and counted the reader's ₹2,352 of it as money she had
 * lent. `viewer_shares` is the server's restatement of the same bill for
 * whoever asked for it.
 *
 * The `participants` branch survives only as the fallback for a backend that
 * predates `viewer_shares`, where the reader is necessarily the author anyway.
 */
export type BillViewerReading = {
  /** Whoever laid the money out, named for the reader. */
  payerName: string;
  paidByYou: boolean;
  /** Positive means the reader lent on this bill; negative, borrowed. */
  net: number;
  people: { key: string; name: string; isViewer: boolean; paid: number; share: number }[];
};

export const readBillForViewer = (
  bill: SplitBill,
  friendById: Map<number, SplitFriend>,
  currentUserName: string
): BillViewerReading => {
  const shares = bill.viewer_shares ?? [];
  if (shares.length > 0) {
    const people = shares.map((share) => ({
      key: share.slot,
      name: share.is_viewer
        ? currentUserName
        : (friendById.get(share.friend_id)?.name ?? share.name ?? 'Friend'),
      isViewer: share.is_viewer,
      paid: share.paid,
      share: share.share,
    }));
    const payer = people.find((person) => person.paid > 0);
    const self = people.find((person) => person.isViewer);
    return {
      payerName: payer?.name ?? currentUserName,
      paidByYou: payer?.isViewer ?? false,
      net: (self?.paid ?? 0) - (self?.share ?? 0),
      people,
    };
  }

  const payerParticipant = bill.participants.find(
    (participant) => participant.direction === 'user_owes_friend'
  );
  const payerName = payerParticipant
    ? (friendById.get(payerParticipant.friend_id)?.name ?? 'Friend')
    : currentUserName;
  const lent = bill.participants
    .filter((participant) => participant.direction === 'friend_owes_user')
    .reduce((sum, participant) => sum + participant.share_amount, 0);
  const borrowed = bill.participants
    .filter((participant) => participant.direction === 'user_owes_friend')
    .reduce((sum, participant) => sum + participant.share_amount, 0);
  return {
    payerName,
    paidByYou: !payerParticipant,
    net: lent - borrowed,
    people: bill.participants.map((participant) => ({
      key: `${participant.friend_id}-${participant.direction}`,
      name: friendById.get(participant.friend_id)?.name ?? 'Friend',
      isViewer: false,
      paid: 0,
      share: participant.share_amount,
    })),
  };
};

/**
 * Each person's net inside one group, from the reader's side.
 *
 * Taken from `viewer_balances`, which the server folds across every member's
 * bills — the same figures the group header is drawn from. Summing the group's
 * participant rows here instead is what let the Balances sheet contradict the
 * header two lines above it, and told the member that her husband owed her the
 * ₹1,03,090 she in fact owed him.
 */
export const getGroupBalanceRows = (summary: SplitGroupSummary) => {
  const balanceByFriendId = new Map(
    (summary.group.viewer_balances ?? []).map((entry) => [entry.friend_id, entry.net_balance])
  );
  return summary.roster
    .filter((person) => !person.isViewer)
    .map((person) => ({ person, balance: balanceByFriendId.get(person.friendId) ?? 0 }));
};

export const getGroupTotals = (summary: SplitGroupSummary, friendById: Map<number, SplitFriend>, currentUserName: string) => {
  return summary.bills.reduce(
    (totals, bill) => {
      const reading = readBillForViewer(bill, friendById, currentUserName);
      totals.total += bill.total_amount;
      if (reading.paidByYou) {
        totals.youPaid += bill.total_amount;
      } else {
        totals.friendPaid += bill.total_amount;
      }
      totals.payers.set(
        reading.payerName,
        (totals.payers.get(reading.payerName) ?? 0) + bill.total_amount
      );
      if (reading.net > 0) totals.youLent += reading.net;
      if (reading.net < 0) totals.youBorrowed += -reading.net;
      return totals;
    },
    {
      total: 0,
      youPaid: 0,
      friendPaid: 0,
      youLent: 0,
      youBorrowed: 0,
      payers: new Map<string, number>(),
    }
  );
};

export const todayApiDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseApiDate = (value: string) => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

export const formatApiDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseAmount = (value: string) => Number(value.replace(/,/g, '').trim());

/**
 * How many settled groups a balance filter is actually holding back.
 *
 * Derived from the rendered list rather than counted independently, because
 * counting it independently is what put "Hiding groups that are settled up"
 * directly above the settled group it claimed to be hiding. Two cases broke
 * the old count: under the `all` filter nothing is held back, and a
 * freshly-made group is settled by definition but is deliberately kept on
 * screen so it does not vanish the moment it is created.
 *
 * Taking `visible` as the source of truth means the hint cannot disagree with
 * the list again, whatever exceptions that list grows later. `matchesSearch`
 * is separate because a group hidden by a query is not hidden for being
 * settled, and switching the balance filter would not bring it back.
 */
export function countHiddenSettledGroups<T extends { group: { id: number }; netBalance: number }>(
  summaries: readonly T[],
  visible: readonly T[],
  matchesSearch: (summary: T) => boolean
): number {
  const visibleIds = new Set(visible.map((summary) => summary.group.id));
  return summaries.filter(
    (summary) =>
      !visibleIds.has(summary.group.id) && summary.netBalance === 0 && matchesSearch(summary)
  ).length;
}

/**
 * Whether a group answers the search box — its name, its detail lines, or any
 * member's name.
 *
 * Shared so the list and the settled-up hint cannot drift apart on what
 * "matches" means; they disagreed once already, and a search predicate copied
 * into two places is how that happens a second time.
 */
export function groupMatchesSearch(summary: SplitGroupSummary, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;
  return [
    summary.group.name,
    ...summary.detailLines,
    // The roster rather than `memberIds`: those are the owner's friend rows,
    // which resolve to nothing at all in a member's own list, so searching a
    // shared group by the name of somebody in it never matched.
    ...summary.roster.map((person) => person.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

/**
 * The group members the expense composer can actually put a row on screen for.
 *
 * A group keeps its membership rows when a friend is archived, so `members` can
 * name somebody the friends list will never return. That split the composer in
 * two: these keys decide who *carries* a share, and the people list — which
 * resolves every member through the friends it has — decides who gets a *row*.
 * When the two disagree, the difference is a participant that counts toward the
 * total with nothing on screen to edit.
 *
 * The symptom was a percentage split reporting **150.00%** over two visible
 * rows reading 60 and 40: a third participant, invisible, still holding the 50
 * it had been seeded with when the split was two people. There was no way to
 * fix it from the UI, because the row it belonged to had been filtered out of
 * the UI.
 *
 * `resolvable` is the same lookup the people list uses. Passing it in rather
 * than a friends array keeps the two reading from one map instead of two copies
 * of the same filter.
 */
export function composerMemberKeys(
  members: { friend_id: number }[] | undefined,
  resolvable: { has: (friendId: number) => boolean },
  fallback: SplitFriend[]
): string[] {
  const keys = members
    ? members.filter((member) => resolvable.has(member.friend_id)).map((member) => String(member.friend_id))
    : fallback.map((friend) => String(friend.id));
  return [...new Set(keys)];
}

/**
 * What a zero balance means, and which of the two things it is.
 *
 * "Settled up" is a claim about what happened: money was owed and it came back.
 * A group made ten seconds ago has a zero balance for the opposite reason —
 * nothing has happened in it at all — and the screen said "settled up" there
 * too, congratulating the user on an event that never took place and hiding the
 * one thing the row should have been prompting: add the first expense.
 *
 * `hasActivity` is the whole distinction. It is false only when there is
 * nothing on that ledger to settle, so a group that genuinely balanced back out
 * to zero keeps "settled up" and keeps its meaning.
 *
 * Returns the phrase for a zero balance only; a non-zero one is drawn with an
 * animated amount beside it and cannot be a plain string.
 */
export const zeroBalanceLabel = ({
  hasActivity,
  overall = false,
}: {
  hasActivity: boolean;
  /** The screen-wide figure rather than one row's. */
  overall?: boolean;
}) => {
  if (!hasActivity) return overall ? 'Nothing to settle yet' : 'No expenses yet';
  return overall ? 'Overall, settled up' : 'settled up';
};
