import * as Contacts from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';

import { UpgradeSheet } from '@/components/billing/UpgradeSheet';
import {
  AddExpenseModal,
  type ExpenseFlowScreen,
} from '@/components/split/expense/AddExpenseModal';
import { CreateGroupModal } from '@/components/split/modals/CreateGroupModal';
import { SearchField, SegmentedSections, SplitScreenFrame, type ActiveSection } from '@/components/split/primitives/SplitChrome';
import { FriendDetailModal } from '@/components/split/modals/FriendDetailModal';
import { GroupDetailModal } from '@/components/split/modals/GroupDetailModal';
import { GroupDefaultSplitModal } from '@/components/split/modals/GroupDefaultSplitModal';
import { GroupSettingsModal } from '@/components/split/modals/GroupSettingsModal';
import { GroupMembersModal } from '@/components/split/modals/GroupMembersModal';
import { GroupActionModal } from '@/components/split/modals/GroupActionModal';
import { BillDetailModal } from '@/components/split/modals/BillDetailModal';
import { FloatingExpenseButton } from '@/components/split/primitives/SplitPrimitives';
import { composerMemberKeys, contactMatchesFriend, countHiddenSettledGroups, groupMatchesSearch, parseAmount, todayApiDate } from '@/components/split/split-utils';
import type { DeviceContactOption, GroupActionMode, SplitGroupSummary } from '@/components/split/split-types';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import {
  billToComposerForm,
  billToSplitSelection,
  buildSplitBillPayload,
} from '@/lib/split-composer';
import {
  buildTransactionPayload,
  entryToComposerForm,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { haptics } from '@/lib/haptics';
import {
  BalanceFilterSheet,
  type BalanceFilter,
} from '@/components/split/sheets/BalanceFilterSheet';
import { SettlementRequests } from '@/components/split/SettlementRequests';
import { BillSortSheet } from '@/components/split/sheets/BillSortSheet';
import { DeleteGroupSheet } from '@/components/split/sheets/DeleteGroupSheet';
import {
  DEFAULT_SPLIT_BILL_SORT,
  loadSplitBillSort,
  saveSplitBillSort,
  type SplitBillSort,
} from '@/lib/split-bill-sort';
import {
  SPLIT_NOTIFICATION_PREFIX,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
} from '@/lib/notifications';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import { FriendActionsSheet } from '@/components/split/sheets/FriendActionsSheet';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { submitFeedback } from '@/lib/feedback';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { ThemedConfirmDialog, ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useEntitlementGate } from '@/hooks/use-entitlement-gate';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, getPreferredAccountForPaymentMode, type Account } from '@/lib/accounts';
import { userDisplayName } from '@/lib/display-name';
import { fetchEntry, updateEntry } from '@/lib/entries';
import type { ApiEntry } from '@/lib/transactions';
import { toAmountString } from '@/lib/money';
import { resolveAttachmentForSave } from '@/lib/uploads';
import {
  buildSeedWeights,
  computeSplitShares,
  CURRENT_USER_KEY,
  defaultSplitToComposerKeys,
  defaultSplitToSelection,
  describeGroupDefaultSplit,
  describeMemberInvites,
  friendSplitKey,
  groupComposerMembers,
  groupSplitSlots,
  isDefaultSplitTab,
  selectionToDefaultSplit,
  splitParticipantKeys,
  viewerSplitSlot,
  type AdjustSplitTab,
  type GroupKind,
  type SplitSelection,
  type SplitSlotPerson,
  type SplitWeights,
} from '@/lib/split-preferences';
import { SPLIT_GROUP_OWNER_SLOT, archiveSplitGroup, archiveSplitFriend, createSplitBill, createSplitFriend, createSplitGroup, createSplitGroupDirectInvite, createSplitGroupInviteLink, createSplitSettlement, decideSplitSettlement, deleteSplitBill, fetchPendingSplitSettlements, fetchSplitActivity, fetchSplitBalances, fetchSplitBills, fetchSplitFriends, fetchSplitGroups, fetchSplitGroupDirectInvites, leaveSplitGroup, mergeSplitFriend, revokeSplitGroupDirectInvite, splitScreenState, updateSplitBill, updateSplitFriend, setSplitGroupDefaultSplit, updateSplitGroup, type SettlementDirection, type SplitActivityItem, type SplitBalance, type SplitBill, type SplitFriend, type SplitGroup, type SplitGroupEntryDisposition, type SplitGroupDirectInvite, type SplitSettlement, type SplitGroupMemberInvite } from '@/lib/splits';
import { TView } from '@/components/split/primitives/themed-interop';
import { friendsLookIdentical, toDeviceContactOption, getBalanceTone, buildParticipantsFromSelection, getSafeExportFileName, buildGroupExportCsv, formatFriendlySplitError, type ParticipantDraft, type DuplicateFriendPair } from '@/lib/split-screen-helpers';

import { buildFriendById, buildFriendDetailSummaries, buildGroupSummaries, buildNonGroupSummary, buildRecentActivity, computeBalanceTotals, filterVisibleActivity, filterVisibleFriends, filterVisibleGroups, matchesBalanceFilter } from '@/lib/split-screen-model';
import { SplitActivityRow } from '@/components/split/rows/SplitActivityRow';
import { SplitFriendRow } from '@/components/split/rows/SplitFriendRow';
import { SplitGroupCard } from '@/components/split/rows/SplitGroupCard';
import { SplitNonGroupRow } from '@/components/split/rows/SplitNonGroupRow';
import { SplitActivitySection } from '@/components/split/SplitActivitySection';
import { SplitFriendFormModal } from '@/components/split/SplitFriendFormModal';
import { SplitFriendsSection } from '@/components/split/SplitFriendsSection';
import { SplitGroupInviteModal } from '@/components/split/SplitGroupInviteModal';
import { SplitGroupsSection } from '@/components/split/SplitGroupsSection';
import { SplitHeader } from '@/components/split/SplitHeader';
import { SplitOverallBalance } from '@/components/split/SplitOverallBalance';
import { SplitSettlementModal } from '@/components/split/SplitSettlementModal';

type ModalKind = 'friend' | 'group' | 'bill' | 'settlement' | 'group_invite' | null;
type SplitScreenProps = {
  embedded?: boolean;
};

