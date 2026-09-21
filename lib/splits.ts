import { ApiFieldErrors, readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

export type SplitDirection = 'friend_owes_user' | 'user_owes_friend';
export type SettlementDirection = 'friend_paid_user' | 'user_paid_friend';

export type SplitFriend = {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  phone?: string;
  phone_normalized?: string;
  linked_user_id?: number;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SplitParticipant = {
  id?: number;
  user_id?: number;
  bill_id?: number;
  friend_id: number;
  friend?: SplitFriend;
  share_amount: number;
  direction: SplitDirection;
};

export type SplitGroupMember = {
  id: number;
  user_id: number;
  group_id: number;
  friend_id: number;
  friend?: SplitFriend;
};

export type SplitGroupKind = 'trip' | 'home' | 'couple' | 'other';

export type SplitGroupDefaultSplitTab = 'equally' | 'percentages' | 'shares';

/**
 * The slot naming the group owner in a default split. Every other slot is a
 * member's friend id as a string.
 */
export const SPLIT_GROUP_OWNER_SLOT = 'owner';

export type SplitGroupDefaultSplitShare = {
  slot: string;
  weight?: string;
};

/**
 * A group-wide default split, anchored on the group owner rather than on
 * whoever is reading it — the row is shared, so a viewer-relative "you" would
 * mean a different person to each member.
 */
export type SplitGroupDefaultSplit = {
  payer: string;
  full_amount?: boolean;
  tab: SplitGroupDefaultSplitTab;
  participants: SplitGroupDefaultSplitShare[];
};

/**
 * What happened to somebody just added to a group. Adding raises an invite; it
 * never grants sight of the group, which still follows acceptance.
 */
export type SplitGroupMemberInvite = {
  friend_id: number;
  name: string;
  /**
   * `notified` — they have a Finnri account with an invite waiting in it.
   * `invite_created` — no account yet, so the link has to be shared.
   * `no_contact` — no email or phone on the friend, so nobody could be reached.
   */
  status: 'notified' | 'invite_created' | 'no_contact';
};

export type SplitGroupFriendBalance = {
  friend_id: number;
  /** Positive means they owe the caller. */
  net_balance: number;
};

/**
 * One person in a group, named the way the *caller* names them.
 *
 * `members` is the owner's list of the owner's own friend rows, so every screen
 * that rendered it directly was reading somebody else's address book: a member
 * saw one row — herself — and the person who owns the group was missing
 * entirely. This is the roster every viewer can draw.
 *
 * `friend_id` is 0 for the caller themselves, and 0 for anybody the caller has
 * no row of their own for yet. `name` is filled either way, so the roster stays
 * complete even where it is not yet something you can settle against.
 */
export type SplitGroupViewerMember = {
  /** The person in the owner's namespace: 'owner', or a friend id as text. */
  slot: string;
  friend_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_viewer: boolean;
};

/**
 * One person's part in one bill, from the caller's side.
 *
 * A bill's own `participants` are unreadable by anybody but its author: the
 * rows name that author's friend ids and `direction` is stated from their side.
 * Read literally by another member, every expense the owner entered said "You
 * paid" on her phone. These rows are the same bill turned round to face
 * whoever asked for it.
 */
export type SplitBillViewerShare = {
  slot: string;
  /** The caller's own friend row for this person; 0 when it is the caller. */
  friend_id: number;
  name: string;
  is_viewer: boolean;
  /** What this person laid out. Only the payer has a non-zero figure. */
  paid: number;
  /** What the bill makes theirs to carry. */
  share: number;
};

export type SplitGroup = {
  id: number;
  user_id: number;
  name: string;
  archived: boolean;
  kind?: SplitGroupKind;
  /**
   * The group's picture, hosted by the backend. Empty when it has none.
   *
   * A URL rather than a device path on purpose: the photo belongs to the group,
   * so every member has to see the same one. A file kept on whichever phone
   * picked it is a private note, not a group photo.
   */
  photo_url?: string;
  default_split?: SplitGroupDefaultSplit | null;
  owner_name?: string;
  /** Which member friend row is the caller. Absent for the group's owner. */
  viewer_friend_id?: number | null;
  /**
   * The group's roster translated into the caller's *own* friend rows, keyed by
   * slot — 'owner', or an owner-side friend id as text.
   *
   * Sent only to members. A group's roster is written in the owner's namespace
   * and a composer can only name rows its author owns, so without this a member
   * could name nobody in the group but themselves. It never contains a row
   * standing for the caller, which is what stops a two-person split being
   * divided three ways between one person and two copies of the other.
   */
  viewer_slot_friends?: Record<string, number>;
  /**
   * This group's ledger from the caller's side, in their own friend rows.
   *
   * Served rather than summed on the client: a bill's `direction` is written
   * relative to whoever recorded it, so adding up every participant row in a
   * group as if the direction were absolute inverts the sign of every expense
   * somebody else entered — a card telling you a member owes you money she in
   * fact laid out for you.
   */
  viewer_balances?: SplitGroupFriendBalance[];
  /** Positive means the group owes the caller overall. */
  viewer_net_balance?: number;
  /**
   * The whole roster in the caller's own terms, themselves included and
   * flagged. Prefer this over `members` anywhere a person is drawn on screen.
   */
  viewer_members?: SplitGroupViewerMember[];
  members?: SplitGroupMember[];
  /** Returned only on a create or update, for the people just added. */
  member_invites?: SplitGroupMemberInvite[];
  viewer_role?: 'owner' | 'member';
  viewer_can_add_expense?: boolean;
  viewer_can_manage?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SplitGroupInvite = {
  token: string;
  url: string;
  deep_link: string;
  group: SplitGroup;
  expires_at?: string | null;
};

/** An invite waiting on the signed-in user, ready to be offered on app open. */
export type PendingSplitGroupInvite = {
  id: number;
  token: string;
  group_id: number;
  group_name: string;
  owner_name: string;
  created_at: string;
};

export type SplitGroupDirectInvite = {
  id: number;
  target_email: string;
  target_phone: string;
  matched_user: boolean;
  notification_sent: boolean;
  url: string;
  deep_link: string;
  message: string;
  status: string;
  group: SplitGroup;
  created_at?: string;
};

export type SplitGroupInviteDetails = {
  token: string;
  group: SplitGroup;
  owner_name: string;
  member_count: number;
  status: string;
  expires_at?: string | null;
};

export type SplitGroupInviteAcceptResponse = {
  group: SplitGroup;
  friend: SplitFriend;
  member: SplitGroupMember;
};

export type SplitBill = {
  mode?: string;
  category?: string;
  merchant?: string;
  tag?: string;
  time?: string;
  attachment?: string;

  id: number;
  user_id: number;
  entry_id?: number | null;
  group_id?: number | null;
  group?: SplitGroup | null;
  title: string;
  total_amount: number;
  currency: 'INR';
  date: string;
  notes?: string;
  participants: SplitParticipant[];
  /**
   * This bill restated for whoever asked for it. Prefer it over `participants`
   * on any screen that says "you": `participants` only ever describes the
   * author.
   */
  viewer_shares?: SplitBillViewerShare[];
  viewer_can_edit?: boolean;
  viewer_can_delete?: boolean;
  created_at?: string;
  updated_at?: string;
};

/**
 * Whether the other side agrees a recorded payment happened.
 *
 * A settlement is one person's word about money that moved outside Finnri, and
 * it rewrites both ledgers. `pending` still counts in every balance — the
 * payment is being asserted to have happened, and a ledger that waited for a
 * tap would disagree with the money — and a denial reverses it. A settlement
 * against a friend who has no Finnri account is born `confirmed`: there is
 * nobody to ask, and leaving it pending would be a prompt that never arrives.
 */
export type SplitSettlementStatus = 'pending' | 'confirmed' | 'denied';

export type SplitSettlement = {
  id: number;
  user_id: number;
  friend_id: number;
  friend?: SplitFriend;
  amount: number;
  direction: SettlementDirection;
  date: string;
  notes?: string;
  status?: SplitSettlementStatus;
  counterparty_user_id?: number | null;
  responded_at?: string | null;
  /** Response-only, on a settlement somebody else recorded about the reader. */
  recorded_by_name?: string;
  group_name?: string;
  created_at?: string;
  updated_at?: string;
};

export type SplitBalance = {
  friend: SplitFriend;
  total_owed_by_friend: number;
  total_owed_to_friend: number;
  net_balance: number;
};

export type SplitActivityType = 'group_created' | 'friend_created' | 'bill' | 'settlement';

export type SplitActivityItem = {
  id: string;
  type: SplitActivityType;
  record_id: number;
  title: string;
  date: string;
  amount?: number;
  group_id?: number | null;
  group?: SplitGroup | null;
  friend_id?: number | null;
  friend?: SplitFriend | null;
  direction?: SettlementDirection;
  /** On settlement rows only: whether the other side has agreed to it yet. */
  status?: SplitSettlementStatus;
  /**
   * Who recorded this, when it was not the caller — named the way the caller
   * names them. Present only on items from a shared group.
   */
  actor_name?: string;
  participant_count?: number;
  participants?: SplitParticipant[];
  notes?: string;
  created_at: string;
};

export type SplitActivityResponse = {
  items: SplitActivityItem[];
  page: number;
  page_size: number;
  total: number;
};

export type SplitFriendPayload = {
  name: string;
  email?: string;
  phone?: string;
};

export type SplitBillPayload = {
  mode?: string;
  category?: string;
  merchant?: string;
  tag?: string;
  time?: string;
  attachment?: string;

  entry_id?: number | null;
  group_id?: number | null;
  title: string;
  total_amount: number;
  currency?: 'INR';
  date: string;
  notes?: string;
  participants: Array<{
    friend_id: number;
    share_amount: number;
    direction: SplitDirection;
  }>;
};

export type SplitGroupPayload = {
  name: string;
  kind: SplitGroupKind;
  /**
   * Omit to leave the group's photo alone; send an empty string to remove it.
   * The server rejects anything that is not a URL it issued from `/v1/upload`.
   */
  photo_url?: string;
  friend_ids: number[];
};

export type SplitSettlementPayload = {
  friend_id: number;
  /**
   * The group whose expenses this payment closes, when it was recorded from
   * one. A settlement that names a group is deleted with it — otherwise it
   * outlives the expenses it settled and keeps moving the running total with
   * nothing left on screen to explain it.
   */
  group_id?: number;
  amount: number;
  direction: SettlementDirection;
  date: string;
  notes?: string;
};

export class SplitApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiFieldErrors;

  constructor(message: string, status: number, code?: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = 'SplitApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const splitFieldLabels: Record<string, string> = {
  name: 'Friend name',
  email: 'Email',
  phone: 'Phone',
  title: 'Bill title',
  total_amount: 'Total amount',
  date: 'Date',
  participants: 'Friend shares',
  entry_id: 'Transaction',
  friend_id: 'Friend',
  group_id: 'Group',
  group_name: 'Group',
  friend_ids: 'Group friends',
  share_amount: 'Share amount',
  amount: 'Settlement amount',
  direction: 'Direction',
};

const readSplitError = async (response: Response, fallback: string): Promise<SplitApiError> => {
  const apiError = await readApiError(response, fallback, splitFieldLabels);
  return new SplitApiError(apiError.message, apiError.status, apiError.code, apiError.fields);
};

const authHeaders = (token: string, json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  Authorization: `Bearer ${token}`,
});

const coerceAmount = (record: Record<string, unknown>, keys: string[]) => {
  const next = { ...record };
  for (const key of keys) {
    if (next[key] != null) {
      next[key] = Number(next[key]);
    }
  }
  return next;
};

const normalizeSplitBill = (bill: SplitBill): SplitBill => ({
  ...bill,
  total_amount: Number(bill.total_amount),
  participants: (bill.participants ?? []).map((participant) =>
    coerceAmount(participant as unknown as Record<string, unknown>, ['share_amount'])
  ) as SplitParticipant[],
  viewer_shares: (bill.viewer_shares ?? []).map((share) =>
    coerceAmount(share as unknown as Record<string, unknown>, ['paid', 'share'])
  ) as SplitBillViewerShare[],
});

export const fetchSplitFriends = async (token: string): Promise<SplitFriend[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/friends`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load split friends right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The split friends response was invalid.');
  }
  return payload as SplitFriend[];
};

export const createSplitFriend = async (
  token: string,
  payload: SplitFriendPayload
): Promise<SplitFriend> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/friends`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to add this friend right now.');
  }
  return response.json();
};

export const updateSplitFriend = async (
  token: string,
  friendId: number,
  payload: SplitFriendPayload
): Promise<SplitFriend> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/friends/${friendId}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to update this friend right now.');
  }
  return response.json();
};

