/**
 * ENG-13: whatever fails, and however the person retries, the ledger must end
 * up holding every rupee of the tray exactly once.
 *
 * The real tray runs against a fake `POST /v1/entries` that replays an
 * Idempotency-Key the way the API does: the old entry comes back, whatever the
 * new payload says.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import DayBatchScreen from '@/app/batch';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { loadDayBatch, saveDayBatch } from '@/lib/batch-store';
import { createDefaultEntryForm } from '@/lib/home-capture';
import type { ParseBatchItem } from '@/lib/parse';
import type { DayItem } from '@/lib/voice-batch';

import { createFakeLedger } from '../test-support/fakeLedger';

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));

const mockDialog = {
  confirm: jest.fn(async (_options: unknown) => true),
  alert: jest.fn(async (_options: unknown) => undefined),
};
jest.mock('@/components/ui/AppDialogProvider', () => ({ useAppDialog: () => mockDialog }));

// The shared Reanimated mock has no fades; reduced motion never asks for one.
jest.mock('@/hooks/use-motion', () => ({
  useMotion: () => ({
    reduced: true,
    duration: () => 0,
    exitDuration: () => 0,
    stagger: () => 0,
    reflow: () => undefined,
    rowEntering: () => undefined,
    springTo: (value: number) => value,
  }),
}));

/** The review sheet, reduced to "Save what it was opened with, with these edits". */
const mockForm: { edit: Partial<EntryForm>; error: string | null } = { edit: {}, error: null };
jest.mock('@/components/transactions/TransactionFormModal', () => {
  const rn = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  return {
    TransactionFormModal: ({ visible, initialData, onSave, onClose }: any) =>
      visible
        ? react.createElement(
            rn.View,
            null,
            react.createElement(
              rn.Pressable,
              {
                testID: 'form-save',
                onPress: async () => {
                  mockForm.error = null;
                  try {
                    await onSave({ ...initialData, ...mockForm.edit });
                  } catch (error) {
                    mockForm.error = (error as Error).message;
                  }
                },
              },
              react.createElement(rn.Text, null, 'form save')
            ),
            react.createElement(
              rn.Pressable,
              { testID: 'form-close', onPress: onClose },
              react.createElement(rn.Text, null, 'form close')
            )
          )
        : null,
  };
});

const ledger = createFakeLedger();

const row = (
  key: string,
  title: string,
  amount: string,
  overrides: Partial<EntryForm> = {}
): DayItem => ({
  key,
  included: true,
  status: 'ready',
  draft: {} as ParseBatchItem,
  form: {
    ...createDefaultEntryForm(),
    date: '18 November 2026',
    time: '9:00 AM',
    type: 'Expense',
    mode: 'UPI',
    category: 'Food & Drinks',
    title,
    amount,
    ...overrides,
  },
  aiReview: null,
  slot: null,
  carried: false,
});

/** Paid two ways: ₹200 by UPI (the bigger total, saved first) and ₹100 in cash. */
const twoWays = () => [
  row('day-a', 'Groceries', '200'),
  row('day-b', 'Auto', '70', { mode: 'Cash' }),
  row('day-c', 'Chai', '30', { mode: 'Cash' }),
];

type UI = Awaited<ReturnType<typeof render>>;

const settle = async (ms = 900) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const openStoredTray = async (): Promise<UI> => {
  const ui = await render(<DayBatchScreen />);
  await settle(100);
  return ui;
};

const openTray = async (items: DayItem[]) => {
  await saveDayBatch({
    batchId: 'day-test',
    batch: { stage: 'batch', kind: 'batch', source_text: 'my day', items: [] },
    inputSource: 'text',
    items,
  });
  return openStoredTray();
};

/** Android stops Finnri; the tray comes back from disk. */
const restart = async (ui: UI) => {
  await ui.unmount();
  return openStoredTray();
};

const press = async (ui: UI, text: string | RegExp) => {
  await fireEvent.press(ui.getByText(text));
  await settle();
};

const pressSave = (ui: UI) => press(ui, /^Save \d/);
const switchToTotal = (ui: UI) => press(ui, 'One total for the day');
const switchToSeparate = (ui: UI) => press(ui, /^Separate \(/);
const perWay = (ui: UI) => press(ui, /^One per way paid/);
const untick = async (ui: UI, title: string) => {
  await fireEvent.press(ui.getByLabelText(`Include ${title}`));
  await settle(50);
};

/** The person keeps pressing Save until the tray has nothing left to save. */
const saveWhatIsLeft = async (ui: UI) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (mockRouter.back.mock.calls.length > 0 || !ui.queryByText(/^Save \d/)) return;
    await pressSave(ui);
  }
};

beforeEach(async () => {
  await AsyncStorage.clear();
  ledger.reset();
  global.fetch = ledger.fetch as unknown as typeof fetch;
  mockRouter.back.mockClear();
  mockDialog.confirm.mockReset().mockResolvedValue(true);
  mockDialog.alert.mockClear();
  mockForm.edit = {};
  mockForm.error = null;
});

