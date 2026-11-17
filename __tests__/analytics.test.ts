import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from '@/hooks/use-auth-store';
import {
  analyticsLabel,
  flushAnalytics,
  queuedAnalyticsEvents,
  resetAnalyticsForTest,
  startAnalytics,
  track,
} from '@/lib/analytics';

const fetchMock = () => global.fetch as jest.Mock;
const sentBodies = () =>
  fetchMock()
    .mock.calls.filter(([url]) => String(url).includes('/v1/analytics/events'))
    .map(([, init]) => JSON.parse(init.body as string));

describe('product analytics', () => {
  let stop: (() => void) | undefined;

  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    resetAnalyticsForTest();
    useAuthStore.setState({ user: null, token: null });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    jest.useRealTimers();
  });

  it('accepts one lowercase word as a label and nothing else', () => {
    expect(analyticsLabel('voice')).toBe('voice');
    expect(analyticsLabel(' Weekly_Pass ')).toBe('weekly_pass');
    expect(analyticsLabel('Dinner at Bukhara')).toBeUndefined();
    expect(analyticsLabel('4,500.00')).toBeUndefined();
    expect(analyticsLabel('a'.repeat(33))).toBeUndefined();
    expect(analyticsLabel(null)).toBeUndefined();
  });

  it('only queues until it is started, so code under test sends nothing', async () => {
    useAuthStore.setState({ token: 'session' });
    track('entry_saved', 'voice');
    await flushAnalytics();
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('finnri_analytics_queue')).toBeNull();
    expect(queuedAnalyticsEvents()).toEqual([
      expect.objectContaining({ name: 'entry_saved', label: 'voice' }),
    ]);
  });

  it('drops a label that is not a word but keeps the event', () => {
    track('entry_saved', 'Paid 250 for chai');
    expect(queuedAnalyticsEvents()[0]).toEqual(
      expect.not.objectContaining({ label: expect.anything() }),
    );
  });

  it('holds events made before sign-in and sends them with the first batch after it', async () => {
    stop = startAnalytics();
    await jest.advanceTimersByTimeAsync(0);
    track('onboarding_completed');
    await flushAnalytics();
    expect(sentBodies()).toHaveLength(0);

    useAuthStore.setState({ token: 'session' });
    track('auth_completed', 'google');
    await flushAnalytics();

    const [body] = sentBodies();
    expect(body.events.map((event: { name: string }) => event.name)).toEqual([
      'app_opened',
      'onboarding_completed',
      'auth_completed',
    ]);
    expect(queuedAnalyticsEvents()).toHaveLength(0);
  });

  it('keeps the queue when the server cannot be reached, and when the session is refused', async () => {
    stop = startAnalytics();
    await jest.advanceTimersByTimeAsync(0);
    useAuthStore.setState({ token: 'session' });

    fetchMock().mockRejectedValueOnce(new Error('offline'));
    await flushAnalytics();
    expect(queuedAnalyticsEvents()).toHaveLength(1);

    fetchMock().mockResolvedValueOnce({ ok: false, status: 401 });
    await flushAnalytics();
    expect(queuedAnalyticsEvents()).toHaveLength(1);

    // A batch the server says is malformed will never be accepted: let it go.
    fetchMock().mockResolvedValueOnce({ ok: false, status: 422 });
    await flushAnalytics();
    expect(queuedAnalyticsEvents()).toHaveLength(0);
  });

  it('restores what an earlier run left unsent', async () => {
    await AsyncStorage.setItem(
      'finnri_analytics_queue',
      JSON.stringify([{ name: 'entry_saved', label: 'manual', at: new Date().toISOString() }]),
    );
    useAuthStore.setState({ token: 'session' });
    stop = startAnalytics();
    await jest.advanceTimersByTimeAsync(0);
    await flushAnalytics();
    const names = sentBodies().flatMap((body) => body.events.map((event: { name: string }) => event.name));
    expect(names).toEqual(expect.arrayContaining(['entry_saved', 'app_opened']));
  });

  it('never queues more than it could send in a reasonable time', () => {
    for (let index = 0; index < 250; index += 1) track('app_opened');
    expect(queuedAnalyticsEvents()).toHaveLength(200);
  });
});