export const archiveSplitFriend = async (token: string, friendId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/friends/${friendId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to archive this friend right now.');
  }
};

export const mergeSplitFriend = async (
  token: string,
  friendId: number,
  targetFriendId: number
): Promise<SplitFriend> => {
  const response = await fetch(
    `${API_BASE_URL}/v1/split/friends/${friendId}/merge-into/${targetFriendId}`,
    {
      method: 'POST',
      headers: authHeaders(token),
    }
  );
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to merge these friends right now.');
  }
  const payload = (await response.json()) as { friend?: SplitFriend };
  if (!payload.friend) throw new Error('The merged friend response was invalid.');
  return payload.friend;
};

export const fetchSplitGroups = async (token: string): Promise<SplitGroup[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load split groups right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The split groups response was invalid.');
  }
  // Money arrives as a JSON number already; coerced for the same reason the
  // balances endpoint coerces, so one bad payload cannot turn arithmetic into
  // string concatenation further down.
  return (payload as SplitGroup[]).map((group) => ({
    ...group,
    viewer_net_balance: Number(group.viewer_net_balance ?? 0),
    viewer_balances: (group.viewer_balances ?? []).map((entry) => ({
      friend_id: entry.friend_id,
      net_balance: Number(entry.net_balance),
    })),
  }));
};

