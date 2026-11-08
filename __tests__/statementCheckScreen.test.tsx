import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import StatementReviewScreen from '@/app/statements/review';
import * as accounts from '@/lib/accounts';
import { putStatementIntake } from '@/lib/statement-intake';
import * as statements from '@/lib/statements';
import type { StatementDiff } from '@/lib/statements';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockIntakeKey = '';
let mockFocus: () => void = () => undefined;
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (target: unknown) => mockPush(target) },
  useLocalSearchParams: () => ({ id: '42', intake: mockIntakeKey }),
  // Kept, not run: only coming back to the screen matters here.
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
  },
}));
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token' }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const swiggy = {
  date: '2026-09-12',
  description: 'SWIGGY',
  amount: 640,
  type: 'expense' as const,
  kind: 'spend' as const,
};
const myntra = {
  date: '2026-09-14',
  description: 'MYNTRA',
  amount: 2000,
  type: 'expense' as const,
  kind: 'spend' as const,
};
const fee = {
  date: '2026-09-15',
  description: 'ANNUAL FEE',
  amount: 590,
  type: 'expense' as const,
  kind: 'fee' as const,
};

const diff: StatementDiff = {
  matched: [],
  probable: [
    {
      line: swiggy,
      entry: { entry_id: 9, date: '2026-09-02', title: 'Dinner', amount: 640, type: 'expense' },
      day_gap: 10,
      amount_gap: 0,
      similarity: 0,
      reason: 'date',
    },
  ],
  missing: [myntra, fee],
  extra: [],
  ignored: [],
  charges: [fee],
  summary: {
    statement_lines: 3,
    matched_count: 0,
    missing_count: 2,
    extra_count: 0,
    ignored_count: 0,
    probable_count: 1,
    charges_count: 1,
    charges_amount: 590,
    missing_amount: 2590,
    extra_amount: 0,
  },
  reconciliation: {
    cycle_start: '2026-09-06',
    cycle_end: '2026-10-05',
    itemized_total: 640,
    entries_count: 1,
    previous_unpaid: 0,
    statement_total: 3230,
    unitemized_amount: 2590,
    gap: 2590,
    state: 'under',
  },
  source: 'pdf',
};

describe('Statement check screen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockBack.mockClear();
    mockPush.mockClear();
    jest.spyOn(statements, 'diffStatementLines').mockResolvedValue(diff);
    mockIntakeKey = putStatementIntake({
      lines: [swiggy, myntra, fee],
      cardUpdates: [{ field: 'due_day', label: 'Due day', current: 20, proposed: 25 }],
      warnings: [],
      account: { id: 7, type: 'credit_card', name: 'Regalia', color: '#000', due_day: 20 },
    });
  });

  describe('when the rows run past the bill', () => {
    const warned: StatementDiff = {
      ...diff,
      cycle_warning: {
        latest_row_date: '2026-09-14',
        cycle_end: '2026-09-05',
        message: 'This statement has transactions up to 14 Sep.',
      },
    };

    const leaveToFixDate = async () => {
      jest.spyOn(statements, 'diffStatementLines').mockResolvedValue(warned);
      const view = await render(<StatementReviewScreen />);
      await fireEvent.press(await view.findByTestId('statement-fix-date'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/statements/[id]',
        params: { id: '42', edit: '1' },
      });
      return view;
    };

    it('leaves the rows unticked and opens the date form', async () => {
      const { queryByText } = await leaveToFixDate();
      expect(queryByText(/Add 2/)).toBeNull();
    });

    it('compares the same rows again after the date is corrected', async () => {
      const compare = statements.diffStatementLines as jest.Mock;
      const { findByTestId, queryByTestId } = await leaveToFixDate();
      compare.mockClear();
      compare.mockResolvedValue(diff);

      await act(async () => mockFocus());

      await waitFor(() => expect(queryByTestId('statement-cycle-warning')).toBeNull());
      await findByTestId('statement-totals-card');
      expect(compare).toHaveBeenCalledWith('test-token', 42, [swiggy, myntra, fee]);
    });

    it('goes back when the bill was deleted there', async () => {
      const compare = statements.diffStatementLines as jest.Mock;
      await leaveToFixDate();
      compare.mockRejectedValue(new statements.StatementApiError('gone', 404));

      await act(async () => mockFocus());

      await waitFor(() => expect(mockBack).toHaveBeenCalled());
    });
  });

  it('compares the rows read in the sheet and offers the card updates', async () => {
    const updateSpy = jest
      .spyOn(accounts, 'updateAccount')
      .mockResolvedValue({ id: 7, type: 'credit_card', name: 'Regalia', color: '#000' });
    const { findByTestId, findByText } = await render(<StatementReviewScreen />);

    await findByTestId('statement-totals-card');
    expect(statements.diffStatementLines).toHaveBeenCalledWith('test-token', 42, [
      swiggy,
      myntra,
      fee,
    ]);
    await findByTestId('statement-card-updates');
    await fireEvent.press(await findByTestId('card-updates-save'));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'test-token',
        7,
        expect.objectContaining({ due_day: 25, name: 'Regalia' })
      )
    );
    await findByText(/Card updated/);
  });

  it('keeps the probable pair as the same purchase, and projects a match', async () => {
    const { findByTestId, findByText } = await render(<StatementReviewScreen />);

    await findByTestId('statement-totals-card');
    expect((await findByTestId('statement-totals-projection')).props.children).toMatch(
      /matches your ₹3,230(\.00)? bill/
    );
    await findByTestId('statement-charges-callout');
    await findByText(/Add 2 ·/);
  });

  it('adds a probable line the user marks as different, then reports the result', async () => {
    const importSpy = jest.spyOn(statements, 'importStatementLines').mockResolvedValue({
      imported: 3,
      reconciliation: { ...diff.reconciliation!, gap: -640, state: 'over' },
    });
    const { findByTestId, findByText } = await render(<StatementReviewScreen />);

    await fireEvent.press(await findByTestId('probable-different'));
    await findByText(/Add 3 ·/);
    expect((await findByTestId('statement-totals-projection')).props.children).toMatch(
      /more than your/
    );

    await fireEvent.press(await findByText(/Add 3 ·/));

    await waitFor(() =>
      expect(importSpy).toHaveBeenCalledWith('test-token', 42, [myntra, fee, swiggy])
    );
    await findByTestId('statement-import-result');
    await findByText(/more than the bill/);
  });
});
