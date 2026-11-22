import { toAmountInputValue } from './money';
import type { ParseResponse } from './parse';
import {
  computeSplitShares,
  CURRENT_USER_KEY,
  defaultSplitToComposerKeys,
  friendSplitKey,
  groupComposerMembers,
  splitParticipantKeys,
  type SplitSelection,
} from './split-preferences';
import type { SplitFriend, SplitGroup } from './splits';

export type ResolvedSplitParticipant = {
  friendId: number | null;
  friendName: string;
  shareAmount: string;
  /** Keeps a group default proportional when the transaction total is edited. */
  sharePercent?: string;
  direction: 'friend_owes_user' | 'user_owes_friend';
};

export type ResolvedSplitDraft = {
  splitEnabled: boolean;
  splitGroupId: number | null;
  splitGroupName: string;
  splitParticipants: ResolvedSplitParticipant[];
  /** Present when a saved group default was rejected and equal shares were used. */
  splitDefaultWarning?: string;
};

export type ResolvedGroupParticipants = {
  participants: ResolvedSplitParticipant[];
  defaultApplied: boolean;
  warning?: string;
};

const normalizeLookup = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()[\]"']/g, ' ')
    .replace(/\s+/g, ' ');

const compactLookup = (value?: string | null) => normalizeLookup(value).replace(/\s/g, '');

const spokenLookup = (value?: string | null) =>
  compactLookup(value)
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/(.)\1{2,}/g, '$1$1');

const findUniqueByNormalizedName = <T extends { name: string }>(
  items: T[],
  name: string,
  normalize: (value?: string | null) => string,
  allowContains = true
): T | null => {
  const normalizedName = normalize(name);
  if (!normalizedName) return null;

  const exact = items.find((item) => normalize(item.name) === normalizedName);
  if (exact) return exact;
  if (!allowContains || normalizedName.length < 5) return null;

  const partialMatches = items.filter((item) => {
    const normalizedItemName = normalize(item.name);
    return (
      normalizedItemName.length >= 5 &&
      (normalizedItemName.includes(normalizedName) || normalizedName.includes(normalizedItemName))
    );
  });
  return partialMatches.length === 1 ? partialMatches[0] : null;
};

const findByName = <T extends { name: string }>(items: T[], name?: string | null): T | null => {
  const normalizedName = normalizeLookup(name);
  if (!normalizedName) return null;

  return (
    findUniqueByNormalizedName(items, normalizedName, normalizeLookup) ??
    findUniqueByNormalizedName(items, normalizedName, compactLookup) ??
    findUniqueByNormalizedName(items, normalizedName, spokenLookup)
  );
};

/** Words that say "this is a group" rather than name it: "daily group" is "daily". */
const GROUP_FILLER_WORDS = new Set(['group', 'grp', 'the', 'my', 'our']);

const groupLookup = (value?: string | null) =>
  normalizeLookup(value)
    .split(' ')
    .filter((word) => word && !GROUP_FILLER_WORDS.has(word))
    .join('');

const editDistance = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
};

/**
 * A misheard group name, run together: "Bobududu" for "Bubu Dudu Daily". The
 * spoken name is compared with the start of each group's name, letter by
 * letter, allowing a slip per eight letters — and only a single close group
 * counts.
 */
const findGroupBySpelling = (groups: SplitGroup[], name: string): SplitGroup | null => {
  const spoken = groupLookup(name);
  if (spoken.length < 6) return null;
  const allowed = Math.max(1, Math.floor(spoken.length / 8));
  const close = groups.filter((group) => {
    const saved = groupLookup(group.name);
    if (saved.length < spoken.length - allowed) return false;
    return editDistance(spoken, saved.slice(0, spoken.length)) <= allowed;
  });
  return close.length === 1 ? close[0] : null;
};

const findGroup = (groups: SplitGroup[], name?: string | null): SplitGroup | null => {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return (
    findByName(groups, trimmed) ??
    findUniqueByNormalizedName(groups, trimmed, groupLookup) ??
    findGroupBySpelling(groups, trimmed)
  );
};

/** "Bubu" is a piece of "Bubu Dudu Daily", not a person to add. */
const isPartOfGroupName = (group: SplitGroup, name: string) => {
  const piece = compactLookup(name);
  return piece.length > 0 && compactLookup(group.name).includes(piece);
};

const formatShare = (value: number | null) =>
  value != null && value > 0 ? toAmountInputValue(value) : '';

const parseAmount = (value?: number | string | null) =>
  typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;

