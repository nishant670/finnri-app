import { Transaction } from '@/types/transaction';

import { groupTransactionsBySection, isAmountSort, type TransactionSort } from './transactions';

export type TransactionListItem =
  | {
      kind: 'day';
      key: string;
      title: string;
      /** Null when the day may carry on into a page that has not loaded yet. */
      total: number | null;
      /** The first heading has nothing above it to keep its distance from. */
      first: boolean;
    }
  | {
      kind: 'row';
      key: string;
      transaction: Transaction;
      /** Rows above this one, down the whole list — what the entrance staggers by. */
      position: number;
    };

/**
 * The transactions screen as one flat list: each day's heading, then its rows.
 *
 * Flat rather than one item per day, because `FlatList` mounts and unmounts
 * whole items. A day rendered as a single item would mount every row in it at
 * once, which is the cost the list is virtualised to avoid, and on exactly the
 * busy days that have it.
 *
 * Sorting by amount ranks the whole set, and day sections cannot survive that,
 * so the list goes flat with no headings and each row carries its own date.
 *
 * - `hasMore`: the last day on screen may continue on the next page, so its
 *   total is left off rather than shown short.
 * - `pendingDeleteId`: a row in its Undo window. It is already gone as far as
 *   the screen is concerned, so its day's total drops with it.
 */
export const buildTransactionListItems = (
  transactions: Transaction[],
  {
    sort,
    hasMore,
    pendingDeleteId,
  }: { sort: TransactionSort; hasMore: boolean; pendingDeleteId?: string | null }
): TransactionListItem[] => {
  if (isAmountSort(sort)) {
    return transactions.map((transaction, position) => ({
      kind: 'row',
      key: `row:${transaction.id}`,
      transaction,
      position,
    }));
  }

  const sections = groupTransactionsBySection(
    transactions,
    sort === 'oldest' ? 'oldest' : 'newest'
  );
  const items: TransactionListItem[] = [];
  let position = 0;
  sections.forEach((section, index) => {
    const mayContinue = hasMore && index === sections.length - 1;
    items.push({
      kind: 'day',
      key: `day:${section.title}`,
      title: section.title,
      total: mayContinue
        ? null
        : section.data.reduce(
            (sum, transaction) =>
              transaction.id === pendingDeleteId ? sum : sum + transaction.amount,
            0
          ),
      first: index === 0,
    });
    section.data.forEach((transaction) => {
      items.push({ kind: 'row', key: `row:${transaction.id}`, transaction, position });
      position += 1;
    });
  });
  return items;
};
