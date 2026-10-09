import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import PurchaseHistoryScreen from '@/app/purchase-history';
import { fetchBillingPayments, type BillingPayment } from '@/lib/billing';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: mockPush }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'session-token' }),
}));

jest.mock('@/lib/billing', () => ({
  ...jest.requireActual('@/lib/billing'),
  fetchBillingPayments: jest.fn(),
}));

const mockedFetch = fetchBillingPayments as jest.MockedFunction<typeof fetchBillingPayments>;

const expiredWeekly: BillingPayment = {
  id: 7,
  status: 'captured',
  plan_code: 'weekly_pass',
  plan_name: 'Weekly Pass',
  billing_interval: 'weekly',
  amount_minor: 7900,
  amount_refunded_minor: 0,
  currency: 'INR',
  method: 'upi',
  reference: 'pay_Abc123',
  created_at: '2026-09-16T12:59:00Z',
  captured_at: '2026-09-16T13:00:00Z',
  period_start: '2026-09-16T13:00:00Z',
  period_end: '2026-09-23T13:00:00Z',
};

beforeEach(() => {
  mockedFetch.mockReset();
  mockPush.mockReset();
});

describe('PurchaseHistoryScreen', () => {
  it('lists the pass that was bought, even after it expired', async () => {
    mockedFetch.mockResolvedValue([expiredWeekly]);
    const screen = await render(<PurchaseHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Weekly Pass')).toBeTruthy());
    expect(mockedFetch).toHaveBeenCalledWith('session-token');
    expect(screen.getByText('₹79')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/^Valid 16 Sept? 2026 – 23 Sept? 2026$/)).toBeTruthy();
    expect(screen.getByText('Ref pay_Abc123')).toBeTruthy();
  });

  it('points someone who paid and sees nothing at support', async () => {
    mockedFetch.mockResolvedValue([]);
    const screen = await render(<PurchaseHistoryScreen />);

    await waitFor(() => expect(screen.getByText('No purchases yet')).toBeTruthy());
    expect(screen.getByText(/Paid but don’t see it\?/)).toBeTruthy();
    expect(screen.getByText('Contact support')).toBeTruthy();
  });

  it('offers a retry when the history does not load', async () => {
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    const screen = await render(<PurchaseHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
  });
});
