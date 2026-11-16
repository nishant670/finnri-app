import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import {
  groupNotifications,
  notificationDestination,
  notificationKind,
  notificationTimeLabel,
} from '@/lib/notification-kinds';
import type { AppNotification } from '@/lib/notifications';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'token' }) }));

const mockFetchNotifications = jest.fn();
jest.mock('@/lib/notifications', () => ({
  ...jest.requireActual('@/lib/notifications'),
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  markNotificationRead: jest.fn().mockResolvedValue({}),
  markAllNotificationsRead: jest.fn().mockResolvedValue(undefined),
  deleteNotification: (...args: unknown[]) => mockDelete(...args),
}));
const mockDelete = jest.fn().mockResolvedValue(undefined);
const mockDecide = jest.fn().mockResolvedValue(null);
jest.mock('@/lib/splits', () => ({
  ...jest.requireActual('@/lib/splits'),
  decideSplitSettlement: (...args: unknown[]) => mockDecide(...args),
}));

const mockConfirmOccurrence = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/subscriptions', () => ({
  ...jest.requireActual('@/lib/subscriptions'),
  confirmSubscriptionOccurrence: (...args: unknown[]) => mockConfirmOccurrence(...args),
}));

// eslint-disable-next-line import/first
import NotificationsScreen from '@/app/notifications';

const notification = (overrides: Partial<AppNotification>): AppNotification => ({
  id: 1,
  user_id: 1,
  type: 'account.needs_setup',
  title: 'Finish setting up SBI Account',
  body: 'Add the missing account details.',
  action_url: '/accounts/4',
  read_at: null,
  created_at: '2026-10-23T08:00:00Z',
  updated_at: '2026-10-23T08:00:00Z',
  ...overrides,
});

describe('notification kinds (R10-Kinds)', () => {
  it('gives each type its own icon instead of the bell', () => {
    expect(notificationKind('account.needs_setup').icon).toBe('bank-outline');
    expect(notificationKind('card_statement.overdue').icon).toBe('calendar-alert');
    expect(notificationKind('split.settlement.recorded').action).toBe('Review in Splits');
    expect(notificationKind('something.new').icon).toBe('bell-outline');
    expect(notificationKind('billing.pass.gifted')).toMatchObject({ icon: 'gift-outline', action: 'See your pass' });
  });

  it('colours late things red and close things amber', () => {
    expect(notificationKind('card_statement.overdue').color).toBe('#C43D52');
    expect(notificationKind('subscription.overdue').color).toBe('#C43D52');
    expect(notificationKind('card_statement.due_soon').color).toBe('#B45309');
    expect(notificationKind('budget.warning').color).toBe('#B45309');
  });
});

describe('where a notification opens', () => {
  it('opens Budgets for a budget alert, whose link points back at notifications', () => {
    expect(
      notificationDestination(notification({ type: 'budget.exceeded', action_url: '/notifications' }))
    ).toBe('/budgets');
  });

  it('opens Money › Recurring for a recurring reminder', () => {
    expect(
      notificationDestination(notification({ type: 'subscription.due', action_url: '/subscriptions' }))
    ).toEqual({ pathname: '/(tabs)/money', params: { segment: 'subscriptions' } });
  });

  it('keeps the links that already worked', () => {
    expect(notificationDestination(notification({ action_url: '/accounts/4' }))).toEqual({
      pathname: '/accounts/[id]',
      params: { id: '4' },
    });
    expect(
      notificationDestination(notification({ type: 'split.settlement.recorded', action_url: '/split/settlements/9' }))
    ).toBe('/(tabs)/split');
    expect(
      notificationDestination(notification({ type: 'subscription.autopay', action_url: '/subscription-occurrences/3' }))
    ).toBeNull();
  });

  it('opens Billing for a gifted pass', () => {
    expect(notificationDestination(notification({ type: 'billing.pass.gifted', action_url: '/billing' }))).toBe(
      '/billing'
    );
    expect(notificationDestination(notification({ type: 'billing.pass.gifted', action_url: '/billing/x' }))).toBeNull();
  });
});

