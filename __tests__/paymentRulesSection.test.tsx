import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { PaymentRulesSection } from '@/components/accounts/PaymentRulesSection';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';
import type { Account } from '@/lib/accounts';
import { deletePaymentRule, listPaymentRules, savePaymentRule } from '@/lib/payment-rules';

jest.mock('@/lib/payment-rules', () => ({
  ...jest.requireActual('@/lib/payment-rules'),
  listPaymentRules: jest.fn(),
  savePaymentRule: jest.fn(),
  deletePaymentRule: jest.fn(),
}));

const mockedList = listPaymentRules as jest.MockedFunction<typeof listPaymentRules>;
const mockedSave = savePaymentRule as jest.MockedFunction<typeof savePaymentRule>;
const mockedDelete = deletePaymentRule as jest.MockedFunction<typeof deletePaymentRule>;

const bpcl: Account = { id: 5, type: 'credit_card', name: 'SBI BPCL', color: '#1E88E5' };
const hdfc: Account = { id: 7, type: 'credit_card', name: 'HDFC Swiggy', color: '#E64A19' };
const rule = (id: number, accountId: number, phrase: string) => ({
  id, account_id: accountId, phrase, created_at: '', updated_at: '',
});

const renderSection = () =>
  render(
    <AppDialogProvider>
      <PaymentRulesSection token="t" account={bpcl} accounts={[bpcl, hdfc]} usedNoun="card" />
    </AppDialogProvider>
  );

beforeEach(() => {
  mockedList.mockReset();
  mockedSave.mockReset();
  mockedDelete.mockReset();
  mockedSave.mockResolvedValue(rule(9, 5, 'x'));
  mockedDelete.mockResolvedValue();
});

describe('PaymentRulesSection', () => {
  it("shows this card's phrases and offers the presets it lacks", async () => {
    mockedList.mockResolvedValue([rule(1, 5, 'Fuel'), rule(2, 7, 'Food delivery')]);
    const { findByText, queryByTestId, findByTestId } = await renderSection();

    expect(await findByText('Fuel')).toBeTruthy();
    expect(queryByTestId('payment-rule-preset-fuel')).toBeNull();
    // Another card's phrase is offered here as a preset, not shown as this card's.
    expect(await findByTestId('payment-rule-preset-food-delivery')).toBeTruthy();
    expect(await findByTestId('payment-rule-preset-groceries')).toBeTruthy();
  });

  it('adds a preset in one tap and removes a phrase in one tap', async () => {
    mockedList.mockResolvedValue([rule(1, 5, 'Fuel')]);
    const { findByTestId } = await renderSection();

    await fireEvent.press(await findByTestId('payment-rule-preset-groceries'));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('t', 5, 'Groceries'));

    await fireEvent.press(await findByTestId('payment-rule-1'));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('t', 1));
  });

  it("asks before moving another card's phrase here", async () => {
    mockedList.mockResolvedValue([rule(2, 7, 'Swiggy')]);
    const { findByTestId, findByText } = await renderSection();

    await fireEvent.press(await findByTestId('payment-rule-add'));
    await fireEvent.changeText(await findByTestId('payment-rule-input'), 'swiggy');
    await fireEvent(await findByTestId('payment-rule-input'), 'submitEditing');

    expect(await findByText('Move "Swiggy" here?')).toBeTruthy();
    expect(mockedSave).not.toHaveBeenCalled();
    await fireEvent.press(await findByText('Move it'));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('t', 5, 'swiggy'));
  });
});
