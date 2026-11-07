import { useEffect, useState } from 'react';

import { fetchPaymentSuggestion, type PaymentSuggestionResult } from '@/lib/payment-rules';

/**
 * Asks the API which account usually pays for what the form describes, a
 * moment after the title, merchant or tag stops changing.
 *
 * Returns null until the first answer. A lookup that fails keeps the previous
 * answer rather than reporting "no suggestion", so a dropped request never
 * takes back an account the form already picked. A form with nothing to go on
 * answers empty.
 */
export function usePaymentSuggestion({
  enabled,
  token,
  type,
  title,
  merchant,
  tag,
}: {
  enabled: boolean;
  token?: string | null;
  type: string;
  title: string;
  merchant: string;
  tag: string;
}): PaymentSuggestionResult | null {
  const [result, setResult] = useState<PaymentSuggestionResult | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setResult(null);
      return;
    }
    if (!title.trim() && !merchant.trim() && !tag.trim()) {
      setResult({ suggestion: null, kind: null });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchPaymentSuggestion(token, { type, title, merchant, tag }, controller.signal).then(
        (next) => {
          if (next && !controller.signal.aborted) setResult(next);
        }
      );
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, token, type, title, merchant, tag]);

  return result;
}
