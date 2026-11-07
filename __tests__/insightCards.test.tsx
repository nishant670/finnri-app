import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AccountIntelligence } from '@/components/insights/AccountIntelligence';
import { InsightsUnlockProgressCard } from '@/components/insights/InsightsUnlockProgressCard';
import { PillButton } from '@/components/insights/PillButton';
import { SectionHeader } from '@/components/insights/SectionHeader';
import { View } from 'react-native';
import type { DashboardResponse } from '@/lib/insights';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const dash = (over: Record<string, unknown> = {}) =>
  ({
    insights: [],
    recurring_candidates: [],
    budget_statuses: [],
    account_spending: [],
    top_categories: [],
    summary: { daily_average: 0 },
    ...over,
  }) as unknown as DashboardResponse;

afterEach(() => jest.clearAllMocks());

describe('SectionHeader', () => {
  it('shows the title and children, and only offers an action when labelled', async () => {
    const onAction = jest.fn();
    const screen = await render(
      <SectionHeader title="Smart alerts" actionLabel="See all" onAction={onAction}>
        <View testID="body" />
      </SectionHeader>
    );
    expect(screen.getByText('Smart alerts')).toBeTruthy();
    expect(screen.getByTestId('body')).toBeTruthy();
    await fireEvent.press(screen.getByText('See all'));
    expect(onAction).toHaveBeenCalledTimes(1);
    const bare = await render(
      <SectionHeader title="Plain">
        <View />
      </SectionHeader>
    );
    expect(bare.queryByText('See all')).toBeNull();
  });
});

describe('PillButton', () => {
  it('renders its label and presses', async () => {
    const onPress = jest.fn();
    const screen = await render(<PillButton label="Review" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Review'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('InsightsUnlockProgressCard', () => {
  it('renders for a partial count without crashing', async () => {
    const screen = await render(<InsightsUnlockProgressCard count={2} />);
    expect(screen.toJSON()).not.toBeNull();
  });
});

describe('AccountIntelligence', () => {
  it('renders an empty account list without crashing', async () => {
    const screen = await render(<AccountIntelligence dashboard={dash()} />);
    expect(screen.toJSON()).not.toBeNull();
  });
});
