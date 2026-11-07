import { decideUpdate, NO_PLAY_UPDATE, releaseFromApi, type PendingReleases } from '@/lib/app-update';
import { releaseToApiPayload } from '@/lib/whats-new/api-payload';
import {
  BUNDLED_RELEASES,
  releaseCountChips,
  releaseMonthLabel,
  unseenBundledReleases,
} from '@/lib/whats-new/releases';

const NOW = 1_800_000_000_000;

const pending = (overrides: Partial<PendingReleases> = {}): PendingReleases => ({
  releases: [
    { versionCode: 14, versionName: '1.2', month: '2026-12', headline: 'Newer', items: [] },
    { versionCode: 13, versionName: '1.1', month: '2026-11', headline: 'New', items: [] },
  ],
  latestVersionCode: 14,
  minSupportedVersionCode: 0,
  ...overrides,
});

const playOffers = (versionCode: number) => ({
  ...NO_PLAY_UPDATE,
  available: true,
  availableVersionCode: versionCode,
  flexibleAllowed: true,
  immediateAllowed: true,
});

describe('decideUpdate', () => {
  const base = { build: 12, pending: pending(), dismissed: null, apiOnly: false, now: NOW };

  it('offers the card for the build Play says is ready, with that build’s notes', () => {
    const offer = decideUpdate({ ...base, play: playOffers(13) });
    expect(offer).toMatchObject({ kind: 'card', versionCode: 13 });
    expect(offer.kind === 'card' && offer.release?.versionName).toBe('1.1');
  });

  it('stays quiet when only the API knows about a newer build: Play has to offer it to this install', () => {
    expect(decideUpdate({ ...base, play: NO_PLAY_UPDATE })).toEqual({ kind: 'none' });
  });

  it('lets the Preview variant show the card from the API alone, so it can be tried without Play', () => {
    expect(decideUpdate({ ...base, play: NO_PLAY_UPDATE, apiOnly: true })).toMatchObject({
      kind: 'card',
      versionCode: 14,
    });
  });

  it('keeps a hidden card hidden for that version until the snooze ends', () => {
    const dismissed = { versionCode: 13, until: NOW + 1000 };
    expect(decideUpdate({ ...base, play: playOffers(13), dismissed })).toEqual({ kind: 'none' });
    expect(decideUpdate({ ...base, play: playOffers(13), dismissed, now: NOW + 2000 }).kind).toBe('card');
  });

  it('brings the card straight back for an even newer build', () => {
    const dismissed = { versionCode: 13, until: NOW + 1000 };
    expect(decideUpdate({ ...base, play: playOffers(14), dismissed })).toMatchObject({ kind: 'card', versionCode: 14 });
  });

  it('requires the update below the minimum supported build, Play or not', () => {
    const offer = decideUpdate({ ...base, play: NO_PLAY_UPDATE, pending: pending({ minSupportedVersionCode: 13 }) });
    // Named after the release that carries the fix, not the newest one.
    expect(offer).toMatchObject({ kind: 'required', versionCode: 13 });
    expect(offer.kind === 'required' && offer.release?.versionName).toBe('1.1');
  });

  it('never requires an update of a build already at the minimum', () => {
    const offer = decideUpdate({ ...base, build: 13, play: NO_PLAY_UPDATE, pending: pending({ minSupportedVersionCode: 13 }) });
    expect(offer.kind).not.toBe('required');
  });

  it('shows the card for a finished download even after it was hidden, so Restart is reachable', () => {
    const dismissed = { versionCode: 13, until: NOW + 1000 };
    const offer = decideUpdate({ ...base, play: { ...playOffers(13), status: 'downloaded' }, dismissed });
    expect(offer.kind).toBe('card');
  });
});

describe('releaseFromApi', () => {
  it('keeps the text and drops kinds this build cannot draw', () => {
    const release = releaseFromApi({
      version_code: 13,
      version_name: '1.1',
      headline: 'New',
      published_at: '2026-11-20T10:00:00Z',
      items: [
        { kind: 'fix', title: 'Mic', body: '', problem: 'It broke', fix: 'It works' },
        { kind: 'poster' as never, title: 'Unknown' },
      ],
    });
    expect(release.month).toBe('2026-11');
    expect(release.items).toEqual([{ kind: 'fix', title: 'Mic', body: undefined, problem: 'It broke', fix: 'It works' }]);
  });
});

describe('bundled notes', () => {
  it('lists releases newest first with unique build numbers', () => {
    const codes = BUNDLED_RELEASES.map((release) => release.versionCode);
    expect([...codes].sort((a, b) => b - a)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps every release to six cards, each fix saying both halves', () => {
    for (const release of BUNDLED_RELEASES) {
      expect(release.items.length).toBeLessThanOrEqual(6);
      for (const item of release.items.filter((candidate) => candidate.kind === 'fix')) {
        expect(item.problem && item.fix).toBeTruthy();
      }
    }
  });

  it('finds the releases installed since the last one seen, no newer than this build', () => {
    const [latest] = BUNDLED_RELEASES;
    expect(unseenBundledReleases(0, latest.versionCode)).toContain(latest);
    expect(unseenBundledReleases(latest.versionCode, latest.versionCode)).toEqual([]);
    expect(unseenBundledReleases(0, latest.versionCode - 1)).not.toContain(latest);
  });

  it('counts cards for the hero in card order', () => {
    expect(
      releaseCountChips({
        items: [
          { kind: 'fix', title: 'a', problem: 'p', fix: 'f' },
          { kind: 'new', title: 'b' },
          { kind: 'new', title: 'c' },
          { kind: 'ui', title: 'd' },
        ],
      }).map((chip) => chip.label)
    ).toEqual(['2 new', '1 new look', '1 fixed']);
  });

  it('names the month in words', () => {
    expect(releaseMonthLabel('2026-11')).toMatch(/November 2026/);
    expect(releaseMonthLabel('')).toBe('');
  });
});

describe('releaseToApiPayload', () => {
  it('sends text and Try it links, never previews', () => {
    const payload = releaseToApiPayload(
      {
        versionCode: 13,
        versionName: '1.1',
        month: '2026-11',
        headline: 'New',
        items: [
          { kind: 'new', title: 'Events', body: 'Occasions.', preview: 'wallets', link: '/accounts/manage' },
          { kind: 'improved', title: 'Faster', link: '/accounts/manage' },
        ],
      },
      false
    );
    expect(payload.items[0]).toEqual({
      kind: 'new',
      title: 'Events',
      body: 'Occasions.',
      problem: '',
      fix: '',
      deep_link: '/accounts/manage',
    });
    expect(payload.items[1].deep_link).toBe('');
    expect(JSON.stringify(payload)).not.toContain('preview');
  });
});
