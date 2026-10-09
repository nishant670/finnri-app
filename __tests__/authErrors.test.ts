import { getFriendlyAuthErrorMessage, guestCheckin } from '@/lib/auth';

const response = (payload: unknown, status = 500) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  }) as unknown as Response;

describe('auth errors', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('replaces React Native network failures with user-friendly copy', () => {
    expect(
      getFriendlyAuthErrorMessage(
        new TypeError('Network request failed'),
        'Unable to continue as guest.',
      ),
    ).toBe("Can't reach Finnri right now. Check your connection and try again.");
  });

  it('keeps specific auth messages intact', () => {
    expect(
      getFriendlyAuthErrorMessage(
        new Error('Incorrect PIN. 2 attempts remaining.'),
        'Login failed.',
      ),
    ).toBe('Incorrect PIN. 2 attempts remaining.');
  });

  it('maps guest backend error codes to friendly copy', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ error: 'failed_create_guest' }));

    await expect(guestCheckin({ device_id: 'device-1' })).rejects.toThrow(
      'Could not continue as guest right now. Please try again.',
    );
  });
});
