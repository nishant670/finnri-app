import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { create } from 'zustand';

import { PLAY_LISTING_URL, PLAY_MARKET_URL } from './legal';
import { API_BASE_URL } from './transactions';
import type { WhatsNewItem, WhatsNewKind, WhatsNewRelease } from './whats-new/releases';

/**
 * In-app updates (boards R15-Home-Update, R15-UpdateRequired).
 *
 * Two sources, because each knows half:
 * - Google Play knows whether *this install* can update, and does the download.
 * - The API knows what the newer build contains (headline and text cards) and
 *   the oldest build still allowed, since this build can't know either.
 *
 * The card appears only when Play says an update is ready for this install, so
 * notes published ahead of a staged rollout are harmless.
 */

// --- Play, through modules/finnri-updates ------------------------------------

export type PlayInstallStatus =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export type PlayUpdateInfo = {
  available: boolean;
  /** An immediate update left half way, which Play expects resumed. */
  inProgress: boolean;
  availableVersionCode: number;
  flexibleAllowed: boolean;
  immediateAllowed: boolean;
  status: PlayInstallStatus;
};

type UpdateStateEvent = { status: PlayInstallStatus; bytesDownloaded: number; totalBytesToDownload: number };
type UpdateResultEvent = { result: 'accepted' | 'cancelled' | 'failed' };

type FinnriUpdatesModule = {
  checkForUpdate: () => Promise<PlayUpdateInfo>;
  startUpdate: (type: 'flexible' | 'immediate') => Promise<boolean>;
  completeUpdate: () => void;
  addListener: {
    (event: 'onUpdateState', listener: (event: UpdateStateEvent) => void): { remove: () => void };
    (event: 'onUpdateResult', listener: (event: UpdateResultEvent) => void): { remove: () => void };
  };
};

/** Android builds only; `null` on iOS, web, Expo Go and in tests. */
const playUpdates = requireOptionalNativeModule<FinnriUpdatesModule>('FinnriUpdates');

export const NO_PLAY_UPDATE: PlayUpdateInfo = {
  available: false,
  inProgress: false,
  availableVersionCode: 0,
  flexibleAllowed: false,
  immediateAllowed: false,
  status: 'unknown',
};

const checkPlay = async (): Promise<PlayUpdateInfo> => {
  if (!playUpdates) return NO_PLAY_UPDATE;
  try {
    return { ...NO_PLAY_UPDATE, ...(await playUpdates.checkForUpdate()) };
  } catch {
    return NO_PLAY_UPDATE;
  }
};

/** The Play listing, in the Play Store app or else the browser. */
export const openPlayListing = async () => {
  try {
    await Linking.openURL(PLAY_MARKET_URL);
  } catch {
    await Linking.openURL(PLAY_LISTING_URL).catch(() => undefined);
  }
};

// --- this build ---------------------------------------------------------------

/**
 * The installed build's versionCode. The native value is the truth once
 * installed; the manifest's covers Expo Go and the web, where there is none.
 */
export function currentBuild(): number {
  const native = Number(Application.nativeBuildVersion);
  if (Number.isFinite(native) && native > 0) return native;
  return Constants.expoConfig?.android?.versionCode ?? 0;
}

// --- the API ------------------------------------------------------------------

type ApiReleaseItem = {
  kind: WhatsNewKind;
  title: string;
  body?: string;
  problem?: string;
  fix?: string;
};

type ApiRelease = {
  version_code: number;
  version_name: string;
  headline: string;
  published_at?: string | null;
  items?: ApiReleaseItem[];
};

export type PendingReleases = {
  /** Newer than this build, newest first, as text: no previews, no links. */
  releases: WhatsNewRelease[];
  latestVersionCode: number;
  /** Builds below this must update. 0 when nothing forces it. */
  minSupportedVersionCode: number;
};

const EMPTY_PENDING: PendingReleases = { releases: [], latestVersionCode: 0, minSupportedVersionCode: 0 };

const KINDS: readonly WhatsNewKind[] = ['new', 'ui', 'fix', 'improved'];

