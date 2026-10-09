import { fireEvent, render } from '@testing-library/react-native';

import type { SplitGroupSummary } from '@/components/split/split-types';
import { formatBalance } from '@/components/split/split-utils';
import { SplitActivityRow } from '@/components/split/rows/SplitActivityRow';
import { SplitFriendChip } from '@/components/split/rows/SplitFriendChip';
import { SplitFriendRow } from '@/components/split/rows/SplitFriendRow';
import { SplitGroupCard } from '@/components/split/rows/SplitGroupCard';
import { SplitNonGroupRow } from '@/components/split/rows/SplitNonGroupRow';
import { haptics } from '@/lib/haptics';
import type { SplitFriend } from '@/lib/splits';

jest.mock('@/lib/haptics', () => ({ haptics: { select: jest.fn() } }));

const asha = { id: 1, name: 'Asha', phone: '98765', email: 'a@x.com' } as SplitFriend;

afterEach(() => jest.clearAllMocks());

describe('SplitFriendChip', () => {
  it('selects the friend with a haptic tick', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <SplitFriendChip friend={asha} selectedId={null} onSelect={onSelect} />
    );
    await fireEvent.press(screen.getByText('Asha'));
    expect(haptics.select).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks the selected friend', async () => {
    const screen = await render(
      <SplitFriendChip friend={asha} selectedId={1} onSelect={jest.fn()} />
    );
    expect(screen.getByText('Asha')).toBeTruthy();
  });
});

