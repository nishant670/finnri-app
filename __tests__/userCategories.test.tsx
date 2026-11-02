import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { TransactionCategoryPicker } from '@/components/transactions/TransactionCategoryPicker';
import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { useAuthStore } from '@/hooks/use-auth-store';
import { categoryOptionsFor } from '@/lib/categories';
import { buildTransactionPayload, entryTag } from '@/lib/transaction-composer';
import { useUserCategories } from '@/lib/user-categories';

type Call = { url: string; method: string; body: unknown };

/** A server holding one user's custom categories. */
const serveCategories = (initial: { expense: string[]; income: string[] }) => {
  const kept = { expense: [...initial.expense], income: [...initial.income] };
  const calls: Call[] = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (method === 'POST') {
      const { name, type } = body as { name: string; type: 'expense' | 'income' };
      kept[type].push(name);
      return new Response(JSON.stringify({ name, type, canonical: false }), { status: 201 });
    }
    if (method === 'DELETE') {
      return new Response(JSON.stringify({ removed: true }), { status: 200 });
    }
    return new Response(JSON.stringify(kept), { status: 200 });
  }) as unknown as typeof fetch;
  return calls;
};

const blankForm: Partial<EntryForm> = {
  title: '',
  amount: '',
  type: 'Expense',
  mode: 'Cash',
  category: 'Misc',
  date: '11 July 2026',
  tag: 'General',
  accountId: null,
  account: '',
};

const renderForm = (
  initialData: Partial<EntryForm>,
  onSave = jest.fn().mockResolvedValue(undefined)
) =>
  render(
    <TransactionFormModal
      visible
      initialData={initialData}
      onSave={onSave}
      onClose={jest.fn()}
      mode="manual"
    />
  );

beforeEach(() => {
  useUserCategories.setState({
    categories: { expense: [], income: [] },
    loadedFor: null,
    loadedAt: 0,
  });
  useAuthStore.setState({ token: 'session' });
});

afterEach(() => {
  useAuthStore.setState({ token: null });
});

describe('categoryOptionsFor', () => {
  it("lists the user's own categories after the built-ins", () => {
    expect(categoryOptionsFor('Salary', 'Income', ['Dividend', 'Rental income'])).toEqual([
      'Salary',
      'Freelance',
      'Interest',
      'Refund',
      'Other',
      'Dividend',
      'Rental income',
    ]);
  });

  it('never lists a built-in twice, under its own name or another', () => {
    const options = categoryOptionsFor('Misc', 'Expense', ['groceries', 'misc', 'Pet Care']);
    expect(options.filter((option) => option === 'Pet Care')).toHaveLength(1);
    expect(options).not.toContain('groceries');
    expect(options).not.toContain('misc');
  });

  it("keeps the edited entry's category even when it is no longer on the list", () => {
    expect(categoryOptionsFor('Dividned', 'Income', [])).toContain('Dividned');
  });
});

describe('useUserCategories', () => {
  it('keeps a typed category and tells the server', async () => {
    const calls = serveCategories({ expense: [], income: [] });

    let name = '';
    await act(async () => {
      name = useUserCategories.getState().add('session', 'Dividend', 'income');
    });

    expect(name).toBe('Dividend');
    expect(useUserCategories.getState().categories.income).toEqual(['Dividend']);
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'POST', body: { name: 'Dividend', type: 'income' } })
    );
  });

  it('answers with what the user already has instead of adding a second one', async () => {
    const calls = serveCategories({ expense: [], income: [] });
    useUserCategories.setState({ categories: { expense: [], income: ['Dividend'] } });

    expect(useUserCategories.getState().add('session', 'dividend', 'income')).toBe('Dividend');
    expect(useUserCategories.getState().add('session', 'groceries', 'expense')).toBe(
      'Food & Drinks'
    );
    expect(calls).toHaveLength(0);
  });

  it('puts a category back when the server would not remove it', async () => {
    global.fetch = jest.fn(
      async () => new Response('{}', { status: 500 })
    ) as unknown as typeof fetch;
    useUserCategories.setState({ categories: { expense: ['Pet Care'], income: [] } });

    await expect(
      useUserCategories.getState().remove('session', 'Pet Care', 'expense')
    ).rejects.toBeTruthy();
    expect(useUserCategories.getState().categories.expense).toEqual(['Pet Care']);
  });

  it('reads the list once a minute, not on every form opening', async () => {
    const calls = serveCategories({ expense: ['Pet Care'], income: [] });
    await useUserCategories.getState().load('session');
    await useUserCategories.getState().load('session');

    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    expect(useUserCategories.getState().categories.expense).toEqual(['Pet Care']);
  });

  it("does not show one account's categories to the next", async () => {
    serveCategories({ expense: [], income: ['Dividend'] });
    await useUserCategories.getState().load('first');
    expect(useUserCategories.getState().categories.income).toEqual(['Dividend']);

    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    void useUserCategories.getState().load('second');
    expect(useUserCategories.getState().categories.income).toEqual([]);
  });
});

