import { normalizeAccountType, type Account, type AccountType } from './accounts';
import { formatMoney } from './money';
import type { UpcomingDue } from './upcoming';

/**
 * What the cards owe, said honestly (P19): "₹X owed on N cards". A limit is
 * only named when every card has one — summing the limits of some cards
 * against the debt on all of them made a ₹1L balance read as nearly nothing.
 */
export const cardTotalSummary = (accounts: Account[]) => {
  const cards = accounts.filter((account) => normalizeAccountType(account.type) === 'credit_card');
  const outstanding = cards.reduce(
    (sum, card) => sum + (card.summary?.outstanding ?? card.balance ?? 0),
    0
  );
  const withoutLimit = cards.filter((card) => !(Number(card.credit_limit ?? 0) > 0)).length;
  const limit =
    cards.length > 0 && withoutLimit === 0
      ? cards.reduce((sum, card) => sum + Number(card.credit_limit ?? 0), 0)
      : null;
  const cardWord = cards.length === 1 ? 'card' : 'cards';
  return {
    cards: cards.length,
    outstanding,
    limit,
    withoutLimit,
    headline: `${formatMoney(outstanding)} owed on ${cards.length} ${cardWord}`,
    caption:
      limit !== null
        ? `of ${formatMoney(limit)} limit`
        : withoutLimit > 0
          ? `${cards.length} ${cardWord} · ${withoutLimit} without a limit`
          : `${cards.length} ${cardWord}`,
  };
};

export type AccountKindGroup = {
  key: 'cards' | 'bank' | 'wallets' | 'cash' | 'other';
  label: string;
  icon: string;
  hue: string;
  accounts: Account[];
  /** What the group holds or owes, or null when not every account knows. */
  amount: number | null;
  /** "owed" for cards, "balance" for the rest. */
  amountLabel: string;
};

const KIND_GROUPS: {
  key: AccountKindGroup['key'];
  label: string;
  icon: string;
  hue: string;
  types: AccountType[];
}[] = [
  { key: 'cards', label: 'Credit cards', icon: 'credit-card-outline', hue: '#8257E5', types: ['credit_card'] },
  { key: 'bank', label: 'Bank', icon: 'bank-outline', hue: '#1E6FB8', types: ['bank', 'debit_card'] },
  { key: 'wallets', label: 'Wallets & UPI', icon: 'wallet-outline', hue: '#64748B', types: ['wallet', 'upi'] },
  { key: 'cash', label: 'Cash', icon: 'cash', hue: '#1F9D63', types: ['cash'] },
  { key: 'other', label: 'Other', icon: 'dots-horizontal', hue: '#64748B', types: ['other'] },
];

/**
 * Money's Accounts section (P17): one row per kind instead of one per account,
 * so nine cards are one line that says what they owe.
 */
export const accountKindGroups = (accounts: Account[]): AccountKindGroup[] =>
  KIND_GROUPS.map((group) => {
    const members = accounts.filter((account) =>
      group.types.includes(normalizeAccountType(account.type))
    );
    let amount: number | null = null;
    if (group.key === 'cards') {
      amount = members.reduce(
        (sum, card) => sum + (card.summary?.outstanding ?? card.balance ?? 0),
        0
      );
    } else if (
      members.length > 0 &&
      members.every((account) => typeof account.summary?.running_balance === 'number')
    ) {
      amount = members.reduce((sum, account) => sum + (account.summary?.running_balance ?? 0), 0);
    }
    return {
      key: group.key,
      label: group.label,
      icon: group.icon,
      hue: group.hue,
      accounts: members,
      amount,
      amountLabel: group.key === 'cards' ? 'owed' : 'balance',
    };
  }).filter((group) => group.accounts.length > 0);

/**
 * The few dues worth a place on the overview: anything overdue first, then
 * whatever comes soonest.
 */
export const overviewDues = (dues: UpcomingDue[], count = 3) =>
  [...dues]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, count);

/**
 * Which quick action a due row offers (P20): "Mark paid" on a recurring
 * payment that is due or late, "Got it" on money expected back. A card's
 * statement is paid from the card's own page.
 */
export const dueAction = (due: UpcomingDue): 'mark-paid' | 'got-it' | null => {
  if (due.kind === 'refund') return 'got-it';
  if (due.kind === 'subscription' && due.state !== 'scheduled') return 'mark-paid';
  return null;
};
