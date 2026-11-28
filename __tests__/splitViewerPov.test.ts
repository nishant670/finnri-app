import {
  billNetWithFriend,
  buildGroupRoster,
  getGroupBalanceRows,
  getGroupTotals,
  readBillForViewer,
} from '@/components/split/split-utils';
import type { SplitGroupSummary } from '@/components/split/split-types';
import type { SplitBill, SplitFriend, SplitGroup } from '@/lib/splits';

const friend = (id: number, name: string): SplitFriend =>
  ({ id, user_id: 1, name, archived: false }) as SplitFriend;

/**
 * The group from the report: the husband owns it, the wife joined it. In her
 * account the only friend row that exists is her row for him.
 */
const memberFriends = new Map<number, SplitFriend>([[21, friend(21, 'Nishant Munjal')]]);

const memberGroup = {
  id: 4,
  user_id: 9,
  name: 'Noida Home Greh Parvesh',
  archived: false,
  owner_name: 'Nishant Munjal',
  viewer_role: 'member',
  viewer_friend_id: 11,
  viewer_slot_friends: { owner: 21 },
  members: [{ id: 1, user_id: 9, group_id: 4, friend_id: 11 }],
  viewer_members: [
    { slot: 'owner', friend_id: 21, name: 'Nishant Munjal', is_viewer: false },
    { slot: '11', friend_id: 0, name: '', is_viewer: true },
  ],
  viewer_balances: [{ friend_id: 21, net_balance: -103090 }],
  viewer_net_balance: -103090,
} as unknown as SplitGroup;

/** An expense the husband entered: he paid 5,880 and 2,352 of it is hers. */
const ownerPaidBill = {
  id: 1,
  user_id: 9,
  group_id: 4,
  title: 'Curtains final payment',
  total_amount: 5880,
  currency: 'INR',
  date: '2026-09-01',
  participants: [{ friend_id: 33, share_amount: 2352, direction: 'friend_owes_user' }],
  viewer_shares: [
    { slot: 'owner', friend_id: 21, name: 'Nishant Munjal', is_viewer: false, paid: 5880, share: 3528 },
    { slot: '11', friend_id: 0, name: '', is_viewer: true, paid: 0, share: 2352 },
  ],
} as unknown as SplitBill;

const summaryFor = (group: SplitGroup, bills: SplitBill[]): SplitGroupSummary => ({
  group,
  billCount: bills.length,
  bills,
  detailLines: [],
  latestBill: bills[0],
  kind: 'home',
  memberIds: (group.members ?? []).map((member) => member.friend_id),
  roster: buildGroupRoster({
    group,
    friendById: memberFriends,
    currentUserName: 'Riya Dutta',
    currentUserContact: 'riyadutta53@gmail.com',
  }),
  netBalance: group.viewer_net_balance ?? 0,
});

describe('readBillForViewer', () => {
  it("reads somebody else's expense from the reader's side", () => {
    // The reported bug: this row said "You paid ₹5,880 … you lent ₹2,352" on
    // the phone of the person who had neither paid nor lent. Both figures were
    // the author's, shown to the wrong reader.
    const reading = readBillForViewer(ownerPaidBill, memberFriends, 'Riya Dutta');

    expect(reading.paidByYou).toBe(false);
    expect(reading.payerName).toBe('Nishant Munjal');
    expect(reading.net).toBe(-2352);
  });

  it('reads the same expense as lending for the person who entered it', () => {
    const asOwner = {
      ...ownerPaidBill,
      viewer_shares: [
        { slot: 'owner', friend_id: 0, name: '', is_viewer: true, paid: 5880, share: 3528 },
        { slot: '11', friend_id: 33, name: 'Biwi', is_viewer: false, paid: 0, share: 2352 },
      ],
    } as unknown as SplitBill;

    const reading = readBillForViewer(asOwner, new Map(), 'Nishant Munjal');

    expect(reading.paidByYou).toBe(true);
    expect(reading.net).toBe(2352);
  });

  it('falls back to the author reading when the server sends no restatement', () => {
    // An app ahead of its backend. The reader is necessarily the author there,
    // because a shared group's foreign bills are the only case that needs the
    // restatement at all.
    const legacy = { ...ownerPaidBill, viewer_shares: undefined } as SplitBill;
    const reading = readBillForViewer(legacy, new Map([[33, friend(33, 'Biwi')]]), 'Nishant');

    expect(reading.paidByYou).toBe(true);
    expect(reading.net).toBe(2352);
  });
});

