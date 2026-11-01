import {
  addEntriesToEvent,
  defaultDayForEvent,
  describeEventGrouping,
  describeEventDates,
  eventCoversDay,
  fetchEvent,
  fetchEvents,
  orderEventsForDay,
  useEvents,
  type FinnriEvent,
} from '@/lib/events';
import { notifyTransactionsChanged } from '@/lib/transaction-events';

const event = (overrides: Partial<FinnriEvent>): FinnriEvent => ({
  id: 1,
  name: 'Event',
  emoji: '🎉',
  start_date: null,
  end_date: null,
  budget: null,
  notes: '',
  ...overrides,
});

const party = event({
  id: 1,
  name: 'Diwali party',
  start_date: '2026-10-31',
  end_date: '2026-11-01',
});
const trip = event({ id: 2, name: 'Goa trip', start_date: '2026-12-20', end_date: '2026-12-26' });
const move = event({ id: 3, name: 'House move' });

describe('event dates', () => {
  it('says the range the way people read it', () => {
    expect(describeEventDates(party)).toBe('31 Oct – 1 Nov 2026');
    expect(describeEventDates(event({ start_date: '2026-11-01', end_date: '2026-11-01' }))).toBe(
      '1 Nov 2026'
    );
    expect(describeEventDates(event({ start_date: '2026-11-01' }))).toBe('From 1 Nov 2026');
    expect(describeEventDates(move)).toBe('');
  });

  it('covers a day only inside the dates it has', () => {
    expect(eventCoversDay(party, '2026-10-31')).toBe(true);
    expect(eventCoversDay(party, '2026-11-02')).toBe(false);
    // An undated event suggests itself for no day in particular.
    expect(eventCoversDay(move, '2026-11-01')).toBe(false);
  });

  it('offers the events covering the transaction’s day first, the rest in list order', () => {
    expect(orderEventsForDay([move, trip, party], '2026-11-01').map((e) => e.id)).toEqual([
      1, 3, 2,
    ]);
    expect(orderEventsForDay([move, trip, party], null).map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('dates a new transaction today while the event is on, else on its first day', () => {
    expect(defaultDayForEvent(party, '2026-11-01')).toBe('2026-11-01');
    expect(defaultDayForEvent(trip, '2026-11-01')).toBe('2026-12-20');
    expect(defaultDayForEvent(move, '2026-11-01')).toBe('2026-11-01');
  });
});

describe('grouping note', () => {
  it('agrees with one transaction or many, and says when one left another event', () => {
    expect(describeEventGrouping('add', party, 1).message).toBe(
      '1 transaction now counts towards 🎉 Diwali party.'
    );
    expect(describeEventGrouping('add', party, 1, 1).message).toBe(
      '1 transaction now counts towards 🎉 Diwali party. It left the event it was in.'
    );
    expect(describeEventGrouping('add', party, 3, 2).message).toBe(
      '3 transactions now count towards 🎉 Diwali party. 2 left another event.'
    );
    expect(describeEventGrouping('remove', party, 1)).toEqual({
      title: 'Removed from Diwali party',
      message:
        '1 transaction no longer counts towards 🎉 Diwali party. It is still in your transactions.',
    });
    expect(describeEventGrouping('remove', party, 2).message).toBe(
      '2 transactions no longer count towards 🎉 Diwali party. They are still in your transactions.'
    );
  });
});

describe('events API', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reads an event with its summary, numbers as numbers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        event: {
          id: 1,
          name: 'Diwali party',
          emoji: '🪔',
          start_date: '2026-10-31T00:00:00Z',
          budget: '15000',
        },
        summary: {
          entry_count: 5,
          total_paid: '5400',
          owed_back: '2800',
          net_cost: '2600',
          budget_left: 12400,
        },
      }),
    }) as unknown as typeof fetch;

    const { event: loaded, summary } = await fetchEvent('token', 1);
    expect(loaded).toEqual(
      expect.objectContaining({ id: 1, start_date: '2026-10-31', budget: 15000 })
    );
    expect(summary).toEqual(
      expect.objectContaining({
        total_paid: 5400,
        owed_back: 2800,
        net_cost: 2600,
        budget_left: 12400,
      })
    );
  });

  it('lists each event at its real cost, working it out from an older API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          name: 'Party',
          entry_count: 4,
          total_paid: '9300',
          owed_back: '1500',
          net_cost: '7800',
        },
        { id: 2, name: 'Trip', entry_count: 1, total_paid: 600 },
      ],
    }) as unknown as typeof fetch;

    const [party, trip] = await fetchEvents('token');
    expect(party).toEqual(
      expect.objectContaining({ total_paid: 9300, owed_back: 1500, net_cost: 7800 })
    );
    expect(trip).toEqual(expect.objectContaining({ total_paid: 600, owed_back: 0, net_cost: 600 }));
  });

  it('sends the selection as entry_ids', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ added: 2, moved: 1 }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(addEntriesToEvent('token', 7, [11, 12])).resolves.toEqual({ added: 2, moved: 1 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/events\/7\/entries$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ entry_ids: [11, 12] });
  });
});

it('marks the events list stale when any transaction changes', () => {
  useEvents.setState({ events: [], loadedFor: 'token', loadedAt: Date.now() });
  notifyTransactionsChanged();
  expect(useEvents.getState().loadedAt).toBe(0);
});
