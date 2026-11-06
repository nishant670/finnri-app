import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * The language someone said they mostly speak (P69, board R13-Ob-Proposals).
 *
 * It picks example phrases — onboarding's, Home's rotating hints, the first
 * entry Home offers — and nothing else: the parser reads whatever it is
 * given either way. Only English and Hindi, the two whose parsing has been
 * checked; a language is offered here only once that holds for it too.
 */
export type SpeakLanguage = 'en' | 'hi';

export const SPEAK_LANGUAGES: { key: SpeakLanguage; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'हिंदी' },
];

const STORAGE_KEY = 'finnri_speak_language_v1';

let cache: SpeakLanguage = 'en';
let loaded: Promise<SpeakLanguage> | null = null;
const listeners = new Set<(language: SpeakLanguage) => void>();

const isLanguage = (value: unknown): value is SpeakLanguage => value === 'en' || value === 'hi';

export const loadSpeakLanguage = () => {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      if (isLanguage(stored)) cache = stored;
      return cache;
    })
    .catch(() => cache);
  return loaded;
};

export const setSpeakLanguage = (language: SpeakLanguage) => {
  cache = language;
  listeners.forEach((listener) => listener(language));
  void AsyncStorage.setItem(STORAGE_KEY, language).catch(() => undefined);
};

/** The chosen language, English until a choice is read back from storage. */
export function useSpeakLanguage(): SpeakLanguage {
  const [language, setLanguage] = useState<SpeakLanguage>(cache);
  useEffect(() => {
    let active = true;
    void loadSpeakLanguage().then((stored) => {
      if (active) setLanguage(stored);
    });
    listeners.add(setLanguage);
    return () => {
      active = false;
      listeners.delete(setLanguage);
    };
  }, []);
  return language;
}

/** The one sentence onboarding and the first entry show, in each language. */
export const FIRST_ENTRY_PHRASE: Record<SpeakLanguage, string> = {
  en: 'Spent ₹250 on lunch via UPI',
  hi: 'लंच पर UPI से ₹250 खर्च',
};

/** Home's rotating "Tap and speak" hints, in each language. */
export const CAPTURE_HINTS: Record<SpeakLanguage, string[]> = {
  en: [
    'Spent 250 on food via UPI',
    'Got 2000 from freelance',
    'Paid 1200 rent by bank',
    'Coffee 180 using card',
  ],
  hi: ['खाने पर UPI से 250 खर्च', 'फ्रीलांस से 2000 मिले', 'किराया 1200 बैंक से दिया', 'कॉफ़ी 180 कार्ड से'],
};

/** Tests only. */
export const resetSpeakLanguageForTests = () => {
  cache = 'en';
  loaded = null;
  listeners.clear();
};