const percentOf = (share: number, total?: number | null) => {
  if (total == null || !Number.isFinite(total) || total <= 0 || share <= 0) return undefined;
  return String(Math.round((share / total) * 10000) / 100);
};

const equalFriendPercent = (friendCount: number) =>
  friendCount > 0 ? String(Math.round((100 / (friendCount + 1)) * 100) / 100) : undefined;

const defaultEqualShare = (amount: number | null | undefined, friendCount: number) => {
  if (amount == null || !Number.isFinite(amount) || amount <= 0 || friendCount <= 0) {
    return null;
  }
  return amount / (friendCount + 1);
};

const sumShares = (participants: ResolvedSplitParticipant[]) =>
  participants.reduce((sum, participant) => sum + Number(participant.shareAmount || 0), 0);

const rebalanceIfSharesExceedAmount = (
  participants: ResolvedSplitParticipant[],
  amount: number | null | undefined
) => {
  if (
    participants.length <= 1 ||
    amount == null ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    sumShares(participants) <= amount
  ) {
    return participants;
  }

  const equalShare = defaultEqualShare(amount, participants.length);
  return participants.map((participant) => ({
    ...participant,
    shareAmount: formatShare(equalShare),
  }));
};

export const buildEqualParticipantsForGroup = (
  group: SplitGroup,
  amount?: number | string | null
): ResolvedSplitParticipant[] => {
  const members = groupComposerMembers(group) ?? [];
  const numericAmount = parseAmount(amount);
  const share = defaultEqualShare(numericAmount, members.length);

  return members.map((member) => ({
    friendId: member.friend_id,
    friendName: '',
    shareAmount: formatShare(share),
    sharePercent: equalFriendPercent(members.length),
    direction: 'friend_owes_user',
  }));
};

const DEFAULT_SPLIT_WARNING =
  "Group default couldn't be applied here. Equal shares are shown instead.";

/**
 * Resolve a group in the same key space and through the same allocator as the
 * dedicated Split composer. The returned rows are the debts the entry API can
 * store: one row per friend when the viewer paid, or one row for the friend
 * who paid when the viewer owes them.
 */
export const resolveParticipantsForGroup = (
  group: SplitGroup,
  amount?: number | string | null
): ResolvedGroupParticipants => {
  const equalParticipants = buildEqualParticipantsForGroup(group, amount);
  const savedDefault = group.default_split;
  if (!savedDefault) {
    return { participants: equalParticipants, defaultApplied: false };
  }

  const numericAmount = parseAmount(amount);
  const translated = defaultSplitToComposerKeys(group, savedDefault);
  const memberKeys = new Set(
    (groupComposerMembers(group) ?? []).map((member) => friendSplitKey(member.friend_id))
  );
  const usable =
    translated != null &&
    translated.participantKeys.every((key) => key === CURRENT_USER_KEY || memberKeys.has(key)) &&
    (translated.payerKey === CURRENT_USER_KEY || memberKeys.has(translated.payerKey));

  if (!usable || !translated) {
    return {
      participants: equalParticipants,
      defaultApplied: false,
      warning: DEFAULT_SPLIT_WARNING,
    };
  }

  const selection: SplitSelection = {
    selfKey: CURRENT_USER_KEY,
    payerKey: translated.payerKey,
    fullAmount: Boolean(savedDefault.full_amount),
    participantKeys: translated.participantKeys,
    tab: savedDefault.tab,
    weights: translated.weights,
  };
  const keys = splitParticipantKeys(selection);
  // A group can be selected before the amount is entered. Allocate a neutral
  // ₹100 in that case so the configured proportions survive in sharePercent;
  // the form turns them into real rupees as soon as the amount arrives.
  const allocationAmount =
    numericAmount != null && Number.isFinite(numericAmount) && numericAmount > 0
      ? numericAmount
      : 100;
  const computed = computeSplitShares({
    amount: allocationAmount,
    tab: selection.tab,
    keys,
    weights: selection.weights,
  });
  if (!computed.ok) {
    return {
      participants: equalParticipants,
      defaultApplied: false,
      warning: DEFAULT_SPLIT_WARNING,
    };
  }

  if (selection.payerKey === CURRENT_USER_KEY) {
    const participants = keys
      .filter((key) => key !== CURRENT_USER_KEY)
      .map((key) => ({
        friendId: Number(key),
        friendName: '',
        shareAmount:
          allocationAmount === numericAmount ? formatShare(computed.shares[key] ?? 0) : '',
        sharePercent: percentOf(computed.shares[key] ?? 0, allocationAmount),
        direction: 'friend_owes_user' as const,
      }))
      .filter((participant) => participant.friendId > 0 && participant.sharePercent);
    if (participants.length > 0) {
      return { participants, defaultApplied: true };
    }
  } else {
    const payerId = Number(selection.payerKey);
    const viewerShare = computed.shares[CURRENT_USER_KEY] ?? 0;
    if (payerId > 0 && viewerShare > 0) {
      return {
        participants: [
          {
            friendId: payerId,
            friendName: '',
            shareAmount: allocationAmount === numericAmount ? formatShare(viewerShare) : '',
            sharePercent: percentOf(viewerShare, allocationAmount),
            direction: 'user_owes_friend',
          },
        ],
        defaultApplied: true,
      };
    }
  }

  return {
    participants: equalParticipants,
    defaultApplied: false,
    warning: DEFAULT_SPLIT_WARNING,
  };
};