export const createSplitGroup = async (
  token: string,
  payload: SplitGroupPayload
): Promise<SplitGroup> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to create this split group right now.');
  }
  return response.json();
};

export const updateSplitGroup = async (
  token: string,
  groupId: number,
  payload: SplitGroupPayload
): Promise<SplitGroup> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to update this split group right now.');
  }
  return response.json();
};

/**
 * Any active member may set the group's default split, not only the owner: it
 * describes how the group divides its costs. Passing null clears it.
 */
export const setSplitGroupDefaultSplit = async (
  token: string,
  groupId: number,
  defaultSplit: SplitGroupDefaultSplit | null
): Promise<SplitGroup> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/default-split`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ default_split: defaultSplit }),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to save this default split right now.');
  }
  return response.json();
};

/**
 * Invites addressed to the caller. Returns an empty list rather than throwing:
 * a failed poll must never block the app opening, and there is nothing to say
 * when we cannot tell whether somebody was invited.
 */
export const fetchPendingSplitGroupInvites = async (
  token: string
): Promise<PendingSplitGroupInvite[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/split/pending-invites`, {
      headers: authHeaders(token),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as PendingSplitGroupInvite[]) : [];
  } catch {
    return [];
  }
};

export const createSplitGroupInviteLink = async (
  token: string,
  groupId: number
): Promise<SplitGroupInvite> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/invite-link`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to create this group invite link right now.');
  }
  return response.json();
};

export const createSplitGroupDirectInvite = async (
  token: string,
  groupId: number,
  payload: { email?: string; phone?: string }
): Promise<SplitGroupDirectInvite> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/invites`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to invite this friend right now.');
  }
  return response.json();
};

