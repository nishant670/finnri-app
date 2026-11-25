/** The rules in `lib/tray-save.ts` that the tray screen tests don't reach. */
import { ApiError } from '@/lib/api-error';
import { createEntry, cancelEntryKey } from '@/lib/entries';
import { createDefaultEntryForm } from '@/lib/home-capture';
import { createSubscription } from '@/lib/subscriptions';
import {
  finishBeforeSaving,
  sendTraySave,
  totalSaveKey,
  type TraySaveRequest,
  type UnconfirmedSave,
} from '@/lib/tray-save';
import { resolveAttachmentForSave } from '@/lib/uploads';

jest.mock('@/lib/entries', () => ({ createEntry: jest.fn(), cancelEntryKey: jest.fn() }));
jest.mock('@/lib/subscriptions', () => ({ createSubscription: jest.fn() }));
jest.mock('@/lib/emi-plans', () => ({ createCardEMIPlan: jest.fn() }));
jest.mock('@/lib/uploads', () => ({ resolveAttachmentForSave: jest.fn() }));

const create = createEntry as jest.Mock;
const cancel = cancelEntryKey as jest.Mock;
const subscribe = createSubscription as jest.Mock;
const upload = resolveAttachmentForSave as jest.Mock;

const request = (overrides: Partial<TraySaveRequest['form']> = {}): TraySaveRequest => ({
  key: 'row-1',
  rowKeys: ['row-1'],
  form: {
    ...createDefaultEntryForm(),
    date: '18 November 2026',
    title: 'Rent',
    amount: '500',
    ...overrides,
  },
  account: null,
  source: 'text',
  sourceText: 'rent 500',
  aiRequestId: null,
  refund: null,
});

const repeatingRequest = () =>
  request({
    subscriptionEnabled: true,
    subscriptionBillingInterval: 'monthly',
    subscriptionName: 'Rent',
    subscriptionAmount: '500',
    subscriptionNextDueDate: '2026-12-18',
  });

const tray = () => {
  const unconfirmed = { current: [] as UnconfirmedSave[] };
  /** What a restart would read back. */
  const disk: string[] = [];
  return {
    token: 't',
    batchId: 'day-1',
    unconfirmed,
    disk,
    persist: async () => {
      disk.push(JSON.stringify(unconfirmed.current));
      return true;
    },
    onSaved: jest.fn(),
  };
};

const dialog = () => ({
  confirm: jest.fn(async () => true),
  alert: jest.fn(async (_: { message: string }) => undefined),
});

beforeEach(() => {
  jest.resetAllMocks();
  upload.mockImplementation(async (_token: string, value: string | null) => value);
  create.mockResolvedValue({ id: 1 });
  // A server that can't cancel keys, unless a test says otherwise.
  cancel.mockResolvedValue({ state: 'unknown' });
});

describe('totalSaveKey', () => {
  it('depends on which rows a total holds, not their order', () => {
    expect(totalSaveKey(['a', 'b'])).toBe(totalSaveKey(['b', 'a']));
    expect(totalSaveKey(['a', 'b'])).not.toBe(totalSaveKey(['a', 'c']));
    expect(totalSaveKey(['a'])).toBe('a');
    const ten = Array.from({ length: 10 }, (_, index) => `day-mf3k2abc-${index}`);
    expect(`day-mf3k2abc-q1w2e3-${totalSaveKey(ten)}:refund`.length).toBeLessThanOrEqual(128);
  });
});

