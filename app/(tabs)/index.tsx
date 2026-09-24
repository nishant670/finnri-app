import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useRouter, useFocusEffect, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated as RNAnimated, Easing, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { AnswerCard } from '@/components/home/AnswerCard';
import { CAPTURE_COLLAPSED_HEIGHT, CollapsibleCapture } from '@/components/home/CollapsibleCapture';
import { HomeHeader } from '@/components/home/HomeHeader';
import { MonthStrip } from '@/components/home/MonthStrip';
import { QuickPrompts } from '@/components/home/QuickPrompts';
import { TransactionItem } from '@/components/home/TransactionItem';
import { ParseErrorCard } from '@/components/home/ParseErrorCard';
import { VoiceInputCard } from '@/components/home/VoiceInputCard';
import { CreditStatusCard } from '@/components/billing/CreditStatusCard';
import { GuestUpgradePrompt } from '@/components/home/GuestUpgradePrompt';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { Card, Screen, SectionHeader } from '@/components/ui/theme-primitives';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useMotion } from '@/hooks/use-motion';
import { encodeFrame } from '@/hooks/use-shared-element';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  fetchNotifications,
  fetchNewUnreadBudgetNotification,
  fetchUnreadBudgetNotificationIds,
  fetchUnreadNotificationCount,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';
