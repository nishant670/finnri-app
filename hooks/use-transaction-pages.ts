import { useEffect, useMemo, useRef, useState } from 'react';

import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  appendTransactionPage,
  loadTransactionPage,
  type TransactionFilters,
} from '@/lib/transactions';
import { Transaction } from '@/types/transaction';

/**
 * Rows per request: two to three screens of them. Enough that the next page is
 * usually in before the user reaches the end of this one, few enough that the
 * first screen does not wait on rows nobody has scrolled to.
 */
export const TRANSACTION_PAGE_SIZE = 30;

/**
 * A refresh re-reads everything already on screen in requests this size. A
 * multiple of the page size, so the larger pages line up with the small ones,
 * and under the API's cap of 100.
 */
const REFRESH_PAGE_SIZE = TRANSACTION_PAGE_SIZE * 3;

type TransactionQuery = Omit<TransactionFilters, 'page' | 'page_size'>;

type TransactionPagesState = {
  transactions: Transaction[];
  /** Matches across the whole filtered set, not the rows loaded so far. */
  total: number;
  categoryCounts: Record<string, number>;
  hasMore: boolean;
  /** The first page of a new query is on its way. */
  isLoading: boolean;
  error: string | null;
  isLoadingMore: boolean;
  loadMoreError: string | null;
};

const initialState: TransactionPagesState = {
  transactions: [],
  total: 0,
  categoryCounts: {},
  hasMore: false,
  isLoading: true,
  error: null,
  isLoadingMore: false,
  loadMoreError: null,
};

type Job = 'first' | 'more' | 'refresh';

/**
 * The transactions list, a page at a time.
 *
 * A new `query` starts over from page 1. `loadMore` adds the next page, and
 * `refresh` re-reads every page already loaded, so a change made elsewhere
 * shows up without the list dropping back to its first 30 rows under the
 * user's thumb.
 *
 * **One request at a time.** A refresh and a next page that overlap can each
 * land on the other's list: the refresh replaces pages 1–3 and loses the page 4
 * that arrived during it, and the next request then asks for page 5. So a
 * request that arrives while another is running is queued, not dropped.
 * Dropping it would stall the list: `FlatList` asks for more once per content
 * height, and a request it never hears back from is never made again.
 *
 * `keep` is for review mode, which shows only rows missing a category or an
 * account. The API cannot filter for that, so whole pages can come back with
 * nothing to show; those are read through until something is.
 */
