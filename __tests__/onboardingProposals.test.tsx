import { fireEvent, render } from '@testing-library/react-native';

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

describe('The chosen language reaches Home (P69)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const languages = require('@/lib/speak-language');
  it('answers with the latest choice, not the first read', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('@react-native-async-storage/async-storage');
    await (storage.default ?? storage).clear();
    languages.resetSpeakLanguageForTests();
    expect(await languages.loadSpeakLanguage()).toBe('en');
    languages.setSpeakLanguage('hi');
    expect(await languages.loadSpeakLanguage()).toBe('hi');
  });
});
