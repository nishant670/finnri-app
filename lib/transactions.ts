import Constants from 'expo-constants';

import { Transaction } from '@/types/transaction';
import { readApiError } from './api-error';
import { categoryVisual, resolveCategory, type CategoryVisual } from './categories';
import { formatApiDate, formatTime } from './datetime';

export type ApiEntry = {
  id?: string | number;
  account_id?: number | null;
  account?: {
    id: number;
    name: string;
    type: string;
  } | null;
  amount?: number | string;
  type?: string;
  mode?: string;
  category?: string;
  date?: string;
  time?: string;
  notes?: string;
  merchant?: string;
  title?: string;
  tag?: string;
  currency?: string;
  source?: string;
  source_text?: string;
  attachment?: string | null;
  refundable_amount?: number | string | null;
  refund_expected_on?: string | null;
  refund_reminder_at?: string | null;
  refund_status?: 'pending' | 'received' | 'written_off' | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  category_suggestions?: string[];
};

/**
 * Result order, as the API understands it.
 *
 * `highest` and `lowest` rank across the whole filtered set, which is why the
 * transactions screen stops grouping rows by day when either is chosen — see
 * {@link loadTransactionPage}.
 */
export type TransactionSort = 'newest' | 'oldest' | 'highest' | 'lowest';

export const TRANSACTION_SORTS: { value: TransactionSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
];

export const DEFAULT_TRANSACTION_SORT: TransactionSort = 'newest';

/** Sorts that rank by money rather than time, so day sections stop applying. */
export const isAmountSort = (sort: TransactionSort) => sort === 'highest' || sort === 'lowest';

export interface TransactionFilters {
  q?: string;
  type?: string;
  category?: string;
  mode?: string;
  account_id?: number;
  min_amount?: number;
  max_amount?: number;
  start_date?: string;
  end_date?: string;
  /** `'1'` for entries with no category at all. Misc is a category, not this. */
  uncategorised?: '1';
  sort?: TransactionSort;
  page?: number;
  page_size?: number;
}

export type TransactionPage = {
  transactions: Transaction[];
  /** Entries per category across the filtered set, ignoring the category filter. */
  categoryCounts: Record<string, number>;
  /** Rows matching the filters, which is more than one page holds. */
  total: number;
};

