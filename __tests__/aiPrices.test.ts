import { aiPriceRows } from '@/lib/ai-prices';
import type { BillingStatus } from '@/lib/billing';

const status = (capture_credits?: BillingStatus['credits']['capture_credits']) =>
  ({ credits: { capture_credits } }) as Pick<BillingStatus, 'credits'>;

describe('aiPriceRows', () => {
  it('lists every AI read at the price the server sends', () => {
    const rows = aiPriceRows(
      status({
        text: 5,
        voice: 12,
        voice_max: 18,
        receipt: 25,
        statement_pdf: 50,
        statement_screenshots: 100,
      })
    );
    expect(rows.map((row) => [row.key, row.price])).toEqual([
      ['text', '5 credits'],
      ['voice', '12–18 credits'],
      ['receipt', '25 credits'],
      ['statement_pdf', '50 credits'],
      ['statement_screenshots', '100 credits'],
    ]);
  });

  it('leaves out statement prices an older API does not send, instead of guessing', () => {
    const rows = aiPriceRows(status({ text: 5, voice: 12, receipt: 25 }));
    expect(rows.map((row) => row.key)).toEqual(['text', 'voice', 'receipt']);
    expect(rows[1].price).toBe('12 credits');
  });

  it('falls back to the known capture prices while billing status is unknown', () => {
    expect(aiPriceRows(null).map((row) => row.price)).toEqual(['5 credits', '12 credits', '25 credits']);
  });
});
