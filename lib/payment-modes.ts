import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Canonical payment modes — the single source of truth for the app.
 *
 * This must stay in step with `canonicalModes` in the backend's
 * `internal/http/payment_modes.go` and the `mode` enums in `openapi.yaml`.
 *
 * These drifted the same way the categories did in S2, and hid longer because
 * the two halves were in different files. The entry form offered five modes and
 * the API saved all five, but the filter sheet offered `Debit Card` — which is
 * not a mode, matches no row, and made the API answer 422 — while omitting
 * `Bank Account`, which 9 real entries used. A mode you can record but cannot
 * search for is worse than one you cannot record: the rows are there and the
 * app denies them.
 */
export const PAYMENT_MODES = [
  'Cash',
  'Bank Account',
  'UPI',
  'Credit Card',
  'Wallets',
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const DEFAULT_PAYMENT_MODE: PaymentMode = 'Cash';

export type PaymentModeVisual = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
};

/** One icon and colour per mode, keyed lowercase. */
export const PAYMENT_MODE_VISUALS: Record<string, PaymentModeVisual> = {
  cash: { icon: 'cash', color: '#2ECC71' },
  'bank account': { icon: 'bank-outline', color: '#42A5F5' },
  upi: { icon: 'cellphone-arrow-down', color: '#00D2B4' },
  'credit card': { icon: 'credit-card-outline', color: '#8257E5' },
  wallets: { icon: 'wallet-outline', color: '#FF9F43' },
};

const MODE_ALIASES: Record<string, PaymentMode> = {
  bank: 'Bank Account',
  'savings account': 'Bank Account',
  'saving account': 'Bank Account',
  netbanking: 'Bank Account',
  'net banking': 'Bank Account',
  wallet: 'Wallets',
  credit: 'Credit Card',
  card: 'Credit Card',
};

/** Resolves a raw value to its canonical mode, or null when unrecognised. */
export const resolvePaymentMode = (value?: string | null): PaymentMode | null => {
  const normalized = value?.toLowerCase().trim();
  if (!normalized) {
    return null;
  }
  const exact = PAYMENT_MODES.find((mode) => mode.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  return MODE_ALIASES[normalized] ?? null;
};

export const paymentModeVisual = (mode?: string | null): PaymentModeVisual => {
  const resolved = resolvePaymentMode(mode);
  return resolved
    ? PAYMENT_MODE_VISUALS[resolved.toLowerCase()]
    : { icon: 'help-circle-outline', color: '#90A4AE' };
};

/**
 * Income that almost always lands in a bank account. Salary is credited by
 * payroll, dividends by the registrar, interest by the bank itself — nobody
 * receives them in cash, so a form left on its Cash default for one of these
 * is a form the user has to correct every time.
 */
const BANK_CREDITED_INCOME = new Set(['salary', 'freelance', 'interest', 'dividend']);

/**
 * The mode a category's money usually moves by, or null when there is no
 * usual one and the form's own default should stand.
 */
export const usualModeForCategory = (
  category?: string | null,
  type?: string | null
): PaymentMode | null =>
  type?.toLowerCase() === 'income' && BANK_CREDITED_INCOME.has(category?.toLowerCase().trim() ?? '')
    ? 'Bank Account'
    : null;
