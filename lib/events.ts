import { create } from 'zustand';

import { readApiError } from './api-error';
import { subscribeTransactionsChanged } from './transaction-events';
import { API_BASE_URL } from './transactions';

/**
 * Events group a user's own expenses by occasion — a party they hosted, a
 * trip, a wedding — so they can see later what it cost them.
 *
 * They are not split groups. A group is shared and answers who owes whom; an
 * event is private and answers what the occasion cost, split or not. A
 * transaction belongs to at most one event, and only expenses can.
 */
export type FinnriEvent = {
  id: number;
  name: string;
  emoji: string;
  /** `YYYY-MM-DD`. Display and suggestions only: entries outside still count. */
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

/** `owed_back` and `net_cost` mean what they do on {@link EventSummary}. */
export type EventListItem = FinnriEvent & {
  entry_count: number;
  total_paid: number;
  owed_back: number;
  net_cost: number;
};

/**
 * What an occasion cost. `owed_back` is what the split bills on its expenses
 * assign to friends where the user paid — what the bills say, not what has
 * been settled — and `net_cost` is the user's real cost.
 */
export type EventSummary = {
  entry_count: number;
  total_paid: number;
  owed_back: number;
  net_cost: number;
  budget_left?: number;
  first_date: string | null;
  last_date: string | null;
  split_entry_count: number;
};

export type EventWithSummary = { event: FinnriEvent; summary: EventSummary };

export type EventInput = {
  name: string;
  emoji?: string;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  notes?: string;
};

/** The emoji a new event starts with, and the ones the form offers. */
export const DEFAULT_EVENT_EMOJI = '🎉';
export const EVENT_EMOJI_CHOICES = ['🎉', '🪔', '✈️', '💍', '🎂', '🏠', '🍽️', '🏖️', '🎁', '🙏'];

/** Mirrors the server's limits, so the form says so before the request does. */
export const EVENT_NAME_MAX = 60;
export const EVENT_ENTRIES_PER_CALL = 200;

/** How long a loaded list is trusted; the store applies its own changes itself. */
const EVENTS_FRESH_MS = 60_000;

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: unknown): string | null =>
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;

const readEvent = (raw: Record<string, unknown>): FinnriEvent => ({
  id: toNumber(raw.id),
  name: typeof raw.name === 'string' ? raw.name : '',
  emoji: typeof raw.emoji === 'string' ? raw.emoji : '',
  start_date: toDate(raw.start_date),
  end_date: toDate(raw.end_date),
  budget: raw.budget == null ? null : toNumber(raw.budget),
  notes: typeof raw.notes === 'string' ? raw.notes : '',
  created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
});

const readListItem = (raw: Record<string, unknown>): EventListItem => {
  const totalPaid = toNumber(raw.total_paid);
  const owedBack = toNumber(raw.owed_back);
  return {
    ...readEvent(raw),
    entry_count: toNumber(raw.entry_count),
    total_paid: totalPaid,
    owed_back: owedBack,
    // An API from before net_cost was listed sends paid only.
    net_cost: raw.net_cost == null ? totalPaid - owedBack : toNumber(raw.net_cost),
  };
};

const readSummary = (raw: Record<string, unknown> | null | undefined): EventSummary => ({
  entry_count: toNumber(raw?.entry_count),
  total_paid: toNumber(raw?.total_paid),
  owed_back: toNumber(raw?.owed_back),
  net_cost: toNumber(raw?.net_cost),
  ...(raw?.budget_left != null ? { budget_left: toNumber(raw.budget_left) } : {}),
  first_date: toDate(raw?.first_date),
  last_date: toDate(raw?.last_date),
  split_entry_count: toNumber(raw?.split_entry_count),
});

const readWithSummary = (payload: unknown): EventWithSummary => {
  const body = (payload ?? {}) as Record<string, unknown>;
  return {
    event: readEvent((body.event ?? {}) as Record<string, unknown>),
    summary: readSummary(body.summary as Record<string, unknown> | undefined),
  };
};

