import { accountIdFromActionURL, isRecurringActionURL } from '@/lib/notifications';

jest.mock('expo-notifications', () => ({}));

describe('accountIdFromActionURL', () => {
  it('opens the card for the annual-fee reminder, which carries its renewal year', () => {
    expect(accountIdFromActionURL('/accounts/7?fee_year=2027')).toBe('7');
  });

  it('still opens plain account links', () => {
    expect(accountIdFromActionURL('/accounts/42')).toBe('42');
  });

  it('ignores anything else', () => {
    expect(accountIdFromActionURL('/accounts/abc')).toBeNull();
    expect(accountIdFromActionURL('/entry/3')).toBeNull();
    expect(accountIdFromActionURL(undefined)).toBeNull();
  });
});

describe('isRecurringActionURL', () => {
  it('opens the Recurring tab for a finished schedule', () => {
    expect(isRecurringActionURL('/recurring/12')).toBe(true);
    expect(isRecurringActionURL('/recurring')).toBe(true);
    expect(isRecurringActionURL('/recurring-candidates')).toBe(false);
    expect(isRecurringActionURL(undefined)).toBe(false);
  });
});