/** Backwards-compatible convenience for form interactions. */
export const buildParticipantsForGroup = (group: SplitGroup, amount?: number | string | null) =>
  resolveParticipantsForGroup(group, amount).participants;

export const resolveSplitDraft = (
  data: ParseResponse,
  splitFriends: SplitFriend[],
  splitGroups: SplitGroup[]
): ResolvedSplitDraft => {
  const candidate = data.split_candidate_details;
  const spokenParticipants = candidate?.participants ?? [];
  const isUnknownPerson = (participant: (typeof spokenParticipants)[number]) => {
    const name = participant.friend_name?.trim() ?? '';
    return name !== '' && !findByName(splitFriends, name);
  };
  const unknownNames = spokenParticipants
    .filter(isUnknownPerson)
    .map((participant) => participant.friend_name?.trim() ?? '');

  // A voice capture often hears a group as people: "split with Bubu, Dudu,
  // daily group" came back as the group "daily group" plus two new friends,
  // and "Bobududu" as one new friend (2026-11-11). Names that are not saved
  // friends get one more look as the group they are part of.
  const namedGroup = findGroup(splitGroups, candidate?.group_name);
  const groupFromPeople =
    namedGroup == null && unknownNames.length > 0
      ? (findGroup(splitGroups, [...unknownNames, candidate?.group_name ?? ''].join(' ')) ??
        findGroup(splitGroups, unknownNames.join(' ')))
      : null;
  const matchedGroup = namedGroup ?? groupFromPeople;
  const participantCandidates = spokenParticipants.filter((participant) => {
    if (!matchedGroup || !isUnknownPerson(participant)) return true;
    // The names that made up the group, or pieces of its name, are the group.
    return !(groupFromPeople || isPartOfGroupName(matchedGroup, participant.friend_name ?? ''));
  });
  const participantCount =
    participantCandidates.length ||
    (matchedGroup ? (groupComposerMembers(matchedGroup)?.length ?? 0) : 0) ||
    1;
  const fallbackShare = defaultEqualShare(data.amount, participantCount);

  const splitParticipants = participantCandidates
    .map((participant) => {
      const friendName = participant.friend_name?.trim() ?? '';
      const matchingFriend = findByName(splitFriends, friendName);
      const shareAmount =
        participant.share_amount != null && participant.share_amount > 0
          ? participant.share_amount
          : fallbackShare;

      return {
        friendId: matchingFriend?.id ?? null,
        friendName: matchingFriend ? '' : friendName,
        shareAmount: formatShare(shareAmount),
        direction: participant.direction ?? 'friend_owes_user',
      };
    })
    .filter(
      (participant) => participant.friendId || participant.friendName || participant.shareAmount
    );
  const balancedSplitParticipants = rebalanceIfSharesExceedAmount(splitParticipants, data.amount);

  const groupResolution =
    balancedSplitParticipants.length === 0 && matchedGroup
      ? resolveParticipantsForGroup(matchedGroup, data.amount)
      : null;

  return {
    splitEnabled: Boolean(
      data.split_candidate || balancedSplitParticipants.length > 0 || matchedGroup
    ),
    splitGroupId: matchedGroup?.id ?? null,
    splitGroupName: matchedGroup ? '' : (candidate?.group_name?.trim() ?? ''),
    splitParticipants:
      balancedSplitParticipants.length > 0
        ? balancedSplitParticipants
        : (groupResolution?.participants ?? []),
    ...(groupResolution?.warning ? { splitDefaultWarning: groupResolution.warning } : null),
  };
};
