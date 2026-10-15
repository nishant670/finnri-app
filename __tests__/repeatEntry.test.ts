import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { buildRepeatForm } from '@/lib/repeat-entry';

const yesterdaysRide: EntryForm = {
  title: 'E-rickshaw',
  time: '8:40 AM',
  amount: '20',
  type: 'Expense',
  mode: 'UPI',
  category: 'Transport',
  date: '07 October 2026',
  notes: 'Home to metro',
  tag: 'General',
  currency: 'INR',
  accountId: 4,
  account: 'HDFC UPI',
  merchant: 'Raju',
  attachment: 'receipts/abc.jpg',
  splitEnabled: true,
  splitGroupId: 2,
  splitGroupName: 'Office',
  splitParticipants: [
    { friendId: 9, friendName: 'Asha', shareAmount: '10', direction: 'friend_owes_user' },
  ],
  refundableAmount: '',
  refundExpectedOn: '',
  refundReminderEnabled: true,
  emiTenureMonths: '',
  emiRatePct: '',
  emiTotalInstalments: '',
  emiPaidInstalments: '',
  subscriptionEnabled: false,
  subscriptionName: '',
  subscriptionMerchant: '',
  subscriptionCategory: '',
  subscriptionAmount: '',
  subscriptionBillingInterval: '',
  subscriptionNextDueDate: '',
  subscriptionReminderDays: '3',
  subscriptionCancelBeforeDue: false,
  subscriptionCancelOnDate: '',
  subscriptionAutopay: false,
  subscriptionNotes: '',
};

// 8 October 2026, 9:15 in the morning, local time.
const now = new Date(2026, 9, 8, 9, 15);

describe('buildRepeatForm', () => {
  it('copies the spend and dates it today', () => {
    const repeat = buildRepeatForm(yesterdaysRide, { now });

    expect(repeat).toMatchObject({
      title: 'E-rickshaw',
      amount: '20',
      type: 'Expense',
      mode: 'UPI',
      category: 'Transport',
      notes: 'Home to metro',
      tag: 'General',
      accountId: 4,
      account: 'HDFC UPI',
      merchant: 'Raju',
      date: '08 October 2026',
    });
    expect(repeat.time).toMatch(/9:15|09:15/);
  });

  it('leaves the receipt and the split behind', () => {
    // The photo is of the old bill, and a copied split would put new debts on
    // friends without asking them.
    const repeat = buildRepeatForm(yesterdaysRide, { now });

    expect(repeat.attachment).toBeNull();
    expect(repeat.splitEnabled).toBe(false);
    expect(repeat.splitGroupId).toBeNull();
    expect(repeat.splitParticipants).toEqual([]);
  });

  it('does not start a second EMI plan from a card EMI', () => {
    const repeat = buildRepeatForm(
      { ...yesterdaysRide, tag: 'EMI', mode: 'Credit Card' },
      { now, accountType: 'credit_card' }
    );

    expect(repeat.tag).toBe('General');
  });

  it('keeps a loan EMI paid from a bank as an EMI', () => {
    const repeat = buildRepeatForm({ ...yesterdaysRide, tag: 'EMI' }, { now, accountType: 'bank' });

    expect(repeat.tag).toBe('EMI');
    expect(repeat.subscriptionEnabled).toBe(false);
  });

  it('moves a refund due date by as many days as the entry moved', () => {
    const repeat = buildRepeatForm(
      {
        ...yesterdaysRide,
        tag: 'Refundable',
        refundableAmount: '20',
        refundExpectedOn: '14 October 2026',
      },
      { now }
    );

    expect(repeat.refundableAmount).toBe('20');
    expect(repeat.refundExpectedOn).toBe('15 October 2026');
  });

  it('asks for the refund date when the old one cannot be read', () => {
    const repeat = buildRepeatForm(
      { ...yesterdaysRide, tag: 'Refundable', refundableAmount: '20', refundExpectedOn: '' },
      { now }
    );

    expect(repeat.refundExpectedOn).toBe('');
  });

  it('clears refund fields left over on an entry that is no longer refundable', () => {
    const repeat = buildRepeatForm(
      { ...yesterdaysRide, refundableAmount: '20', refundExpectedOn: '14 October 2026' },
      { now }
    );

    expect(repeat.refundableAmount).toBe('');
    expect(repeat.refundExpectedOn).toBe('');
  });
});