describe('grouping and times', () => {
  const now = new Date('2026-10-23T14:00:00');

  it('groups by Today, Last 7 days and Earlier, in that order', () => {
    const groups = groupNotifications(
      [
        notification({ id: 1, created_at: '2026-10-23T09:00:00' }),
        notification({ id: 2, created_at: '2026-10-19T09:00:00' }),
        notification({ id: 3, created_at: '2026-10-04T09:00:00' }),
      ],
      now
    );
    expect(groups.map((group) => group.group)).toEqual(['Today', 'Last 7 days', 'Earlier']);
  });

  it('says hours ago today and the date before that', () => {
    expect(notificationTimeLabel('2026-10-23T11:00:00', now)).toBe('3h ago');
    expect(notificationTimeLabel('2026-10-12T11:00:00', now)).toBe('12 Oct');
    // en-IN's short month is "Sept"; every other month is three letters.
    expect(notificationTimeLabel('2026-09-30T11:00:00', now)).toBe('30 Sep');
  });
});

describe('notifications screen', () => {
  beforeEach(() => mockFetchNotifications.mockReset());

  it('draws an unread row with its next step and offers Mark all read', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [notification({})],
      unread_count: 1,
    });
    const screen = await render(<NotificationsScreen />);

    await waitFor(() => expect(screen.getByText('Finish setting up SBI Account')).toBeTruthy());
    expect(screen.getByText('Add details')).toBeTruthy();
    expect(screen.getByTestId('notifications-mark-all')).toBeTruthy();
    expect(screen.queryByText('You’re all caught up')).toBeNull();
  });

  it('says you are caught up, and hides Mark all read, when nothing is unread', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [notification({ read_at: '2026-10-23T09:00:00Z' })],
      unread_count: 0,
    });
    const screen = await render(<NotificationsScreen />);

    await waitFor(() => expect(screen.getByText('You’re all caught up')).toBeTruthy());
    expect(screen.queryByTestId('notifications-mark-all')).toBeNull();
  });

  it('keeps Confirm and Fix it on an autopay notice', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [
        notification({ type: 'subscription.autopay', action_url: '/subscription-occurrences/3', title: 'EMI recorded' }),
      ],
      unread_count: 1,
    });
    const screen = await render(<NotificationsScreen />);

    await waitFor(() => expect(screen.getByText('Confirm')).toBeTruthy());
    expect(screen.getByText('Fix it')).toBeTruthy();
  });
});

describe('Notifications with proposals (P45–P49)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildNotificationSections } = require('@/lib/notification-jobs');

  it('puts jobs first, one row each, and drops what the server resolved', () => {
    const { needs, updates } = buildNotificationSections([
      notification({ id: 1, action_url: '/accounts/4' }),
      notification({ id: 2, action_url: '/accounts/5', title: 'Finish setting up Bank Account' }),
      notification({ id: 3, type: 'card_statement.overdue', action_url: '/accounts/9', title: 'SBI bill' }),
      notification({ id: 4, type: 'card_statement.due_today', action_url: '/accounts/9', title: 'SBI bill' }),
      notification({ id: 5, type: 'monthly_review', action_url: '/monthly-review/2026-09', title: 'September in review' }),
      notification({ id: 6, type: 'subscription.overdue', action_url: '/recurring/3', resolved_at: '2026-10-23T09:00:00Z' }),
    ]);
    // The overdue bill first: most urgent leads (2026-11-13).
    expect(needs.map((job: { stackTitle: string | null; items: unknown[] }) => [job.stackTitle, job.items.length])).toEqual([
      [null, 2],
      ['Finish setting up 2 accounts', 2],
    ]);
    expect(updates.map((item: AppNotification) => item.id)).toEqual([5]);
  });

  it('never stacks different payments that share an old generic link, or different jobs', () => {
    const { needs } = buildNotificationSections([
      notification({ id: 21, type: 'subscription.overdue', action_url: '/subscriptions', title: 'Netflix is overdue' }),
      notification({ id: 22, type: 'subscription.due', action_url: '/subscriptions', title: 'Spotify is due' }),
      notification({ id: 23, type: 'card_statement.statement_expected', action_url: '/accounts/9', title: 'Statement is out' }),
      notification({ id: 24, type: 'card_statement.due_soon', action_url: '/accounts/9', title: 'Bill due soon' }),
      notification({ id: 25, type: 'subscription.cancel', action_url: '/recurring/3', title: 'Cancel Zee' }),
      notification({ id: 26, type: 'subscription.due', action_url: '/recurring/3', title: 'Zee is due' }),
    ]);
    expect(needs).toHaveLength(6);
  });

  it('shows the amount on the right and answers settle-ups in place', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [
        notification({ id: 11, type: 'split.settlement.recorded', action_url: '/split/settlements/71', title: 'Riya says they paid you', amount: '3269.80' }),
        notification({ id: 12, type: 'card_statement.overdue', action_url: '/accounts/9', title: 'SBI bill', amount: '399.00' }),
        notification({ id: 13, type: 'monthly_review', action_url: '/monthly-review/2026-09', title: 'September in review' }),
      ],
      unread_count: 3,
    });
    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByTestId('notifications-needs-you')).toBeTruthy());
    expect(screen.getByText('2 to sort')).toBeTruthy();
    expect(screen.getByTestId('notification-amount-12')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settlement-confirm-71'));
    });
    expect(mockDecide).toHaveBeenCalledWith('token', 71, 'confirm');

    await act(async () => {
      fireEvent.press(screen.getByTestId('notifications-clear-updates'));
    });
    expect(mockDelete).toHaveBeenCalledWith('token', 13);
  });
});

