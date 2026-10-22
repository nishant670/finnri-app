import { MONEY_SEGMENTS, isMoneySegment } from '@/components/money/MoneySegments';

describe('isMoneySegment', () => {
  it('accepts the segments and nothing else', () => {
    MONEY_SEGMENTS.forEach((segment) => expect(isMoneySegment(segment)).toBe(true));
    // A deep link carries this in a query string, so anything can arrive.
    expect(isMoneySegment('tools')).toBe(false);
    expect(isMoneySegment(undefined)).toBe(false);
    expect(isMoneySegment(3)).toBe(false);
  });
});
