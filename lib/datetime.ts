import * as Localization from 'expo-localization';

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export const getClientTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

export const formatApiDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/* ------------------------------------------------------------------ *
 * Time — one convention, everywhere
 *
 * The Home feed used to show `15:58`, `22:56` and `10:09 PM` in three
 * consecutive rows. Two writers disagreed: the AI parser emits `HH:MM` (see
 * `internal/ai/prompt.txt`) while manual entry wrote a 12-hour string, and the
 * feed rendered `entry.time` raw. `formatTime` now stands between the stored
 * value and every screen, so whatever is on disk renders one way.
 * ------------------------------------------------------------------ */

type TimeOfDay = { hours: number; minutes: number };

let cachedUses24Hour: boolean | null = null;

/**
 * Whether this device wants a 24-hour clock.
 *
 * This has to come from the platform, not from the locale. Measured on the
 * OnePlus the audit ran on — system clock set to 24-hour — Hermes reports
 * `{ locale: 'en-IN', hour12: true, hourCycle: 'h12' }`, because Android's ICU
 * answers from the locale and never consults the user's toggle. So
 * `expo-localization` (`DateFormat.is24HourFormat` on Android, the
 * "24-Hour Time" setting on iOS) is the only source that is actually right.
 * The Intl chain below is a fallback for web and for tests.
 */
export const uses24HourClock = (): boolean => {
  if (cachedUses24Hour !== null) return cachedUses24Hour;

  cachedUses24Hour = (() => {
    try {
      const [calendar] = Localization.getCalendars();
      if (typeof calendar?.uses24hourClock === 'boolean') return calendar.uses24hourClock;
    } catch {
      // Fall through to the locale-derived guess below.
    }

    try {
      const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
      if (typeof resolved.hour12 === 'boolean') return !resolved.hour12;
      if (resolved.hourCycle) return resolved.hourCycle === 'h23' || resolved.hourCycle === 'h24';
    } catch {
      // Fall through to the formatting probe below.
    }

    // Last resort: render a known afternoon time and look for a day period.
    const probe = new Date(2020, 0, 1, 15, 0).toLocaleTimeString(undefined, { hour: 'numeric' });
    return !/[ap]\.?\s?m/i.test(probe);
  })();

  return cachedUses24Hour;
};

/** Only for tests — the device preference cannot change mid-session in the app. */
export const resetHourClockCache = () => {
  cachedUses24Hour = null;
};

/**
 * Read a time out of any shape we have ever stored one in: a `Date`, an ISO
 * timestamp, the parser's `HH:MM[:SS]`, or the legacy `10:09 PM` display
 * string that older manual entries wrote.
 */
const parseTimeOfDay = (value: Date | string | null | undefined): TimeOfDay | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { hours: value.getHours(), minutes: value.getMinutes() };
  }

  const trimmed = value?.trim();
  if (!trimmed) return null;

  const clock = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s?m\.?$/i);
  if (clock) {
    const [, hourStr, minuteStr, meridiem] = clock;
    let hours = Number(hourStr) % 12;
    if (meridiem.toLowerCase() === 'p') hours += 12;
    const minutes = Number(minuteStr);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  const bare = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (bare) {
    const hours = Number(bare[1]);
    const minutes = Number(bare[2]);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { hours: parsed.getHours(), minutes: parsed.getMinutes() };
  }

  return null;
};

/**
 * A time of day for display, in the one convention this device uses:
 * `10:09 PM` or `22:09`. Returns `null` for anything unparseable so callers
 * can drop the line rather than print a raw stored string.
 */
export const formatTime = (value: Date | string | null | undefined): string | null => {
  const time = parseTimeOfDay(value);
  if (!time) return null;

  const minutes = String(time.minutes).padStart(2, '0');

  if (uses24HourClock()) {
    return `${String(time.hours).padStart(2, '0')}:${minutes}`;
  }

  const meridiem = time.hours < 12 ? 'AM' : 'PM';
  const hours = time.hours % 12 === 0 ? 12 : time.hours % 12;
  return `${hours}:${minutes} ${meridiem}`;
};

/**
 * A time label as the redesign draws it on a row: "3:48 pm", not "3:48 PM".
 * Display only — `formatTime` keeps its capitals because the transaction form
 * stores what it returns. A 24-hour label passes through unchanged.
 */
export const rowTimeLabel = (label: string): string =>
  label.replace(/\s(AM|PM)$/, (meridiem) => meridiem.toLowerCase());

/**
 * The canonical `HH:MM` we put on the wire, matching the shape the AI parser
 * already emits. Storing the display string is what let two clocks into the
 * database in the first place.
 */
export const toApiTime = (value: Date | string | null | undefined): string | null => {
  const time = parseTimeOfDay(value);
  if (!time) return null;
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
};

/**
 * A calendar day as a caption: `Today`, `Yesterday`, `4 days ago`, `12 Jul`, or
 * `12 Jul 2025` once the year stops being obvious.
 *
 * Takes the `YYYY-MM-DD` the API sends. Returns `null` for anything it cannot
 * read, so a caller drops the line instead of printing a raw stored value —
 * same contract as `formatTime`.
 *
 * The transaction feed has its own day rule in `lib/transactions.ts`, which
 * renders full section headings (`12 July 2026`). This is the inline form; they
 * are different renderings on purpose, not a second vocabulary.
 */
export const formatRelativeDay = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;

  let day: Date;
  if (value instanceof Date) {
    day = value;
  } else {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if (Number.isNaN(day.getTime())) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const diffDays = Math.round((todayStart.getTime() - dayStart.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  const month = dayStart.toLocaleString('en-US', { month: 'short' });
  if (dayStart.getFullYear() === todayStart.getFullYear()) {
    return `${dayStart.getDate()} ${month}`;
  }
  return `${dayStart.getDate()} ${month} ${dayStart.getFullYear()}`;
};
