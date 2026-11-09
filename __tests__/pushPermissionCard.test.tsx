import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import { PushPermissionCard } from '@/components/notifications/PushPermissionCard';

const mockRead = jest.fn();
const mockAsk = jest.fn();
const mockRegister = jest.fn();

jest.mock('@/lib/push-notifications', () => ({
  readPushPermission: () => mockRead(),
  askPushPermission: () => mockAsk(),
  registerForPushNotifications: (token: string) => mockRegister(token),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { isDevice: true, appOwnership: null } }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return { useFocusEffect: (run: () => void) => useEffect(run, [run]) };
});
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'session' }) }));

describe('PushPermissionCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays hidden while notifications are on, and registers nothing', async () => {
    mockRead.mockResolvedValue('granted');
    const screen = await render(<PushPermissionCard />);
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    expect(screen.queryByTestId('push-permission-card')).toBeNull();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('asks, then registers the phone once allowed', async () => {
    mockRead.mockResolvedValueOnce('can_ask').mockResolvedValue('granted');
    const screen = await render(<PushPermissionCard />);
    fireEvent.press(await screen.findByText('Turn on'));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('session'));
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('push-permission-card')).toBeNull();
  });

  it('sends a blocked phone to Settings', async () => {
    mockRead.mockResolvedValue('blocked');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const screen = await render(<PushPermissionCard />);
    fireEvent.press(await screen.findByText('Open settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
