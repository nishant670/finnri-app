import { sortSplitBills, splitBillSortLabel } from '@/lib/split-bill-sort';
import type { SplitBill } from '@/lib/splits';

const bill = (over: Partial<SplitBill> & Pick<SplitBill, 'id'>): SplitBill => ({
  user_id: 1,
  title: `Bill ${over.id}`,
  total_amount: 100,
  currency: 'INR',
  date: '2026-09-01',
  participants: [],
  ...over,
});

const ids = (bills: SplitBill[]) => bills.map((row) => row.id);

describe('how a group orders its expenses', () => {
  const bills = [
    bill({ id: 1, date: '2026-09-01', total_amount: 5000, updated_at: '2026-09-12T10:00:00Z' }),
    bill({ id: 2, date: '2026-09-10', total_amount: 200, updated_at: '2026-09-10T10:00:00Z' }),
    bill({ id: 3, date: '2026-09-05', total_amount: 900, updated_at: '2026-09-05T10:00:00Z' }),
  ];

  it('defaults to newest expense first, which is the order the list always had', () => {
    expect(ids(sortSplitBills(bills, 'date_desc'))).toEqual([2, 3, 1]);
    expect(ids(sortSplitBills(bills, 'date_asc'))).toEqual([1, 3, 2]);
  });

  it('surfaces an edit the expense date cannot show', () => {
    // The whole point of this option: bill 1 is the oldest expense in the
    // group and the most recently touched, so date ordering buries the change.
    expect(ids(sortSplitBills(bills, 'updated_desc'))).toEqual([1, 2, 3]);
  });

  it('orders by amount in both directions', () => {
    expect(ids(sortSplitBills(bills, 'amount_desc'))).toEqual([1, 3, 2]);
    expect(ids(sortSplitBills(bills, 'amount_asc'))).toEqual([2, 3, 1]);
  });

  it('never reorders the caller’s array', () => {
    const original = [...bills];
    sortSplitBills(bills, 'amount_asc');
    expect(bills).toEqual(original);
  });

  it('falls back to creation, then the expense date, when updated_at is missing', () => {
    // Half a list without the field is worse than no sort at all: those rows
    // would all collapse to the bottom in whatever order they arrived.
    const partial = [
      bill({ id: 1, date: '2026-01-01' }),
      bill({ id: 2, date: '2026-06-01', created_at: '2026-06-01T00:00:00Z' }),
      bill({ id: 3, date: '2026-03-01', updated_at: '2026-12-01T00:00:00Z' }),
    ];
    expect(ids(sortSplitBills(partial, 'updated_desc'))).toEqual([3, 2, 1]);
  });

  it('breaks ties on the same day by the newer entry, so rows never swap places', () => {
    const sameDay = [
      bill({ id: 1, date: '2026-09-09', created_at: '2026-09-09T08:00:00Z' }),
      bill({ id: 2, date: '2026-09-09', created_at: '2026-09-09T20:00:00Z' }),
    ];
    expect(ids(sortSplitBills(sameDay, 'date_desc'))).toEqual([2, 1]);
    expect(ids(sortSplitBills([...sameDay].reverse(), 'date_desc'))).toEqual([2, 1]);
  });

  it('names every option it offers', () => {
    expect(splitBillSortLabel('amount_desc')).toBe('Highest amount');
  });
});
