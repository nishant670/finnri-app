import type { DashboardResponse } from './insights';
import { formatMoney } from './money';

const parseDay = (value?: string | null) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

const toApiDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const shortDay = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export type QuickFact = {
  key: 'last7' | 'biggest' | 'category' | 'paidWith';
  label: string;
  value: string;
  caption: string;
  /** The entry behind "Biggest expense", so the fact can open it. */
  entryId?: number;
};

/**
 * The four facts under "October at a glance" (P29): the last seven days of
 * the window, its biggest expense, its top category and what paid for most of
 * it. A fact the window cannot answer is left out rather than shown as ₹0.
 */
export const buildQuickFacts = (dashboard: DashboardResponse): QuickFact[] => {
  const facts: QuickFact[] = [];
  const days = (dashboard.daily_spending ?? []).filter((day) => parseDay(day.date));
  const lastSeven = days.slice(-7);
  if (lastSeven.length > 0) {
    const first = parseDay(lastSeven[0].date)!;
    const last = parseDay(lastSeven[lastSeven.length - 1].date)!;
    facts.push({
      key: 'last7',
      label: lastSeven.length === 7 ? 'Last 7 days' : `Last ${lastSeven.length} days`,
      value: formatMoney(lastSeven.reduce((sum, day) => sum + day.amount, 0)),
      caption:
        first.getMonth() === last.getMonth()
          ? `${first.getDate()} – ${shortDay(last)}`
          : `${shortDay(first)} – ${shortDay(last)}`,
    });
  }

  const largest = dashboard.largest_expense;
  if (largest && largest.amount > 0) {
    const day = parseDay(largest.date);
    facts.push({
      key: 'biggest',
      label: 'Biggest expense',
      value: formatMoney(largest.amount),
      caption: [largest.category, day ? shortDay(day) : null].filter(Boolean).join(' · '),
      entryId: largest.entry_id,
    });
  }

  const top = dashboard.top_categories?.[0];
  if (top && top.amount > 0) {
    facts.push({
      key: 'category',
      label: 'Top category',
      value: top.category,
      caption: `${formatMoney(top.amount)} · ${Math.round(top.percentage)}% of spend`,
    });
  }

  const paidWith = [...(dashboard.account_spending ?? [])].sort((a, b) => b.amount - a.amount)[0];
  if (paidWith && paidWith.amount > 0) {
    facts.push({
      key: 'paidWith',
      label: 'Paid most with',
      value: paidWith.account_name || 'Unassigned',
      caption: `${Math.round(paidWith.percentage)}% of spend`,
    });
  }
  return facts;
};

/**
 * "252% more than Sep 1–12" for the glance card, or null when the previous
 * window was too thin to compare against.
 */
export const glanceComparison = (dashboard: DashboardResponse) => {
  const { summary, period } = dashboard;
  if (!summary.spend_change_comparable || !summary.spend_change) return null;
  const change = Math.round(Math.abs(summary.spend_change));
  const previous = period.comparison_label?.split(' vs ')[1] ?? 'last time';
  return {
    more: summary.spend_change > 0,
    lead: `${change}% ${summary.spend_change > 0 ? 'more' : 'less'}`,
    rest: `than ${previous}`,
  };
};

/** Monday of this week to today, for the weekly review (P31). */
export const thisWeekRange = (today = new Date()) => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return {
    start: toApiDay(start),
    end: toApiDay(today),
    caption: `${start.toLocaleDateString('en-GB', { weekday: 'short' })} ${shortDay(start)} onwards`,
  };
};

/** The month before this one, as `YYYY-MM` and a name. */
export const lastMonth = (today = new Date()) => {
  const month = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return {
    key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
    name: month.toLocaleDateString('en-GB', { month: 'long' }),
  };
};

/**
 * The questions Insights offers to ask (P32), named for the window on screen.
 */
export const askSuggestions = (monthName: string, previousMonthName: string) => [
  'Where did my money go this week?',
  'My biggest expenses this month',
  `How does ${monthName} compare to ${previousMonthName}?`,
];
