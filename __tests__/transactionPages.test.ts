import { act, renderHook, waitFor } from '@testing-library/react-native';

import { TRANSACTION_PAGE_SIZE, useTransactionPages } from '@/hooks/use-transaction-pages';
import { loadTransactionPage, mapEntryToTransaction } from '@/lib/transactions';
import { Transaction } from '@/types/transaction';

jest.mock('@/lib/transactions', () => ({
  ...jest.requireActual('@/lib/transactions'),
  loadTransactionPage: jest.fn(),
}));

const mockedLoad = loadTransactionPage as jest.MockedFunction<typeof loadTransactionPage>;

const row = (id: number, category = 'Food & Drinks') =>
  mapEntryToTransaction({
    id,
    title: `Entry ${id}`,
    amount: 10,
    type: 'expense',
    date: '2026-07-01',
    category,
    account_id: 1,
  });

/** A server holding `rows`, paged the way the API pages. */
const serve = (rows: () => Transaction[]) =>
  mockedLoad.mockImplementation(async (_token, filters) => {
    const page = Number(filters?.page ?? 1);
    const size = Number(filters?.page_size ?? 20);
    const all = rows();
    return {
      transactions: all.slice((page - 1) * size, page * size),
      categoryCounts: {},
      total: all.length,
    };
  });

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const query = { sort: 'newest' as const };

const ids = (transactions: Transaction[]) => transactions.map((transaction) => transaction.id);

beforeEach(() => {
  mockedLoad.mockReset();
});

describe('useTransactionPages', () => {
  it('loads a page at a time until the server runs out', async () => {
    const rows = Array.from({ length: 70 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.transactions).toHaveLength(TRANSACTION_PAGE_SIZE);
    expect(result.current.total).toBe(70);
    expect(result.current.hasMore).toBe(true);
    expect(mockedLoad).toHaveBeenLastCalledWith('t', {
      sort: 'newest',
      page: 1,
      page_size: TRANSACTION_PAGE_SIZE,
    });

    await act(async () => result.current.loadMore());
    expect(result.current.transactions).toHaveLength(60);
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    expect(result.current.transactions).toHaveLength(70);
    expect(result.current.hasMore).toBe(false);

    // Nothing left to ask for.
    const calls = mockedLoad.mock.calls.length;
    await act(async () => result.current.loadMore());
    expect(mockedLoad).toHaveBeenCalledTimes(calls);
  });

  it('drops a row a shifted page repeats', async () => {
    let rows = Array.from({ length: 40 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Saved elsewhere after page 1 was read: everything moves down by one, and
    // page 2 starts with the row page 1 ended on.
    rows = [row(999), ...rows];
    await act(async () => result.current.loadMore());

    const loaded = ids(result.current.transactions);
    expect(loaded).toHaveLength(40);
    expect(new Set(loaded).size).toBe(40);
  });

  it('refreshes every page on screen, not just the first', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.loadMore());
    expect(result.current.transactions).toHaveLength(60);

    mockedLoad.mockClear();
    await act(async () => result.current.refresh());

    expect(result.current.transactions).toHaveLength(60);
    expect(result.current.hasMore).toBe(true);
    // 60 rows in one larger request rather than two of 30.
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad.mock.calls[0][1]).toMatchObject({ page: 1, page_size: 90 });

    // And the next page still follows on from the 60.
    await act(async () => result.current.loadMore());
    expect(ids(result.current.transactions).slice(58, 62)).toEqual(['59', '60', '61', '62']);
  });

  it('runs a next page asked for during a refresh once the refresh lands', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const gate = deferred();
    const served = mockedLoad.getMockImplementation()!;
    mockedLoad.mockImplementationOnce(async (...args) => {
      await gate.promise;
      return served(...args);
    });

    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = result.current.refresh();
    });
    await act(async () => result.current.loadMore());
    expect(result.current.transactions).toHaveLength(30);

    await act(async () => {
      gate.resolve();
      await refreshing;
    });
    await waitFor(() => expect(result.current.transactions).toHaveLength(60));
  });

  it('does not retry a failed page until asked to', async () => {
    const rows = Array.from({ length: 70 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockedLoad.mockRejectedValueOnce(new Error('offline'));
    await act(async () => result.current.loadMore());
    expect(result.current.loadMoreError).toBeTruthy();

    // The list asking again on its own (its height changed) is ignored...
    const calls = mockedLoad.mock.calls.length;
    await act(async () => result.current.loadMore());
    expect(mockedLoad).toHaveBeenCalledTimes(calls);

    // ...and the footer's Try again goes through.
    await act(async () => result.current.retryLoadMore());
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.transactions).toHaveLength(60);
  });

  it('discards a page that belongs to the previous query', async () => {
    const rows = Array.from({ length: 70 }, (_, index) => row(index + 1));
    serve(() => rows);

    const { result, rerender } = await renderHook(
      ({ q }: { q?: string }) => useTransactionPages({ token: 't', query: { ...query, q } }),
      { initialProps: { q: undefined } as { q?: string } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const gate = deferred();
    const served = mockedLoad.getMockImplementation()!;
    mockedLoad.mockImplementationOnce(async (...args) => {
      await gate.promise;
      return served(...args);
    });
    let stale!: Promise<void>;
    await act(async () => {
      stale = result.current.loadMore();
    });

    await rerender({ q: 'chai' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      gate.resolve();
      await stale;
    });

    expect(result.current.transactions).toHaveLength(30);
    expect(ids(result.current.transactions)[0]).toBe('1');
  });

  it('reads past pages with nothing to show when rows are filtered here', async () => {
    // Review mode keeps rows the API cannot filter for. The first two pages
    // hold none of them; an empty page would leave the list nothing to scroll
    // towards, so it would never ask for the third.
    const rows = Array.from({ length: 80 }, (_, index) =>
      row(index + 1, index === 65 ? 'Uncategorized' : 'Food & Drinks')
    );
    serve(() => rows);
    const keep = (transaction: Transaction) => transaction.category === 'Uncategorized';

    const { result } = await renderHook(() => useTransactionPages({ token: 't', query, keep }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(ids(result.current.transactions)).toEqual(['66']);
    expect(mockedLoad).toHaveBeenCalledTimes(3);
    expect(result.current.hasMore).toBe(false);
  });
});
