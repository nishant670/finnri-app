import {
  formatRelativeDay,
  formatTime,
  resetHourClockCache,
  rowTimeLabel,
  toApiTime,
  uses24HourClock,
} from '@/lib/datetime';

describe('formatTime', () => {
  beforeEach(() => {
    resetHourClockCache();
  });

  it('renders every stored shape in one convention', () => {
    // The Home feed showed 15:58, 22:56 and 10:09 PM in three consecutive
    // rows because the parser writes HH:MM and manual entry wrote 12-hour.
    const rendered = ['15:58', '22:56', '10:09 PM'].map((value) => formatTime(value));

    if (uses24HourClock()) {
      expect(rendered).toEqual(['15:58', '22:56', '22:09']);
    } else {
      expect(rendered).toEqual(['3:58 PM', '10:56 PM', '10:09 PM']);
    }

    const hasMeridiem = rendered.map((value) => /[AP]M$/.test(value ?? ''));
    expect(new Set(hasMeridiem).size).toBe(1);
  });

  it('reads seconds, single-digit hours and lowercase meridiems', () => {
    expect(formatTime('09:05:33')).toBe(uses24HourClock() ? '09:05' : '9:05 AM');
    expect(formatTime('9:05 am')).toBe(uses24HourClock() ? '09:05' : '9:05 AM');
    expect(formatTime('9:05a.m.')).toBe(uses24HourClock() ? '09:05' : '9:05 AM');
  });

  it('gets the two hours that trip every 12-hour converter right', () => {
    expect(formatTime('00:30')).toBe(uses24HourClock() ? '00:30' : '12:30 AM');
    expect(formatTime('12:30')).toBe(uses24HourClock() ? '12:30' : '12:30 PM');
    expect(formatTime('12:00 AM')).toBe(uses24HourClock() ? '00:00' : '12:00 AM');
    expect(formatTime('12:00 PM')).toBe(uses24HourClock() ? '12:00' : '12:00 PM');
  });

  it('accepts a Date and an ISO timestamp', () => {
    const evening = new Date(2026, 7, 11, 22, 56);
    expect(formatTime(evening)).toBe(uses24HourClock() ? '22:56' : '10:56 PM');
    expect(formatTime(evening.toISOString())).toBe(formatTime(evening));
  });

  it('returns null rather than echoing something it cannot read', () => {
    // A caller that gets null drops the line; one that got the raw string back
    // would print whatever junk was on disk.
    expect(formatTime(null)).toBeNull();
    expect(formatTime(undefined)).toBeNull();
    expect(formatTime('')).toBeNull();
    expect(formatTime('   ')).toBeNull();
    expect(formatTime('sometime')).toBeNull();
    expect(formatTime('25:00')).toBeNull();
    expect(formatTime('10:75')).toBeNull();
    expect(formatTime(new Date('nope'))).toBeNull();
  });
});

describe('formatTime on a 24-hour device', () => {
  // The test runner resolves to a 12-hour locale, so the other branch would
  // otherwise never execute. Force the resolution `uses24HourClock` reads.
  let realDateTimeFormat: typeof Intl.DateTimeFormat;

  beforeEach(() => {
    realDateTimeFormat = Intl.DateTimeFormat;
    const forced = ((...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
      const instance = new realDateTimeFormat(...args);
      const resolvedOptions = () => ({ ...instance.resolvedOptions(), hour12: false, hourCycle: 'h23' as const });
      return Object.assign(Object.create(instance), { resolvedOptions });
    }) as unknown as typeof Intl.DateTimeFormat;
    Intl.DateTimeFormat = forced;
    resetHourClockCache();
  });

  afterEach(() => {
    Intl.DateTimeFormat = realDateTimeFormat;
    resetHourClockCache();
  });

  it('pads to HH:MM and drops the meridiem', () => {
    expect(uses24HourClock()).toBe(true);
    expect(formatTime('10:09 PM')).toBe('22:09');
    expect(formatTime('9:05 AM')).toBe('09:05');
    expect(formatTime('12:00 AM')).toBe('00:00');
    expect(formatTime('12:00 PM')).toBe('12:00');
    expect(formatTime('15:58')).toBe('15:58');
    expect(formatTime(new Date(2026, 7, 11, 7, 4))).toBe('07:04');
  });
});

describe('toApiTime', () => {
  it('always writes canonical HH:MM, whatever the device clock is', () => {
    expect(toApiTime('10:09 PM')).toBe('22:09');
    expect(toApiTime('9:05 AM')).toBe('09:05');
    expect(toApiTime('15:58')).toBe('15:58');
    expect(toApiTime('12:00 AM')).toBe('00:00');
    expect(toApiTime(new Date(2026, 7, 11, 7, 4))).toBe('07:04');
  });

  it('is idempotent, so a round trip through the form cannot drift', () => {
    expect(toApiTime(toApiTime('10:09 PM'))).toBe('22:09');
    expect(toApiTime(formatTime('10:09 PM'))).toBe('22:09');
  });

  it('returns null for anything unreadable so no time is sent', () => {
    expect(toApiTime('')).toBeNull();
    expect(toApiTime('later')).toBeNull();
  });
});

describe('formatRelativeDay', () => {
  const daysAgo = (days: number) => {
    const day = new Date();
    day.setDate(day.getDate() - days);
    return day;
  };
  const asApiDate = (day: Date) =>
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate()
    ).padStart(2, '0')}`;

  it('names the recent past instead of printing a date', () => {
    expect(formatRelativeDay(asApiDate(daysAgo(0)))).toBe('Today');
    expect(formatRelativeDay(asApiDate(daysAgo(1)))).toBe('Yesterday');
    expect(formatRelativeDay(asApiDate(daysAgo(3)))).toBe('3 days ago');
  });

  it('falls back to a compact date once "N days ago" stops helping', () => {
    const old = daysAgo(40);
    expect(formatRelativeDay(asApiDate(old))).toBe(
      `${old.getDate()} ${old.toLocaleString('en-US', { month: 'short' })}`
    );
  });

  it('keeps the year once it is no longer the current one', () => {
    expect(formatRelativeDay('2019-07-12')).toBe('12 Jul 2019');
  });

  it('ignores a time suffix on the stored value', () => {
    expect(formatRelativeDay('2019-07-12T18:30:00Z')).toBe('12 Jul 2019');
  });

  it('returns null for anything unreadable so the caller drops the line', () => {
    expect(formatRelativeDay(undefined)).toBeNull();
    expect(formatRelativeDay('')).toBeNull();
    expect(formatRelativeDay('last Tuesday')).toBeNull();
  });
});

describe('rowTimeLabel', () => {
  it('lowercases the meridiem on a 12-hour label', () => {
    expect(rowTimeLabel('3:48 PM')).toBe('3:48 pm');
    expect(rowTimeLabel('10:09 AM')).toBe('10:09 am');
  });

  it('leaves 24-hour labels and dates alone', () => {
    expect(rowTimeLabel('15:48')).toBe('15:48');
    expect(rowTimeLabel('5 October 2026')).toBe('5 October 2026');
  });
});
