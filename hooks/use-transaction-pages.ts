import { usePagedFeed } from '@/hooks/use-paged-feed';
import { loadTransactionPage, type TransactionFilters } from '@/lib/transactions';
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

const transactionKey = (transaction: Transaction) => transaction.id;

/**
 * The transactions list, a page at a time — see `usePagedFeed` for how pages,
 * refreshes and failures are sequenced.
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
  const feed = usePagedFeed<Transaction, Record<string, number>>({
    queryKey: `${token ?? ''}|${JSON.stringify(query)}`,
    pageSize: TRANSACTION_PAGE_SIZE,
    refreshPageSize: REFRESH_PAGE_SIZE,
    fetchPage: async (page, pageSize) => {
      const result = await loadTransactionPage(token, { ...query, page, page_size: pageSize });
      return { items: result.transactions, total: result.total, meta: result.categoryCounts };
    },
    keyOf: transactionKey,
    keep,
    messages: {
      load: 'Unable to load transactions.',
      more: 'Unable to load more transactions.',
    },
  });

  const { items, meta, ...rest } = feed;
  return { ...rest, transactions: items, categoryCounts: meta ?? {} };
}
