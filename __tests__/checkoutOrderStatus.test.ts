import { fetchCheckoutOrderStatus } from '@/lib/billing';

/**
 * This is what tells "paid" apart from "looked at the price and came back".
 * Getting it wrong in the lenient direction told people a payment they never
 * made was still being confirmed.
 */
const respond = (status: number, body: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
};

describe('fetchCheckoutOrderStatus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the provider status back', async () => {
    respond(200, { status: 'captured' });
    await expect(fetchCheckoutOrderStatus('order_abc')).resolves.toBe('captured');
  });

  it('reports an unpaid order as created rather than guessing', async () => {
    respond(200, { status: 'created' });
    await expect(fetchCheckoutOrderStatus('order_abc')).resolves.toBe('created');
  });

  it('answers null when the order cannot be read', async () => {
    respond(404, { error: 'order_not_found' });
    await expect(fetchCheckoutOrderStatus('order_missing')).resolves.toBeNull();
  });

  it('answers null when the request itself fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(fetchCheckoutOrderStatus('order_abc')).resolves.toBeNull();
  });

  it('escapes the order id into the path', async () => {
    respond(200, { status: 'created' });
    await fetchCheckoutOrderStatus('order/../abc');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('order%2F..%2Fabc'));
  });
});
