import type { WhatsNewRelease } from './types';

/**
 * Finnri 1.2: Play build 14 (master f474dd3, app#124), the 10 and 17 November
 * staging work.
 *
 * Build 14 itself went to Play before these notes were written, so it doesn't
 * carry them: they reach phones from the API before updating, and from 1.3
 * onwards as history.
 */
export const release1_2: WhatsNewRelease = {
  versionCode: 14,
  versionName: '1.2',
  month: '2026-11',
  headline: 'Your salary can repeat, Ask Finnri has its own button, and widget voice notes come through.',
  items: [
    {
      kind: 'new',
      title: 'Salary that repeats',
      body: 'Turn on Make it recurring when you add income. Finnri reminds you on the day, and Recurring shows what’s coming in.',
      link: '/subscriptions',
    },
    {
      kind: 'new',
      title: 'Ask Finnri, one tap away',
      body: 'Tap ✦ Ask at the top of Home to ask about your money, however far you’ve scrolled.',
      link: '/ask',
    },
    {
      kind: 'new',
      title: 'An event, one category at a time',
      body: 'On an event, tap a category under Where it went to see only those spends.',
    },
    {
      kind: 'fix',
      title: 'Voice notes from the widget',
      problem: 'Recording from the widget and tapping Stop and review showed “Reading your recording…”, then nothing.',
      fix: 'The review sheet now opens with what you said.',
    },
    {
      kind: 'improved',
      title: 'Autopay charges in one place',
      body: 'Confirm them one by one or all at once, and Needs you shows what’s due first.',
    },
    {
      kind: 'improved',
      title: 'Forms take you to what you open',
      body: 'Open a section and the form scrolls to it. Refunds get a Full amount button.',
    },
  ],
};
