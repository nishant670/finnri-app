import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as DocumentPicker from 'expo-document-picker';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { CheckTag, LabelRow } from '@/components/ui/LabelRow';
import { Segments } from '@/components/ui/Segments';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { Shimmer } from '@/components/ui/Shimmer';
import { useMotion } from '@/hooks/use-motion';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CURRENCY_SYMBOL, DEFAULT_CURRENCY } from '@/constants/Currency';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { useEntitlementGate } from '@/hooks/use-entitlement-gate';
import { UpgradeSheet } from '@/components/billing/UpgradeSheet';
import type { Account, AccountSuggestion } from '@/lib/accounts';
import {
  getAccountsForPaymentMode,
  getAutoAccountPayloadForPaymentMode,
  getPreferredAccountForPaymentMode,
  normalizeAccountType,
} from '@/lib/accounts';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { calculateEMI, type EMICalculation } from '@/lib/emi';
import { formatTime, parseTimeOfDay } from '@/lib/datetime';
import { haptics } from '@/lib/haptics';
import { formatMoney, toAmount, toAmountInputValue, toKeypadValue } from '@/lib/money';
import { ATTACHMENT_PICKER_TYPES } from '@/lib/uploads';
import type { SplitFriend, SplitGroup } from '@/lib/splits';
import type { EMIPlan } from '@/lib/emi-plans';
import type { BillingInterval, Subscription } from '@/lib/subscriptions';
import { formatDateLabel, parseDateLabel } from '@/lib/transactions';
import {
  DEFAULT_CATEGORY,
  categoryOptionsFor,
  categoryVisual,
  defaultCategoryForType,
  resolveCategory,
} from '@/lib/categories';
import { categoryTypeOf, useUserCategories } from '@/lib/user-categories';
import { useAuthStore } from '@/hooks/use-auth-store';
import { buildQuickFills, type QuickFill } from '@/lib/quick-fills';
import { inferTransactionCategory } from '@/lib/transaction-category';
import { PAYMENT_MODES, paymentModeVisual } from '@/lib/payment-modes';
import {
  buildDraftReviewPlan,
  type DraftFieldKey,
  type DraftReviewPlan,
} from '@/lib/ai-draft-review';
import type { Transaction } from '@/types/transaction';
import { AmountDisplay, AmountKeypad, hasEnteredAmount } from './AmountKeypad';
import { TransactionAccountPicker } from './TransactionAccountPicker';
import { TransactionCategoryPicker } from './TransactionCategoryPicker';
import {
  TransactionCancellationDateSheet,
  TransactionDateSheet,
  TransactionSubscriptionDateSheet,
} from './TransactionDateSheets';
import { TransactionDraftSource, TransactionDraftStatus } from './TransactionDraftHeader';
import { TransactionEmiFields } from './TransactionEmiFields';
import { TransactionModePicker } from './TransactionModePicker';
import { TransactionReceiptField } from './TransactionReceiptField';
import { TransactionRefundFields } from './TransactionRefundFields';
import { TransactionSubscriptionFields } from './TransactionSubscriptionFields';
import { TransactionTagPicker, tagIcon } from './TransactionTagPicker';
import {
  shareFromPercent,
  TransactionSplitFields,
  type TransactionSplitShareMode,
} from './TransactionSplitFields';

export type SplitParticipantForm = {
  friendId: number | null;
  friendName: string;
  shareAmount: string;
  /**
   * The percentage as typed, when the user is working in percentages.
   *
   * `shareAmount` is what gets saved — a split is money owed, not a ratio — but
   * it cannot be the only thing stored. A percentage is meaningless until the
   * total exists, and deriving the field from the amount on every keystroke
   * meant that with no amount yet entered, every digit typed round-tripped
   * through `share = 0` and came back as an empty field. The intent is kept
   * here, and turns into money as soon as there is a total to take it from.
   *
   * Undefined means the share was set as an amount, and the amount leads.
   */
  sharePercent?: string;
  direction: 'friend_owes_user' | 'user_owes_friend';
};

export type EMILink =
  | { kind: 'plan'; plan: EMIPlan; onOpen: () => void }
  | { kind: 'recurring'; subscription: Subscription };

export type EntryForm = {
  title: string;
  time: string;
  amount: string;
  type: string;
  mode: string;
  category: string;
  date: string;
  notes: string;
  tag: string;
  currency: string;
  accountId: number | null;
  account: string;
  merchant: string;
  attachment: string | null;
  splitEnabled: boolean;
  splitGroupId: number | null;
  splitGroupName: string;
  splitParticipants: SplitParticipantForm[];
  refundableAmount: string;
  refundExpectedOn: string;
  refundReminderEnabled: boolean;
  emiTenureMonths: string;
  emiRatePct: string;
  /** Loan EMIs only: how many payments the loan has, and how many are done. */
  emiTotalInstalments: string;
  emiPaidInstalments: string;
  subscriptionEnabled: boolean;
  subscriptionName: string;
  subscriptionMerchant: string;
  subscriptionCategory: string;
  subscriptionAmount: string;
  subscriptionBillingInterval: BillingInterval | '';
  subscriptionNextDueDate: string;
  subscriptionReminderDays: string;
  subscriptionCancelBeforeDue: boolean;
  subscriptionCancelOnDate: string;
  subscriptionAutopay: boolean;
  subscriptionNotes: string;
};

export type AiReviewMetadata = {
  confidence?: Record<string, number>;
  needsConfirmation?: Record<string, boolean>;
  missingFields?: string[];
  clarifications?: string[];
  smartSortingDisabled?: boolean;
  /**
   * The phrase the draft was built from. Shown at the top of the review sheet
   * so the user can see what the AI actually heard before judging what it made
   * of it — a wrong amount is usually a misheard word, not a bad guess.
   */
  sourceText?: string;
  inputSource?: 'voice' | 'text' | 'receipt';
};

interface TransactionFormModalProps {
  visible: boolean;
  onClose: () => void;
  initialData?: Partial<EntryForm>;
  onSave: (data: EntryForm) => Promise<void>;
  onDelete?: () => Promise<void>;
  isEdit?: boolean;
  /**
   * Edit only: what this EMI-tagged entry is already tied to. A card EMI has a
   * plan with a schedule; a bank EMI may already repeat as an auto-debit.
   */
  emiLink?: EMILink | null;
  mode?: 'audio' | 'manual' | 'quick-prompt';
  /** Replaces the sheet's title, for a new entry that is not a blank one. */
  heading?: string;
  /**
   * Offers "Scan a bill" on a new manual entry. The parent asks camera or
   * gallery, reads the photo and drives this sheet into draft review.
   */
  onRequestReceiptScan?: () => void;
  /**
   * The sheet is open but the parse has not landed yet. The draft area renders
   * placeholders shaped like the fields that are coming; everything else — the
   * header, the spoken phrase, the footer — is real, because all of it is known
   * before the request goes out.
   */
  isParsing?: boolean;
  aiReview?: AiReviewMetadata | null;
  accounts?: Account[];
  splitFriends?: SplitFriend[];
  splitGroups?: SplitGroup[];
  onManageAccounts?: (suggestion?: AccountSuggestion) => void;
  accountSuggestion?: AccountSuggestion | null;
  /** A refund the user said already came back, to record as its own income. */
  refundReceived?: { amount: number; date?: string | null } | null;
  recordRefund?: boolean;
  onRecordRefundChange?: (value: boolean) => void;
  /** Saved accounts the AI's account hint could mean, best first. */
  accountMatches?: Account[];
  /** What "it's a new one" sets up, ignoring the saved accounts. */
  newAccountSuggestion?: AccountSuggestion | null;
  onSetupSuggestedAccount?: (suggestion: AccountSuggestion) => void;
  onAutoCreateSuggestedAccount?: (suggestion: AccountSuggestion) => Promise<Account>;
  onDraftChange?: (data: EntryForm) => void;
  initialFocus?: 'category' | 'account';
  categorySuggestions?: string[];
  /**
   * Recent entries, newest first. Only read to build the quick-fill chip row
   * above the keypad, so it is safe to leave out anywhere the amount-first
   * path does not run.
   */
  recentEntries?: Transaction[];
  /** Used only for the server-authoritative EMI schedule preview. */
  authToken?: string | null;
  /** Split owns allocation only; transaction fields and validation stay here. */
  splitContext?: {
    fields: React.ReactNode;
    overlay?: React.ReactNode;
    onBack?: () => void;
    personalPayment: boolean;
  };
}

const emptyAccounts: Account[] = [];
const emptySplitFriends: SplitFriend[] = [];
const emptySplitGroups: SplitGroup[] = [];
const emptyRecentEntries: Transaction[] = [];

const requiredFields = ['title', 'amount', 'type', 'mode', 'category', 'date'] as const;

/**
 * What to say when a required field is empty — one sentence that says what to
 * do, rather than "Please provide Transaction Title." The old line read the
 * field's label back in title case, which named the problem in the form's own
 * jargon and left the fix to the reader.
 */
const missingFieldMessages: Record<(typeof requiredFields)[number], string> = {
  title: 'Add a title so you can spot this later.',
  amount: 'Enter an amount.',
  type: 'Choose expense or income.',
  mode: 'Choose how you paid.',
  category: 'Choose a category.',
  date: 'Pick a date.',
};

const getPaymentLanguage = (entryType: string) =>
  entryType === 'Income'
    ? {
        modeLabel: 'Received via',
        accountLabel: 'Received in',
        modeAccessibilityPrefix: 'Received via',
        accountAccessibilityPrefix: 'Received in',
      }
    : {
        modeLabel: 'Paid via',
        accountLabel: 'Paid from',
        modeAccessibilityPrefix: 'Paid via',
        accountAccessibilityPrefix: 'Paid from',
      };

const nextMonthClamped = (value: string) => {
  const purchased = parseDateLabel(value);
  if (!purchased) return '';
  const targetYear =
    purchased.getMonth() === 11 ? purchased.getFullYear() + 1 : purchased.getFullYear();
  const targetMonth = (purchased.getMonth() + 1) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return formatDateLabel(new Date(targetYear, targetMonth, Math.min(purchased.getDate(), lastDay)));
};

/**
 * The next monthly debit for an EMI that was paid on `value`: the same day of
 * the month, and strictly after today.
 *
 * "A month after the entry" is wrong for an entry dated in the past — logging
 * last month's EMI would schedule a debit that is already overdue, and the
 * server would then create a catch-up entry for every month in between. The day
 * of the month is re-derived from the entry each step, so a 31st does not drift
 * to the 28th for good after one February.
 */
const nextMonthlyAfterToday = (value: string, now = new Date()) => {
  const base = parseDateLabel(value);
  if (!base) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let step = 1; step <= 600; step++) {
    const lastDay = new Date(base.getFullYear(), base.getMonth() + step + 1, 0).getDate();
    const candidate = new Date(
      base.getFullYear(),
      base.getMonth() + step,
      Math.min(base.getDate(), lastDay)
    );
    if (candidate > today) return candidate;
  }
  return null;
};

const splitParticipantDivisor = (participantCount: number) => participantCount + 1;