import { isAccountSetupNudgeSnoozed, snoozeAccountSetupNudge } from '@/lib/account-setup-nudge';
import {
  API_BASE_URL,
  formatApiDate,
  formatDateLabel,
  groupTransactionsBySection,
  loadTransactionPage,
  mapEntryToTransaction,
  normalizeDateLabel,
  parseDateLabel,
  toTitleCase,
} from '@/lib/transactions';
import { Transaction } from '@/types/transaction';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { DEFAULT_CURRENCY } from '@/constants/Currency';
import { Motion } from '@/constants/theme';
import { DEFAULT_CATEGORY } from '@/lib/categories';
import {
  isGuestUpgradePromptSnoozed,
  shouldShowGuestUpgradePrompt,
  snoozeGuestUpgradePrompt,
} from '@/lib/guest-upgrade';
import {
  fetchAccounts as loadAccounts,
  getAccountTypeForPaymentMode,
  getAutoAccountPayloadForPaymentMode,
  getPreferredAccountForPaymentMode,
  normalizeAccountType,
  suggestAccountFromTransaction,
  saveAccount,
  type Account,
  type AccountSuggestionHint,
  type AccountType,
} from '@/lib/accounts';
import { saveNewTransaction, type TransactionSaveProgress } from '@/lib/transaction-composer';
import { haptics } from '@/lib/haptics';
import { formatTime } from '@/lib/datetime';
import { toAmountInputValue, toAmountString } from '@/lib/money';
import {
  isParseAnswer,
  looksLikeQuestion,
  ParseApiError,
  describeParseFailure,
  type ParseFailure,
  parseEntryDraft,
  type LedgerAnswer,
  type ParseResponse,
} from '@/lib/parse';
import {
  fetchSplitFriends,
  fetchSplitGroups,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import { resolveSplitDraft } from '@/lib/split-draft';
import { fetchDashboard, type DashboardResponse } from '@/lib/insights';
import {
  confirmSubscriptionOccurrence,
  fetchSubscriptionOccurrences,
  revertSubscriptionOccurrence,
  syncSubscriptionAutomation,
  type BillingInterval,
  type SubscriptionOccurrence,
} from '@/lib/subscriptions';
import { inferNextSubscriptionDate } from '@/lib/subscription-schedule';
import { notifyTransactionsChanged, subscribeTransactionsChanged } from '@/lib/transaction-events';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { creditGateFor } from '@/lib/credit-gate';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { updateAndroidMonthWidget } from '@/lib/android-widget';
import { clampDateToStatementCycle } from '@/lib/statement-composer';
import {
  TransactionFormModal,
  type AiReviewMetadata,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';

/**
 * The FAB floats above the scroll view, so anything that scrolls under it has
 * to stop short of its footprint. Its geometry is written here once and nowhere
 * else: the button reads these, and so do the list's bottom padding and the
 * save toast that has to clear it. Change FAB_SIZE and all three follow.
 */
const FAB_SIZE = 64;
const FAB_BOTTOM_OFFSET = 40;
const FAB_RIGHT_OFFSET = 24;
/** The button's full footprint, plus a gap of air so the last row breathes. */
const LIST_BOTTOM_PADDING = FAB_SIZE + FAB_BOTTOM_OFFSET + 24;
/**
 * The same gap of air, without the footprint — for the states where the FAB is
 * not on screen at all.
 *
 * Reserving the button's height when there is no button is 104px of nothing at
 * the bottom of the shortest Home there is, and on an empty or failed Home that
 * is the difference between content that fits and content that scrolls. It
 * matters more here than a stray gap normally would, because the capture card
 * above does not collapse at these lengths (see `MIN_ENTRIES_FOR_COLLAPSE`):
 * whatever scrolls up goes under an opaque block that will never move out of
 * the way again, so the empty-state panel slides behind the card and stays
 * there with the scroll already at its end.
 */
const EMPTY_BOTTOM_PADDING = 24;

/**
 * How many entries the feed needs before the capture card is allowed to
 * collapse into its pill.
 *
 * The collapse trades the card for space to read the feed in, and on an empty
 * or nearly-empty Home there is no feed to make room for — the trade is all
 * cost. Worse, it half-happened: the content was long enough to scroll a
 * little and nowhere near long enough to scroll the ~230px the collapse spans,
 * so the card stopped mid-crossfade and left a ghost pill at 50% opacity under
 * a band of dead space, with the scroll already at its end and no way to
 * finish. `minHeight` below keeps that from happening at any length; this
 * keeps the animation from running at all when it has nothing to buy.
 */
const MIN_ENTRIES_FOR_COLLAPSE = 3;
/** Just above the FAB, so the toast never lands on top of it. */
const SAVE_TOAST_BOTTOM_OFFSET = FAB_BOTTOM_OFFSET + FAB_SIZE + 8;

/** Roughly how long ScrollView's animated scrollTo takes to settle. */
const CAPTURE_EXPAND_MS = 260;

/**
 * How long a freshly saved row stays marked as new. Covers its entrance plus
 * the accent tint fading out, with enough slack that a slow frame cannot cut
 * the highlight off mid-fade.
 */
const NEW_ROW_HIGHLIGHT_MS = 1200;

/**
 * `RecordingPresets.HIGH_QUALITY` does not enable metering, so `getStatus()`
 * returned no `metering` at all and the recording rings had nothing to react
 * to — they were decorative because the level was never asked for. Spread into
 * a module-level constant rather than built inline: a fresh options object on
 * every render would rebuild the recorder underneath an in-progress recording.
 */
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

/**
 * How long the save toast holds once it has arrived. A reading time, not a
 * motion duration — there is no `Motion` token for it because it is not a
 * curve, and shortening it under reduced motion would make the confirmation
 * harder to read rather than calmer.
 */
const SAVE_TOAST_DWELL_MS = 2200;

/** Legacy `Animated` needs the curve as a plain function; see AnimatedBottomSheet. */
const TOAST_IN_EASING = Easing.bezier(...Motion.ease.standard);
const TOAST_OUT_EASING = Easing.bezier(...Motion.ease.exit);

const billingIntervals: BillingInterval[] = [
  'daily',
  'business_daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
];

const isBillingInterval = (value?: string | null): value is BillingInterval =>
  billingIntervals.includes(value as BillingInterval);

type CreditActionState = {
  title: string;
  message: string;
  actionLabel: string;
  action: 'upgrade' | 'login';
};

export default function HomeScreen() {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const isDark = themeTokens.mode === 'dark';
  const dialog = useAppDialog();
  const router = useRouter();
  const {
    captureFile,
    compose,
    composeKey,
    accountId: composeAccountId,
    start_date: composeStartDate,
    end_date: composeEndDate,
    statementId: composeStatementId,
  } = useLocalSearchParams<{
    captureFile?: string | string[];
    compose?: string;
    composeKey?: string;
    accountId?: string;
    start_date?: string;
    end_date?: string;
    statementId?: string;
  }>();
  const consumedCaptureFile = useRef<string | null>(null);
  const consumedStatementComposer = useRef<string | null>(null);
  const statementComposerReturnId = useRef<string | null>(null);
  /**
   * A recording handed over by the quick-capture tile or the widget, waiting to
   * be sent. It cannot be submitted in the same effect that receives it, because
   * `submitPrompt` reads the recording out of state and would still see the
   * previous value; the flag lets the send happen on the render after the URI
   * has actually landed.
   */
  const captureAwaitingSubmit = useRef(false);
  const { token, user } = useAuthStore();
  const smartSorting = useAppSettingsStore((state) => state.smartSorting);
  const isStealthMode = !!user?.stealth_mode;

  const defaultForm = useMemo<EntryForm>(
    () => ({
      title: '',
      amount: '',
      type: 'Expense',
      mode: 'Cash',
      // S2 left this behind: 'Food' is a legacy alias, and the amount-first
      // sheet shows the seeded category on a chip and saves it as the title.
      category: DEFAULT_CATEGORY,
      date: formatDateLabel(new Date()),
      time: formatTime(new Date()) ?? '',
      notes: '',
      tag: 'General',
      currency: DEFAULT_CURRENCY,
      accountId: null,
      account: '',
      merchant: '',
      attachment: null,
      splitEnabled: false,
      splitGroupId: null,
      splitGroupName: '',
      splitParticipants: [],
      refundableAmount: '',
      refundExpectedOn: '',
      refundReminderEnabled: true,
      emiTenureMonths: '',
      emiRatePct: '',
      subscriptionEnabled: false,
      subscriptionName: '',
      subscriptionMerchant: '',
      subscriptionCategory: '',
      subscriptionAmount: '',
      subscriptionBillingInterval: '',
      subscriptionNextDueDate: '',
      subscriptionReminderDays: '3',
      subscriptionCancelBeforeDue: false,
      subscriptionCancelOnDate: '',
      subscriptionAutopay: false,
      subscriptionNotes: '',
    }),
    []
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  // The parser's hints are kept instead of the suggestion they produce, so the
  // prompt is re-derived against the current accounts. Once the hinted account
  // exists — including one just created from the prompt itself — it stops asking.
  const [accountSuggestionHint, setAccountSuggestionHint] = useState<AccountSuggestionHint | null>(
    null
  );
  /**
   * The suggestion the user carried to the setup screen, with how many accounts
   * of that type existed when they left. It is the fallback for a setup saved
   * under a name the hint cannot recognise — "Salary" for an SBI hint — where
   * matching alone would keep asking for the account they just made.
   */
  const pendingSuggestionSetup = useRef<{ type: AccountType; count: number } | null>(null);
  const accountSuggestion = useMemo(
    () =>
      accountSuggestionHint ? suggestAccountFromTransaction(accountSuggestionHint, accounts) : null,
    [accountSuggestionHint, accounts]
  );
  useEffect(() => {
    const pending = pendingSuggestionSetup.current;
    if (!pending) return;
    const matching = accounts.filter(
      (account) => normalizeAccountType(account.type) === pending.type
    ).length;
    // Only a setup that actually added an account answers the prompt; backing
    // out of the screen leaves it standing.
    if (matching > pending.count) {
      pendingSuggestionSetup.current = null;
      setAccountSuggestionHint(null);
    }
  }, [accounts]);
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const createBlankForm = useCallback(
    (): EntryForm => ({
      ...defaultForm,
      accountId: null,
      account: '',
      merchant: '',
      notes: '',
    }),
    [defaultForm]
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(defaultForm);
  const [inputText, setInputText] = useState('');
  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /**
   * A failed capture, as something the user can act on rather than a red line.
   * It is separate from `errorMessage` because the two are different objects:
   * that one is a sentence about the screen (no microphone, entries would not
   * load), this one is a dead end in the middle of a task, and it comes with
   * the way out.
   */
  const [parseFailure, setParseFailure] = useState<ParseFailure | null>(null);
  const [isTextInputVisible, setIsTextInputVisible] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  /**
   * How many entries the account actually holds, which is not the same as how
   * many this screen drew. The feed is one page — 50 by the backend's default —
   * so the guest prompt was offering to save "50 transactions" to anyone with
   * more than that, and the count is the whole point of that sentence.
   */
  const [entryTotal, setEntryTotal] = useState(0);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [monthDashboard, setMonthDashboard] = useState<DashboardResponse | null>(null);
  const [isMonthLoading, setIsMonthLoading] = useState(true);
  // Measured, not assumed: the pinned block's two halves tell the feed how far
  // to pad itself, and the capture card's height changes with its state.
  const [pinnedTopHeight, setPinnedTopHeight] = useState(0);
  const [captureExpandedHeight, setCaptureExpandedHeight] = useState(0);
  // The scroll view's own height, so the content can be padded to guarantee
  // the collapse has somewhere to run. See `contentContainerStyle` below.
  const [viewportHeight, setViewportHeight] = useState(0);
  const keyboardInset = useKeyboardInset();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Re-tapping the Home tab returns the feed to the top. The reanimated ref
  // holds the same ScrollView instance react-navigation's helper looks for.
  useScrollToTop(scrollRef as unknown as React.RefObject<Animated.ScrollView>);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewMetadata | null>(null);
  /**
   * The sheet is open on an empty draft while the parse is in flight. Two to
   * four seconds against the screen the user was already looking at is a wait;
   * the same seconds inside the sheet the answer will appear in is progress.
   */
  const [isParsing, setIsParsing] = useState(false);
  /**
   * The other direction of the capture field: the answer to a question about
   * money already recorded. It lives on Home rather than in a sheet because it
   * is a reply, not a form — there is nothing to confirm and nothing to save.
   */
  const [answer, setAnswer] = useState<LedgerAnswer | null>(null);
  const [answerSourceText, setAnswerSourceText] = useState('');
  /**
   * Set while a question is in flight, so the wait has somewhere to happen that
   * is not the draft sheet. Only ever set for typed text that reads as a
   * question; a capture never sees it.
   */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  /**
   * The row that was just written, so the feed can say which one is new. Cleared
   * on a timer rather than left set, or the highlight would come back every time
   * the list re-rendered for an unrelated reason.
   */
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [creditAction, setCreditAction] = useState<CreditActionState | null>(null);
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiInputSource, setAiInputSource] = useState<'text' | 'voice'>('text');
  const [autopayReviews, setAutopayReviews] = useState<SubscriptionOccurrence[]>([]);
  const [isGuestUpgradeSnoozed, setIsGuestUpgradeSnoozed] = useState(true);
  const createSaveProgress = useRef<TransactionSaveProgress>({});
  const createIdempotencyKey = useRef<string | null>(null);
  /**
   * The text of the last capture attempt, so "Try again" can re-send it.
   * Null means the attempt was a recording — that one is re-sent from
   * `recordedUri` instead, and both are cleared only on success.
   */
  const lastPromptText = useRef<string | null>(null);
  const resumeDraftAfterAccounts = useRef(false);
  const saveConfirmationAnim = useRef(new RNAnimated.Value(0)).current;
  const motion = useMotion();

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<
    import('@/components/home/QuickPrompts').QuickPrompt | null
  >(null);
  const [modalMode, setModalMode] = useState<'audio' | 'manual' | 'quick-prompt'>('manual');
  const dailyCreditLimit = billingStatus?.credits.daily_limit ?? 0;
  const dailyCreditsRemaining = billingStatus?.credits.daily_credits_remaining ?? 0;
  const shouldShowLowCreditNotice =
    dailyCreditLimit > 0 && dailyCreditsRemaining / dailyCreditLimit < 0.2;

  /**
   * Stops a capture that cannot be paid for, at the moment it is asked for
   * rather than after the clip exists. Returns true when it has taken over,
   * so callers can bail. The decision itself lives in `creditGateFor`.
   */
  const blockCaptureWithoutCredits = useCallback(() => {
    const gate = creditGateFor(billingStatus, { isGuest: !!user?.is_guest });
    if (!gate) return false;
    setCreditAction(gate);
    return true;
  }, [billingStatus, user?.is_guest]);

  const handleQuickPromptSelect = useCallback(
    (prompt: import('@/components/home/QuickPrompts').QuickPrompt) => {
      const blank = createBlankForm();
      const now = new Date();
      setAiReview(null);
      setForm({
        ...blank,
        title: prompt.title,
        amount: toAmountInputValue(prompt.amount),
        date: formatDateLabel(now),
        time: formatTime(now) ?? '',
        mode: prompt.mode,
        category: prompt.category,
      });
      setModalMode('manual');
      setIsEditOpen(true);
    },
    [createBlankForm]
  );

  const handleAddPrompt = useCallback(() => {
    setEditingPrompt(null);
    setIsPromptModalOpen(true);
  }, []);

  const handleLongPressPrompt = useCallback(
    (prompt: import('@/components/home/QuickPrompts').QuickPrompt) => {
      setEditingPrompt(prompt);
      setIsPromptModalOpen(true);
    },
    []
  );

  const handleSavePrompt = async (
    formData: import('@/components/transactions/TransactionFormModal').EntryForm
  ) => {
    const id = editingPrompt?.id;
    const url = id ? `${API_BASE_URL}/v1/quick-prompts/${id}` : `${API_BASE_URL}/v1/quick-prompts`;
    const method = id ? 'PUT' : 'POST';

    const getIconForCategory = (cat: string) => {
      switch (cat.toLowerCase()) {
        case 'food & drinks':
          return 'coffee-outline';
        case 'travel':
          return 'train';
        case 'transport':
          return 'gas-station-outline';
        case 'shopping':
          return 'cart-outline';
        case 'bills':
          return 'file-document-outline';
        default:
          return 'lightning-bolt';
      }
    };

    const payload = {
      title: formData.title,
      amount: parseFloat(formData.amount),
      mode: formData.mode,
      category: formData.category,
      icon: getIconForCategory(formData.category),
    };

    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      setIsPromptModalOpen(false);
      // We need to trigger a re-fetch in the QuickPrompts component.
      // In a real app we might use a global store or a key to force re-render.
      // For now, let's just use a simple key state.
      setQuickPromptKey((prev) => prev + 1);
    } else {
      throw new Error('Failed to save prompt');
    }
  };

  const handleDeletePrompt = async () => {
    if (!editingPrompt) return;
    const id = editingPrompt.id;
    const resp = await fetch(`${API_BASE_URL}/v1/quick-prompts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.ok) {
      setIsPromptModalOpen(false);
      setQuickPromptKey((prev) => prev + 1);
    } else {
      throw new Error('Failed to delete prompt');
    }
  };

  const [quickPromptKey, setQuickPromptKey] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [accountSetupNudge, setAccountSetupNudge] = useState<AppNotification | null>(null);

  const getInitialPromptData = (): Partial<
    import('@/components/transactions/TransactionFormModal').EntryForm
  > => {
    if (!editingPrompt)
      return {
        category: 'Food & Drinks',
        mode: 'Cash',
        type: 'Expense',
        date: formatDateLabel(new Date()),
      };
    return {
      title: editingPrompt.title,
      amount: editingPrompt.amount.toString(),
      mode: editingPrompt.mode,
      category: editingPrompt.category,
      type: 'Expense',
      date: formatDateLabel(new Date()),
    };
  };

  const fetchEntries = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setIsEntriesLoading(true);
      setEntriesError(null);
      try {
        const { transactions: page, total } = await loadTransactionPage(token);
        const mapped = [...page].sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
        setTransactions(mapped);
        setEntryTotal(total);
      } catch (error) {
        setEntriesError(getFriendlyErrorMessage(error, 'Unable to load entries right now.'));
      } finally {
        if (!silent) setIsEntriesLoading(false);
      }
    },
    [token]
  );

  /**
   * The month strip's figures. No dates: the dashboard's own default range is
   * the 1st to today, which is also what the Insights tab opens on, so the
   * strip and the screen it taps through to describe the same period without
   * either having to agree on a date locally.
   *
   * Failures are swallowed. This is a secondary widget on the primary screen —
   * it renders nothing rather than putting an error where money should be.
   */
  const fetchMonthSummary = useCallback(
    async (silent = false) => {
      if (!token) {
        setMonthDashboard(null);
        setIsMonthLoading(false);
        return;
      }
      if (!silent) setIsMonthLoading(true);
      try {
        const dashboard = await fetchDashboard(token);
        setMonthDashboard(dashboard);
        updateAndroidMonthWidget(dashboard.summary.total_spent, dashboard.period.start);
      } catch {
        setMonthDashboard(null);
      } finally {
        setIsMonthLoading(false);
      }
    },
    [token]
  );

  const fetchAccountOptions = useCallback(async () => {
    if (!token) {
      setAccounts([]);
      return;
    }
    try {
      setAccounts(await loadAccounts(token));
    } catch {
      setAccounts([]);
    }
  }, [token]);

  const fetchSplitOptions = useCallback(async () => {
    if (!token) {
      setSplitFriends([]);
      setSplitGroups([]);
      return;
    }
    try {
      const [friends, groups] = await Promise.all([
        fetchSplitFriends(token),
        fetchSplitGroups(token),
      ]);
      setSplitFriends(friends);
      setSplitGroups(groups);
    } catch {
      setSplitFriends([]);
      setSplitGroups([]);
    }
  }, [token]);

  const fetchCredits = useCallback(
    async (silent = false) => {
      if (!token) {
        setBillingStatus(null);
        return;
      }
      if (!silent) setIsBillingLoading(true);
      try {
        setBillingStatus(await fetchBillingStatus(token));
      } catch {
        setBillingStatus(null);
      } finally {
        if (!silent) setIsBillingLoading(false);
      }
    },
    [token]
  );

  const fetchNotificationCount = useCallback(async () => {
    const count = await fetchUnreadNotificationCount(token);
    setUnreadNotifications(count);
  }, [token]);

  const showNewBudgetAlert = useCallback(
    async (previousBudgetNotificationIds: Set<number>) => {
      if (!token) return;
      try {
        const notification = await fetchNewUnreadBudgetNotification(
          token,
          previousBudgetNotificationIds
        );
        if (!notification) return;
        if (
          await dialog.confirm({
            title: notification.title,
            message: notification.body,
            confirmLabel: 'View Budgets',
            cancelLabel: 'Later',
            iconName: 'wallet-outline',
          })
        ) {
          router.push('/budgets');
        }
        await fetchNotificationCount();
      } catch {
        // Budget alerts are also available in Notifications if the inline alert cannot load.
      }
    },
    [dialog, fetchNotificationCount, router, token]
  );

  useFocusEffect(
    useCallback(() => {
      if (resumeDraftAfterAccounts.current) {
        resumeDraftAfterAccounts.current = false;
        setIsEditOpen(true);
      }
      void fetchEntries();
      void fetchMonthSummary();
      void fetchAccountOptions();
      void fetchSplitOptions();
      void fetchCredits();
      void fetchNotificationCount();
      void isGuestUpgradePromptSnoozed().then(setIsGuestUpgradeSnoozed);
      if (token) {
        void syncSubscriptionAutomation(token)
          .then(() => fetchSubscriptionOccurrences(token))
          .then(setAutopayReviews)
          .catch(() => undefined);
      }
    }, [
      fetchAccountOptions,
      fetchCredits,
      fetchEntries,
      fetchMonthSummary,
      fetchNotificationCount,
      fetchSplitOptions,
      token,
    ])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        void fetchEntries(true);
        // Saving an expense has to move the number at the top of the screen.
        // A strip that still reads yesterday's total after a save is worse
        // than no strip at all.
        void fetchMonthSummary(true);
      }),
    [fetchEntries, fetchMonthSummary]
  );

  // This is deliberately a cold-start check, not a focus check. The server
  // notification is durable; the local snooze makes it quiet between launches.
  useEffect(() => {
    let active = true;
    if (!token) {
      setAccountSetupNudge(null);
      return;
    }
    void isAccountSetupNudgeSnoozed().then(async (snoozed) => {
      if (snoozed || !active) return;
      const payload = await fetchNotifications(token, 'unread').catch(() => null);
      if (!active || !payload) return;
      setAccountSetupNudge(
        payload.notifications.find((notification) => notification.type === 'account.needs_setup') ??
          null
      );
    });
    return () => {
      active = false;
    };
  }, [token]);

  const sections = useMemo(() => groupTransactionsBySection(transactions), [transactions]);
  const hasTransactions = sections.length > 0;

  /**
   * The guest upgrade ask. It waits for entries because an account is only worth
   * creating once there is something in it to lose — the whole point of letting
   * people in without one.
   */
  const showGuestUpgradePrompt = shouldShowGuestUpgradePrompt({
    isGuest: !!user?.is_guest,
    entryCount: Math.max(entryTotal, transactions.length),
    isSnoozed: isGuestUpgradeSnoozed,
  });

  const ensureMicPermission = useCallback(async () => {
    const currentPermission = await getRecordingPermissionsAsync();
    if (currentPermission.status === 'granted') {
      return true;
    }
    const permission = await requestRecordingPermissionsAsync();
    return permission.status === 'granted';
  }, []);

  const startRecording = useCallback(async () => {
    const hasPermission = await ensureMicPermission();
    if (!hasPermission) {
      setErrorMessage('Microphone permission is required to record audio.');
      return;
    }
    try {
      setErrorMessage(null);
      setParseFailure(null);
      setRecordedUri(null);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      haptics.captureStart();
    } catch {
      setErrorMessage('Unable to start recording. Please try again.');
      setIsRecording(false);
    }
  }, [audioRecorder, ensureMicPermission]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      await audioRecorder.stop();
      setRecordedUri(audioRecorder.uri);
      haptics.captureStop();
    } catch {
      setErrorMessage('Unable to stop recording. Please try again.');
    } finally {
      setIsRecording(false);
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Ignore
      }
    }
  }, [audioRecorder, isRecording]);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      return;
    }
    // Checked before the microphone opens, not after the clip exists.
    if (blockCaptureWithoutCredits()) return;
    await startRecording();
  }, [blockCaptureWithoutCredits, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    const uri = Array.isArray(captureFile) ? captureFile[0] : captureFile;
    if (!uri || consumedCaptureFile.current === uri) return;
    consumedCaptureFile.current = uri;
    setErrorMessage(null);
    setParseFailure(null);
    setRecordedUri(uri);
    captureAwaitingSubmit.current = true;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.setParams({ captureFile: '' });
  }, [captureFile, router, scrollRef]);

  /**
   * Tapping the collapsed pill puts the card back and the cursor in it.
   *
   * The card's size is a pure function of scroll offset, so "expand" means
   * scrolling back to the top — there is no second source of truth to keep in
   * step, and a user who then scrolls down again simply collapses it as usual.
   */
  const handleExpandCapture = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    // Focus after the scroll has run, not with it. Opening the text field flips
    // `isCaptureLocked`, which takes the card out of the scroll interpolation
    // and pins it open — do that immediately and the card snaps to full height
    // while the feed is still gliding. Letting the scroll finish first means
    // the expansion is the animation, and the lock only takes over once the
    // card is already where it belongs.
    setTimeout(() => setIsTextInputVisible(true), CAPTURE_EXPAND_MS);
  }, [scrollRef]);

  /** Recording from the pill brings the card back with it, same as expanding. */
  const handlePillMicPress = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    void handleToggleRecording();
  }, [handleToggleRecording, scrollRef]);

  /**
   * Capture stays open while there is something to lose by closing it — mid
   * recording, mid parse, with a finished clip, or with typed text in the
   * field. Collapsing then would scroll away the Process and Clear buttons the
   * user is reaching for.
   *
   * An *empty* text field deliberately does not lock. It did at first, and that
   * made the pill a one-way door: tapping it opened the field, and the card
   * could never collapse again for the rest of the session unless the user
   * found the "I Prefer To Write" toggle. Nothing is lost by collapsing an
   * empty field — it is still open when the card comes back.
   */
  const isCaptureLocked =
    isRecording || isSubmitting || !!recordedUri || inputText.trim().length > 0;

  /** Whether the collapse is worth running at all — see the constant. */
  const isCaptureCollapsible = transactions.length >= MIN_ENTRIES_FOR_COLLAPSE;

  useEffect(() => {
    if (!saveConfirmation) return undefined;
    saveConfirmationAnim.stopAnimation();
    saveConfirmationAnim.setValue(0);
    const animation = RNAnimated.sequence([
      RNAnimated.timing(saveConfirmationAnim, {
        toValue: 1,
        duration: motion.duration('base'),
        easing: TOAST_IN_EASING,
        useNativeDriver: true,
      }),
      RNAnimated.delay(SAVE_TOAST_DWELL_MS),
      RNAnimated.timing(saveConfirmationAnim, {
        toValue: 0,
        duration: motion.exitDuration('base'),
        easing: TOAST_OUT_EASING,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        setSaveConfirmation(null);
      }
    });
    return () => animation.stop();
  }, [motion, saveConfirmation, saveConfirmationAnim]);

  /**
   * The new-row highlight is a one-shot. Holding the id would re-run the
   * entrance every time the feed re-rendered — on a refetch, a theme change, a
   * tab return — and a row that keeps announcing itself stops meaning anything.
   */
  useEffect(() => {
    if (!newTransactionId) return undefined;
    const timeout = setTimeout(() => setNewTransactionId(null), NEW_ROW_HIGHLIGHT_MS);
    return () => clearTimeout(timeout);
  }, [newTransactionId]);

  const handleClearRecording = useCallback(() => {
    setRecordedUri(null);
    setInputText('');
    setErrorMessage(null);
    setParseFailure(null);
    setCreditAction(null);
    lastPromptText.current = null;
  }, []);

  const handleOpenManualEntry = useCallback(() => {
    setAiReview(null);
    setAiSourceText('');
    setAiInputSource('text');
    pendingSuggestionSetup.current = null;
    setAccountSuggestionHint(null);
    createIdempotencyKey.current = null;
    createSaveProgress.current = {};
    setForm(createBlankForm());
    setModalMode('manual');
    setIsEditOpen(true);
  }, [createBlankForm]);

  useEffect(() => {
    if (
      compose !== '1' ||
      !composeKey ||
      consumedStatementComposer.current === composeKey ||
      !token ||
      !composeAccountId ||
      !composeStartDate ||
      !composeEndDate ||
      !composeStatementId
    ) {
      return;
    }

    consumedStatementComposer.current = composeKey;
    let active = true;
    void loadAccounts(token)
      .then((loadedAccounts) => {
        if (!active) return;
        const accountID = Number(composeAccountId);
        const selected = loadedAccounts.find((account) => account.id === accountID);
        if (!selected) {
          throw new Error('The statement card is no longer available.');
        }
        const today = formatApiDate(new Date());
        const clamped = clampDateToStatementCycle(today, composeStartDate, composeEndDate);
        const parsedDate = parseDateLabel(clamped);

        setAccounts(loadedAccounts);
        setAiReview(null);
        setAiSourceText('');
        setAiInputSource('text');
        pendingSuggestionSetup.current = null;
        setAccountSuggestionHint(null);
        createIdempotencyKey.current = null;
        createSaveProgress.current = {};
        setForm({
          ...createBlankForm(),
          mode: 'Credit Card',
          accountId: selected.id,
          account: selected.name,
          date: parsedDate ? formatDateLabel(parsedDate) : clamped,
        });
        setModalMode('manual');
        statementComposerReturnId.current = composeStatementId;
        setIsEditOpen(true);
      })
      .catch((error) => {
        if (!active) return;
        void dialog.alert({
          title: 'Statement not available',
          message: getFriendlyErrorMessage(error, 'Unable to open the transaction form.'),
          tone: 'danger',
        });
      });

    return () => {
      active = false;
    };
  }, [
    compose,
    composeAccountId,
    composeEndDate,
    composeKey,
    composeStartDate,
    composeStatementId,
    createBlankForm,
    dialog,
    token,
  ]);

  const ensureAccountForEntry = useCallback(
    async (formData: EntryForm) => {
      const requiredType = getAccountTypeForPaymentMode(formData.mode);
      const selectedAccount =
        formData.accountId === null
          ? null
          : (accounts.find((account) => account.id === formData.accountId) ?? null);
      if (
        selectedAccount &&
        (!requiredType || selectedAccount.type?.toLowerCase() === requiredType)
      ) {
        return selectedAccount;
      }

      const preferredAccount = getPreferredAccountForPaymentMode(accounts, formData.mode);
      if (preferredAccount) {
        return preferredAccount;
      }

      return null;
    },
    [accounts]
  );

  const handleConfirmEntry = useCallback(
    async (formData: EntryForm) => {
      try {
        const resolvedAccount = await ensureAccountForEntry(formData);
        if (!createIdempotencyKey.current) {
          createIdempotencyKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        if (!token) {
          throw new Error('Please sign in again before saving this transaction.');
        }
        const budgetNotificationIds =
          formData.type === 'Expense' && token
            ? await fetchUnreadBudgetNotificationIds(token).catch(() => new Set<number>())
            : new Set<number>();

        const { entry: createdEntry, convertedToEMI } = await saveNewTransaction({
          token,
          form: formData,
          account: resolvedAccount,
          idempotencyKey: createIdempotencyKey.current,
          source: modalMode === 'audio' ? aiInputSource : 'manual',
          sourceText: modalMode === 'audio' ? aiSourceText : '',
          progress: createSaveProgress.current,
        });
        if (convertedToEMI) {
          setTransactions((current) =>
            current.filter((transaction) => transaction.id !== String(createdEntry.id))
          );
          setSaveConfirmation('EMI plan created');
          setNewTransactionId(null);
        } else {
          const createdTransaction = mapEntryToTransaction(createdEntry);
          setTransactions((current) => [
            createdTransaction,
            ...current.filter((transaction) => transaction.id !== createdTransaction.id),
          ]);
          setSaveConfirmation(formData.subscriptionEnabled ? 'Saved with subscription' : 'Saved');
          setNewTransactionId(createdTransaction.id);
        }

        createIdempotencyKey.current = null;
        createSaveProgress.current = {};
        setForm(createBlankForm());
        setAiSourceText('');
        pendingSuggestionSetup.current = null;
        setAccountSuggestionHint(null);
        setIsEditOpen(false);
        notifyTransactionsChanged();
        if (formData.type === 'Expense' && !convertedToEMI) {
          void showNewBudgetAlert(budgetNotificationIds);
        }
        void fetchSplitOptions();
        if (statementComposerReturnId.current) {
          statementComposerReturnId.current = null;
          router.back();
        }
      } catch (error) {
        const saveError =
          error instanceof Error
            ? error
            : new Error('Unable to save your entry. Please try again.');
        throw saveError;
      }
    },
    [
      aiInputSource,
      aiSourceText,
      createBlankForm,
      ensureAccountForEntry,
      fetchSplitOptions,
      modalMode,
      router,
      showNewBudgetAlert,
      token,
    ]
  );

  const submitPrompt = useCallback(
    async (overrideText?: string) => {
      if (isSubmitting) return;
      const trimmed = (overrideText ?? inputText).trim();
      // A re-asked suggestion is text, so any pending recording is not part of it.
      const audioUri = overrideText ? null : recordedUri;
      if (!trimmed && !audioUri) {
        setErrorMessage('Please type or record your expense first.');
        return;
      }
      // The same gate as the microphone, for the typed and quick-prompt paths
      // that never touch it.
      if (blockCaptureWithoutCredits()) return;
      setIsSubmitting(true);
      setErrorMessage(null);
      setParseFailure(null);
      setCreditAction(null);
      setAnswer(null);
      lastPromptText.current = overrideText ? trimmed : null;
      // Typed text that reads as a question waits behind an inline indicator
      // instead of the draft sheet. The server still decides what it was — this
      // only decides where the wait is shown.
      const deferSheet = Boolean(trimmed) && !audioUri && looksLikeQuestion(trimmed);
      setPendingQuestion(deferSheet ? trimmed : null);
      // The phrase is known before the request goes out, so the sheet can show it
      // from the first frame — during the wait it is the only thing on screen
      // saying *which* capture is being read. The rest of the review metadata
      // arrives with the parse.
      setAiSourceText(trimmed);
      setAiInputSource(audioUri ? 'voice' : 'text');
      setAiReview({
        sourceText: trimmed,
        inputSource: audioUri ? 'voice' : 'text',
      });
      setIsParsing(true);
      setModalMode('audio');
      if (!deferSheet) {
        setIsEditOpen(true);
      }
      try {
        let audio:
          | {
              file: File;
              name: string;
            }
          | undefined;
        if (trimmed) {
          audio = undefined;
        } else if (audioUri) {
          const extension = audioUri.split('.').pop();
          const fileName = `recording.${extension ?? 'm4a'}`;
          audio = {
            file: new File(audioUri),
            name: fileName,
          };
        }
        const result = await parseEntryDraft({ token, hintText: trimmed, audio });
        void fetchCredits(true);
        createIdempotencyKey.current = null;
        createSaveProgress.current = {};

        // The question direction. An answer is not a transaction and must never
        // reach the form — the sheet goes back down and the card takes the feed's
        // first slot instead.
        if (isParseAnswer(result)) {
          setIsEditOpen(false);
          setAiReview(null);
          pendingSuggestionSetup.current = null;
          setAccountSuggestionHint(null);
          setPendingQuestion(null);
          setAnswerSourceText(result.source_text ?? trimmed);
          setAnswer(result.answer);
          setInputText('');
          setRecordedUri(null);
          haptics.saved();
          return;
        }

        const data: ParseResponse = result;
        // A capture that was mistaken for a question needs the sheet it did not
        // get; opening it here costs one frame rather than a wrong destination.
        setPendingQuestion(null);
        if (deferSheet) {
          setIsEditOpen(true);
        }
        setAiSourceText(data.source_text ?? trimmed);
        setAiInputSource(audioUri ? 'voice' : 'text');
        pendingSuggestionSetup.current = null;
        setAccountSuggestionHint({
          mode: data.mode,
          accountHint: data.account_hint,
          cardNetwork: data.card_network,
        });
        const splitDraft = resolveSplitDraft(data, splitFriends, splitGroups);
        setAiReview({
          confidence: data.confidence,
          needsConfirmation: data.needs_confirmation,
          missingFields: smartSorting
            ? data.missing_fields
            : Array.from(
                new Set([...(data.missing_fields ?? []), 'title', 'mode', 'category', 'tag'])
              ),
          clarifications: [
            ...(data.clarifications ?? []),
            ...(splitDraft.splitDefaultWarning ? [splitDraft.splitDefaultWarning] : []),
          ],
          smartSortingDisabled: !smartSorting,
          // What the AI worked from, so the review sheet can show it back. A
          // wrong field is usually a misheard word, and the phrase is the only
          // place that is visible.
          sourceText: data.source_text ?? trimmed,
          inputSource: audioUri ? 'voice' : 'text',
        });
        setForm((prev) => {
          const missing = new Set(data.missing_fields ?? []);
          const formattedDate =
            missing.has('date') || !data.date
              ? formatDateLabel(new Date())
              : normalizeDateLabel(data.date, formatDateLabel(new Date()));
          const tagValue = data.tag ?? data.tags?.[0] ?? '';
          const newType = missing.has('type') ? '' : (toTitleCase(data.type) ?? '');
          const subscriptionCandidate = data.subscription_candidate;
          const subscriptionInterval = isBillingInterval(subscriptionCandidate?.billing_interval)
            ? subscriptionCandidate.billing_interval
            : '';
          const subscriptionPaidDate =
            subscriptionCandidate?.last_charged_date ?? data.date ?? formatApiDate(new Date());
          const inferredNextDueDate =
            subscriptionCandidate?.next_due_date ??
            inferNextSubscriptionDate(subscriptionPaidDate, subscriptionInterval);
          return {
            ...prev,
            title: smartSorting && !missing.has('title') ? (data.title ?? '') : '',
            amount:
              missing.has('amount') || data.amount == null ? '' : toAmountInputValue(data.amount),
            currency: data.currency ?? prev.currency,
            // The parser emits `HH:MM`; the form shows and stores a display string.
            time: formatTime(data.time) ?? prev.time,
            type: newType,
            mode: smartSorting && !missing.has('mode') ? (data.mode ?? '') : '',
            category: smartSorting && !missing.has('category') ? (data.category ?? 'Misc') : 'Misc',
            merchant: data.merchant ?? '',
            notes: data.note ?? '',
            date: formattedDate,
            tag: smartSorting && tagValue ? (toTitleCase(tagValue) ?? '') : '',
            splitEnabled: splitDraft.splitEnabled,
            splitGroupId: splitDraft.splitGroupId,
            splitGroupName: splitDraft.splitGroupName,
            splitParticipants: splitDraft.splitParticipants,
            refundableAmount:
              data.refundable_amount != null ? toAmountInputValue(data.refundable_amount) : '',
            refundExpectedOn: data.refund_expected_on ?? '',
            refundReminderEnabled: true,
            emiTenureMonths: data.emi_tenure_months != null ? String(data.emi_tenure_months) : '',
            emiRatePct: data.emi_rate_pct != null ? String(data.emi_rate_pct) : '',
            subscriptionEnabled: Boolean(subscriptionCandidate),
            subscriptionName: subscriptionCandidate?.name ?? data.merchant ?? data.title ?? '',
            subscriptionMerchant: subscriptionCandidate?.merchant ?? data.merchant ?? '',
            subscriptionCategory: subscriptionCandidate?.category ?? data.category ?? 'Misc',
            subscriptionAmount:
              subscriptionCandidate?.amount != null
                ? toAmountInputValue(subscriptionCandidate.amount)
                : data.amount != null
                  ? toAmountInputValue(data.amount)
                  : '',
            subscriptionBillingInterval: subscriptionInterval,
            subscriptionNextDueDate: inferredNextDueDate,
            subscriptionReminderDays:
              subscriptionCandidate?.reminder_days != null
                ? String(subscriptionCandidate.reminder_days)
                : '3',
            subscriptionCancelBeforeDue: Boolean(subscriptionCandidate?.cancel_before_due),
            subscriptionCancelOnDate: subscriptionCandidate?.cancel_on_date ?? '',
            subscriptionAutopay: Boolean(subscriptionCandidate?.autopay),
            subscriptionNotes: subscriptionCandidate?.notes ?? '',
          };
        });
        setInputText('');
        setRecordedUri(null);
      } catch (error) {
        // The sheet came up before the request went out, so a failure has to take
        // it back down — the credit card and the error banner both live on Home,
        // behind it.
        setIsEditOpen(false);
        setPendingQuestion(null);
        if (error instanceof ParseApiError) {
          /*
           * A guest running out of credits is the one moment they have a reason
           * to make an account, so the prompt says what signing in buys rather
           * than just reporting the balance — and it points at sign-in, not at a
           * plans screen a guest cannot buy from anyway.
           */
          const isGuestUser = !!user?.is_guest;
          if (error.code === 'insufficient_ai_credits') {
            setCreditAction({
              title: isGuestUser ? 'You have used up your guest AI credits' : 'AI credits are low',
              message: isGuestUser
                ? `Dear guest, this capture needs ${error.requiredCredits ?? 5} credits and you have ${error.availableCredits ?? 0} left. Sign in to keep going with more AI credits — everything you have added so far comes with you.`
                : `This capture needs ${error.requiredCredits ?? 5} credits. You have ${error.availableCredits ?? 0} available.`,
              actionLabel: isGuestUser ? 'Sign in for more credits' : 'View plans',
              action: isGuestUser ? 'login' : 'upgrade',
            });
            void fetchCredits(true);
            return;
          }
          if (error.code === 'daily_ai_limit_reached') {
            const usedToday = error.usedToday ?? billingStatus?.credits.daily_credits_used ?? 0;
            const dailyLimit = error.dailyLimit ?? billingStatus?.credits.daily_limit ?? 0;
            setCreditAction({
              title: isGuestUser
                ? 'You have reached your guest AI limit'
                : 'Daily AI limit reached',
              message: isGuestUser
                ? `Dear guest, you have used all ${dailyLimit} AI credits for today. Sign in to continue enjoying more AI credits — everything you have added so far comes with you.`
                : `You used ${usedToday} of ${dailyLimit} credits today.`,
              actionLabel: isGuestUser ? 'Sign in for more credits' : 'View plans',
              action: isGuestUser ? 'login' : 'upgrade',
            });
            void fetchCredits(true);
            return;
          }
        }
        setParseFailure(describeParseFailure(error));
      } finally {
        setIsParsing(false);
        setIsSubmitting(false);
      }
    },
    [
      billingStatus?.credits.daily_credits_used,
      billingStatus?.credits.daily_limit,
      blockCaptureWithoutCredits,
      fetchCredits,
      inputText,
      isSubmitting,
      recordedUri,
      smartSorting,
      splitFriends,
      splitGroups,
      token,
      user?.is_guest,
    ]
  );

  /**
   * Send a handed-over recording without waiting to be asked.
   *
   * The button that produces it says **Stop and review**, and until this existed
   * it stopped and showed nothing: the audio arrived, attached itself to the
   * capture card, and sat there. Someone who spoke a transaction into the widget
   * got dropped on Home with no sign anything had happened, which reads as the
   * feature being broken rather than waiting.
   *
   * In-app recording is deliberately left alone — there the user is already
   * looking at the card and holding the send control, so submitting for them
   * would take the decision away at the one moment they can see it.
   */
  useEffect(() => {
    if (!captureAwaitingSubmit.current || !recordedUri) return;
    captureAwaitingSubmit.current = false;
    void submitPrompt();
  }, [recordedUri, submitPrompt]);

  const handleSubmitPrompt = useCallback(() => submitPrompt(), [submitPrompt]);

  /**
   * Re-send exactly what failed. A quick prompt never reached the input field,
   * so it is replayed from the ref; a typed sentence and a recording are both
   * still where they were left, and `submitPrompt` picks whichever is there.
   */
  const handleRetryPrompt = useCallback(() => {
    void submitPrompt(lastPromptText.current ?? undefined);
  }, [submitPrompt]);

  /**
   * An example lands in the field rather than being sent. Someone whose
   * sentence was just rejected should get to read the replacement — and edit
   * the amount to their own — before it costs another credit.
   */
  const handleUseExample = useCallback((example: string) => {
    setParseFailure(null);
    setRecordedUri(null);
    setInputText(example);
    setIsTextInputVisible(true);
  }, []);

  const handleAddManuallyAfterFailure = useCallback(() => {
    setParseFailure(null);
    handleOpenManualEntry();
  }, [handleOpenManualEntry]);

  const renderRecentActivity = () => {
    if (isEntriesLoading) {
      return (
        <SkeletonFrame label="Loading activity" testID="home-activity-skeleton">
          <SkeletonRows count={4} />
        </SkeletonFrame>
      );
    }

    if (entriesError) {
      return (
        <StateView
          icon="wifi-off"
          title="Activity did not load"
          message={entriesError}
          actionLabel="Try again"
          onAction={() => {
            // Retry everything the outage took down, not just the feed. The
            // month strip hides itself on failure rather than showing an
            // error, so without this it would stay missing until the next
            // time the screen regained focus.
            void fetchEntries();
            void fetchMonthSummary();
          }}
        />
      );
    }

    if (!hasTransactions) {
      return (
        <StateView
          icon="receipt-text-plus-outline"
          title="No activity yet"
          message="Record, type, or add your first transaction to start building your money story."
          actionLabel="Add"
          onAction={handleOpenManualEntry}
        />
      );
    }

    const recentTransactions = transactions.slice(0, 5);
    const groupedRecentTransactions = groupTransactionsBySection(recentTransactions);
    // The stagger counts down the feed rather than restarting at every date
    // heading — see the same note on the full list in app/transactions/index.tsx.
    let rowsAbove = 0;

    return (
      <View>
        <SectionHeader
          title="Recent Activity"
          actionLabel="See All"
          onAction={() => router.push('/transactions')}
        />

        <View className="px-6">
          {groupedRecentTransactions.map((group, groupIndex) => {
            const groupOffset = rowsAbove;
            rowsAbove += group.data.length;

            return (
              // Changing the month rewrites the feed under whatever survives it.
              <Animated.View key={group.title} layout={motion.reflow()}>
                <Card
                  compact
                  style={{
                    overflow: 'hidden',
                    padding: 0,
                    marginBottom:
                      groupIndex === groupedRecentTransactions.length - 1
                        ? 0
                        : themeTokens.spacing.md,
                  }}>
                  <View
                    style={{
                      paddingHorizontal: themeTokens.spacing.lg,
                      paddingTop: themeTokens.spacing.md,
                      paddingBottom: themeTokens.spacing.xs,
                    }}>
                    <ThemedText
                      variant="micro"
                      style={{
                        color: isDark ? 'rgba(255,255,255,0.5)' : '#9A9697',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}>
                      {group.title}
                    </ThemedText>
                  </View>
                  {group.data.map((item, index) => {
                    const isLastInSection = index === group.data.length - 1;
                    return (
                      <TransactionItem
                        key={item.id}
                        title={item.name}
                        icon={item.icon}
                        category={item.category}
                        subtitle={item.accountName ?? item.mode ?? ''}
                        amount={Math.abs(item.amount)}
                        maskAmount={isStealthMode}
                        date={item.timeLabel ?? item.dateLabel ?? ''}
                        color={item.color}
                        bgColor={item.bgColor}
                        isIncome={item.entryType === 'income'}
                        unlinked={item.accountId == null}
                        variant="list"
                        isNew={item.id === newTransactionId}
                        entranceIndex={groupOffset + index}
                        showDivider={!isLastInSection}
                        onPress={(origin) => {
                          router.push({
                            pathname: '/entry/[id]',
                            params: {
                              id: item.id,
                              name: item.name,
                              category: item.category,
                              amount: toAmountString(Math.abs(item.amount)),
                              entryType: item.entryType ?? 'expense',
                              section: item.section,
                              mode: item.mode ?? '',
                              notes: item.notes ?? '',
                              merchant: item.merchant ?? '',
                              dateLabel: item.dateLabel ?? '',
                              rawDate: item.rawDate ?? '',
                              tag: item.tag ?? '',
                              // C9 — the feed's rows travel into detail the same
                              // way the transaction list's do.
                              ...(origin?.icon ? { originIcon: encodeFrame(origin.icon) } : {}),
                              ...(origin?.amount
                                ? { originAmount: encodeFrame(origin.amount) }
                                : {}),
                            },
                          });
                        }}
                      />
                    );
                  })}
                </Card>
              </Animated.View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      {/* One positioning context for the pinned block and the feed it floats
          over. Without it the block anchors to the SafeAreaView and renders
          under the status bar. */}
      <View className="flex-1">
        {/* The scroll view's frame never changes, so the feed always moves 1:1
          with the finger while the block pinned over it collapses. Its top
          padding is the pinned block's expanded height, which is measured
          rather than guessed — the capture card is a different height while
          recording, while a draft is in hand, and with the text field open. */}
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onLayout={(event) => setViewportHeight(Math.round(event.nativeEvent.layout.height))}
          contentContainerStyle={{
            // Every card below can be the first feed item. Keep the breathing
            // room on the container instead of relying on a previous sibling's
            // bottom margin (the low-credit card exposed that assumption).
            paddingTop: pinnedTopHeight + captureExpandedHeight + themeTokens.spacing.md,
            paddingBottom:
              keyboardInset > 0
                ? keyboardInset + 24
                : hasTransactions
                  ? LIST_BOTTOM_PADDING
                  : EMPTY_BOTTOM_PADDING,
            // The card shrinks one pixel per pixel scrolled, so it needs a
            // scroll range of exactly its collapse distance to finish. A feed
            // that runs out before then leaves the card stranded halfway with
            // nowhere left to scroll. Asking for a content height of one
            // viewport plus that distance is the smallest guarantee that the
            // pill can always fully form — and costs nothing on a long feed,
            // which already exceeds it.
            ...(isCaptureCollapsible && viewportHeight > 0
              ? {
                  minHeight: viewportHeight + captureExpandedHeight - CAPTURE_COLLAPSED_HEIGHT,
                }
              : null),
          }}>
          {autopayReviews[0] ? (
            <View
              className="mx-6 mb-4 rounded-3xl border p-4"
              style={{
                backgroundColor: themeTokens.colors.card,
                borderColor: themeTokens.colors.accent,
              }}>
              <View className="flex-row items-start gap-3">
                <MaterialCommunityIcons
                  name="bank-check"
                  size={24}
                  color={themeTokens.colors.accent}
                />
                <View className="flex-1">
                  <ThemedText className="font-black">Autopay transaction added</ThemedText>
                  <ThemedText className="mt-1 text-xs opacity-60">
                    Review the recurring payment. It is already in your transaction list.
                  </ThemedText>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      className="rounded-xl px-4 py-2"
                      style={{ backgroundColor: themeTokens.colors.accent }}
                      onPress={() => {
                        const item = autopayReviews[0];
                        if (!token) return;
                        void confirmSubscriptionOccurrence(token, item.id).then(() =>
                          setAutopayReviews((items) =>
                            items.filter((entry) => entry.id !== item.id)
                          )
                        );
                      }}>
                      <ThemedText tone="onAccent" className="text-xs font-black">
                        Confirm
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      className="rounded-xl border px-4 py-2"
                      style={{ borderColor: themeTokens.colors.accent }}
                      onPress={() => {
                        const item = autopayReviews[0];
                        if (!token) return;
                        void revertSubscriptionOccurrence(token, item.id).then((result) =>
                          router.push({
                            pathname: '/entry/[id]',
                            params: { id: String(result.entry_id), edit: '1' },
                          })
                        );
                      }}>
                      <ThemedText
                        className="text-xs font-black"
                        style={{ color: themeTokens.colors.accent }}>
                        Correct / revert
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {showGuestUpgradePrompt ? (
            <GuestUpgradePrompt
              entryCount={Math.max(entryTotal, transactions.length)}
              onUpgrade={() => router.push('/auth?mode=link')}
              onDismiss={() => {
                setIsGuestUpgradeSnoozed(true);
                void snoozeGuestUpgradePrompt();
              }}
            />
          ) : null}

          {shouldShowLowCreditNotice ? (
            <View style={{ marginHorizontal: 24, marginBottom: themeTokens.spacing.md }}>
              <CreditStatusCard
                credits={billingStatus?.credits ?? null}
                loading={isBillingLoading}
                compact
                onPress={() => router.push('/billing')}
              />
            </View>
          ) : null}

          {/* Questions answer here, at the top of the feed, directly under the
              capture field that asked them — not in a sheet. */}
          {pendingQuestion ? (
            <View
              className="mx-6 mb-4 flex-row items-center gap-3 rounded-3xl border p-4"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF8F4',
                borderColor: themeTokens.colors.border,
              }}>
              <ActivityIndicator size="small" color={themeTokens.colors.accent} />
              <ThemedText
                variant="caption"
                numberOfLines={2}
                style={{ flex: 1, color: `${themeTokens.colors.text}99` }}>
                Looking through your transactions…
              </ThemedText>
            </View>
          ) : null}

          {answer ? (
            <AnswerCard
              answer={answer}
              sourceText={answerSourceText}
              onDismiss={() => setAnswer(null)}
              onAskSuggestion={(question) => {
                setAnswer(null);
                void submitPrompt(question);
              }}
            />
          ) : null}

          <QuickPrompts
            key={`quick-prompts-${quickPromptKey}`}
            onSelect={handleQuickPromptSelect}
            onAdd={handleAddPrompt}
            onLongPress={handleLongPressPrompt}
          />

          {parseFailure && (
            <ParseErrorCard
              failure={parseFailure}
              onRetry={handleRetryPrompt}
              onDismiss={() => setParseFailure(null)}
              onUseExample={handleUseExample}
              onAddManually={handleAddManuallyAfterFailure}
              isRetrying={isSubmitting}
              style={{ marginHorizontal: 24, marginBottom: 24 }}
            />
          )}

          {accountSetupNudge ? (
            <View
              className="mx-6 mb-4 rounded-3xl border p-4"
              style={{
                backgroundColor: themeTokens.colors.card,
                borderColor: themeTokens.colors.border,
              }}>
              <View className="flex-row items-start gap-3">
                <MaterialCommunityIcons
                  name="wallet-plus-outline"
                  size={24}
                  color={themeTokens.colors.accent}
                />
                <View className="flex-1">
                  <ThemedText className="font-black">{accountSetupNudge.title}</ThemedText>
                  <ThemedText className="mt-1 text-xs opacity-60">
                    {accountSetupNudge.body}
                  </ThemedText>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      className="rounded-xl px-4 py-2"
                      style={{ backgroundColor: themeTokens.colors.accent }}
                      onPress={() => {
                        const accountID =
                          accountSetupNudge.action_url?.match(/^\/accounts\/(\d+)$/)?.[1];
                        if (!accountID || !token) return;
                        void markNotificationRead(token, accountSetupNudge.id).catch(
                          () => undefined
                        );
                        setAccountSetupNudge(null);
                        router.push({ pathname: '/accounts/[id]', params: { id: accountID } });
                      }}>
                      <ThemedText tone="onAccent" className="text-xs font-black">
                        Complete setup
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      className="rounded-xl px-4 py-2"
                      onPress={() => {
                        void snoozeAccountSetupNudge();
                        setAccountSetupNudge(null);
                      }}>
                      <ThemedText tone="muted" className="text-xs font-black">
                        Later
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {errorMessage && (
            <ErrorBanner
              message={errorMessage}
              style={{ marginHorizontal: 24, marginBottom: 24 }}
            />
          )}

          {creditAction && (
            <View
              className="mx-6 mb-6 rounded-2xl border p-4"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF8F4',
                borderColor: themeTokens.colors.border,
              }}>
              <View className="flex-row items-start gap-3">
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: themeTokens.colors.secondary }}>
                  <MaterialCommunityIcons
                    name="creation"
                    size={18}
                    color={themeTokens.colors.accent}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <ThemedText className="font-bold" style={{ color: themeTokens.colors.text }}>
                    {creditAction.title}
                  </ThemedText>
                  <ThemedText
                    className="mt-1 text-xs"
                    style={{ color: `${themeTokens.colors.text}99` }}>
                    {creditAction.message}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(creditAction.action === 'login' ? '/auth?mode=link' : '/billing')
                    }
                    className="mt-3 self-start rounded-full px-4 py-2"
                    style={{ backgroundColor: themeTokens.colors.accent }}>
                    <ThemedText tone="onAccent" className="text-xs font-bold">
                      {creditAction.actionLabel}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {renderRecentActivity()}
        </Animated.ScrollView>

        {/* Pinned above the feed: identity, the month, and capture. The month
          strip staying put is the point of W2 — a figure you have to hunt for
          is not a reason to open the app. */}
        <View
          className="absolute inset-x-0 top-0"
          style={{ backgroundColor: themeTokens.colors.background }}>
          <View
            onLayout={(event) => setPinnedTopHeight(Math.round(event.nativeEvent.layout.height))}>
            <HomeHeader
              unreadCount={unreadNotifications}
              onNotificationsPress={() => router.push('/notifications')}
            />

            <MonthStrip
              dashboard={monthDashboard}
              loading={isMonthLoading}
              onPress={() =>
                router.push({ pathname: '/(tabs)/insight', params: { period: 'this_month' } })
              }
            />
          </View>

          <CollapsibleCapture
            scrollY={scrollY}
            onExpand={handleExpandCapture}
            onMicPress={handlePillMicPress}
            isRecording={isRecording}
            locked={isCaptureLocked || !isCaptureCollapsible}
            onExpandedHeightChange={setCaptureExpandedHeight}>
            <View className="px-6 pb-4">
              <ThemedText tone="muted" className="text-xs font-medium text-center">
                Speak naturally. Finnri will organize it.
              </ThemedText>
            </View>

            <VoiceInputCard
              recorder={audioRecorder}
              onMicPress={handleToggleRecording}
              onMicLongPress={() => router.push('/ask' as never)}
              onAskPress={() => router.push('/ask' as never)}
              isRecording={isRecording}
              hasRecording={!!recordedUri}
              inputText={inputText}
              onChangeText={setInputText}
              onProcess={handleSubmitPrompt}
              onClear={handleClearRecording}
              hasFailed={Boolean(parseFailure)}
              isProcessing={isSubmitting}
              isTextInputVisible={isTextInputVisible}
              onToggleTextInput={() => setIsTextInputVisible((current) => !current)}
            />
          </CollapsibleCapture>
        </View>
      </View>

      {hasTransactions && (
        <Pressable
          accessibilityRole="button"
          onPress={handleOpenManualEntry}
          style={[
            {
              backgroundColor: theme.accent,
              height: FAB_SIZE,
              width: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              bottom: FAB_BOTTOM_OFFSET,
              right: FAB_RIGHT_OFFSET,
            },
            themeTokens.shadows.soft,
          ]}
          className="items-center justify-center absolute elevation-5">
          <MaterialCommunityIcons name="plus" size={32} color="white" />
        </Pressable>
      )}

      {saveConfirmation && (
        <RNAnimated.View
          accessibilityLiveRegion="polite"
          className="absolute self-center z-50 flex-row items-center gap-2 rounded-full px-3 py-2 shadow-md"
          style={{
            bottom: SAVE_TOAST_BOTTOM_OFFSET,
            backgroundColor: theme.accent,
            opacity: saveConfirmationAnim,
            transform: [
              {
                translateY: saveConfirmationAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
          pointerEvents="none">
          <MaterialCommunityIcons name="check" size={15} color="white" />
          <ThemedText tone="onAccent" className="text-xs font-bold">
            {saveConfirmation}
          </ThemedText>
        </RNAnimated.View>
      )}

      <TransactionFormModal
        visible={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          pendingSuggestionSetup.current = null;
          setAccountSuggestionHint(null);
          if (statementComposerReturnId.current) {
            statementComposerReturnId.current = null;
            router.back();
          }
        }}
        initialData={form}
        onSave={handleConfirmEntry}
        mode={modalMode}
        isParsing={isParsing}
        aiReview={aiReview}
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        recentEntries={transactions}
        authToken={token}
        accountSuggestion={accountSuggestion}
        onSetupSuggestedAccount={(suggestion) => {
          pendingSuggestionSetup.current = {
            type: suggestion.type,
            count: accounts.filter(
              (account) => normalizeAccountType(account.type) === suggestion.type
            ).length,
          };
          resumeDraftAfterAccounts.current = true;
          setIsEditOpen(false);
          router.push({
            pathname: '/accounts/manage',
            params: {
              type: suggestion.type,
              name: suggestion.name,
              provider: suggestion.provider ?? '',
              identifier: suggestion.identifier ?? '',
              color: suggestion.color,
            },
          });
        }}
        onAutoCreateSuggestedAccount={async (suggestion) => {
          if (!token) throw new Error('Please sign in again before creating an account.');
          const base = getAutoAccountPayloadForPaymentMode(form.mode);
          if (!base) throw new Error(`Could not create an account for ${form.mode}.`);
          const saved = await saveAccount(token, {
            ...base,
            name: suggestion.name || base.name,
            color: suggestion.color || base.color,
            provider: suggestion.provider ?? base.provider,
            identifier: suggestion.identifier ?? base.identifier,
            auto_created: true,
          });
          setAccounts((current) => [
            saved,
            ...current.filter((account) => account.id !== saved.id),
          ]);
          setAccountSuggestionHint(null);
          return saved;
        }}
        onDraftChange={setForm}
        onManageAccounts={(suggestion) => {
          resumeDraftAfterAccounts.current = true;
          setIsEditOpen(false);
          router.push({
            pathname: '/money',
            params: {
              segment: 'accounts',
              ...(suggestion
                ? {
                    type: suggestion.type,
                    name: suggestion.name,
                    provider: suggestion.provider ?? '',
                    identifier: suggestion.identifier ?? '',
                    color: suggestion.color,
                  }
                : {}),
            },
          });
        }}
      />
      <TransactionFormModal
        visible={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        initialData={getInitialPromptData()}
        onSave={handleSavePrompt}
        onDelete={editingPrompt ? handleDeletePrompt : undefined}
        isEdit={!!editingPrompt}
        mode="quick-prompt"
      />
    </Screen>
  );
}
