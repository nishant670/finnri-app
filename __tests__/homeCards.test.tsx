import { fireEvent, render } from '@testing-library/react-native';
import { Animated as RNAnimated } from 'react-native';

import { AccountSetupNudgeCard } from '@/components/home/AccountSetupNudgeCard';
import { AutopayReviewCard } from '@/components/home/AutopayReviewCard';
import { CreditActionCard } from '@/components/home/CreditActionCard';
import { HomeAddButton } from '@/components/home/HomeAddButton';
import { HomeRecentActivity } from '@/components/home/HomeRecentActivity';
import { PendingQuestionNotice } from '@/components/home/PendingQuestionNotice';
import { SaveConfirmationToast } from '@/components/home/SaveConfirmationToast';
import type { Transaction } from '@/types/transaction';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  router: { push: jest.fn() },
}));

afterEach(() => jest.clearAllMocks());

const tx = (id: string, over: Partial<Transaction> = {}) =>
  ({
    id,
    name: `Item ${id}`,
    category: 'Food & Drinks',
    amount: -120,
    icon: 'food',
    section: 'Today',
    entryType: 'expense',
    mode: 'UPI',
    dateLabel: '5 October 2026',
    rawDate: '2026-10-05',
    ...over,
  }) as Transaction;

describe('HomeRecentActivity', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof HomeRecentActivity>> = {}) => {
    const h = { onRetry: jest.fn(), onAdd: jest.fn() };
    const screen = await render(
      <HomeRecentActivity
        isEntriesLoading={false}
        entriesError={null}
        hasTransactions
        transactions={[tx('1'), tx('2')]}
        newTransactionId={null}
        isStealthMode={false}
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('shows a skeleton while loading', async () => {
    const { screen } = await setup({ isEntriesLoading: true });
    expect(screen.getByTestId('home-activity-skeleton')).toBeTruthy();
  });

  it('offers a retry when the feed failed to load', async () => {
    const { screen, onRetry } = await setup({ entriesError: 'Network down' });
    expect(screen.getByText('Activity did not load')).toBeTruthy();
    expect(screen.getByText('Network down')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('invites the first transaction when there are none', async () => {
    const { screen, onAdd } = await setup({ hasTransactions: false, transactions: [] });
    expect(screen.getByText('No activity yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('lists the five most recent rows under their section heading', async () => {
    const many = ['1', '2', '3', '4', '5', '6', '7'].map((id) => tx(id));
    const { screen } = await setup({ transactions: many });
    expect(screen.getByText('Recent Activity')).toBeTruthy();
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Item 5')).toBeTruthy();
    expect(screen.queryByText('Item 6')).toBeNull();
  });

  it('opens the full list and a row’s detail', async () => {
    const { screen } = await setup();
    await fireEvent.press(screen.getByText('See All'));
    expect(mockPush).toHaveBeenCalledWith('/transactions');
    await fireEvent.press(screen.getByText('Item 1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/entry/[id]',
        params: expect.objectContaining({
          id: '1',
          name: 'Item 1',
          entryType: 'expense',
          mode: 'UPI',
        }),
      })
    );
  });
});

describe('AutopayReviewCard', () => {
  it('confirms or reverts', async () => {
    const onConfirm = jest.fn();
    const onRevert = jest.fn();
    const screen = await render(<AutopayReviewCard onConfirm={onConfirm} onRevert={onRevert} />);
    expect(screen.getByText('Autopay transaction added')).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm'));
    await fireEvent.press(screen.getByText('Correct / revert'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});

describe('AccountSetupNudgeCard', () => {
  it('shows the nudge and handles both actions', async () => {
    const onComplete = jest.fn();
    const onLater = jest.fn();
    const screen = await render(
      <AccountSetupNudgeCard
        title="Finish HDFC"
        body="Add the last 4 digits"
        onComplete={onComplete}
        onLater={onLater}
      />
    );
    expect(screen.getByText('Finish HDFC')).toBeTruthy();
    expect(screen.getByText('Add the last 4 digits')).toBeTruthy();
    await fireEvent.press(screen.getByText('Complete setup'));
    await fireEvent.press(screen.getByText('Later'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
  });
});

describe('CreditActionCard', () => {
  it('shows the message and presses its action', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <CreditActionCard
        creditAction={{
          title: 'AI credits are low',
          message: 'You have 2 left.',
          actionLabel: 'View plans',
          action: 'upgrade',
        }}
        onPress={onPress}
      />
    );
    expect(screen.getByText('AI credits are low')).toBeTruthy();
    expect(screen.getByText('You have 2 left.')).toBeTruthy();
    await fireEvent.press(screen.getByText('View plans'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PendingQuestionNotice', () => {
  it('says the question is being looked up', async () => {
    const screen = await render(<PendingQuestionNotice />);
    expect(screen.getByText('Looking through your transactions…')).toBeTruthy();
  });
});

describe('HomeAddButton', () => {
  it('opens manual entry', async () => {
    const onPress = jest.fn();
    const screen = await render(<HomeAddButton onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SaveConfirmationToast', () => {
  it('shows the message as a polite live region', async () => {
    const screen = await render(
      <SaveConfirmationToast message="Saved with refund" anim={new RNAnimated.Value(1)} />
    );
    expect(screen.getByText('Saved with refund')).toBeTruthy();
  });
});