const equalShareAmount = (amount: number, participantCount: number) => {
  if (!Number.isFinite(amount) || amount <= 0 || participantCount <= 0) return '';
  return toAmountInputValue(amount / splitParticipantDivisor(participantCount));
};

/**
 * The equal-split percentage, which — unlike the equal-split *amount* — can
 * always be worked out. That is the whole reason "Split equally" now has
 * something to do before an amount is typed.
 */
const equalSharePercent = (participantCount: number) => {
  if (participantCount <= 0) return '';
  const percent = 100 / splitParticipantDivisor(participantCount);
  return String(Math.round(percent * 100) / 100);
};


/**
 * Blank falls back to Misc; a legacy name resolves to its canonical form.
 *
 * The second half matters because a caller can still seed `Food`, and the
 * amount-first path now *shows* the category on a chip and saves it as the
 * title when none was typed — so a legacy label stops being invisible.
 * An unrecognised value is a custom category and is passed through untouched.
 */
const normalizeCategoryValue = (category?: string | null, type?: string | null) => {
  const trimmed = category?.trim();
  if (!trimmed) {
    return defaultCategoryForType(type);
  }
  return resolveCategory(trimmed, type) ?? trimmed;
};

const normalizeDateValue = (date?: string | null) => {
  const trimmed = date?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : formatDateLabel(new Date());
};

const mergeCategoryOptions = (category: string, type: string, custom: readonly string[]) =>
  categoryOptionsFor(normalizeCategoryValue(category, type), type, custom);

const formatApiDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** How far the sheet nudges when Save refuses. Two out-and-backs, per the spec. */
const SHAKE_OFFSET = 6;

/**
 * What the draft is about to look like: the amount, the title and the card of
 * fields, drawn where they will land, so the parse result fills the space it
 * was already occupying instead of shoving the sheet around — and so a wait
 * of a few seconds reads as work in progress, not as a sheet that failed to
 * fill.
 */
const DRAFT_SKELETON_ROWS = ['Category', 'Paid via', 'Paid from', 'Date'];
const DRAFT_SKELETON_WIDTHS = ['54%', '40%', '64%', '48%'] as const;

