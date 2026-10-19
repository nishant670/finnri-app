import { formatMonthYear, getFirstName } from '@/components/split/split-utils';
import { settlementPaymentCaption, type SplitActivityItem } from '@/lib/splits';

/** Where a settlement stands with the other person, in a line. */
export type SettlementStanding = {
  kind: 'confirmed' | 'pending' | 'denied';
  label: string;
  /** Waiting on the reader: the row offers Confirm and Deny. */
  yourMove: boolean;
};

export type FriendSettlementRow = {
  key: string;
  settlementId: number;
  /** "Biwi paid you", "You paid Biwi". */
  title: string;
  amount: number;
  /** They paid the reader, rather than the reader paying them. */
  incoming: boolean;
  /** YYYY-MM-DD, the day the money moved. */
  date: string;
  /** "Bubu Dudu Daily · Paid by UPI · Recorded by Biwi". */
  details: string;
  notes: string | null;
  /** Null for a payment nobody needed to agree to. */
  standing: SettlementStanding | null;
};

export type FriendSettlementHistory = {
  sections: { title: string; rows: FriendSettlementRow[] }[];
  /** What they paid the reader, denied payments left out. */
  received: number;
  /** What the reader paid them, denied payments left out. */
  paid: number;
  /** Settlements that count — every one but the denied. */
  count: number;
  /** Waiting on the reader to confirm or deny. */
  awaitingYou: number;
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "8 Oct", for when somebody answered — in the reader's own time zone. */
const answeredOn = (iso?: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
};

/**
 * Who has to agree is whoever did *not* record it.
 *
 * A settlement is one person's account of money that moved outside Finnri.
 * When the other person has an account they are asked; until they answer, it
 * already counts in both balances. A friend without an account is never
 * asked, so their payments are confirmed from the start and carry no line.
 */
const standingOf = (
  item: SplitActivityItem,
  recordedByThem: boolean,
  friendFirstName: string
): SettlementStanding | null => {
  const on = answeredOn(item.responded_at);
  const when = on ? ` on ${on}` : '';
  switch (item.status) {
    case 'pending':
      return recordedByThem
        ? { kind: 'pending', label: 'Waiting for you', yourMove: true }
        : { kind: 'pending', label: `Waiting for ${friendFirstName}`, yourMove: false };
    case 'denied':
      return {
        kind: 'denied',
        label: recordedByThem ? `You denied it${when}` : `${friendFirstName} denied it${when}`,
        yourMove: false,
      };
    default:
      if (!on) return null;
      return {
        kind: 'confirmed',
        label: recordedByThem
          ? `You confirmed it${when}`
          : `${friendFirstName} confirmed it${when}`,
        yourMove: false,
      };
  }
};

/**
 * What the person wrote, if anything. Settling a group pre-fills the note
 * with "Settlement for <group>", which the details line already says.
 */
const ownNote = (item: SplitActivityItem) => {
  const note = item.notes?.trim();
  if (!note) return null;
  if (item.group_name && note.toLowerCase() === `settlement for ${item.group_name}`.toLowerCase()) {
    return null;
  }
  return note;
};

/**
 * Every settlement between the reader and one friend, by month, newest first,
 * with what each says about who recorded it and whether it was agreed.
 *
 * Denied payments stay in the list — a denial moves a balance back, and this
 * is where the person who recorded it finds out why — but are left out of the
 * totals, as they are out of every balance.
 */
export const buildFriendSettlementHistory = (
  items: SplitActivityItem[],
  friendName: string
): FriendSettlementHistory => {
  const friendFirstName = getFirstName(friendName);
  const sections: FriendSettlementHistory['sections'] = [];
  let received = 0;
  let paid = 0;
  let count = 0;
  let awaitingYou = 0;

  const ordered = [...items]
    .filter((item) => item.type === 'settlement')
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? 1
          : -1
        : a.created_at === b.created_at
          ? 0
          : a.created_at < b.created_at
            ? 1
            : -1
    );

  ordered.forEach((item) => {
    const amount = Number(item.amount ?? 0);
    const incoming = item.direction === 'friend_paid_user';
    // The feed names the author only when it was not the reader.
    const recordedByThem = Boolean(item.actor_name);
    const standing = standingOf(item, recordedByThem, friendFirstName);

    if (item.status !== 'denied') {
      count += 1;
      if (incoming) received += amount;
      else paid += amount;
    }
    if (standing?.yourMove) awaitingYou += 1;

    const details = [
      item.group_name || null,
      settlementPaymentCaption(item.payment_mode),
      recordedByThem ? `Recorded by ${friendFirstName}` : 'Recorded by you',
    ]
      .filter(Boolean)
      .join(' · ');

    const row: FriendSettlementRow = {
      key: item.id,
      settlementId: item.record_id,
      title: incoming ? `${friendFirstName} paid you` : `You paid ${friendFirstName}`,
      amount,
      incoming,
      date: item.date,
      details,
      notes: ownNote(item),
      standing,
    };

    const title = formatMonthYear(item.date);
    const section = sections[sections.length - 1];
    if (section?.title === title) section.rows.push(row);
    else sections.push({ title, rows: [row] });
  });

  return { sections, received, paid, count, awaitingYou };
};
