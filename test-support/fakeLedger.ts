/**
 * A stand-in for `/v1/entries` that behaves like the API's `saveEntry`: a
 * repeated Idempotency-Key returns the first entry with 200, whatever the new
 * payload says. Tests script what happens to the next POSTs, and whether the
 * server is new enough to cancel a key.
 */
export type NextPost =
  /** Saved and answered. */
  | 'ok'
  /** Never reached the server. */
  | 'offline'
  /** Saved, but the answer never came back. */
  | 'lost-response'
  /** Refused as invalid; nothing saved. */
  | 'invalid';

type FakeEntry = {
  id: number;
  key: string;
  amount: string;
  type: string;
  [field: string]: unknown;
};

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

export const createFakeLedger = () => {
  let entries: FakeEntry[] = [];
  let script: NextPost[] = [];
  const posts: { key: string; payload: Record<string, unknown> }[] = [];
  /** False is a server from before `POST /v1/entry-keys/:key/cancel`: 404. */
  let canCancel = true;
  const cancelled = new Set<string>();
  /** The next POST waits here until released, then behaves as `outcome`. */
  let held: Promise<NextPost> | null = null;

  const fetch = async (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => {
    const asked = /\/v1\/entry-keys\/(.+)\/cancel$/.exec(String(url))?.[1];
    if (asked !== undefined) {
      if (!canCancel) return respond(404, {});
      const wanted = decodeURIComponent(asked);
      const found = entries.find((candidate) => candidate.key === wanted);
      if (found) return respond(200, { saved: true, cancelled: false, entry: found });
      cancelled.add(wanted);
      return respond(200, { saved: false, cancelled: true });
    }
    if (init?.method !== 'POST' || !String(url).endsWith('/v1/entries')) {
      return respond(200, { items: [], entries: [], total: 0 });
    }
    const waiting = held;
    held = null;
    const outcome = waiting ? await waiting : (script.shift() ?? 'ok');
    const key = init.headers?.['Idempotency-Key'] ?? '';
    const payload = JSON.parse(init.body ?? '{}');
    posts.push({ key, payload });
    if (outcome === 'offline') throw new TypeError('Network request failed');
    if (outcome === 'invalid')
      return respond(422, { error: 'invalid_entry', fields: { category: 'is required' } });
    if (cancelled.has(key)) return respond(409, { error: 'entry_key_cancelled' });
    let entry = entries.find((candidate) => candidate.key === key);
    const replayed = !!entry;
    if (!entry) {
      entry = { ...payload, id: entries.length + 1, key } as FakeEntry;
      entries.push(entry);
    }
    if (outcome === 'lost-response') throw new TypeError('Network request failed');
    return respond(replayed ? 200 : 201, entry);
  };

  const of = (type?: 'expense' | 'income') =>
    entries.filter((entry) => !type || entry.type === type);

  return {
    fetch,
    posts,
    entries: () => entries,
    amounts: (type?: 'expense' | 'income') => of(type).map((entry) => Number(entry.amount)),
    total: (type?: 'expense' | 'income') =>
      of(type).reduce((sum, entry) => sum + Number(entry.amount), 0),
    setCanCancel: (available: boolean) => {
      canCancel = available;
    },
    /** Holds the next POST in flight; call the result to say how it ends. */
    holdNext: () => {
      let release: (outcome: NextPost) => void = () => undefined;
      held = new Promise<NextPost>((resolve) => {
        release = resolve;
      });
      return (outcome: NextPost) => release(outcome);
    },
    next: (...outcomes: NextPost[]) => {
      script = outcomes;
    },
    reset: () => {
      entries = [];
      canCancel = true;
      cancelled.clear();
      held = null;
      script = [];
      posts.length = 0;
    },
  };
};
