import { release1_1 } from './1.1';
import { release1_2 } from './1.2';
import { release1_3 } from './1.3';
import type { WhatsNewRelease } from './types';

export type { WhatsNewItem, WhatsNewKind, WhatsNewPreview, WhatsNewRelease } from './types';

/**
 * Every release this build has notes for, newest first.
 *
 * A new release is one new file beside `1.1.ts`, added at the top of this
 * list. `scripts/publish-release-notes` sends the same file to the API, which
 * is how older builds learn what is coming.
 */
export const BUNDLED_RELEASES: readonly WhatsNewRelease[] = [release1_3, release1_2, release1_1];

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
 * A short fingerprint of a release's words. Play builds never change their
 * notes, but staging builds of the same release do (1.3 grows with each
 * staging batch), so "seen 15" alone would hide what a later staging APK adds.
 */
export function releaseFingerprint(release: Pick<WhatsNewRelease, 'headline' | 'items'>) {
  const text = JSON.stringify([release.headline, release.items]);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

/** The notes last shown: the build, and the words it showed (older phones stored no words). */
export type SeenNotes = { build: number; fingerprint: string | null };

/**
 * Releases installed since the person last saw the notes, newest first: newer
 * than the build last seen, or that build's own notes once their words have
 * changed. Never newer than this build.
 */
export function unseenBundledReleases(seen: SeenNotes, build: number) {
  return BUNDLED_RELEASES.filter((release) => {
    if (release.versionCode > build) return false;
    if (release.versionCode > seen.build) return true;
    return (
      release.versionCode === seen.build &&
      seen.fingerprint !== null &&
      seen.fingerprint !== releaseFingerprint(release)
    );
  });
}
