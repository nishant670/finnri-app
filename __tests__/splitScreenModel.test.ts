import type { BalanceFilter } from '@/components/split/sheets/BalanceFilterSheet';
import type { SplitGroupSummary } from '@/components/split/split-types';
import { formatBalance } from '@/components/split/split-utils';
import {
  buildFriendById,
  buildFriendDetailSummaries,
  buildGroupSummaries,
  activityDateLabel,
  activityDayTitle,
  buildActivityListItems,
  buildRecentActivity,
  groupBillsByMonth,
  computeBalanceTotals,
  filterVisibleActivity,
  filterVisibleFriends,
  filterVisibleGroups,
  matchesBalanceFilter,
} from '@/lib/split-screen-model';
import type {
  SplitActivityItem,
  SplitBalance,
  SplitBill,
  SplitFriend,
  SplitGroup,
} from '@/lib/splits';

const friend = (id: number, name: string, extra: Partial<SplitFriend> = {}) =>
  ({ id, name, ...extra }) as SplitFriend;
const bill = (over: Partial<SplitBill>) =>
  ({
    id: 1,
    title: 'Bill',
    date: '2026-10-01',
    total_amount: 100,
    participants: [],
    ...over,
  }) as SplitBill;
const balance = (f: SplitFriend, net: number) => ({ friend: f, net_balance: net }) as SplitBalance;

const asha = friend(1, 'Asha');
const ravi = friend(2, 'Ravi');

describe('computeBalanceTotals', () => {
  it('splits what friends owe the user from what the user owes them', () => {
    const totals = computeBalanceTotals([
      balance(asha, 300),
      balance(ravi, -120),
      balance(friend(3, 'Mira'), 0),
      balance(friend(4, 'Zed'), -30),
    ]);
    expect(totals).toEqual({ owedByFriends: 300, owedToFriends: 150 });
  });

  it('is zero for an empty ledger', () => {
    expect(computeBalanceTotals([])).toEqual({ owedByFriends: 0, owedToFriends: 0 });
  });
});

describe('buildFriendById', () => {
  it('also finds friends that only appear inside groups or bills', () => {
    const inGroup = friend(10, 'GroupOnly');
    const inBill = friend(11, 'BillOnly');
    const map = buildFriendById(
      [asha],
      [{ id: 1, members: [{ friend_id: 10, friend: inGroup }, { friend_id: 99 }] } as never],
      [bill({ participants: [{ friend_id: 11, friend: inBill }] as never })]
    );
    expect([...map.keys()].sort()).toEqual([1, 10, 11]);
    expect(map.get(11)).toBe(inBill);
  });

  it('lets a later source overwrite an earlier one for the same id', () => {
    const newer = friend(1, 'Asha (newer)');
    const map = buildFriendById(
      [asha],
      [],
      [bill({ participants: [{ friend_id: 1, friend: newer }] as never })]
    );
    expect(map.get(1)).toBe(newer);
  });
});

describe('buildGroupSummaries', () => {
  const group = {
    id: 5,
    name: 'Goa',
    kind: 'trip',
    members: [{ friend_id: 1 }, { friend_id: 2 }],
    viewer_balances: [
      { friend_id: 1, net_balance: 250 },
      { friend_id: 2, net_balance: -40 },
      { friend_id: 7, net_balance: 100 },
      { friend_id: 1000, net_balance: 0 },
    ],
    viewer_net_balance: 210,
  } as unknown as SplitGroup;
  const friendById = new Map([
    [1, asha],
    [2, ravi],
  ]);
  const run = (over: Partial<Parameters<typeof buildGroupSummaries>[0]> = {}) =>
    buildGroupSummaries({
      groups: [group],
      bills: [
        bill({ id: 1, group_id: 5, date: '2026-09-01' }),
        bill({ id: 2, group_id: 5, date: '2026-10-05' }),
        bill({ id: 3, group_id: 9 }),
      ],
      friendById,
      currentUserName: 'Me',
      currentUserContact: 'me@x.com',
      ...over,
    });

  it('takes the net balance from the server and defaults it to zero', () => {
    expect(run()[0].netBalance).toBe(210);
    expect(
      run({ groups: [{ ...group, viewer_net_balance: undefined } as SplitGroup] })[0].netBalance
    ).toBe(0);
  });

  it('keeps only this group’s bills, newest first, and reports the latest', () => {
    const [summary] = run();
    expect(summary.billCount).toBe(2);
    expect(summary.bills.map((b) => b.id)).toEqual([2, 1]);
    expect(summary.latestBill?.id).toBe(2);
  });

  it('words each open balance from the viewer’s side, skipping zero and unknown friends', () => {
    expect(run()[0].detailLines).toEqual([
      `Asha owes you ${formatBalance(250)}`,
      `You owe Ravi ${formatBalance(-40)}`,
    ]);
  });

  it('defaults the kind and the member ids', () => {
    const [summary] = run({
      groups: [{ id: 6, name: 'No kind' } as SplitGroup],
    });
    expect(summary.kind).toBe('other');
    expect(summary.memberIds).toEqual([]);
    expect(summary.billCount).toBe(0);
    expect(summary.latestBill).toBeUndefined();
  });

  it('lists member ids in the owner’s namespace', () => {
    expect(run()[0].memberIds).toEqual([1, 2]);
  });
});