export const fetchSplitGroupDirectInvites = async (
  token: string,
  groupId: number
): Promise<SplitGroupDirectInvite[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/invites`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load pending invites right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The pending invites response was invalid.');
  }
  return payload as SplitGroupDirectInvite[];
};

export const revokeSplitGroupDirectInvite = async (
  token: string,
  groupId: number,
  inviteId: number
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/invites/${inviteId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to revoke this invite right now.');
  }
};

export const fetchSplitGroupInvite = async (
  token: string,
  inviteToken: string
): Promise<SplitGroupInviteDetails> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/invites/${inviteToken}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load this split group invite right now.');
  }
  return response.json();
};

export const acceptSplitGroupInvite = async (
  token: string,
  inviteToken: string
): Promise<SplitGroupInviteAcceptResponse> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/invites/${inviteToken}/accept`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to join this split group right now.');
  }
  return response.json();
};

/**
 * What happens to the transactions behind a group's split expenses when the
 * group goes.
 *
 * They are two records of the same evening: the split bill says who owed whom,
 * and the transaction says money left the account — which it did, and which
 * deleting a group does not undo. So the two are separable, and which one the
 * user meant is a question only they can answer.
 */
export type SplitGroupEntryDisposition = 'keep' | 'delete';

export type ArchiveSplitGroupResult = {
  /** How many transactions the server actually deleted. */
  deleted_entries: number;
};