describe('an autopay notification (2026-11-11)', () => {
  beforeEach(() => {
    mockFetchNotifications.mockReset();
    mockConfirmOccurrence.mockClear();
  });

  it('leaves Needs you once confirmed, instead of keeping Confirm and Fix it', async () => {
    const autopay = notification({
      id: 41,
      type: 'subscription.autopay',
      title: 'Autopay transaction added',
      body: 'Added Google play for ₹299 from SBI Account. Confirm it or open it to make changes.',
      action_url: '/subscription-occurrences/7',
    });
    // The reload after Confirm never answers: the row must go without it.
    mockFetchNotifications
      .mockResolvedValueOnce({ notifications: [autopay], unread_count: 1 })
      .mockReturnValue(new Promise(() => undefined));

    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText('Autopay transaction added')).toBeTruthy());
    expect(screen.getByText('Fix it')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Confirm'));
    });

    expect(mockConfirmOccurrence).toHaveBeenCalledWith('token', 7);
    await waitFor(() => expect(screen.queryByText('Autopay transaction added')).toBeNull());
    expect(screen.queryByText('Fix it')).toBeNull();
  });

  it('keeps the row when Confirm fails', async () => {
    mockConfirmOccurrence.mockRejectedValueOnce(new Error('Unable to confirm this transaction.'));
    mockFetchNotifications.mockResolvedValue({
      notifications: [
        notification({
          id: 42,
          type: 'subscription.autopay',
          title: 'Autopay transaction added',
          action_url: '/subscription-occurrences/8',
        }),
      ],
      unread_count: 1,
    });

    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText('Confirm')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm'));
    });

    expect(screen.getByText('Autopay transaction added')).toBeTruthy();
    expect(screen.getByText('Fix it')).toBeTruthy();
  });
});