describe('buildFriendDetailSummaries', () => {
  const groupSummary = (roster: number[]) =>
    ({
      group: { id: 1 },
      roster: roster.map((friendId) => ({ friendId })),
    }) as unknown as SplitGroupSummary;

  it('attaches the balance, defaulting to none', () => {
    const [a, r] = buildFriendDetailSummaries({
      friends: [asha, ravi],
      bills: [],
      groupSummaries: [],
      balanceByFriendId: new Map([[1, balance(asha, 75)]]),
    });
    expect(a.netBalance).toBe(75);
    expect(r.balance).toBeNull();
    expect(r.netBalance).toBe(0);
  });

  it('finds a friend’s bills through the viewer’s restatement when there is one', () => {
    const viaShares = bill({
      id: 1,
      viewer_shares: [{ friend_id: 1 }] as never,
      participants: [{ friend_id: 2 }] as never,
    });
    const viaParticipants = bill({
      id: 2,
      date: '2026-10-09',
      participants: [{ friend_id: 1 }] as never,
    });
    const result = buildFriendDetailSummaries({
      friends: [asha, ravi],
      bills: [viaShares, viaParticipants],
      groupSummaries: [],
      balanceByFriendId: new Map(),
    });
    expect(result[0].bills.map((b) => b.id)).toEqual([2, 1]);
    expect(result[1].bills).toEqual([]);
  });

  it('matches shared groups on the roster, not the owner’s member ids', () => {
    const result = buildFriendDetailSummaries({
      friends: [asha, ravi],
      bills: [],
      groupSummaries: [groupSummary([1])],
      balanceByFriendId: new Map(),
    });
    expect(result[0].groups).toHaveLength(1);
    expect(result[1].groups).toHaveLength(0);
  });
});

describe('buildRecentActivity', () => {
  const item = (over: Partial<SplitActivityItem>) =>
    ({
      id: '1',
      title: 'T',
      date: '2026-10-01',
      amount: 0,
      type: 'bill',
      ...over,
    }) as SplitActivityItem;

  it('captions a group creation with a pluralised member count', () => {
    const [one, many] = buildRecentActivity([
      item({ type: 'group_created', participant_count: 1 }),
      item({ id: '2', type: 'group_created', participant_count: 3 }),
    ]);
    expect(one.caption).toBe('1 member');
    expect(many.caption).toBe('3 members');
  });

  it('captions bills by group name or by share count, and credits another author', () => {
    const [byGroup, byShares, added] = buildRecentActivity([
      item({ group: { name: 'Goa' } as never }),
      item({ id: '2', participant_count: 1 }),
      item({ id: '3', group: { name: 'Goa' } as never, actor_name: 'Asha' }),
    ]);
    expect(byGroup.caption).toBe('Goa group');
    expect(byShares.caption).toBe('1 share');
    expect(added.caption).toBe('Goa group · added by Asha');
  });

  it('prefers notes, and never appends the author to a settlement', () => {
    const [noted, settled] = buildRecentActivity([
      item({ notes: 'Cab', actor_name: 'Asha' }),
      item({ id: '2', type: 'settlement', actor_name: 'Asha' }),
    ]);
    expect(noted.caption).toBe('Cab · added by Asha');
    expect(settled.caption).toBe('Settlement');
  });

  it('flags a settlement that is not yet confirmed and picks an icon', () => {
    const [pending, confirmed, friendRow] = buildRecentActivity([
      item({ type: 'settlement', status: 'pending' }),
      item({ id: '2', type: 'settlement', status: 'confirmed' }),
      item({ id: '3', type: 'friend_created' }),
    ]);
    expect(pending.status).toBe('pending');
    expect(pending.icon).toBe('hand-coin-outline');
    expect(confirmed.status).toBeNull();
    expect(friendRow.caption).toBe('Friend added');
  });
});

