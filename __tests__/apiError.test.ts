import { getFriendlyErrorMessage, readApiError } from '@/lib/api-error';

describe('api error messages', () => {
  it('replaces Android fetch connection details with readable copy', () => {
    expect(
      getFriendlyErrorMessage(
        new Error('fetch failed: java.net.ConnectException: Failed to connect to /192.168.0.101:8080'),
        'Unable to load activity.',
      ),
    ).toBe("Can't reach Finnri right now. Check your internet connection and try again.");
  });

  it('replaces URLs and IP addresses instead of showing raw endpoints', () => {
    expect(
      getFriendlyErrorMessage(
        'Failed to connect to http://192.168.0.101:8080/v1/entries',
        'Unable to load activity.',
      ),
    ).toBe("Can't reach Finnri right now. Check your internet connection and try again.");
  });

  it('keeps readable product messages intact', () => {
    expect(
      getFriendlyErrorMessage(
        new Error('Incorrect PIN. 2 attempts remaining.'),
        'Login failed.',
      ),
    ).toBe('Incorrect PIN. 2 attempts remaining.');
  });
});

describe('entitlement responses', () => {
  const respond = (status: number, body: object) =>
    ({ status, text: async () => JSON.stringify(body) }) as unknown as Response;

  it('carries the free budget allowance when the server sends it (P22)', async () => {
    const error = await readApiError(
      respond(402, { error: 'payment_required', feature_code: 'budgets', feature_label: 'Budgets', free_limit: 1 }),
      'fallback'
    );
    expect(error.entitlement?.freeLimit).toBe(1);
  });

  it('leaves it unset for a feature that is simply locked', async () => {
    const error = await readApiError(
      respond(402, { error: 'payment_required', feature_code: 'exports', feature_label: 'Exports' }),
      'fallback'
    );
    expect(error.entitlement?.featureLabel).toBe('Exports');
    expect(error.entitlement?.freeLimit).toBeUndefined();
  });
});