export function useTransactionPages({
  token,
  query,
  keep,
}: {
  token: string | null | undefined;
  query: TransactionQuery;
  /** Must be a stable reference. A new one starts the list over. */
  keep?: (transaction: Transaction) => boolean;
}) {
  const [state, setState] = useState<TransactionPagesState>(initialState);
  const latest = useRef({ token, query, keep });
  latest.current = { token, query, keep };

  /** Bumped by every new query. A request from an older one is discarded. */
  const generation = useRef(0);
  const running = useRef<Job | null>(null);
  const queued = useRef({ more: false, refresh: false });
  /** Server pages behind what is on screen, including any read through in review mode. */
  const pagesRead = useRef(0);
  const hasMore = useRef(false);
  /**
   * Set when a next page failed. Only an explicit retry clears it: the footer
   * swapping its spinner for the error changes the list's height, the list
   * then asks for more again, and an offline phone would retry forever.
   */
  const moreFailed = useRef(false);

  const actions = useMemo(() => {
    const fetchPage = (page: number, pageSize = TRANSACTION_PAGE_SIZE) =>
      loadTransactionPage(latest.current.token, {
        ...latest.current.query,
        page,
        page_size: pageSize,
      });

    /** Reads from `page` until a row the screen will show arrives, or the server runs out. */
    const readFrom = async (page: number, isCurrent: () => boolean) => {
      const keepRow = latest.current.keep;
      const rows: Transaction[] = [];
      for (let current = page; ; current += 1) {
        const result = await fetchPage(current);
        rows.push(...(keepRow ? result.transactions.filter(keepRow) : result.transactions));
        const more =
          result.transactions.length > 0 && current * TRANSACTION_PAGE_SIZE < result.total;
        if (rows.length > 0 || !more || !isCurrent()) {
          return { rows, lastPage: current, more, total: result.total, result };
        }
      }
    };

    const finish = (gen: number) => {
      if (gen !== generation.current) return;
      running.current = null;
      if (queued.current.refresh) {
        queued.current.refresh = false;
        void refresh();
      } else if (queued.current.more) {
        queued.current.more = false;
        void loadMore();
      }
    };

    async function reload() {
      const gen = ++generation.current;
      running.current = 'first';
      queued.current = { more: false, refresh: false };
      moreFailed.current = false;
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        isLoadingMore: false,
        loadMoreError: null,
      }));
      try {
        const page = await readFrom(1, () => gen === generation.current);
        if (gen !== generation.current) return;
        pagesRead.current = page.lastPage;
        hasMore.current = page.more;
        setState({
          transactions: page.rows,
          total: page.total,
          categoryCounts: page.result.categoryCounts,
          hasMore: page.more,
          isLoading: false,
          error: null,
          isLoadingMore: false,
          loadMoreError: null,
        });
      } catch (err) {
        if (gen !== generation.current) return;
        // What is still on screen belongs to the previous query, so nothing may
        // be appended to it. A refresh or a retry starts over.
        pagesRead.current = 0;
        hasMore.current = false;
        setState((prev) => ({
          ...prev,
          hasMore: false,
          isLoading: false,
          error: getFriendlyErrorMessage(err, 'Unable to load transactions.'),
        }));
      } finally {
        finish(gen);
      }
    }

    async function loadMore(retry = false) {
      if (!hasMore.current || (moreFailed.current && !retry)) return;
      if (running.current) {
        // A first page replaces everything anyway, and a second request for the
        // page already on its way is the same request.
        if (running.current === 'refresh') queued.current.more = true;
        return;
      }
      const gen = generation.current;
      running.current = 'more';
      moreFailed.current = false;
      setState((prev) => ({ ...prev, isLoadingMore: true, loadMoreError: null }));
      try {
        const page = await readFrom(pagesRead.current + 1, () => gen === generation.current);
        if (gen !== generation.current) return;
        pagesRead.current = page.lastPage;
        hasMore.current = page.more;
        setState((prev) => ({
          ...prev,
          transactions: appendTransactionPage(prev.transactions, page.rows),
          total: page.total,
          hasMore: page.more,
          isLoadingMore: false,
        }));
      } catch (err) {
        if (gen !== generation.current) return;
        moreFailed.current = true;
        setState((prev) => ({
          ...prev,
          isLoadingMore: false,
          loadMoreError: getFriendlyErrorMessage(err, 'Unable to load more transactions.'),
        }));
      } finally {
        finish(gen);
      }
    }

    async function refresh() {
      if (running.current) {
        queued.current.refresh = true;
        return;
      }
      if (pagesRead.current === 0) {
        void reload();
        return;
      }
      const gen = generation.current;
      running.current = 'refresh';
      const rowsShown = pagesRead.current * TRANSACTION_PAGE_SIZE;
      try {
        const pages = await Promise.all(
          Array.from({ length: Math.ceil(rowsShown / REFRESH_PAGE_SIZE) }, (_, index) =>
            fetchPage(index + 1, REFRESH_PAGE_SIZE)
          )
        );
        if (gen !== generation.current) return;
        const keepRow = latest.current.keep;
        const rows = pages
          .reduce<Transaction[]>((all, page) => appendTransactionPage(all, page.transactions), [])
          .slice(0, rowsShown);
        const total = pages[0].total;
        hasMore.current = rowsShown < total;
        // A page that loads again is the retry an error was waiting for.
        moreFailed.current = false;
        setState((prev) => ({
          ...prev,
          transactions: keepRow ? rows.filter(keepRow) : rows,
          total,
          categoryCounts: pages[0].categoryCounts,
          hasMore: hasMore.current,
          error: null,
          loadMoreError: null,
        }));
      } catch (err) {
        if (gen !== generation.current) return;
        setState((prev) => ({
          ...prev,
          error: getFriendlyErrorMessage(err, 'Unable to load transactions.'),
        }));
      } finally {
        finish(gen);
      }
    }

    return {
      reload,
      refresh,
      loadMore: () => loadMore(),
      retryLoadMore: () => loadMore(true),
    };
  }, []);

  const queryKey = JSON.stringify(query);
  useEffect(() => {
    void actions.reload();
  }, [actions, token, queryKey, keep]);

  // Whatever is still in flight when the screen goes lands on nothing.
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  return { ...state, ...actions };
}
