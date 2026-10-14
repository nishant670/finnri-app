import { buildTransactionListItems, type TransactionListItem } from '@/lib/transaction-list';
import { appendTransactionPage, mapEntryToTransaction } from '@/lib/transactions';

const row = (id: number, date: string, amount: number) =>
  mapEntryToTransaction({ id, title: `Entry ${id}`, amount, type: 'expense', date });

const outline = (items: TransactionListItem[]) =>
  items.map((item) =>
    item.kind === 'day' ? `${item.title} ${item.total}` : `  ${item.transaction.id}`
  );

const july2 = row(1, '2026-07-02', 100);
const july2b = row(2, '2026-07-02', 50);
const july1 = row(3, '2026-07-01', 20);

describe('buildTransactionListItems', () => {
  it('heads each day with its total, newest day first', () => {
    const items = buildTransactionListItems([july2, july2b, july1], {
      sort: 'newest',
      hasMore: false,
    });

    expect(outline(items)).toEqual([
      `${july2.section} -150`,
      '  1',
      '  2',
      `${july1.section} -20`,
      '  3',
    ]);
    expect(items[0]).toMatchObject({ kind: 'day', first: true });
    expect(items[3]).toMatchObject({ kind: 'day', first: false });
    // Rows count down the whole list, so the stagger does not restart per day.
    expect(items[4]).toMatchObject({ kind: 'row', position: 2 });
  });

  it('leaves the total off the last day while more pages are coming', () => {
    const items = buildTransactionListItems([july2, july1], { sort: 'newest', hasMore: true });

    expect(outline(items)).toEqual([
      `${july2.section} -100`,
      '  1',
      `${july1.section} null`,
      '  3',
    ]);
  });

  it('takes a row in its Undo window out of its day total', () => {
    const items = buildTransactionListItems([july2, july2b], {
      sort: 'newest',
      hasMore: false,
      pendingDeleteId: '1',
    });

    expect(items[0]).toMatchObject({ kind: 'day', total: -50 });
    // The row itself stays, to collapse in place.
    expect(items).toHaveLength(3);
  });

  it('puts the oldest day first when the list is sorted that way', () => {
    // A later page of an oldest-first list holds newer days, and they belong
    // below what is already on screen.
    const items = buildTransactionListItems([july1, july2], { sort: 'oldest', hasMore: false });

    expect(outline(items)).toEqual([`${july1.section} -20`, '  3', `${july2.section} -100`, '  1']);
  });

  it('goes flat when ranked by amount', () => {
    const items = buildTransactionListItems([july2, july2b, july1], {
      sort: 'highest',
      hasMore: true,
    });

    expect(outline(items)).toEqual(['  1', '  2', '  3']);
  });
});

describe('appendTransactionPage', () => {
  it('adds only rows not already in the list', () => {
    const current = [july2, july2b];

    expect(appendTransactionPage(current, [july2b, july1])).toEqual([july2, july2b, july1]);
  });

  it('keeps the same list when nothing is new', () => {
    const current = [july2, july2b];

    expect(appendTransactionPage(current, [july2b])).toBe(current);
  });
});
