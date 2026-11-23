import type { WhatsNewRelease } from './types';

/**
 * Finnri 1.3: everything on testing after Play build 14, staged as versionCode
 * 15 (app#128, #129, #130, #138, #139, #140, #141).
 *
 * Add to this file as more lands on testing before 1.3 goes to Play: a
 * staging phone that already saw these notes sees them again once they change.
 */
export const release1_3: WhatsNewRelease = {
  versionCode: 15,
  versionName: '1.3',
  month: '2026-11',
  headline: 'Say your whole day in one go, scan five bills at once, and see your cards as they look.',
  items: [
    {
      kind: 'new',
      title: 'Speak your day',
      body: 'Say or type up to 10 spends at once, like “chai 20, auto 80, lunch 250”. Check them in one list and save them together.',
      link: '/',
    },
    {
      kind: 'new',
      title: 'Scan up to 5 bills at once',
      body: 'Take or pick up to five photos, see the price before anything is read, and save them separately or as one total.',
      link: '/bills',
    },
    {
      kind: 'new',
      title: 'Your credit cards, drawn',
      body: 'Pick your exact card when you add it. All cards shows each one with its bill and Mark paid.',
      link: '/cards',
    },
    {
      kind: 'improved',
      title: 'Undo right after saving',
      body: 'The Saved message has Undo for a few seconds. Medicines and doctor visits now go under the new Health category.',
    },
    {
      kind: 'fix',
      title: 'A friend’s total, said honestly',
      problem: 'A friend’s page could say they owed you everything “in Goa Trip”, even money from outside the group.',
      fix: 'It now says “in total” or “across 2 groups” when that’s where the money is.',
    },
  ],
};
