import { release1_1 } from './1.1';
import type { WhatsNewRelease } from './types';

export type { WhatsNewItem, WhatsNewKind, WhatsNewPreview, WhatsNewRelease } from './types';

/**
 * Every release this build has notes for, newest first.
 *
 * A new release is one new file beside `1.1.ts`, added at the top of this
 * list. `scripts/publish-release-notes` sends the same file to the API, which
 * is how older builds learn what is coming.
 */
export const BUNDLED_RELEASES: readonly WhatsNewRelease[] = [release1_1];

export const findBundledRelease = (versionCode: number) =>
  BUNDLED_RELEASES.find((release) => release.versionCode === versionCode) ?? null;

/** "2026-11" → "November 2026". */
export function releaseMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return '';
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

const KIND_COUNT_LABELS = {
  new: (count: number) => `${count} new`,
  ui: (count: number) => (count === 1 ? '1 new look' : `${count} new looks`),
  fix: (count: number) => `${count} fixed`,
  improved: (count: number) => `${count} better`,
} as const;

/** The hero's chips: "3 new", "1 new look", "1 fixed", in card order. */
export function releaseCountChips(release: Pick<WhatsNewRelease, 'items'>) {
  const order = ['new', 'ui', 'fix', 'improved'] as const;
  return order
    .map((kind) => ({ kind, count: release.items.filter((item) => item.kind === kind).length }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => ({ kind, label: KIND_COUNT_LABELS[kind](count) }));
}

/**
 * Releases installed since the person last saw the notes: newer than
 * `lastSeen`, no newer than this build. Newest first.
 */
export function unseenBundledReleases(lastSeen: number, build: number) {
  return BUNDLED_RELEASES.filter((release) => release.versionCode > lastSeen && release.versionCode <= build);
}
