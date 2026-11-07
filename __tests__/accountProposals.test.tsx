import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AccountCategoriesCard } from '@/components/accounts/AccountCategoriesCard';
import { SetupChecklist } from '@/components/accounts/SetupChecklist';
import { getAccountSetupItems, setupInlineField, withSetupDetail } from '@/lib/account-display';
import type { Account } from '@/lib/accounts';
import { formatMoney } from '@/lib/money';

const card = {
  id: 7,
  type: 'credit_card',
  name: 'Credit Card 1',
  color: '#8257E5',
  provider: '',
  credit_limit: 0,
  due_day: 0,
} as unknown as Account;

describe('Fill a missing detail in place (P62)', () => {
  it('opens limit, last 4 and due date in place, and leaves the issuer to the form', () => {
    const items = getAccountSetupItems(card);
    const field = (key: string) => setupInlineField(card, items.find((item) => item.key === key)!);
    expect(field('provider')).toBeNull();
    expect(field('limit')?.prefix).toBe('₹');
    expect(field('identifier')?.validate('12')).toBe('Enter the last 4 digits');
    expect(field('due')?.validate('32')).toBe('Enter a day from 1 to 31');
    expect(withSetupDetail(card, 'limit', '1,00,000').credit_limit).toBe(100000);
    expect(withSetupDetail(card, 'identifier', '•••• 1001').last4).toBe('1001');
  });

  it('saves from the row and closes it', async () => {
    const onSaveInline = jest.fn().mockResolvedValue(undefined);
    const onAdd = jest.fn();
    const items = getAccountSetupItems(card);
    const screen = await render(
      <SetupChecklist
        title="Finish setting up"
        items={items}
        onAdd={onAdd}
        inlineFieldFor={(item) => setupInlineField(card, item)}
        onSaveInline={onSaveInline}
      />
    );
    await fireEvent.press(screen.getByTestId('setup-add-limit'));
    await fireEvent.changeText(screen.getByLabelText('Credit limit'), '50000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaveInline).toHaveBeenCalledWith(expect.objectContaining({ key: 'limit' }), '50000'));
    await waitFor(() => expect(screen.queryByTestId('setup-inline-field')).toBeNull());

    // The issuer is picked from a list, so it still opens the form.
    await fireEvent.press(screen.getByTestId('setup-add-provider'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('says what is wrong instead of saving it', async () => {
    const onSaveInline = jest.fn();
    const screen = await render(
      <SetupChecklist
        title="Finish setting up"
        items={getAccountSetupItems(card)}
        onAdd={jest.fn()}
        inlineFieldFor={(item) => setupInlineField(card, item)}
        onSaveInline={onSaveInline}
      />
    );
    await fireEvent.press(screen.getByTestId('setup-add-due'));
    await fireEvent.changeText(screen.getByLabelText('Due date'), '40');
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Enter a day from 1 to 31')).toBeTruthy();
    expect(onSaveInline).not.toHaveBeenCalled();
  });
});

describe('Where it went, per account (P63)', () => {
  it('lists categories with their change, or says there is nothing to compare', async () => {
    const screen = await render(
      <AccountCategoriesCard
        data={{
          account_id: 7,
          month: '2026-10',
          previous_month: '2026-09',
          total: 3928,
          previous_total: 0,
          categories: [{ category: 'Transport', amount: 3928, percentage: 100, previous_amount: 0 }],
        }}
      />
    );
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText(formatMoney(3928))).toBeTruthy();
    expect(screen.getByText('Nothing on this account in September to compare with.')).toBeTruthy();
  });
});