// On device, an expense added today for the 13th sat below one added yesterday
// for the 14th. The feed is now in the order things happened, so each row says
// when that was, and the expense's own date when it differs.
describe('activityDateLabel', () => {
  const now = new Date(2026, 9, 15, 11, 0);
  const at = (day: number, hour = 10, minute = 0) =>
    new Date(2026, 9, day, hour, minute).toISOString();
  const item = (over: Partial<SplitActivityItem>) =>
    ({
      id: '1',
      title: 'Uber ride',
      date: '2026-10-15',
      type: 'bill',
      created_at: at(15),
      activity_at: at(15),
      ...over,
    }) as SplitActivityItem;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => jest.useRealTimers());

  it('says when an expense dated the day it was added happened', () => {
    expect(activityDateLabel(item({}), now)).toBe('Today');
    expect(
      activityDateLabel(item({ date: '2026-10-14', created_at: at(14), activity_at: at(14) }), now)
    ).toBe('Yesterday');
  });

  it('adds the expense date when it was added on another day', () => {
    expect(activityDateLabel(item({ date: '2026-10-13' }), now)).toBe('Added today · for 13 Oct');
    expect(
      activityDateLabel(item({ date: '2026-10-01', created_at: at(9), activity_at: at(9) }), now)
    ).toBe('Added 6 days ago · for 1 Oct');
  });

  it('calls a later save an edit', () => {
    expect(
      activityDateLabel(item({ date: '2026-10-14', created_at: at(14), activity_at: at(15) }), now)
    ).toBe('Edited today · for 14 Oct');
    expect(activityDateLabel(item({ created_at: at(15, 9), activity_at: at(15, 10) }), now)).toBe(
      'Edited today'
    );
    // Two writes in the same save are still one "added".
    expect(
      activityDateLabel(item({ created_at: at(15, 10, 0), activity_at: at(15, 10, 0) }), now)
    ).toBe('Today');
  });

  it('gives a group or a friend just the day', () => {
    expect(
      activityDateLabel(
        item({
          type: 'group_created',
          date: '2026-10-12',
          created_at: at(12),
          activity_at: at(12),
        }),
        now
      )
    ).toBe('3 days ago');
  });

  it('falls back to the row date from an older server', () => {
    expect(
      activityDateLabel(item({ date: '2026-10-14', created_at: '', activity_at: undefined }), now)
    ).toBe('Yesterday');
  });
});

describe('buildActivityListItems', () => {
  const now = new Date(2026, 9, 15, 11, 0);
  const at = (day: number, hour = 10) => new Date(2026, 9, day, hour, 0).toISOString();
  const item = (id: string, day: number, over: Partial<SplitActivityItem> = {}) =>
    ({
      id,
      title: `Item ${id}`,
      date: `2026-10-${String(day).padStart(2, '0')}`,
      type: 'bill',
      amount: 100,
      created_at: at(day),
      activity_at: at(day),
      ...over,
    }) as SplitActivityItem;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => jest.useRealTimers());

  it('heads each day and marks where each row falls in its card', () => {
    const rows = buildRecentActivity([
      item('a', 15),
      item('b', 15, { amount: 250 }),
      item('c', 14),
      item('d', 10),
    ]);
    const items = buildActivityListItems(rows, { hasMore: false, now });
    expect(items.map((entry) => (entry.kind === 'day' ? entry.title : entry.row.id))).toEqual([
      'Today',
      'a',
      'b',
      'Yesterday',
      'c',
      'Sat, 10 Oct',
      'd',
    ]);
    const flags = items
      .filter((entry) => entry.kind === 'row')
      .map((entry) => (entry.kind === 'row' ? [entry.groupFirst, entry.groupLast] : null));
    expect(flags).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
    expect(items[0]).toMatchObject({ kind: 'day', total: 350, first: true });
  });

  it('totals only expenses, and leaves the total off a day with none', () => {
    const rows = buildRecentActivity([
      item('a', 15, { amount: 400 }),
      item('b', 15, { type: 'settlement', amount: 900 }),
      item('c', 14, { type: 'friend_created', amount: null as unknown as number }),
    ]);
    const days = buildActivityListItems(rows, { hasMore: false, now }).filter(
      (entry) => entry.kind === 'day'
    );
    expect(days.map((day) => (day.kind === 'day' ? day.total : undefined))).toEqual([400, null]);
  });

  it('leaves the total off the last day while more of it may still load', () => {
    const rows = buildRecentActivity([item('a', 15), item('b', 14)]);
    const days = buildActivityListItems(rows, { hasMore: true, now }).filter(
      (entry) => entry.kind === 'day'
    );
    expect(days.map((day) => (day.kind === 'day' ? day.total : undefined))).toEqual([100, null]);
  });

  it('names other days by weekday, with the year once it differs', () => {
    expect(activityDayTitle('2026-10-10', now)).toBe('Sat, 10 Oct');
    expect(activityDayTitle('2025-10-10', now)).toBe('Fri, 10 Oct 2025');
  });
});

