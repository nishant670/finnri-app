import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { useRouter, useFocusEffect, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated as RNAnimated, Easing, Linking, Platform, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { GiftPassModal } from '@/components/billing/GiftPassModal';
import { AccountSetupNudgeCard } from '@/components/home/AccountSetupNudgeCard';
import { AutopayReviewCard } from '@/components/home/AutopayReviewCard';
import { HomeRecentActivity } from '@/components/home/HomeRecentActivity';
import { PendingQuestionNotice } from '@/components/home/PendingQuestionNotice';
import { SaveConfirmationToast } from '@/components/home/SaveConfirmationToast';
import { AnswerCard } from '@/components/home/AnswerCard';
import { CAPTURE_COLLAPSED_HEIGHT, CollapsibleCapture } from '@/components/home/CollapsibleCapture';
import { FirstEntryCard } from '@/components/home/FirstEntryCard';
import { GetStartedCard, getStartedSteps } from '@/components/home/GetStartedCard';
import { HomeHeader } from '@/components/home/HomeHeader';
import { MonthStrip } from '@/components/home/MonthStrip';
import { QuickPrompts } from '@/components/home/QuickPrompts';
import { ParseErrorCard } from '@/components/home/ParseErrorCard';
import {
  VoiceInputCard,
  type CaptureCreditBlock,
  type CaptureCreditNote,
} from '@/components/home/VoiceInputCard';
import { GuestUpgradePrompt } from '@/components/home/GuestUpgradePrompt';
import { useAppDialog, type AppConfirmOptions } from '@/components/ui/AppDialogProvider';
import { PlansOfferSheet } from '@/components/billing/PlansOfferSheet';
import { useGiftPassAnnouncement } from '@/hooks/use-gift-pass-announcement';
import { usePlansPrompt } from '@/hooks/use-plans-prompt';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Screen } from '@/components/ui/theme-primitives';
import { useAppSettingsStore } from '@/hooks/use-app-settings-store';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  isBillingActionURL,
  fetchNotifications,
  fetchNewUnreadBudgetNotification,
  fetchUnreadBudgetNotificationIds,
  fetchUnreadNotificationCount,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';
