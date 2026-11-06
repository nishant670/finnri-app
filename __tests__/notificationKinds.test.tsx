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
    expect(needs.map((job: { stackTitle: string | null; items: unknown[] }) => [job.stackTitle, job.items.length])).toEqual([
      ['Finish setting up 2 accounts', 2],
      [null, 2],
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

