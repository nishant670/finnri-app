import { friendBalanceWhere } from '@/components/split/split-utils';

describe('friendBalanceWhere', () => {
  it('names the group only when the whole balance is in it', () => {
    expect(friendBalanceWhere(3100, [{ name: 'Goa Trip', balance: 3100 }])).toBe(' in "Goa Trip"');
  });

  it('calls it a total when some of it was split outside any group', () => {
    // 2026-11-23: ₹3,100 in Goa Trip plus an ₹800 dinner split outside it.
    expect(friendBalanceWhere(3900, [{ name: 'Goa Trip', balance: 3100 }])).toBe(' in total');
  });

  it('counts groups when it is spread across several', () => {
    expect(
      friendBalanceWhere(500, [
        { name: 'Goa Trip', balance: 800 },
        { name: 'Flat', balance: -300 },
      ])
    ).toBe(' across 2 groups');
  });

  it('ignores settled groups and says nothing for money outside groups only', () => {
    expect(friendBalanceWhere(800, [{ name: 'Goa Trip', balance: 0 }])).toBe('');
    expect(friendBalanceWhere(800, [])).toBe('');
  });

  it('works the same when you owe them', () => {
    expect(friendBalanceWhere(-1200, [{ name: 'Flat', balance: -1200 }])).toBe(' in "Flat"');
    expect(friendBalanceWhere(-1500, [{ name: 'Flat', balance: -1200 }])).toBe(' in total');
  });
});
