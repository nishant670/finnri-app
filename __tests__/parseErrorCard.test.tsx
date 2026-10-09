import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ParseErrorCard } from '@/components/home/ParseErrorCard';
import { VoiceInputCard } from '@/components/home/VoiceInputCard';
import { describeParseFailure, ParseApiError } from '@/lib/parse';

const schemaFailure = () =>
  describeParseFailure(
    new ParseApiError(
      {
        error: 'schema_invalid',
        transcript: 'I paid 10000 as an advance payment to landlord, split in group bubu-dudu',
      },
      422,
      'fallback'
    )
  );

const cardProps = {
  onRetry: jest.fn(),
  onDismiss: jest.fn(),
  onUseExample: jest.fn(),
  onAddManually: jest.fn(),
};

describe('the failed-capture card', () => {
  it('shows what was heard, so a misheard word is visible', async () => {
    const screen = await render(<ParseErrorCard failure={schemaFailure()} {...cardProps} />);

    expect(screen.getByText(/advance payment to landlord/)).toBeTruthy();
    expect(screen.getByText('WHAT FINNRI HEARD')).toBeTruthy();
  });

  it('retries the same capture and offers the manual way through', async () => {
    const onRetry = jest.fn();
    const onAddManually = jest.fn();
    const screen = await render(
      <ParseErrorCard
        failure={schemaFailure()}
        {...cardProps}
        onRetry={onRetry}
        onAddManually={onAddManually}
      />
    );

    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Add manually'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('hands an example to the field rather than sending it', async () => {
    const onUseExample = jest.fn();
    const failure = schemaFailure();
    const screen = await render(
      <ParseErrorCard failure={failure} {...cardProps} onUseExample={onUseExample} />
    );

    await fireEvent.press(screen.getByText(failure.examples[0]));
    expect(onUseExample).toHaveBeenCalledWith(failure.examples[0]);
  });

  it('drops the retry when re-sending the same words cannot help', async () => {
    const failure = describeParseFailure(
      new ParseApiError({ error: 'non_transactional_prompt' }, 422, 'fallback')
    );
    const screen = await render(<ParseErrorCard failure={failure} {...cardProps} />);

    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.getByText('Add manually')).toBeTruthy();
  });
});

describe('the capture card after a failure', () => {
  const captureProps = {
    onMicPress: jest.fn(),
    isRecording: false,
    hasRecording: true,
    inputText: '',
    onChangeText: jest.fn(),
    onProcess: jest.fn(),
    onClear: jest.fn(),
  };

  it('offers to process a fresh recording', async () => {
    const screen = await render(<VoiceInputCard {...captureProps} />);

    expect(screen.getByText('Use this')).toBeTruthy();
    expect(screen.getByText('Recording ready')).toBeTruthy();
  });

  // "Process" under an error about the thing it just failed to process reads
  // as though the app did not notice.
  it('offers to try again once that recording has failed', async () => {
    const onProcess = jest.fn();
    const screen = await render(
      <VoiceInputCard {...captureProps} onProcess={onProcess} hasFailed />
    );

    expect(screen.queryByText('Use this')).toBeNull();
    await fireEvent.press(screen.getByText('Try again'));
    expect(onProcess).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});
