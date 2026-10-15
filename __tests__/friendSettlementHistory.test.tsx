import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import { FriendDetailModal } from '@/components/split/modals/FriendDetailModal';
import type { FriendDetailSummary, SplitGroupSummary } from '@/components/split/split-types';
import { useAuthStore } from '@/hooks/use-auth-store';
import { buildFriendSettlementHistory } from '@/lib/friend-settlements';
import {
  fetchFriendSettlementHistory,
  type SplitActivityItem,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';

const settlement = (overrides: Partial<SplitActivityItem>): SplitActivityItem => ({
  id: `settlement-${overrides.record_id ?? 1}`,
  type: 'settlement',
  record_id: 1,
  title: 'Settlement',
  date: '2026-10-07',
  amount: 100,
  friend_id: 7,
  direction: 'friend_paid_user',
  status: 'confirmed',
  created_at: '2026-10-07T10:00:00Z',
  ...overrides,
});

const biwi: SplitFriend = { id: 7, name: 'Biwi ❤️' } as SplitFriend;

describe('buildFriendSettlementHistory', () => {
  const items = [
    // She paid, he confirmed.
    settlement({
      record_id: 1,
      date: '2026-08-04',
      amount: 13537,
      actor_name: 'Biwi ❤️',
      group_name: 'Bubu Dudu Daily',
      payment_mode: 'upi',
      responded_at: '2026-08-05T09:00:00Z',
      notes: 'Settlement for Bubu Dudu Daily',
    }),
    // She paid, waiting on him.
    settlement({
      record_id: 2,
      date: '2026-10-07',
      amount: 19155,
      actor_name: 'Biwi ❤️',
      group_name: 'Noida Home Greh Parvesh',
      status: 'pending',
    }),
    // He recorded a payment she says never happened.
    settlement({
      record_id: 3,
      date: '2026-10-09',
      amount: 500,
      status: 'denied',
      responded_at: '2026-10-10T09:00:00Z',
      notes: 'Cash for groceries',
    }),
    // He paid her; she has no say to give (confirmed, never asked).
    settlement({ record_id: 4, date: '2026-09-12', amount: 300, direction: 'user_paid_friend' }),
  ];

  it('lists them by month, newest first', () => {
    const history = buildFriendSettlementHistory(items, biwi.name);

    expect(history.sections.map((section) => section.title)).toEqual([
      'October 2026',
      'September 2026',
      'August 2026',
    ]);
    expect(history.sections[0].rows.map((row) => row.settlementId)).toEqual([3, 2]);
  });

  it('says who recorded each one and where it stands', () => {
    const rows = buildFriendSettlementHistory(items, biwi.name).sections.flatMap(
      (section) => section.rows
    );
    const byId = Object.fromEntries(rows.map((row) => [row.settlementId, row]));

    expect(byId[1].title).toBe('Biwi paid you');
    expect(byId[1].details).toBe('Bubu Dudu Daily · Paid by UPI · Recorded by Biwi');
    expect(byId[1].standing).toEqual({
      kind: 'confirmed',
      label: 'You confirmed it on 5 Aug',
      yourMove: false,
    });
    // The pre-filled note repeats the group, so it is not shown twice.
    expect(byId[1].notes).toBeNull();

    expect(byId[2].standing).toEqual({ kind: 'pending', label: 'Waiting for you', yourMove: true });

    expect(byId[3].title).toBe('Biwi paid you');
    expect(byId[3].details).toBe('Recorded by you');
    expect(byId[3].standing?.label).toBe('Biwi denied it on 10 Oct');
    expect(byId[3].notes).toBe('Cash for groceries');

    expect(byId[4].title).toBe('You paid Biwi');
    expect(byId[4].standing).toBeNull();
  });

  it('counts what was paid each way, leaving denied payments out', () => {
    const history = buildFriendSettlementHistory(items, biwi.name);

    expect(history.received).toBe(13537 + 19155);
    expect(history.paid).toBe(300);
    expect(history.count).toBe(3);
    expect(history.awaitingYou).toBe(1);
  });

  it('a payment I recorded that is still waiting names who it waits on', () => {
    const [row] = buildFriendSettlementHistory([settlement({ status: 'pending' })], biwi.name)
      .sections[0].rows;

    expect(row.standing).toEqual({ kind: 'pending', label: 'Waiting for Biwi', yourMove: false });
  });
});

describe('fetchFriendSettlementHistory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks for one friend’s settlements and reads every page', async () => {
    const urls: string[] = [];
    const first = Array.from({ length: 100 }, (_, index) => settlement({ record_id: index + 1 }));
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const page = new URL(url).searchParams.get('page');
      const items = page === '1' ? first : [settlement({ record_id: 101 })];
      return new Response(
        JSON.stringify({ items, total: 101, page: Number(page), page_size: 100 })
      );
    }) as unknown as typeof fetch;

    const items = await fetchFriendSettlementHistory('session', 7);

    expect(items).toHaveLength(101);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('type=settlement');
    expect(urls[0]).toContain('friend_id=7');
  });

  it('keeps only this friend’s settlements from a server that ignores the filter', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              settlement({ record_id: 1 }),
              settlement({ record_id: 2, friend_id: 9 }),
              { ...settlement({ record_id: 3 }), type: 'bill' },
            ],
            total: 3,
          })
        )
    ) as unknown as typeof fetch;

    const items = await fetchFriendSettlementHistory('session', 7);

    expect(items.map((item) => item.record_id)).toEqual([1]);
  });
});

