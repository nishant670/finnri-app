import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import {
  MAX_BILLS_PER_BATCH,
  affordableBills,
  batchSummary,
  billCheckLabel,
  billItemsFromUris,
  billNeedsAttention,
  createBatchId,
  flagBatchDuplicates,
  ledgerDuplicateLabel,
  mergeBillsIntoOne,
  nextBillsToRead,
  roomForMoreBills,
  spendableCredits,
  tickAffordable,
  type BillItem,
} from '@/lib/bill-batch';
import { createDefaultEntryForm } from '@/lib/home-capture';

const form = (overrides: Partial<EntryForm>): EntryForm => ({
  ...createDefaultEntryForm(),
  date: '12 Nov 2026',
  ...overrides,
});

const readBill = (key: string, overrides: Partial<EntryForm>, item: Partial<BillItem> = {}): BillItem => ({
  key,
  uri: `file:///${key}.jpg`,
  included: true,
  status: 'read',
  form: form(overrides),
  creditsCharged: 25,
  ...item,
});

describe('bill batch', () => {
  it('makes a batch id the API accepts', () => {
    expect(createBatchId(1763000000000, 0.5)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('starts every photo ticked and waiting, and caps the scan at five', () => {
    const items = billItemsFromUris(['a', 'b']);
    expect(items.map((item) => [item.included, item.status])).toEqual([
      [true, 'waiting'],
      [true, 'waiting'],
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
    expect(MAX_BILLS_PER_BATCH).toBe(5);
    expect(roomForMoreBills(items)).toBe(3);
    expect(roomForMoreBills(billItemsFromUris(['1', '2', '3', '4', '5', '6']))).toBe(0);
  });

  it('reads two at a time and skips unticked photos', () => {
    const items = billItemsFromUris(['a', 'b', 'c', 'd']);
    items[1] = { ...items[1], included: false };
    expect(nextBillsToRead(items)).toEqual([items[0].key, items[2].key]);
    items[0] = { ...items[0], status: 'reading' };
    expect(nextBillsToRead(items)).toEqual([items[2].key]);
    items[2] = { ...items[2], status: 'reading' };
    expect(nextBillsToRead(items)).toEqual([]);
  });

  it('works out what the credits cover (P102)', () => {
    const credits = (total: number, daily: number, limit: number) => ({
      credits: {
        total_credits_remaining: total,
        daily_credits_remaining: daily,
        daily_limit: limit,
      },
    }) as never;
    expect(spendableCredits(null)).toBeNull();
    expect(spendableCredits(credits(340, 0, 0))).toBe(340);
    expect(spendableCredits(credits(340, 60, 500))).toBe(60);
    expect(affordableBills(60, 25, 4)).toBe(2);
    expect(affordableBills(null, 25, 4)).toBe(4);
    expect(affordableBills(10, 25, 4)).toBe(0);

    const items = billItemsFromUris(['a', 'b', 'c', 'd']);
    const ticked = tickAffordable(items, 2);
    expect(ticked.map((item) => item.included)).toEqual([true, true, false, false]);
    expect(tickAffordable(ticked, 2)).toBe(ticked);
  });

  it('sums only ticked, read bills and counts what needs fixing', () => {
    const items: BillItem[] = [
      readBill('dmart', { title: 'DMart', amount: '1480' }),
      readBill('apollo', { title: 'Apollo Pharmacy', amount: '540' }),
      readBill('zomato', { title: 'Zomato', amount: '386' }, { included: false }),
      { key: 'blurry', uri: 'x', included: true, status: 'failed', creditsCharged: 0 },
      { key: 'next', uri: 'y', included: true, status: 'reading' },
      readBill('chai', { title: 'Chai Point', amount: '' }),
    ];
    const summary = batchSummary(items);
    expect(summary.toSave).toBe(3);
    expect(summary.total).toBe(2020);
    expect(summary.creditsUsed).toBe(100);
    expect(summary.failed).toBe(1);
    expect(summary.reading).toBe(1);
    expect(summary.ticked).toBe(5);
    expect(summary.read).toBe(4);
    expect(summary.needingAttention).toBe(1);
    expect(billNeedsAttention(items[5])).toMatch(/No total/);
    expect(billNeedsAttention(items[0])).toBeNull();
  });

  it('flags the second photo of the same payment and unticks it (P99)', () => {
    const items = flagBatchDuplicates([
      readBill('bill', { title: 'Apollo Pharmacy', amount: '540' }),
      readBill('upi', { title: 'Apollo', amount: '540.00' }),
      readBill('other', { title: 'DMart', amount: '540', date: '11 Nov 2026' }),
    ]);
    expect(items[0].duplicate).toBeUndefined();
    expect(items[1]).toMatchObject({
      included: false,
      duplicate: { kind: 'batch', label: 'Same as Apollo Pharmacy above' },
    });
    expect(items[2].duplicate).toBeUndefined();
  });

  it('labels a ledger match by its time when it has one', () => {
    expect(ledgerDuplicateLabel({ timeLabel: '1:12 pm', dateLabel: '12 Nov' })).toBe(
      'Already logged at 1:12 pm'
    );
    expect(ledgerDuplicateLabel({ dateLabel: '12 Nov' })).toBe('Already logged on 12 Nov');
  });

  it('shows the one field worth checking', () => {
    const bill = readBill('apollo', { title: 'Apollo' }, {
      aiReview: { needsConfirmation: { date: true, category: true } },
    });
    expect(billCheckLabel(bill)).toBe('Date unclear, check it');
    expect(billCheckLabel(readBill('ok', {}))).toBeNull();
  });

  it('folds ticked bills into one total led by the bigger bill (P100)', () => {
    const merged = mergeBillsIntoOne([
      readBill('apollo', {
        title: 'Apollo Pharmacy',
        amount: '540',
        category: 'Health',
        mode: 'Cash',
      }),
      readBill('dmart', {
        title: 'DMart',
        amount: '1480',
        category: 'Shopping',
        mode: 'UPI',
        merchant: 'DMart',
        attachment: 'file:///dmart.jpg',
        splitEnabled: true,
      }),
      readBill('zomato', { title: 'Zomato', amount: '386' }, { included: false }),
    ]);
    expect(merged).toMatchObject({
      title: 'Apollo Pharmacy + DMart',
      amount: '2020',
      category: 'Shopping',
      mode: 'UPI',
      merchant: '',
      attachment: 'file:///dmart.jpg',
      splitEnabled: false,
      subscriptionEnabled: false,
    });
    expect(merged?.notes).toContain('Apollo Pharmacy');
    expect(merged?.notes).toContain('DMart');
    expect(merged?.notes).not.toContain('Zomato');
    expect(mergeBillsIntoOne([])).toBeNull();
  });

  it('names three or more bills by the first one', () => {
    const merged = mergeBillsIntoOne([
      readBill('a', { title: 'DMart', amount: '100' }),
      readBill('b', { title: 'Apollo', amount: '200' }),
      readBill('c', { title: 'Chai', amount: '50' }),
    ]);
    expect(merged?.title).toBe('DMart + 2 more');
    expect(merged?.amount).toBe('350');
  });
});
