import type { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';

import {
  formatBalance,
  getGroupBalanceRows,
  readBillForViewer,
  todayApiDate,
  zeroBalanceLabel,
} from '@/components/split/split-utils';
import { type DeviceContactOption, type SplitGroupSummary } from '@/components/split/split-types';
import { toAmountString } from '@/lib/money';
import {
  CURRENT_USER_KEY,
  computeSplitShares,
  splitParticipantKeys,
  type SplitSelection,
} from '@/lib/split-preferences';
import { type SplitActivityItem, type SplitDirection, type SplitFriend } from '@/lib/splits';

export type ParticipantDraft = {
  friend_id: number;
  share_amount: number;
  direction: SplitDirection;
};

export type DuplicateFriendPair = { survivor: SplitFriend; duplicate: SplitFriend };

const comparablePhone = (friend: SplitFriend) => {
  if (friend.phone_normalized) return friend.phone_normalized;
  const digits = friend.phone?.replace(/\D/g, '') ?? '';
  return digits.length >= 10 ? digits.slice(-10) : '';
};

export const friendsLookIdentical = (left: SplitFriend, right: SplitFriend) => {
  if (left.linked_user_id && left.linked_user_id === right.linked_user_id) return true;
  const leftEmail = left.email?.trim().toLowerCase();
  const rightEmail = right.email?.trim().toLowerCase();
  if (leftEmail && leftEmail === rightEmail) return true;
  const leftPhone = comparablePhone(left);
  return Boolean(leftPhone && leftPhone === comparablePhone(right));
};

export const toDeviceContactOption = (
  contact: Contacts.ExistingContact
): DeviceContactOption | null => {
  const fallbackName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  const name = (contact.name || fallbackName || contact.phoneNumbers?.[0]?.number || '').trim();
  if (!name) return null;
  return {
    id: contact.id,
    name,
    phone: contact.phoneNumbers?.find((phone) => phone.number)?.number,
    email: contact.emails?.find((email) => email.email)?.email,
    imageUri: contact.image?.uri,
  };
};

export const getBalanceTone = (
  value: number,
  colors: { positive: string; negative: string; neutral: string },
  hasActivity = true
) => {
  if (value > 0) return { label: `you are owed ${formatBalance(value)}`, color: colors.positive };
  if (value < 0) return { label: `you owe ${formatBalance(value)}`, color: colors.negative };
  return { label: zeroBalanceLabel({ hasActivity }), color: colors.neutral };
};

type BuiltParticipants =
  { ok: true; participants: ParticipantDraft[] } | { ok: false; error: string };

/**
 * A bill only records debts against the signed-in user, so a split they paid
 * becomes one row per friend, and a split a friend paid collapses to the single
 * row for what the user owes them. Keys here are always the composer's own:
 * `me` for the author, friend ids for everybody else.
 */
export const buildParticipantsFromSelection = (
  selection: SplitSelection,
  amount: number
): BuiltParticipants => {
  const keys = splitParticipantKeys(selection);
  const computed = computeSplitShares({
    amount,
    tab: selection.tab,
    keys,
    weights: selection.weights,
  });
  if (!computed.ok) return computed;

  if (selection.payerKey === CURRENT_USER_KEY) {
    const participants = keys
      .filter((key) => key !== CURRENT_USER_KEY)
      .map((key) => ({
        friend_id: Number(key),
        share_amount: computed.shares[key] ?? 0,
        direction: 'friend_owes_user' as SplitDirection,
      }))
      .filter((participant) => participant.friend_id > 0 && participant.share_amount > 0);
    if (participants.length === 0) {
      return { ok: false, error: 'Choose at least one friend for this split.' };
    }
    return { ok: true, participants };
  }

  const payerId = Number(selection.payerKey);
  if (!payerId) return { ok: false, error: 'Choose who paid for this expense.' };
  const userShare = computed.shares[CURRENT_USER_KEY] ?? 0;
  if (userShare <= 0) {
    return { ok: false, error: 'Add yourself to the split to record what you owe.' };
  }
  return {
    ok: true,
    participants: [{ friend_id: payerId, share_amount: userShare, direction: 'user_owes_friend' }],
  };
};

export const getActivityIcon = (
  type: SplitActivityItem['type']
): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (type) {
    case 'group_created':
      return 'account-group-outline';
    case 'friend_created':
      return 'account-plus-outline';
    case 'settlement':
      return 'hand-coin-outline';
    default:
      return 'receipt-text-outline';
  }
};

