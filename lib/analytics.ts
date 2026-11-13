import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { AppState, Platform } from 'react-native';

import { useAuthStore } from '@/hooks/use-auth-store';

import { API_BASE_URL } from './transactions';

/**
 * Product analytics: which steps people reach, counted on Finnri's own server.
 *
 * Until this existed nobody could say what share of installs saved a first
 * entry, or where the rest stopped. The rule that keeps it honest is that an
 * event is a name from the list below and at most one short lowercase label —
 * "voice", "google", "monthly". There is nowhere to put an amount, a merchant
 * or anything somebody typed, here or on the server, which checks the same
 * rule again. Nothing goes to a third party.
 *
 * `track` only adds to a queue. Sending starts when the root layout calls
 * `startAnalytics`, so a screen or a `lib/` function under test that calls
 * `track` makes no request and writes nothing to storage.
 */
export const PRODUCT_EVENTS = [
  'app_opened',
  'onboarding_completed',
  'auth_completed',
  'capture_requested',
  'capture_drafted',
  'capture_failed',
  'entry_saved',
  'paywall_shown',
  'checkout_started',
  'invite_created',
  'invite_accepted',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

type QueuedEvent = { name: ProductEventName; label?: string; at: string };

const STORAGE_KEY = 'finnri_analytics_queue';
/** The server takes at most this many per request. */
const BATCH_SIZE = 50;
/** A phone that never gets online must not grow this without end. */
const MAX_QUEUED = 200;
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_AT = 20;
/** Coming back after this long counts as opening the app again. */
const REOPEN_AFTER_MS = 30 * 60_000;

let queue: QueuedEvent[] = [];
let started = false;
let flushing = false;
let lastOpenedAt = 0;

/**
 * A label is one lowercase word. Anything else is sent without a label rather
 * than cleaned up — a value that needed cleaning was not a label.
 */
export const analyticsLabel = (value?: string | null) => {
  const label = (value ?? '').trim().toLowerCase();
  return /^[a-z0-9_]{1,32}$/.test(label) ? label : undefined;
};

const persist = () => {
  if (!started) return;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue)).catch(() => undefined);
};

export const track = (name: ProductEventName, label?: string | null) => {
  const cleaned = analyticsLabel(label);
  queue.push({ name, ...(cleaned ? { label: cleaned } : {}), at: new Date().toISOString() });
  if (queue.length > MAX_QUEUED) queue = queue.slice(queue.length - MAX_QUEUED);
  persist();
  if (started && queue.length >= FLUSH_AT) void flushAnalytics();
};

/**
 * Sends what is queued, if somebody is signed in. Events recorded before
 * sign-in — onboarding, the sign-in itself — wait here and go with the first
 * batch after it.
 */
export const flushAnalytics = async () => {
  const token = useAuthStore.getState().token;
  if (!started || flushing || !token || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, BATCH_SIZE);
  try {
    const response = await fetch(`${API_BASE_URL}/v1/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        platform: Platform.OS,
        app_version: Application.nativeApplicationVersion ?? '',
        events: batch,
      }),
    });
    // Sent, or refused in a way that sending again cannot change. A 401 or a
    // 429 is about the moment, not the batch, so those are kept; so is any
    // server error.
    const settled = response.ok || (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429);
    if (settled) {
      queue = queue.slice(batch.length);
      persist();
    }
  } catch {
    // Offline. The queue is on disk and the next tick tries again.
  } finally {
    flushing = false;
  }
};

const noteOpened = () => {
  const now = Date.now();
  if (now - lastOpenedAt < REOPEN_AFTER_MS) return;
  lastOpenedAt = now;
  track('app_opened');
};

/**
 * Called once from the root layout. Restores what an earlier run left unsent,
 * then sends on a timer and whenever the app goes to the background — the last
 * moment there is before the process may be killed.
 */
export const startAnalytics = () => {
  if (started) return () => undefined;
  started = true;

  void AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      if (!stored) return;
      const restored = JSON.parse(stored) as QueuedEvent[];
      if (Array.isArray(restored)) queue = [...restored, ...queue].slice(-MAX_QUEUED);
    })
    .catch(() => undefined)
    .finally(() => {
      noteOpened();
      void flushAnalytics();
    });

  const timer = setInterval(() => void flushAnalytics(), FLUSH_INTERVAL_MS);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') noteOpened();
    else void flushAnalytics();
  });

  return () => {
    clearInterval(timer);
    subscription.remove();
    started = false;
  };
};

/** Test seam. */
export const resetAnalyticsForTest = () => {
  queue = [];
  started = false;
  flushing = false;
  lastOpenedAt = 0;
};

/** Test seam. */
export const queuedAnalyticsEvents = () => queue.slice();