/** An API release as a text-only release, dropping anything this build can't draw. */
export function releaseFromApi(release: ApiRelease): WhatsNewRelease {
  const month = (release.published_at ?? '').slice(0, 7);
  const items: WhatsNewItem[] = (release.items ?? [])
    .filter((item) => KINDS.includes(item.kind) && item.title)
    .map((item) => ({
      kind: item.kind,
      title: item.title,
      body: item.body || undefined,
      problem: item.problem || undefined,
      fix: item.fix || undefined,
    }));
  return {
    versionCode: release.version_code,
    versionName: release.version_name,
    month,
    headline: release.headline,
    items,
  };
}

/**
 * Published notes newer than `build`, or null when the API could not be asked.
 * Null is not "nothing published": a bad connection must not lift a required
 * update or take the words off the card.
 */
export async function fetchPendingReleases(build: number): Promise<PendingReleases | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/app/releases?platform=android&since=${build}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      releases?: ApiRelease[];
      latest_version_code?: number;
      min_supported_version_code?: number;
    };
    return {
      releases: (payload.releases ?? []).map(releaseFromApi),
      latestVersionCode: payload.latest_version_code ?? 0,
      minSupportedVersionCode: payload.min_supported_version_code ?? 0,
    };
  } catch {
    return null;
  }
}

// --- what to show -------------------------------------------------------------

export type UpdateOffer =
  | { kind: 'none' }
  | { kind: 'card'; versionCode: number; release: WhatsNewRelease | null }
  | { kind: 'required'; versionCode: number; release: WhatsNewRelease | null };

type DecideInput = {
  build: number;
  play: PlayUpdateInfo;
  pending: PendingReleases;
  /** The versionCode the card was hidden for, and until when. */
  dismissed: { versionCode: number; until: number } | null;
  /** The Preview variant shows the card from the API alone, so it can be tried without Play. */
  apiOnly: boolean;
  now: number;
};

/**
 * Required beats the card; both need Play (or, in Preview, the API) to say a
 * newer build exists; and "hide for now" holds for that version only, so an
 * even newer build brings the card straight back.
 *
 * Required also needs that build to reach the minimum. During a staged rollout
 * the API can name a build Play won't give this phone yet, and blocking the
 * app then would leave nothing to update to.
 *
 * Notes are matched to the exact build on offer. Notes for a newer one would
 * describe features this update doesn't contain.
 */
export function decideUpdate({ build, play, pending, dismissed, apiOnly, now }: DecideInput): UpdateOffer {
  const playNewer = play.available || play.inProgress ? play.availableVersionCode : 0;
  const apiNewer = pending.latestVersionCode > build ? pending.latestVersionCode : 0;
  const target = Math.max(playNewer, apiOnly ? apiNewer : 0);
  const releaseFor = (versionCode: number) =>
    pending.releases.find((release) => release.versionCode === versionCode) ?? null;

  const floor = pending.minSupportedVersionCode;
  if (floor > build && build > 0 && target >= floor) {
    return { kind: 'required', versionCode: floor, release: releaseFor(floor) };
  }
  if (play.status === 'downloaded') {
    const versionCode = target || play.availableVersionCode;
    return { kind: 'card', versionCode, release: releaseFor(versionCode) };
  }
  if (target <= build) return { kind: 'none' };
  if (dismissed && dismissed.versionCode >= target && dismissed.until > now) return { kind: 'none' };
  return { kind: 'card', versionCode: target, release: releaseFor(target) };
}

// --- remembered choices ---------------------------------------------------------

/** "Hide for now" brings the card back after this long, for the same version. */
export const UPDATE_CARD_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** Play and the API are asked at most this often; a forced update is checked every launch. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const DISMISSED_KEY = 'finnri_update_card_dismissed';
const SEEN_NOTES_KEY = 'finnri_whats_new_seen_build';

const readDismissed = async () => {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as { versionCode?: number; until?: number }) : null;
    if (!parsed || typeof parsed.versionCode !== 'number' || typeof parsed.until !== 'number') return null;
    return { versionCode: parsed.versionCode, until: parsed.until };
  } catch {
    return null;
  }
};

