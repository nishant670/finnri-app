import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import SplitScreen from '@/components/split/SplitScreen';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';
import type { SplitActivityItem } from '@/lib/splits';

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

const bill = (index: number): SplitActivityItem => ({
  id: `bill-${index}`,
  type: 'bill',
  record_id: index,
  title: `Groceries ${index}`,
  date: '2026-09-01',
  amount: 100,
  participant_count: 1,
  created_at: '2026-09-01T10:00:00Z',
});

const FEED = Array.from({ length: 120 }, (_, index) => bill(index + 1));

/** Every activity request the screen made, as `page/page_size`. */
let activityRequests: string[] = [];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  activityRequests = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/split/activity') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const size = Number(url.searchParams.get('page_size') ?? 20);
      activityRequests.push(`${page}/${size}`);
      return json({ items: FEED.slice((page - 1) * size, page * size), total: FEED.length });
    }
    if (url.pathname === '/v1/split/friends') {
      return json([{ id: 7, name: 'Biwi', created_at: '2026-07-01T00:00:00Z' }]);
    }
    if (url.pathname === '/v1/split/settlements/pending') return json({ settlements: [] });
    if (url.pathname === '/v1/notifications') return json({ notifications: [], total: 0 });
    return json([]);
  }) as unknown as typeof fetch;
});

describe('the Splits Activity tab', () => {
  it('reads the whole feed a page at a time as it is scrolled', async () => {
    const screen = await render(
      <AppDialogProvider>
        <SplitScreen />
      </AppDialogProvider>
    );

    await fireEvent.press(await screen.findByText('Activity'));
    expect(await screen.findByText('Groceries 1')).toBeTruthy();
    // Not the server's default of 20, and not everything at once.
    expect(activityRequests[0]).toBe('1/50');

    const scrollToEnd = async () => {
      await act(async () => {
        fireEvent(screen.getByTestId('split-screen-list'), 'endReached');
      });
    };
    await scrollToEnd();
    await waitFor(() => expect(activityRequests).toContain('2/50'));
    await scrollToEnd();
    await waitFor(() => expect(activityRequests).toContain('3/50'));

    // Only the rows near the screen are drawn, not all 120.
    expect(screen.queryByText('Groceries 120')).toBeNull();

    // At the end of the feed, scrolling asks for nothing more.
    const before = activityRequests.length;
    await scrollToEnd();
    expect(activityRequests).toHaveLength(before);
  });

  it('a search in Activity reads the rest of the feed to find older matches', async () => {
    const screen = await render(
      <AppDialogProvider>
        <SplitScreen />
      </AppDialogProvider>
    );

    await fireEvent.press(await screen.findByText('Activity'));
    await screen.findByText('Groceries 1');
    await fireEvent.press(screen.getByLabelText('Search splits'));
    await fireEvent.changeText(screen.getByPlaceholderText(/search/i), 'Groceries 117');

    await waitFor(() => expect(activityRequests).toEqual(expect.arrayContaining(['2/50', '3/50'])));
    expect(await screen.findByText('Groceries 117')).toBeTruthy();
  });
});