describe('a category the user adds', () => {
  it('is offered again on the next transaction', async () => {
    serveCategories({ expense: [], income: [] });
    const onSave = jest.fn().mockResolvedValue(undefined);
    const first = await renderForm({ ...blankForm, type: 'Income', category: 'Other' }, onSave);

    await fireEvent.press(await first.findByTestId('entry-category-picker'));
    await fireEvent.press(await first.findByText('New category'));
    await fireEvent.changeText(await first.findByTestId('entry-custom-category-input'), 'Dividend');
    await fireEvent.press(await first.findByTestId('entry-add-custom-category-button'));
    expect(await first.findByLabelText('Category Dividend')).toBeTruthy();
    await first.unmount();

    // A new form, for a different income: Dividend is in the picker now.
    const second = await renderForm({ ...blankForm, type: 'Income', category: 'Other' });
    await fireEvent.press(await second.findByTestId('entry-category-picker'));
    expect(await second.findByText('Dividend')).toBeTruthy();
  });

  it("loads the user's categories when the form opens", async () => {
    serveCategories({ expense: ['Pet Care'], income: [] });
    const ui = await renderForm(blankForm);

    await fireEvent.press(await ui.findByTestId('entry-category-picker'));
    expect(await ui.findByText('Pet Care')).toBeTruthy();
  });
});

describe('removing one of your categories', () => {
  const setup = async (onRemoveCustom = jest.fn().mockResolvedValue(undefined)) => {
    const screen = await render(
      <TransactionCategoryPicker
        visible
        selected="Salary"
        options={['Salary', 'Other', 'Dividned']}
        suggestions={[]}
        customCategory=""
        onChangeCustomCategory={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        onAddCustom={jest.fn()}
        removable={['Dividned']}
        onRemoveCustom={onRemoveCustom}
      />
    );
    return { screen, onRemoveCustom };
  };

  it('asks inside the sheet, then removes it', async () => {
    const { screen, onRemoveCustom } = await setup();

    await fireEvent(screen.getByText('Dividned'), 'longPress');
    expect(screen.getByText('Remove “Dividned” from your categories?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('category-remove-confirm-button'));

    expect(onRemoveCustom).toHaveBeenCalledWith('Dividned');
    await waitFor(() => expect(screen.queryByTestId('category-remove-confirm')).toBeNull());
  });

  it('leaves the built-ins alone, and Keep keeps it', async () => {
    const { screen, onRemoveCustom } = await setup();

    await fireEvent(screen.getByText('Salary'), 'longPress');
    expect(screen.queryByTestId('category-remove-confirm')).toBeNull();

    await fireEvent(screen.getByText('Dividned'), 'longPress');
    await fireEvent.press(screen.getByText('Keep'));
    expect(screen.queryByTestId('category-remove-confirm')).toBeNull();
    expect(onRemoveCustom).not.toHaveBeenCalled();
  });

  it('says so when the removal fails, and keeps asking', async () => {
    const { screen } = await setup(jest.fn().mockRejectedValue(new Error('offline')));

    await fireEvent(screen.getByText('Dividned'), 'longPress');
    await fireEvent.press(screen.getByTestId('category-remove-confirm-button'));

    expect(await screen.findByText(/Couldn't remove it/)).toBeTruthy();
    expect(screen.getByTestId('category-remove-confirm')).toBeTruthy();
  });
});

describe('tags on income', () => {
  it('are not offered', async () => {
    serveCategories({ expense: [], income: [] });
    const expense = await renderForm(blankForm);
    await fireEvent.press(await expense.findByTestId('entry-more-details'));
    expect(await expense.findByTestId('entry-tag-picker')).toBeTruthy();
    await expense.unmount();

    const income = await renderForm({ ...blankForm, type: 'Income', category: 'Other' });
    await fireEvent.press(await income.findByTestId('entry-more-details'));
    await income.findByTestId('entry-notes-input');
    expect(income.queryByTestId('entry-tag-picker')).toBeNull();
  });

  it("drop an expense's tag when the entry becomes income", async () => {
    serveCategories({ expense: [], income: [] });
    const onSave = jest.fn().mockResolvedValue(undefined);
    const ui = await renderForm(
      { ...blankForm, title: 'Deposit back', amount: '500', tag: 'Refundable' },
      onSave
    );

    await fireEvent.press(await ui.findByTestId('entry-type-income'));
    await fireEvent.press(await ui.findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'Income', tag: 'General' })
    );
  });

  it('are saved as General, with no refund details', async () => {
    const form = {
      ...blankForm,
      title: 'IGL dividend',
      amount: '237',
      type: 'Income',
      tag: 'Refundable',
      refundableAmount: '100',
      refundExpectedOn: '20 October 2026',
      refundReminderEnabled: true,
      splitEnabled: false,
      currency: 'INR',
      notes: '',
      merchant: '',
      time: '',
      attachment: null,
    } as EntryForm;

    expect(entryTag(form)).toBe('General');
    expect(entryTag({ type: 'Expense', tag: 'EMI' })).toBe('EMI');

    const payload = await buildTransactionPayload('session', form);
    expect(payload.tag).toBe('General');
    expect(payload).not.toHaveProperty('refundable_amount');
  });
});