describe('SplitFriendRow', () => {
  const setup = async (netBalance: number, friend: SplitFriend = asha) => {
    const h = {
      onOpenChange: jest.fn(),
      onEdit: jest.fn(),
      onArchive: jest.fn(),
      onOpen: jest.fn(),
      onLongPress: jest.fn(),
    };
    const screen = await render(
      <SplitFriendRow
        friend={friend}
        netBalance={netBalance}
        entranceIndex={0}
        isOpen={false}
        {...h}
      />
    );
    return { screen, ...h };
  };

  it('words the balance from the user’s side', async () => {
    expect((await setup(120)).screen.getByText(`${formatBalance(120)} owes you`)).toBeTruthy();
    expect((await setup(-120)).screen.getByText(`${formatBalance(-120)} you owe`)).toBeTruthy();
    expect((await setup(0)).screen.getByText(`${formatBalance(0)} settled`)).toBeTruthy();
  });

  it('shows the contact line, or says none is saved', async () => {
    expect((await setup(0)).screen.getByText('98765 • a@x.com')).toBeTruthy();
    expect(
      (await setup(0, { id: 2, name: 'Ravi' } as SplitFriend)).screen.getByText('No contact saved')
    ).toBeTruthy();
  });

  it('opens on press and offers the actions on long press', async () => {
    const { screen, onOpen, onLongPress } = await setup(0);
    const row = screen.getByLabelText('Open Asha');
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await fireEvent(row, 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

const summary = (over: Partial<SplitGroupSummary> = {}) =>
  ({
    group: { id: 5, name: 'Goa', photo_url: null, viewer_can_manage: true },
    billCount: 0,
    bills: [],
    detailLines: [],
    kind: 'trip',
    memberIds: [],
    roster: [
      { slot: 'owner', friendId: 0, name: 'Me', subtitle: '', isViewer: true },
      { slot: '1', friendId: 1, name: 'Asha', subtitle: '', isViewer: false },
      { slot: '2', friendId: 2, name: 'Ravi', subtitle: '', isViewer: false },
    ],
    netBalance: 0,
    ...over,
  }) as unknown as SplitGroupSummary;

describe('SplitGroupCard', () => {
  const setup = async (s: SplitGroupSummary) => {
    const h = {
      onOpenChange: jest.fn(),
      onEdit: jest.fn(),
      onArchive: jest.fn(),
      onOpen: jest.fn(),
    };
    const screen = await render(
      <SplitGroupCard summary={s} entranceIndex={0} isOpen={false} {...h} />
    );
    return { screen, ...h };
  };

  it('prompts for the first expense and lists the other members when the group is new', async () => {
    const { screen } = await setup(summary());
    expect(screen.getByText('Goa')).toBeTruthy();
    expect(screen.getByText('No expenses yet')).toBeTruthy();
    expect(screen.getByText('Asha, Ravi')).toBeTruthy();
  });

  it('falls back to a nudge when there are no other members', async () => {
    const { screen } = await setup(summary({ roster: [] }));
    expect(screen.getByText('Add members or the first expense')).toBeTruthy();
  });

  it('shows the open balances when there are some', async () => {
    const { screen } = await setup(
      summary({ billCount: 2, netBalance: 50, detailLines: ['Asha owes you ₹50.00'] })
    );
    expect(screen.getByText('Asha owes you ₹50.00')).toBeTruthy();
  });

  it('otherwise summarises the bills, singular and plural', async () => {
    const one = await setup(summary({ billCount: 1, latestBill: { date: '2026-10-01' } as never }));
    expect(one.screen.getByText('1 bill • last on 2026-10-01')).toBeTruthy();
    const many = await setup(
      summary({ billCount: 3, latestBill: { date: '2026-10-02' } as never })
    );
    expect(many.screen.getByText('3 bills • last on 2026-10-02')).toBeTruthy();
  });

  it('opens the group on press', async () => {
    const { screen, onOpen } = await setup(summary());
    await fireEvent.press(screen.getByText('Goa'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('SplitNonGroupRow', () => {
  const nonGroup = (over: Record<string, unknown> = {}) =>
    ({ billCount: 0, detailLines: [], latestBill: undefined, netBalance: 0, ...over }) as never;

  it('describes personal shared expenses and opens the bill composer', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <SplitNonGroupRow summary={nonGroup()} entranceIndex={0} onPress={onPress} />
    );
    expect(screen.getByText('Non-group expenses')).toBeTruthy();
    expect(screen.getByText('Personal shared expenses')).toBeTruthy();
    await fireEvent.press(screen.getByText('Non-group expenses'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers the open balances, then the bill count', async () => {
    const withLines = await render(
      <SplitNonGroupRow
        summary={nonGroup({ billCount: 2, detailLines: ['Asha owes you ₹10.00'] })}
        entranceIndex={0}
        onPress={jest.fn()}
      />
    );
    expect(withLines.getByText('Asha owes you ₹10.00')).toBeTruthy();
    const counted = await render(
      <SplitNonGroupRow
        summary={nonGroup({ billCount: 1, latestBill: { date: '2026-10-03' } })}
        entranceIndex={0}
        onPress={jest.fn()}
      />
    );
    expect(counted.getByText('1 bill • last on 2026-10-03')).toBeTruthy();
  });
});

describe('SplitActivityRow', () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 'bill-1',
      item: {},
      title: 'Dinner',
      date: '2026-10-01',
      amount: 500,
      icon: 'receipt-text-outline',
      caption: 'Goa group',
      status: null,
      ...over,
    }) as never;

  it('shows the title, caption, date and amount, and opens the target', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <SplitActivityRow item={row()} entranceIndex={0} onPress={onPress} />
    );
    expect(screen.getByText('Dinner')).toBeTruthy();
    expect(screen.getByText('Goa group • 2026-10-01')).toBeTruthy();
    expect(screen.getByText(formatBalance(500))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open activity Dinner'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('labels settlements that are not confirmed', async () => {
    const pending = await render(
      <SplitActivityRow item={row({ status: 'pending' })} entranceIndex={0} onPress={jest.fn()} />
    );
    expect(pending.getByText('Awaiting confirmation')).toBeTruthy();
    const denied = await render(
      <SplitActivityRow item={row({ status: 'denied' })} entranceIndex={0} onPress={jest.fn()} />
    );
    expect(denied.getByText('Denied')).toBeTruthy();
  });

  it('omits the amount when there is none', async () => {
    const screen = await render(
      <SplitActivityRow item={row({ amount: null })} entranceIndex={0} onPress={jest.fn()} />
    );
    expect(screen.queryByText(formatBalance(500))).toBeNull();
  });
});
