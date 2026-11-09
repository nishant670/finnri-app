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

describe('a failed recording is offered once, on the failure card', () => {
  it('says the recording is kept and its × throws it away', async () => {
    const failure = describeParseFailure(new TypeError('Network request failed'));
    const onDismiss = jest.fn();
    const screen = await render(
      <ParseErrorCard failure={failure} {...cardProps} onDismiss={onDismiss} keptRecording />
    );

    expect(screen.getByText('Your recording is saved for Try again.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Discard recording'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('the capture card around a recording', () => {
  const captureProps = {
    onMicPress: jest.fn(),
    isRecording: false,
    hasRecording: true,
    inputText: '',
    onChangeText: jest.fn(),
    onProcess: jest.fn(),
    onClear: jest.fn(),
  };

  it('has no "Use this" step: a clip being read shows the read and a Cancel', async () => {
    const onCancelProcessing = jest.fn();
    const screen = await render(
      <VoiceInputCard {...captureProps} isProcessing onCancelProcessing={onCancelProcessing} />
    );

    expect(screen.queryByText('Use this')).toBeNull();
    expect(screen.getByText('Reading your recording…')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onCancelProcessing).toHaveBeenCalledTimes(1);
  });

  // The failure card below carries Try again; the capture card offering one
  // too was the duplicate.
  it('goes back to the mic once that recording has failed', async () => {
    const screen = await render(<VoiceInputCard {...captureProps} hasFailed />);

    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText('Recording kept')).toBeNull();
    expect(screen.getByLabelText('Record an expense')).toBeTruthy();
  });

  it('offers Discard while it records', async () => {
    const onDiscardRecording = jest.fn();
    const screen = await render(
      <VoiceInputCard
        {...captureProps}
        hasRecording={false}
        isRecording
        onDiscardRecording={onDiscardRecording}
      />
    );

    await fireEvent.press(screen.getByTestId('voice-discard-recording'));
    expect(onDiscardRecording).toHaveBeenCalledTimes(1);
  });
});
