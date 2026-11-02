import { CURRENCY_SYMBOL } from '@/constants/Currency';

/**
 * The one place currency becomes text.
 *
 * Before this module there were eleven local `formatMoney` copies plus a dozen
 * inline `₹${x.toFixed(2)}` templates, so the same ₹18,000 rendered as
 * `₹18000.00` on one screen, `₹18,000` on another and `₹2,00,000` on a third.
 * Nothing outside this file may format an amount — the `no-restricted-syntax`
 * rules in `eslint.config.js` enforce that.
 */

/**
 * Amounts at or above this shed their paise. `₹18,000.00` reads as machine
 * output; `₹18,000` reads as money. Below it the paise are the point — a
 * ₹42.50 chai is not a ₹43 chai.
 */
export const PAISE_THRESHOLD = 100;

// Intl.NumberFormat construction is expensive and these two are the only
// shapes we ever need, so build them once. 'en-IN' is what gives the Indian
// 2-2-3 grouping: 2,00,000 rather than 200,000.
const wholeRupees = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const withPaise = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type MoneyValue = number | string | null | undefined;

/**
 * The minus sign every displayed amount carries: U+2212, not the hyphen.
 *
 * A hyphen is narrower than a digit and sits low, so `-₹2,781` looks like a
 * dash run into the rupee sign; the real minus is digit-width and centred on
 * the figures. Display only — anything a machine reads back (CSV, route
 * params, the API) keeps ASCII, which is why `toAmountString` never uses it.
 */
export const MINUS_SIGN = '\u2212';

export type FormatMoneyOptions = {
  /**
   * `auto` — negatives get a leading minus (default).
   * `never` — format the magnitude only; the caller draws its own sign.
   * `always` — every value carries a `+` or a minus.
   *
   * The minus is {@link MINUS_SIGN}, not a hyphen.
   */
  sign?: 'auto' | 'never' | 'always';
};

/** Coerce anything the API or a text input might hand us into a real number. */
export const toAmount = (value: MoneyValue): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[,\s]/g, '').replace(CURRENCY_SYMBOL, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/** Money as a number, rounded to the smallest unit that actually exists. */
export const roundToPaise = (value: MoneyValue): number =>
  Math.round(toAmount(value) * 100) / 100;

/**
 * Currency for display. `₹1,24,500`, `₹2,184`, `₹42.50`, `−₹99`.
 *
 * Paise appear only below ₹100, and only when there are paise to show — a flat
 * ₹42 stays `₹42`.
 */
export const formatMoney = (value: MoneyValue, options: FormatMoneyOptions = {}): string => {
  const { sign = 'auto' } = options;
  const numeric = roundToPaise(value);
  const magnitude = Math.abs(numeric);
  const showPaise = magnitude < PAISE_THRESHOLD && !Number.isInteger(magnitude);
  const digits = showPaise ? withPaise.format(magnitude) : wholeRupees.format(magnitude);

  let prefix = '';
  if (sign !== 'never') {
    if (numeric < 0) prefix = MINUS_SIGN;
    else if (sign === 'always') prefix = '+';
  }

  return `${prefix}${CURRENCY_SYMBOL}${digits}`;
};

const trimTrailingZero = (value: number) => value.toFixed(1).replace(/\.0$/, '');

/**
 * Currency squeezed into a stat chip: `₹2.8k`, `₹1.2L`, `₹3Cr`.
 *
 * Indian units, not Western ones — someone reading `₹1.2L` knows what they
 * spent; `₹120k` makes them do arithmetic. Anything under ₹1,000 falls through
 * to the full formatter, because there is nothing to save by abbreviating it.
 */
export const formatMoneyCompact = (value: MoneyValue): string => {
  const numeric = toAmount(value);
  const magnitude = Math.abs(numeric);
  const prefix = `${numeric < 0 ? MINUS_SIGN : ''}${CURRENCY_SYMBOL}`;

  if (magnitude >= 10000000) return `${prefix}${trimTrailingZero(magnitude / 10000000)}Cr`;
  if (magnitude >= 100000) return `${prefix}${trimTrailingZero(magnitude / 100000)}L`;
  if (magnitude >= 1000) return `${prefix}${trimTrailingZero(magnitude / 1000)}k`;
  return formatMoney(numeric);
};

/**
 * An amount as plain ungrouped digits — `"1234.50"`. For route params, API
 * payloads and anywhere else a machine reads it back. Never for display:
 * grouping separators would break `Number()` on the other side.
 */
export const toAmountString = (value: MoneyValue): string => roundToPaise(value).toFixed(2);

/**
 * The value a currency `TextInput` is seeded with. Same digits as
 * {@link toAmountString}, except zero comes back as `''` so a field starts
 * empty rather than showing a `0` the user has to delete first.
 */
export const toAmountInputValue = (value: MoneyValue): string => {
  const numeric = roundToPaise(value);
  return numeric === 0 ? '' : toAmountString(numeric);
};

/**
 * The value the amount keypad is seeded with — {@link toAmountInputValue}
 * without paise that are only zeros, so a ₹120 quick prompt opens as `120`
 * rather than `120.00` with two decimals already spent.
 */
export const toKeypadValue = (value: MoneyValue): string =>
  toAmountInputValue(value).replace(/\.00$/, '');

/**
 * Digits mid-typing, as the amount keypad displays them: `₹1,24,500`, `₹42.`,
 * `₹42.5`, `₹0`.
 *
 * This is the one money formatter that must not round or complete the paise.
 * `formatMoney('42.')` is ₹42 and `formatMoney('42.5')` is ₹42.50 — both
 * correct for a settled amount, both wrong under a caret, because they erase
 * the keystroke the user just made. Only the rupee part is grouped; whatever
 * follows the point is echoed back exactly as typed.
 */
export const formatAmountEntry = (raw: string): string => {
  const typed = (raw ?? '').replace(/[^\d.]/g, '');
  if (typed === '') {
    return `${CURRENCY_SYMBOL}0`;
  }
  const pointIndex = typed.indexOf('.');
  const rupees = pointIndex === -1 ? typed : typed.slice(0, pointIndex);
  const grouped = wholeRupees.format(Number(rupees || 0));
  if (pointIndex === -1) {
    return `${CURRENCY_SYMBOL}${grouped}`;
  }
  return `${CURRENCY_SYMBOL}${grouped}.${typed.slice(pointIndex + 1).replace(/\./g, '')}`;
};