export default function SplitScreen({ embedded = false }: SplitScreenProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { token, user } = useAuthStore();
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const dialog = useAppDialog();
  const currentUserName = userDisplayName(user?.username, 'You');
  const currentUserContact = user?.email?.trim() || user?.phone?.trim() || '';

  const [friends, setFriends] = useState<SplitFriend[]>([]);
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [balances, setBalances] = useState<SplitBalance[]>([]);
  const [bills, setBills] = useState<SplitBill[]>([]);
  const [activity, setActivity] = useState<SplitActivityItem[]>([]);
  // Settlements somebody else recorded that this user has to answer, and the
  // unread count that lights the Activity dot. Both are about what other people
  // did, which is the only thing either signal should ever be about.
  const [settlementRequests, setSettlementRequests] = useState<SplitSettlement[]>([]);
  const [decidingSettlementId, setDecidingSettlementId] = useState<number | null>(null);
  const [unreadSplitCount, setUnreadSplitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /**
   * Two different failures, deliberately not sharing a slot.
   *
   * `error` is something the user just did that did not work — a name left
   * blank, a settlement that would not save. It belongs in a banner over a
   * screen that still has its content.
   *
   * `loadError` is the ledger itself never arriving. It cannot be a banner,
   * because everything under a banner would then be drawn from state that was
   * never filled: "Overall, settled up" over "Create your first group" is not
   * an empty account, it is an unanswered request wearing one's clothes — and
   * it invites a user with eight groups to make a ninth.
   */
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('groups');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('open');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  // How expenses are ordered inside a group. Lives here rather than in the
  // group screen because the sheet that changes it has to be a sibling of that
  // modal, and because the choice is one preference across every group.
  const [billSort, setBillSort] = useState<SplitBillSort>(DEFAULT_SPLIT_BILL_SORT);
  const [openSwipeRow, setOpenSwipeRow] = useState<string | null>(null);
  const [selectedGroupDetailId, setSelectedGroupDetailId] = useState<number | null>(null);
  const [groupSettingsId, setGroupSettingsId] = useState<number | null>(null);
  const [groupAction, setGroupAction] = useState<{
    groupId: number;
    mode: GroupActionMode;
  } | null>(null);
  const [pendingGroupDelete, setPendingGroupDelete] = useState<SplitGroupSummary | null>(null);
  /**
   * Reset to `keep` every time the sheet opens — see `DeleteGroupSheet`. A
   * choice that persists across two different groups is a choice the user did
   * not make about the second one, and one of the two answers is destructive.
   */
  const [groupDeleteDisposition, setGroupDeleteDisposition] =
    useState<SplitGroupEntryDisposition>('keep');
  const [pendingGroupLeave, setPendingGroupLeave] = useState<SplitGroupSummary | null>(null);
  const [selectedFriendDetailId, setSelectedFriendDetailId] = useState<number | null>(null);
  const [selectedFriendActions, setSelectedFriendActions] = useState<SplitFriend | null>(null);
  const [pendingFriendDelete, setPendingFriendDelete] = useState<SplitFriend | null>(null);
  const [dismissedDuplicateKey, setDismissedDuplicateKey] = useState<string | null>(null);
  const [editingFriendId, setEditingFriendId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [memberPickerGroupId, setMemberPickerGroupId] = useState<number | null>(null);
  const [memberPickerFriendIds, setMemberPickerFriendIds] = useState<number[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<Contacts.PermissionStatus | null>(null);
  const [contactsAccessPrivileges, setContactsAccessPrivileges] = useState<
    Contacts.ContactsPermissionResponse['accessPrivileges'] | null
  >(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContactOption[]>([]);
  const [pendingFriendGroupId, setPendingFriendGroupId] = useState<number | null>(null);
  /**
   * Balance alerts are still only a form field — nothing acts on them yet — so
   * they stay in memory rather than pretending to be saved.
   */
  const [groupBalanceAlertById, setGroupBalanceAlertById] = useState<
    Record<number, { enabled: boolean; amount: string }>
  >({});
  const [soloGroupPromptId, setSoloGroupPromptId] = useState<number | null>(null);
  const [defaultSplitGroupId, setDefaultSplitGroupId] = useState<number | null>(null);
  const [defaultSplitScreen, setDefaultSplitScreen] = useState<'choice' | 'adjust'>('choice');
  const [defaultSplitDraft, setDefaultSplitDraft] = useState<SplitSelection | null>(null);
  const [defaultSplitError, setDefaultSplitError] = useState<string | null>(null);

  const [friendName, setFriendName] = useState('');
  const [friendPhone, setFriendPhone] = useState('');
  const [friendEmail, setFriendEmail] = useState('');

  const duplicateFriendPair = useMemo<DuplicateFriendPair | null>(() => {
    for (const group of groups) {
      // The roster in this viewer's own rows. Read off `group.members` this
      // only ever looked at the owner's list, so a member with two rows for the
      // same person in a shared group was never offered the merge.
      const memberIds = [
        ...new Set((groupComposerMembers(group) ?? []).map((member) => member.friend_id)),
      ];
      for (let leftIndex = 0; leftIndex < memberIds.length; leftIndex += 1) {
        const left = friends.find((friend) => friend.id === memberIds[leftIndex]);
        if (!left) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < memberIds.length; rightIndex += 1) {
          const right = friends.find((friend) => friend.id === memberIds[rightIndex]);
          if (!right || !friendsLookIdentical(left, right)) continue;
          const survivor = left.id < right.id ? left : right;
          const duplicate = survivor.id === left.id ? right : left;
          const key = `${duplicate.id}:${survivor.id}`;
          if (key !== dismissedDuplicateKey) return { survivor, duplicate };
        }
      }
    }
    return null;
  }, [dismissedDuplicateKey, friends, groups]);

  const [groupName, setGroupName] = useState('');
  const [groupKind, setGroupKind] = useState<GroupKind>('trip');
  /**
   * The group photo as the composer currently has it.
   *
   * A local `file://` until the group is saved, a hosted URL afterwards, and
   * `''` when the user has removed one. `null` means "not touched" — which the
   * payload has to preserve, because an edit that omits the field must leave a
   * photo set on another device alone rather than clearing it by silence.
   */
  const [groupPhotoUri, setGroupPhotoUri] = useState<string | null>(null);
  const [groupPhotoBusy, setGroupPhotoBusy] = useState(false);
  const [groupBalanceAlertEnabled, setGroupBalanceAlertEnabled] = useState(false);
  const [groupBalanceAlertAmount, setGroupBalanceAlertAmount] = useState('');
  const [groupInviteEmail, setGroupInviteEmail] = useState('');
  const [groupInvitePhone, setGroupInvitePhone] = useState('');
  const [groupInviteTargetId, setGroupInviteTargetId] = useState<number | null>(null);
  const [pendingGroupInvites, setPendingGroupInvites] = useState<SplitGroupDirectInvite[]>([]);
  const [pendingGroupInvitesLoading, setPendingGroupInvitesLoading] = useState(false);
  const [pendingInviteRevoke, setPendingInviteRevoke] = useState<SplitGroupDirectInvite | null>(
    null
  );
  const [selectedGroupFriendIds, setSelectedGroupFriendIds] = useState<number[]>([]);

  const [billAmount, setBillAmount] = useState('');
  const [billInitialData, setBillInitialData] = useState<Partial<EntryForm>>({});
  const [billAccounts, setBillAccounts] = useState<Account[]>([]);
  const [editingBill, setEditingBill] = useState<SplitBill | null>(null);
  const [editingEntry, setEditingEntry] = useState<ApiEntry | null>(null);
  const billSaveKey = useRef('');
  const billSaveProgress = useRef<TransactionSaveProgress>({});
  const billAllocationChanged = useRef(false);
  const billEditorRequest = useRef(0);
  useEffect(() => {
    if (modal !== 'bill' || !token) return;
    let cancelled = false;
    void fetchAccounts(token)
      .then((accounts) => {
        if (!cancelled) setBillAccounts(accounts);
      })
      .catch(() => {
        /* Account linking is optional, as it is on Home. */
      });
    return () => {
      cancelled = true;
    };
  }, [modal, token]);
  const [billGroupId, setBillGroupId] = useState<number | null>(null);
  const [isBillGroupLocked, setIsBillGroupLocked] = useState(false);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [pendingBillDelete, setPendingBillDelete] = useState<SplitBill | null>(null);
  const [expenseFlowScreen, setExpenseFlowScreen] = useState<ExpenseFlowScreen>('expense');
  /**
   * The expense split, in the composer's own key space: `me` for the author and
   * a friend id for everybody else. The group's shared default is translated
   * into these keys when a group is picked.
   */
  const [splitPayerKey, setSplitPayerKey] = useState<string>(CURRENT_USER_KEY);
  const [splitFullAmount, setSplitFullAmount] = useState(false);
  const [splitSelectedKeys, setSplitSelectedKeys] = useState<string[]>([]);
  const [adjustSplitTab, setAdjustSplitTab] = useState<AdjustSplitTab>('equally');
  const [splitWeights, setSplitWeights] = useState<SplitWeights>({});
  const [simplifyGroupDebts, setSimplifyGroupDebts] = useState(false);

  const [settlementFriendId, setSettlementFriendId] = useState<number | null>(null);
  /**
   * The group a settlement is closing, when it was started from one.
   *
   * A settlement recorded inside a group has to go when the group does. Left
   * behind it keeps applying its full amount to a ledger whose expenses no
   * longer exist — which is how a Splits screen with no groups on it reported
   * an outstanding balance with nothing anywhere to account for it.
   */
  const [settlementGroupId, setSettlementGroupId] = useState<number | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(todayApiDate());
  const [settlementDirection, setSettlementDirection] =
    useState<SettlementDirection>('friend_paid_user');
  const [settlementNotes, setSettlementNotes] = useState('');

  const {
    entitlement,
    sheetVisible: upgradeSheetVisible,
    capture: captureEntitlement,
    dismiss: dismissUpgrade,
    clear: clearEntitlement,
  } = useEntitlementGate();

  /**
   * The single exit for anything that fails on this screen. The split ledger
   * is entitlement-gated, so a `402` has to reach the paywall rather than the
   * red banner — every catch block here goes through this.
   */
  const reportSplitError = useCallback(
    (splitError: unknown, fallback: string) => {
      if (captureEntitlement(splitError)) return;
      setError(formatFriendlySplitError(splitError, fallback));
    },
    [captureEntitlement]
  );

  /**
   * What other people have done that this user has not answered or seen.
   *
   * Swallows its own failures on purpose: both halves are secondary signals
   * over a ledger that has already loaded, and a Splits screen that refuses to
   * open because a dot could not be counted would be a worse trade than a dot
   * that is briefly missing.
   */
  const refreshSettlementRequests = useCallback(async () => {
    if (!token) {
      setSettlementRequests([]);
      setUnreadSplitCount(0);
      return;
    }
    const [requests, unread] = await Promise.all([
      fetchPendingSplitSettlements(token).catch(() => null),
      fetchUnreadNotificationCount(token, SPLIT_NOTIFICATION_PREFIX).catch(() => null),
    ]);
    if (requests) setSettlementRequests(requests);
    if (unread !== null) setUnreadSplitCount(unread);
  }, [token]);

  const loadSplitData = useCallback(async () => {
    if (!token) {
      setFriends([]);
      setGroups([]);
      setBalances([]);
      setBills([]);
      setActivity([]);
      setSettlementRequests([]);
      setUnreadSplitCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const [nextFriends, nextGroups, nextBalances, nextBills, nextActivity] = await Promise.all([
        fetchSplitFriends(token),
        fetchSplitGroups(token),
        fetchSplitBalances(token),
        fetchSplitBills(token),
        fetchSplitActivity(token),
      ]);
      setFriends(nextFriends);
      setGroups(nextGroups);
      setBalances(nextBalances);
      setBills(nextBills);
      setActivity(nextActivity);
      clearEntitlement();
      // Outside the ledger's own `Promise.all`: a decision prompt that fails to
      // load is a missing prompt, and must never be the reason the balances
      // above it refuse to draw.
      void refreshSettlementRequests();
    } catch (fetchError) {
      // Still through the entitlement gate first: a 402 on the split ledger is
      // the paywall's to answer, not a "check your connection".
      if (!captureEntitlement(fetchError)) {
        setLoadError(formatFriendlySplitError(fetchError, 'Unable to load split data.'));
      }
    } finally {
      setLoading(false);
    }
  }, [captureEntitlement, clearEntitlement, refreshSettlementRequests, token]);

  useFocusEffect(
    useCallback(() => {
      void loadSplitData();
    }, [loadSplitData])
  );


  const loadDeviceContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const response = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.FirstName,
        pageSize: 1000,
      });
      setDeviceContacts(
        response.data
          .map(toDeviceContactOption)
          .filter((contact): contact is DeviceContactOption => Boolean(contact))
      );
    } catch (contactError) {
      reportSplitError(contactError, 'Unable to load your contacts.');
    } finally {
      setContactsLoading(false);
    }
  }, [reportSplitError]);

  const refreshContactsPermission = useCallback(async () => {
    try {
      const permission = await Contacts.getPermissionsAsync();
      setContactsPermissionStatus(permission.status);
      setContactsAccessPrivileges(permission.accessPrivileges ?? null);
      if (permission.granted) {
        await loadDeviceContacts();
      }
    } catch {
      setContactsPermissionStatus(Contacts.PermissionStatus.UNDETERMINED);
    }
  }, [loadDeviceContacts]);

  useEffect(() => {
    if (!memberPickerGroupId) return;
    void refreshContactsPermission();
  }, [memberPickerGroupId, refreshContactsPermission]);

  // The remembered expense order. Read once on mount and never awaited by the
  // list: the default is the order the list has always had, so a slow read
  // costs a re-sort rather than a blank screen.
  useEffect(() => {
    let cancelled = false;
    void loadSplitBillSort().then((stored) => {
      if (!cancelled) setBillSort(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => computeBalanceTotals(balances), [balances]);

  const overallNetBalance = totals.owedByFriends - totals.owedToFriends;
  /**
   * Whether there is any shared spending at all behind the headline figure.
   *
   * `bills` is the whole ledger the screen draws from, so an empty one means
   * nothing has ever been split — which is not the same statement as
   * "everything has been paid back", and it is the one the headline was
   * making.
   */
  const hasLedgerActivity = bills.length > 0;
  const overallTone = getBalanceTone(overallNetBalance, theme, hasLedgerActivity);

  /**
   * Whether the screen is drawing from an answer the server actually gave.
   *
   * All five collections start empty and stay empty on a failed load, so
   * "empty" and "unknown" are the same value in every one of them. This is the
   * only thing that tells them apart, and it is what decides between showing
   * the ledger with a warning over it and not pretending to have a ledger.
   */
  const hasSplitData =
    friends.length > 0 ||
    groups.length > 0 ||
    balances.length > 0 ||
    bills.length > 0 ||
    activity.length > 0;

  const screenState = splitScreenState({
    loading,
    loadFailed: !!loadError,
    hasData: hasSplitData,
  });

  const balanceByFriendId = useMemo(() => {
    return new Map(balances.map((balance) => [balance.friend.id, balance]));
  }, [balances]);

  const friendById = useMemo(() => buildFriendById(friends, groups, bills), [bills, friends, groups]);

  const groupSummaries = useMemo(() => buildGroupSummaries({ groups, bills, friendById, currentUserName, currentUserContact }), [bills, currentUserContact, currentUserName, friendById, groups]);

  const selectedGroupSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === selectedGroupDetailId) ?? null,
    [groupSummaries, selectedGroupDetailId]
  );

  const groupSettingsSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === groupSettingsId) ?? null,
    [groupSettingsId, groupSummaries]
  );

  const groupActionSummary = useMemo(
    () =>
      groupAction
        ? (groupSummaries.find((summary) => summary.group.id === groupAction.groupId) ?? null)
        : null,
    [groupAction, groupSummaries]
  );

  const loadPendingGroupInvites = useCallback(
    async (groupId: number) => {
      if (!token) return;
      setPendingGroupInvitesLoading(true);
      try {
        setPendingGroupInvites(await fetchSplitGroupDirectInvites(token, groupId));
      } catch {
        setPendingGroupInvites([]);
      } finally {
        setPendingGroupInvitesLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!groupSettingsSummary?.group.viewer_can_manage) {
      setPendingGroupInvites([]);
      setPendingGroupInvitesLoading(false);
      return;
    }
    void loadPendingGroupInvites(groupSettingsSummary.group.id);
  }, [
    groupSettingsSummary?.group.id,
    groupSettingsSummary?.group.viewer_can_manage,
    loadPendingGroupInvites,
  ]);

  const friendDetailSummaries = useMemo(() => buildFriendDetailSummaries({ friends, bills, groupSummaries, balanceByFriendId }), [balanceByFriendId, bills, friends, groupSummaries]);

  const selectedFriendDetailSummary = useMemo(
    () =>
      friendDetailSummaries.find((summary) => summary.friend.id === selectedFriendDetailId) ?? null,
    [friendDetailSummaries, selectedFriendDetailId]
  );

  const selectedBill = useMemo(
    () => bills.find((bill) => bill.id === selectedBillId) ?? null,
    [bills, selectedBillId]
  );

  const memberPickerSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === memberPickerGroupId) ?? null,
    [groupSummaries, memberPickerGroupId]
  );

  const nonGroupSummary = useMemo(() => buildNonGroupSummary(bills, friendById), [bills, friendById]);

  const selectedBillGroup = useMemo(
    () => groups.find((group) => group.id === billGroupId) ?? null,
    [billGroupId, groups]
  );

  const reportMemberInvites = useCallback(
    (invites: SplitGroupMemberInvite[]) => {
      const message = describeMemberInvites(invites);
      if (message) {
        void dialog.alert({
          title: 'Added to the group',
          message,
          tone: 'success',
          iconName: 'account-multiple-plus-outline',
        });
      }
    },
    [dialog]
  );

  const resolveFriendName = useCallback(
    (friendId: number) => friendById.get(friendId)?.name ?? 'Friend',
    [friendById]
  );

  const resolveFriendContact = useCallback(
    (friendId: number) => {
      const friend = friendById.get(friendId);
      return [friend?.phone, friend?.email].filter(Boolean).join(' • ');
    },
    [friendById]
  );

  const soloGroupPromptSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === soloGroupPromptId) ?? null,
    [groupSummaries, soloGroupPromptId]
  );

  const defaultSplitSummary = useMemo(
    () => groupSummaries.find((summary) => summary.group.id === defaultSplitGroupId) ?? null,
    [defaultSplitGroupId, groupSummaries]
  );

  const defaultSplitPeople = useMemo<SplitSlotPerson[]>(
    () =>
      defaultSplitSummary
        ? groupSplitSlots(
            defaultSplitSummary.group,
            resolveFriendName,
            resolveFriendContact,
            currentUserName,
            currentUserContact
          )
        : [],
    [
      currentUserContact,
      currentUserName,
      defaultSplitSummary,
      resolveFriendContact,
      resolveFriendName,
    ]
  );

  /** How one slot of a shared group reads in a sentence for this viewer. */
  const resolveSlotLabel = useCallback(
    (group: SplitGroup, slot: string) => {
      // The served roster first: it is the one list that names every slot in
      // the reader's own words, including the owner — whom a member has no
      // membership row for and used to see as "Group owner".
      const rosterEntry = group.viewer_members?.find((member) => member.slot === slot);
      if (rosterEntry) return rosterEntry.is_viewer ? currentUserName : rosterEntry.name;
      if (slot === viewerSplitSlot(group)) return currentUserName;
      if (slot === SPLIT_GROUP_OWNER_SLOT) return group.owner_name || 'Group owner';
      return resolveFriendName(Number(slot));
    },
    [currentUserName, resolveFriendName]
  );

  const billFriendOptions = useMemo(() => {
    // The roster in this viewer's own namespace. For a member that is their
    // slot links, which leave out the row standing for themselves — the second
    // copy of them that used to make a two-person split a three-way one, while
    // the group's owner was missing from the list entirely.
    const roster = groupComposerMembers(selectedBillGroup) ?? [];
    if (roster.length > 0) {
      return roster
        .map((member) => friendById.get(member.friend_id))
        .filter((friend): friend is SplitFriend => Boolean(friend));
    }
    return friends;
  }, [friendById, friends, selectedBillGroup]);

  const billSplitPeople = useMemo<SplitSlotPerson[]>(
    () => [
      { key: CURRENT_USER_KEY, label: currentUserName, subtitle: currentUserContact },
      ...billFriendOptions.map((friend) => ({
        key: friendSplitKey(friend.id),
        label: friend.name,
        subtitle: [friend.phone, friend.email].filter(Boolean).join(' • '),
      })),
    ],
    [billFriendOptions, currentUserContact, currentUserName]
  );

  const recentActivity = useMemo(() => buildRecentActivity(activity), [activity]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  useEffect(() => {
    setOpenSwipeRow(null);
  }, [activeSection, balanceFilter, normalizedSearch]);

  const balanceMatchesFilter = useCallback(
    (value: number) => matchesBalanceFilter(balanceFilter, value),
    [balanceFilter]
  );

  const visibleGroupSummaries = useMemo(
    () => filterVisibleGroups({ groupSummaries, normalizedSearch, balanceFilter }),
    [balanceFilter, groupSummaries, normalizedSearch]
  );

  const hiddenSettledCount = useMemo(
    () =>
      countHiddenSettledGroups(groupSummaries, visibleGroupSummaries, (summary) =>
        groupMatchesSearch(summary, normalizedSearch)
      ),
    [groupSummaries, normalizedSearch, visibleGroupSummaries]
  );

  const showNonGroupSummary =
    nonGroupSummary.billCount > 0 &&
    balanceMatchesFilter(nonGroupSummary.netBalance) &&
    (!normalizedSearch || 'non-group expenses'.includes(normalizedSearch));

  const visibleFriends = useMemo(
    () => filterVisibleFriends({ friends, balanceByFriendId, normalizedSearch, balanceFilter }),
    [balanceByFriendId, balanceFilter, friends, normalizedSearch]
  );

  const visibleActivity = useMemo(
    () => filterVisibleActivity(recentActivity, normalizedSearch),
    [normalizedSearch, recentActivity]
  );

  const resetFriendForm = () => {
    setFriendName('');
    setFriendPhone('');
    setFriendEmail('');
  };

  const resetGroupForm = () => {
    setGroupName('');
    setGroupKind('trip');
    setGroupPhotoUri(null);
    setGroupPhotoBusy(false);
    setGroupBalanceAlertEnabled(false);
    setGroupBalanceAlertAmount('');
    setSelectedGroupFriendIds([]);
  };

  const resetBillForm = () => {
    setBillAmount('');
    setBillInitialData({});
    setEditingBill(null);
    setEditingEntry(null);
    billSaveKey.current = `split-bill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    billSaveProgress.current = {};
    billAllocationChanged.current = false;
    setBillGroupId(null);
    setIsBillGroupLocked(false);
    setEditingBillId(null);
    setExpenseFlowScreen('expense');
    setSplitPayerKey(CURRENT_USER_KEY);
    setSplitFullAmount(false);
    setSplitSelectedKeys([CURRENT_USER_KEY, ...friends.map((friend) => friendSplitKey(friend.id))]);
    setAdjustSplitTab('equally');
    setSplitWeights({});
  };

  const resetSettlementForm = () => {
    setSettlementFriendId(friends[0]?.id ?? null);
    setSettlementGroupId(null);
    setSettlementAmount('');
    setSettlementDate(todayApiDate());
    setSettlementDirection('friend_paid_user');
    setSettlementNotes('');
  };

  const resetGroupInviteForm = () => {
    setGroupInviteEmail('');
    setGroupInvitePhone('');
    setGroupInviteTargetId(null);
  };

  const openModal = (kind: ModalKind) => {
    if (kind === 'friend') {
      resetFriendForm();
      setEditingFriendId(null);
    }
    if (kind === 'group') resetGroupForm();
    if (kind === 'bill') resetBillForm();
    if (kind === 'settlement') resetSettlementForm();
    if (kind === 'group_invite') resetGroupInviteForm();
    setError(null);
    setModal(kind);
  };

  const closeModal = () => {
    billEditorRequest.current += 1;
    if (modal === 'friend') {
      setPendingFriendGroupId(null);
    }
    setModal(null);
    setSaving(false);
    setEditingFriendId(null);
    setEditingGroupId(null);
    setEditingBillId(null);
    setGroupInviteTargetId(null);
  };

  const handleSaveFriend = async () => {
    if (!token || saving) return;
    if (!friendName.trim()) {
      setError('Friend name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: friendName.trim(),
        phone: friendPhone.trim(),
        email: friendEmail.trim(),
      };
      const savedFriend = editingFriendId
        ? await updateSplitFriend(token, editingFriendId, payload)
        : await createSplitFriend(token, payload);
      if (!editingFriendId && pendingFriendGroupId) {
        const group = groups.find((currentGroup) => currentGroup.id === pendingFriendGroupId);
        if (group) {
          const nextFriendIds = [
            ...new Set([
              ...(group.members ?? []).map((member) => member.friend_id),
              savedFriend.id,
            ]),
          ];
          await updateSplitGroup(token, group.id, {
            name: group.name,
            kind: group.kind ?? 'other',
            friend_ids: nextFriendIds,
          });
          setSelectedGroupDetailId(group.id);
        }
        setPendingFriendGroupId(null);
      } else {
        setActiveSection('friends');
        setBalanceFilter('all');
        setSearchQuery('');
      }
      haptics.saved();
      closeModal();
      await loadSplitData();
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to save this friend.');
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupFriend = (friendId: number) => {
    setSelectedGroupFriendIds((current) =>
      current.includes(friendId)
        ? current.filter((currentId) => currentId !== friendId)
        : [...current, friendId]
    );
  };

  /**
   * Picks a group photo and holds it locally until the group is saved.
   *
   * Deliberately not uploaded on pick: a photo chosen and then abandoned by
   * closing the sheet would otherwise leave a file on the upload volume that
   * nothing references and nothing will ever delete.
   */
  const pickGroupPhoto = async () => {
    if (groupPhotoBusy) return;
    setGroupPhotoBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        await dialog.alert({
          title: 'Photo not selected',
          message: 'Please choose an image file to use as the group photo.',
        });
        return;
      }
      setGroupPhotoUri(asset.uri);
    } catch {
      await dialog.alert({
        title: 'Photo not updated',
        message: 'Unable to select that image right now.',
        tone: 'danger',
      });
    } finally {
      setGroupPhotoBusy(false);
    }
  };

  const removeGroupPhoto = () => setGroupPhotoUri('');

  const handleCreateGroup = async () => {
    if (!token || saving) return;
    if (!groupName.trim()) {
      setError('Group name is required.');
      return;
    }
    const isEditingGroup = Boolean(editingGroupId);
    setSaving(true);
    setError(null);
    try {
      // The picked file only becomes a group photo here, once the group is
      // actually being saved. `resolveAttachmentForSave` passes a URL the
      // server already issued straight through, so re-saving a group does not
      // re-upload the same image.
      const photoUrl =
        groupPhotoUri === null
          ? undefined
          : ((await resolveAttachmentForSave(token, groupPhotoUri || null)) ?? '');
      const payload = {
        name: groupName.trim(),
        kind: groupKind,
        ...(photoUrl === undefined ? {} : { photo_url: photoUrl }),
        friend_ids: selectedGroupFriendIds,
      };
      const savedGroup = editingGroupId
        ? await updateSplitGroup(token, editingGroupId, payload)
        : await createSplitGroup(token, payload);
      reportMemberInvites(savedGroup.member_invites ?? []);
      setGroupBalanceAlertById((current) => ({
        ...current,
        [savedGroup.id]: {
          enabled: groupBalanceAlertEnabled,
          amount: groupBalanceAlertAmount.trim(),
        },
      }));
      haptics.saved();
      closeModal();
      setActiveSection('groups');
      await loadSplitData();
      setSelectedGroupDetailId(isEditingGroup ? null : savedGroup.id);
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to save this group.');
    } finally {
      setSaving(false);
    }
  };

  const removeFriendFromActiveList = (friend: SplitFriend, action: 'archive' | 'delete') => {
    if (action === 'delete') {
      setSelectedFriendActions(null);
      setPendingFriendDelete(friend);
      return;
    }

    const title = action === 'archive' ? `Archive ${friend.name}?` : `Delete ${friend.name}?`;
    const message =
      action === 'archive'
        ? 'Archived friends stay out of new split bills.'
        : 'This removes the friend from active split lists while preserving past split records.';
    void dialog
      .confirm({
        title,
        message,
        confirmLabel: action === 'archive' ? 'Archive' : 'Delete',
        destructive: true,
        iconName: action === 'archive' ? 'archive-outline' : 'delete-outline',
      })
      .then((confirmed) => {
        if (!confirmed || !token) return;
        setError(null);
        setSelectedFriendActions(null);
        return archiveSplitFriend(token, friend.id)
          .then(async () => {
            haptics.removed();
            await loadSplitData();
          })
          .catch((archiveError: unknown) => {
            reportSplitError(archiveError, 'Unable to archive friend.');
          });
      });
  };

  const confirmDeleteFriend = () => {
    if (!token || !pendingFriendDelete || saving) return;
    setSaving(true);
    setError(null);
    void archiveSplitFriend(token, pendingFriendDelete.id)
      .then(async () => {
        haptics.removed();
        await loadSplitData();
      })
      .catch((archiveError: unknown) => {
        reportSplitError(archiveError, 'Unable to delete friend.');
      })
      .finally(() => {
        setSaving(false);
        setPendingFriendDelete(null);
      });
  };

  const handleArchiveFriend = (friend: SplitFriend) => {
    removeFriendFromActiveList(friend, 'archive');
  };

  const handleMergeDuplicateFriends = async () => {
    if (!token || !duplicateFriendPair || saving) return;
    setSaving(true);
    setError(null);
    try {
      await mergeSplitFriend(
        token,
        duplicateFriendPair.duplicate.id,
        duplicateFriendPair.survivor.id
      );
      haptics.saved();
      setDismissedDuplicateKey(null);
      await loadSplitData();
    } catch (mergeError) {
      reportSplitError(mergeError, 'Unable to merge these friends.');
      setDismissedDuplicateKey(
        `${duplicateFriendPair.duplicate.id}:${duplicateFriendPair.survivor.id}`
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Swiping a group and deleting it from its settings are the same operation,
   * so they now open the same sheet.
   *
   * They were two flows with two vocabularies over one endpoint: a system alert
   * saying "Archive" and promising the history was preserved, and a themed
   * dialog saying "Delete". Both called the same handler, and neither described
   * what it actually did to the balances.
   */
  const handleArchiveGroup = (summary: SplitGroupSummary) => {
    if (!summary.group.viewer_can_manage) return;
    setOpenSwipeRow(null);
    openGroupDeletePrompt(summary);
  };

  const openFriendEditor = (friend: SplitFriend) => {
    setSelectedFriendActions(null);
    setFriendName(friend.name);
    setFriendPhone(friend.phone ?? '');
    setFriendEmail(friend.email ?? '');
    setEditingFriendId(friend.id);
    setPendingFriendGroupId(null);
    setError(null);
    setModal('friend');
  };

  const openFriendDetail = (friendId: number) => {
    setSelectedFriendActions(null);
    setSelectedFriendDetailId(friendId);
  };

  const handleSelectBillGroup = (groupId: number | null) => {
    const nextGroup = groups.find((group) => group.id === groupId) ?? null;
    // Only members the composer can draw a row for — see `composerMemberKeys`,
    // which is where the 150%-over-two-people bug is written up.
    const memberKeys = composerMemberKeys(groupComposerMembers(nextGroup), friendById, friends);
    setBillGroupId(groupId);

    /**
     * The whole point of a group default is that the split screen stops being a
     * stop on the way to saving an expense — so it is applied the moment the
     * group is known, not asked for again.
     */
    const groupDefault = nextGroup?.default_split ?? null;
    const translated = nextGroup && groupDefault
      ? defaultSplitToComposerKeys(nextGroup, groupDefault)
      : null;
    // The default names people by the owner's friend rows. Anything that no
    // longer maps — a member who has left, or the owner themselves seen from
    // another member's expense composer, which can only name that member's own
    // friends — falls back to an equal split of the group rather than a
    // half-applied one.
    const usable =
      translated != null &&
      translated.participantKeys.every(
        (key) => key === CURRENT_USER_KEY || memberKeys.includes(key)
      ) &&
      (translated.payerKey === CURRENT_USER_KEY || memberKeys.includes(translated.payerKey));

    if (!usable || !groupDefault) {
      setSplitPayerKey(CURRENT_USER_KEY);
      setSplitFullAmount(false);
      setSplitSelectedKeys([CURRENT_USER_KEY, ...memberKeys]);
      setAdjustSplitTab('equally');
      setSplitWeights({});
      return;
    }

    setSplitPayerKey(translated.payerKey);
    setSplitFullAmount(Boolean(groupDefault.full_amount));
    setSplitSelectedKeys(translated.participantKeys);
    setAdjustSplitTab(groupDefault.tab);
    setSplitWeights(translated.weights);
  };

  const billSplitSelection = useMemo<SplitSelection>(
    () => ({
      selfKey: CURRENT_USER_KEY,
      payerKey: splitPayerKey,
      fullAmount: splitFullAmount,
      participantKeys: splitSelectedKeys,
      tab: adjustSplitTab,
      weights: splitWeights,
    }),
    [adjustSplitTab, splitFullAmount, splitPayerKey, splitSelectedKeys, splitWeights]
  );

  const buildParticipantsFromSplitChoice = (): ParticipantDraft[] | null => {
    const built = buildParticipantsFromSelection(billSplitSelection, parseAmount(billAmount));
    if (!built.ok) {
      setError(built.error);
      return null;
    }
    return built.participants;
  };

  const applySplitChoice = () => {
    const nextParticipants = buildParticipantsFromSplitChoice();
    if (!nextParticipants) return;
    setExpenseFlowScreen('expense');
    setError(null);
  };

  const handleCreateBill = async (form: EntryForm) => {
    if (!token) throw new Error('Please sign in again before saving this expense.');
    const amount = parseAmount(form.amount);
    const built = buildParticipantsFromSelection(billSplitSelection, amount);
    const participants =
      editingBill && !billAllocationChanged.current && amount === editingBill.total_amount
        ? editingBill.participants.map(({ friend_id, share_amount, direction }) => ({
            friend_id,
            share_amount,
            direction,
          }))
        : built.ok
          ? built.participants
          : null;
    if (!participants?.length)
      throw new Error(built.ok ? 'Choose at least one friend.' : built.error);
    setSaving(true);
    setError(null);
    try {
      const personalPayment =
        Boolean(editingEntry) || (!editingBill && splitPayerKey === CURRENT_USER_KEY);
      if (personalPayment) {
        const transactionForm: EntryForm = {
          ...form,
          splitEnabled: true,
          splitGroupId: billGroupId,
          splitGroupName: '',
          splitParticipants: participants.map((participant) => ({
            friendId: participant.friend_id,
            friendName: '',
            shareAmount: String(participant.share_amount),
            direction: participant.direction,
          })),
        };
        if (editingEntry && editingBill?.entry_id) {
          const payload = await buildTransactionPayload(token, transactionForm, {
            refundStatus: editingEntry.refund_status ?? 'pending',
          });
          await updateEntry(token, editingBill.entry_id, payload);
        } else {
          const accounts = await fetchAccounts(token);
          const account =
            accounts.find((candidate) => candidate.id === form.accountId) ??
            getPreferredAccountForPaymentMode(accounts, form.mode) ??
            null;
          await saveNewTransaction({
            token,
            form: transactionForm,
            account,
            idempotencyKey: billSaveKey.current,
            progress: billSaveProgress.current,
          });
        }
        notifyTransactionsChanged();
      } else {
        const attachment = await resolveAttachmentForSave(token, form.attachment);
        const payload = buildSplitBillPayload(form, billGroupId, participants, attachment);
        if (editingBillId) await updateSplitBill(token, editingBillId, payload);
        else await createSplitBill(token, payload);
      }
      await loadSplitData();
      if (billGroupId) setSelectedGroupDetailId(billGroupId);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBill = () => {
    if (!token || !pendingBillDelete || saving) return;
    const groupId = pendingBillDelete.group_id ?? null;
    setSaving(true);
    setError(null);
    void deleteSplitBill(token, pendingBillDelete.id)
      .then(async () => {
        setPendingBillDelete(null);
        setSelectedBillId(null);
        await loadSplitData();
        if (groupId) {
          setSelectedGroupDetailId(groupId);
        }
      })
      .catch((deleteError: unknown) => {
        reportSplitError(deleteError, 'Unable to delete this expense.');
      })
      .finally(() => setSaving(false));
  };

  const handleCreateSettlement = async () => {
    if (!token || saving) return;
    const amount = parseAmount(settlementAmount);
    if (!settlementFriendId || !Number.isFinite(amount) || amount <= 0) {
      setError('Choose a friend and enter a positive settlement amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recorded = await createSplitSettlement(token, {
        friend_id: settlementFriendId,
        ...(settlementGroupId ? { group_id: settlementGroupId } : {}),
        amount,
        direction: settlementDirection,
        date: settlementDate.trim(),
        notes: settlementNotes.trim(),
      });
      haptics.saved();
      closeModal();
      await loadSplitData();
      // Say who now has to agree. Without this the settlement looks final from
      // this side, and the denial that may follow arrives out of nowhere — a
      // balance springing back with nothing to connect it to.
      if (recorded.status === 'pending') {
        const friendName = friendById.get(settlementFriendId)?.name;
        void dialog.alert({
          title: 'Waiting on confirmation',
          message: friendName
            ? `${friendName} has been asked to confirm this settlement. The balance is already updated, and goes back if they deny it.`
            : 'Your friend has been asked to confirm this settlement. The balance is already updated, and goes back if they deny it.',
        });
      }
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to record this settlement.');
    } finally {
      setSaving(false);
    }
  };

  const openContextCreate = () => {
    if (activeSection === 'friends') {
      openModal('friend');
      return;
    }
    openModal('group');
  };

  const openExpenseComposer = () => {
    if (friends.length > 0) {
      openModal('bill');
      return;
    }
    openModal('friend');
  };

  const openGroupEditor = (summary: SplitGroupSummary) => {
    if (!summary.group.viewer_can_manage) return;
    setGroupSettingsId(null);
    setGroupName(summary.group.name);
    setGroupKind(summary.kind);
    setGroupPhotoUri(summary.group.photo_url || null);
    setGroupBalanceAlertEnabled(groupBalanceAlertById[summary.group.id]?.enabled ?? false);
    setGroupBalanceAlertAmount(groupBalanceAlertById[summary.group.id]?.amount ?? '');
    setSelectedGroupFriendIds(summary.memberIds);
    setEditingGroupId(summary.group.id);
    setError(null);
    setModal('group');
  };

  const openDefaultSplitEditor = (summary: SplitGroupSummary) => {
    const group = summary.group;
    const slotKeys = groupSplitSlots(
      group,
      resolveFriendName,
      resolveFriendContact,
      currentUserName,
      currentUserContact
    ).map((person) => person.key);
    const stored = group.default_split ?? null;
    // A stored default written against a roster that has since changed cannot
    // be edited meaningfully, so it opens as a fresh equal split of who is in
    // the group now.
    const storedMatchesRoster =
      stored != null &&
      slotKeys.includes(stored.payer) &&
      stored.participants.every((participant) => slotKeys.includes(participant.slot));

    setDefaultSplitGroupId(group.id);
    setDefaultSplitDraft(
      storedMatchesRoster && stored
        ? defaultSplitToSelection(group, stored)
        : {
            selfKey: viewerSplitSlot(group),
            payerKey: viewerSplitSlot(group),
            fullAmount: false,
            participantKeys: slotKeys,
            tab: 'equally',
            weights: {},
          }
    );
    setDefaultSplitScreen('choice');
    setDefaultSplitError(null);
    setGroupSettingsId(null);
  };

  const closeDefaultSplitEditor = () => {
    const returnToGroupId = defaultSplitGroupId;
    setDefaultSplitGroupId(null);
    setDefaultSplitDraft(null);
    setDefaultSplitError(null);
    setGroupSettingsId(returnToGroupId);
  };

  const saveDefaultSplit = async () => {
    if (!token || !defaultSplitGroupId || !defaultSplitDraft || saving) return;
    if (!isDefaultSplitTab(defaultSplitDraft.tab)) {
      setDefaultSplitError('A default split has to be a ratio, not exact amounts.');
      return;
    }
    const keys = splitParticipantKeys(defaultSplitDraft);
    if (keys.length === 0) {
      setDefaultSplitError('Choose at least one person for this split.');
      return;
    }
    /**
     * Checked here rather than on the next expense: a default whose percentages
     * do not reach 100 would otherwise sit in settings looking saved and fail
     * every time it was used.
     */
    const check = computeSplitShares({
      amount: 100,
      tab: defaultSplitDraft.tab,
      keys,
      weights: defaultSplitDraft.weights,
    });
    if (!check.ok) {
      setDefaultSplitError(check.error);
      return;
    }
    const payload = selectionToDefaultSplit(defaultSplitDraft);
    setSaving(true);
    try {
      await setSplitGroupDefaultSplit(token, defaultSplitGroupId, payload);
      haptics.saved();
      closeDefaultSplitEditor();
      await loadSplitData();
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to save this default split.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaultSplit = async () => {
    if (!token || !defaultSplitGroupId || saving) return;
    setSaving(true);
    try {
      await setSplitGroupDefaultSplit(token, defaultSplitGroupId, null);
      closeDefaultSplitEditor();
      await loadSplitData();
    } catch (resetError) {
      reportSplitError(resetError, 'Unable to remove this default split.');
    } finally {
      setSaving(false);
    }
  };

  const openMemberPicker = (summary: SplitGroupSummary) => {
    if (!summary.group.viewer_can_manage) return;
    setSelectedGroupDetailId(null);
    setGroupSettingsId(null);
    setMemberPickerGroupId(summary.group.id);
    setMemberPickerFriendIds(summary.memberIds);
    setMemberSearchQuery('');
    setError(null);
  };

  const shareGroupInviteLink = async (summary: SplitGroupSummary) => {
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    try {
      const invite = await createSplitGroupInviteLink(token, summary.group.id);
      await Share.share({
        title: `Join ${summary.group.name} on Finnri`,
        message: `Join ${summary.group.name} on Finnri to track shared expenses together: ${invite.url}`,
        url: invite.url,
      });
    } catch (inviteError) {
      reportSplitError(inviteError, 'Unable to share this invite link.');
    } finally {
      setSaving(false);
    }
  };

  const openDirectGroupInvite = (summary: SplitGroupSummary) => {
    if (!summary.group.viewer_can_manage) return;
    setGroupSettingsId(null);
    resetGroupInviteForm();
    setGroupInviteTargetId(summary.group.id);
    setError(null);
    setModal('group_invite');
  };

  const handleSendGroupInvite = async () => {
    if (!token || saving || !groupInviteTargetId) return;
    const email = groupInviteEmail.trim();
    const phone = groupInvitePhone.trim();
    if (!email && !phone) {
      setError('Enter an email or phone number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const invite = await createSplitGroupDirectInvite(token, groupInviteTargetId, {
        email,
        phone,
      });
      await Share.share({
        title: `Join ${invite.group.name} on Finnri`,
        message: invite.message,
        url: invite.url,
      });
      closeModal();
      setGroupSettingsId(invite.group.id);
      await loadPendingGroupInvites(invite.group.id);
    } catch (inviteError) {
      reportSplitError(inviteError, 'Unable to invite this friend.');
    } finally {
      setSaving(false);
    }
  };

  const sharePendingGroupInvite = async (invite: SplitGroupDirectInvite) => {
    if (!invite.message && !invite.url) return;
    await Share.share({
      title: `Join ${invite.group.name} on Finnri`,
      message: invite.message || invite.url,
      url: invite.url,
    });
  };

  const confirmRevokeGroupInvite = () => {
    if (!token || !pendingInviteRevoke || saving) return;
    const groupId = pendingInviteRevoke.group.id;
    setSaving(true);
    setError(null);
    void revokeSplitGroupDirectInvite(token, groupId, pendingInviteRevoke.id)
      .then(async () => {
        setPendingInviteRevoke(null);
        await loadPendingGroupInvites(groupId);
      })
      .catch((revokeError: unknown) => {
        reportSplitError(revokeError, 'Unable to revoke this invite.');
      })
      .finally(() => setSaving(false));
  };

  const closeMemberPicker = (returnToGroup = true) => {
    const groupId = memberPickerGroupId;
    setMemberPickerGroupId(null);
    setMemberPickerFriendIds([]);
    setMemberSearchQuery('');
    if (returnToGroup && groupId) {
      setSelectedGroupDetailId(groupId);
    }
  };

  const toggleMemberPickerFriend = (friendId: number) => {
    setMemberPickerFriendIds((current) =>
      current.includes(friendId)
        ? current.filter((currentId) => currentId !== friendId)
        : [...current, friendId]
    );
  };

  const handleSaveGroupMembers = async () => {
    if (!token || saving || !memberPickerSummary) return;
    if (!memberPickerSummary.group.viewer_can_manage) return;
    setSaving(true);
    setError(null);
    try {
      const savedGroup = await updateSplitGroup(token, memberPickerSummary.group.id, {
        name: memberPickerSummary.group.name,
        kind: memberPickerSummary.kind,
        friend_ids: memberPickerFriendIds,
      });
      reportMemberInvites(savedGroup.member_invites ?? []);
      const groupId = memberPickerSummary.group.id;
      closeMemberPicker(false);
      setSelectedGroupDetailId(groupId);
      await loadSplitData();
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to update group members.');
    } finally {
      setSaving(false);
    }
  };

  const openGroupDeletePrompt = (summary: SplitGroupSummary) => {
    setError(null);
    // Keeping is the answer every time the sheet opens: it is the recoverable
    // one, and the other destroys transactions.
    setGroupDeleteDisposition('keep');
    setPendingGroupDelete(summary);
  };

  const handleDeleteGroup = (summary: SplitGroupSummary) => {
    if (!summary.group.viewer_can_manage) return;
    openGroupDeletePrompt(summary);
  };

  const handleLeaveGroup = (summary: SplitGroupSummary) => {
    if (summary.group.viewer_can_manage) return;
    setPendingGroupLeave(summary);
  };

  /**
   * A shared group is the one place in Finnri where a member reads text and
   * images somebody else wrote — expense titles, notes, the group photo. Play's
   * user-generated content policy asks for a way to report that from inside the
   * app, which rules out handing the user a mailto link.
   *
   * It rides the feedback endpoint that already exists rather than waiting on a
   * new one; `content_report` is what the admin console filters on to tell a
   * report from a feature request.
   */
  const handleReportGroup = (summary: SplitGroupSummary) => {
    if (!token) return;
    void dialog
      .confirm({
        title: 'Report this group?',
        message:
          'Use this if something here is abusive, offensive or unlawful. We review every report and may remove the content or the account behind it.',
        confirmLabel: 'Report',
        cancelLabel: 'Cancel',
        iconName: 'flag-outline',
      })
      .then(async (confirmed) => {
        if (!confirmed) return;
        try {
          await submitFeedback(token, {
            type: 'other',
            area: 'content_report',
            title: `Reported split group #${summary.group.id}`,
            message: `A member reported the group "${summary.group.name}" (id ${summary.group.id}) for review.`,
            impact: 'high',
          });
          await dialog.alert({
            title: 'Report sent',
            message: 'Thank you. We will review this group and act if it breaks our terms.',
            tone: 'success',
            iconName: 'flag-outline',
          });
        } catch {
          await dialog.alert({
            title: 'Could not send the report',
            message: 'Check your connection and try again.',
            tone: 'danger',
          });
        }
      });
  };

  const confirmDeleteGroup = () => {
    if (!token || !pendingGroupDelete || saving) return;
    const removedGroupId = pendingGroupDelete.group.id;
    const disposition = groupDeleteDisposition;
    setSaving(true);
    setError(null);
    void archiveSplitGroup(token, removedGroupId, disposition)
      .then(async (result) => {
        haptics.removed();
        setPendingGroupDelete(null);
        setGroupSettingsId(null);
        setSelectedGroupDetailId(null);
        await loadSplitData();
        // The transaction feed on Home is reading the same rows this just
        // removed, so it has to be told rather than left to notice.
        if (result.deleted_entries > 0) notifyTransactionsChanged();
      })
      .catch((deleteError: unknown) => {
        reportSplitError(deleteError, 'Unable to delete this split group.');
      })
      .finally(() => setSaving(false));
  };

  const confirmLeaveGroup = () => {
    if (!token || !pendingGroupLeave || saving) return;
    setSaving(true);
    setError(null);
    const leftGroupId = pendingGroupLeave.group.id;
    void leaveSplitGroup(token, leftGroupId)
      .then(async () => {
        setPendingGroupLeave(null);
        setGroupSettingsId(null);
        setSelectedGroupDetailId(null);
        await loadSplitData();
      })
      .catch((leaveError: unknown) => {
        reportSplitError(leaveError, 'Unable to leave this split group.');
      })
      .finally(() => setSaving(false));
  };

  const requestContactsAccess = async () => {
    setContactsLoading(true);
    setError(null);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      setContactsPermissionStatus(permission.status);
      setContactsAccessPrivileges(permission.accessPrivileges ?? null);
      if (permission.granted) {
        await loadDeviceContacts();
      }
    } catch (permissionError) {
      reportSplitError(permissionError, 'Unable to request contacts permission.');
    } finally {
      setContactsLoading(false);
    }
  };

  const selectDeviceContact = async (contact: DeviceContactOption) => {
    if (!token || saving) return;
    const existingFriend = friends.find((friend) => contactMatchesFriend(contact, friend));
    if (existingFriend) {
      setMemberPickerFriendIds((current) =>
        current.includes(existingFriend.id) ? current : [...current, existingFriend.id]
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const createdFriend = await createSplitFriend(token, {
        name: contact.name,
        phone: contact.phone ?? '',
        email: contact.email ?? '',
      });
      setMemberPickerFriendIds((current) =>
        current.includes(createdFriend.id) ? current : [...current, createdFriend.id]
      );
      await loadSplitData();
    } catch (saveError) {
      reportSplitError(saveError, 'Unable to add this contact.');
    } finally {
      setSaving(false);
    }
  };

  const openFriendComposerFromMembers = () => {
    if (!memberPickerGroupId) return;
    const prefilledName = memberSearchQuery.trim();
    setPendingFriendGroupId(memberPickerGroupId);
    closeMemberPicker(false);
    openModal('friend');
    if (prefilledName) {
      setFriendName(prefilledName);
    }
  };

  const startBillForGroup = (groupId: number) => {
    resetBillForm();
    handleSelectBillGroup(groupId);
    setIsBillGroupLocked(true);
    setSelectedGroupDetailId(null);
    setModal('bill');
  };

  const openBillForGroup = (groupId: number) => {
    const group = groups.find((candidate) => candidate.id === groupId) ?? null;
    // Whether the composer can draw a row for anybody but the reader. Asked of
    // the roster in the reader's own namespace rather than of `members`, which
    // is the owner's — a member would otherwise be told the group has people in
    // it by ids her own composer cannot name.
    const groupHasMembers = (groupComposerMembers(group) ?? []).some((member) =>
      friendById.has(member.friend_id)
    );
    /**
     * An expense in a group of one is a valid thing to record, and sometimes
     * exactly what somebody means to do. But far more often it means they have
     * not finished making the group — so it is worth asking once, with adding
     * people offered rather than demanded.
     */
    if (!groupHasMembers && group?.viewer_can_manage) {
      setSoloGroupPromptId(groupId);
      return;
    }
    if (!groupHasMembers && friends.length === 0) {
      setSelectedGroupDetailId(null);
      openModal('friend');
      return;
    }
    startBillForGroup(groupId);
  };

  const openBillForFriend = (friendId: number) => {
    const friend = friends.find((candidate) => candidate.id === friendId);
    if (!friend) return;
    resetBillForm();
    setBillGroupId(null);
    setSplitPayerKey(CURRENT_USER_KEY);
    setSplitFullAmount(false);
    setSplitSelectedKeys([CURRENT_USER_KEY, friendSplitKey(friend.id)]);
    setSelectedFriendDetailId(null);
    setModal('bill');
  };

  const openBillEditor = async (bill: SplitBill) => {
    if (!token) return;
    const request = ++billEditorRequest.current;
    try {
      // Load the owner's full transaction before opening, never seed an edit with guessed Cash/details.
      const [entry, accounts] = await Promise.all([
        bill.entry_id ? fetchEntry(token, bill.entry_id) : Promise.resolve(null),
        fetchAccounts(token),
      ]);
      if (request !== billEditorRequest.current) return;
      setBillAccounts(accounts);
      const selection = billToSplitSelection(bill);
      setEditingBill(bill);
      setEditingEntry(entry);
      setBillInitialData(entry ? entryToComposerForm(entry) : billToComposerForm(bill));
      setBillAmount(String(bill.total_amount));
      setBillGroupId(bill.group_id ?? null);
      setIsBillGroupLocked(Boolean(bill.group_id));
      setEditingBillId(bill.id);
      setExpenseFlowScreen('expense');
      setSplitPayerKey(selection.payerKey);
      setSplitFullAmount(selection.fullAmount);
      setSplitSelectedKeys(selection.participantKeys);
      setAdjustSplitTab(selection.tab);
      setSplitWeights(selection.weights);
      billAllocationChanged.current = false;
      setSelectedBillId(null);
      setSelectedGroupDetailId(null);
      setError(null);
      setModal('bill');
    } catch (error) {
      reportSplitError(error, 'Unable to load this expense for editing.');
    }
  };

  const openSettlementForFriend = (friendId: number) => {
    const friend = friends.find((candidate) => candidate.id === friendId);
    if (!friend) return;
    resetSettlementForm();
    setSettlementFriendId(friend.id);
    setSelectedFriendDetailId(null);
    setModal('settlement');
  };

  const openGroupAction = (summary: SplitGroupSummary, mode: GroupActionMode) => {
    setGroupAction({ groupId: summary.group.id, mode });
  };

  /**
   * Record a payment against one person's balance in a group.
   *
   * `amount` is what the sheet collected, which is the whole balance unless the
   * user typed something smaller — a part payment has to be possible, because
   * most of them are. The direction still comes from the balance's sign: paying
   * somebody back a slice of what you owe them does not change who owes whom.
   *
   * `friendId` is the viewer's *own* row for that person. It used to be the
   * group's roster id, which for anybody but the owner belongs to another
   * account — so `friends.find` came back empty and the Record payment button
   * did nothing at all, silently, every time a member pressed it.
   */
  const openSettlementForGroupFriend = (
    summary: SplitGroupSummary,
    friendId: number,
    balance: number,
    amount: number
  ) => {
    if (balance === 0 || !Number.isFinite(amount) || amount <= 0) return;
    const friend = friendById.get(friendId);
    if (!friend) return;
    resetSettlementForm();
    setSettlementFriendId(friend.id);
    setSettlementAmount(toAmountString(amount));
    setSettlementDirection(balance > 0 ? 'friend_paid_user' : 'user_paid_friend');
    setSettlementNotes(`Settlement for ${summary.group.name}`);
    setSettlementGroupId(summary.group.id);
    setGroupAction(null);
    setModal('settlement');
  };

  const shareGroupExport = async (summary: SplitGroupSummary) => {
    try {
      const csv = buildGroupExportCsv(summary, friendById, currentUserName);
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!FileSystem.documentDirectory || !sharingAvailable) {
        await Share.share({
          title: `${summary.group.name} Finnri split export`,
          message: csv,
        });
        return;
      }
      const fileName = `${getSafeExportFileName(summary.group.name)}-split-export-${todayApiDate()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: `${summary.group.name} Finnri split export`,
      });
    } catch (shareError) {
      reportSplitError(shareError, 'Unable to export this group summary.');
    }
  };

  /**
   * Answer a settlement somebody recorded against this user.
   *
   * The prompt is dropped from the list before the reload lands, because the
   * one thing that must not happen after a tap is the same question being asked
   * again. A `null` result means somebody already answered it — another device,
   * or the same tap twice — which is the same outcome from here: it is gone.
   */
  const decideSettlementRequest = async (
    settlement: SplitSettlement,
    decision: 'confirm' | 'deny'
  ) => {
    if (!token || decidingSettlementId) return;
    setDecidingSettlementId(settlement.id);
    try {
      await decideSplitSettlement(token, settlement.id, decision);
      setSettlementRequests((current) => current.filter((row) => row.id !== settlement.id));
      // A denial moves the balance back, so the ledger has to be re-read rather
      // than patched: the figure it changes is computed across every group.
      await loadSplitData();
    } catch (decisionError) {
      reportSplitError(decisionError, 'Unable to record that decision.');
    } finally {
      setDecidingSettlementId(null);
    }
  };

  /**
   * Opening Activity is what clears its dot.
   *
   * The dot stands for split notifications the user has not read, so looking at
   * the feed they describe is exactly the event that should put it out — and it
   * decrements the bell on Home too, which is right: they *have* now seen them.
   * Scoped to `split.` so it cannot quietly dismiss a budget alert sitting in
   * the same inbox.
   */
  const openSection = (section: ActiveSection) => {
    setActiveSection(section);
    if (section !== 'activity' || !token || unreadSplitCount === 0) return;
    setUnreadSplitCount(0);
    void markAllNotificationsRead(token, SPLIT_NOTIFICATION_PREFIX).catch(() => {
      // Purely a read receipt. If it does not land the dot comes back on the
      // next refresh, which is the harmless direction to fail in.
    });
  };

  const openActivityTarget = (item: SplitActivityItem) => {
    const targetGroupId = item.group_id ?? item.group?.id ?? null;
    if (targetGroupId && groupSummaries.some((summary) => summary.group.id === targetGroupId)) {
      setSelectedFriendDetailId(null);
      setSelectedGroupDetailId(targetGroupId);
      return;
    }

    if (item.type === 'bill') {
      const bill = bills.find((candidate) => candidate.id === item.record_id);
      if (bill?.entry_id) {
        router.push({ pathname: '/entry/[id]', params: { id: String(bill.entry_id) } });
        return;
      }
      const participantFriendId = bill?.participants?.[0]?.friend_id;
      if (participantFriendId) {
        openFriendDetail(participantFriendId);
        return;
      }
    }

    const targetFriendId = item.friend_id ?? item.friend?.id ?? item.participants?.[0]?.friend_id;
    if (targetFriendId && friends.some((friend) => friend.id === targetFriendId)) {
      openFriendDetail(targetFriendId);
      return;
    }

    void dialog.alert({
      title: 'Activity details',
      message: 'This activity is not linked to a detail page yet.',
    });
  };

  if (screenState === 'loading') {
    return (
      <SplitScreenFrame embedded={embedded} backgroundColor={theme.background}>
        <SkeletonFrame label="Loading splits" testID="split-skeleton" style={{ paddingTop: 16 }}>
          <SkeletonRows count={5} lines={2} />
        </SkeletonFrame>
      </SplitScreenFrame>
    );
  }

  const renderFriendRow = (friend: SplitFriend, entranceIndex: number) => (
    <SplitFriendRow
      key={friend.id}
      friend={friend}
      netBalance={balanceByFriendId.get(friend.id)?.net_balance ?? 0}
      entranceIndex={entranceIndex}
      isOpen={openSwipeRow === `friend-${friend.id}`}
      onOpenChange={(open) => setOpenSwipeRow(open ? `friend-${friend.id}` : null)}
      onEdit={() => openFriendEditor(friend)}
      onArchive={() => handleArchiveFriend(friend)}
      onOpen={() => openFriendDetail(friend.id)}
      onLongPress={() => setSelectedFriendActions(friend)}
    />
  );

  const renderGroupCard = (summary: SplitGroupSummary, entranceIndex: number) => (
    <SplitGroupCard
      key={summary.group.id}
      summary={summary}
      entranceIndex={entranceIndex}
      isOpen={openSwipeRow === `group-${summary.group.id}`}
      onOpenChange={(open) => setOpenSwipeRow(open ? `group-${summary.group.id}` : null)}
      onEdit={() => openGroupEditor(summary)}
      onArchive={() => handleArchiveGroup(summary)}
      onOpen={() => setSelectedGroupDetailId(summary.group.id)}
    />
  );

  const renderNonGroupRow = (entranceIndex: number) => (
    <SplitNonGroupRow
      summary={nonGroupSummary}
      entranceIndex={entranceIndex}
      onPress={() => openModal('bill')}
    />
  );

  const renderActivityRow = (item: (typeof recentActivity)[number], entranceIndex: number) => (
    <SplitActivityRow
      key={item.id}
      item={item}
      entranceIndex={entranceIndex}
      onPress={() => openActivityTarget(item.item)}
    />
  );


  return (
    <SplitScreenFrame embedded={embedded} backgroundColor={theme.background}>
      <TView className="flex-1" style={{ backgroundColor: theme.background }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: embedded ? 14 : 10,
            paddingBottom: 136,
          }}>
          {!embedded && (
            <SplitHeader
              loading={loading}
              searchVisible={searchVisible}
              activeSection={activeSection}
              onToggleSearch={() => setSearchVisible((current) => !current)}
              onCreate={openContextCreate}
            />
          )}

          {searchVisible && (
            <SearchField
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={() => setSearchQuery('')}
            />
          )}

          {error && <ErrorBanner message={error} style={{ marginTop: 16 }} />}

          {/* A load that failed on top of a ledger we already have is a
              warning, not a wall: the figures below are real, just possibly a
              few minutes old, and blanking them would cost the user more than
              the staleness does. The retry is on the banner because there is
              nowhere else on the screen it would belong. */}
          {loadError && screenState === 'ledger' ? (
            <ErrorBanner
              message={loadError}
              onRetry={() => void loadSplitData()}
              retryLabel="Try again"
              style={{ marginTop: 16 }}
            />
          ) : null}

          {loadError && screenState === 'unavailable' ? (
            <View className="mt-8">
              <StateView
                compact
                icon="wifi-off"
                title="Splits did not load"
                message={loadError}
                actionLabel="Try again"
                onAction={() => void loadSplitData()}
              />
            </View>
          ) : (
            <>
            <SegmentedSections
              activeSection={activeSection}
              onChange={openSection}
              activityBadge={unreadSplitCount > 0}
            />

            {/*
             * Above the balances, on every section, because it is the only
             * thing on this screen that is waiting on the user rather than
             * describing what they already have.
             */}
            <SettlementRequests
              settlements={settlementRequests}
              decidingId={decidingSettlementId}
              onDecide={(settlement, decision) => {
                void decideSettlementRequest(settlement, decision);
              }}
            />

            {activeSection !== 'activity' ? (
              <SplitOverallBalance
                value={overallNetBalance}
                color={overallTone.color}
                hasActivity={hasLedgerActivity}
                onOpenFilter={() => setFilterSheetVisible(true)}
              />
            ) : null}


            {activeSection === 'groups' && (
              <SplitGroupsSection
                groups={visibleGroupSummaries}
                showNonGroupSummary={showNonGroupSummary}
                hiddenSettledCount={hiddenSettledCount}
                normalizedSearch={normalizedSearch}
                renderGroupCard={renderGroupCard}
                renderNonGroupRow={renderNonGroupRow}
                onShowSettled={() => {
                  setBalanceFilter('settled');
                  setFilterSheetVisible(false);
                }}
                onNewGroup={() => openModal('group')}
              />
            )}


            {activeSection === 'friends' && (
              <SplitFriendsSection
                visibleFriends={visibleFriends}
                hasAnyFriends={friends.length > 0}
                normalizedSearch={normalizedSearch}
                renderFriendRow={renderFriendRow}
                onAddFriend={() => openModal('friend')}
              />
            )}


            {activeSection === 'activity' && (
              <SplitActivitySection
                activity={visibleActivity}
                normalizedSearch={normalizedSearch}
                renderActivityRow={renderActivityRow}
              />
            )}

            </>
          )}
        </ScrollView>

        {friends.length > 0 ? <FloatingExpenseButton onPress={openExpenseComposer} /> : null}

        <BalanceFilterSheet
          visible={filterSheetVisible}
          selectedFilter={balanceFilter}
          onSelect={(nextFilter) => {
            setBalanceFilter(nextFilter);
            setFilterSheetVisible(false);
          }}
          onClose={() => setFilterSheetVisible(false)}
        />

        <FriendActionsSheet
          friend={selectedFriendActions}
          onClose={() => setSelectedFriendActions(null)}
          onEdit={openFriendEditor}
          onDelete={(friend) => removeFriendFromActiveList(friend, 'delete')}
          onArchive={(friend) => removeFriendFromActiveList(friend, 'archive')}
        />

        <ThemedDeleteDialog
          visible={Boolean(pendingFriendDelete)}
          title={`Delete ${pendingFriendDelete?.name ?? 'friend'}?`}
          message="This removes the friend from active split lists while preserving past split records."
          cancelLabel="Cancel"
          confirmLabel="Delete"
          loading={saving}
          onCancel={() => {
            if (!saving) setPendingFriendDelete(null);
          }}
          onConfirm={confirmDeleteFriend}
        />

        <FriendDetailModal
          summary={selectedFriendDetailSummary}
          currentUserName={currentUserName}
          onClose={() => setSelectedFriendDetailId(null)}
          onAddExpense={(friendId) => openBillForFriend(friendId)}
          onSettleUp={(friendId) => openSettlementForFriend(friendId)}
          onOpenGroup={(groupId) => {
            setSelectedFriendDetailId(null);
            setSelectedGroupDetailId(groupId);
          }}
          onOpenOptions={(friend) => setSelectedFriendActions(friend)}
        />

        <BillSortSheet
          visible={sortSheetVisible}
          selectedSort={billSort}
          onSelect={(nextSort) => {
            setBillSort(nextSort);
            void saveSplitBillSort(nextSort);
            setSortSheetVisible(false);
          }}
          onClose={() => setSortSheetVisible(false)}
        />

        <GroupDetailModal
          summary={selectedGroupSummary}
          friendById={friendById}
          currentUserName={currentUserName}
          billSort={billSort}
          onOpenSort={() => setSortSheetVisible(true)}
          onClose={() => setSelectedGroupDetailId(null)}
          onAddExpense={(groupId) => openBillForGroup(groupId)}
          onManageMembers={openMemberPicker}
          onInviteViaLink={(summary) => void shareGroupInviteLink(summary)}
          onOpenExpense={(bill) => setSelectedBillId(bill.id)}
          onOpenAction={openGroupAction}
          onOpenSettings={(summary) => setGroupSettingsId(summary.group.id)}
        />

        <GroupActionModal
          summary={groupActionSummary}
          mode={groupAction?.mode ?? null}
          friendById={friendById}
          currentUserName={currentUserName}
          onClose={() => setGroupAction(null)}
          onSettleWithFriend={openSettlementForGroupFriend}
          onShareExport={(summary) => void shareGroupExport(summary)}
        />

        <BillDetailModal
          bill={selectedBill}
          friendById={friendById}
          currentUserName={currentUserName}
          onClose={() => {
            billEditorRequest.current += 1;
            setSelectedBillId(null);
          }}
          onEdit={openBillEditor}
          onDelete={(bill) => setPendingBillDelete(bill)}
        />

        <ThemedDeleteDialog
          visible={Boolean(pendingBillDelete)}
          title={`Delete ${pendingBillDelete?.title ?? 'expense'}?`}
          message="This removes the expense from the split group. Existing friend and group records stay preserved."
          cancelLabel="Cancel"
          confirmLabel="Delete"
          loading={saving}
          onCancel={() => {
            if (!saving) setPendingBillDelete(null);
          }}
          onConfirm={confirmDeleteBill}
        />

        <GroupSettingsModal
          summary={groupSettingsSummary}
          currentUserName={currentUserName}
          currentUserContact={currentUserContact}
          simplifyGroupDebts={simplifyGroupDebts}
          defaultSplitLabel={
            groupSettingsSummary
              ? describeGroupDefaultSplit(groupSettingsSummary.group.default_split, (slot) =>
                  resolveSlotLabel(groupSettingsSummary.group, slot)
                )
              : ''
          }
          pendingInvites={pendingGroupInvites}
          pendingInvitesLoading={pendingGroupInvitesLoading}
          onToggleSimplifyDebts={() => setSimplifyGroupDebts((current) => !current)}
          onOpenDefaultSplit={openDefaultSplitEditor}
          onClose={() => setGroupSettingsId(null)}
          onAddPeople={openMemberPicker}
          onInvitePerson={openDirectGroupInvite}
          onInviteViaLink={(summary) => void shareGroupInviteLink(summary)}
          onSharePendingInvite={(invite) => void sharePendingGroupInvite(invite)}
          onRevokePendingInvite={setPendingInviteRevoke}
          onEditGroup={openGroupEditor}
          onDeleteGroup={handleDeleteGroup}
          onLeaveGroup={handleLeaveGroup}
          onReportGroup={handleReportGroup}
        />

        <GroupDefaultSplitModal
          visible={Boolean(defaultSplitSummary && defaultSplitDraft)}
          groupName={defaultSplitSummary?.group.name ?? null}
          people={defaultSplitPeople}
          draft={defaultSplitDraft}
          screen={defaultSplitScreen}
          saving={saving}
          errorMessage={defaultSplitError}
          hasSavedDefault={Boolean(defaultSplitSummary?.group.default_split)}
          onChangeDraft={(next) => {
            setDefaultSplitDraft(next);
            setDefaultSplitError(null);
          }}
          onChangeScreen={setDefaultSplitScreen}
          onSave={() => void saveDefaultSplit()}
          onReset={() => void resetDefaultSplit()}
          onClose={closeDefaultSplitEditor}
        />

        <ThemedConfirmDialog
          visible={Boolean(duplicateFriendPair)}
          title="These look like the same person"
          message={`${duplicateFriendPair?.survivor.name ?? 'This friend'} and ${
            duplicateFriendPair?.duplicate.name ?? 'this friend'
          } share contact details in one group. Merge their expenses, balances, and memberships?`}
          iconName="account-convert-outline"
          confirmLabel="Merge friends"
          cancelLabel="Keep separate"
          loading={saving}
          onCancel={() => {
            if (!saving && duplicateFriendPair) {
              setDismissedDuplicateKey(
                `${duplicateFriendPair.duplicate.id}:${duplicateFriendPair.survivor.id}`
              );
            }
          }}
          onConfirm={() => void handleMergeDuplicateFriends()}
        />

        <ThemedConfirmDialog
          visible={Boolean(soloGroupPromptSummary)}
          title="You are the only person in this group."
          message="Do you need to add anyone to your group before you start adding expenses?"
          iconName="account-multiple-plus-outline"
          confirmLabel="Start adding expenses"
          cancelLabel="Add group members"
          onCancel={() => {
            const summary = soloGroupPromptSummary;
            setSoloGroupPromptId(null);
            if (summary) openMemberPicker(summary);
          }}
          onConfirm={() => {
            const groupId = soloGroupPromptId;
            setSoloGroupPromptId(null);
            if (groupId) startBillForGroup(groupId);
          }}
        />

        <ThemedDeleteDialog
          visible={Boolean(pendingGroupLeave)}
          title={`Leave ${pendingGroupLeave?.group.name ?? 'group'}?`}
          message="This removes the group from your split list. The group and existing expenses stay visible to the owner."
          cancelLabel="Cancel"
          confirmLabel="Leave"
          loading={saving}
          onCancel={() => {
            if (!saving) setPendingGroupLeave(null);
          }}
          onConfirm={confirmLeaveGroup}
        />

        <ThemedDeleteDialog
          visible={Boolean(pendingInviteRevoke)}
          title="Revoke invite?"
          message={`This removes the pending invite for ${
            pendingInviteRevoke?.target_email || pendingInviteRevoke?.target_phone || 'this person'
          }. The general group invite link stays active.`}
          cancelLabel="Cancel"
          confirmLabel="Revoke"
          loading={saving}
          onCancel={() => {
            if (!saving) setPendingInviteRevoke(null);
          }}
          onConfirm={confirmRevokeGroupInvite}
        />

        <DeleteGroupSheet
          visible={Boolean(pendingGroupDelete)}
          groupName={pendingGroupDelete?.group.name ?? 'this group'}
          expenseCount={pendingGroupDelete?.billCount ?? 0}
          disposition={groupDeleteDisposition}
          saving={saving}
          onChangeDisposition={setGroupDeleteDisposition}
          onCancel={() => {
            if (!saving) setPendingGroupDelete(null);
          }}
          onConfirm={confirmDeleteGroup}
        />

        <GroupMembersModal
          summary={memberPickerSummary}
          friends={friends}
          contacts={deviceContacts}
          contactsPermissionStatus={contactsPermissionStatus}
          contactsAccessPrivileges={contactsAccessPrivileges}
          contactsLoading={contactsLoading}
          searchQuery={memberSearchQuery}
          selectedFriendIds={memberPickerFriendIds}
          saving={saving}
          onChangeSearchQuery={setMemberSearchQuery}
          onToggleFriend={toggleMemberPickerFriend}
          onSelectContact={(contact) => void selectDeviceContact(contact)}
          onRequestContactsAccess={() => void requestContactsAccess()}
          onCreateFriend={openFriendComposerFromMembers}
          onClose={() => closeMemberPicker(true)}
          onSave={() => void handleSaveGroupMembers()}
        />

        <SplitFriendFormModal
          visible={modal === 'friend'}
          isEditing={Boolean(editingFriendId)}
          errorMessage={modal === 'friend' ? error : null}
          saving={saving}
          name={friendName}
          phone={friendPhone}
          email={friendEmail}
          onChangeName={setFriendName}
          onChangePhone={setFriendPhone}
          onChangeEmail={setFriendEmail}
          onSave={() => void handleSaveFriend()}
          onClose={closeModal}
        />

        {/*
          * The button used to say "Send invite" and what happened next was the
          * share sheet. Nothing is emailed or texted — there is no mail or SMS
          * provider behind this — so the label promised a delivery the app has
          * never made, and an invite that was recorded but never shared looked
          * exactly like one that was sent and did not arrive.
          *
          * The address is still worth collecting, but for the other reason: it
          * is what matches the person to the friend row when they open the
          * link, so they land on the balance already kept for them rather than
          * on a second row of their own.
          */}
        <SplitGroupInviteModal
          visible={modal === 'group_invite'}
          errorMessage={modal === 'group_invite' ? error : null}
          saving={saving}
          email={groupInviteEmail}
          phone={groupInvitePhone}
          onChangeEmail={setGroupInviteEmail}
          onChangePhone={setGroupInvitePhone}
          onSend={() => void handleSendGroupInvite()}
          onClose={closeModal}
        />

        <CreateGroupModal
          visible={modal === 'group'}
          saving={saving}
          title={editingGroupId ? 'Edit group' : 'Create a group'}
          doneLabel={editingGroupId ? 'Save' : 'Done'}
          groupName={groupName}
          groupKind={groupKind}
          photoUri={groupPhotoUri}
          photoBusy={groupPhotoBusy}
          onPickPhoto={() => void pickGroupPhoto()}
          onRemovePhoto={removeGroupPhoto}
          balanceAlertEnabled={groupBalanceAlertEnabled}
          balanceAlertAmount={groupBalanceAlertAmount}
          friends={friends}
          selectedFriendIds={selectedGroupFriendIds}
          onChangeName={setGroupName}
          onChangeKind={setGroupKind}
          onToggleBalanceAlert={() => setGroupBalanceAlertEnabled((current) => !current)}
          onChangeBalanceAlertAmount={setGroupBalanceAlertAmount}
          onToggleFriend={toggleGroupFriend}
          onClose={closeModal}
          onDone={() => void handleCreateGroup()}
        />

        <AddExpenseModal
          visible={modal === 'bill'}
          flowScreen={expenseFlowScreen}
          errorMessage={modal === 'bill' ? error : null}
          initialData={billInitialData}
          isEdit={Boolean(editingBillId)}
          accounts={billAccounts}
          onAccountCreated={(account) =>
            setBillAccounts((current) => [
              ...current.filter((item) => item.id !== account.id),
              account,
            ])
          }
          authToken={token}
          personalPayment={
            Boolean(editingEntry) || (!editingBill && splitPayerKey === CURRENT_USER_KEY)
          }
          payerLocked={Boolean(editingEntry)}
          amount={billAmount}
          groups={groups}
          selectedGroup={selectedBillGroup}
          selectedGroupId={billGroupId}
          isGroupLocked={isBillGroupLocked}
          people={billSplitPeople}
          selection={billSplitSelection}
          onChangeAmount={setBillAmount}
          onSelectGroup={(groupId) => {
            billAllocationChanged.current = true;
            handleSelectBillGroup(groupId);
          }}
          onChangeFlowScreen={setExpenseFlowScreen}
          onSelectPayer={(payerKey, fullAmount) => {
            billAllocationChanged.current = true;
            setSplitPayerKey(payerKey);
            setSplitFullAmount(fullAmount);
          }}
          onToggleParticipant={(key) => {
            billAllocationChanged.current = true;
            setSplitSelectedKeys((current) =>
              current.includes(key)
                ? current.filter((currentKey) => currentKey !== key)
                : [...current, key]
            );
          }}
          onToggleAllParticipants={() => {
            billAllocationChanged.current = true;
            const allKeys = billSplitPeople.map((person) => person.key);
            const allSelected = allKeys.every((key) => splitSelectedKeys.includes(key));
            setSplitSelectedKeys(allSelected ? [] : allKeys);
          }}
          onChangeAdjustSplitTab={(tab) => {
            billAllocationChanged.current = true;
            setAdjustSplitTab(tab);
            setSplitWeights((current) =>
              Object.keys(current).length > 0 ? current : buildSeedWeights(tab, billSplitSelection)
            );
          }}
          onChangeSplitWeight={(key, value) => {
            billAllocationChanged.current = true;
            setSplitWeights((current) => ({ ...current, [key]: value }));
          }}
          onApplySplit={applySplitChoice}
          onSave={handleCreateBill}
          onClose={closeModal}
        />

        <SplitSettlementModal
          visible={modal === 'settlement'}
          saving={saving}
          friends={friends}
          friendId={settlementFriendId}
          direction={settlementDirection}
          amount={settlementAmount}
          date={settlementDate}
          notes={settlementNotes}
          onChangeFriend={setSettlementFriendId}
          onChangeDirection={setSettlementDirection}
          onChangeAmount={setSettlementAmount}
          onChangeDate={setSettlementDate}
          onChangeNotes={setSettlementNotes}
          onSave={() => void handleCreateSettlement()}
          onClose={closeModal}
        />

        <UpgradeSheet
          visible={upgradeSheetVisible}
          entitlement={entitlement}
          onClose={dismissUpgrade}
        />
      </TView>
    </SplitScreenFrame>
  );
}
