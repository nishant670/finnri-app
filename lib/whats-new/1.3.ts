import type { WhatsNewRelease } from './types';

/**
 * Finnri 1.3: everything on testing after Play build 14, staged as versionCode
 * 15 (app#128, #129, #130, #138, #139, #140, #141, #142, #143, #144).
 *
 * Add to this file as more lands on testing before 1.3 goes to Play: a
 * staging phone that already saw these notes sees them again once they change.
 * Undo is only on Speak your day saves, so it is said there and nowhere else.
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
      body: 'Say or type up to 10 spends at once, like “chai 20, auto 80, lunch 250”. Check them in one list, save them together, and Undo for a few seconds after.',
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
      body: 'Pick your exact card when you add it. All cards shows each one with what you owe, when it’s due, and Mark paid.',
      link: '/cards',
    },
    {
      kind: 'improved',
      title: 'A Health category',
      body: 'Medicines and doctor visits now go under Health.',
    },
    {
      kind: 'fix',
      title: 'Cards saved as bank accounts',
      problem: 'Adding a card from + Add could save it as a bank account, so it never showed under Cards.',
      fix: 'Add now asks what you’re adding first, and Add another keeps the same type.',
    },
    {
      kind: 'fix',
      title: 'A friend’s total, said honestly',
      problem: 'A friend’s page could say they owed you everything “in Goa Trip”, even money from outside the group, and a bill shared with others showed the whole amount you lent.',
      fix: 'It now says “in total” or “across 2 groups” when that’s where the money is, and each bill shows just that friend’s share.',
    },
  ],
};