const monthLookup: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export const toTitleCase = (value?: string | null) => {
  if (!value) {
    return value ?? null;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const formatDateLabel = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

export const parseDateLabel = (label?: string | null) => {
  if (!label) {
    return null;
  }
  const apiDateMatch = label.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (apiDateMatch) {
    const [, yearStr, monthStr, dayStr] = apiDateMatch;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const parsed = new Date(label);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  const match = label.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const [, dayStr, monthStr, yearStr] = match;
    const monthIndex = monthLookup[monthStr.toLowerCase()];
    if (monthIndex != null) {
      const day = Number(dayStr);
      const year = Number(yearStr);
      const fallback = new Date(year, monthIndex, day);
      if (!Number.isNaN(fallback.getTime())) {
        return fallback;
      }
    }
  }
  return null;
};

export const normalizeDateLabel = (value?: string | null, fallback?: string) => {
  const parsed = parseDateLabel(value);
  if (parsed) {
    return formatDateLabel(parsed);
  }
  return value ?? fallback ?? formatDateLabel(new Date());
};

export { formatApiDate };

export type CategoryMetadata = CategoryVisual;

/**
 * Icons and colours live in `lib/categories.ts` alongside the canonical list, so
 * a category can never exist without a matching visual. `categoryVisual` also
 * resolves legacy names, which is what keeps older rows rendering correctly.
 */
export const resolveCategoryMetadata = (
  category?: string | null,
  type?: string | null
): CategoryMetadata => categoryVisual(category, type);

const deriveSectionMeta = (value?: string | null) => {
  const parsed = parseDateLabel(value);
  const fallback = value ? new Date(value) : null;
  const resolved =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : fallback && !Number.isNaN(fallback.getTime())
        ? fallback
        : null;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (resolved) {
    const entryDay = new Date(resolved.getFullYear(), resolved.getMonth(), resolved.getDate());
    const diffDays = Math.round(
      (todayStart.getTime() - entryDay.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays === 0) {
      return { section: 'Today', timestamp: entryDay.getTime() };
    }
    if (diffDays === 1) {
      return { section: 'Yesterday', timestamp: entryDay.getTime() };
    }
    if (diffDays > 1 && diffDays < 7) {
      return { section: `${diffDays} days ago`, timestamp: entryDay.getTime() };
    }
    return { section: formatDateLabel(entryDay), timestamp: entryDay.getTime() };
  }
  return { section: 'Recent', timestamp: todayStart.getTime() };
};

const safeNumber = (value?: number | string | null) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Every row in the feed gets its time from here, so the stored value's shape
 * stops mattering: the parser's `15:58` and a legacy `10:09 PM` both come out
 * in whichever clock the device uses.
 */
const normalizeTimeLabel = (value?: string | null, fallbackDateValue?: string | null) =>
  formatTime(value) ?? formatTime(fallbackDateValue);

export const normalizeEntriesResponse = (payload: unknown): ApiEntry[] => {
  if (Array.isArray(payload)) {
    return payload as ApiEntry[];
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.entries)) {
      return record.entries as ApiEntry[];
    }
    if (Array.isArray(record.data)) {
      return record.data as ApiEntry[];
    }
  }
  return [];
};

export const mapEntryToTransaction = (entry: ApiEntry): Transaction => {
  const amountValue = safeNumber(entry.amount);
  const type = (entry.type ?? 'Expense').toLowerCase();
  const normalizedType: 'income' | 'expense' = type === 'income' ? 'income' : 'expense';
  const signedAmount = normalizedType === 'income' ? Math.abs(amountValue) : -Math.abs(amountValue);
  const label =
    entry.title?.trim() ||
    entry.merchant?.trim() ||
    entry.category?.trim() ||
    entry.notes?.trim() ||
    entry.mode ||
    'Transaction';
  // Rows written before the taxonomy was unified can still carry legacy names,
  // so resolve through the canonical list rather than special-casing one value.
  const rawCategory = entry.category ?? (normalizedType === 'income' ? 'Income' : 'Expense');
  const category = resolveCategory(rawCategory) ?? rawCategory;
  const dateSource = entry.date ?? entry.created_at ?? entry.createdAt ?? entry.updated_at ?? null;
  const formattedDate = dateSource ? normalizeDateLabel(dateSource) : null;
  const timeLabel = normalizeTimeLabel(entry.time, entry.created_at ?? entry.createdAt ?? null);
  const { section, timestamp } = deriveSectionMeta(dateSource);
  const normalizedTag = entry.tag ? (toTitleCase(entry.tag) ?? entry.tag) : null;

  return {
    id: entry.id ? String(entry.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: label,
    title: entry.title ?? null,
    category,
    amount: signedAmount,
    ...resolveCategoryMetadata(category, entry.type),
    section,
    occurredAt: timestamp,
    entryType: normalizedType,
    mode: entry.mode ?? null,
    accountId: entry.account_id ?? null,
    accountName: entry.account?.name ?? null,
    notes: entry.notes ?? null,
    merchant: entry.merchant ?? null,
    timeLabel,
    dateLabel: formattedDate,
    rawDate: dateSource ?? null,
    tag: normalizedTag,
  };
};

/**
 * Where the API lives, decided when the bundle is built.
 *
 * `EXPO_PUBLIC_API_URL` is inlined by Expo at build time, so a build that had
 * it set carries the real host and a build that did not carries nothing at
 * all. The `hostUri` fallback below resolves to the machine serving Metro on
 * the local network, which is only meaningful while that dev server is the
 * thing running this bundle. Shipped, it points the app at whatever address
 * the developer's laptop had — reachable on their WiFi and nowhere else, so
 * the app works at home and fails everywhere else with a connection error.
 *
 * A release build missing the URL therefore fails here, loudly, rather than
 * quietly at a user's house.
 */
const resolveApiBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  if (!__DEV__) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is missing from this release build. Set it in the ' +
        'EAS build profile (or .env for a local release build) and rebuild.'
    );
  }

  // Jest never sets the variable and never makes a real request, so the
  // fallback there is expected rather than a misconfigured build.
  const warnFallback = (message: string) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(message);
    }
  };

  const manifest = Constants.manifest as { hostUri?: string; debuggerHost?: string } | null;
  const hostUri =
    Constants.expoConfig?.hostUri ?? manifest?.hostUri ?? manifest?.debuggerHost ?? null;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      // Say so. A dev build carrying this address works on the WiFi that built
      // it and nowhere else, and the symptom — every screen reading "Could not
      // connect to Finnri" the moment the phone leaves the house — looks like a
      // backend outage from the outside. Naming the address here is what turns
      // that into a one-line diagnosis.
      warnFallback(
        `[api] EXPO_PUBLIC_API_URL is unset; falling back to http://${host}:8080 ` +
          '(the machine serving Metro). This build reaches the API on that ' +
          'network only. Set EXPO_PUBLIC_API_URL in .env or the EAS profile.'
      );
      return `http://${host}:8080`;
    }
  }

  warnFallback(
    '[api] EXPO_PUBLIC_API_URL is unset and no Metro host is known; falling ' +
      'back to http://127.0.0.1:8080, which reaches nothing from a handset.'
  );
  return 'http://127.0.0.1:8080';
};

