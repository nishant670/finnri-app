import { describeLoggedBy, entryMonthRange } from '@/lib/transaction-links';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('How an entry was logged (P14)', () => {
  it('quotes the words for voice and typed entries', () => {
    expect(describeLoggedBy('voice', ' paid 50 for ironing ')).toMatchObject({
      label: 'Logged by voice',
      words: 'paid 50 for ironing',
    });
    expect(describeLoggedBy('text', 'tea 20')?.label).toBe('Typed to Finnri');
  });

  it('names a bill photo or an automatic entry without quoting anything', () => {
    expect(describeLoggedBy('receipt', 'OCR text')).toMatchObject({
      label: 'Read from a bill photo',
      words: '',
    });
    expect(describeLoggedBy('recurring', '')?.label).toBe('Added by a recurring payment');
  });

  it('says nothing for a manual entry', () => {
    expect(describeLoggedBy('manual', '')).toBeNull();
    expect(describeLoggedBy(undefined, undefined)).toBeNull();
  });
});

describe("The entry's month, for its category link (P16)", () => {
  it('spans the whole calendar month', () => {
    expect(entryMonthRange('2026-10-11')).toEqual({
      label: 'October',
      start: '2026-10-01',
      end: '2026-10-31',
    });
  });
});