jest.setTimeout(30000);

describe.each([
  ['a server that can cancel a key', true],
  ['an older server', false],
])(
  'spoken day tray, with %s: each rupee reaches the ledger exactly once (ENG-13)',
  (_server, canCancel) => {
    beforeEach(() => ledger.setCanCancel(canCancel));

    it('the happy path saves one total per way paid', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      await pressSave(ui);
      expect(ledger.amounts()).toEqual([200, 100]);
    });

    it('second total fails, then plain retry', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      expect(ledger.amounts()).toEqual([200]);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
      expect(mockDialog.confirm).not.toHaveBeenCalled();
    });

    it('a lost total response, a restart, then separate saves', async () => {
      let ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      ui = await restart(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('a restart then the same total again is a silent retry', async () => {
      let ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      ui = await restart(ui);
      await switchToTotal(ui);
      await pressSave(ui);
      expect(ledger.amounts()).toEqual([300]);
      expect(mockDialog.confirm).not.toHaveBeenCalled();
      expect(new Set(ledger.posts.map((post) => post.key)).size).toBe(1);
    });

    it('after a restart, a total that saved before the app was closed is not offered again', async () => {
      let ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      ui = await restart(ui);
      expect(ui.queryByLabelText('Include Groceries')).toBeNull();
      expect(ui.getByLabelText('Include Auto')).toBeTruthy();
    });

    it('case 1: second total fails, then the rows are saved separately', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      await switchToSeparate(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('case 2: second total fails, Finnri is closed, the ticks change, and nothing goes missing', async () => {
      let ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      ui = await restart(ui);
      // Untick what the person knows is saved, if it is still offered.
      if (ui.queryByLabelText('Include Groceries')) await untick(ui, 'Groceries');
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('case 3: a changed total after a partial save is not a dead end', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      await perWay(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      await switchToSeparate(ui);
      if (ui.queryByLabelText('Include Groceries')) await untick(ui, 'Groceries');
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('case 4: the form loses the response, then the button saves the same total', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await fireEvent.press(ui.getByLabelText(/Open to check or change/));
      await press(ui, 'form save');
      await press(ui, 'form close');
      await saveWhatIsLeft(ui);
      expect(ledger.amounts()).toEqual([300]);
    });

    it('case 4 reversed: the button loses the response, then the form saves the same total', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      await fireEvent.press(ui.getByLabelText(/Open to check or change/));
      await press(ui, 'form save');
      expect(ledger.amounts()).toEqual([300]);
    });

    it('a lost total response, then separate saves', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      await switchToSeparate(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('a lost total response, a restart, then a smaller total', async () => {
      let ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      ui = await restart(ui);
      await untick(ui, 'Chai');
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('lost row responses, then one total for the day', async () => {
      const ui = await openTray(twoWays());
      ledger.next('lost-response', 'lost-response');
      await pressSave(ui);
      // Two rows' answers were lost; the third saved.
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('a request that never arrived, then fewer ticks: nothing is saved without saying so', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('offline');
      await pressSave(ui);
      await switchToSeparate(ui);
      await untick(ui, 'Chai');
      mockDialog.confirm.mockResolvedValue(false);
      await pressSave(ui);
      // Declined, or never asked: either way the unticked chai is not in a saved total.
      expect(ledger.amounts()).not.toContain(300);
    });

    it('a total the server refuses can be fixed and saved', async () => {
      const ui = await openTray(twoWays());
      await switchToTotal(ui);
      ledger.next('invalid');
      await pressSave(ui);
      await switchToSeparate(ui);
      await untick(ui, 'Chai');
      await switchToTotal(ui);
      await pressSave(ui);
      expect(ledger.amounts()).toEqual([270]);
    });

    it('income that fails beside a total keeps the tray open', async () => {
      const ui = await openTray([
        ...twoWays(),
        row('day-i', 'Cashback', '50', { type: 'Income', category: 'Refund' }),
      ]);
      await switchToTotal(ui);
      ledger.next('ok', 'offline');
      await pressSave(ui);
      expect(mockRouter.back).not.toHaveBeenCalled();
      await saveWhatIsLeft(ui);
      expect(ledger.total('expense')).toBe(300);
      expect(ledger.total('income')).toBe(50);
    });
  }
);

describe('spoken day tray: what was left open after ENG-13', () => {
  it('a request the server never got is cancelled, and the new choice saved without asking', async () => {
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    ledger.next('offline');
    await pressSave(ui);
    await switchToSeparate(ui);
    await untick(ui, 'Chai');
    await pressSave(ui);
    expect(ledger.amounts()).toEqual([200, 70]);
    expect(mockDialog.confirm).not.toHaveBeenCalled();
  });

  it('a cancelled total can be chosen again, under a new key', async () => {
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    ledger.next('offline');
    await pressSave(ui);
    await switchToSeparate(ui);
    await untick(ui, 'Chai');
    ledger.next('offline', 'offline');
    await pressSave(ui);
    await fireEvent.press(ui.getByLabelText('Include Chai'));
    await settle(50);
    await switchToTotal(ui);
    await saveWhatIsLeft(ui);
    expect(ledger.amounts()).toEqual([300]);
    expect(ledger.entries()[0].key).toMatch(/~2$/);
  });

  it('a save the server did get is recognised without being sent again or asked about', async () => {
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    ledger.next('lost-response');
    await pressSave(ui);
    await switchToSeparate(ui);
    await pressSave(ui);
    expect(ledger.amounts()).toEqual([300]);
    expect(ledger.posts).toHaveLength(1);
    expect(mockDialog.confirm).not.toHaveBeenCalled();
    expect(mockDialog.alert).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Earlier save finished' })
    );
  });

  it('with an older server it asks before sending again, and Go back changes nothing', async () => {
    ledger.setCanCancel(false);
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    ledger.next('offline');
    await pressSave(ui);
    await switchToSeparate(ui);
    await untick(ui, 'Chai');
    mockDialog.confirm.mockResolvedValue(false);
    await pressSave(ui);
    expect(mockDialog.confirm).toHaveBeenCalledTimes(1);
    expect(ledger.entries()).toHaveLength(0);
  });

  it('cannot be closed while a save is on its way, and still warns after it fails', async () => {
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    const release = ledger.holdNext();
    await fireEvent.press(ui.getByText(/^Save \d/));
    await settle(100);
    await fireEvent.press(ui.getByLabelText('Close'));
    await settle(100);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockDialog.alert).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Still saving' })
    );
    await act(async () => release('offline'));
    await settle();
    mockDialog.confirm.mockResolvedValue(false);
    await fireEvent.press(ui.getByLabelText('Close'));
    await settle(100);
    expect(mockDialog.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: expect.stringContaining("couldn't confirm") })
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('refuses a total from the form when what it holds changed while it was open', async () => {
    const items = twoWays();
    const ui = await openTray(items);
    await switchToTotal(ui);
    await fireEvent.press(ui.getByLabelText(/Open to check or change/));
    // A row unticks itself under the open form, as the duplicate check does.
    await fireEvent.press(ui.getByTestId('form-close'));
    await settle(50);
    await switchToSeparate(ui);
    await switchToTotal(ui);
    await fireEvent.press(ui.getByLabelText(/Open to check or change/));
    await settle(50);
    await switchToSeparate(ui);
    await untick(ui, 'Chai');
    await press(ui, 'form save');
    expect(ledger.entries()).toHaveLength(0);
    expect(mockForm.error).toContain('changed while it was open');
  });

  it('does not reopen another person’s tray', async () => {
    await saveDayBatch({
      batchId: 'day-test',
      owner: 'someone-else',
      batch: { stage: 'batch', kind: 'batch', source_text: 'my day', items: [] },
      inputSource: 'text',
      items: twoWays(),
    });
    expect(await loadDayBatch(Date.now(), 'me')).toBeNull();
    expect(await loadDayBatch(Date.now(), 'someone-else')).not.toBeNull();
  });

  it('does not send a transaction it could not first record on the phone', async () => {
    const ui = await openTray(twoWays());
    await switchToTotal(ui);
    const setItem = AsyncStorage.setItem as jest.Mock;
    const working = setItem.getMockImplementation();
    setItem.mockImplementation(async () => {
      throw new Error('disk full');
    });
    try {
      await pressSave(ui);
    } finally {
      setItem.mockImplementation(working);
    }
    expect(ledger.posts).toHaveLength(0);
  });

  it('One total leaves an expense with no amount in the tray', async () => {
    const ui = await openTray([...twoWays(), row('day-z', 'Parking', '')]);
    await switchToTotal(ui);
    await pressSave(ui);
    expect(ledger.amounts()).toEqual([300]);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(ui.getByLabelText('Include Parking')).toBeTruthy();
  });

  it('a total from the form also leaves an expense with no amount in the tray', async () => {
    const ui = await openTray([...twoWays(), row('day-z', 'Parking', '')]);
    await switchToTotal(ui);
    await fireEvent.press(ui.getByLabelText(/Open to check or change/));
    await press(ui, 'form save');
    expect(ledger.amounts()).toEqual([300]);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(ui.getByLabelText('Include Parking')).toBeTruthy();
  });

  it('a tray with an unconfirmed save outlives the six hours', async () => {
    let ui = await openTray(twoWays());
    await switchToTotal(ui);
    ledger.next('lost-response');
    await pressSave(ui);
    const real = Date.now.bind(Date);
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => real() + 7 * 60 * 60 * 1000);
    ui = await restart(ui);
    clock.mockRestore();
    await saveWhatIsLeft(ui);
    expect(ledger.total()).toBe(300);
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