describe('group roster', () => {
  it('names everyone in a shared group, the reader included', () => {
    const roster = buildGroupRoster({
      group: memberGroup,
      friendById: memberFriends,
      currentUserName: 'Riya Dutta',
      currentUserContact: 'riyadutta53@gmail.com',
    });

    expect(roster.map((person) => [person.name, person.isViewer])).toEqual([
      ['Nishant Munjal', false],
      ['Riya Dutta', true],
    ]);
    // The owner is nameable by her own row, so she can settle with him.
    expect(roster[0].friendId).toBe(21);
    expect(roster[1].friendId).toBe(0);
  });

  it('reconstructs the roster from slot links when the server sends none', () => {
    const legacy = { ...memberGroup, viewer_members: undefined } as SplitGroup;

    const roster = buildGroupRoster({
      group: legacy,
      friendById: memberFriends,
      currentUserName: 'Riya Dutta',
      currentUserContact: '',
    });

    expect(roster.map((person) => person.name)).toEqual(['Nishant Munjal', 'Riya Dutta']);
  });
});

describe('group sheets from the reader’s side', () => {
  const summary = summaryFor(memberGroup, [ownerPaidBill]);

  it('shows the balance the way the group header already showed it', () => {
    // The Balances and Settle up sheets contradicted the header two lines
    // above them: "You owe ₹1,03,090" over a row reading "Biwi owes you
    // ₹1,03,090" — the owner's row, the owner's direction, her phone.
    expect(getGroupBalanceRows(summary)).toEqual([
      { person: expect.objectContaining({ name: 'Nishant Munjal', friendId: 21 }), balance: -103090 },
    ]);
  });

  it('counts totals as paid by him and borrowed by her', () => {
    const totals = getGroupTotals(summary, memberFriends, 'Riya Dutta');

    expect(totals.total).toBe(5880);
    expect(totals.youPaid).toBe(0);
    expect(totals.friendPaid).toBe(5880);
    expect(totals.youLent).toBe(0);
    expect(totals.youBorrowed).toBe(2352);
    expect([...totals.payers.entries()]).toEqual([['Nishant Munjal', 5880]]);
  });

  it('counts the same expense as paid and lent for the man who entered it', () => {
    const ownerGroup = {
      ...memberGroup,
      viewer_role: 'owner',
      viewer_friend_id: null,
      viewer_slot_friends: undefined,
      viewer_members: [
        { slot: 'owner', friend_id: 0, name: '', is_viewer: true },
        { slot: '11', friend_id: 11, name: 'Biwi', is_viewer: false },
      ],
      viewer_balances: [{ friend_id: 11, net_balance: 103090 }],
      viewer_net_balance: 103090,
    } as unknown as SplitGroup;
    const asOwner = {
      ...ownerPaidBill,
      viewer_shares: [
        { slot: 'owner', friend_id: 0, name: '', is_viewer: true, paid: 5880, share: 3528 },
        { slot: '11', friend_id: 11, name: 'Biwi', is_viewer: false, paid: 0, share: 2352 },
      ],
    } as unknown as SplitBill;

    const totals = getGroupTotals(
      summaryFor(ownerGroup, [asOwner]),
      new Map([[11, friend(11, 'Biwi')]]),
      'Nishant Munjal'
    );

    expect(totals.youPaid).toBe(5880);
    expect(totals.friendPaid).toBe(0);
    expect(totals.youLent).toBe(2352);
    expect(totals.youBorrowed).toBe(0);
  });
});

describe("a friend's page reads each bill for that friend alone (24 Nov retest)", () => {
  // Dinner 1,600 split three ways is 2,400; here the reader paid 2,400 and
  // Aarav's and Priya's shares are 800 each.
  const dinner = {
    id: 9,
    user_id: 1,
    title: 'Dinner',
    total_amount: 2400,
    currency: 'INR',
    date: '2026-11-24',
    participants: [
      { friend_id: 5, share_amount: 800, direction: 'friend_owes_user' },
      { friend_id: 6, share_amount: 800, direction: 'friend_owes_user' },
    ],
  } as unknown as SplitBill;

  it('says what that friend owes, not what the whole bill lent', () => {
    expect(readBillForViewer(dinner, new Map(), 'You').net).toBe(1600);
    expect(billNetWithFriend(dinner, 5)).toBe(800);
    expect(billNetWithFriend(dinner, 6)).toBe(800);
    expect(billNetWithFriend(dinner, 7)).toBe(0);
  });

  it('reads the served shares: the friend paid, a third person paid', () => {
    const shares = (payer: 'viewer' | 'aarav' | 'priya') =>
      ({
        ...dinner,
        viewer_shares: [
          { slot: 'me', friend_id: 0, name: '', is_viewer: true, paid: payer === 'viewer' ? 2400 : 0, share: 800 },
          { slot: '5', friend_id: 5, name: 'Aarav', is_viewer: false, paid: payer === 'aarav' ? 2400 : 0, share: 800 },
          { slot: '6', friend_id: 6, name: 'Priya', is_viewer: false, paid: payer === 'priya' ? 2400 : 0, share: 800 },
        ],
      }) as unknown as SplitBill;
    expect(billNetWithFriend(shares('viewer'), 5)).toBe(800);
    expect(billNetWithFriend(shares('aarav'), 5)).toBe(-800);
    // Priya paid: nothing on this bill is between the reader and Aarav.
    expect(billNetWithFriend(shares('priya'), 5)).toBe(0);
  });
});