function DraftSkeleton() {
  const { colors } = useThemeTokens();
  return (
    <View testID="draft-skeleton" accessibilityLabel="Reading your entry" style={formStyles.skeleton}>
      <View style={formStyles.skeletonAmount}>
        <Shimmer width={140} height={44} radius={12} index={0} />
      </View>
      <View style={[formStyles.titleField, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Shimmer width="46%" height={16} radius={8} index={1} />
      </View>
      <View style={[formStyles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {DRAFT_SKELETON_ROWS.map((label, row) => (
          <View
            key={label}
            style={[
              formStyles.skeletonRow,
              row > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
            ]}>
            <ThemedText tone="muted" style={formStyles.skeletonLabel}>
              {label}
            </ThemedText>
            <Shimmer width={DRAFT_SKELETON_WIDTHS[row]} height={14} radius={7} index={row + 2} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** "5 Oct" for a date chip; the stored label when it does not parse. */
const shortDateLabel = (label: string) =>
  parseDateLabel(label)?.toLocaleString('en-GB', { day: 'numeric', month: 'short' }) ?? label;

/** The entry's date with its stored time of day, for the date sheet to start from. */
const entryDateTime = (date: string, time: string) => {
  const day = parseDateLabel(date) ?? new Date();
  const clock = parseTimeOfDay(time);
  return clock
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock.hours, clock.minutes)
    : day;
};

export function TransactionFormModal({
  visible,
  onClose,
  initialData,
  onSave,
  onDelete,
  isEdit,
  emiLink = null,
  mode = 'manual',
  heading,
  onRequestReceiptScan,
  isParsing = false,
  aiReview,
  accounts = emptyAccounts,
  splitFriends = emptySplitFriends,
  splitGroups = emptySplitGroups,
  onManageAccounts,
  accountSuggestion = null,
  refundReceived = null,
  recordRefund = true,
  onRecordRefundChange,
  accountMatches = [],
  newAccountSuggestion = null,
  onSetupSuggestedAccount,
  onAutoCreateSuggestedAccount,
  onDraftChange,
  initialFocus,
  categorySuggestions = [],
  recentEntries = emptyRecentEntries,
  authToken,
  splitContext,
}: TransactionFormModalProps) {
  const personalPayment = splitContext?.personalPayment ?? true;
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;

  /**
   * Compact entry: title, amount and transaction type stay visible, with each
   * optional field offered as an "add" chip until it is wanted.
   *
   * Only new manual entries take this path. An AI draft is a review, not a
   * capture — the amount already exists and the job is checking it (W7 owns
   * that screen). Editing an existing entry is the same argument. Quick-prompt
   * creation is a form for a shortcut, not a transaction.
   */
  const fastEntry = mode === 'manual' && !isEdit;

  /**
   * The AI draft review: the same sheet, but ranked by how sure the parser
   * was, with what it guessed at the top and what it is confident about folded
   * into a line. Only a fresh draft takes it — editing a saved entry has no
   * confidence to rank by, and a manual entry has no AI in it at all.
   */
  const draftReview = mode === 'audio' && !isEdit;

  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const motion = useMotion();
  /**
   * The latest `initialData`, for the two places that deliberately re-seed.
   * Kept as a ref rather than a dependency for the reason spelled out on
   * `seedForm`: making it one would reset in-progress edits on every parent
   * render.
   */
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const panelAnim = useSharedValue(SCREEN_HEIGHT);
  const backdropAnim = useSharedValue(0);
  /** Horizontal nudge for the validation shake. */
  const shakeAnim = useSharedValue(0);
  const [showModal, setShowModal] = useState(visible);

  /**
   * Puts the panel back where an open sheet belongs.
   *
   * Reported from a device: after a bill photo was picked, the review sheet
   * came back stuck part-way up the screen and could be neither closed nor
   * dragged, so the draft (and its credits) had to be thrown away. The slide
   * is a Reanimated timing on the UI thread, and the camera or photo picker
   * pauses the app around it; the slide could stop where it was. So every
   * moment that can end such a pause re-settles the panel: the window being
   * shown, the app becoming active again, the slide's own expected end, and
   * the draft landing. Each is a no-op on a sheet that is already in place.
   */
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const settlePanel = useCallback(() => {
    if (!visibleRef.current) return;
    panelAnim.value = withTiming(0, motion.enter('sheet'));
    backdropAnim.value = withTiming(1, motion.enter('base'));
  }, [backdropAnim, motion, panelAnim]);

  useEffect(() => {
    if (!showModal) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') settlePanel();
    });
    return () => subscription.remove();
  }, [settlePanel, showModal]);
  // iOS's KeyboardAvoidingView already reserves the keyboard. Android modal
  // windows are not reliably resized, so their inset belongs at the end of the
  // scroll content—not inside the mid-list split section.
  const keyboardInset = useKeyboardInset(showModal && Platform.OS === 'android');
  // Save is pinned to the bottom of a modal that draws under the nav bar.
  const footerBottom = useBottomInset(16);
  const resolveEntryFormAccount = useCallback(
    (nextForm: EntryForm): EntryForm => {
      if (!personalPayment) return { ...nextForm, accountId: null, account: '' };
      const preferredAccount = getPreferredAccountForPaymentMode(accounts, nextForm.mode);
      if (nextForm.accountId !== null) {
        const selectedAccount = accounts.find((account) => account.id === nextForm.accountId);
        const isCompatible = getAccountsForPaymentMode(accounts, nextForm.mode).some(
          (account) => account.id === nextForm.accountId
        );
        if (selectedAccount && isCompatible) {
          if ((nextForm.account ?? '').trim().length === 0) {
            return { ...nextForm, account: selectedAccount.name };
          }
          return nextForm;
        }
      }
      if (preferredAccount) {
        return { ...nextForm, accountId: preferredAccount.id, account: preferredAccount.name };
      }
      return { ...nextForm, accountId: null, account: '' };
    },
    [accounts, personalPayment]
  );

  const [form, setForm] = useState<EntryForm>(() =>
    resolveEntryFormAccount({
      title: '',
      amount: '',
      type: 'Expense',
      mode: 'Cash',
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
      emiTotalInstalments: '',
      emiPaidInstalments: '',
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
      ...initialData,
    })
  );

  /**
   * More details, opened or closed by hand since the sheet opened; `null`
   * until then, when it follows whether anything under it holds a value — a
   * value hidden behind a fold would read as a value lost.
   */
  const [moreDetailsToggled, setMoreDetailsToggled] = useState<boolean | null>(null);
  const [isTagPickerVisible, setIsTagPickerVisible] = useState(false);
  const [isSubscriptionOptionsOpen, setIsSubscriptionOptionsOpen] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  /**
   * Any system keyboard, not only the title's. The optional fields can now sit
   * on the capture screen itself, and each of them — a note, a merchant, a
   * friend's share — brings the system keyboard up over the keypad. The title
   * flag alone could only stand the pad down for the title.
   */
  const [isSystemKeyboardUp, setIsSystemKeyboardUp] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  // Explicit picker/quick-fill choices take precedence over title hints.
  const categoryChosenRef = useRef(false);
  const [draftPlan, setDraftPlan] = useState<DraftReviewPlan | null>(null);
  /** Flagged fields the user has since opened or edited. */
  const [checkedDraftFields, setCheckedDraftFields] = useState<DraftFieldKey[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    entitlement,
    sheetVisible: upgradeSheetVisible,
    capture: captureEntitlement,
    dismiss: dismissUpgrade,
  } = useEntitlementGate();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [splitShareMode, setSplitShareMode] = useState<TransactionSplitShareMode>('amount');
  const [isDiscardDialogVisible, setIsDiscardDialogVisible] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const autoFocusedFieldRef = useRef<string | null>(null);
  const amountInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const shown = () => setIsSystemKeyboardUp(true);
    const subscriptions = [
      // iOS announces the keyboard before it moves; Android only once it has.
      Keyboard.addListener('keyboardWillShow', shown),
      Keyboard.addListener('keyboardDidShow', shown),
      Keyboard.addListener('keyboardDidHide', () => {
        setIsSystemKeyboardUp(false);
        setIsTitleFocused(false);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  useEffect(() => {
    if (visible) onDraftChange?.(form);
  }, [form, onDraftChange, visible]);

  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(parseDateLabel(form.date) ?? new Date());
  const [isSubscriptionDatePickerVisible, setIsSubscriptionDatePickerVisible] = useState(false);
  const [pendingSubscriptionDate, setPendingSubscriptionDate] = useState<Date>(new Date());
  const [isCancellationDatePickerVisible, setIsCancellationDatePickerVisible] = useState(false);
  const [pendingCancellationDate, setPendingCancellationDate] = useState<Date>(new Date());
  const [isModePickerVisible, setIsModePickerVisible] = useState(false);
  const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isRefundDatePickerVisible, setIsRefundDatePickerVisible] = useState(false);
  const [emiCalculation, setEmiCalculation] = useState<EMICalculation | null>(null);
  const [emiCalculationError, setEmiCalculationError] = useState<string | null>(null);
  const [isCalculatingEMI, setIsCalculatingEMI] = useState(false);

  useEffect(() => {
    if (!visible) {
      autoFocusedFieldRef.current = null;
      return;
    }
    if (!initialFocus || autoFocusedFieldRef.current === initialFocus) {
      return;
    }
    autoFocusedFieldRef.current = initialFocus;
    const timer = setTimeout(() => {
      if (initialFocus === 'category') {
        setIsCategoryPickerVisible(true);
      } else if (initialFocus === 'account') {
        setIsAccountPickerVisible(true);
      }
    }, 360);
    return () => clearTimeout(timer);
  }, [initialFocus, visible]);
  const compatibleAccounts = useMemo(
    () => getAccountsForPaymentMode(accounts, form.mode),
    [accounts, form.mode]
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId) ?? null,
    [accounts, form.accountId]
  );
  /**
   * Tags only mean something for money going out. Every one but General is an
   * expense idea — money invested, lent, paid in instalments, paid for a
   * subscription, or partly coming back — and EMI, Refundable and Subscription
   * each open fields only an expense can fill (the API refuses a refund on
   * income outright). So income has no tag picker and saves as General.
   */
  const tagsApply = form.type === 'Expense';
  const isEMICreditCard =
    personalPayment &&
    !isEdit &&
    tagsApply &&
    form.tag === 'EMI' &&
    normalizeAccountType(selectedAccount?.type) === 'credit_card';
  const emiFirstInstallment = useMemo(() => nextMonthClamped(form.date), [form.date]);

  // Loan and other non-card EMIs are plain monthly debits, so instead of an
  // instalment schedule they get the app's existing recurring-payment record,
  // set to auto-debit. Cash can't auto-debit, so it is not offered there.
  const [emiRepeats, setEmiRepeats] = useState(false);
  const canRepeatEmi =
    personalPayment &&
    // On an existing entry only when nothing is tied to it yet — otherwise the
    // toggle would create a second recurring payment for the same loan.
    (!isEdit || emiLink === null) &&
    form.tag === 'EMI' &&
    form.type === 'Expense' &&
    !isEMICreditCard &&
    form.mode !== 'Cash' &&
    form.mode !== 'Credit Card' &&
    // Auto-debit is tied to the account the money leaves; the API rejects it
    // without one.
    form.accountId != null;
  const emiRepeatActive = emiRepeats && canRepeatEmi;
  const emiNextDebit = useMemo(() => {
    const next = nextMonthlyAfterToday(form.date);
    return next ? formatApiDate(next) : '';
  }, [form.date]);

  useEffect(() => {
    if (emiRepeatActive) {
      setForm((prev) => {
        const next = {
          ...prev,
          subscriptionEnabled: true,
          subscriptionName: prev.title.trim() || prev.merchant.trim() || 'EMI',
          subscriptionMerchant: prev.merchant,
          subscriptionCategory: prev.category,
          subscriptionAmount: prev.amount,
          subscriptionBillingInterval: 'monthly' as const,
          subscriptionNextDueDate: emiNextDebit,
          subscriptionAutopay: true,
        };
        const unchanged = (Object.keys(next) as (keyof typeof next)[]).every(
          (key) => next[key] === prev[key]
        );
        return unchanged ? prev : next;
      });
    } else if (emiRepeats) {
      // The EMI stopped being repeatable (tag, account or type changed).
      setEmiRepeats(false);
      setForm((prev) => ({ ...prev, subscriptionEnabled: false, subscriptionAutopay: false }));
    }
  }, [
    emiRepeatActive,
    emiRepeats,
    emiNextDebit,
    form.title,
    form.merchant,
    form.category,
    form.amount,
  ]);

  useEffect(() => {
    const amount = Number(form.amount.replace(/,/g, ''));
    const tenure = Number(form.emiTenureMonths);
    const rate = Number(form.emiRatePct || 0);
    if (
      !visible ||
      !authToken ||
      !isEMICreditCard ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(tenure) ||
      tenure <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      setEmiCalculation(null);
      setEmiCalculationError(null);
      setIsCalculatingEMI(false);
      return;
    }
    let cancelled = false;
    setIsCalculatingEMI(true);
    setEmiCalculationError(null);
    const timer = setTimeout(() => {
      void calculateEMI(authToken, {
        principal_amount: amount,
        annual_interest_rate_percent: rate,
        tenure_months: tenure,
      })
        .then((result) => {
          if (!cancelled) setEmiCalculation(result);
        })
        .catch(() => {
          if (!cancelled) {
            setEmiCalculation(null);
            setEmiCalculationError('Could not calculate the EMI schedule.');
          }
        })
        .finally(() => {
          if (!cancelled) setIsCalculatingEMI(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authToken, form.amount, form.emiRatePct, form.emiTenureMonths, isEMICreditCard, visible]);
  const paymentLanguage = getPaymentLanguage(form.type);
  const modeOptions = useMemo(
    () =>
      form.type === 'Income'
        ? PAYMENT_MODES.filter((option) => option !== 'Credit Card')
        : PAYMENT_MODES,
    [form.type]
  );

  useEffect(() => {
    if (form.type !== 'Income' || form.mode !== 'Credit Card') return;
    setForm((previous) =>
      resolveEntryFormAccount({ ...previous, mode: 'Bank Account', accountId: null, account: '' })
    );
  }, [form.mode, form.type, resolveEntryFormAccount]);
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState('');
  const suggestionKey = accountSuggestion
    ? `${accountSuggestion.type}:${accountSuggestion.provider}:${accountSuggestion.identifier}`
    : '';
  const visibleAccountSuggestion =
    accountSuggestion && suggestionKey !== dismissedSuggestionKey ? accountSuggestion : null;
  const genericAutoAccount = getAutoAccountPayloadForPaymentMode(form.mode);
  const actionableAccountSuggestion: AccountSuggestion | null =
    visibleAccountSuggestion ??
    (genericAutoAccount
      ? {
          type: genericAutoAccount.type,
          name: genericAutoAccount.name,
          color: genericAutoAccount.color,
          provider: '',
          identifier: '',
          reason: `This matches ${form.mode}`,
        }
      : null);
  const [autoCreatingAccount, setAutoCreatingAccount] = useState(false);
  const [autoCreateAccountError, setAutoCreateAccountError] = useState<string | null>(null);
  /**
   * The account "Create one for me" just made, for its confirmation line.
   *
   * Held with its id, and the line shows only while that account is still the
   * one selected. Reported from a device: the sheet stays mounted between bill
   * scans, and "Axis Bank Account created and selected" from one scan sat on
   * the next one's review — over a credit card draft it had nothing to do with.
   */
  const [autoCreatedAccount, setAutoCreatedAccount] = useState<{ id: number; name: string } | null>(
    null
  );
  const autoCreatedAccountName =
    autoCreatedAccount && autoCreatedAccount.id === form.accountId ? autoCreatedAccount.name : '';

  /** A new sheet, or a new draft in it, starts with no account-creation news. */
  const resetAutoCreateFeedback = useCallback(() => {
    setAutoCreatedAccount(null);
    setAutoCreateAccountError(null);
    setDismissedSuggestionKey('');
  }, []);

  const handleAutoCreateSuggestedAccount = useCallback(
    async (suggestion: AccountSuggestion) => {
      if (!onAutoCreateSuggestedAccount || autoCreatingAccount) return;
      setAutoCreatingAccount(true);
      setAutoCreateAccountError(null);
      try {
        const saved = await onAutoCreateSuggestedAccount(suggestion);
        setForm((previous) => ({ ...previous, accountId: saved.id, account: saved.name }));
        setAutoCreatedAccount({ id: saved.id, name: saved.name });
        setDismissedSuggestionKey(suggestionKey);
        setIsAccountPickerVisible(false);
        haptics.saved();
      } catch (error) {
        haptics.rejected();
        setAutoCreateAccountError(
          getFriendlyErrorMessage(
            error,
            'Could not create the account. You can still save without it.'
          )
        );
      } finally {
        setAutoCreatingAccount(false);
      }
    },
    [autoCreatingAccount, onAutoCreateSuggestedAccount, suggestionKey]
  );

  /**
   * Result of "Create one for me", rendered wherever that button is offered.
   *
   * It used to live only inside the `showFullForm` branch, and
   * `showFullForm = !draftReview && …` — so on the AI draft sheet, the one place
   * the button is most used, a failure produced no error and a success produced
   * no confirmation. The button looked dead. Both call sites render this now.
   */
  const renderAutoCreateFeedback = () => {
    if (!autoCreatedAccountName && !autoCreateAccountError) return null;
    return (
      <>
        {autoCreatedAccountName ? (
          <View
            className="mt-3 flex-row items-center gap-2 rounded-2xl px-3 py-2"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={accent} />
            <ThemedText className="text-xs font-bold" style={{ color: accent }}>
              {autoCreatedAccountName} created and selected
            </ThemedText>
          </View>
        ) : null}
        {autoCreateAccountError ? (
          <ThemedText tone="negative" className="mt-2 text-xs">
            {autoCreateAccountError}
          </ThemedText>
        ) : null}
      </>
    );
  };

  const reviewFields = useMemo(() => {
    const fields = new Set(aiReview?.missingFields ?? []);
    Object.entries(aiReview?.needsConfirmation ?? {}).forEach(([field, needsConfirmation]) => {
      if (needsConfirmation) fields.add(field);
    });
    Object.entries(aiReview?.confidence ?? {}).forEach(([field, confidence]) => {
      if (confidence < 0.7) fields.add(field);
    });
    return Array.from(fields);
  }, [aiReview]);
  const hasReviewMetadata = Boolean(
    aiReview?.confidence ||
    aiReview?.needsConfirmation ||
    aiReview?.missingFields ||
    aiReview?.clarifications
  );
  const accountNeedsReview = reviewFields.includes('account') || reviewFields.includes('accountId');
  const displayedCategory = normalizeCategoryValue(form.category, form.type);
  const customCategoryType = categoryTypeOf(form.type);
  const customCategories = useUserCategories((state) => state.categories[customCategoryType]);
  const loadCustomCategories = useUserCategories((state) => state.load);
  const keepCustomCategory = useUserCategories((state) => state.add);
  const removeCustomCategory = useUserCategories((state) => state.remove);
  const sessionToken = useAuthStore((state) => state.token);
  // Read each time the sheet opens: a category added on another device, or
  // carried by an entry saved since, belongs in this list too.
  useEffect(() => {
    if (visible && sessionToken) void loadCustomCategories(sessionToken);
  }, [loadCustomCategories, sessionToken, visible]);
  const selectableCategoryOptions = useMemo(
    () => mergeCategoryOptions(form.category, form.type, customCategories),
    [customCategories, form.category, form.type]
  );
  const visibleCategorySuggestions = useMemo(() => {
    const unique = new Set<string>();
    categorySuggestions.forEach((suggestion) => {
      const normalized = normalizeCategoryValue(suggestion, form.type);
      if (
        normalized &&
        normalized.toLowerCase() !== displayedCategory.toLowerCase() &&
        normalized.toLowerCase() !== 'uncategorized'
      ) {
        unique.add(normalized);
      }
    });
    return Array.from(unique).slice(0, 3);
  }, [categorySuggestions, displayedCategory, form.type]);

  /**
   * The keypad is up whenever the sheet is in its capture state and no text
   * field has the system keyboard. A note or a merchant typed on the capture
   * screen stands the pad down while it is being typed — two keyboards fighting
   * for the same 250dp is worse than either — and tapping the amount brings it
   * back.
   *
   * This used to be a mode: More details swapped the whole capture screen for
   * the full form, so wanting a note meant being shown amount, payment mode,
   * date, account and category a second time, plus a split card, before
   * finding the note at the bottom. Optional details are chips now, and each
   * one adds only itself.
   */
  const isCompactEntry = fastEntry;
  const isKeypadVisible =
    isCompactEntry && !isTitleFocused && !isSystemKeyboardUp && keyboardInset === 0;
  const amountEntered = hasEnteredAmount(form.amount);
  const quickFills = useMemo(
    () => (fastEntry ? buildQuickFills(recentEntries, form.type) : []),
    [fastEntry, form.type, recentEntries]
  );
  const displayedCategoryVisual = categoryVisual(displayedCategory, form.type);

  // Worked out on every render, not memoised: the sheet stays mounted for the
  // life of the screen, and a memo pinned "Today" to the day it first drew.
  // After midnight, Today and Yesterday each meant a day earlier than they
  // said, so an entry picked as Yesterday saved two days back.
  const dateChoices = buildDateChoices(new Date());
  const isCustomDate = !dateChoices.some((choice) => choice.value === form.date);

  /**
   * The ranking is pinned to the draft as it arrived, not recomputed as the
   * user works. Two reasons: a card that stops being uncertain the moment a
   * character is typed would slide out from under the finger typing it, and
   * "what the AI was unsure about" is a fact about the parse, not about the
   * form's current contents.
   */
  useEffect(() => {
    if (!visible || !draftReview || isParsing) {
      // Building a plan out of an empty draft would rank nothing and then be
      // thrown away the moment the parse lands.
      setDraftPlan(null);
      setCheckedDraftFields([]);
      return;
    }
    setCheckedDraftFields([]);
    setDraftPlan(
      buildDraftReviewPlan({
        confidence: aiReview?.confidence,
        needsConfirmation: aiReview?.needsConfirmation,
        missingFields: aiReview?.missingFields,
        values: {
          amount: initialData?.amount,
          type: initialData?.type,
          title: initialData?.title,
          category: initialData?.category,
          mode: initialData?.mode,
          // The sheet fills a compatible account in on open, so reading the
          // raw draft here would report every UPI entry as missing one.
          account:
            initialData?.account ||
            getPreferredAccountForPaymentMode(accounts, initialData?.mode ?? '')?.name ||
            '',
          date: initialData?.date,
          merchant: initialData?.merchant,
          tag: initialData?.tag,
          notes: initialData?.notes,
        },
      })
    );
    // `initialData` is a fresh object on every keystroke the parent hears
    // about, and `accounts` refetches while the sheet is open — either in the
    // dependency list would rebuild the plan mid-review and drop the chips the
    // user has already answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draftReview, isParsing, aiReview]);

  const markDraftFieldChecked = useCallback((field: DraftFieldKey) => {
    setCheckedDraftFields((previous) =>
      previous.includes(field) ? previous : [...previous, field]
    );
  }, []);

  // The amount is its own headline above the list, so it never appears twice.
  // An income draft has no tag to review — see `tagsApply`.
  const isDraftFieldShown = useCallback(
    (field: DraftFieldKey) => field !== 'amount' && (field !== 'tag' || tagsApply),
    [tagsApply]
  );
  const draftPendingCount = (draftPlan?.flagged ?? []).filter(
    (field) =>
      (field === 'amount' || isDraftFieldShown(field)) && !checkedDraftFields.includes(field)
  ).length;

  const handleAmountChange = useCallback((amount: string) => {
    setFormError(null);
    setForm((prev) => ({ ...prev, amount }));
  }, []);

  const handleTitleChange = (title: string) => {
    const shouldInfer = fastEntry && !categoryChosenRef.current;
    setFormError(null);
    setForm((previous) => ({
      ...previous,
      title,
      category: shouldInfer
        ? (inferTransactionCategory(title, previous.type) ?? defaultCategoryForType(previous.type))
        : previous.category,
    }));
  };

  const selectCategory = (category: string) => {
    categoryChosenRef.current = true;
    setForm((previous) => ({ ...previous, category }));
  };

  const selectTransactionType = (type: 'Expense' | 'Income') => {
    if (form.type === type) return;
    categoryChosenRef.current = false;
    setForm((previous) => ({
      ...previous,
      type,
      category:
        (fastEntry ? inferTransactionCategory(previous.title, type) : null) ??
        defaultCategoryForType(type),
      // See `tagsApply`: an expense's tag has nothing to mean on income.
      tag: type === 'Income' ? 'General' : previous.tag,
    }));
  };

  const focusAmountKeypad = () => {
    titleInputRef.current?.blur();
    Keyboard.dismiss();
    setIsTitleFocused(false);
  };

  /**
   * A share held as a percentage follows the total.
   *
   * This is what makes a percentage typed before the amount — or an equal split
   * chosen before it — mean anything: the shares are recomputed the moment the
   * total exists, and again whenever it is corrected. Shares entered as amounts
   * carry no percentage and are left exactly as the user typed them.
   *
   * The identity check matters: returning `prev` unchanged when nothing moved
   * is what keeps this from re-entering itself on every render.
   */
  useEffect(() => {
    setForm((prev) => {
      if (!prev.splitEnabled) return prev;
      let changed = false;
      const splitParticipants = prev.splitParticipants.map((participant) => {
        if (participant.sharePercent == null) return participant;
        const shareAmount = shareFromPercent(participant.sharePercent, prev.amount);
        if (shareAmount === participant.shareAmount) return participant;
        changed = true;
        return { ...participant, shareAmount };
      });
      return changed ? { ...prev, splitParticipants } : prev;
    });
  }, [form.amount, form.splitEnabled]);

  /**
   * One tap for a whole transaction shape. Category-only chips leave the
   * payment mode and account alone — see the note on `QuickFill`.
   */
  const applyQuickFill = useCallback(
    (fill: QuickFill) => {
      categoryChosenRef.current = true;
      setFormError(null);
      setForm((prev) => {
        const next: EntryForm = { ...prev, category: fill.category };
        if (fill.kind === 'merchant') {
          next.title = fill.title ?? fill.label;
          next.merchant = fill.merchant ?? '';
          if (fill.mode) {
            next.mode = fill.mode;
          }
          if (fill.accountId != null) {
            next.accountId = fill.accountId;
            next.account = fill.accountName ?? '';
          }
        }
        return resolveEntryFormAccount(next);
      });
    },
    [resolveEntryFormAccount]
  );

  /**
   * Seeding is separate from the panel animation because the sheet can now open
   * *before* it has anything to show: the draft path opens on the parse call
   * and the fields arrive two to four seconds later. The seed effect therefore
   * fires on `visible` and again when `isParsing` falls, and it deliberately
   * still ignores `initialData` itself — see the note at the bottom, which is
   * the original reason this is not a plain dependency.
   */
  const seedForm = useCallback(() => {
    // Read through the ref, never the closure. `seedForm` is memoized on
    // things that rarely change, so a captured `initialData` would be
    // whatever it was when those last moved — which for the draft path is the
    // empty form the sheet opened on, two seconds before the parse landed.
    const initialData = initialDataRef.current;
    const seeded = resolveEntryFormAccount({
      title: '',
      amount: '',
      type: 'Expense',
      mode: 'Cash',
      category: defaultCategoryForType(initialData?.type),
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
      emiTotalInstalments: '',
      emiPaidInstalments: '',
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
      ...initialData,
    });
    categoryChosenRef.current =
      normalizeCategoryValue(seeded.category, seeded.type) !== defaultCategoryForType(seeded.type);
    if (fastEntry && !categoryChosenRef.current) {
      seeded.category =
        inferTransactionCategory(seeded.title, seeded.type) ?? defaultCategoryForType(seeded.type);
    }
    // A quick prompt seeds "120.00"; the keypad would then refuse every
    // further digit because both decimal places are already spent.
    setForm(fastEntry ? { ...seeded, amount: toKeypadValue(seeded.amount) } : seeded);
    // No `initialData` dependency, and no suppression needed for its absence:
    // the local read above shadows the prop, so the linter sees a callback that
    // genuinely does not close over it. That is the point — reseeding on every
    // parent re-render would wipe in-progress edits, and the two moments that
    // *should* reseed call this deliberately.
  }, [fastEntry, resolveEntryFormAccount]);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      setMoreDetailsToggled(null);
      setIsSubscriptionOptionsOpen(false);
      setIsTitleFocused(false);
      setFormError(null);
      resetAutoCreateFeedback();
      seedForm();

      // A timed slide, not a spring: the spring overshot and rang two or three
      // times, and the form can't be typed into until it stops moving.
      panelAnim.value = withTiming(0, motion.enter('sheet'));
      backdropAnim.value = withTiming(1, motion.enter('base'));
      const settleAfterSlide = setTimeout(settlePanel, motion.duration('sheet') + 250);
      return () => clearTimeout(settleAfterSlide);
    }

    panelAnim.value = withTiming(SCREEN_HEIGHT, motion.exit('sheet'), (finished) => {
      'worklet';
      if (finished) runOnJS(setShowModal)(false);
    });
    backdropAnim.value = withTiming(0, motion.exit('base'));
    // `seedForm` is stable across the transition and listing it would re-run the
    // panel animation on an unrelated identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, SCREEN_HEIGHT, backdropAnim, motion, panelAnim, settlePanel]);

  /**
   * The draft landed. Re-seed from the parse result, which arrived after the
   * sheet was already on screen.
   */
  const wasParsing = useRef(isParsing);
  useEffect(() => {
    if (wasParsing.current && !isParsing && visible) {
      resetAutoCreateFeedback();
      seedForm();
      settlePanel();
    }
    wasParsing.current = isParsing;
  }, [isParsing, resetAutoCreateFeedback, seedForm, settlePanel, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setForm((prev) => {
      const next = resolveEntryFormAccount(prev);
      return next.accountId === prev.accountId && next.account === prev.account ? prev : next;
    });
  }, [visible, form.mode, resolveEntryFormAccount]);


  /** The themed calendar (board R2-Date) on both platforms, starting from the entry's own time. */
  const handleOpenDatePicker = () => {
    setPendingDate(entryDateTime(form.date, form.time));
    setIsDatePickerVisible(true);
  };

  const handleConfirmDatePicker = () => {
    setForm((prev) => ({
      ...prev,
      date: formatDateLabel(pendingDate),
      time: formatTime(pendingDate) ?? '',
    }));
    setIsDatePickerVisible(false);
  };

  const handleOpenSubscriptionDatePicker = () => {
    const selectedDate = parseDateLabel(form.subscriptionNextDueDate) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: 'date',
        minimumDate: new Date(),
        onValueChange: (_event, date) => {
          if (date) {
            setForm((prev) => ({ ...prev, subscriptionNextDueDate: formatApiDate(date) }));
          }
        },
        onDismiss: () => undefined,
      });
      return;
    }
    setPendingSubscriptionDate(selectedDate);
    setIsSubscriptionDatePickerVisible(true);
  };

  const handlePickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      if (!asset?.uri) {
        // The receipt row is where this message renders, so it has to be on
        // screen even though nothing was attached.
        setMoreDetailsToggled(true);
        setAttachmentError("That file couldn't be read. Try another one.");
        return;
      }
      setAttachmentError(null);
      // Stored as a local URI here; it is uploaded when the entry is saved.
      setForm((prev) => ({ ...prev, attachment: asset.uri }));
    } catch {
      setMoreDetailsToggled(true);
      setAttachmentError("That file couldn't be read. Try another one.");
    }
  };

  /** Whether anything folded under More details holds a value. */
  const detailsHaveValues =
    form.merchant.trim().length > 0 ||
    form.notes.trim().length > 0 ||
    (tagsApply && form.tag.trim().length > 0 && form.tag !== 'General') ||
    Boolean(form.attachment) ||
    (form.splitEnabled && !splitContext);
  const isMoreDetailsOpen = moreDetailsToggled ?? detailsHaveValues;

  /** Bill scanning is for a fresh personal entry; a split has its own composer. */
  const canScanReceipt = fastEntry && !splitContext && !!onRequestReceiptScan;

  const handleRemoveAttachment = () => {
    setAttachmentError(null);
    setForm((prev) => ({ ...prev, attachment: null }));
  };

  /**
   * Every way Save can refuse goes through here.
   *
   * There were fifteen of them and they were fifteen bare `setFormError` calls,
   * which is how a message ends up rendered several hundred pixels below a
   * keyboard with nothing to say it arrived. The haptic and the shake are the
   * part the user actually notices, and routing every refusal through one
   * function is the only reason all fifteen have them.
   *
   * A rejection from the server counts. The spec says "validation failure", but
   * from the finger's point of view a 422 and a missing field are the same
   * event — Save was pressed and nothing saved.
   */
  const rejectSave = useCallback(
    (message: string) => {
      setFormError(message);
      haptics.rejected();
      if (motion.reduced) return;
      // Two nudges out and back, per the spec. The last step lands exactly on 0
      // so the panel cannot be left a few pixels off-centre if the sequence is
      // interrupted by the sheet closing.
      const step = motion.duration('instant') / 2;
      shakeAnim.value = withSequence(
        withTiming(-SHAKE_OFFSET, { duration: step }),
        withTiming(SHAKE_OFFSET, { duration: step }),
        withTiming(-SHAKE_OFFSET, { duration: step }),
        withTiming(0, { duration: step })
      );
    },
    [motion, shakeAnim]
  );

  const handleConfirmEntry = async () => {
    // Mid-parse the form holds none of the AI's answers yet, so a save here
    // submits an empty draft and fails.
    if (isSaving || (draftReview && isParsing)) return;
    const normalizedForm = {
      ...form,
      // Amount-first means the amount is the only thing the user owes us. The
      // merchant, or failing that the category, is exactly what the feed would
      // have shown for a blank title anyway — and the backend requires one.
      // Every other mode still asks, because there the title is under review.
      title:
        fastEntry && form.title.trim().length === 0
          ? form.merchant.trim() || normalizeCategoryValue(form.category, form.type)
          : form.title,
      category: normalizeCategoryValue(form.category, form.type),
      date: normalizeDateValue(form.date),
      subscriptionCategory: form.subscriptionEnabled
        ? normalizeCategoryValue(form.subscriptionCategory || form.category, 'Expense')
        : form.subscriptionCategory,
    };
    // The subscription's name falls back the way the entry's title does.
    normalizedForm.subscriptionName = form.subscriptionEnabled
      ? form.subscriptionName.trim() || form.merchant.trim() || normalizedForm.title
      : form.subscriptionName;
    const missingField = requiredFields.find((field) => {
      const value = normalizedForm[field];
      return typeof value === 'string' ? value.trim().length === 0 : !value;
    });

    if (missingField) {
      rejectSave(missingFieldMessages[missingField]);
      return;
    }
    const amountValue = Number(form.amount.replace(/,/g, ''));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      rejectSave('Enter an amount above zero.');
      return;
    }
    if (personalPayment && tagsApply && form.tag === 'Refundable') {
      const refundableAmount = Number(form.refundableAmount.replace(/,/g, ''));
      if (!Number.isFinite(refundableAmount) || refundableAmount <= 0) {
        rejectSave('Enter how much you expect back.');
        return;
      }
      if (refundableAmount > amountValue) {
        rejectSave("The refund can't be more than what you paid.");
        return;
      }
      if (!parseDateLabel(form.refundExpectedOn)) {
        rejectSave('Pick the date you expect it back.');
        return;
      }
    }
    if (isEMICreditCard) {
      const tenure = Number(form.emiTenureMonths);
      const rate = Number(form.emiRatePct || 0);
      if (!Number.isInteger(tenure) || tenure < 1 || tenure > 360) {
        rejectSave('Pick how many months the EMI runs.');
        return;
      }
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        rejectSave('Enter an interest rate between 0 and 100%.');
        return;
      }
      if (!emiCalculation || isCalculatingEMI) {
        rejectSave('One moment — the EMI schedule is still being worked out.');
        return;
      }
    }
    if (form.splitEnabled && !splitContext) {
      if (form.type !== 'Expense') {
        rejectSave('Only expenses can be split.');
        return;
      }
      if (form.splitParticipants.length === 0) {
        rejectSave('Add at least one friend to split with.');
        return;
      }
      const totalSplit = form.splitParticipants.reduce(
        (sum, participant) => sum + Number(participant.shareAmount || 0),
        0
      );
      const invalidParticipant = form.splitParticipants.find(
        (participant) =>
          Number(participant.shareAmount || 0) <= 0 ||
          (!participant.friendId && participant.friendName.trim().length === 0)
      );
      if (invalidParticipant) {
        rejectSave('Everyone in the split needs a name and an amount.');
        return;
      }
      if (totalSplit > amountValue) {
        rejectSave('The shares add up to more than the total.');
        return;
      }
    }
    if (emiRepeatActive && form.emiTotalInstalments) {
      const total = Number(form.emiTotalInstalments);
      const paid = Number(form.emiPaidInstalments || 1);
      if (!Number.isInteger(total) || total < 1 || total > 600) {
        rejectSave('Total EMIs should be between 1 and 600.');
        return;
      }
      if (!Number.isInteger(paid) || paid < 1 || paid > total) {
        rejectSave("EMIs paid so far (counting this one) can't be more than the total.");
        return;
      }
    }
    if (personalPayment && form.subscriptionEnabled) {
      const subscriptionAmount = Number(form.subscriptionAmount || form.amount);
      const reminderDays = Number(form.subscriptionReminderDays || 0);
      // Name and amount live under the card's More options and start from the
      // payment, so a blank one is a default nobody overrode, not a mistake.
      if (normalizedForm.subscriptionName.trim().length === 0) {
        setIsSubscriptionOptionsOpen(true);
        rejectSave('Give the subscription a name.');
        return;
      }
      if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
        setIsSubscriptionOptionsOpen(true);
        rejectSave('Enter the amount it renews for.');
        return;
      }
      if (!form.subscriptionBillingInterval) {
        rejectSave('Choose how often it repeats.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.subscriptionNextDueDate.trim())) {
        rejectSave('Pick the next payment date.');
        return;
      }
      if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) {
        setIsSubscriptionOptionsOpen(true);
        rejectSave('Reminders can be 0 to 30 days before.');
        return;
      }
      if (
        form.subscriptionCancelBeforeDue &&
        !/^\d{4}-\d{2}-\d{2}$/.test(form.subscriptionCancelOnDate.trim())
      ) {
        setIsSubscriptionOptionsOpen(true);
        rejectSave('Pick when to remind you to cancel.');
        return;
      }
      if (
        (form.subscriptionBillingInterval === 'daily' ||
          form.subscriptionBillingInterval === 'business_daily') &&
        !form.subscriptionAutopay
      ) {
        rejectSave('Daily payments need Autopay turned on.');
        return;
      }
    }

    setFormError(null);
    setIsSaving(true);
    try {
      await onSave({
        ...normalizedForm,
        ...(!personalPayment
          ? {
              accountId: null,
              account: '',
              subscriptionEnabled: false,
            }
          : {}),
      });
      haptics.saved();
      onClose();
    } catch (error) {
      // Saving an entry with a split hits an entitlement-gated path. A 402
      // there is an offer, not a validation failure.
      if (captureEntitlement(error)) {
        return;
      }
      rejectSave(
        getFriendlyErrorMessage(error, "Couldn't save this. Check your connection and try again.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const addSplitParticipant = () => {
    const amountValue = toAmount(form.amount);
    const nextCount = form.splitParticipants.length + 1;
    const defaultShare = equalShareAmount(amountValue, nextCount);
    setForm((prev) => ({
      ...prev,
      splitParticipants: rebalanceSplitParticipants(
        [
          ...prev.splitParticipants,
          {
            friendId: splitFriends[0]?.id ?? null,
            friendName: '',
            shareAmount: defaultShare,
            direction: 'friend_owes_user',
          },
        ],
        amountValue
      ),
    }));
  };

  /**
   * Everything split evenly. Adding or removing a share redistributes, and so
   * does the "Split equally" button.
   *
   * It writes the percentage as well as the amount, so the result is visible in
   * whichever unit the user is looking at — and so an even split entered before
   * the amount still lands once the amount arrives.
   */
  const rebalanceSplitParticipants = (
    participants: SplitParticipantForm[],
    amountValue = toAmount(form.amount)
  ) => {
    if (participants.length === 0) return participants;
    const sharePercent = equalSharePercent(participants.length);
    const shareAmount = equalShareAmount(amountValue, participants.length);
    return participants.map((participant) => ({ ...participant, sharePercent, shareAmount }));
  };

  const applyEqualSplit = (participants?: SplitParticipantForm[]) => {
    setForm((prev) => {
      const base = participants ?? prev.splitParticipants;
      if (base.length === 0) return prev;
      return {
        ...prev,
        splitParticipants: rebalanceSplitParticipants(base, toAmount(prev.amount)),
      };
    });
    // With no amount there is nothing to write into the amount fields, and a
    // button that leaves the screen exactly as it found it reads as broken.
    // The percentages are the half of the answer that exists either way, so
    // the view moves to where the result is.
    if (!(toAmount(form.amount) > 0)) {
      setSplitShareMode('percentage');
    }
  };

  const updateSplitParticipant = (index: number, updates: Partial<SplitParticipantForm>) => {
    setForm((prev) => ({
      ...prev,
      splitParticipants: prev.splitParticipants.map((participant, participantIndex) =>
        participantIndex === index ? { ...participant, ...updates } : participant
      ),
    }));
  };

  const removeSplitParticipant = (index: number) => {
    setForm((prev) => ({
      ...prev,
      splitParticipants: rebalanceSplitParticipants(
        prev.splitParticipants.filter((_, participantIndex) => participantIndex !== index),
        toAmount(prev.amount)
      ),
    }));
  };

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (mode !== 'audio') {
      onClose();
      return;
    }
    setIsDiscardDialogVisible(true);
  }, [isSaving, mode, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropAnim.value }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelAnim.value }, { translateX: shakeAnim.value }],
  }));

  /**
   * The handle at the top is a real handle now: drag down to close, let go
   * early to spring back. Dragging up, or letting go, also puts a panel that
   * is somehow out of place back where it belongs. A draft review asks before
   * discarding, so it springs back and leaves the choice to that dialog.
   */
  const closeFromDrag = useCallback(() => {
    if (splitContext?.onBack) {
      settlePanel();
      splitContext.onBack();
      return;
    }
    if (isSaving || mode === 'audio') settlePanel();
    requestClose();
  }, [isSaving, mode, requestClose, settlePanel, splitContext]);

  const dragToClose = useMemo(() => {
    const springBack = motion.enter('base');
    return Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onUpdate((event) => {
        panelAnim.value = Math.max(0, event.translationY);
      })
      .onEnd((event) => {
        if (event.translationY > 120 || event.velocityY > 900) {
          runOnJS(closeFromDrag)();
        } else {
          panelAnim.value = withTiming(0, springBack);
        }
      });
  }, [closeFromDrag, motion, panelAnim]);

  if (!showModal) return null;

  /** The rows and inputs a parse was unsure of, until the user has looked. */
  const isFlagged = (field: DraftFieldKey) => {
    if (draftReview) {
      return (draftPlan?.flagged.includes(field) ?? false) && !checkedDraftFields.includes(field);
    }
    if (field === 'account') return accountNeedsReview;
    return reviewFields.includes(field);
  };
  const fieldsToCheck = draftReview ? draftPendingCount : reviewFields.length;
  const showDraftStatus = draftReview || (isEdit && reviewFields.length > 0);
  const sheetTitle =
    heading ??
    (mode === 'quick-prompt'
      ? isEdit
        ? 'Edit quick prompt'
        : 'New quick prompt'
      : splitContext
        ? 'New split expense'
        : null);
  const canSplit = !splitContext && mode !== 'quick-prompt' && form.type === 'Expense';
  const canAttach = mode !== 'quick-prompt';
  const modeVisual = paymentModeVisual(form.mode);
  const accountValue =
    form.account ||
    (compatibleAccounts.length === 0
      ? `Add a ${form.mode || 'matching'} account`
      : 'Select an account');
  const moreDetailsSummary = [
    form.merchant.trim(),
    form.notes.trim() ? 'Note' : '',
    tagsApply && form.tag && form.tag !== 'General' ? form.tag : '',
    form.attachment ? 'Receipt' : '',
    canSplit && form.splitEnabled ? 'Split' : '',
  ].filter(Boolean);
  const moreDetailsOffer = [
    'Merchant',
    'note',
    tagsApply ? 'tag' : '',
    canAttach ? 'receipt' : '',
    canSplit ? 'split' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const saveLabel = isEdit
    ? mode === 'quick-prompt'
      ? 'Save prompt'
      : 'Save changes'
    : mode === 'quick-prompt'
      ? 'Create prompt'
      : 'Save';

  const setDateChoice = (date: string) => {
    markDraftFieldChecked('date');
    setForm((prev) => ({ ...prev, date, time: formatTime(new Date()) ?? prev.time }));
  };

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none" // we handle animations manually for better control
      onShow={settlePanel}
      onRequestClose={splitContext?.onBack ?? requestClose}>
      {/* A modal is its own window on Android, outside the app's gesture root. */}
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View className="absolute inset-0 bg-black/40" style={backdropStyle}>
          <View style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View style={[{ height: '92%', width: '100%' }, panelStyle]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1">
            <View style={[formStyles.panel, { backgroundColor: theme.background }]}>
              {/* The handle and the header both drag the sheet down; a tap on
                  the type control or the × still lands, since the pan only
                  starts after 6dp of vertical travel. */}
              <GestureDetector gesture={dragToClose}>
                <View testID="sheet-drag-handle">
                  <View style={[formStyles.handle, { backgroundColor: theme.borderStrong }]} />
                  <View style={formStyles.header}>
                    <View style={formStyles.headerSide}>
                      {!splitContext && isFlagged('type') ? <CheckTag /> : null}
                    </View>
                    <View style={formStyles.headerCenter}>
                      {splitContext ? (
                        <ThemedText
                          accessibilityRole="header"
                          numberOfLines={1}
                          style={[formStyles.headerTitle, { color: theme.text }]}>
                          {sheetTitle}
                        </ThemedText>
                      ) : (
                        <Segments
                          active={form.type === 'Income' ? 'Income' : 'Expense'}
                          options={[
                            { key: 'Expense', label: 'Expense', testID: 'entry-type-expense' },
                            { key: 'Income', label: 'Income', testID: 'entry-type-income' },
                          ]}
                          onChange={(type) => {
                            markDraftFieldChecked('type');
                            selectTransactionType(type);
                          }}
                          labelSize={14}
                          style={formStyles.typeToggle}
                        />
                      )}
                    </View>
                    <View style={[formStyles.headerSide, formStyles.headerSideEnd]}>
                      <SheetCloseButton onPress={requestClose} />
                    </View>
                  </View>
                </View>
              </GestureDetector>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 24 : 16 }}>
                {!splitContext && sheetTitle ? (
                  <View style={formStyles.titleBlock}>
                    <ThemedText style={[formStyles.sheetTitle, { color: theme.text }]}>
                      {sheetTitle}
                    </ThemedText>
                    {mode === 'quick-prompt' ? (
                      <ThemedText tone="muted" style={formStyles.caption}>
                        One tap on this prompt fills all of this in for you.
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {draftReview && aiReview?.sourceText ? (
                  <View style={formStyles.sourceBlock}>
                    <TransactionDraftSource
                      inputSource={aiReview.inputSource}
                      sourceText={aiReview.sourceText}
                    />
                  </View>
                ) : null}

                {draftReview && isParsing ? (
                  <>
                    <View style={formStyles.amountBlock}>
                      <TransactionDraftStatus
                        isParsing
                        fieldsToCheck={0}
                        hasReviewMetadata={false}
                      />
                    </View>
                    <DraftSkeleton />
                  </>
                ) : (
                  <>
                    <View style={formStyles.amountBlock}>
                      {fastEntry ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Edit amount"
                          onPress={focusAmountKeypad}
                          style={formStyles.amountTouch}>
                          <AmountDisplay value={form.amount} />
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Edit amount"
                          onPress={() => amountInputRef.current?.focus()}
                          style={formStyles.amountRow}>
                          <ThemedText tone="muted" style={formStyles.amountSymbol}>
                            {CURRENCY_SYMBOL}
                          </ThemedText>
                          <TextInput
                            ref={amountInputRef}
                            testID="entry-amount-input"
                            accessibilityLabel="Amount"
                            value={form.amount}
                            onChangeText={(text) => {
                              handleAmountChange(text);
                              markDraftFieldChecked('amount');
                            }}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={theme.muted}
                            selectionColor={accent}
                            style={[
                              formStyles.amountInput,
                              { color: isFlagged('amount') ? theme.warning : theme.text },
                            ]}
                          />
                        </Pressable>
                      )}

                      {canScanReceipt ? (
                        <PressableView
                          testID="scan-receipt"
                          onPress={onRequestReceiptScan}
                          accessibilityRole="button"
                          accessibilityLabel="Scan a bill"
                          accessibilityHint="Photograph a bill or pick a photo, and Finnri fills in this entry."
                          hitSlop={6}
                          style={formStyles.scanLink}
                          pressedStyle={formStyles.pressed}>
                          <MaterialCommunityIcons name="camera-outline" size={18} color={theme.text} />
                          <ThemedText style={[formStyles.scanLabel, { color: theme.text }]}>
                            Scan a bill
                          </ThemedText>
                        </PressableView>
                      ) : null}

                      {showDraftStatus ? (
                        <TransactionDraftStatus
                          isParsing={false}
                          fieldsToCheck={fieldsToCheck}
                          hasReviewMetadata={draftReview ? hasReviewMetadata : true}
                          // Once every flagged field has been answered the line
                          // reads "No issues flagged", and a question left under
                          // it would contradict it.
                          clarifications={fieldsToCheck > 0 ? aiReview?.clarifications : undefined}
                        />
                      ) : null}
                      {draftReview && aiReview?.smartSortingDisabled ? (
                        <ThemedText tone="muted" style={[formStyles.caption, formStyles.centered]}>
                          Smart Sorting is off, so pick the category and payment details yourself.
                        </ThemedText>
                      ) : null}
                    </View>

                    {/* Optional on the capture path, where a blank title saves
                        as the merchant or category; asked for everywhere else. */}
                    <View
                      style={[
                        formStyles.titleField,
                        isFlagged('title')
                          ? { backgroundColor: theme.warningSurface, borderColor: theme.warningBorder }
                          : { backgroundColor: theme.card, borderColor: theme.border },
                      ]}>
                      <TextInput
                        ref={titleInputRef}
                        testID="entry-title-input"
                        accessibilityLabel="What was it for?"
                        value={form.title}
                        onChangeText={(title) => {
                          handleTitleChange(title);
                          markDraftFieldChecked('title');
                        }}
                        onFocus={() => setIsTitleFocused(true)}
                        onBlur={() => setIsTitleFocused(false)}
                        onSubmitEditing={fastEntry ? focusAmountKeypad : undefined}
                        returnKeyType={fastEntry ? 'next' : 'done'}
                        placeholder={fastEntry ? 'What was it for? (optional)' : 'What was this for?'}
                        placeholderTextColor={theme.muted}
                        selectionColor={accent}
                        style={[formStyles.titleInput, { color: theme.text }]}
                      />
                      {isFlagged('title') ? <CheckTag /> : null}
                    </View>

                    <View
                      style={[
                        formStyles.fieldsCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}>
                      <LabelRow
                        testID="entry-category-picker"
                        accessibilityLabel={`Category ${displayedCategory}`}
                        label="Category"
                        value={displayedCategory}
                        icon={displayedCategoryVisual.icon}
                        iconColor={displayedCategoryVisual.color}
                        flagged={isFlagged('category')}
                        onPress={() => {
                          markDraftFieldChecked('category');
                          setIsCategoryPickerVisible(true);
                        }}
                      />
                      <LabelRow
                        testID="entry-mode-picker"
                        accessibilityLabel={`${paymentLanguage.modeAccessibilityPrefix} ${form.mode}`}
                        label={paymentLanguage.modeLabel}
                        value={form.mode}
                        icon={modeVisual.icon}
                        iconColor={theme.text}
                        flagged={isFlagged('mode')}
                        divider
                        onPress={() => {
                          markDraftFieldChecked('mode');
                          setIsModePickerVisible(true);
                        }}
                      />
                      {personalPayment ? (
                        <LabelRow
                          testID="entry-account-picker"
                          accessibilityLabel={`${paymentLanguage.accountAccessibilityPrefix} ${form.account || 'no account yet'}`}
                          label={paymentLanguage.accountLabel}
                          value={accountValue}
                          icon="wallet-outline"
                          iconColor={theme.text}
                          flagged={isFlagged('account')}
                          divider
                          onPress={() => {
                            markDraftFieldChecked('account');
                            setIsAccountPickerVisible(true);
                          }}
                        />
                      ) : null}
                      {/* A quick prompt is a template: the date is whenever it is
                          used, so it has none. */}
                      {mode !== 'quick-prompt' ? (
                        <LabelRow label="Date" divider flagged={isFlagged('date')}>
                          <View style={formStyles.dateChips}>
                            {dateChoices.map((choice) => (
                              <DateChip
                                key={choice.key}
                                testID={`entry-date-${choice.key}`}
                                label={choice.label}
                                selected={form.date === choice.value}
                                onPress={() => setDateChoice(choice.value)}
                              />
                            ))}
                            <DateChip
                              testID="entry-date-pick"
                              accessibilityLabel={isCustomDate ? `Date ${form.date}` : 'Pick a date'}
                              icon="calendar-blank-outline"
                              label={isCustomDate ? shortDateLabel(form.date) : undefined}
                              selected={isCustomDate}
                              onPress={() => {
                                markDraftFieldChecked('date');
                                handleOpenDatePicker();
                              }}
                            />
                          </View>
                        </LabelRow>
                      ) : null}
                    </View>

                    {!fastEntry && visibleCategorySuggestions.length > 0 ? (
                      <View style={formStyles.block}>
                        <ThemedText tone="muted" style={formStyles.caption}>
                          Suggested from history
                        </ThemedText>
                        <View style={formStyles.chipWrap}>
                          {visibleCategorySuggestions.map((suggestion) => (
                            <PressableView
                              key={suggestion}
                              accessibilityRole="button"
                              onPress={() => selectCategory(suggestion)}
                              style={[
                                formStyles.chip,
                                { backgroundColor: theme.card, borderColor: theme.border },
                              ]}
                              pressedStyle={formStyles.pressed}>
                              <MaterialCommunityIcons
                                name="creation-outline"
                                size={16}
                                color={theme.text}
                              />
                              <ThemedText style={[formStyles.chipLabel, { color: theme.text }]}>
                                {suggestion}
                              </ThemedText>
                            </PressableView>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {draftReview && accountMatches.length > 1 ? (
                      <View
                        testID="account-match-choice"
                        style={[formStyles.notice, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <ThemedText style={[formStyles.noticeTitle, { color: theme.text }]}>
                          Which one did you mean?
                        </ThemedText>
                        <ThemedText tone="muted" style={formStyles.caption}>
                          More than one saved account fits what you said.
                        </ThemedText>
                        <View style={formStyles.chipWrap}>
                          {accountMatches.slice(0, 4).map((match) => {
                            const selected = form.accountId === match.id;
                            return (
                              <PressableView
                                key={match.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => {
                                  markDraftFieldChecked('account');
                                  setForm((p) => ({ ...p, accountId: match.id, account: match.name }));
                                }}
                                style={[
                                  formStyles.chip,
                                  {
                                    backgroundColor: selected ? theme.selectedFill : theme.card,
                                    borderColor: selected ? theme.selectedBorder : theme.border,
                                  },
                                ]}
                                pressedStyle={formStyles.pressed}>
                                <ThemedText
                                  style={[
                                    formStyles.chipLabel,
                                    { color: theme.text, fontWeight: selected ? '700' : '500' },
                                  ]}>
                                  {match.name}
                                </ThemedText>
                              </PressableView>
                            );
                          })}
                        </View>
                        {newAccountSuggestion && onSetupSuggestedAccount ? (
                          <Button
                            testID="account-match-new"
                            label="None of these — add a new account"
                            variant="outline"
                            icon="plus"
                            height={40}
                            onPress={() => onSetupSuggestedAccount(newAccountSuggestion)}
                          />
                        ) : null}
                      </View>
                    ) : null}

                    {!fastEntry && personalPayment && visibleAccountSuggestion && onSetupSuggestedAccount ? (
                      <View
                        testID="account-suggestion"
                        style={[formStyles.notice, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <ThemedText style={[formStyles.noticeTitle, { color: theme.text }]}>
                          Add {visibleAccountSuggestion.name}?
                        </ThemedText>
                        <ThemedText tone="muted" style={formStyles.caption}>
                          {form.type === 'Income'
                            ? 'Use it to record where this money was received. Review the details or create it now.'
                            : 'Use it to keep this payment linked. Review the details or create it now.'}
                        </ThemedText>
                        <View style={formStyles.buttonRow}>
                          <Button
                            label="Set up account"
                            variant="outline"
                            height={36}
                            onPress={() => onSetupSuggestedAccount(visibleAccountSuggestion)}
                          />
                          <Button
                            label={autoCreatingAccount ? 'Creating…' : 'Create one for me'}
                            variant="outline"
                            height={36}
                            disabled={autoCreatingAccount}
                            onPress={() => void handleAutoCreateSuggestedAccount(visibleAccountSuggestion)}
                          />
                        </View>
                      </View>
                    ) : null}

                    {draftReview && refundReceived ? (
                      <View
                        testID="refund-received-card"
                        style={[
                          formStyles.notice,
                          formStyles.noticeRow,
                          { backgroundColor: theme.card, borderColor: theme.border },
                        ]}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[formStyles.noticeTitle, { color: theme.text }]}>
                            Also record the {formatMoney(refundReceived.amount)} refund?
                          </ThemedText>
                          <ThemedText tone="muted" style={formStyles.caption}>
                            {recordRefund
                              ? 'Saved as a separate income on the same account, so the purchase keeps its full amount.'
                              : 'Only the purchase will be saved.'}
                          </ThemedText>
                        </View>
                        <HapticSwitch
                          testID="refund-received-switch"
                          value={recordRefund}
                          onValueChange={onRecordRefundChange}
                          trackColor={{ false: theme.border, true: accent }}
                        />
                      </View>
                    ) : null}

                    <View style={formStyles.feedback}>{renderAutoCreateFeedback()}</View>

                    {splitContext?.fields ? <View style={formStyles.splitFields}>{splitContext.fields}</View> : null}

                    <View style={formStyles.block}>
                      <FormDisclosure
                        testID="entry-more-details"
                        label="More details"
                        summary={
                          moreDetailsSummary.length > 0 ? moreDetailsSummary.join(' · ') : moreDetailsOffer
                        }
                        expanded={isMoreDetailsOpen}
                        onToggle={() => setMoreDetailsToggled(!isMoreDetailsOpen)}>
                        <View
                          style={[
                            formStyles.fieldsCard,
                            formStyles.flush,
                            { backgroundColor: theme.card, borderColor: theme.border },
                          ]}>
                          <LabelRow label="Merchant" flagged={isFlagged('merchant')}>
                            <TextInput
                              testID="entry-merchant-input"
                              accessibilityLabel="Merchant"
                              value={form.merchant}
                              onChangeText={(merchant) => {
                                markDraftFieldChecked('merchant');
                                setForm((p) => ({ ...p, merchant }));
                              }}
                              placeholder="Shop or service"
                              placeholderTextColor={theme.muted}
                              selectionColor={accent}
                              style={[formStyles.rowInput, { color: theme.text }]}
                            />
                          </LabelRow>
                          <LabelRow label="Note" divider flagged={isFlagged('notes')}>
                            <TextInput
                              testID="entry-notes-input"
                              accessibilityLabel="Note"
                              multiline
                              value={form.notes}
                              onChangeText={(notes) => {
                                markDraftFieldChecked('notes');
                                setForm((p) => ({ ...p, notes }));
                              }}
                              placeholder="Add a note"
                              placeholderTextColor={theme.muted}
                              selectionColor={accent}
                              style={[formStyles.rowInput, formStyles.noteInput, { color: theme.text }]}
                            />
                          </LabelRow>
                          {tagsApply ? (
                            <LabelRow
                              testID="entry-tag-picker"
                              label="Tag"
                              value={form.tag || 'General'}
                              icon={tagIcon(form.tag || 'General')}
                              iconColor={theme.text}
                              flagged={isFlagged('tag')}
                              divider
                              onPress={() => {
                                markDraftFieldChecked('tag');
                                setIsTagPickerVisible(true);
                              }}
                            />
                          ) : null}
                          {canAttach ? (
                            <TransactionReceiptField
                              attachment={form.attachment}
                              error={attachmentError}
                              divider
                              onPick={handlePickAttachment}
                              onRemove={handleRemoveAttachment}
                            />
                          ) : null}
                        </View>
                        {canSplit ? (
                          <View style={formStyles.splitCard}>
                            <TransactionSplitFields
                              form={form}
                              setForm={setForm}
                              friends={splitFriends}
                              groups={splitGroups}
                              shareMode={splitShareMode}
                              onChangeShareMode={setSplitShareMode}
                              onApplyEqualSplit={applyEqualSplit}
                              onAddParticipant={addSplitParticipant}
                              onUpdateParticipant={updateSplitParticipant}
                              onRemoveParticipant={removeSplitParticipant}
                            />
                          </View>
                        ) : null}
                      </FormDisclosure>
                    </View>

                    {personalPayment && mode !== 'quick-prompt' && tagsApply && form.tag === 'EMI' && (
                      <TransactionEmiFields
                        isEdit={isEdit}
                        emiLink={emiLink}
                        paymentMode={form.mode}
                        isCardConversion={isEMICreditCard}
                        cardName={selectedAccount?.name}
                        canRepeat={canRepeatEmi}
                        repeatActive={emiRepeatActive}
                        nextDebit={emiNextDebit}
                        totalInstalments={form.emiTotalInstalments}
                        paidInstalments={form.emiPaidInstalments}
                        tenureMonths={form.emiTenureMonths}
                        ratePct={form.emiRatePct}
                        firstInstallment={emiFirstInstallment}
                        calculation={emiCalculation}
                        calculationError={emiCalculationError}
                        isCalculating={isCalculatingEMI}
                        onChangeRepeat={setEmiRepeats}
                        onChangeTotalInstalments={(emiTotalInstalments) =>
                          setForm((previous) => ({ ...previous, emiTotalInstalments }))
                        }
                        onChangePaidInstalments={(emiPaidInstalments) =>
                          setForm((previous) => ({ ...previous, emiPaidInstalments }))
                        }
                        onChangeTenure={(emiTenureMonths) =>
                          setForm((previous) => ({ ...previous, emiTenureMonths }))
                        }
                        onChangeRate={(emiRatePct) =>
                          setForm((previous) => ({ ...previous, emiRatePct }))
                        }
                      />
                    )}

                    {mode !== 'quick-prompt' && personalPayment && tagsApply && form.tag === 'Refundable' && (
                      <TransactionRefundFields
                        refundableAmount={form.refundableAmount}
                        expectedOn={form.refundExpectedOn}
                        reminderEnabled={form.refundReminderEnabled}
                        isPickerVisible={isRefundDatePickerVisible}
                        onChangeAmount={(refundableAmount) =>
                          setForm((previous) => ({ ...previous, refundableAmount }))
                        }
                        onChangeExpectedOn={(refundExpectedOn) =>
                          setForm((previous) => ({ ...previous, refundExpectedOn }))
                        }
                        onToggleReminder={() =>
                          setForm((previous) => ({
                            ...previous,
                            refundReminderEnabled: !previous.refundReminderEnabled,
                          }))
                        }
                        onChangePickerVisible={setIsRefundDatePickerVisible}
                      />
                    )}

                    {mode !== 'quick-prompt' &&
                      !isEdit &&
                      personalPayment &&
                      !emiRepeatActive &&
                      (form.subscriptionEnabled || (tagsApply && form.tag === 'Subscription')) && (
                        <TransactionSubscriptionFields
                          form={form}
                          setForm={setForm}
                          onOpenNextPaymentDatePicker={handleOpenSubscriptionDatePicker}
                          optionsOpen={isSubscriptionOptionsOpen}
                          onToggleOptions={() => setIsSubscriptionOptionsOpen((open) => !open)}
                          onOpenCancellationDatePicker={() => {
                            setPendingCancellationDate(
                              form.subscriptionCancelOnDate
                                ? new Date(`${form.subscriptionCancelOnDate}T12:00:00`)
                                : new Date()
                            );
                            setIsCancellationDatePickerVisible(true);
                          }}
                        />
                      )}
                  </>
                )}
              </ScrollView>

              {/* Pinned under the scroll: the keypad on the capture path, and
                  Save everywhere, so saving never needs a scroll. */}
              <View
                style={[formStyles.footer, { backgroundColor: theme.background, paddingBottom: footerBottom }]}>
                {isKeypadVisible && (
                  <>
                    {quickFills.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={formStyles.quickFills}>
                        {quickFills.map((fill) => {
                          const visual = categoryVisual(fill.category, form.type);
                          return (
                            <PressableView
                              key={fill.key}
                              testID={`quick-fill-${fill.key}`}
                              accessibilityRole="button"
                              accessibilityLabel={
                                fill.kind === 'merchant'
                                  ? `${fill.label}, ${fill.category}`
                                  : `Category ${fill.label}`
                              }
                              onPress={() => applyQuickFill(fill)}
                              style={[formStyles.chip, { backgroundColor: theme.card, borderColor: theme.border }]}
                              pressedStyle={formStyles.pressed}>
                              <MaterialCommunityIcons name={visual.icon} size={16} color={visual.color} />
                              <ThemedText numberOfLines={1} style={[formStyles.chipLabel, { color: theme.text }]}>
                                {fill.label}
                              </ThemedText>
                            </PressableView>
                          );
                        })}
                      </ScrollView>
                    )}
                    <AmountKeypad value={form.amount} onChange={handleAmountChange} />
                  </>
                )}
                <PrimaryButton
                  testID="entry-save-button"
                  label={draftReview && isParsing ? 'Reading your entry…' : saveLabel}
                  loading={isSaving || (draftReview && isParsing)}
                  disabled={fastEntry && !amountEntered}
                  onPress={handleConfirmEntry}
                />
                {onDelete && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onDelete}
                    style={formStyles.deleteLink}>
                    <ThemedText tone="negative" style={formStyles.deleteLabel}>
                      Delete prompt
                    </ThemedText>
                  </Pressable>
                )}
                {formError && (
                  <ThemedText tone="negative" style={[formStyles.caption, formStyles.centered]}>
                    {formError}
                  </ThemedText>
                )}
              </View>
              {splitContext?.overlay ? (
                <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.background }}>
                  {splitContext.overlay}
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        <TransactionDateSheet
          visible={isDatePickerVisible}
          value={pendingDate}
          onChange={setPendingDate}
          onClose={() => setIsDatePickerVisible(false)}
          onConfirm={handleConfirmDatePicker}
        />

        {isCancellationDatePickerVisible && (
          <TransactionCancellationDateSheet
            pendingDate={pendingCancellationDate}
            onChangePendingDate={setPendingCancellationDate}
            onClose={() => setIsCancellationDatePickerVisible(false)}
            onConfirm={() => {
              setForm((p) => ({
                ...p,
                subscriptionCancelOnDate: formatApiDate(pendingCancellationDate),
              }));
              setIsCancellationDatePickerVisible(false);
            }}
          />
        )}

        {Platform.OS === 'ios' && isSubscriptionDatePickerVisible && (
          <TransactionSubscriptionDateSheet
            pendingDate={pendingSubscriptionDate}
            onChangePendingDate={setPendingSubscriptionDate}
            onClose={() => setIsSubscriptionDatePickerVisible(false)}
            onConfirm={() => {
              setForm((prev) => ({
                ...prev,
                subscriptionNextDueDate: formatApiDate(pendingSubscriptionDate),
              }));
              setIsSubscriptionDatePickerVisible(false);
            }}
          />
        )}

        <TransactionModePicker
          visible={isModePickerVisible}
          title={paymentLanguage.modeLabel}
          options={modeOptions}
          selected={form.mode}
          onClose={() => setIsModePickerVisible(false)}
          onSelect={(m) => {
            setForm((p) => resolveEntryFormAccount({ ...p, mode: m }));
            setIsModePickerVisible(false);
          }}
        />

        <TransactionCategoryPicker
          visible={isCategoryPickerVisible}
          selected={form.category}
          type={form.type}
          options={selectableCategoryOptions}
          suggestions={visibleCategorySuggestions}
          customCategory={customCategory}
          onChangeCustomCategory={setCustomCategory}
          onClose={() => setIsCategoryPickerVisible(false)}
          onSelect={(category) => {
            selectCategory(category);
            setIsCategoryPickerVisible(false);
          }}
          onAddCustom={() => {
            if (!customCategory.trim()) return;
            // Kept for this user, not just this entry: the next form offers it
            // too. A built-in typed by another name comes back as the built-in.
            const nextCategory = keepCustomCategory(
              sessionToken,
              // Inner runs of spaces collapsed, as the server keeps the name.
              normalizeCategoryValue(customCategory.replace(/\s+/g, ' '), form.type),
              customCategoryType
            );
            selectCategory(nextCategory);
            setCustomCategory('');
            setIsCategoryPickerVisible(false);
          }}
          removable={customCategories}
          onRemoveCustom={
            sessionToken
              ? (category) => removeCustomCategory(sessionToken, category, customCategoryType)
              : undefined
          }
        />

        <TransactionAccountPicker
          visible={isAccountPickerVisible}
          title={paymentLanguage.accountLabel}
          accounts={compatibleAccounts}
          selectedAccountId={form.accountId}
          mode={form.mode}
          suggestion={actionableAccountSuggestion}
          isAutoCreating={autoCreatingAccount}
          autoCreateError={autoCreateAccountError}
          onClose={() => setIsAccountPickerVisible(false)}
          onSelect={(account) => {
            setForm((p) => ({ ...p, accountId: account.id, account: account.name }));
            setIsAccountPickerVisible(false);
          }}
          onSetupSuggestedAccount={onSetupSuggestedAccount}
          onAutoCreateSuggestedAccount={
            onAutoCreateSuggestedAccount
              ? (suggestion) => void handleAutoCreateSuggestedAccount(suggestion)
              : undefined
          }
          onManageAccounts={onManageAccounts}
        />

        <TransactionTagPicker
          visible={isTagPickerVisible}
          selected={form.tag}
          onClose={() => setIsTagPickerVisible(false)}
          onSelect={(tag) => {
            haptics.select();
            setForm((p) => ({ ...p, tag }));
            setIsTagPickerVisible(false);
          }}
        />

        <ThemedDeleteDialog
          visible={isDiscardDialogVisible}
          title="Discard this draft?"
          message="What Finnri picked up, and any changes you made, won't be saved."
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          onCancel={() => setIsDiscardDialogVisible(false)}
          onConfirm={() => {
            setIsDiscardDialogVisible(false);
            onClose();
          }}
        />

        <UpgradeSheet
          visible={upgradeSheetVisible}
          entitlement={entitlement}
          onClose={dismissUpgrade}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}

/** A 32dp chip in the Date row: Today, Yesterday, or the calendar (board R2-Entry). */
function DateChip({
  label,
  icon,
  selected,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        formStyles.dateChip,
        !label && formStyles.dateChipIcon,
        {
          backgroundColor: selected ? colors.selectedFill : colors.card,
          borderColor: selected ? colors.selectedBorder : colors.border,
        },
      ]}
      pressedStyle={formStyles.pressed}>
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.text} /> : null}
      {label ? (
        <ThemedText
          numberOfLines={1}
          style={[formStyles.dateChipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
          {label}
        </ThemedText>
      ) : null}
    </PressableView>
  );
}

/** Boards R2-Entry, R2-Draft, R2-Split and R4-Edit; 1px on a board is 1dp. */
/** The Today · Yesterday chips, as of `now`. */
export const buildDateChoices = (now: Date) => {
  const yesterday = new Date(now);
  // setDate rather than subtracting 24h, so the DST day that is 23 hours
  // long still resolves to yesterday's date.
  yesterday.setDate(yesterday.getDate() - 1);
  return [
    { key: 'today', label: 'Today', value: formatDateLabel(now) },
    { key: 'yesterday', label: 'Yesterday', value: formatDateLabel(yesterday) },
  ];
};

const formStyles = StyleSheet.create({
  panel: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerSide: {
    width: 56,
    alignItems: 'flex-start',
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  typeToggle: {
    width: 220,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  sourceBlock: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  amountBlock: {
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  amountTouch: {
    alignSelf: 'stretch',
  },
  amountRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  amountSymbol: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '500',
  },
  amountInput: {
    minWidth: 48,
    padding: 0,
    fontSize: 46,
    lineHeight: 56,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  scanLink: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  scanLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  titleField: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginHorizontal: 16,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    padding: 0,
    fontSize: 15,
  },
  fieldsCard: {
    marginTop: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  flush: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  dateChips: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateChip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  dateChipIcon: {
    width: 40,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  dateChipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    padding: 0,
    fontSize: 14,
  },
  // A one-line note sits on the label's line; a longer one grows the row.
  noteInput: {
    paddingVertical: 14,
    textAlignVertical: 'top',
  },
  block: {
    gap: 8,
    marginTop: 8,
    marginHorizontal: 16,
  },
  splitFields: {
    marginTop: 12,
  },
  splitCard: {
    marginTop: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  notice: {
    gap: 6,
    marginTop: 8,
    marginHorizontal: 16,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  feedback: {
    marginHorizontal: 16,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  centered: {
    textAlign: 'center',
  },
  footer: {
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  quickFills: {
    gap: 8,
    paddingRight: 4,
  },
  deleteLink: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  skeleton: {
    gap: 0,
  },
  skeletonAmount: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  skeletonRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  skeletonLabel: {
    width: 84,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