const csvCell = (value: string | number | null | undefined) => {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const csvRow = (values: (string | number | null | undefined)[]) => values.map(csvCell).join(',');

export const getSafeExportFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'split-group';

export const buildGroupExportCsv = (
  summary: SplitGroupSummary,
  friendById: Map<number, SplitFriend>,
  currentUserName: string
) => {
  const balances = getGroupBalanceRows(summary);
  const rows: string[] = [
    csvRow(['Finnri Split Report']),
    csvRow(['Group', summary.group.name]),
    csvRow(['Exported on', todayApiDate()]),
    csvRow(['Currency', 'INR']),
    csvRow([]),
    csvRow(['Who owes whom']),
    csvRow(['Who owes', 'Who gets paid', 'Amount', 'Status']),
  ];

  const openBalances = balances.filter(({ balance }) => balance !== 0);
  if (openBalances.length === 0) {
    rows.push(csvRow(['Everyone', 'Everyone', 0, 'Settled up']));
  } else {
    openBalances.forEach(({ person, balance }) => {
      rows.push(
        balance > 0
          ? csvRow([person.name, currentUserName, toAmountString(Math.abs(balance)), 'Open'])
          : csvRow([currentUserName, person.name, toAmountString(Math.abs(balance)), 'Open'])
      );
    });
  }

  rows.push(csvRow([]));
  rows.push(csvRow(['Expenses']));
  rows.push(
    ['Date', 'Expense', 'Total amount', 'Paid by', 'Split with', 'Share details', 'Notes']
      .map(csvCell)
      .join(',')
  );

  // Read through the viewer's restatement, like every other surface. Exported
  // straight from `participants` this named the owner's friend rows and stated
  // every direction from the owner's side, so a member's spreadsheet said she
  // had paid for the lot.
  summary.bills.forEach((bill) => {
    const reading = readBillForViewer(bill, friendById, currentUserName);
    const splitWith = reading.people
      .filter((person) => person.share > 0)
      .map((person) => person.name)
      .join(', ');
    const shareDetails = reading.people
      .filter((person) => person.share > 0)
      .map((person) => `${person.name} owes ${formatBalance(person.share)}`)
      .join('; ');
    rows.push(
      csvRow([
        bill.date,
        bill.title,
        toAmountString(bill.total_amount),
        reading.payerName,
        splitWith,
        shareDetails,
        bill.notes ?? '',
      ])
    );
  });

  return rows.join('\n');
};

/**
 * Neither of the two connection messages ends in "and try again" any more.
 * Both of the places they land now carry a Try again control of their own, and
 * a sentence that asks for a tap next to a button that performs it reads as two
 * different instructions.
 */
export const formatFriendlySplitError = (error: unknown, fallback: string) => {
  const rawMessage = error instanceof Error ? error.message : '';
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('network request failed') ||
    normalized.includes('fetch failed') ||
    normalized.includes('failed to connect') ||
    normalized.includes('java.net') ||
    normalized.includes('connectexception') ||
    normalized.includes('timed out') ||
    normalized.includes('networkerror')
  ) {
    return 'We could not reach Finnri. Check your internet connection.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('could not resolve') ||
    normalized.includes('connection refused')
  ) {
    return 'Finnri is not responding right now.';
  }

  if (!rawMessage.trim()) return fallback;

  const withoutBullets = rawMessage
    .split('\n')
    .map((line) => line.trim().replace(/^•\s*/, ''))
    .filter(Boolean);
  const userSafeLines = withoutBullets.filter(
    (line) => !/java\.net|connectexception|\/\d{1,3}(?:\.\d{1,3}){3}:\d+|stack|trace/i.test(line)
  );
  return userSafeLines.length > 0 ? userSafeLines.join('\n') : fallback;
};
