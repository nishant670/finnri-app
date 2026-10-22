import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The payment method the last new entry was saved with, one per direction
 * (P9: new entries start on it). Someone who pays everything by UPI should not
 * have to change "Cash" on every expense.
 *
 * Read synchronously when a blank form opens, so it lives in memory and is
 * loaded from storage once, on first import.
 */
export type LastPayment = { mode: string; accountId: number | null };

type Direction = 'Expense' | 'Income';

const STORAGE_KEY = 'finnri_last_payment_v1';

let cache: Partial<Record<Direction, LastPayment>> = {};
let loaded: Promise<void> | null = null;

const directionOf = (type: string): Direction => (type === 'Income' ? 'Income' : 'Expense');

export const primeLastPayment = () => {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as typeof cache;
      if (parsed && typeof parsed === 'object') cache = { ...parsed, ...cache };
    })
    .catch(() => undefined);
  return loaded;
};

void primeLastPayment();

/** What a blank entry of this type should start on, if anything was saved before. */
export const lastPaymentFor = (type: string): LastPayment | null => cache[directionOf(type)] ?? null;

export const rememberLastPayment = (type: string, payment: LastPayment) => {
  if (!payment.mode) return;
  cache = { ...cache, [directionOf(type)]: payment };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => undefined);
};

/** Tests only. */
export const resetLastPaymentForTests = () => {
  cache = {};
  loaded = null;
};