describe('sendTraySave', () => {
  it('is on disk before it is sent, and gone once it is saved', async () => {
    const t = tray();
    create.mockImplementation(async () => {
      expect(JSON.parse(t.disk.at(-1) as string)).toHaveLength(1);
      return { id: 1 };
    });
    await sendTraySave({ ...t, request: request() });
    expect(create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(t.disk.at(-1) as string)).toHaveLength(0);
  });

  it('forgets a first send the server refuses, and keeps one that failed for any other reason', async () => {
    const t = tray();
    create.mockRejectedValueOnce(new ApiError('rate limited', 429));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    expect(t.unconfirmed.current).toHaveLength(0);

    create.mockRejectedValueOnce(new ApiError('bad gateway', 502));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    expect(t.unconfirmed.current).toHaveLength(1);
  });

  it('keeps a refused resend until the server says it was never saved', async () => {
    const t = tray();
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    // Neither a passing refusal nor a lasting one proves the first send missed.
    for (const status of [401, 429, 422]) {
      create.mockRejectedValueOnce(new ApiError('no', status));
      await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
      expect(t.unconfirmed.current).toHaveLength(1);
    }
    cancel.mockResolvedValue({ state: 'cancelled' });
    create.mockRejectedValueOnce(new ApiError('invalid', 422));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    expect(t.unconfirmed.current).toHaveLength(0);
  });

  it('sends under a new key when the old one was cancelled, recording it first', async () => {
    const t = tray();
    const cancelled = new ApiError('cancelled', 409, 'entry_key_cancelled');
    create.mockRejectedValueOnce(cancelled).mockRejectedValueOnce(cancelled);
    create.mockImplementationOnce(async (_token, _payload, key) => {
      expect(JSON.parse(t.disk.at(-1) as string)[0].idempotencyKey).toBe(key);
      return { id: 1 };
    });
    await sendTraySave({ ...t, request: request() });
    expect(create.mock.calls.map((call) => call[2])).toEqual([
      'day-1-row-1',
      'day-1-row-1~2',
      'day-1-row-1~3',
    ]);
    expect(t.unconfirmed.current).toHaveLength(0);
  });

  it('sends nothing it could not write down, and keeps what had already gone out', async () => {
    const t = tray();
    await expect(
      sendTraySave({ ...t, persist: async () => false, request: request() })
    ).rejects.toThrow(/wasn't sent/);
    expect(create).not.toHaveBeenCalled();
    expect(t.unconfirmed.current).toHaveLength(0);

    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    await expect(
      sendTraySave({ ...t, persist: async () => false, request: request() })
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.unconfirmed.current).toHaveLength(1);
  });

  it('never sends a key with anything but what it first went with', async () => {
    const t = tray();
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    await sendTraySave({ ...t, request: request({ amount: '900' }) });
    expect(create.mock.calls[1][1].amount).toBe('500');
    expect(create.mock.calls[1][2]).toBe(create.mock.calls[0][2]);
  });

  it('resends with the receipt already uploaded', async () => {
    const t = tray();
    upload.mockImplementationOnce(async () => '/uploads/abc.jpg');
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    const withPhoto = request({ attachment: 'file://photo.jpg' });
    await expect(sendTraySave({ ...t, request: withPhoto })).rejects.toThrow();
    await sendTraySave({ ...t, request: withPhoto });
    expect(upload.mock.calls[1][1]).toBe('/uploads/abc.jpg');
  });

  it('keeps nothing when the photo upload fails, since no transaction was sent', async () => {
    const t = tray();
    upload.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(
      sendTraySave({ ...t, request: request({ attachment: 'file://p.jpg' }) })
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(t.unconfirmed.current).toHaveLength(0);
  });
});

describe('finishBeforeSaving', () => {
  const repeating = () =>
    request({
      subscriptionEnabled: true,
      subscriptionBillingInterval: 'monthly',
      subscriptionName: 'Rent',
      subscriptionAmount: '500',
      subscriptionNextDueDate: '2026-12-18',
    });

  it('lets go of a save whose repeat keeps failing, without saving the transaction again', async () => {
    const t = tray();
    subscribe.mockRejectedValue(new ApiError('invalid', 422));
    await expect(sendTraySave({ ...t, request: repeating() })).rejects.toThrow();
    // Refused later step, saved transaction: still held.
    expect(t.unconfirmed.current[0].progress.entry).toBeTruthy();

    // After a restart, from what was on disk.
    t.unconfirmed.current = JSON.parse(t.disk.at(-1) as string);
    const ask = dialog();
    const outcome = await finishBeforeSaving({
      ...t,
      dialog: ask,
      planned: [request({ amount: '900' })],
    });

    expect(outcome).toBe('step-missed');
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.onSaved).toHaveBeenCalledTimes(1);
    expect(t.unconfirmed.current).toHaveLength(0);
    expect(ask.alert.mock.calls[0][0].message).toContain('may be missing');
  });

  it('does nothing when the person goes back', async () => {
    const t = tray();
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    const ask = dialog();
    ask.confirm.mockResolvedValue(false);
    expect(
      await finishBeforeSaving({ ...t, dialog: ask, planned: [request({ amount: '900' })] })
    ).toBe('declined');
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.unconfirmed.current).toHaveLength(1);
  });

  it('keeps the save and throws while it still can’t tell', async () => {
    const t = tray();
    create.mockRejectedValue(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    await expect(
      finishBeforeSaving({ ...t, dialog: dialog(), planned: [request({ amount: '900' })] })
    ).rejects.toThrow();
    expect(t.unconfirmed.current).toHaveLength(1);
  });

  it('leaves alone a save that shares no row with what is being saved', async () => {
    const t = tray();
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    const other = { ...request(), key: 'row-2', rowKeys: ['row-2'] };
    const ask = dialog();
    expect(await finishBeforeSaving({ ...t, dialog: ask, planned: [other] })).toBe('clear');
    expect(ask.confirm).not.toHaveBeenCalled();
  });
});

describe('settling a save by cancelling its key', () => {
  const unsent = async (t: ReturnType<typeof tray>, wanted = request()) => {
    create.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendTraySave({ ...t, request: wanted })).rejects.toThrow();
  };
  const changed = () => [request({ amount: '900' })];

  it('cancels the very key the save was sent with', async () => {
    const t = tray();
    await unsent(t);
    cancel.mockResolvedValue({ state: 'cancelled' });
    await finishBeforeSaving({ ...t, dialog: dialog(), planned: changed() });
    expect(cancel).toHaveBeenCalledWith('t', create.mock.calls[0][2]);
  });

  it('drops one the server cancelled, without asking or sending', async () => {
    const t = tray();
    await unsent(t);
    cancel.mockResolvedValue({ state: 'cancelled' });
    const ask = dialog();
    expect(await finishBeforeSaving({ ...t, dialog: ask, planned: changed() })).toBe('clear');
    expect(ask.confirm).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.onSaved).not.toHaveBeenCalled();
    expect(JSON.parse(t.disk.at(-1) as string)).toHaveLength(0);
  });

  it('does not send or ask about one the server has', async () => {
    const t = tray();
    await unsent(t);
    cancel.mockResolvedValue({ state: 'saved', entry: { id: 7 } });
    const ask = dialog();
    expect(await finishBeforeSaving({ ...t, dialog: ask, planned: changed() })).toBe('finished');
    expect(ask.confirm).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.onSaved.mock.calls[0][0].progress.entry).toEqual({ id: 7 });
  });

  it('still runs the later steps of one the server has', async () => {
    const t = tray();
    await unsent(
      t,
      request({
        subscriptionEnabled: true,
        subscriptionBillingInterval: 'monthly',
        subscriptionName: 'Rent',
        subscriptionAmount: '500',
        subscriptionNextDueDate: '2026-12-18',
      })
    );
    cancel.mockResolvedValue({ state: 'saved', entry: { id: 7 } });
    await finishBeforeSaving({ ...t, dialog: dialog(), planned: changed() });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not give up a refused resend the server turns out to have', async () => {
    const t = tray();
    await unsent(t);
    create.mockRejectedValueOnce(new ApiError('account gone', 422));
    cancel.mockResolvedValue({ state: 'saved', entry: { id: 7 } });
    await expect(sendTraySave({ ...t, request: request() })).rejects.toThrow();
    expect(t.unconfirmed.current[0].progress.entry).toEqual({ id: 7 });
    // The next press finishes it without another create.
    await sendTraySave({ ...t, request: request() });
    expect(create).toHaveBeenCalledTimes(2);
    expect(t.unconfirmed.current).toHaveLength(0);
  });
});

