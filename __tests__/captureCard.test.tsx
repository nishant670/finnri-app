import { fireEvent, render } from '@testing-library/react-native';

import { VoiceInputCard } from '@/components/home/VoiceInputCard';

const captureProps = {
  onMicPress: jest.fn(),
  isRecording: false,
  hasRecording: false,
  inputText: '',
  onChangeText: jest.fn(),
  onProcess: jest.fn(),
  onClear: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

describe('Home capture card (P1, P2)', () => {
  it('offers "Add manually" beside typing', async () => {
    const onAddManually = jest.fn();
    const screen = await render(<VoiceInputCard {...captureProps} onAddManually={onAddManually} />);

    expect(screen.getByText('Type instead')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-manually-home'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('says credits ran out inside the card, with manual entry as its action', async () => {
    const onAddManually = jest.fn();
    const onAction = jest.fn();
    const screen = await render(
      <VoiceInputCard
        {...captureProps}
        onAddManually={onAddManually}
        creditBlock={{
          title: 'No AI credits left today',
          message: 'Voice and typed notes come back tomorrow. Adding manually is always free.',
          footnote: '950 total credits left',
          actionLabel: 'View plans',
          onAction,
        }}
      />
    );

    expect(screen.getByText('No AI credits left today')).toBeTruthy();
    expect(screen.queryByText('Type instead')).toBeNull();
    expect(screen.queryByLabelText('Record an expense')).toBeNull();
    expect(screen.getByText('950 total credits left')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add manually'));
    await fireEvent.press(screen.getByText('View plans'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('lets a refused capture be dismissed', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <VoiceInputCard
        {...captureProps}
        creditBlock={{
          title: 'AI credits are low',
          message: 'This capture needs 25 credits. You have 10 available.',
          actionLabel: 'View plans',
          onAction: jest.fn(),
          onDismiss,
        }}
      />
    );

    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a low balance as a strip at the card foot', async () => {
    const onAction = jest.fn();
    const screen = await render(
      <VoiceInputCard
        {...captureProps}
        creditNote={{ text: '8 of 50 AI credits left today', actionLabel: 'View plans', onAction }}
      />
    );

    expect(screen.getByText('Tap and speak')).toBeTruthy();
    expect(screen.getByText('8 of 50 AI credits left today')).toBeTruthy();
    await fireEvent.press(screen.getByText('View plans'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
