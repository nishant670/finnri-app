import {
  formatAmountEntry,
  formatMoney,
  formatMoneyCompact,
  MINUS_SIGN,
  roundToPaise,
  toAmount,
  toAmountInputValue,
  toAmountString,
  toKeypadValue,
} from '@/lib/money';

describe('formatMoney', () => {
  it('groups the Indian way, not the Western one', () => {
    // The audit found ₹2184.13 and ₹2,00,000 on adjacent screens.
    expect(formatMoney(200000)).toBe('₹2,00,000');
    expect(formatMoney(2184.13)).toBe('₹2,184');
    expect(formatMoney(10000000)).toBe('₹1,00,00,000');
  });

  it('drops paise at ₹100 and above', () => {
    // ₹18000.00 was the other offender: forced decimals on a large number.
    expect(formatMoney(18000)).toBe('₹18,000');
    expect(formatMoney(18000.4)).toBe('₹18,000');
    expect(formatMoney(100.99)).toBe('₹101');
  });

  it('keeps paise below ₹100, but only when there are any', () => {
    expect(formatMoney(42.5)).toBe('₹42.50');
    expect(formatMoney(9.05)).toBe('₹9.05');
    expect(formatMoney(42)).toBe('₹42');
    expect(formatMoney(0)).toBe('₹0');
  });

  it('rounds up across the paise threshold before deciding', () => {
    // 99.995 is not a sub-₹100 amount once it is money.
    expect(formatMoney(99.995)).toBe('₹100');
  });

  it('draws a real minus sign, not a hyphen', () => {
    // U+2212 is digit-width and sits on the figures' centre line; a hyphen is
    // narrower and lower, so `-₹2,781` reads as a dash run into the symbol.
    expect(formatMoney(-2781)).toBe(`${MINUS_SIGN}₹2,781`);
    expect(MINUS_SIGN).toBe('\u2212');
    expect(formatMoney(-2781)).not.toContain('-');
  });

  it('keeps machine-read amounts on ASCII', () => {
    expect(toAmountString(-2781)).toBe('-2781.00');
  });

  it('honours the requested sign convention', () => {
    expect(formatMoney(-1500)).toBe('\u2212₹1,500');
    expect(formatMoney(-1500, { sign: 'never' })).toBe('₹1,500');
    expect(formatMoney(1500, { sign: 'always' })).toBe('+₹1,500');
    expect(formatMoney(-1500, { sign: 'always' })).toBe('\u2212₹1,500');
    expect(formatMoney(0, { sign: 'always' })).toBe('+₹0');
  });

  it('survives the shapes the API actually sends', () => {
    expect(formatMoney('2500.50')).toBe('₹2,501');
    expect(formatMoney('1,250')).toBe('₹1,250');
    expect(formatMoney(null)).toBe('₹0');
    expect(formatMoney(undefined)).toBe('₹0');
    expect(formatMoney(Number.NaN)).toBe('₹0');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('₹0');
  });
});

describe('formatMoneyCompact', () => {
  it('abbreviates in lakh and crore, not thousands of thousands', () => {
    expect(formatMoneyCompact(2800)).toBe('₹2.8k');
    expect(formatMoneyCompact(120000)).toBe('₹1.2L');
    expect(formatMoneyCompact(30000000)).toBe('₹3Cr');
  });

  it('trims a pointless trailing zero', () => {
    expect(formatMoneyCompact(2000)).toBe('₹2k');
    expect(formatMoneyCompact(100000)).toBe('₹1L');
  });

  it('falls through to the full formatter under ₹1,000', () => {
    expect(formatMoneyCompact(999)).toBe('₹999');
    expect(formatMoneyCompact(42.5)).toBe('₹42.50');
  });

  it('keeps the sign on the outside of the symbol', () => {
    expect(formatMoneyCompact(-2800)).toBe('\u2212₹2.8k');
  });
});

describe('machine-readable amounts', () => {
  it('toAmountString never groups', () => {
    expect(toAmountString(200000)).toBe('200000.00');
    expect(toAmountString(0)).toBe('0.00');
    expect(toAmountString('1,250.5')).toBe('1250.50');
  });

  it('toAmountInputValue leaves a zero field empty', () => {
    expect(toAmountInputValue(0)).toBe('');
    expect(toAmountInputValue(null)).toBe('');
    expect(toAmountInputValue(1234.5)).toBe('1234.50');
  });

  it('roundToPaise stops floating point from leaking into a split', () => {
    expect(roundToPaise(100 / 3)).toBe(33.33);
    expect(roundToPaise(0.1 + 0.2)).toBe(0.3);
  });

  it('toAmount strips what a user or the API might wrap a number in', () => {
    expect(toAmount('₹1,250.75')).toBe(1250.75);
    expect(toAmount('nonsense')).toBe(0);
  });

  it('toKeypadValue drops paise that are only zeros', () => {
    expect(toKeypadValue(120)).toBe('120');
    expect(toKeypadValue('120.00')).toBe('120');
    expect(toKeypadValue(42.5)).toBe('42.50');
    expect(toKeypadValue(0)).toBe('');
  });
});

describe('formatAmountEntry', () => {
  it('groups the rupees and echoes the paise exactly as typed', () => {
    expect(formatAmountEntry('124500')).toBe('₹1,24,500');
    expect(formatAmountEntry('42')).toBe('₹42');
    expect(formatAmountEntry('42.5')).toBe('₹42.5');
  });

  it('keeps a bare decimal point, which formatMoney would swallow', () => {
    // The user has committed to paise and not typed them yet; rounding the
    // point away here would undo the keystroke as it happens.
    expect(formatAmountEntry('42.')).toBe('₹42.');
    expect(formatMoney('42.')).toBe('₹42');
  });

  it('shows a zero placeholder for an untouched field', () => {
    expect(formatAmountEntry('')).toBe('₹0');
  });
});
