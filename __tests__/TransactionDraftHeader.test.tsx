import { render } from '@testing-library/react-native';

import {
  TransactionDraftBanner,
  TransactionDraftSource,
} from '@/components/transactions/TransactionDraftHeader';

describe('TransactionDraftSource', () => {
  it.each([
    ['voice', 'You said'],
    ['text', 'You typed'],
    ['receipt', 'Read from your receipt'],
    [undefined, 'You said'],
  ] as const)('labels a %s input', async (inputSource, label) => {
    const screen = await render(
      <TransactionDraftSource inputSource={inputSource} sourceText="coffee 120" />
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId('draft-source-text').props.children.join('')).toContain('coffee 120');
  });
});

describe('TransactionDraftBanner', () => {
  const setup = (props: Partial<React.ComponentProps<typeof TransactionDraftBanner>> = {}) =>
    render(
      <TransactionDraftBanner
        isParsing={false}
        fieldsToCheck={0}
        hasReviewMetadata={false}
        checkList={[]}
        {...props}
      />
    );

  it('says it is reading while parsing, whatever the counts', async () => {
    const screen = await setup({ isParsing: true, fieldsToCheck: 3 });
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.getByText(/Picking out the amount, category and account/)).toBeTruthy();
    expect(screen.queryByText(/to check/)).toBeNull();
  });

  it('counts the fields to check, singular and plural', async () => {
    expect((await setup({ fieldsToCheck: 1 })).getByText('1 field to check')).toBeTruthy();
    expect((await setup({ fieldsToCheck: 2 })).getByText('2 fields to check')).toBeTruthy();
  });

  it('distinguishes a clean draft from one with no confidence data', async () => {
    expect((await setup({ hasReviewMetadata: true })).getByText('No issues flagged')).toBeTruthy();
    expect((await setup()).getByText('Review all fields')).toBeTruthy();
  });

  it('lists the fields to check only when given some', async () => {
    expect((await setup()).queryByText(/^Check:/)).toBeNull();
    const screen = await setup({ fieldsToCheck: 2, checkList: ['Category', 'Account'] });
    expect(screen.getByText('Check: Category, Account')).toBeTruthy();
  });

  it('shows the clarifying questions and the standing reassurance', async () => {
    const screen = await setup({ clarifications: ['Which card?', 'Was this a refund?'] });
    expect(screen.getByText('Which card?')).toBeTruthy();
    expect(screen.getByText('Was this a refund?')).toBeTruthy();
    expect(screen.getByText('AI suggestions are never saved until you confirm.')).toBeTruthy();
  });
});
