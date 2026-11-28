import { cancelEntryKey } from '@/lib/entries';

const answer = (status: number, body: unknown) => {
  const fetch = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status < 300,
    status,
    json: async () => body,
  }));
  global.fetch = fetch as unknown as typeof global.fetch;
  return fetch;
};

describe('cancelEntryKey', () => {
  it('posts the cancel and reads both final answers', async () => {
    const fetch = answer(200, { saved: true, cancelled: false, entry: { id: 3 } });
    expect(await cancelEntryKey('t', 'k~2')).toEqual({ state: 'saved', entry: { id: 3 } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/v1\/entry-keys\/k~2\/cancel$/);
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    answer(200, { saved: false, cancelled: true });
    expect(await cancelEntryKey('t', 'k')).toEqual({ state: 'cancelled' });
  });

  // "Cancelled" lets the tray forget a save, so nothing else may read as it.
  it('treats everything else as unknown', async () => {
    for (const [status, body] of [
      [404, {}],
      [401, {}],
      [500, { saved: false, cancelled: true }],
      [200, {}],
      [200, { saved: false }],
      [200, { saved: true }],
    ] as const) {
      answer(status, body);
      expect(await cancelEntryKey('t', 'k')).toEqual({ state: 'unknown' });
    }
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await cancelEntryKey('t', 'k')).toEqual({ state: 'unknown' });
  });
});