export const fetchEvents = async (token: string): Promise<EventListItem[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/events`, { headers: authHeaders(token) });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load your events.');
  }
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload)
    ? payload.map((row) => readListItem((row ?? {}) as Record<string, unknown>))
    : [];
};

export const fetchEvent = async (token: string, id: number): Promise<EventWithSummary> => {
  const response = await fetch(`${API_BASE_URL}/v1/events/${id}`, { headers: authHeaders(token) });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load this event.');
  }
  return readWithSummary(await response.json());
};

export const createEvent = async (token: string, input: EventInput): Promise<EventWithSummary> => {
  const response = await fetch(`${API_BASE_URL}/v1/events`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to create this event.');
  }
  return readWithSummary(await response.json());
};

export const updateEvent = async (
  token: string,
  id: number,
  input: EventInput
): Promise<EventWithSummary> => {
  const response = await fetch(`${API_BASE_URL}/v1/events/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to save this event.');
  }
  return readWithSummary(await response.json());
};

export const deleteEvent = async (token: string, id: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/events/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to delete this event.');
  }
};

const changeEventEntries = async (
  token: string,
  id: number,
  entryIds: number[],
  method: 'POST' | 'DELETE'
) => {
  const response = await fetch(`${API_BASE_URL}/v1/events/${id}/entries`, {
    method,
    headers: authHeaders(token),
    body: JSON.stringify({ entry_ids: entryIds }),
  });
  if (!response.ok) {
    throw await readApiError(
      response,
      method === 'POST'
        ? 'Only your own expenses can go in an event.'
        : 'Unable to take these out of the event.'
    );
  }
  return (await response.json()) as Record<string, number>;
};

/** Puts expenses in an event; one already in another event moves. */
export const addEntriesToEvent = async (token: string, id: number, entryIds: number[]) => {
  const result = await changeEventEntries(token, id, entryIds, 'POST');
  return { added: toNumber(result.added), moved: toNumber(result.moved) };
};

export const removeEntriesFromEvent = async (token: string, id: number, entryIds: number[]) => {
  const result = await changeEventEntries(token, id, entryIds, 'DELETE');
  return { removed: toNumber(result.removed) };
};

/**
 * The note shown after transactions go into or out of an event. `moved` is
 * how many of them the API took out of another event on the way in.
 */
export const describeEventGrouping = (
  action: 'add' | 'remove',
  event: Pick<FinnriEvent, 'name' | 'emoji'>,
  count: number,
  moved = 0
) => {
  const one = count === 1;
  const rows = one ? '1 transaction' : `${count} transactions`;
  if (action === 'remove') {
    return {
      title: `Removed from ${event.name}`,
      message: one
        ? `${rows} no longer counts towards ${eventLabel(event)}. It is still in your transactions.`
        : `${rows} no longer count towards ${eventLabel(event)}. They are still in your transactions.`,
    };
  }
  const movedNote =
    moved <= 0
      ? ''
      : moved === 1 && one
        ? ' It left the event it was in.'
        : ` ${moved} left another event.`;
  return {
    title: `Added to ${event.name}`,
    message: `${rows} now ${one ? 'counts' : 'count'} towards ${eventLabel(event)}.${movedNote}`,
  };
};

export type EventCategoryShare = {
  label: string;
  amount: number;
  percentage: number;
  count: number;
};

/**
 * Where an event's money went, by category, from the same summary report the
 * transactions screen exports — filtered to the event, so the two agree.
 */
export const fetchEventCategories = async (
  token: string,
  id: number
): Promise<EventCategoryShare[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/reports/transactions/summary?event_id=${id}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load where the money went.');
  }
  const payload = (await response.json()) as { by_category?: unknown } | null;
  const rows = Array.isArray(payload?.by_category) ? payload.by_category : [];
  return rows.map((row) => {
    const value = (row ?? {}) as Record<string, unknown>;
    return {
      label: typeof value.label === 'string' ? value.label : 'Other',
      amount: toNumber(value.amount),
      percentage: toNumber(value.percentage),
      count: toNumber(value.transaction_count),
    };
  });
};

