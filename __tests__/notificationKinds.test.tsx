import { render, waitFor } from '@testing-library/react-native';
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
