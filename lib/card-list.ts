import type { Account } from './accounts';
import { normalizeAccountType } from './accounts';
import { cardArtFor, cardBankName, cardNetworkLabel, type CardArt } from './card-art';
import { formatMoney } from './money';

/*
 * The All cards list (canvas board R18-AllCards, P93): each card drawn in
 * full, what it needs on its face, one status chip under it.
 */

export type CardsTab = 'bills' | 'spend';

export type CardAction = 'mark-paid' | 'add-bill' | null;

export type CardChip = {
  label: string;
  /** The dot before the label; none for the plain "View details". */
  tone: 'accent' | 'positive' | 'negative' | null;
  /** Where a tap goes: the card page, or straight into adding its bill. */
  target: 'details' | 'add-bill';
};

export type CardListItem = {
  account: Account;
  art: CardArt;
  bank: string;
  product: string;
  last4: string;
  network: string;
  figure: { amount: string; sub: string };
  action: CardAction;
  chip: CardChip;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-18" → "18 Nov". */
export function shortDate(iso: string) {
  const [, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!month || !day) return '';
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * The next time a due day comes round, today included. A due day past the end
 * of a short month falls on its last day, the way banks bill.
 */
export function nextDueDate(dueDay: number, today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const onMonth = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = Math.min(dueDay, last);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const thisMonth = onMonth(year, month);
  if (Number(thisMonth.slice(8)) >= day) return thisMonth;
  return month === 12 ? onMonth(year + 1, 1) : onMonth(year, month + 1);
}

export const isDrawnCard = (account: Account) =>
  normalizeAccountType(account.type) === 'credit_card' && account.credit_kind !== 'pay_later';

const remaining = (account: Account) => account.summary?.current_statement?.remaining_due ?? 0;

function chipFor(account: Account): CardChip {
  const summary = account.summary;
  const statement = summary?.current_statement;
  const streak = summary?.paid_in_full_streak ?? 0;
  const entries = summary?.entries_this_month ?? 0;
  if (statement?.is_overdue && statement.remaining_due > 0) {
    const days = Math.abs(statement.days_to_due);
    return {
      label: days > 0 ? `Overdue by ${days} day${days === 1 ? '' : 's'}` : 'Overdue',
      tone: 'negative',
      target: 'details',
    };
  }
  if (streak >= 2) return { label: `Paid in full ${streak} times`, tone: 'positive', target: 'details' };
  if (summary?.annual_fee?.waived) return { label: 'Fee waived this year', tone: 'positive', target: 'details' };
  if (!statement) return { label: "Add this month's bill", tone: 'accent', target: 'add-bill' };
  if (entries > 0) {
    return { label: `${entries} entr${entries === 1 ? 'y' : 'ies'} this month`, tone: 'accent', target: 'details' };
  }
  return { label: 'View details', tone: null, target: 'details' };
}

function figureFor(account: Account, tab: CardsTab, today: string): { figure: CardListItem['figure']; action: CardAction } {
  const summary = account.summary;
  if (tab === 'spend') {
    const entries = summary?.entries_this_month ?? 0;
    return {
      figure: {
        amount: formatMoney(summary?.spent_this_month ?? 0),
        sub: entries > 0 ? `${entries} entr${entries === 1 ? 'y' : 'ies'}` : 'Nothing yet',
      },
      action: null,
    };
  }
  const statement = summary?.current_statement;
  if (statement) {
    if (statement.remaining_due > 0) {
      return {
        figure: {
          amount: formatMoney(statement.remaining_due),
          sub: `${statement.is_overdue ? 'Was due' : 'Due'} ${shortDate(statement.due_date)}`,
        },
        action: 'mark-paid',
      };
    }
    return { figure: { amount: formatMoney(0), sub: 'Paid in full' }, action: null };
  }
  const dueDay = account.due_day ?? 0;
  return {
    figure: {
      amount: 'No bill',
      sub: dueDay >= 1 && dueDay <= 31 ? `Next on ${shortDate(nextDueDate(dueDay, today))}` : 'Add a bill',
    },
    action: 'add-bill',
  };
}

export function describeCard(account: Account, tab: CardsTab, today: string): CardListItem {
  const { figure, action } = figureFor(account, tab, today);
  return {
    account,
    art: cardArtFor(account),
    bank: cardBankName(account.provider_id, account.provider, account.name),
    product: account.card_product?.name ?? '',
    last4: account.last4 || (/^\d{4}$/.test(account.identifier ?? '') ? (account.identifier as string) : ''),
    network: cardNetworkLabel(account.card_network),
    figure,
    action,
    chip: chipFor(account),
  };
}

/**
 * Bills tab: the cards with something to pay first, soonest due first, then
 * the rest in the order they were added. Spend tab: most spent first.
 */
export function orderCards(cards: Account[], tab: CardsTab) {
  const indexed = cards.map((account, index) => ({ account, index }));
  indexed.sort((a, b) => {
    if (tab === 'spend') {
      return (b.account.summary?.spent_this_month ?? 0) - (a.account.summary?.spent_this_month ?? 0) || a.index - b.index;
    }
    const dueA = remaining(a.account) > 0 ? a.account.summary?.current_statement?.due_date ?? '' : '';
    const dueB = remaining(b.account) > 0 ? b.account.summary?.current_statement?.due_date ?? '' : '';
    if (dueA && dueB) return dueA.localeCompare(dueB) || a.index - b.index;
    if (dueA || dueB) return dueA ? -1 : 1;
    return a.index - b.index;
  });
  return indexed.map(({ account }) => account);
}

/** "₹14,660 due on 3 cards · next on 18 Nov", or "· 1 overdue" first when one is. */
export function cardsSummaryLine(cards: Account[], tab: CardsTab, today = '') {
  if (tab === 'spend') {
    const spent = cards.reduce((sum, account) => sum + (account.summary?.spent_this_month ?? 0), 0);
    return { lead: `${formatMoney(spent)} spent`, rest: 'on your cards this month' };
  }
  const due = cards.filter((account) => remaining(account) > 0);
  if (due.length === 0) return { lead: 'No bills due', rest: `on ${cards.length} card${cards.length === 1 ? '' : 's'}` };
  const total = due.reduce((sum, account) => sum + remaining(account), 0);
  const overdue = due.filter((account) => account.summary?.current_statement?.is_overdue).length;
  const next = due
    .filter((account) => !account.summary?.current_statement?.is_overdue)
    .map((account) => account.summary?.current_statement?.due_date ?? '')
    .filter((date) => date && date >= today)
    .sort()[0];
  return {
    lead: `${formatMoney(total)} due on ${due.length} card${due.length === 1 ? '' : 's'}`,
    rest: [overdue ? `${overdue} overdue` : '', next ? `next on ${shortDate(next)}` : ''].filter(Boolean).join(' · '),
  };
}

export const billsDueCount = (cards: Account[]) => cards.filter((account) => remaining(account) > 0).length;