const shortDay = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const fullDay = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "31 Oct – 1 Nov 2026", "1 Nov 2026", or "" for an undated event. */
export const describeEventDates = (event: Pick<FinnriEvent, 'start_date' | 'end_date'>) => {
  const { start_date: start, end_date: end } = event;
  if (start && end) {
    return start === end ? fullDay(start) : `${shortDay(start)} – ${fullDay(end)}`;
  }
  if (start) return `From ${fullDay(start)}`;
  if (end) return `Until ${fullDay(end)}`;
  return '';
};

/** The event's name with its emoji, for pills and pickers. */
export const eventLabel = (event: Pick<FinnriEvent, 'name' | 'emoji'>) =>
  event.emoji ? `${event.emoji} ${event.name}` : event.name;

/** True when `day` (`YYYY-MM-DD`) falls inside the event's dates. */
export const eventCoversDay = (
  event: Pick<FinnriEvent, 'start_date' | 'end_date'>,
  day: string
) => {
  if (!event.start_date && !event.end_date) return false;
  if (event.start_date && day < event.start_date) return false;
  if (event.end_date && day > event.end_date) return false;
  return true;
};

/**
 * The picker's order: events whose dates cover the transaction's day first,
 * then the rest newest first — the list order the server already gives.
 */
export const orderEventsForDay = <T extends FinnriEvent>(events: T[], day: string | null) => {
  if (!day) return events;
  const covering = events.filter((event) => eventCoversDay(event, day));
  return [...covering, ...events.filter((event) => !covering.includes(event))];
};

/**
 * The date a new transaction added from an event starts on: today if the event
 * is happening now, else its first day, else today.
 */
export const defaultDayForEvent = (
  event: Pick<FinnriEvent, 'start_date' | 'end_date'>,
  today: string
) => {
  if (eventCoversDay(event, today) || !event.start_date) return today;
  return event.start_date;
};

type EventsState = {
  events: EventListItem[];
  /** Whose list this is, so the next account to sign in does not see it. */
  loadedFor: string | null;
  loadedAt: number;
  load: (token: string, options?: { force?: boolean }) => Promise<void>;
  /** Creates an event and puts it at the top of the list. */
  create: (token: string, input: EventInput) => Promise<FinnriEvent>;
  /** Marks the list stale, after anything that changes counts or totals. */
  invalidate: () => void;
  /** Applies an edit or delete the screen already made. */
  replace: (event: FinnriEvent) => void;
  drop: (id: number) => void;
};

/**
 * The user's events, for the form's picker, the transactions screen and the
 * events list. Pickers read it the moment they open; screens that show totals
 * load with `force`.
 */
export const useEvents = create<EventsState>()((set, get) => ({
  events: [],
  loadedFor: null,
  loadedAt: 0,

  load: async (token, options) => {
    if (get().loadedFor !== token) {
      set({ events: [], loadedFor: token, loadedAt: 0 });
    } else if (!options?.force && Date.now() - get().loadedAt < EVENTS_FRESH_MS) {
      return;
    }
    try {
      const events = await fetchEvents(token);
      if (get().loadedFor === token) set({ events, loadedAt: Date.now() });
    } catch (error) {
      if (options?.force) throw error;
      // A picker still opens; the list comes back next time.
    }
  },

  create: async (token, input) => {
    const { event } = await createEvent(token, input);
    if (get().loadedFor === token) {
      set((state) => ({
        events: [
          { ...event, entry_count: 0, total_paid: 0, owed_back: 0, net_cost: 0 },
          ...state.events,
        ],
      }));
    }
    return event;
  },

  invalidate: () => set({ loadedAt: 0 }),

  replace: (event) =>
    set((state) => ({
      events: state.events.map((existing) =>
        existing.id === event.id ? { ...existing, ...event } : existing
      ),
    })),

  drop: (id) => set((state) => ({ events: state.events.filter((event) => event.id !== id) })),
}));

// Totals and counts move with every transaction saved, edited or deleted
// anywhere, so any such change marks the list stale for its next reader.
subscribeTransactionsChanged(() => useEvents.getState().invalidate());