export const API_BASE_URL = resolveApiBaseUrl();

const normalizeCategoryCounts = (payload: unknown): Record<string, number> => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const raw = (payload as Record<string, unknown>).category_counts;
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const counts: Record<string, number> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([category, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      counts[category] = numeric;
    }
  });
  return counts;
};

/**
 * One filtered page, with the facet counts that came back beside it.
 *
 * **The server's order is kept.** This used to re-sort every response by date
 * before returning it, which was harmless while date was the only order the API
 * had — and would now silently undo `sort=highest`, leaving a list that claims
 * to be ranked by amount and is not. The only place rows get reordered is
 * {@link groupTransactionsBySection}, which the caller opts out of when the sort
 * is by amount.
 */
export const loadTransactionPage = async (
  token?: string | null,
  filters?: TransactionFilters
): Promise<TransactionPage> => {
  if (!token) {
    return { transactions: [], categoryCounts: {}, total: 0 };
  }

  const queryParams = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && value !== '' && value !== 'All') {
        queryParams.append(key, String(value));
      }
    });
  }

  const queryString = queryParams.toString();
  const url = `${API_BASE_URL}/v1/entries${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load entries right now.');
  }
  const payload = await response.json();
  const transactions = normalizeEntriesResponse(payload).map(mapEntryToTransaction);
  const total = Number((payload as Record<string, unknown>)?.total);

  return {
    transactions,
    categoryCounts: normalizeCategoryCounts(payload),
    total: Number.isFinite(total) ? total : transactions.length,
  };
};

/**
 * Newest-first rows, for the callers that only ever want a chronological feed.
 *
 * The date sort is applied here rather than left to the server so that a
 * response from an older build, or one that ignored the parameter, still comes
 * back in the order Home and the dashboards assume.
 */
export const loadTransactions = async (
  token?: string | null,
  filters?: TransactionFilters
): Promise<Transaction[]> => {
  const { transactions } = await loadTransactionPage(token, filters);
  return [...transactions].sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
};

/**
 * `current` with `next` added after it, minus any row already in it.
 *
 * Pages are offsets into a list that can change between two requests: a
 * transaction saved after page 1 was read pushes everything down by one, and
 * page 2 then starts with the row page 1 ended on. Two rows with one id is also
 * the one thing a keyed list cannot render.
 */
export const appendTransactionPage = (current: Transaction[], next: Transaction[]) => {
  const seen = new Set(current.map((transaction) => transaction.id));
  const fresh: Transaction[] = [];
  next.forEach((transaction) => {
    if (seen.has(transaction.id)) return;
    seen.add(transaction.id);
    fresh.push(transaction);
  });
  return fresh.length === 0 ? current : [...current, ...fresh];
};

/**
 * Rows by day, newest day first — or oldest first, for the list sorted that way.
 *
 * The order has to follow the list's sort once the list arrives in pages. A
 * later page always holds days further along in that order, so its days belong
 * below the ones already on screen; grouping an oldest-first list newest-first
 * would put each new page's days above everything the user has scrolled past.
 */
export const groupTransactionsBySection = (
  transactions: Transaction[],
  order: 'newest' | 'oldest' = 'newest'
) => {
  if (transactions.length === 0) {
    return [];
  }
  const direction = order === 'oldest' ? -1 : 1;
  const grouped: Record<string, Transaction[]> = {};
  transactions.forEach((transaction) => {
    if (!grouped[transaction.section]) {
      grouped[transaction.section] = [];
    }
    grouped[transaction.section].push(transaction);
  });
  return Object.entries(grouped)
    .map(([title, data]) => ({
      title,
      data: data.sort((a, b) => direction * ((b.occurredAt ?? 0) - (a.occurredAt ?? 0))),
      sortValue:
        title === 'Today'
          ? Number.MAX_SAFE_INTEGER
          : title === 'Yesterday'
            ? Number.MAX_SAFE_INTEGER - 1
            : (data[0]?.occurredAt ?? 0),
    }))
    .sort((a, b) => direction * ((b.sortValue ?? 0) - (a.sortValue ?? 0)))
    .map(({ sortValue, ...rest }) => rest);
};
