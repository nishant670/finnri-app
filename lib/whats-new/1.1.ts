import type { WhatsNewRelease } from './types';

/**
 * Finnri 1.1: the 5 and 7 November staging batches.
 *
 * Drafted from the PRs merged to testing since 1.0 (versionCode 12) reached
 * Play. Fixes say what people saw, not the code cause; at most six cards.
 */
export const release1_1: WhatsNewRelease = {
  versionCode: 13,
  versionName: '1.1',
  month: '2026-11',
  headline: 'Finnri remembers how you pay, keeps wallets and Pay later in step, and looks fresher.',
  items: [
    {
      kind: 'new',
      title: 'Finnri remembers how you pay',
      body: 'Always fill up with the same card? Finnri picks it for you, and you can set your own rules on a card’s page.',
      preview: 'payment-habit',
      link: '/accounts/manage',
    },
    {
      kind: 'new',
      title: 'Wallet balances and Pay later',
      body: 'Keep a wallet’s balance up to date from its top-ups, and add CRED flash, LazyPay or Simpl as Pay later.',
      preview: 'wallets',
      link: '/accounts/manage',
    },
    {
      kind: 'new',
      title: 'Balance alerts for groups',
      body: 'Set an amount on a group, and everyone hears about it once the balance goes past it.',
    },
    {
      kind: 'ui',
      title: 'A fresh look for Profile, Notifications and more',
      body: 'Profile, Notifications, the calculators, Ask Finnri, account pages and the welcome screens are all redesigned.',
      preview: 'profile',
    },
    {
      kind: 'fix',
      title: 'Ask Finnri answers what you asked',
      problem: 'Asking about “fuel” counted every cab and rickshaw too, and “9 October” showed the whole month.',
      fix: 'Answers now stick to the exact word and the exact day you asked about.',
    },
    {
      kind: 'improved',
      title: 'Fewer duplicate warnings',
      body: '“Similar transaction found” now only appears for the same day and amount, from ₹100 up.',
    },
  ],
};