describe('groupBillsByMonth', () => {
  const bills = [
    bill({ id: 1, date: '2026-10-10', total_amount: 100 }),
    bill({ id: 2, date: '2026-10-02', total_amount: 50 }),
    bill({ id: 3, date: '2026-09-21', total_amount: 30 }),
  ];
  const netOf = (b: SplitBill) => (b.id === 2 ? -20 : b.total_amount / 2);

  it('keeps the order and heads each month with the viewer’s net', () => {
    const months = groupBillsByMonth(bills, netOf, true);
    expect(months.map((month) => [month.title, month.bills.map((b) => b.id), month.net])).toEqual([
      ['October 2026', [1, 2], 30],
      ['September 2026', [3], 15],
    ]);
  });

  it('is one untitled run when the sort is not by date', () => {
    const months = groupBillsByMonth(bills, netOf, false);
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ title: null, net: 45 });
    expect(groupBillsByMonth([], netOf, false)).toEqual([]);
  });
});

describe('matchesBalanceFilter', () => {
  const cases: [BalanceFilter, number, boolean][] = [
    ['all', 0, true],
    ['open', 0, false],
    ['open', -5, true],
    ['owed_to_me', 5, true],
    ['owed_to_me', -5, false],
    ['i_owe', -5, true],
    ['i_owe', 5, false],
    ['settled' as BalanceFilter, 0, true],
    ['settled' as BalanceFilter, 1, false],
  ];
  it.each(cases)('%s with %i → %s', (filter, value, expected) => {
    expect(matchesBalanceFilter(filter, value)).toBe(expected);
  });
});

describe('visible filters', () => {
  const summary = (name: string, net: number, billCount: number) =>
    ({
      group: { id: name.length, name },
      netBalance: net,
      billCount,
      roster: [],
      memberIds: [],
    }) as unknown as SplitGroupSummary;

  it('keeps a brand-new empty group under the "open" filter so it can be started', () => {
    const fresh = summary('Fresh', 0, 0);
    const settled = summary('Settled', 0, 3);
    const owed = summary('Owed', 50, 1);
    const names = (filter: BalanceFilter) =>
      filterVisibleGroups({
        groupSummaries: [fresh, settled, owed],
        normalizedSearch: '',
        balanceFilter: filter,
      }).map((s) => s.group.name);
    expect(names('open')).toEqual(['Fresh', 'Owed']);
    expect(names('all')).toEqual(['Fresh', 'Settled', 'Owed']);
    expect(names('owed_to_me')).toEqual(['Owed']);
  });

  it('filters friends by name, phone or email and by balance', () => {
    const friends = [
      friend(1, 'Asha', { phone: '98765' }),
      friend(2, 'Ravi', { email: 'ravi@x.com' }),
    ];
    const by = new Map([[1, balance(friends[0], 10)]]);
    const ids = (q: string, f: BalanceFilter = 'all') =>
      filterVisibleFriends({
        friends,
        balanceByFriendId: by,
        normalizedSearch: q,
        balanceFilter: f,
      }).map((x) => x.id);
    expect(ids('')).toEqual([1, 2]);
    expect(ids('987')).toEqual([1]);
    expect(ids('ravi@')).toEqual([2]);
    expect(ids('', 'open')).toEqual([1]);
  });

  it('filters activity on title and caption, case-insensitively', () => {
    const rows = buildRecentActivity([
      {
        id: '1',
        title: 'Dinner',
        date: 'd',
        amount: 1,
        type: 'bill',
        notes: 'with Asha',
      } as unknown as SplitActivityItem,
      {
        id: '2',
        title: 'Cab',
        date: 'd',
        amount: 1,
        type: 'bill',
        notes: 'airport',
      } as unknown as SplitActivityItem,
    ]);
    expect(filterVisibleActivity(rows, '')).toBe(rows);
    expect(filterVisibleActivity(rows, 'asha').map((r) => r.id)).toEqual(['1']);
    expect(filterVisibleActivity(rows, 'cab').map((r) => r.id)).toEqual(['2']);
  });
});