export const archiveSplitGroup = async (
  token: string,
  groupId: number,
  entries: SplitGroupEntryDisposition = 'keep'
): Promise<ArchiveSplitGroupResult> => {
  const response = await fetch(
    `${API_BASE_URL}/v1/split/groups/${groupId}?entries=${entries}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    }
  );
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to delete this split group right now.');
  }
  const payload = (await response.json().catch(() => null)) as ArchiveSplitGroupResult | null;
  return { deleted_entries: payload?.deleted_entries ?? 0 };
};

export const leaveSplitGroup = async (token: string, groupId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/groups/${groupId}/leave`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to leave this split group right now.');
  }
};

export const fetchSplitBills = async (token: string): Promise<SplitBill[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/bills`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load split bills right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The split bills response was invalid.');
  }
  return (payload as SplitBill[]).map(normalizeSplitBill);
};

export const createSplitBill = async (
  token: string,
  payload: SplitBillPayload
): Promise<SplitBill> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/bills`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ ...payload, currency: payload.currency ?? 'INR' }),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to save this split bill right now.');
  }
  return normalizeSplitBill(await response.json());
};

export const updateSplitBill = async (
  token: string,
  billId: number,
  payload: SplitBillPayload
): Promise<SplitBill> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/bills/${billId}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify({ ...payload, currency: payload.currency ?? 'INR' }),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to update this split bill right now.');
  }
  return normalizeSplitBill(await response.json());
};

export const deleteSplitBill = async (token: string, billId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/bills/${billId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to remove this split bill right now.');
  }
};

const normalizeSettlement = (settlement: SplitSettlement): SplitSettlement => ({
  ...settlement,
  amount: Number(settlement.amount),
  status: settlement.status ?? 'confirmed',
});

/**
 * Settlements somebody else recorded that the reader has to confirm or deny.
 *
 * Its own call rather than a filter on the settlements list: that list is rows
 * the reader *wrote*, and every row here was written by somebody else about
 * them. Failure returns an empty list — a decision prompt that cannot load is a
 * missing prompt, never a broken Splits screen.
 */
