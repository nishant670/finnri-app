import { useEffect, useMemo, useRef, useState } from 'react';

import { getFriendlyErrorMessage } from '@/lib/api-error';

export type FeedPage<T, M> = {
  items: T[];
  /** Matches across the whole set on the server, not the page. */
  total: number;
  /** Anything else the first page carries — facet counts, say. */
  meta?: M;
};

type PagedFeedState<T, M> = {
  items: T[];
  total: number;
  meta: M | undefined;
  hasMore: boolean;
  /** The first page of a new query is on its way. */
  isLoading: boolean;
  error: string | null;
  isLoadingMore: boolean;
  loadMoreError: string | null;
};

type Job = 'first' | 'more' | 'refresh';

/** `current` with `next` after it, minus anything already in it. */
const appendUnique = <T>(current: T[], next: T[], keyOf: (item: T) => string) => {
  const seen = new Set(current.map(keyOf));
  const fresh: T[] = [];
  next.forEach((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return;
    seen.add(key);
    fresh.push(item);
  });
  return fresh.length === 0 ? current : [...current, ...fresh];
};

/**
 * A server list, a page at a time: the engine behind the transactions list
 * and the split Activity feed.
 *
 * A new `queryKey` starts over from page 1. `loadMore` adds the next page,
 * and `refresh` re-reads every page already loaded, so a change elsewhere
 * shows up without the list dropping back to its first page under the user's
 * thumb. `refreshPageSize` must be a multiple of `pageSize`, so the larger
 * re-read lines up with the small pages.
 *
 * **One request at a time.** A refresh and a next page that overlap can each
 * land on the other's list: the refresh replaces pages 1–3 and loses the page 4
 * that arrived during it, and the next request then asks for page 5. So a
 * request that arrives while another is running is queued, not dropped.
 * Dropping it would stall the list: `FlatList` asks for more once per content
 * height, and a request it never hears back from is never made again.
 *
 * Offset pages shift when a row is added between two requests, so a row a
 * page repeats is dropped by `keyOf`.
 *
 * `keep` is for lists the server cannot filter the way the screen does. Whole
 * pages can then come back with nothing to show; those are read through until
 * something is, or the list would have nothing to scroll toward.
 */
export function usePagedFeed<T, M = undefined>({
  queryKey,
  pageSize,
  refreshPageSize,
  fetchPage,
  keyOf,
  keep,
  messages,
}: {
  queryKey: string;
  pageSize: number;
  refreshPageSize: number;
  /** Read through a ref, so it may close over the current render. */
  fetchPage: (page: number, pageSize: number) => Promise<FeedPage<T, M>>;
  keyOf: (item: T) => string;
  /** Must be a stable reference. A new one starts the list over. */
  keep?: (item: T) => boolean;
  messages: { load: string; more: string };
}) {
  const [state, setState] = useState<PagedFeedState<T, M>>({
    items: [],
    total: 0,
    meta: undefined,
    hasMore: false,
    isLoading: true,
    error: null,
    isLoadingMore: false,
    loadMoreError: null,
  });
  const latest = useRef({ fetchPage, keyOf, keep, pageSize, refreshPageSize, messages });
  latest.current = { fetchPage, keyOf, keep, pageSize, refreshPageSize, messages };

  /** Bumped by every new query. A request from an older one is discarded. */
  const generation = useRef(0);
  const running = useRef<Job | null>(null);
  const queued = useRef({ more: false, refresh: false });
  /** Server pages behind what is on screen, including any read through for `keep`. */
  const pagesRead = useRef(0);
  const hasMore = useRef(false);
  /**
   * Set when a next page failed. Only an explicit retry clears it: the footer
   * swapping its spinner for the error changes the list's height, the list
   * then asks for more again, and an offline phone would retry forever.
   */
  const moreFailed = useRef(false);

  const actions = useMemo(() => {
    /** Reads from `page` until an item the screen will show arrives, or the server runs out. */
    const readFrom = async (page: number, isCurrent: () => boolean) => {
      const { fetchPage: fetch, keep: keepItem, pageSize: size } = latest.current;
      const items: T[] = [];
      for (let current = page; ; current += 1) {
        const result = await fetch(current, size);
        items.push(...(keepItem ? result.items.filter(keepItem) : result.items));
        const more = result.items.length > 0 && current * size < result.total;
        if (items.length > 0 || !more || !isCurrent()) {
          return { items, lastPage: current, more, total: result.total, meta: result.meta };
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
          items: page.items,
          total: page.total,
          meta: page.meta,
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
          error: getFriendlyErrorMessage(err, latest.current.messages.load),
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
          items: appendUnique(prev.items, page.items, latest.current.keyOf),
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
          loadMoreError: getFriendlyErrorMessage(err, latest.current.messages.more),
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
      const { fetchPage: fetch, keep: keepItem, keyOf: key, pageSize: size } = latest.current;
      const chunk = latest.current.refreshPageSize;
      const itemsShown = pagesRead.current * size;
      try {
        const pages = await Promise.all(
          Array.from({ length: Math.ceil(itemsShown / chunk) }, (_, index) =>
            fetch(index + 1, chunk)
          )
        );
        if (gen !== generation.current) return;
        const items = pages
          .reduce<T[]>((all, page) => appendUnique(all, page.items, key), [])
          .slice(0, itemsShown);
        const total = pages[0].total;
        hasMore.current = itemsShown < total;
        // A page that loads again is the retry an error was waiting for.
        moreFailed.current = false;
        setState((prev) => ({
          ...prev,
          items: keepItem ? items.filter(keepItem) : items,
          total,
          meta: pages[0].meta,
          hasMore: hasMore.current,
          error: null,
          loadMoreError: null,
        }));
      } catch (err) {
        if (gen !== generation.current) return;
        setState((prev) => ({
          ...prev,
          error: getFriendlyErrorMessage(err, latest.current.messages.load),
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

  useEffect(() => {
    void actions.reload();
  }, [actions, queryKey, keep]);

  // Whatever is still in flight when the screen goes lands on nothing.
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  return { ...state, ...actions };
}
