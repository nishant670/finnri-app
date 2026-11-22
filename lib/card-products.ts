import { readApiError } from './api-error';
import type { CardProductSummary } from './accounts';
import { API_BASE_URL } from './transactions';

/**
 * A real card a bank sells, from the card catalogue
 * (docs/CREDIT_CARD_SYSTEM_PLAN_2026-11-13.md §5). Add card offers a bank's
 * products so the card can be drawn as its sketch and named exactly.
 */
export type CardProduct = CardProductSummary & {
  joining_fee?: number | null;
  annual_fee?: number | null;
  fee_waiver_spend?: number | null;
  source_urls?: string[];
  last_verified_at?: string | null;
  sort_order?: number;
};

// The catalogue changes a few times a year; one fetch per bank per app run
// keeps the picker instant when someone goes back and forth between banks.
const cache = new Map<string, Promise<CardProduct[]>>();

export function fetchCardProducts(token: string, issuer: string): Promise<CardProduct[]> {
  const key = issuer.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const request = (async () => {
    const response = await fetch(
      `${API_BASE_URL}/v1/card-products?${new URLSearchParams({ issuer: key }).toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw await readApiError(response, 'Unable to load cards for this bank right now.');
    }
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as CardProduct[]) : [];
  })();
  cache.set(key, request);
  // A failed request is not remembered, so the next visit tries again.
  request.catch(() => cache.delete(key));
  return request;
}

/** For tests. */
export function clearCardProductCache() {
  cache.clear();
}