describe('a request that is never answered', () => {
  afterEach(() => jest.useRealTimers());
  const never = () => new Promise<never>(() => undefined);

  /** Resolves with how `work` ended once the deadline has long passed. */
  const afterTheDeadline = async (work: Promise<unknown>) => {
    let outcome = 'still waiting';
    void work.then(
      () => (outcome = 'saved'),
      (error: Error) => (outcome = error.message)
    );
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    return outcome;
  };

  it('gives up on the transaction, keeping it to be settled', async () => {
    jest.useFakeTimers();
    const t = tray();
    create.mockImplementation(never);
    expect(await afterTheDeadline(sendTraySave({ ...t, request: request() }))).toMatch(/in time/);
    expect(t.unconfirmed.current).toHaveLength(1);
  });

  it('gives up on the receipt upload, keeping nothing', async () => {
    jest.useFakeTimers();
    const t = tray();
    upload.mockImplementation(never);
    const withPhoto = request({ attachment: 'file://p.jpg' });
    expect(await afterTheDeadline(sendTraySave({ ...t, request: withPhoto }))).toMatch(/in time/);
    expect(create).not.toHaveBeenCalled();
    expect(t.unconfirmed.current).toHaveLength(0);
  });

  it('gives up on a later step', async () => {
    jest.useFakeTimers();
    const t = tray();
    subscribe.mockImplementation(never);
    const work = sendTraySave({ ...t, request: repeatingRequest() });
    expect(await afterTheDeadline(work)).toMatch(/in time/);
    expect(t.unconfirmed.current[0].progress.entry).toBeTruthy();
  });
});

describe('when the phone stops recording partway', () => {
  // A later step can remove the entry (an EMI conversion does), so it must not
  // run while the disk still says the transaction may not have been saved.
  it('runs no later step it could not first record the transaction for', async () => {
    const t = tray();
    let writes = 0;
    await expect(
      sendTraySave({ ...t, persist: async () => (writes += 1) === 1, request: repeatingRequest() })
    ).rejects.toThrow(/record/);
    expect(subscribe).not.toHaveBeenCalled();
    expect(t.unconfirmed.current[0].progress.entry).toBeTruthy();
    // With the disk back, the same press finishes it without another create.
    await sendTraySave({ ...t, request: repeatingRequest() });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