describe('the friend page', () => {
  const group = (id: number, name: string, owed: number, totalSplit: number): SplitGroupSummary =>
    ({
      group: {
        id,
        name,
        viewer_balances: [{ friend_id: 7, net_balance: owed }],
      } as SplitGroup,
      billCount: 1,
      bills: [
        {
          id: id * 10,
          date: '2026-10-05',
          participants: [{ friend_id: 7, share_amount: totalSplit, direction: 'friend_owes_user' }],
        },
      ],
      detailLines: [],
      kind: 'home',
      memberIds: [7],
      roster: [],
    }) as unknown as SplitGroupSummary;

  const summary: FriendDetailSummary = {
    friend: biwi,
    balance: null,
    groups: [
      group(1, 'Bubu Dudu Daily', 2014, 16337),
      group(2, 'Noida Home Greh Parvesh', 9555, 114620),
    ],
    bills: [],
    netBalance: 11569,
  };

  const renderPage = () =>
    render(
      <FriendDetailModal
        summary={summary}
        currentUserName="Me"
        onClose={jest.fn()}
        onAddExpense={jest.fn()}
        onSettleUp={jest.fn()}
        onOpenGroup={jest.fn()}
        onOpenOptions={jest.fn()}
      />
    );

  beforeEach(() => {
    useAuthStore.setState({ token: 'session' });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
    jest.restoreAllMocks();
  });

  it('does not put money owed across two groups "in" one of them', async () => {
    const screen = await renderPage();

    expect(screen.getByText('Biwi owes you ₹11,569 across 2 groups')).toBeTruthy();
  });

  it('shows what is still owed in each group, not everything ever split', async () => {
    const screen = await renderPage();

    expect(screen.getByText('₹2,014')).toBeTruthy();
    expect(screen.getByText('₹9,555')).toBeTruthy();
    expect(screen.queryByText('₹16,337')).toBeNull();
    expect(screen.getAllByText('owes you')).toHaveLength(2);
  });

  it('opens the settlement history from its pill', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              settlement({
                record_id: 5,
                amount: 13537,
                actor_name: 'Biwi ❤️',
                group_name: 'Bubu Dudu Daily',
                responded_at: '2026-10-08T09:00:00Z',
              }),
            ],
            total: 1,
          })
        )
    ) as unknown as typeof fetch;
    const screen = await renderPage();

    await fireEvent.press(screen.getByText('Settlements'));

    await waitFor(() => expect(screen.getByTestId('friend-settlement-history')).toBeTruthy());
    expect(screen.getByText('With Biwi ❤️')).toBeTruthy();
    const row = within(screen.getByTestId('settlement-row-5'));
    expect(row.getByText('Biwi paid you')).toBeTruthy();
    expect(row.getByText('Bubu Dudu Daily · Recorded by Biwi')).toBeTruthy();
    expect(row.getByText('You confirmed it on 8 Oct')).toBeTruthy();
  });
});
