const fetchMock = jest.fn();

describe('pushTapDestination', () => {
  const { pushTapDestination } = require('@/lib/push-tap');

  it('opens the same screen as the notification list does', () => {
    expect(pushTapDestination({ type: 'billing.pass.gifted', action_url: '/billing' })).toBe('/billing');
    expect(pushTapDestination({ type: 'budget.exceeded', action_url: '/notifications' })).toBe('/budgets');
    expect(pushTapDestination({ type: 'split.settlement.recorded', action_url: '/split/settlements/4' })).toBe('/(tabs)/split');
    expect(pushTapDestination({ type: 'split.group_invite.received', action_url: '/invite/split/abc' })).toEqual({
      pathname: '/invite/split/[token]',
      params: { token: 'abc' },
    });
  });

  it('falls back to the list', () => {
    expect(pushTapDestination({ action_url: '/subscription-occurrences/9' })).toBe('/notifications');
    expect(pushTapDestination(undefined)).toBe('/notifications');
  });
});

describe('opening a tapped push', () => {
  const load = () => {
    let tap!: typeof import('@/lib/push-tap');
    jest.isolateModules(() => {
      tap = require('@/lib/push-tap');
    });
    return tap;
  };

  it('holds a tap made during launch until the app is open', () => {
    const tap = load();
    const open = jest.fn();
    tap.openPushDestination('/billing', open);
    expect(open).not.toHaveBeenCalled();
    tap.markAppOpen(open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('/billing');
  });

  it('drops a held tap when the person leaves the PIN screen another way', () => {
    const tap = load();
    const open = jest.fn();
    tap.openPushDestination('/billing', open);
    tap.markAppOpen();
    tap.markAppOpen(open);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens straight away once the app is open', () => {
    const tap = load();
    const open = jest.fn();
    tap.markAppOpen(open);
    expect(open).not.toHaveBeenCalled();
    tap.openPushDestination('/billing', open);
    expect(open).toHaveBeenCalledWith('/billing');
  });

  it('handles the same tap once', () => {
    const tap = load();
    expect(tap.isNewPushTap('a')).toBe(true);
    expect(tap.isNewPushTap('a')).toBe(false);
    expect(tap.isNewPushTap('b')).toBe(true);
  });
});

describe('unregisterPushDevice', () => {
  const load = () => {
    let device!: typeof import('@/lib/push-device');
    jest.isolateModules(() => {
      device = require('@/lib/push-device');
    });
    return device;
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('removes the registered token from the account, once', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const device = load();
    device.rememberRegisteredPushToken('ExponentPushToken[a]');

    await device.unregisterPushDevice('session');
    await device.unregisterPushDevice('session');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/push-devices');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBe(JSON.stringify({ token: 'ExponentPushToken[a]' }));
  });

  it('never stops a logout when offline', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const device = load();
    device.rememberRegisteredPushToken('ExponentPushToken[a]');
    await expect(device.unregisterPushDevice('session')).resolves.toBeUndefined();
  });

  it('does nothing when this phone never registered', async () => {
    await load().unregisterPushDevice('session');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
