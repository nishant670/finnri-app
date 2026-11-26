/**
 * The bill tray's side of ENG-13: whatever fails, and however the person
 * retries, each bill reaches the ledger exactly once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';

import BillsScreen from '@/app/bills';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { BillItem } from '@/lib/bill-batch';
import { saveBillBatch } from '@/lib/bill-batch-store';
import { createDefaultEntryForm } from '@/lib/home-capture';

import { createFakeLedger } from '../test-support/fakeLedger';

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-image', () => ({ Image: () => null }));
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

/** The review sheet, reduced to "Save what it was opened with". */
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
              { onPress: () => onSave(initialData).catch(() => undefined) },
              react.createElement(rn.Text, null, 'form save')
            ),
            react.createElement(
              rn.Pressable,
              { onPress: onClose },
              react.createElement(rn.Text, null, 'form close')
            )
          )
        : null,
  };
});

/** The receipt reader, answered when a test says so. */
const mockRead = { finish: (_amount: string) => undefined as void };
jest.mock('@/lib/parse', () => ({
  ...jest.requireActual('@/lib/parse'),
  parseReceiptDraft: () =>
    new Promise((resolve) => {
      mockRead.finish = (amount: string) =>
        resolve({
          stage: 'draft',
          type: 'expense',
          title: 'Late bill',
          time: null,
          amount: Number(amount),
          currency: 'INR',
          mode: 'UPI',
          category: 'Misc',
          merchant: null,
          tag: null,
          note: null,
          date: '2026-11-18',
          source_text: null,
        });
    }),
}));

const ledger = createFakeLedger();

const bill = (key: string, title: string, amount: string): BillItem => ({
  key,
  uri: `/uploads/${key}.jpg`,
  included: true,
  status: 'read',
  form: {
    ...createDefaultEntryForm(),
    date: '18 November 2026',
    type: 'Expense',
    mode: 'UPI',
    category: 'Food & Drinks',
    title,
    amount,
    attachment: null,
  } satisfies EntryForm,
});

const threeBills = () => [
  bill('bill-a', 'Cafe', '200'),
  bill('bill-b', 'Fuel', '70'),
  bill('bill-c', 'Chemist', '30'),
];

type UI = Awaited<ReturnType<typeof render>>;

const settle = async (ms = 900) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const openStoredTray = async (): Promise<UI> => {
  const ui = await render(<BillsScreen />);
  await settle(100);
  return ui;
};

const openTray = async () => {
  await saveBillBatch({
    batchId: 'bills-test',
    phase: 'tray',
    origin: 'library',
    items: threeBills(),
  });
  return openStoredTray();
};

const restart = async (ui: UI) => {
  await ui.unmount();
  return openStoredTray();
};

const press = async (ui: UI, text: string | RegExp) => {
  await fireEvent.press(ui.getByText(text));
  await settle();
};
const pressSave = (ui: UI) => press(ui, /^Save \d/);
const switchToTotal = (ui: UI) => press(ui, 'One total');
const switchToSeparate = (ui: UI) => press(ui, /^Separate \(/);

/** Ticks or unticks the bill in that row. */
const tick = async (ui: UI, index: number) => {
  await fireEvent.press(ui.getAllByRole('checkbox')[index]);
  await settle(50);
};

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
});

jest.setTimeout(30000);

describe.each([
  ['a server that can cancel a key', true],
  ['an older server', false],
])(
  'bill tray, with %s: each rupee reaches the ledger exactly once (ENG-13)',
  (_server, canCancel) => {
    beforeEach(() => ledger.setCanCancel(canCancel));

    it('saves one total', async () => {
      const ui = await openTray();
      await switchToTotal(ui);
      await pressSave(ui);
      expect(ledger.amounts()).toEqual([300]);
    });

    it('a lost total response, then separate saves', async () => {
      const ui = await openTray();
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      await switchToSeparate(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('a lost total response, a restart, a bill ticked back on: it is not lost', async () => {
      let ui = await openTray();
      await tick(ui, 2);
      await switchToTotal(ui);
      ledger.next('lost-response');
      await pressSave(ui);
      ui = await restart(ui);
      await tick(ui, 2);
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('a lost total response, one more bill unticked, and the total is not shrunk silently', async () => {
      const ui = await openTray();
      await switchToTotal(ui);
      ledger.next('offline');
      await pressSave(ui);
      await switchToSeparate(ui);
      await tick(ui, 2);
      mockDialog.confirm.mockResolvedValue(false);
      await pressSave(ui);
      expect(ledger.amounts()).not.toContain(300);
    });

    it('lost bill responses, then one total', async () => {
      const ui = await openTray();
      ledger.next('lost-response', 'lost-response');
      await pressSave(ui);
      await switchToTotal(ui);
      await saveWhatIsLeft(ui);
      expect(ledger.total()).toBe(300);
    });

    it('the form loses the response, then the button saves the same total', async () => {
      const ui = await openTray();
      await switchToTotal(ui);
      ledger.next('lost-response');
      await fireEvent.press(ui.getByLabelText(/Open to check or change/));
      await press(ui, 'form save');
      await press(ui, 'form close');
      await saveWhatIsLeft(ui);
      expect(ledger.amounts()).toEqual([300]);
    });
  }
);

describe('bill tray: a bill with no total', () => {
  it('stays in the tray when the others are saved as one', async () => {
    await saveBillBatch({
      batchId: 'bills-test',
      phase: 'tray',
      origin: 'library',
      items: [...threeBills(), bill('bill-z', 'Parking', '')],
    });
    const ui = await openStoredTray();
    await switchToTotal(ui);
    await pressSave(ui);
    expect(ledger.amounts()).toEqual([300]);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(ui.getByText(/1 bill needs an amount/)).toBeTruthy();
  });
});

describe('bill tray: what the review found', () => {
  const notReadYet = (): BillItem => ({
    key: 'bill-late',
    uri: '/uploads/late.jpg',
    included: true,
    status: 'waiting',
  });

  it('cannot be closed while the last bill is saving, so a failure is not lost', async () => {
    const ui = await openTray();
    // Two save, the third is held in flight.
    const original = global.fetch;
    let posts = 0;
    let fail: () => void = () => undefined;
    global.fetch = (async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST' && String(url).endsWith('/v1/entries') && (posts += 1) === 3) {
        await new Promise<void>((resolve) => {
          fail = resolve;
        });
        throw new TypeError('Network request failed');
      }
      return original(url, init as never);
    }) as typeof fetch;
    await pressSave(ui);
    await fireEvent.press(ui.getByLabelText('Close'));
    await settle(100);
    expect(mockRouter.back).not.toHaveBeenCalled();
    await act(async () => fail());
    await settle();
    expect(ledger.total()).toBe(270);
    expect(ui.getByText(/^Save 1/)).toBeTruthy();
  });

  it('refuses a total from the form when another bill finished reading under it', async () => {
    await saveBillBatch({
      batchId: 'bills-test',
      phase: 'tray',
      origin: 'library',
      items: [bill('bill-a', 'Cafe', '200'), bill('bill-b', 'Fuel', '70'), notReadYet()],
    });
    const ui = await openStoredTray();
    await switchToTotal(ui);
    await fireEvent.press(ui.getByLabelText(/Open to check or change/));
    await act(async () => mockRead.finish('500'));
    await settle(200);
    await press(ui, 'form save');
    expect(ledger.entries()).toHaveLength(0);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
