import { render } from '@testing-library/react-native';

import {
  TransactionDraftSource,
  TransactionDraftStatus,
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

describe('TransactionDraftStatus', () => {
  const setup = (props: Partial<React.ComponentProps<typeof TransactionDraftStatus>> = {}) =>
    render(
      <TransactionDraftStatus
        isParsing={false}
        fieldsToCheck={0}
        hasReviewMetadata={false}
        {...props}
      />
    );

  it('says it is reading while parsing, whatever the counts', async () => {
    const screen = await setup({ isParsing: true, fieldsToCheck: 3 });
    expect(screen.getByText('Reading your entry…')).toBeTruthy();
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

  it('shows the clarifying questions once the draft has landed', async () => {
    const screen = await setup({ clarifications: ['Which card?', 'Was this a refund?'] });
    expect(screen.getByText('Which card?')).toBeTruthy();
    expect(screen.getByText('Was this a refund?')).toBeTruthy();
    const parsing = await setup({ isParsing: true, clarifications: ['Which card?'] });
    expect(parsing.queryByText('Which card?')).toBeNull();
  });
});
