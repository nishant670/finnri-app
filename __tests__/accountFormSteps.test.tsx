import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AccountFormStepOne } from '@/components/accounts/AccountFormStepOne';
import { AccountFormStepTwo } from '@/components/accounts/AccountFormStepTwo';
import { AccountFormSuccess } from '@/components/accounts/AccountFormSuccess';
import { AccountSelectionSheet } from '@/components/accounts/AccountSelectionSheet';
import { ACCOUNT_DETAIL_COPY } from '@/lib/account-form';
import type { Account } from '@/lib/accounts';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

afterEach(() => jest.clearAllMocks());

type One = React.ComponentProps<typeof AccountFormStepOne>;
const stepOne = async (over: Partial<One> = {}) => {
  const h = {
    setIsDefault: jest.fn(),
    setName: jest.fn(),
    setSelectedColor: jest.fn(),
    setStep: jest.fn(),
    updateSelectedType: jest.fn(),
  };
  const screen = await render(
    <AccountFormStepOne
      isDefault={false}
      isEditing={false}
      isSaving={false}
      name="My bank"
      saveError={null}
      selectedColor="#54A0FF"
      selectedType="bank"
      typeError={null}
      {...h}
      {...over}
    />
  );
  return { screen, ...h };
};

describe('AccountFormStepOne', () => {
  it('titles the form for adding or editing', async () => {
    expect((await stepOne()).screen.getByText('Add a payment source')).toBeTruthy();
    expect(
      (await stepOne({ isEditing: true })).screen.getByText('Update this account')
    ).toBeTruthy();
  });

  it('lists every account type and reports the one tapped', async () => {
    const { screen, updateSelectedType } = await stepOne();
    for (const label of ['Cash', 'Credit', 'Debit', 'Wallet', 'UPI', 'Bank', 'Other']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByText('Wallet'));
    expect(updateSelectedType).toHaveBeenCalledWith('wallet');
  });

  it('edits the name and toggles the default', async () => {
    const { screen, setName, setIsDefault } = await stepOne();
    await fireEvent.changeText(screen.getByPlaceholderText('My Spending Account'), 'Salary');
    expect(setName).toHaveBeenCalledWith('Salary');
    await fireEvent.press(screen.getByText('Use as default account'));
    const updater = setIsDefault.mock.calls[0][0] as (v: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it('shows type and save errors', async () => {
    const { screen } = await stepOne({ typeError: 'Pick a type.', saveError: 'Could not save.' });
    expect(screen.getByText('Pick a type.')).toBeTruthy();
    expect(screen.getByText('Could not save.')).toBeTruthy();
  });

  it('continues to step 2 and cancels back', async () => {
    const { screen, setStep } = await stepOne();
    await fireEvent.press(screen.getByText('Continue'));
    expect(setStep).toHaveBeenCalledWith(2);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

type Two = React.ComponentProps<typeof AccountFormStepTwo>;
const stepTwo = async (over: Partial<Two> = {}) => {
  const h = {
    handleSave: jest.fn(async () => undefined),
    selectProvider: jest.fn(),
    updateIdentifier: jest.fn(),
    setAnnualFee: jest.fn(),
    setBalance: jest.fn(),
    setCreditLimit: jest.fn(),
    setDueDay: jest.fn(),
    setFeeMonth: jest.fn(),
    setFeeWaiverSpend: jest.fn(),
    setIssuerQuery: jest.fn(),
    setReminderDaysBefore: jest.fn(),
    setReminderEnabled: jest.fn(),
    setSelectedIssuer: jest.fn(),
    setShowDayModal: jest.fn(),
    setShowIssuerResults: jest.fn(),
    setShowMonthModal: jest.fn(),
    setStep: jest.fn(),
  };
  const selectedType = over.selectedType ?? 'bank';
  const screen = await render(
    <AccountFormStepTwo
      annualFee=""
      balance=""
      creditLimit=""
      detailCopy={ACCOUNT_DETAIL_COPY[selectedType]}
      dueDay=""
      feeMonth=""
      feeWaiverSpend=""
      filteredIssuers={[]}
      isEditing={false}
      isSaving={false}
      issuerQuery=""
      last4=""
      providerOptions={[]}
      reminderDaysBefore="3"
      reminderEnabled
      saveError={null}
      selectedType={selectedType}
      showDayModal={false}
      showIssuerResults={false}
      showMonthModal={false}
      {...h}
      {...over}
    />
  );
  return { screen, ...h };
};

describe('AccountFormStepTwo', () => {
  it('shows the per-type copy and the opening-balance field for a bank', async () => {
    const { screen, setBalance } = await stepTwo();
    expect(screen.getByText(ACCOUNT_DETAIL_COPY.bank.message)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '12a.5');
    expect(setBalance).toHaveBeenCalledWith('12.5');
  });

  it('keeps only the allowed characters in the identifier handler call', async () => {
    const { screen, updateIdentifier } = await stepTwo();
    await fireEvent.changeText(
      screen.getByPlaceholderText(ACCOUNT_DETAIL_COPY.bank.identifierPlaceholder!),
      '1234'
    );
    expect(updateIdentifier).toHaveBeenCalledWith('1234');
  });

  it('goes back to step 1 and saves with the label for the mode', async () => {
    const { screen, handleSave, setStep } = await stepTwo();
    await fireEvent.press(screen.getByText('Back'));
    expect(setStep).toHaveBeenCalledWith(1);
    expect(handleSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Finish Setup'));
    expect(handleSave).toHaveBeenCalledTimes(1);
    expect((await stepTwo({ isEditing: true })).screen.getByText('Save Changes')).toBeTruthy();
    expect(
      (await stepTwo({ isSaving: true })).screen.getAllByText('Saving...').length
    ).toBeGreaterThan(0);
  });

  it('offers card limits, due day and fees only for a credit card', async () => {
    const bank = await stepTwo();
    expect(bank.screen.queryByPlaceholderText('500')).toBeNull();
    const card = await stepTwo({ selectedType: 'credit_card' });
    expect(card.screen.getByText(ACCOUNT_DETAIL_COPY.credit_card.message)).toBeTruthy();
    await fireEvent.changeText(card.screen.getAllByPlaceholderText('1,00,000')[0], '1,5a0000');
    expect(card.setCreditLimit).toHaveBeenCalledWith('150000');
    await fireEvent.changeText(card.screen.getByPlaceholderText('500'), '99x');
    expect(card.setAnnualFee).toHaveBeenCalledWith('99');
  });

  it('opens the day and month sheets', async () => {
    const card = await stepTwo({ selectedType: 'credit_card' });
    await fireEvent.press(card.screen.getByText('Day'));
    expect(card.setShowDayModal).toHaveBeenCalledWith(true);
    await fireEvent.press(card.screen.getByText('Month'));
    expect(card.setShowMonthModal).toHaveBeenCalledWith(true);
  });

  it('toggles the due reminder and reveals its day count', async () => {
    const on = await stepTwo({ selectedType: 'credit_card', reminderEnabled: true });
    expect(on.screen.getByText('Enabled for this card')).toBeTruthy();
    expect(on.screen.getByText('Remind me this many days before')).toBeTruthy();
    const off = await stepTwo({ selectedType: 'credit_card', reminderEnabled: false });
    expect(off.screen.getByText('Off for this card')).toBeTruthy();
    expect(off.screen.queryByText('Remind me this many days before')).toBeNull();
  });
});

const created = (over: Partial<Account> = {}) =>
  ({ id: 7, type: 'bank', name: 'HDFC Savings', is_default: false, ...over }) as Account;

describe('AccountFormSuccess', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof AccountFormSuccess>> = {}) => {
    const h = {
      handleSetCreatedDefault: jest.fn(async () => undefined),
      resetNewAccountForm: jest.fn(),
    };
    const screen = await render(
      <AccountFormSuccess
        createdAccount={created()}
        isSaving={false}
        name=""
        saveError={null}
        selectedType="bank"
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('names the account that was created', async () => {
    expect((await setup()).screen.getByText(/HDFC Savings/)).toBeTruthy();
  });

  it('opens the account', async () => {
    const { screen } = await setup();
    await fireEvent.press(screen.getByText('View account'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/accounts/[id]',
      params: { id: '7' },
    });
  });

  it('offers to make it the default, and says so once it is', async () => {
    const { screen, handleSetCreatedDefault } = await setup();
    await fireEvent.press(screen.getByText('Set as default'));
    expect(handleSetCreatedDefault).toHaveBeenCalledTimes(1);
    const done = await setup({ createdAccount: created({ is_default: true }) });
    expect(done.screen.getByText('Default account')).toBeTruthy();
    expect(done.screen.queryByText('Set as default')).toBeNull();
  });

  it('adds another account and finishes', async () => {
    const { screen, resetNewAccountForm } = await setup();
    await fireEvent.press(screen.getByText('Add another account'));
    expect(resetNewAccountForm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Done'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('shows a save error', async () => {
    expect((await setup({ saveError: 'Nope.' })).screen.getByText('Nope.')).toBeTruthy();
  });
});

describe('AccountSelectionSheet', () => {
  it('lists the options, selects one and closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const screen = await render(
      <AccountSelectionSheet
        visible
        onClose={onClose}
        data={['1', '2', '3']}
        onSelect={onSelect}
        title="Select Due Day"
      />
    );
    expect(screen.getByText('Select Due Day')).toBeTruthy();
    await fireEvent.press(screen.getByText('2'));
    expect(onSelect).toHaveBeenCalledWith('2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
