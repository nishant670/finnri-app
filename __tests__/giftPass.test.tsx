import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import React from 'react';

import { GiftPassModal } from '@/components/billing/GiftPassModal';
import { useGiftPassAnnouncement } from '@/hooks/use-gift-pass-announcement';
import { GIFT_PASS_NOTIFICATION_TYPE, latestUnreadGift } from '@/lib/gift-pass';
import type { AppNotification } from '@/lib/notifications';

const mockFetchNotifications = jest.fn();
const mockMarkAllRead = jest.fn();
jest.mock('@/lib/notifications', () => ({
  ...jest.requireActual('@/lib/notifications'),
  fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllRead(...args),
}));

const notification = (overrides: Partial<AppNotification>): AppNotification => ({
  id: 1,
  user_id: 1,
  type: GIFT_PASS_NOTIFICATION_TYPE,
  title: "You've been gifted a free pass",
  body: 'A free monthly pass is yours until 26 Nov: every paid feature, plus 3,600 AI credits.',
  action_url: '/billing',
  read_at: null,
  created_at: '2026-10-27T08:00:00Z',
  updated_at: '2026-10-27T08:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mockFetchNotifications.mockReset();
  mockMarkAllRead.mockReset().mockResolvedValue(undefined);
});

describe('latestUnreadGift', () => {
  it('picks the newest unread gift and ignores everything else', () => {
    const gift = notification({ id: 9 });
    expect(
      latestUnreadGift([
        notification({ id: 10, type: 'budget.warning' }),
        gift,
        notification({ id: 8 }),
      ])
    ).toBe(gift);
    expect(latestUnreadGift([notification({ read_at: '2026-10-27T09:00:00Z' })])).toBeNull();
  });
});

describe('useGiftPassAnnouncement', () => {
  const setup = async (canInterrupt = () => true, enabled = true) => {
    const onAnnounce = jest.fn();
    const hook = await renderHook(() =>
      useGiftPassAnnouncement({ token: 'token', enabled, canInterrupt, onAnnounce })
    );
    return { hook, onAnnounce };
  };

  it('announces an unread gift once, refreshes credits, and marks gifts read on close', async () => {
    mockFetchNotifications.mockResolvedValue({ notifications: [notification({ id: 4 })] });
    const { hook, onAnnounce } = await setup();

    await act(async () => hook.result.current.check());
    expect(hook.result.current.gift?.id).toBe(4);
    expect(onAnnounce).toHaveBeenCalledTimes(1);

    await act(async () => hook.result.current.close());
    expect(hook.result.current.gift).toBeNull();
    expect(mockMarkAllRead).toHaveBeenCalledWith('token', GIFT_PASS_NOTIFICATION_TYPE);

    // The same gift, still unread because marking failed or is in flight, is not shown twice.
    await act(async () => hook.result.current.check());
    expect(hook.result.current.gift).toBeNull();
  });

  it('waits while something else has the screen', async () => {
    mockFetchNotifications.mockResolvedValue({ notifications: [notification({})] });
    const { hook, onAnnounce } = await setup(() => false);
    await act(async () => hook.result.current.check());
    expect(hook.result.current.gift).toBeNull();
    expect(onAnnounce).not.toHaveBeenCalled();
  });

  it('never asks a guest', async () => {
    const { hook } = await setup(() => true, false);
    await act(async () => hook.result.current.check());
    expect(mockFetchNotifications).not.toHaveBeenCalled();
  });

  it('stays quiet when loading notifications fails', async () => {
    mockFetchNotifications.mockRejectedValue(new Error('offline'));
    const { hook } = await setup();
    await act(async () => hook.result.current.check());
    expect(hook.result.current.gift).toBeNull();
  });
});

describe('GiftPassModal', () => {
  it("shows the gift's own words and its two ways out", async () => {
    const onSeePass = jest.fn();
    const onClose = jest.fn();
    const gift = notification({});
    const screen = await render(
      <GiftPassModal visible title={gift.title} body={gift.body} onSeePass={onSeePass} onClose={onClose} />
    );

    expect(screen.getByText('A gift for you')).toBeTruthy();
    expect(screen.getByText(gift.title)).toBeTruthy();
    expect(screen.getByText(gift.body)).toBeTruthy();

    await fireEvent.press(screen.getByText('See your pass'));
    expect(onSeePass).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Later'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