describe('a long "Needs you" (2026-11-13)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildNotificationSections, autopayCharge } = require('@/lib/notification-jobs');
  const autopay = (id: number, body: string, created = '2026-10-19T08:00:00Z') =>
    notification({
      id,
      type: 'subscription.autopay',
      title: 'Autopay transaction added',
      body,
      action_url: `/subscription-occurrences/${id + 100}`,
      created_at: created,
    });

  beforeEach(() => {
    mockFetchNotifications.mockReset();
    mockConfirmOccurrence.mockReset().mockResolvedValue(undefined);
  });

  it('stacks every autopay charge into one job', () => {
    const { needs } = buildNotificationSections([
      autopay(1, 'Added Zee Entertainment for ₹399 from SBI simply save. Confirm it or open it to make changes.'),
      autopay(2, 'Added Google play for ₹299 from SBI Account. Confirm it or open it to make changes.'),
      autopay(3, 'Added Netflix for ₹649 from HDFC. Confirm it or open it to make changes.'),
    ]);
    expect(needs).toHaveLength(1);
    expect(needs[0].stackTitle).toBe('Three autopay charges to confirm');
  });

  it('reads the payee and amount of an autopay charge', () => {
    expect(autopayCharge(autopay(1, 'Added Zee Entertainment for ₹399 from SBI simply save. Confirm it.'))).toEqual({
      name: 'Zee Entertainment',
      amount: 399,
    });
    expect(autopayCharge(autopay(2, 'Added Rent for ₹1,250.50 from SBI. Confirm it.'))).toEqual({
      name: 'Rent',
      amount: 1250.5,
    });
    expect(autopayCharge({ ...autopay(3, 'Something else'), amount: '99.00' })).toEqual({
      name: 'Something else',
      amount: 99,
    });
  });

  it('orders by urgency: overdue, due today, soonest due, then newest', () => {
    const { needs } = buildNotificationSections([
      notification({ id: 1, action_url: '/accounts/4', created_at: '2026-11-12T08:00:00Z' }),
      notification({ id: 2, type: 'refund.due', action_url: '/entries/5', due_date: '2026-11-20', created_at: '2026-11-01T08:00:00Z' }),
      notification({ id: 3, type: 'card_statement.due_soon', action_url: '/accounts/9', due_date: '2026-11-15', created_at: '2026-11-02T08:00:00Z' }),
      notification({ id: 4, type: 'card_statement.due_today', action_url: '/accounts/7', created_at: '2026-11-03T08:00:00Z' }),
      notification({ id: 5, type: 'subscription.overdue', action_url: '/recurring/3', created_at: '2026-10-01T08:00:00Z' }),
    ]);
    expect(needs.map((job: { items: AppNotification[] }) => job.items[0].id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('shows three jobs, then See all, with Updates still in reach', async () => {
    mockFetchNotifications.mockResolvedValue({
      notifications: [
        notification({ id: 1, action_url: '/accounts/1', title: 'Job one' }),
        notification({ id: 2, action_url: '/accounts/2', title: 'Job two', type: 'card_statement.statement_expected' }),
        notification({ id: 3, action_url: '/accounts/3', title: 'Job three', type: 'card_statement.itemize_pending' }),
        notification({ id: 4, action_url: '/recurring/4', title: 'Job four', type: 'subscription.cancel' }),
        notification({ id: 5, action_url: '/recurring/5', title: 'Job five', type: 'subscription.due' }),
        notification({ id: 9, type: 'monthly_review', action_url: '/monthly-review/2026-10', title: 'October in review' }),
      ],
      unread_count: 6,
    });
    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText('5 to sort')).toBeTruthy());
    expect(screen.queryAllByText(/^Job /)).toHaveLength(3);
    expect(screen.getByText('See all 5')).toBeTruthy();
    expect(screen.getByText('October in review')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('notifications-needs-toggle'));
    });
    expect(screen.queryAllByText(/^Job /)).toHaveLength(5);
    expect(screen.getByText('Show fewer')).toBeTruthy();
  });

  it('confirms a whole autopay stack at once', async () => {
    const stack = [
      autopay(1, 'Added Zee Entertainment for ₹399 from SBI simply save. Confirm it or open it to make changes.'),
      autopay(2, 'Added Google play for ₹299 from SBI Account. Confirm it or open it to make changes.'),
    ];
    mockFetchNotifications
      .mockResolvedValueOnce({ notifications: stack, unread_count: 2 })
      .mockReturnValue(new Promise(() => undefined));
    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText('Two autopay charges to confirm')).toBeTruthy());
    expect(screen.getByText('Zee Entertainment')).toBeTruthy();
    expect(screen.getByText('Google play')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('autopay-confirm-all'));
    });
    expect(mockConfirmOccurrence.mock.calls).toEqual([
      ['token', 101],
      ['token', 102],
    ]);
    await waitFor(() => expect(screen.queryByText('Two autopay charges to confirm')).toBeNull());
  });

  it('keeps what failed when Confirm all half works', async () => {
    mockConfirmOccurrence.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('nope'));
    const stack = [
      autopay(1, 'Added Zee Entertainment for ₹399 from SBI simply save. Confirm it.', '2026-10-20T08:00:00Z'),
      autopay(2, 'Added Google play for ₹299 from SBI Account. Confirm it.'),
    ];
    mockFetchNotifications
      .mockResolvedValueOnce({ notifications: stack, unread_count: 2 })
      .mockReturnValue(new Promise(() => undefined));
    const screen = await render(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByTestId('autopay-confirm-all')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('autopay-confirm-all'));
    });
    expect(screen.getByText('Confirmed 1 of 2. Try the rest again.')).toBeTruthy();
    // One charge left is no longer a stack: it is the plain card again.
    expect(screen.queryByText(/Zee Entertainment/)).toBeNull();
    expect(screen.getByText(/Added Google play for ₹299/)).toBeTruthy();
    expect(screen.getByText('Fix it')).toBeTruthy();
  });
});