import { isAccountSetupNudgeSnoozed, snoozeAccountSetupNudge } from '@/lib/account-setup-nudge';
import { API_BASE_URL, formatApiDate, formatDateLabel, groupTransactionsBySection, loadTransactionPage, mapEntryToTransaction, parseDateLabel } from '@/lib/transactions';
import { Transaction } from '@/types/transaction';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { Motion } from '@/constants/theme';
import {
  isGuestUpgradePromptSnoozed,
  shouldShowGuestUpgradePrompt,
  snoozeGuestUpgradePrompt,
} from '@/lib/guest-upgrade';
import { fetchAccounts as loadAccounts, getAutoAccountPayloadForPaymentMode, normalizeAccountType, matchAccountsToHint, accountForParsedDraft, suggestAccountFromTransaction, saveAccount, setAccountBalance, type Account, type AccountSuggestionHint, type AccountType } from '@/lib/accounts';
import {
  describeLikelyDuplicate,
  saveNewTransaction,
  type ReceivedRefund,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import { haptics } from '@/lib/haptics';
import { formToQuickPromptPayload } from '@/lib/quick-prompts';
import { isParseAnswer, looksLikeQuestion, describeParseFailure, describeReceiptScanFailure, ParseApiError, type ParseFailure, parseEntryDraft, parseReceiptDraft, type LedgerAnswer, type ParseResponse } from '@/lib/parse';
import { pickReceiptPhoto, takePendingReceiptPhoto, type ReceiptPhotoSource } from '@/lib/receipt-photo';
import { ReceiptSourceSheet } from '@/components/transactions/ReceiptSourceSheet';
import {
  fetchSplitFriends,
  fetchSplitGroups,
  type SplitFriend,
  type SplitGroup,
} from '@/lib/splits';
import { resolveSplitDraft } from '@/lib/split-draft';
import { fetchDashboard, type DashboardResponse } from '@/lib/insights';
import { confirmSubscriptionOccurrence, fetchSubscriptionOccurrences, revertSubscriptionOccurrence, syncSubscriptionAutomation, type SubscriptionOccurrence } from '@/lib/subscriptions';
import { notifyTransactionsChanged, subscribeTransactionsChanged } from '@/lib/transaction-events';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';
import { fetchBudgets } from '@/lib/budgets';
import { FIRST_ENTRY_PHRASE, loadSpeakLanguage, useSpeakLanguage } from '@/lib/speak-language';
import { isFirstEntryDismissed, dismissFirstEntry } from '@/lib/first-entry';
import {
  captureCreditsFor,
  creditBlockFor,
  creditBlockLifted,
  creditGateFor,
  type CaptureKind,
  type CreditBlock,
} from '@/lib/credit-gate';
import { getFriendlyErrorMessage, readApiError } from '@/lib/api-error';
import { describeReceiptBalanceUpdate } from '@/lib/receipt-balance';
import { clampDateToStatementCycle } from '@/lib/statement-composer';
import { requestMicAccess } from '@/lib/microphone-access';
import {
  applyParsedDraftToForm,
  buildAiReview,
  createDefaultEntryForm,
  creditActionForParseError,
  quickPromptEditorData,
  quickPromptForm,
  resolveAccountForEntry,
  saveConfirmationLabel,
  type CreditActionState,
} from '@/lib/home-capture';
import {
  TransactionFormModal,
  type AiReviewMetadata,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';

/**
 * A gap of air under the last row. There is no floating button to clear any
 * more (P11: + and the mic ride the capture bar), so every state uses it.
 */
const BOTTOM_PADDING = 24;

/** Past this many entries Home stops offering its set-up steps (P5). */
const GET_STARTED_MAX_ENTRIES = 5;

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

/** Roughly how long ScrollView's animated scrollTo takes to settle. */
const CAPTURE_EXPAND_MS = 260;

/**
 * How long a freshly saved row stays marked as new. Covers its entrance plus
 * the accent tint fading out, with enough slack that a slow frame cannot cut
 * the highlight off mid-fade.
 */
const NEW_ROW_HIGHLIGHT_MS = 1200;
/**
 * Shorter than this is a mis-tap on the mic, not a sentence: it is dropped
 * instead of being sent (and charged) to come back empty.
 */
const MIN_RECORDING_SECONDS = 0.8;

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
/** How often a return to the foreground refreshes credits, notifications and gifts. */
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

/** Legacy `Animated` needs the curve as a plain function; see AnimatedBottomSheet. */
const TOAST_IN_EASING = Easing.bezier(...Motion.ease.standard);
const TOAST_OUT_EASING = Easing.bezier(...Motion.ease.exit);


export default function HomeScreen() {
  const themeTokens = useThemeTokens();
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

  const [accounts, setAccounts] = useState<Account[]>([]);
  // A refund the user said already came back, and whether to record it with the
  // purchase. It travels beside the form because it becomes a second entry.
  const [refundReceived, setRefundReceived] = useState<ReceivedRefund | null>(null);
  const [recordRefund, setRecordRefund] = useState(true);
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
  /** The balance the scanned receipt printed, offered to its account after saving. */
  const receiptBalance = useRef<number | null>(null);
  const accountSuggestion = useMemo(
    () =>
      accountSuggestionHint ? suggestAccountFromTransaction(accountSuggestionHint, accounts) : null,
    [accountSuggestionHint, accounts]
  );
  // Saved cards the parser's hint could mean, best first. "ICICI Amazon" finds
  // the card saved as "Amazon ICICI"; "HDFC" finds every HDFC card.
  const accountMatches = useMemo(
    () =>
      accountSuggestionHint
        ? matchAccountsToHint(accountSuggestionHint, accounts).map((match) => match.account)
        : [],
    [accountSuggestionHint, accounts]
  );
  // What "none of these, it's a new one" sets up: the suggestion as if no
  // account existed.
  const newAccountSuggestion = useMemo(
    () => (accountSuggestionHint ? suggestAccountFromTransaction(accountSuggestionHint, []) : null),
    [accountSuggestionHint]
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
      setRefundReceived(null);
    }
  }, [accounts]);
  const [splitFriends, setSplitFriends] = useState<SplitFriend[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  /**
   * Dated the moment it is called. This used to spread a form built once when
   * Home mounted, so after midnight every new entry was still dated — and
   * timed — the day before: "Today" at 00:14 saved as yesterday at 23:53,
   * until the app was restarted.
   */
  const createBlankForm = useCallback(
    (): EntryForm => ({
      ...createDefaultEntryForm(),
      accountId: null,
      account: '',
      merchant: '',
      notes: '',
    }),
    []
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(createDefaultEntryForm);
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
  /** Entries have been read at least once, so "none" means none (P70). */
  const [hasLoadedEntries, setHasLoadedEntries] = useState(false);
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
  // `block` is what lets the card step aside once credits come back.
  const [creditAction, setCreditAction] = useState<(CreditActionState & { block?: CreditBlock }) | null>(
    null
  );
  const [aiSourceText, setAiSourceText] = useState('');
  /** The AI read behind the draft in the sheet, linked to the saved entry (P57). */
  const [aiRequestId, setAiRequestId] = useState<string | null>(null);
  const [aiInputSource, setAiInputSource] = useState<'text' | 'voice' | 'receipt'>('text');
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
  /** The read in flight, so the draft sheet's Cancel can stop it. */
  const parseAbort = useRef<AbortController | null>(null);
  const resumeDraftAfterAccounts = useRef(false);
  const saveConfirmationAnim = useRef(new RNAnimated.Value(0)).current;
  const motion = useMotion();

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  // The plans pop-up waits its turn: it never opens over a sheet, a credit
  // prompt or the quick-prompt editor. Read through a ref because the check
  // runs after a delay, against whatever is on screen by then.
  const screenBusyRef = useRef(false);
  screenBusyRef.current = isEditOpen || isPromptModalOpen || creditAction !== null;
  // A budget alert after a save already interrupted once; a second prompt
  // straight after it would be the spam this pop-up is built to avoid.
  const promptQuietUntilRef = useRef(0);
  const plansPrompt = usePlansPrompt({
    token,
    isGuest: !!user?.is_guest,
    isBusy: useCallback(
      () => screenBusyRef.current || Date.now() < promptQuietUntilRef.current,
      []
    ),
  });
  const considerPlansPrompt = plansPrompt.considerAfterSave;
  const offerPlansForBlockedAI = plansPrompt.offerForBlockedAI;
  const [editingPrompt, setEditingPrompt] = useState<
    import('@/components/home/QuickPrompts').QuickPrompt | null
  >(null);
  const [modalMode, setModalMode] = useState<'audio' | 'manual' | 'quick-prompt'>('manual');
  /** The sheet holds a blank entry, which starts on the last method used (P9). */
  const [isBlankEntry, setIsBlankEntry] = useState(false);
  const dailyCreditLimit = billingStatus?.credits.daily_limit ?? 0;
  const dailyCreditsRemaining = billingStatus?.credits.daily_credits_remaining ?? 0;
  const shouldShowLowCreditNotice =
    dailyCreditLimit > 0 && dailyCreditsRemaining / dailyCreditLimit < 0.2;
  /**
   * What the capture card says about credits (P1). A balance that can't pay
   * for any capture greys the card out before anyone taps it; a capture the
   * server refused shows the same way until it is dismissed or retried.
   */
  const creditGate = useMemo(
    // Typed notes are the cheapest capture: when they can't be paid for,
    // nothing the card offers can.
    () => creditGateFor(billingStatus, { isGuest: !!user?.is_guest, kind: 'text' }),
    [billingStatus, user?.is_guest]
  );
  const shownCreditAction = creditGate ?? creditAction;
  const totalCreditsLeft = billingStatus?.credits.total_credits_remaining ?? 0;
  const captureCreditBlock: CaptureCreditBlock | null = shownCreditAction
    ? {
        title: shownCreditAction.title,
        message: shownCreditAction.message,
        footnote: totalCreditsLeft > 0 ? `${totalCreditsLeft} total credits left` : null,
        actionLabel: shownCreditAction.actionLabel,
        onAction: () =>
          router.push(shownCreditAction.action === 'login' ? '/auth?mode=link' : '/billing'),
        // Only a refusal can be put away: a gate holds until credits return.
        onDismiss: creditGate ? undefined : () => setCreditAction(null),
      }
    : null;
  const captureCreditNote: CaptureCreditNote | null =
    !captureCreditBlock && shouldShowLowCreditNotice
      ? {
          text: `${dailyCreditsRemaining} of ${dailyCreditLimit} AI credits left today`,
          actionLabel: user?.is_guest ? 'Sign in for more' : 'View plans',
          onAction: () => router.push(user?.is_guest ? '/auth?mode=link' : '/billing'),
        }
      : null;

  /**
   * Stops a capture that cannot be paid for, at the moment it is asked for
   * rather than after the clip exists. Returns true when it has taken over,
   * so callers can bail. The decision itself lives in `creditGateFor`.
   */
  const blockCaptureWithoutCredits = useCallback(
    (kind: CaptureKind) => {
      const gate = creditGateFor(billingStatus, { isGuest: !!user?.is_guest, kind });
      if (!gate) return false;
      setCreditAction({ ...gate, block: creditBlockFor(billingStatus, captureCreditsFor(billingStatus, kind)) });
      // The card says what happened; the sheet is the way past it, offered at
      // the moment it is needed. A guest's card already points at sign-in.
      if (gate.action === 'upgrade') void offerPlansForBlockedAI(gate.reason);
      return true;
    },
    [billingStatus, offerPlansForBlockedAI, user?.is_guest]
  );

  const handleQuickPromptSelect = useCallback(
    (prompt: import('@/components/home/QuickPrompts').QuickPrompt) => {
      setAiReview(null);
      setForm(quickPromptForm(createBlankForm(), prompt, accounts, new Date()));
      setModalMode('manual');
      setIsEditOpen(true);
    },
    [accounts, createBlankForm]
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
    const payload = formToQuickPromptPayload(formData);

    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      // What the server said, field by field, rather than one line that
      // leaves the user guessing which field to fix.
      throw await readApiError(resp, 'Unable to save this prompt right now.', {
        account_id: 'Account',
      });
    }
    setIsPromptModalOpen(false);
    // Remounts QuickPrompts, which re-reads the list.
    setQuickPromptKey((prev) => prev + 1);
  };

  const handleDeletePrompt = async () => {
    if (!editingPrompt) return;
    const id = editingPrompt.id;
    const resp = await fetch(`${API_BASE_URL}/v1/quick-prompts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) throw await readApiError(resp, 'Unable to delete this prompt right now.');
    setIsPromptModalOpen(false);
    setQuickPromptKey((prev) => prev + 1);
  };

  const [quickPromptKey, setQuickPromptKey] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [accountSetupNudge, setAccountSetupNudge] = useState<AppNotification | null>(null);

  const getInitialPromptData = () => quickPromptEditorData(editingPrompt, accounts, new Date());

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
        setHasLoadedEntries(true);
      } catch (error) {
        setEntriesError(getFriendlyErrorMessage(error, "Couldn't load your activity."));
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
    async () => {
      if (!token) {
        setBillingStatus(null);
        return;
      }
      try {
        setBillingStatus(await fetchBillingStatus(token));
      } catch {
        setBillingStatus(null);
      }
    },
    [token]
  );

  const fetchNotificationCount = useCallback(async () => {
    const count = await fetchUnreadNotificationCount(token);
    setUnreadNotifications(count);
  }, [token]);

  // A refusal's card steps aside once fresh billing data shows the credits are
  // back — a gifted pass, a purchase, tomorrow's allowance — rather than
  // waiting for the next capture or a restart.
  useEffect(() => {
    if (creditAction?.block && creditBlockLifted(creditAction.block, billingStatus)) {
      setCreditAction(null);
    }
  }, [billingStatus, creditAction]);

  // The gift pop-up waits for the entry sheet, the prompt editor and the plans
  // sheet. Unlike the plans prompt it does not wait for the credit card: that
  // card is often exactly what the gift answers.
  const giftBlockedRef = useRef(false);
  giftBlockedRef.current = isEditOpen || isPromptModalOpen || plansPrompt.sheet.visible;
  const giftAnnouncement = useGiftPassAnnouncement({
    token,
    enabled: !user?.is_guest,
    canInterrupt: useCallback(() => !giftBlockedRef.current, []),
    onAnnounce: useCallback(() => {
      void fetchCredits();
    }, [fetchCredits]),
  });
  const checkForGift = giftAnnouncement.check;

  // Coming back to the app is when news arrives: a gift given while it was in
  // the background, or credits bought on the web. Focus alone misses it,
  // because Home never lost focus. At most once a minute: the camera, the
  // gallery and permission prompts all leave and re-enter the app too, and a
  // bill scan should not share the connection with three refreshes each time.
  const lastForegroundRefreshRef = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < FOREGROUND_REFRESH_INTERVAL_MS) return;
      lastForegroundRefreshRef.current = now;
      void fetchCredits();
      void fetchNotificationCount();
      void checkForGift();
    });
    return () => subscription.remove();
  }, [checkForGift, fetchCredits, fetchNotificationCount]);

  // A gift's push, arriving while the app is open, opens the pop-up straight
  // away. Expo Go has no push, which is why this is imported, not required.
  useEffect(() => {
    if (!token || Constants.appOwnership === 'expo') return;
    let subscription: { remove: () => void } | undefined;
    let cancelled = false;
    void import('expo-notifications')
      .then((Notifications) => {
        if (cancelled) return;
        subscription = Notifications.addNotificationReceivedListener((event) => {
          if (isBillingActionURL(event?.request?.content?.data?.action_url as string | undefined)) {
            void checkForGift();
          }
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [checkForGift, token]);

  const showNewBudgetAlert = useCallback(
    async (previousBudgetNotificationIds: Set<number>) => {
      if (!token) return;
      try {
        const notification = await fetchNewUnreadBudgetNotification(
          token,
          previousBudgetNotificationIds
        );
        if (!notification) return;
        promptQuietUntilRef.current = Date.now() + 60_000;
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

  /**
   * Whether any budget exists, for "Get started" (P5). Null until known; a
   * plan that can't read budgets counts as none set.
   */
  const [hasBudget, setHasBudget] = useState<boolean | null>(null);
  /**
   * Once a budget exists, or Home has outgrown "Get started", the answer can
   * no longer change what is drawn — so stop asking on every focus.
   */
  const budgetPresenceSettled = useRef(false);
  const fetchBudgetPresence = useCallback(async () => {
    if (!token || budgetPresenceSettled.current) return;
    try {
      const found = (await fetchBudgets(token)).length > 0;
      if (found) budgetPresenceSettled.current = true;
      setHasBudget(found);
    } catch {
      setHasBudget(false);
    }
  }, [token]);
  useEffect(() => {
    budgetPresenceSettled.current = false;
  }, [token]);

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
      void fetchBudgetPresence();
      void checkForGift();
      void isGuestUpgradePromptSnoozed().then(setIsGuestUpgradeSnoozed);
      if (token) {
        void syncSubscriptionAutomation(token)
          .then(() => fetchSubscriptionOccurrences(token))
          .then(setAutopayReviews)
          .catch(() => undefined);
      }
    }, [
      checkForGift,
      fetchAccountOptions,
      fetchBudgetPresence,
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
  const startSteps = useMemo(
    () =>
      getStartedSteps({
        hasAccount: accounts.some((account) => account.type !== 'cash'),
        hasBudget: !!hasBudget,
        hasLock: !!user?.has_pin,
      }),
    [accounts, hasBudget, user?.has_pin]
  );
  /**
   * "Get started" belongs to a new Home (P5): it shows until every step is
   * done or a handful of entries say the app is already in use.
   */
  const outgrewGetStarted = Math.max(entryTotal, transactions.length) >= GET_STARTED_MAX_ENTRIES;
  useEffect(() => {
    if (outgrewGetStarted) budgetPresenceSettled.current = true;
  }, [outgrewGetStarted]);
  const showGetStarted =
    !isEntriesLoading &&
    !entriesError &&
    hasBudget !== null &&
    !outgrewGetStarted &&
    startSteps.some((step) => !step.done);

  /**
   * A brand-new Home offers one sentence to send (P70, board
   * R13-FirstEntry-Proposals) in place of the microphone card: no entries yet,
   * credits to read it with, nothing else under way, and not put away before.
   */
  const speakLanguage = useSpeakLanguage();
  const [firstEntryDismissed, setFirstEntryDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    void isFirstEntryDismissed().then(setFirstEntryDismissed);
  }, []);
  const showFirstEntry =
    firstEntryDismissed === false &&
    hasLoadedEntries &&
    !isEntriesLoading &&
    !entriesError &&
    entryTotal === 0 &&
    transactions.length === 0 &&
    !captureCreditBlock &&
    !parseFailure &&
    !isRecording &&
    !recordedUri;
  const firstEntrySeeded = useRef(false);
  useEffect(() => {
    if (!showFirstEntry || firstEntrySeeded.current) return;
    firstEntrySeeded.current = true;
    // The saved language, not the English the hook starts on before storage
    // answers: a Hindi speaker must not get the English sentence for good.
    void loadSpeakLanguage().then((language) =>
      setInputText((current) => current || FIRST_ENTRY_PHRASE[language])
    );
  }, [showFirstEntry]);
  const putAwayFirstEntry = useCallback(() => {
    setFirstEntryDismissed(true);
    void dismissFirstEntry();
    setInputText('');
  }, []);

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

  const startRecording = useCallback(async () => {
    const access = await requestMicAccess({
      get: getRecordingPermissionsAsync,
      request: requestRecordingPermissionsAsync,
    });
    if (access === 'denied') {
      // The system prompt was just answered no; another tap asks again.
      setErrorMessage("Finnri can't hear you without the microphone. Tap the mic to allow it, or type instead.");
      return;
    }
    if (access === 'blocked') {
      // The system will not ask again, so the way back is Settings — the same
      // offer the camera makes for a bill photo.
      setErrorMessage(null);
      const openSettings = await dialog.confirm({
        title: 'Microphone is off for Finnri',
        message:
          Platform.OS === 'ios'
            ? 'Turn on Microphone for Finnri in Settings to log by voice. You can still type or scan a bill.'
            : 'In Settings, open Permissions › Microphone and choose "Allow only while using the app" to log by voice. You can still type or scan a bill.',
        confirmLabel: 'Open Settings',
        cancelLabel: 'Not now',
      });
      if (openSettings) void Linking.openSettings();
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
      setErrorMessage("Couldn't start recording. Try again.");
      setIsRecording(false);
    }
  }, [audioRecorder, dialog]);

  /**
   * Stopping sends. There used to be a "Recording ready → Use this" step here,
   * kept for the person who realises they said the wrong thing; but with no
   * playback that step could not show them what they said, and the realisation
   * comes while speaking, not after. That person now has Discard while it
   * records and Cancel on the draft sheet while it reads, and neither costs a
   * credit.
   *
   * A clip too short to hold a sentence is a mis-tap: it is dropped here
   * rather than sent to be charged for nothing.
   */
  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      const seconds = audioRecorder.currentTime;
      await audioRecorder.stop();
      if (seconds > 0 && seconds < MIN_RECORDING_SECONDS) {
        setRecordedUri(null);
        setErrorMessage('That was too short to hear. Tap the mic and say what you spent.');
        haptics.captureStop();
        return;
      }
      captureAwaitingSubmit.current = true;
      setRecordedUri(audioRecorder.uri);
      haptics.captureStop();
    } catch {
      setErrorMessage("Couldn't stop recording. Try again.");
    } finally {
      setIsRecording(false);
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Ignore
      }
    }
  }, [audioRecorder, isRecording]);

  /** Stop listening and keep nothing: nothing is sent, so nothing is charged. */
  const discardRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      await audioRecorder.stop();
    } catch {
      // The clip is being thrown away; a recorder that will not stop cleanly
      // has nothing worth reporting.
    } finally {
      setIsRecording(false);
      setRecordedUri(null);
      haptics.captureStop();
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
    if (blockCaptureWithoutCredits('voice')) return;
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

  /**
   * "Type" on the home-screen widget (board R14-Widget) opens Home with
   * `compose=type`: the capture card, open, with the cursor in it.
   */
  useEffect(() => {
    if (compose !== 'type') return;
    router.setParams({ compose: '' });
    handleExpandCapture();
  }, [compose, handleExpandCapture, router]);

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
    setRefundReceived(null);
    createIdempotencyKey.current = null;
    createSaveProgress.current = {};
    setForm(createBlankForm());
    setModalMode('manual');
    setIsBlankEntry(true);
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
        setRefundReceived(null);
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
    async (formData: EntryForm) => resolveAccountForEntry(accounts, formData),
    [accounts]
  );

  /**
   * Asks to bring an account's balance in line with the one its receipt
   * printed, and does it on a yes. Runs after the save, so a refusal or a
   * failure here never touches the transaction.
   */
  const offerReceiptBalance = useCallback(
    async (accountId: number, balance: number, question: AppConfirmOptions) => {
      if (!token || !(await dialog.confirm(question))) return;
      try {
        const updated = await setAccountBalance(token, accountId, balance);
        setAccounts((current) =>
          current.map((account) => (account.id === accountId ? updated : account))
        );
      } catch (error) {
        void dialog.alert({
          title: "Couldn't update the balance",
          message: getFriendlyErrorMessage(error, 'Try again from the account screen.'),
          tone: 'danger',
        });
      }
    },
    [dialog, token]
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
          aiRequestId: modalMode === 'audio' ? aiRequestId : null,
          progress: createSaveProgress.current,
          refund: modalMode === 'audio' && recordRefund ? refundReceived : null,
          confirmDuplicate: (match) => dialog.confirm(describeLikelyDuplicate(match)),
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
          setSaveConfirmation(
            saveConfirmationLabel({
              subscriptionEnabled: formData.subscriptionEnabled,
              recordsRefund: modalMode === 'audio' && recordRefund && Boolean(refundReceived),
            })
          );
          setNewTransactionId(createdTransaction.id);
        }

        createIdempotencyKey.current = null;
        createSaveProgress.current = {};
        setForm(createBlankForm());
        setAiSourceText('');
        pendingSuggestionSetup.current = null;
        setAccountSuggestionHint(null);
        setRefundReceived(null);
        setIsEditOpen(false);
        notifyTransactionsChanged();
        const printedBalance = modalMode === 'audio' ? receiptBalance.current : null;
        receiptBalance.current = null;
        const balanceQuestion = describeReceiptBalanceUpdate(resolvedAccount, printedBalance, {
          type: createdEntry.type ?? formData.type,
          amount: Number(createdEntry.amount),
        });
        if (balanceQuestion && resolvedAccount && printedBalance != null) {
          void offerReceiptBalance(resolvedAccount.id, printedBalance, balanceQuestion);
        }
        // The moment Finnri just did something useful is the one moment a
        // plans prompt reads as help rather than a toll — see usePlansPrompt.
        considerPlansPrompt();
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
      aiRequestId,
      aiSourceText,
      considerPlansPrompt,
      createBlankForm,
      dialog,
      ensureAccountForEntry,
      fetchSplitOptions,
      modalMode,
      offerReceiptBalance,
      recordRefund,
      refundReceived,
      router,
      showNewBudgetAlert,
      token,
    ]
  );

  /**
   * Out of credits, or over today's limit: the credit card on Home owns that
   * message. True when it took the error, so the caller shows nothing else.
   */
  const showCreditParseError = useCallback(
    (error: unknown, kind: CaptureKind): boolean => {
      const creditAction = creditActionForParseError(error, {
        isGuestUser: !!user?.is_guest,
        kind,
        dailyCreditsUsed: billingStatus?.credits.daily_credits_used,
        dailyLimit: billingStatus?.credits.daily_limit,
      });
      if (creditAction) {
        const required =
          (error instanceof ParseApiError ? error.requiredCredits : undefined) ??
          captureCreditsFor(billingStatus, kind);
        setCreditAction({ ...creditAction, block: creditBlockFor(billingStatus, required) });
        if (!user?.is_guest) void offerPlansForBlockedAI(creditAction.reason);
        void fetchCredits();
        return true;
      }
      return false;
    },
    [
      billingStatus,
      fetchCredits,
      offerPlansForBlockedAI,
      user?.is_guest,
    ]
  );

  /**
   * Fill the review sheet from a capture draft. Text, voice and receipt scans
   * all land here, so a draft reads the same whichever way it arrived.
   */
  const applyParsedDraft = useCallback(
    (
      data: ParseResponse,
      fallbackText: string,
      inputSource: 'voice' | 'text' | 'receipt',
      attachment?: string
    ) => {
      setAiRequestId(data.ai_request_id ?? null);
      setAiSourceText(data.source_text ?? fallbackText);
      receiptBalance.current = inputSource === 'receipt' ? (data.balance_after ?? null) : null;
      setAiInputSource(inputSource);
      pendingSuggestionSetup.current = null;
      setRefundReceived(
        data.refund_received && data.refund_received.amount > 0 ? data.refund_received : null
      );
      setRecordRefund(true);
      setAccountSuggestionHint({
        mode: data.mode,
        accountHint: data.account_hint,
        cardNetwork: data.card_network,
      });
      const splitDraft = resolveSplitDraft(data, splitFriends, splitGroups);
      const hintedAccount = accountForParsedDraft(data, accounts);
      setAiReview(buildAiReview(data, fallbackText, inputSource, splitDraft, smartSorting));
      setForm((prev) =>
        applyParsedDraftToForm(prev, data, {
          fallbackText,
          attachment,
          smartSorting,
          splitDraft,
          hintedAccount,
        })
      );
    },
    [accounts, smartSorting, splitFriends, splitGroups]
  );

  /**
   * Bumped whenever the capture sheet closes, so a receipt read that lands
   * after the user walked away is dropped instead of reopening nothing or
   * throwing an error dialog over Home.
   */
  const receiptScanId = useRef(0);
  const isEditOpenRef = useRef(isEditOpen);
  isEditOpenRef.current = isEditOpen;

  /**
   * The bill-scan path: a photo, from Home or from the add sheet, becomes the
   * same AI draft a typed or spoken capture does. The sheet shows "Reading"
   * while the photo is read, then the draft, or manual entry with the photo
   * still attached as the receipt if no total could be read.
   */
  const scanReceipt = useCallback(
    async (uri: string) => {
      if (isSubmitting) return;
      if (blockCaptureWithoutCredits('receipt')) {
        // The credit card lives on Home, behind the sheet.
        setIsEditOpen(false);
        return;
      }
      if (!isEditOpenRef.current) {
        // Started from Home: nothing is on screen to carry over, so the draft
        // lands on a blank entry rather than on whatever was last open.
        pendingSuggestionSetup.current = null;
        setAccountSuggestionHint(null);
        setRefundReceived(null);
        setForm(createBlankForm());
      }
      setIsSubmitting(true);
      setErrorMessage(null);
      setParseFailure(null);
      setCreditAction(null);
      setAnswer(null);
      setAiSourceText('');
      setAiInputSource('text');
      setAiReview({ inputSource: 'receipt' });
      setIsBlankEntry(false);
      setModalMode('audio');
      setIsParsing(true);
      setIsEditOpen(true);
      const scanId = ++receiptScanId.current;
      const abandoned = () => scanId !== receiptScanId.current;
      try {
        const data = await parseReceiptDraft({ token, uri });
        void fetchCredits();
        if (abandoned()) return;
        createIdempotencyKey.current = null;
        createSaveProgress.current = {};
        applyParsedDraft(data, 'Receipt photo', 'receipt', uri);
      } catch (error) {
        void fetchCredits();
        if (abandoned()) return;
        if (showCreditParseError(error, 'receipt')) {
          setIsEditOpen(false);
          return;
        }
        setModalMode('manual');
        setAiReview(null);
        setForm((prev) => ({ ...prev, attachment: uri }));
        const failure = describeReceiptScanFailure(error);
        void dialog.alert({ title: failure.title, message: failure.message, tone: 'danger' });
      } finally {
        setIsParsing(false);
        setIsSubmitting(false);
      }
    },
    [
      applyParsedDraft,
      blockCaptureWithoutCredits,
      createBlankForm,
      dialog,
      fetchCredits,
      isSubmitting,
      showCreditParseError,
      token,
    ]
  );

  /** "Scan a bill" asks camera or gallery first; the chooser lives here, on Home. */
  const [isReceiptSourceOpen, setIsReceiptSourceOpen] = useState(false);

  const openReceiptScan = useCallback(() => {
    // No point taking a photo that cannot be paid for: say so before the
    // camera opens, and before the photo is chosen.
    if (blockCaptureWithoutCredits('receipt')) {
      setIsEditOpen(false);
      return;
    }
    setIsReceiptSourceOpen(true);
  }, [blockCaptureWithoutCredits]);

  const chooseReceiptSource = useCallback(
    async (source: ReceiptPhotoSource) => {
      setIsReceiptSourceOpen(false);
      // iOS will not present the picker while the chooser is still fading out.
      if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, 350));
      const pick = await pickReceiptPhoto(source);
      if (pick.status === 'picked') {
        void scanReceipt(pick.uri);
        return;
      }
      if (pick.status === 'camera-denied') {
        if (pick.canAskAgain) return;
        const openSettings = await dialog.confirm({
          title: 'Camera is off for Finnri',
          message:
            'Turn on camera access in Settings to photograph a bill, or choose a photo instead.',
          confirmLabel: 'Open Settings',
          cancelLabel: 'Not now',
        });
        if (openSettings) void Linking.openSettings();
        return;
      }
      if (pick.status === 'failed') {
        void dialog.alert({
          title: 'That photo did not open',
          message: 'Try again, or pick a different photo of the bill.',
          tone: 'danger',
        });
      }
    },
    [dialog, scanReceipt]
  );

  // Android may stop Finnri while the camera is open on a phone short of
  // memory. The photo survives in the picker; read it once on the way back.
  const checkedPendingReceipt = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'android' || !token || checkedPendingReceipt.current) return;
    checkedPendingReceipt.current = true;
    void takePendingReceiptPhoto().then((uri) => {
      if (uri) void scanReceipt(uri);
    });
  }, [scanReceipt, token]);

  const submitPrompt = useCallback(
    async (overrideText?: string) => {
      if (isSubmitting) return;
      const trimmed = (overrideText ?? inputText).trim();
      // A re-asked suggestion is text, so any pending recording is not part of it.
      const audioUri = overrideText ? null : recordedUri;
      if (!trimmed && !audioUri) {
        setErrorMessage('Type or say what you spent first.');
        return;
      }
      // The same gate as the microphone, for the typed and quick-prompt paths
      // that never touch it. Typed text wins over a recording, as below.
      const kind: CaptureKind = trimmed ? 'text' : 'voice';
      if (blockCaptureWithoutCredits(kind)) return;
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
      const controller = new AbortController();
      parseAbort.current = controller;
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
        const result = await parseEntryDraft({
          token,
          hintText: trimmed,
          audio,
          signal: controller.signal,
        });
        void fetchCredits();
        // Cancelled as the answer landed: the person has already moved on.
        if (controller.signal.aborted) return;
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
          setRefundReceived(null);
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
        applyParsedDraft(data, trimmed, audioUri ? 'voice' : 'text');
        setInputText('');
        setRecordedUri(null);
      } catch (error) {
        // The sheet came up before the request went out, so a failure has to take
        // it back down — the credit card and the error banner both live on Home,
        // behind it.
        setIsEditOpen(false);
        setPendingQuestion(null);
        // Cancelled on purpose. Not a failure: no card, and the server gave the
        // credits back. A recording goes (they cancelled to say it again); a
        // typed sentence stays in the field to be fixed.
        if (controller.signal.aborted) {
          void fetchCredits();
          setAiReview(null);
          setRecordedUri(null);
          lastPromptText.current = null;
          return;
        }
        if (showCreditParseError(error, kind)) return;
        setParseFailure(describeParseFailure(error));
      } finally {
        if (parseAbort.current === controller) parseAbort.current = null;
        setIsParsing(false);
        setIsSubmitting(false);
      }
    },
    [
      applyParsedDraft,
      blockCaptureWithoutCredits,
      fetchCredits,
      inputText,
      isSubmitting,
      recordedUri,
      showCreditParseError,
      token,
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
   * In-app recording takes the same path since stopping the mic now sends:
   * `stopRecording` raises the same flag.
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
    // Typing it in replaces the recording; leaving it would bring back a
    // "not sent" clip on Home once the sheet closes.
    setRecordedUri(null);
    handleOpenManualEntry();
  }, [handleOpenManualEntry]);

  /** Stops the read under way; the catch in `submitPrompt` tidies up. */
  const cancelParse = useCallback(() => {
    parseAbort.current?.abort();
  }, []);

  const renderRecentActivity = () => (
    <HomeRecentActivity
      isEntriesLoading={isEntriesLoading}
      entriesError={entriesError}
      hasTransactions={hasTransactions}
      transactions={transactions}
      newTransactionId={newTransactionId}
      isStealthMode={isStealthMode}
      onRetry={() => {
        void fetchEntries();
        void fetchMonthSummary();
      }}
    />
  );
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
            paddingBottom: keyboardInset > 0 ? keyboardInset + 24 : BOTTOM_PADDING,
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
            <AutopayReviewCard
              onConfirm={() => {
                const item = autopayReviews[0];
                if (!token) return;
                void confirmSubscriptionOccurrence(token, item.id).then(() =>
                  setAutopayReviews((items) => items.filter((entry) => entry.id !== item.id))
                );
              }}
              onRevert={() => {
                const item = autopayReviews[0];
                if (!token) return;
                void revertSubscriptionOccurrence(token, item.id).then((result) =>
                  router.push({
                    pathname: '/entry/[id]',
                    params: { id: String(result.entry_id), edit: '1' },
                  })
                );
              }}
            />
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

          {/* Questions answer here, at the top of the feed, directly under the
              capture field that asked them — not in a sheet. */}
          {pendingQuestion ? <PendingQuestionNotice /> : null}

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
            hideAmounts={isStealthMode}
          />

          {showGetStarted ? (
            <GetStartedCard
              steps={startSteps}
              onOpen={(step) => {
                if (step.key === 'accounts') router.push('/accounts/manage');
                else if (step.key === 'budget') router.push('/budgets');
                else router.push('/security');
              }}
            />
          ) : null}

          {parseFailure && (
            <ParseErrorCard
              failure={parseFailure}
              onRetry={handleRetryPrompt}
              onDismiss={recordedUri ? handleClearRecording : () => setParseFailure(null)}
              onUseExample={handleUseExample}
              onAddManually={handleAddManuallyAfterFailure}
              isRetrying={isSubmitting}
              keptRecording={Boolean(recordedUri)}
              style={{ marginHorizontal: 16, marginBottom: 12 }}
            />
          )}

          {accountSetupNudge ? (
            <AccountSetupNudgeCard
              title={accountSetupNudge.title}
              body={accountSetupNudge.body}
              onComplete={() => {
                const accountID = accountSetupNudge.action_url?.match(/^\/accounts\/(\d+)$/)?.[1];
                if (!accountID || !token) return;
                void markNotificationRead(token, accountSetupNudge.id).catch(() => undefined);
                setAccountSetupNudge(null);
                router.push({ pathname: '/accounts/[id]', params: { id: accountID } });
              }}
              onLater={() => {
                void snoozeAccountSetupNudge();
                setAccountSetupNudge(null);
              }}
            />
          ) : null}

          {errorMessage && (
            <ErrorBanner
              message={errorMessage}
              style={{ marginHorizontal: 16, marginBottom: 12 }}
            />
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
              welcome={showFirstEntry}
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
            onAddPress={handleOpenManualEntry}
            isRecording={isRecording}
            locked={isCaptureLocked || !isCaptureCollapsible}
            onExpandedHeightChange={setCaptureExpandedHeight}>
            {showFirstEntry ? (
              <FirstEntryCard
                text={inputText}
                placeholder={FIRST_ENTRY_PHRASE[speakLanguage]}
                onChangeText={setInputText}
                onSend={handleSubmitPrompt}
                isSending={isSubmitting}
                onSayInstead={putAwayFirstEntry}
                onAddByHand={handleOpenManualEntry}
              />
            ) : (
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
              onDiscardRecording={() => void discardRecording()}
              onCancelProcessing={cancelParse}
              hasFailed={Boolean(parseFailure)}
              isProcessing={isSubmitting}
              isTextInputVisible={isTextInputVisible}
              onToggleTextInput={() => setIsTextInputVisible((current) => !current)}
              onScanBill={openReceiptScan}
              onAddManually={handleOpenManualEntry}
              creditBlock={captureCreditBlock}
              creditNote={captureCreditNote}
            />
            )}
          </CollapsibleCapture>
        </View>
      </View>

      {saveConfirmation && (
        <SaveConfirmationToast message={saveConfirmation} anim={saveConfirmationAnim} />
      )}

      <TransactionFormModal
        visible={isEditOpen}
        onClose={() => {
          // Closed while it was still reading: that is the Cancel. The read is
          // stopped and its credits come back.
          parseAbort.current?.abort();
          setIsEditOpen(false);
          setIsBlankEntry(false);
          receiptScanId.current += 1;
          pendingSuggestionSetup.current = null;
          setAccountSuggestionHint(null);
          setRefundReceived(null);
          if (statementComposerReturnId.current) {
            statementComposerReturnId.current = null;
            router.back();
          }
        }}
        initialData={form}
        onSave={handleConfirmEntry}
        mode={modalMode}
        startOnLastPayment={isBlankEntry && modalMode === 'manual'}
        onRequestReceiptScan={openReceiptScan}
        isParsing={isParsing}
        aiReview={aiReview}
        accounts={accounts}
        splitFriends={splitFriends}
        splitGroups={splitGroups}
        recentEntries={transactions}
        authToken={token}
        accountSuggestion={accountSuggestion}
        refundReceived={refundReceived}
        recordRefund={recordRefund}
        onRecordRefundChange={setRecordRefund}
        accountMatches={accountMatches}
        newAccountSuggestion={newAccountSuggestion}
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
          setRefundReceived(null);
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
      <ReceiptSourceSheet
        visible={isReceiptSourceOpen}
        onChoose={(source) => void chooseReceiptSource(source)}
        onClose={() => setIsReceiptSourceOpen(false)}
      />
      <PlansOfferSheet {...plansPrompt.sheet} />
      <GiftPassModal
        visible={giftAnnouncement.gift !== null}
        title={giftAnnouncement.gift?.title ?? ''}
        body={giftAnnouncement.gift?.body ?? ''}
        onSeePass={() => {
          void giftAnnouncement.close().then(fetchNotificationCount);
          router.push('/billing');
        }}
        onClose={() => {
          void giftAnnouncement.close().then(fetchNotificationCount);
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
        accounts={accounts}
        onManageAccounts={() => {
          setIsPromptModalOpen(false);
          router.push({ pathname: '/money', params: { segment: 'accounts' } });
        }}
      />
    </Screen>
  );
}
