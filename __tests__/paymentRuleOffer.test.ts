import AsyncStorage from '@react-native-async-storage/async-storage';

import { notePaymentCorrection } from '@/lib/payment-rule-offer';
import { savePaymentRule } from '@/lib/payment-rules';

jest.mock('@/lib/payment-rules', () => ({
  ...jest.requireActual('@/lib/payment-rules'),
  savePaymentRule: jest.fn(),
}));

const mockedSave = savePaymentRule as jest.MockedFunction<typeof savePaymentRule>;
const fuel = { key: 'f:fuel', label: 'fuel' };

const correct = (confirm: jest.Mock, accountId = 12) =>
  notePaymentCorrection({ token: 't', kind: fuel, accountId, accountName: 'SBI BPCL', confirm });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedSave.mockReset();
  mockedSave.mockResolvedValue({ id: 1 } as never);
});

describe('notePaymentCorrection', () => {
  it('counts the first correction and asks on the second', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    expect(await correct(confirm)).toBe('counted');
    expect(confirm).not.toHaveBeenCalled();

    expect(await correct(confirm)).toBe('asked-yes');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Always use SBI BPCL for fuel?', confirmLabel: 'Always use' })
    );
    expect(mockedSave).toHaveBeenCalledWith('t', 12, 'fuel');
  });

  it('counts each account on its own', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    await correct(confirm, 12);
    expect(await correct(confirm, 7)).toBe('counted');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('never asks again after Not now', async () => {
    const confirm = jest.fn().mockResolvedValue(false);
    await correct(confirm);
    expect(await correct(confirm)).toBe('asked-no');
    expect(await correct(confirm)).toBe('skipped');
    expect(await correct(confirm)).toBe('skipped');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('asks again on the next correction when the rule did not save', async () => {
    mockedSave.mockRejectedValueOnce(new Error('offline'));
    const confirm = jest.fn().mockResolvedValue(true);
    await correct(confirm);
    await correct(confirm);
    expect(await correct(confirm)).toBe('asked-yes');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(mockedSave).toHaveBeenCalledTimes(2);
  });
});