/** The last build whose notes were shown, or null on a phone that has never stored one. */
export const readSeenNotesBuild = async (): Promise<number | null> => {
  try {
    const raw = await AsyncStorage.getItem(SEEN_NOTES_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

export const markNotesSeen = async (build: number) => {
  try {
    await AsyncStorage.setItem(SEEN_NOTES_KEY, String(build));
  } catch {
    // Shown once more next launch: the safe way to fail.
  }
};

// --- the shared state -------------------------------------------------------------

export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: number }
  | { phase: 'downloaded' }
  | { phase: 'failed' };

type AppUpdateStore = {
  offer: UpdateOffer;
  download: DownloadState;
  /** Newer releases from the API, for "What's new" before updating. */
  pending: PendingReleases;
  lastCheckedAt: number;
  /** True once the splash has gone, so Home can tell it is really on screen. */
  entered: boolean;
  markEntered: () => void;
  /** Asks Play and the API. Throttled unless `force`. */
  check: (options?: { force?: boolean }) => Promise<void>;
  /** Starts the update: flexible normally, immediate when required, the Play listing when neither works. */
  startUpdate: () => Promise<void>;
  /** Installs a downloaded update; the app restarts into it. */
  restart: () => void;
  dismiss: () => Promise<void>;
};

const isPreviewVariant = () =>
  (Constants.expoConfig?.android?.package ?? Application.applicationId ?? '').endsWith('.preview');

let listenersAttached = false;

export const useAppUpdateStore = create<AppUpdateStore>((set, get) => {
  const attachListeners = () => {
    if (listenersAttached || !playUpdates) return;
    listenersAttached = true;
    playUpdates.addListener('onUpdateState', ({ status, bytesDownloaded, totalBytesToDownload }) => {
      if (status === 'downloading' || status === 'pending') {
        const progress = totalBytesToDownload > 0 ? bytesDownloaded / totalBytesToDownload : 0;
        set({ download: { phase: 'downloading', progress: Math.min(1, Math.max(0, progress)) } });
      } else if (status === 'downloaded') {
        set({ download: { phase: 'downloaded' } });
      } else if (status === 'failed') {
        set({ download: { phase: 'failed' } });
      } else if (status === 'cancelled') {
        set({ download: { phase: 'idle' } });
      }
    });
    playUpdates.addListener('onUpdateResult', ({ result }) => {
      // Cancelling Play's confirmation leaves the card as it was.
      if (result !== 'accepted' && get().download.phase === 'downloading') set({ download: { phase: 'idle' } });
    });
  };

  return {
    offer: { kind: 'none' },
    download: { phase: 'idle' },
    pending: EMPTY_PENDING,
    lastCheckedAt: 0,
    entered: false,
    markEntered: () => set({ entered: true }),

    check: async ({ force = false } = {}) => {
      if (Platform.OS !== 'android') return;
      const now = Date.now();
      if (!force && now - get().lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) return;
      set({ lastCheckedAt: now });
      attachListeners();

      const build = currentBuild();
      const [play, fetched, dismissed] = await Promise.all([
        checkPlay(),
        fetchPendingReleases(build),
        readDismissed(),
      ]);
      // Keep what was known, and let the next return to the app try again.
      if (!fetched) set({ lastCheckedAt: 0 });
      const pending = fetched ?? get().pending;
      const offer = decideUpdate({ build, play, pending, dismissed, apiOnly: isPreviewVariant(), now });
      // A download already running was started before this launch.
      const running = (play.status === 'downloading' || play.status === 'pending') && get().download.phase === 'idle';
      set({
        offer,
        pending,
        ...(play.status === 'downloaded' ? { download: { phase: 'downloaded' } as const } : null),
        ...(running ? { download: { phase: 'downloading', progress: 0 } as const } : null),
      });
    },

    startUpdate: async () => {
      const { offer } = get();
      attachListeners();
      const immediate = offer.kind === 'required';
      if (!immediate) set({ download: { phase: 'downloading', progress: 0 } });
      const started = playUpdates ? await playUpdates.startUpdate(immediate ? 'immediate' : 'flexible').catch(() => false) : false;
      if (!started) {
        set({ download: { phase: 'idle' } });
        await openPlayListing();
      }
    },

    restart: () => {
      playUpdates?.completeUpdate();
    },

    dismiss: async () => {
      const { offer } = get();
      if (offer.kind !== 'card') return;
      set({ offer: { kind: 'none' } });
      try {
        await AsyncStorage.setItem(
          DISMISSED_KEY,
          JSON.stringify({ versionCode: offer.versionCode, until: Date.now() + UPDATE_CARD_SNOOZE_MS })
        );
      } catch {
        // Back next launch: harmless.
      }
    },
  };
});
