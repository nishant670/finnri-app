import { fireEvent, render } from '@testing-library/react-native';

import { FirstEntryCard } from '@/components/home/FirstEntryCard';
import Screen1 from '@/components/onboarding/Screen1';
import {
  CAPTURE_HINTS,
  FIRST_ENTRY_PHRASE,
  SPEAK_LANGUAGES,
  resetSpeakLanguageForTests,
} from '@/lib/speak-language';

describe('Say it. Check it. Done. (P68, P69)', () => {
  beforeEach(() => resetSpeakLanguageForTests());

  it('offers English and Hindi only, the two whose parsing is checked', () => {
    expect(SPEAK_LANGUAGES.map((language) => language.key)).toEqual(['en', 'hi']);
    expect(CAPTURE_HINTS.hi.length).toBe(CAPTURE_HINTS.en.length);
  });

  it('shows the sentence and its draft together, in the chosen language', async () => {
    const screen = await render(<Screen1 />);
    expect(screen.getByText('Say it. Check it. Done.')).toBeTruthy();
    expect(screen.getByText(`You said “${FIRST_ENTRY_PHRASE.en}”`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('onboarding-language-hi'));
    expect(await screen.findByText(`You said “${FIRST_ENTRY_PHRASE.hi}”`)).toBeTruthy();
  });
});

describe('First entry on Home (P70)', () => {
  const setup = (over: Partial<React.ComponentProps<typeof FirstEntryCard>> = {}) => {
    const props = {
      text: FIRST_ENTRY_PHRASE.en,
      placeholder: FIRST_ENTRY_PHRASE.en,
      onChangeText: jest.fn(),
      onSend: jest.fn(),
      isSending: false,
      onSayInstead: jest.fn(),
      onAddByHand: jest.fn(),
      ...over,
    };
    return render(<FirstEntryCard {...props} />).then((screen) => ({ screen, props }));
  };

  it('sends the offered sentence, or puts it away for the microphone', async () => {
    const { screen, props } = await setup();
    expect(screen.getByDisplayValue(FIRST_ENTRY_PHRASE.en)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('first-entry-send'));
    expect(props.onSend).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Say it instead'));
    expect(props.onSayInstead).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Add by hand'));
    expect(props.onAddByHand).toHaveBeenCalled();
  });

  it('cannot send an empty field', async () => {
    const { screen, props } = await setup({ text: '' });
    await fireEvent.press(screen.getByTestId('first-entry-send'));
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