export const fetchPendingSplitSettlements = async (
  token: string
): Promise<SplitSettlement[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/settlements/pending`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load settlement requests right now.');
  }
  const payload: unknown = await response.json();
  const settlements = (payload as { settlements?: SplitSettlement[] })?.settlements;
  return Array.isArray(settlements) ? settlements.map(normalizeSettlement) : [];
};

/**
 * Answer a settlement recorded against the reader.
 *
 * A 409 means somebody — another device, the same tap twice — already answered
 * it. That is not a failure the user needs to read about; the caller refreshes
 * and the prompt is simply gone.
 */
export const decideSplitSettlement = async (
  token: string,
  settlementId: number,
  decision: 'confirm' | 'deny'
): Promise<SplitSettlement | null> => {
  const response = await fetch(
    `${API_BASE_URL}/v1/split/settlements/${settlementId}/${decision}`,
    { method: 'POST', headers: authHeaders(token) }
  );
  if (response.status === 409 || response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to record that decision right now.');
  }
  return normalizeSettlement((await response.json()) as SplitSettlement);
};

export const fetchSplitSettlements = async (token: string): Promise<SplitSettlement[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/settlements`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load settlements right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The settlements response was invalid.');
  }
  return (payload as SplitSettlement[]).map(normalizeSettlement);
};

export const fetchSplitActivity = async (token: string): Promise<SplitActivityItem[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/activity`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load split activity right now.');
  }
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as SplitActivityResponse).items)
  ) {
    throw new Error('The split activity response was invalid.');
  }
  return (payload as SplitActivityResponse).items.map((item) => ({
    ...item,
    amount: item.amount == null ? undefined : Number(item.amount),
    participants: (item.participants ?? []).map((participant) =>
      coerceAmount(participant as unknown as Record<string, unknown>, ['share_amount'])
    ) as SplitParticipant[],
  }));
};

export const createSplitSettlement = async (
  token: string,
  payload: SplitSettlementPayload
): Promise<SplitSettlement> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/settlements`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to record this settlement right now.');
  }
  return response.json();
};

export const fetchSplitBalances = async (token: string): Promise<SplitBalance[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/split/balances`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw await readSplitError(response, 'Unable to load split balances right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The split balances response was invalid.');
  }
  return (payload as SplitBalance[]).map((balance) => ({
    ...balance,
    total_owed_by_friend: Number(balance.total_owed_by_friend),
    total_owed_to_friend: Number(balance.total_owed_to_friend),
    net_balance: Number(balance.net_balance),
  }));
};

/**
 * What the Splits screen is actually in a position to draw.
 *
 * The screen keeps five collections and every one of them is `[]` both when
 * the user has nothing and when the request for it failed. Reading "empty" off
 * them without asking which kind of empty it is put a confident ledger on top
 * of no data at all: "Overall, settled up" over "Create your first group", on
 * an account that may well have eight groups and an outstanding balance. The
 * second line is worse than the first — it does not merely misreport, it
 * invites a duplicate.
 *
 * Naming the three cases is what stops that recurring. There is no fourth, and
 * in particular no "empty" — an emptied-out ledger is still `ledger`, and the
 * per-section empty states inside it are the ones that know whether a search
 * filter is on.
 */
export type SplitScreenState =
  /** Nothing to show yet and the request still out: skeleton. */
  | 'loading'
  /** The request came back with nothing usable: say so, offer a retry. */
  | 'unavailable'
  /** Real data, even if stale or partial: draw it. */
  | 'ledger';

export const splitScreenState = ({
  loading,
  loadFailed,
  hasData,
}: {
  loading: boolean;
  loadFailed: boolean;
  hasData: boolean;
}): SplitScreenState => {
  // Anything already loaded outranks both: a refresh that fails, or one still
  // in flight, is no reason to take away figures the user can already see.
  if (hasData) return 'ledger';
  if (loading) return 'loading';
  return loadFailed ? 'unavailable' : 'ledger';
};
