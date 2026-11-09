import type { Href } from 'expo-router';

/**
 * The four kinds of card on the "What's new" screen (boards R15-WhatsNew*).
 *
 * - `new`: a feature. A live preview of its screen and a Try it link.
 * - `ui`: a new look. A live preview of the new screen; there is no "before",
 *   because the old screen's code is gone.
 * - `fix`: what users saw going wrong, and what works now. Text only.
 * - `improved`: one line, optionally with a second.
 */
export type WhatsNewKind = 'new' | 'ui' | 'fix' | 'improved';

/** A live preview drawn from the real components, in the viewer's theme. */
export type WhatsNewPreview = 'payment-habit' | 'wallets' | 'profile';

export type WhatsNewItem = {
  kind: WhatsNewKind;
  title: string;
  body?: string;
  /** `fix` only: what users saw going wrong. */
  problem?: string;
  /** `fix` only: what works now. */
  fix?: string;
  preview?: WhatsNewPreview;
  /** Where Try it goes. `new` only. */
  link?: Href;
};

/**
 * One release's notes. Bundled releases are written in this repo, one file
 * each, and carry previews; releases the build doesn't know yet arrive from
 * the API as text, for the update card and the screen before updating.
 */
export type WhatsNewRelease = {
  /** The Play versionCode the notes belong to. */
  versionCode: number;
  /** What people see: "1.1". */
  versionName: string;
  /** `YYYY-MM`, shown as "November 2026". */
  month: string;
  headline: string;
  items: WhatsNewItem[];
};
