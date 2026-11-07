import { fireEvent, render } from '@testing-library/react-native';

import SplitScreen from '@/components/split/SplitScreen';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useScrollToTop: jest.fn(),
    router: { push: jest.fn(), back: jest.fn() },
  };
});

jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: Object.assign(
    () => ({ token: 'session', user: { uuid: 'u', username: 'Me', is_guest: false } }),
    { getState: () => ({ token: 'session' }) }
  ),
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const biwi = { id: 7, name: 'Biwi', created_at: '2026-07-01T00:00:00Z' };

const serve = (net: number) => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/split/friends') return json([biwi]);
    if (url.pathname === '/v1/split/balances') {
      return json([
        {
          friend: biwi,
          total_owed_by_friend: Math.max(net, 0),
          total_owed_to_friend: Math.max(-net, 0),
          net_balance: net,
        },
      ]);
    }
    if (url.pathname === '/v1/split/activity') return json({ items: [], total: 0 });
    if (url.pathname === '/v1/split/settlements/pending') return json({ settlements: [] });
    if (url.pathname === '/v1/notifications') return json({ notifications: [], total: 0 });
    return json([]);
  }) as unknown as typeof fetch;
};

const renderSplits = () =>
  render(
    <AppDialogProvider>
      <SplitScreen />
    </AppDialogProvider>
  );

describe('Settle up from a person (P24)', () => {
  it('starts on what they owe you, as Friend paid', async () => {
    serve(600);
    const screen = await renderSplits();
    await fireEvent.press(await screen.findByLabelText('Settle up with Biwi'));

    expect(await screen.findByDisplayValue(/^600(\.00)?$/)).toBeTruthy();
    expect(screen.getByText('Friend paid')).toBeTruthy();
  });

  it('starts on what you owe them, as You paid', async () => {
    serve(-250);
    const screen = await renderSplits();
    await fireEvent.press(await screen.findByLabelText('Settle up with Biwi'));

    expect(await screen.findByDisplayValue(/^250(\.00)?$/)).toBeTruthy();
  });
});
