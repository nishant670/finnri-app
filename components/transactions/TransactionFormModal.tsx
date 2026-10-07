import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';

import { ThemedText } from '@/components/themed-text';
import { AddDetailChips, type AddDetailOption } from '@/components/ui/AddDetailChips';
import { Shimmer } from '@/components/ui/Shimmer';
import { useMotion } from '@/hooks/use-motion';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
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
import { formatTime, uses24HourClock } from '@/lib/datetime';
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
import { buildQuickFills, type QuickFill } from '@/lib/quick-fills';
import { inferTransactionCategory } from '@/lib/transaction-category';
import { PAYMENT_MODES } from '@/lib/payment-modes';
import {
  buildDraftReviewPlan,
  draftSummaryParts,
  type DraftFieldKey,
  type DraftReviewPlan,
} from '@/lib/ai-draft-review';
import type { Transaction } from '@/types/transaction';
import { AmountDisplay, AmountKeypad, hasEnteredAmount } from './AmountKeypad';
import { DraftFieldCard } from './DraftFieldCard';
import { TransactionAccountPicker } from './TransactionAccountPicker';
import { TransactionCategoryPicker } from './TransactionCategoryPicker';
import {
  TransactionCancellationDateSheet,
  TransactionDateTimeSheet,
  TransactionSubscriptionDateSheet,
} from './TransactionDateSheets';
import { TransactionDraftField, tagOptions } from './TransactionDraftField';
import { TransactionDraftBanner, TransactionDraftSource } from './TransactionDraftHeader';
import { TransactionEmiFields } from './TransactionEmiFields';
import { TransactionModePicker } from './TransactionModePicker';
import { TransactionReceiptField } from './TransactionReceiptField';
import { TransactionRefundFields } from './TransactionRefundFields';
import { TransactionSubscriptionFields } from './TransactionSubscriptionFields';
import {
  shareFromPercent,
  TransactionSplitFields,
  withSplitTurnedOn,
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
  /**
   * Offers "scan a bill" on a new manual entry. Gets the picked photo's local
   * URI; the parent reads it and drives the sheet into draft review.
   */
  onScanReceipt?: (uri: string) => void;
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

/**
 * The optional details a transaction can carry, each offered as a chip until
 * it is wanted. The tag-driven cards (EMI, refund, subscription) are not in
 * this list: they follow from the tag, so choosing the tag is what adds them.
 */
type EntryDetailKey = 'merchant' | 'notes' | 'tag' | 'receipt' | 'split';

const ENTRY_DETAIL_OPTIONS: AddDetailOption<EntryDetailKey>[] = [
  { key: 'notes', label: 'Note', icon: 'note-text-outline' },
  { key: 'merchant', label: 'Merchant', icon: 'storefront-outline' },
  { key: 'tag', label: 'Tag', icon: 'tag-outline' },
  { key: 'receipt', label: 'Receipt', icon: 'paperclip' },
  { key: 'split', label: 'Split', icon: 'account-multiple-outline' },
];

const getPaymentLanguage = (entryType: string) =>
  entryType === 'Income'
    ? {
        modeLabel: 'Received via',
        accountLabel: 'Received in account',
        modeAccessibilityPrefix: 'Received via',
        accountAccessibilityPrefix: 'Received in',
      }
    : {
        modeLabel: 'Paid via',
        accountLabel: 'Paid from account',
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

const formatFieldName = (field: string) => {
  const normalized = field === 'account_hint' ? 'account' : field;
  if (normalized === 'accountId') return 'Account';
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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

const mergeCategoryOptions = (category: string, type: string) =>
  categoryOptionsFor(normalizeCategoryValue(category, type), type);

const formatApiDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** How far the sheet nudges when Save refuses. Two out-and-backs, per the spec. */
const SHAKE_OFFSET = 6;

/** How far a settling field travels on its way in. */
const SETTLE_RISE = 10;

/** The amount starts fractionally under size so it lands with weight. */
const EMPHASIS_FROM = 0.92;

/**
 * A field arriving into the draft, on the `fields` stagger.
 *
 * Mount-driven on purpose: the skeleton and the real fields are different
 * subtrees, so the parse landing unmounts one and mounts the other, and the
 * entrance runs exactly once per draft with no key or token to keep in sync.
 */
function SettleIn({
  index,
  emphasis = false,
  children,
}: {
  index: number;
  /** The amount. Lands last and scales up into place rather than just fading. */
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  const motion = useMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      motion.stagger(index, 'fields'),
      withTiming(1, motion.enter('base'))
    );
  }, [index, motion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [SETTLE_RISE, 0]) },
      { scale: emphasis ? interpolate(progress.value, [0, 1], [EMPHASIS_FROM, 1]) : 1 },
    ],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * What the draft is about to look like. The amount card and the field cards
 * under it, drawn as the bordered cards they will become, so the parse result
 * lands into the space it was already occupying instead of shoving the sheet
 * around — and so a wait of a few seconds reads as work in progress, not as a
 * sheet that failed to fill.
 */
const DRAFT_SKELETON_LABELS = ['Amount', 'Category', 'Account', 'Date'];
const DRAFT_SKELETON_WIDTHS = ['72%', '54%', '64%'] as const;

function DraftSkeleton() {
  const { colors } = useThemeTokens();
  return (
    <View testID="draft-skeleton" accessibilityLabel="Reading your entry" className="mb-4 gap-3">
      <View className="flex-row items-center justify-center gap-2 py-1">
        <ActivityIndicator size="small" color={colors.accent} />
        <ThemedText tone="muted" className="text-sm font-bold">
          Finnri AI is reading your entry…
        </ThemedText>
      </View>
      <View
        className="gap-3 rounded-[20px] border p-4"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
        <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
          {DRAFT_SKELETON_LABELS[0]}
        </ThemedText>
        <Shimmer width={160} height={34} radius={10} index={0} />
      </View>
      {DRAFT_SKELETON_LABELS.slice(1).map((label, row) => (
        <View
          key={label}
          className="gap-3 rounded-[20px] border p-4"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            {label}
          </ThemedText>
          <Shimmer width={DRAFT_SKELETON_WIDTHS[row]} height={18} radius={8} index={row + 1} />
        </View>
      ))}
    </View>
  );
}

export function TransactionFormModal({
  visible,
  onClose,
  initialData,
  onSave,
  onDelete,
  isEdit,
  emiLink = null,
  mode = 'manual',
  onScanReceipt,
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
  const colorScheme = themeTokens.mode;
  const accent = theme.accent;
  const accentSurface = colorScheme === 'dark' ? theme.secondary : theme.secondary;
  const detailInputPlaceholderColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';
  const detailIconSurface = colorScheme === 'dark' ? theme.secondary : accentSurface;

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

  const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
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
  const typeSwitchAnim = useSharedValue(0);
  /** Horizontal nudge for the validation shake. */
  const shakeAnim = useSharedValue(0);
  const [showModal, setShowModal] = useState(visible);
  // iOS's KeyboardAvoidingView already reserves the keyboard. Android modal
  // windows are not reliably resized, so their inset belongs at the end of the
  // scroll content—not inside the mid-list split section.
  const keyboardInset = useKeyboardInset(showModal && Platform.OS === 'android');
  const resolveEntryFormAccount = useCallback(
    (nextForm: EntryForm): EntryForm => {
      if (!personalPayment) return { ...nextForm, accountId: null, account: '' };
      if (mode === 'quick-prompt') {
        return nextForm;
      }
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
    [accounts, mode, personalPayment]
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
   * Optional details asked for with a chip since the sheet opened. A detail
   * that already holds a value shows without being asked for — see
   * `isDetailShown`.
   */
  const [revealedDetails, setRevealedDetails] = useState<EntryDetailKey[]>([]);
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
  const [isDraftSummaryExpanded, setIsDraftSummaryExpanded] = useState(false);
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
  const [scanError, setScanError] = useState<string | null>(null);
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
  const isEMICreditCard =
    personalPayment &&
    !isEdit &&
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
  const [autoCreatedAccountName, setAutoCreatedAccountName] = useState('');

  const handleAutoCreateSuggestedAccount = useCallback(
    async (suggestion: AccountSuggestion) => {
      if (!onAutoCreateSuggestedAccount || autoCreatingAccount) return;
      setAutoCreatingAccount(true);
      setAutoCreateAccountError(null);
      try {
        const saved = await onAutoCreateSuggestedAccount(suggestion);
        setForm((previous) => ({ ...previous, accountId: saved.id, account: saved.name }));
        setAutoCreatedAccountName(saved.name);
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
  const categoryNeedsReview = reviewFields.includes('category');
  const accountNeedsReview = reviewFields.includes('account') || reviewFields.includes('accountId');
  const displayedCategory = normalizeCategoryValue(form.category, form.type);
  const selectableCategoryOptions = useMemo(
    () => mergeCategoryOptions(form.category, form.type),
    [form.category, form.type]
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
  /**
   * The stacked full form, for editing a saved entry and for quick prompts. The
   * AI draft replaces it outright with the confidence-ranked list, so no field
   * ever renders twice on the same screen.
   */
  const showFullForm = !draftReview && !fastEntry;
  const amountEntered = hasEnteredAmount(form.amount);
  const quickFills = useMemo(
    () => (fastEntry ? buildQuickFills(recentEntries, form.type) : []),
    [fastEntry, form.type, recentEntries]
  );
  const displayedCategoryVisual = categoryVisual(displayedCategory, form.type);

  const dateChoices = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    // setDate rather than subtracting 24h, so the DST day that is 23 hours
    // long still resolves to yesterday's date.
    yesterday.setDate(yesterday.getDate() - 1);
    return [
      { key: 'today', label: 'Today', value: formatDateLabel(today) },
      { key: 'yesterday', label: 'Yesterday', value: formatDateLabel(yesterday) },
    ];
  }, []);
  const isCustomDate = !dateChoices.some((choice) => choice.value === form.date);
  const draftDateLabel =
    dateChoices.find((choice) => choice.value === form.date)?.label ?? form.date;

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
    setIsDraftSummaryExpanded(false);
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
  const draftFlaggedFields = useMemo(
    () => (draftPlan?.flagged ?? []).filter((field) => field !== 'amount'),
    [draftPlan]
  );
  /**
   * Where each part of the draft falls in the settle order.
   *
   * The amount is rendered *first* and arrives *last*, which is the whole point
   * of the spec's "landing last and largest": the eye is drawn to the number
   * after the context around it is already there, rather than watching the
   * headline appear and then wait for its own supporting cast.
   */
  const draftSettleOrder = useMemo(() => {
    const flaggedCount = draftFlaggedFields.length;
    return { summary: flaggedCount, amount: flaggedCount + 1 };
  }, [draftFlaggedFields.length]);

  const draftCollapsedFields = useMemo(
    () =>
      [...(draftPlan?.confident ?? []), ...(draftPlan?.optional ?? [])].filter(
        (field) => field !== 'amount'
      ),
    [draftPlan]
  );
  const draftConfidentCount = (draftPlan?.confident ?? []).filter(
    (field) => field !== 'amount'
  ).length;
  const draftPendingCount = (draftPlan?.flagged ?? []).filter(
    (field) => !checkedDraftFields.includes(field)
  ).length;
  const draftSummaryLine = useMemo(() => {
    if (!draftPlan) return '';
    return draftSummaryParts(draftPlan.confident, {
      amount: form.amount,
      type: form.type,
      title: form.title,
      category: displayedCategory,
      mode: form.mode,
      account: form.account,
      date: draftDateLabel,
      merchant: form.merchant,
      tag: form.tag,
      notes: form.notes,
    }).join(' · ');
  }, [displayedCategory, draftDateLabel, draftPlan, form]);

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
    }));
    animateTypeSwitch(type === 'Income');
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
    typeSwitchAnim.value = (initialData?.type || 'Expense') === 'Income' ? 1 : 0;
    // No `initialData` dependency, and no suppression needed for its absence:
    // the local read above shadows the prop, so the linter sees a callback that
    // genuinely does not close over it. That is the point — reseeding on every
    // parent re-render would wipe in-progress edits, and the two moments that
    // *should* reseed call this deliberately.
  }, [fastEntry, resolveEntryFormAccount, typeSwitchAnim]);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      setRevealedDetails([]);
      setIsSubscriptionOptionsOpen(false);
      setIsTitleFocused(false);
      setFormError(null);
      setScanError(null);
      seedForm();

      // A timed slide, not a spring: the spring overshot and rang two or three
      // times, and the form can't be typed into until it stops moving.
      panelAnim.value = withTiming(0, motion.enter('sheet'));
      backdropAnim.value = withTiming(1, motion.enter('base'));
      return;
    }

    panelAnim.value = withTiming(SCREEN_HEIGHT, motion.exit('sheet'), (finished) => {
      'worklet';
      if (finished) runOnJS(setShowModal)(false);
    });
    backdropAnim.value = withTiming(0, motion.exit('base'));
    // `seedForm` is stable across the transition and listing it would re-run the
    // panel animation on an unrelated identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, SCREEN_HEIGHT, backdropAnim, motion, panelAnim]);

  /**
   * The draft landed. Re-seed from the parse result, which arrived after the
   * sheet was already on screen.
   */
  const wasParsing = useRef(isParsing);
  useEffect(() => {
    if (wasParsing.current && !isParsing && visible) {
      seedForm();
    }
    wasParsing.current = isParsing;
  }, [isParsing, seedForm, visible]);

  useEffect(() => {
    if (!visible || mode === 'quick-prompt') {
      return;
    }
    setForm((prev) => {
      const next = resolveEntryFormAccount(prev);
      return next.accountId === prev.accountId && next.account === prev.account ? prev : next;
    });
  }, [visible, mode, form.mode, resolveEntryFormAccount]);

  const animateTypeSwitch = useCallback(
    (isIncome: boolean) => {
      typeSwitchAnim.value = withTiming(isIncome ? 1 : 0, motion.enter('base'));
    },
    [motion, typeSwitchAnim]
  );

  const handleOpenDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseDateLabel(form.date) ?? new Date(),
        onValueChange: (_event, selectedDate) => {
          if (selectedDate) {
            const dateStr = formatDateLabel(selectedDate);
            setForm((prev) => ({ ...prev, date: dateStr }));
            DateTimePickerAndroid.open({
              value: new Date(),
              mode: 'time',
              is24Hour: uses24HourClock(),
              onValueChange: (_event, selectedTime) => {
                if (selectedTime) {
                  const timeStr = formatTime(selectedTime) ?? '';
                  setForm((prev) => ({ ...prev, time: timeStr }));
                }
              },
              onDismiss: () => undefined,
            });
          }
        },
        onDismiss: () => undefined,
        mode: 'date',
      });
    } else {
      setPendingDate(parseDateLabel(form.date) ?? new Date());
      setIsDatePickerVisible(true);
    }
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
        revealDetail('receipt');
        setAttachmentError("That file couldn't be read. Try another one.");
        return;
      }
      setAttachmentError(null);
      // Stored as a local URI here; it is uploaded when the entry is saved.
      setForm((prev) => ({ ...prev, attachment: asset.uri }));
    } catch {
      revealDetail('receipt');
      setAttachmentError("That file couldn't be read. Try another one.");
    }
  };

  const revealDetail = (detail: EntryDetailKey) =>
    setRevealedDetails((previous) => (previous.includes(detail) ? previous : [...previous, detail]));

  /**
   * A detail is on screen once it was asked for, or whenever it already holds
   * something — a merchant filled by a quick-fill chip, a note on an entry
   * being edited. A value hidden behind a chip would read as a value lost.
   */
  const isDetailShown = (detail: EntryDetailKey) => {
    if (revealedDetails.includes(detail)) return true;
    switch (detail) {
      case 'merchant':
        return form.merchant.trim().length > 0;
      case 'notes':
        return form.notes.trim().length > 0;
      case 'tag':
        return form.tag.trim().length > 0 && form.tag !== 'General';
      case 'receipt':
        return Boolean(form.attachment);
      case 'split':
        return form.splitEnabled;
    }
  };

  const handleAddDetail = (detail: EntryDetailKey) => {
    if (detail === 'receipt') {
      // Straight to the picker. An empty "attach a file" row would only be a
      // second tap standing between the chip and the thing it promised.
      void handlePickAttachment();
      return;
    }
    if (detail === 'split') {
      setForm((previous) => withSplitTurnedOn(previous, splitFriends));
    }
    revealDetail(detail);
  };

  /** The chips still on offer: details not yet on screen that fit this entry. */
  const availableDetailOptions = ENTRY_DETAIL_OPTIONS.filter((option) => {
    if (isDetailShown(option.key)) return false;
    if (option.key === 'receipt') return mode !== 'quick-prompt';
    if (option.key === 'split') {
      return !splitContext && mode !== 'quick-prompt' && form.type === 'Expense';
    }
    return true;
  });

  /** Bill scanning is for a fresh personal entry; a split has its own composer. */
  const canScanReceipt = fastEntry && !splitContext && !!onScanReceipt;

  /**
   * Pick a bill photo and hand it up for reading. Images only — the reader
   * takes photos and screenshots, not PDFs. A camera option needs a native
   * module and is left for a later build.
   */
  const handleScanReceipt = async () => {
    setScanError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) {
        setScanError("That photo couldn't be read. Try another one.");
        return;
      }
      onScanReceipt?.(asset.uri);
    } catch {
      setScanError("That photo couldn't be opened. Try again.");
    }
  };

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
    if (personalPayment && form.tag === 'Refundable') {
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

  // Measured out here. `Dimensions` is a JS-thread module and does not exist on
  // the UI runtime, so reading it inside the worklet throws "undefined is not a
  // function" — the same boundary that caught the prompt rotation in C2, and
  // just as invisible to the type checker.
  const typeSwitchTravel = (SCREEN_WIDTH - 60) * 0.5;
  const typeSwitchStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: typeSwitchAnim.value * typeSwitchTravel }] }),
    [typeSwitchTravel]
  );

  if (!showModal) return null;

  const renderReceiptField = (withSectionLabel: boolean) => (
    <TransactionReceiptField
      attachment={form.attachment}
      error={attachmentError}
      withSectionLabel={withSectionLabel}
      onPick={handlePickAttachment}
      onRemove={handleRemoveAttachment}
    />
  );

  const renderDraftField = (field: DraftFieldKey) => (
    <TransactionDraftField
      key={field}
      field={field}
      form={form}
      setForm={setForm}
      flagged={draftPlan?.flagged.includes(field) ?? false}
      checked={checkedDraftFields.includes(field)}
      paymentLanguage={paymentLanguage}
      category={displayedCategory}
      categoryVisual={displayedCategoryVisual}
      dateLabel={draftDateLabel}
      compatibleAccountCount={compatibleAccounts.length}
      onChecked={markDraftFieldChecked}
      onSwitchType={animateTypeSwitch}
      onOpenCategoryPicker={() => setIsCategoryPickerVisible(true)}
      onOpenModePicker={() => setIsModePickerVisible(true)}
      onOpenAccountPicker={() => setIsAccountPickerVisible(true)}
      onOpenDatePicker={handleOpenDatePicker}
    />
  );

  // Rendered inside the scroll view everywhere except the amount-first path,
  // where it is pinned above the keypad so a save never needs a scroll.
  const saveActions = (
    <View className="px-5 gap-3">
      <Pressable
        testID="entry-save-button"
        onPress={handleConfirmEntry}
        disabled={isSaving || (draftReview && isParsing) || (fastEntry && !amountEntered)}
        accessibilityState={{ disabled: isSaving || (draftReview && isParsing) }}
        style={{
          backgroundColor: accent,
          opacity: (fastEntry && !amountEntered) || (draftReview && isParsing) ? 0.4 : 1,
        }}
        className="w-full py-4 rounded-[20px] flex-row items-center justify-center gap-2 shadow-lg">
        {isSaving ? (
          <ActivityIndicator color="white" />
        ) : draftReview && isParsing ? (
          <>
            <ActivityIndicator color="white" />
            <ThemedText tone="onAccent" className="text-base font-black">
              Reading your entry…
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText tone="onAccent" className="text-base font-black">
              {isEdit
                ? mode === 'quick-prompt'
                  ? 'Save prompt'
                  : 'Save changes'
                : mode === 'quick-prompt'
                  ? 'Create prompt'
                  : fastEntry
                    ? 'Save'
                    : 'Confirm & save'}
            </ThemedText>
            <MaterialCommunityIcons name="check-circle-outline" size={24} color="white" />
          </>
        )}
      </Pressable>
      {mode === 'audio' && (
        <Pressable
          accessibilityRole="button"
          onPress={requestClose}
          className="w-full py-4 items-center justify-center active:opacity-50">
          <ThemedText tone="muted" className="font-bold">
            Cancel
          </ThemedText>
        </Pressable>
      )}
      {onDelete && (
        <Pressable
          onPress={onDelete}
          className="w-full py-4 items-center justify-center active:opacity-50">
          <ThemedText tone="negative" className="font-bold">
            Delete prompt
          </ThemedText>
        </Pressable>
      )}
      {formError && (
        <ThemedText tone="negative" className="text-center text-xs mt-2">
          {formError}
        </ThemedText>
      )}
    </View>
  );

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none" // we handle animations manually for better control
      onRequestClose={splitContext?.onBack ?? requestClose}>
      <View className="flex-1 justify-end">
        <Animated.View className="absolute inset-0 bg-black/40" style={backdropStyle}>
          <View style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={[
            {
              height: '92%',
              width: '100%',
            },
            panelStyle,
          ]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1">
            <View
              className="flex-1 rounded-t-[32px] shadow-2xl relative overflow-hidden"
              style={{ backgroundColor: theme.background }}>
              <View className="items-center pt-6 pb-1 relative">
                <View
                  className="h-1.5 w-12 rounded-full absolute top-3"
                  style={{ backgroundColor: theme.border }}
                />
                <Pressable
                  onPress={requestClose}
                  className="absolute right-5 top-5 h-9 w-9 rounded-full items-center justify-center z-10"
                  style={{ backgroundColor: colorScheme === 'dark' ? theme.card : '#F3F4F6' }}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </Pressable>
                {canScanReceipt ? (
                  <Pressable
                    testID="scan-receipt"
                    onPress={() => void handleScanReceipt()}
                    accessibilityRole="button"
                    accessibilityLabel="Scan a bill or receipt photo"
                    accessibilityHint="Finnri reads the total, date and shop. Uses AI credits."
                    className="absolute left-5 top-5 h-9 flex-row items-center gap-1.5 rounded-full px-3 z-10"
                    style={{ backgroundColor: colorScheme === 'dark' ? theme.card : '#F3F4F6' }}>
                    <MaterialCommunityIcons
                      name="receipt-text-plus-outline"
                      size={17}
                      color={theme.text}
                    />
                    <ThemedText className="text-xs font-bold" style={{ color: theme.text }}>
                      Scan bill
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                // Amount-first pins the keypad and the save button below this
                // view, so it has to take the space that is left rather than a
                // fixed share of the sheet.
                style={fastEntry || draftReview ? { flex: 1 } : { maxHeight: '90%' }}
                contentContainerStyle={{
                  paddingBottom:
                    keyboardInset > 0
                      ? keyboardInset + 24
                      : isKeypadVisible || fastEntry || draftReview
                        ? 12
                        : 28,
                  // Capture is a short screen in a tall sheet. Growing the
                  // content to fill it lets the amount block centre itself in
                  // what is left, instead of stacking at the top with a third
                  // of the panel empty beneath it.
                  ...(isKeypadVisible ? { flexGrow: 1 } : null),
                }}>
                <View className={fastEntry ? 'items-center px-5 mb-2' : 'items-center px-5 mb-6'}>
                  <ThemedText
                    className={
                      fastEntry ? 'text-base font-black mt-2' : 'text-xl font-black mt-4 mb-1.5'
                    }
                    style={{ color: theme.text }}>
                    {isEdit
                      ? mode === 'quick-prompt'
                        ? 'Edit quick prompt'
                        : 'Edit transaction'
                      : mode === 'audio'
                        ? aiReview?.smartSortingDisabled
                          ? 'Review your draft'
                          : 'Here’s your draft'
                        : mode === 'quick-prompt'
                          ? 'New quick prompt'
                          : splitContext
                            ? 'New split expense'
                            : form.type === 'Income'
                              ? 'New income'
                              : 'New expense'}
                  </ThemedText>
                  {canScanReceipt && scanError ? (
                    <ThemedText tone="negative" className="mt-1 text-center text-xs">
                      {scanError}
                    </ThemedText>
                  ) : null}
                  {/* The review sheet's banner already says how many fields
                      want a look, and a second line saying it again costs the
                      height that keeps a clean draft scroll-free. Smart Sorting
                      being off is the one thing the banner cannot say. */}
                  {!fastEntry && (!draftReview || aiReview?.smartSortingDisabled) && (
                    <ThemedText tone="muted" className="text-center text-sm leading-5 px-3">
                      {isEdit
                        ? 'Change what you need, then save.'
                        : mode === 'audio'
                          ? aiReview?.smartSortingDisabled
                            ? 'Smart Sorting is off, so pick the category and payment details yourself.'
                            : 'Check each field before you save.'
                          : mode === 'quick-prompt'
                            ? 'One tap on this prompt fills all of this in for you.'
                            : 'Add the details below.'}
                    </ThemedText>
                  )}
                </View>

                <View className={fastEntry ? 'px-5 mb-3' : 'px-5 mb-6'}>
                  {draftReview && aiReview?.sourceText ? (
                    <TransactionDraftSource
                      inputSource={aiReview.inputSource}
                      sourceText={aiReview.sourceText}
                    />
                  ) : null}

                  {mode === 'audio' && (
                    <TransactionDraftBanner
                      isParsing={isParsing}
                      fieldsToCheck={draftReview ? draftPendingCount : reviewFields.length}
                      hasReviewMetadata={hasReviewMetadata}
                      // The review sheet gives every flagged field its own card
                      // below, so naming them here as well would say it twice.
                      checkList={draftReview ? [] : reviewFields.map(formatFieldName)}
                      // On the review sheet these exist to prompt the checks
                      // below; once every flagged field has been answered the
                      // banner reads "No issues flagged", and a question left
                      // sitting under that line contradicts it.
                      clarifications={
                        !draftReview || draftPendingCount > 0 ? aiReview?.clarifications : undefined
                      }
                    />
                  )}

                  {draftReview && isParsing && <DraftSkeleton />}

                  {draftReview && !isParsing && draftPlan && (
                    <>
                      <SettleIn index={draftSettleOrder.amount} emphasis>
                        <View className="mb-4">
                          <DraftFieldCard
                            label="Amount"
                            icon="currency-inr"
                            onPress={() => amountInputRef.current?.focus()}
                            accessibilityLabel="Edit amount"
                            iconColor={form.type === 'Income' ? '#10B981' : accent}
                            flagged={draftPlan.flagged.includes('amount')}
                            checked={checkedDraftFields.includes('amount')}>
                            <View className="flex-row items-center gap-1">
                              <ThemedText
                                className="text-2xl font-black"
                                style={{ color: form.type === 'Income' ? '#10B981' : accent }}>
                                {CURRENCY_SYMBOL}
                              </ThemedText>
                              <TextInput
                                ref={amountInputRef}
                                testID="entry-amount-input"
                                value={form.amount}
                                onChangeText={(text) => {
                                  handleAmountChange(text);
                                  markDraftFieldChecked('amount');
                                }}
                                keyboardType="decimal-pad"
                                className="flex-1 p-0 text-3xl font-black"
                                selectionColor={accent}
                                style={{
                                  color: form.type === 'Income' ? '#10B981' : accent,
                                  height: 38,
                                }}
                              />
                            </View>
                          </DraftFieldCard>
                        </View>
                      </SettleIn>

                      {draftFlaggedFields.length > 0 && (
                        <View className="mb-4 gap-3">
                          <ThemedText
                            tone="warning"
                            className="mb-1 text-[11px] font-black uppercase tracking-widest italic">
                            {draftPendingCount > 0 ? 'Check these first' : 'You checked these'}
                          </ThemedText>
                          {draftFlaggedFields.map((field, fieldIndex) => (
                            <SettleIn key={`settle-${field}`} index={fieldIndex}>
                              {renderDraftField(field)}
                            </SettleIn>
                          ))}
                        </View>
                      )}

                      {draftReview && refundReceived && !isParsing && (
                        <View
                          testID="refund-received-card"
                          className="mb-4 flex-row items-center justify-between gap-3 rounded-[20px] border p-4"
                          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                          <View className="flex-1">
                            <ThemedText
                              className="text-sm font-black"
                              style={{ color: theme.text }}>
                              Also record the {formatMoney(refundReceived.amount)} refund?
                            </ThemedText>
                            <ThemedText tone="muted" className="mt-1 text-xs">
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
                      )}

                      {draftReview && accountMatches.length > 1 && !isParsing && (
                        <View
                          testID="account-match-choice"
                          className="mb-4 rounded-[20px] border p-4"
                          style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
                          <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                            Which one did you mean?
                          </ThemedText>
                          <ThemedText tone="muted" className="mt-1 text-xs">
                            More than one saved account fits what you said.
                          </ThemedText>
                          <View className="mt-3 flex-row flex-wrap gap-2">
                            {accountMatches.slice(0, 4).map((match) => {
                              const selected = form.accountId === match.id;
                              return (
                                <Pressable
                                  key={match.id}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() =>
                                    setForm((p) => ({
                                      ...p,
                                      accountId: match.id,
                                      account: match.name,
                                    }))
                                  }
                                  className="rounded-full border px-4 py-2"
                                  style={{
                                    backgroundColor: selected ? `${accent}1F` : theme.card,
                                    borderColor: selected ? accent : theme.border,
                                  }}>
                                  <ThemedText
                                    className="text-xs font-black"
                                    style={{ color: selected ? accent : theme.text }}>
                                    {match.name}
                                  </ThemedText>
                                </Pressable>
                              );
                            })}
                          </View>
                          {newAccountSuggestion && onSetupSuggestedAccount ? (
                            <Pressable
                              testID="account-match-new"
                              accessibilityRole="button"
                              onPress={() => onSetupSuggestedAccount(newAccountSuggestion)}
                              className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3"
                              style={{ borderColor: accent }}>
                              <MaterialCommunityIcons
                                name="plus-circle-outline"
                                size={18}
                                color={accent}
                              />
                              <ThemedText className="text-sm font-black" style={{ color: accent }}>
                                None of these — add a new account
                              </ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                      )}

                      {draftReview && visibleAccountSuggestion && onSetupSuggestedAccount && (
                        <View
                          testID="account-suggestion"
                          className="mb-4 rounded-[20px] border p-4"
                          style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
                          <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                            Add {visibleAccountSuggestion.name}?
                          </ThemedText>
                          <ThemedText tone="muted" className="mt-1 text-xs">
                            {form.type === 'Income'
                              ? 'Use it to record where this money was received. Review the details or create it now.'
                              : 'Use it to keep this payment linked. Review the details or create it now.'}
                          </ThemedText>
                          <View className="mt-3 flex-row gap-3">
                            <Pressable
                              onPress={() => onSetupSuggestedAccount(visibleAccountSuggestion)}
                              className="rounded-full px-4 py-2"
                              style={{ backgroundColor: accent }}>
                              <ThemedText tone="onAccent" className="text-xs font-black">
                                Set up account
                              </ThemedText>
                            </Pressable>
                            <Pressable
                              disabled={autoCreatingAccount}
                              onPress={() =>
                                void handleAutoCreateSuggestedAccount(visibleAccountSuggestion)
                              }
                              className="rounded-full px-3 py-2">
                              <ThemedText tone="muted" className="text-xs font-black">
                                {autoCreatingAccount ? 'Creating…' : 'Create one for me'}
                              </ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      )}

                      {/* Outside the card: a successful create dismisses the
                          suggestion, so feedback nested inside it would unmount
                          in the same commit that produced it. */}
                      {draftReview && <View className="mb-4">{renderAutoCreateFeedback()}</View>}

                      <SettleIn index={draftSettleOrder.summary}>
                        <View className="mb-2">
                          <Pressable
                            testID="draft-summary-toggle"
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isDraftSummaryExpanded }}
                            onPress={() => setIsDraftSummaryExpanded((expanded) => !expanded)}
                            className="w-full flex-row items-center justify-between rounded-[20px] border p-3"
                            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                            <View className="flex-1 flex-row items-center gap-3 pr-2">
                              <MaterialCommunityIcons
                                name="check-circle-outline"
                                size={20}
                                color="#10B981"
                              />
                              <View className="flex-1">
                                <ThemedText
                                  tone="muted"
                                  className="text-[10px] font-bold uppercase">
                                  {draftConfidentCount > 0
                                    ? `${draftConfidentCount} field${draftConfidentCount === 1 ? '' : 's'} the AI is sure about`
                                    : 'Everything else'}
                                </ThemedText>
                                <ThemedText
                                  testID="draft-summary-line"
                                  numberOfLines={1}
                                  className="text-sm font-black"
                                  style={{ color: theme.text }}>
                                  {draftSummaryLine || 'Merchant, tags, notes and receipt'}
                                </ThemedText>
                              </View>
                            </View>
                            <MaterialCommunityIcons
                              name={isDraftSummaryExpanded ? 'chevron-up' : 'chevron-down'}
                              size={22}
                              color="#D1D5DB"
                            />
                          </Pressable>
                          {isDraftSummaryExpanded && (
                            <View className="mt-3 gap-3">
                              {draftCollapsedFields.map(renderDraftField)}
                              {renderReceiptField(false)}
                            </View>
                          )}
                        </View>
                      </SettleIn>
                    </>
                  )}

                  {isEdit && reviewFields.length > 0 && (
                    <View className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
                      <View className="flex-row items-center">
                        <MaterialCommunityIcons name="playlist-check" size={18} color="#D97706" />
                        <ThemedText
                          tone="warning"
                          className="ml-2 text-[11px] font-black uppercase tracking-widest">
                          Review cleanup
                        </ThemedText>
                      </View>
                      <ThemedText tone="warning" className="mt-3 text-sm font-bold">
                        Fix: {reviewFields.map(formatFieldName).join(', ')}
                      </ThemedText>
                      <ThemedText tone="warning" className="mt-2 text-xs">
                        The highlighted field is opened first so you can resolve this transaction
                        quickly.
                      </ThemedText>
                    </View>
                  )}

                  {!draftReview && (
                    <View
                      className={
                        isCompactEntry
                          ? 'rounded-[20px] px-3 py-3 border shadow-sm mb-2'
                          : 'rounded-[20px] p-3 border shadow-sm mb-3'
                      }
                      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                      {/* On the capture path the title is one row, and its
                          placeholder says it is optional — a blank one is saved
                          as the merchant or category. Every row this screen
                          spends on a label is a row the "add details" chips
                          lose to the keypad. */}
                      {!isCompactEntry && (
                        <ThemedText tone="muted" className="text-[10px] font-bold uppercase mb-2">
                          Title
                        </ThemedText>
                      )}
                      <View className="flex-row items-center gap-3">
                        <MaterialCommunityIcons
                          name="label-variant-outline"
                          size={22}
                          color={accent}
                        />
                        <TextInput
                          ref={titleInputRef}
                          testID="entry-title-input"
                          value={form.title}
                          onChangeText={handleTitleChange}
                          onFocus={() => setIsTitleFocused(true)}
                          onBlur={() => setIsTitleFocused(false)}
                          onSubmitEditing={isCompactEntry ? focusAmountKeypad : undefined}
                          returnKeyType={isCompactEntry ? 'next' : 'done'}
                          className="text-base font-black flex-1 p-0"
                          style={{ color: theme.text, height: 24 }}
                          placeholder={
                            isCompactEntry ? 'What was it for? (optional)' : 'What was this for?'
                          }
                          placeholderTextColor={theme.muted}
                        />
                      </View>
                    </View>
                  )}

                  {showFullForm && (
                    <View className="flex-row gap-3 mb-3">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Edit amount"
                        onPress={() => amountInputRef.current?.focus()}
                        className="flex-1 rounded-[20px] p-3 border shadow-sm h-24 justify-between"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <ThemedText tone="muted" className="text-[10px] font-bold uppercase">
                          Amount
                        </ThemedText>
                        <View className="flex-row items-center gap-1">
                          <ThemedText className="text-lg font-black" style={{ color: accent }}>
                            {CURRENCY_SYMBOL}
                          </ThemedText>
                          <TextInput
                            ref={amountInputRef}
                            testID="entry-amount-input"
                            value={form.amount}
                            onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
                            className="text-xl font-black p-0 flex-1"
                            style={{ color: theme.text, height: 32 }}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => setIsModePickerVisible(true)}
                        className="flex-1 rounded-[20px] p-3 border shadow-sm h-24 justify-between"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <ThemedText tone="muted" className="text-[10px] font-bold uppercase">
                          {paymentLanguage.modeLabel}
                        </ThemedText>
                        <View className="flex-row items-center gap-2">
                          <MaterialCommunityIcons name="cash-multiple" size={21} color="#8B5CF6" />
                          <ThemedText
                            className="text-base font-black"
                            style={{ color: theme.text }}>
                            {form.mode}
                          </ThemedText>
                        </View>
                      </Pressable>
                    </View>
                  )}

                  {isCompactEntry && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Edit amount"
                      onPress={focusAmountKeypad}>
                      <AmountDisplay value={form.amount} />
                    </Pressable>
                  )}

                  {/* The review sheet shows the type as a card in its ranked
                      list instead, where it sits with the rest of the draft. */}
                  {/* No label above it: a segmented Expense / Income control
                      says what it is, and a heading saying it again was one
                      more line to read before the amount. */}
                  {!draftReview && !splitContext && (
                    <View className="mb-4">
                      <View
                        accessibilityRole="radiogroup"
                        accessibilityLabel="Transaction type"
                        className="flex-row rounded-[22px] p-1 relative overflow-hidden"
                        style={{ backgroundColor: `${theme.text}0D` }}>
                        <Animated.View
                          style={[
                            {
                              position: 'absolute',
                              top: 4,
                              bottom: 4,
                              left: 4,
                              width: '48%',
                              backgroundColor: form.type === 'Expense' ? accent : '#10B981',
                              borderRadius: 18,
                            },
                            typeSwitchStyle,
                          ]}
                          className="shadow-sm"
                        />
                        <Pressable
                          testID="entry-type-expense"
                          accessibilityRole="radio"
                          accessibilityState={{ selected: form.type === 'Expense' }}
                          onPress={() => selectTransactionType('Expense')}
                          className="flex-1 py-3 items-center justify-center z-10">
                          {/* Colour by tone, not class: a colour className on
                              ThemedText is overridden by its own style, which
                              is how the selected label used to render in the
                              theme's ink instead of white on the accent. */}
                          <ThemedText
                            tone={form.type === 'Expense' ? 'onAccent' : 'muted'}
                            className="text-sm font-black tracking-tight">
                            Expense
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          testID="entry-type-income"
                          accessibilityRole="radio"
                          accessibilityState={{ selected: form.type === 'Income' }}
                          onPress={() => selectTransactionType('Income')}
                          className="flex-1 py-3 items-center justify-center z-10">
                          <ThemedText
                            tone={form.type === 'Income' ? 'onAccent' : 'muted'}
                            className="text-sm font-black tracking-tight">
                            Income
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Category sits with the other essentials when editing. It
                      used to come after the split, EMI and subscription cards,
                      so the one field every entry has was the last one found. */}
                  {showFullForm && (
                    <>
                    {categoryNeedsReview && (
                      <ThemedText
                        tone="warning"
                        className="text-[11px] font-black uppercase tracking-widest mb-4">
                        Check the category
                      </ThemedText>
                    )}
                    {visibleCategorySuggestions.length > 0 && (
                      <View className="mb-3">
                        <ThemedText
                          tone="muted"
                          className="mb-2 text-[10px] font-black uppercase tracking-widest">
                          Suggested from history
                        </ThemedText>
                        <View className="flex-row flex-wrap gap-2">
                          {visibleCategorySuggestions.map((suggestion) => (
                            <Pressable
                              key={suggestion}
                              accessibilityRole="button"
                              onPress={() => selectCategory(suggestion)}
                              className="flex-row items-center rounded-full px-3 py-2"
                              style={{ backgroundColor: accentSurface }}>
                              <MaterialCommunityIcons
                                name="creation-outline"
                                size={13}
                                color={accent}
                              />
                              <ThemedText
                                className="ml-1.5 text-[11px] font-black"
                                style={{ color: accent }}>
                                {suggestion}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}
                    <View className="relative mb-4">
                      {categoryNeedsReview && (
                        <View className="absolute -top-3 right-4 z-10 bg-yellow-400 px-2 py-0.5 rounded-lg">
                          <ThemedText className="text-[8px] font-black">Check this</ThemedText>
                        </View>
                      )}
                      <Pressable
                        testID="entry-category-picker"
                        onPress={() => setIsCategoryPickerVisible(true)}
                        className="w-full rounded-[24px] border p-3 flex-row items-center justify-between"
                        style={{
                          backgroundColor: categoryNeedsReview
                            ? colorScheme === 'dark'
                              ? theme.secondary
                              : '#FFFCF0'
                            : theme.card,
                          borderColor: categoryNeedsReview ? '#FDE68A' : theme.border,
                        }}>
                        <View className="flex-row items-center gap-4">
                          <View
                            className="h-10 w-10 items-center justify-center"
                            style={{
                              backgroundColor: categoryNeedsReview ? '#FEF3C7' : accentSurface,
                              borderRadius: themeTokens.icon.containerRadius,
                            }}>
                            <MaterialCommunityIcons
                              // Was hardcoded to a car, so Misc and Bills both
                              // showed one. The amount-first chip renders the
                              // real icon a few dp away, which made the two
                              // disagree on the same screen. The amber tint and
                              // the "Check this" badge still carry the review
                              // state; the icon does not have to.
                              name={displayedCategoryVisual.icon}
                              size={21}
                              color={categoryNeedsReview ? '#F59E0B' : accent}
                            />
                          </View>
                          <View>
                            <ThemedText tone="muted" className="text-[10px] font-bold uppercase">
                              Category
                            </ThemedText>
                            <ThemedText
                              className="text-sm font-black"
                              style={{ color: theme.text }}>
                              {displayedCategory}
                            </ThemedText>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={24} color="#D1D5DB" />
                      </Pressable>
                    </View>
                    </>
                  )}

                  {isCompactEntry && (
                    <>
                      <View className="mb-3 mt-1 flex-row flex-wrap items-center justify-center gap-2">
                        <Pressable
                          testID="entry-category-chip"
                          accessibilityRole="button"
                          accessibilityLabel={`Category ${displayedCategory}`}
                          onPress={() => setIsCategoryPickerVisible(true)}
                          className="flex-row items-center gap-1.5 rounded-full border px-3 py-2 active:opacity-60"
                          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                          <MaterialCommunityIcons
                            name={displayedCategoryVisual.icon}
                            size={15}
                            color={displayedCategoryVisual.color}
                          />
                          <ThemedText className="text-xs font-black" style={{ color: theme.text }}>
                            {displayedCategory}
                          </ThemedText>
                          <MaterialCommunityIcons name="chevron-down" size={15} color="#9CA3AF" />
                        </Pressable>

                        <Pressable
                          testID="entry-mode-chip"
                          accessibilityRole="button"
                          accessibilityLabel={`${paymentLanguage.modeAccessibilityPrefix} ${form.mode}`}
                          onPress={() => setIsModePickerVisible(true)}
                          className="flex-row items-center gap-1.5 rounded-full border px-3 py-2 active:opacity-60"
                          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                          <MaterialCommunityIcons name="cash-multiple" size={15} color="#8B5CF6" />
                          <ThemedText className="text-xs font-black" style={{ color: theme.text }}>
                            {form.mode}
                          </ThemedText>
                          <MaterialCommunityIcons name="chevron-down" size={15} color="#9CA3AF" />
                        </Pressable>

                        <Pressable
                          testID="entry-account-chip"
                          accessibilityRole="button"
                          accessibilityLabel={`${paymentLanguage.accountAccessibilityPrefix} ${form.account || 'no account yet'}`}
                          onPress={() => setIsAccountPickerVisible(true)}
                          className="flex-row items-center gap-1.5 rounded-full border px-3 py-2 active:opacity-60"
                          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                          <MaterialCommunityIcons name="wallet-outline" size={15} color="#3B82F6" />
                          <ThemedText
                            numberOfLines={1}
                            className="text-xs font-black"
                            style={{ color: theme.text }}>
                            {form.account || `Add ${form.mode} account`}
                          </ThemedText>
                          <MaterialCommunityIcons name="chevron-down" size={15} color="#9CA3AF" />
                        </Pressable>
                      </View>

                      <View className="flex-row items-center justify-center gap-2">
                        {dateChoices.map((choice) => {
                          const isSelected = form.date === choice.value;
                          return (
                            <Pressable
                              key={choice.key}
                              testID={`entry-date-${choice.key}`}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                              onPress={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  date: choice.value,
                                  time: formatTime(new Date()) ?? prev.time,
                                }))
                              }
                              className="rounded-full border px-4 py-2 active:opacity-60"
                              style={{
                                backgroundColor: isSelected ? accentSurface : theme.card,
                                borderColor: isSelected ? accent : theme.border,
                              }}>
                              <ThemedText
                                className="text-xs font-black"
                                style={{ color: isSelected ? accent : theme.text }}>
                                {choice.label}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                        <Pressable
                          testID="entry-date-pick"
                          accessibilityRole="button"
                          accessibilityState={{ selected: isCustomDate }}
                          onPress={handleOpenDatePicker}
                          className="flex-row items-center gap-1.5 rounded-full border px-4 py-2 active:opacity-60"
                          style={{
                            backgroundColor: isCustomDate ? accentSurface : theme.card,
                            borderColor: isCustomDate ? accent : theme.border,
                          }}>
                          <MaterialCommunityIcons
                            name="calendar-blank-outline"
                            size={14}
                            color={isCustomDate ? accent : '#9CA3AF'}
                          />
                          <ThemedText
                            className="text-xs font-black"
                            style={{ color: isCustomDate ? accent : theme.text }}>
                            {isCustomDate ? form.date : 'Pick'}
                          </ThemedText>
                        </Pressable>
                      </View>
                    </>
                  )}

                  {mode !== 'quick-prompt' && showFullForm && (
                    <>
                      <Pressable
                        onPress={handleOpenDatePicker}
                        className="w-full rounded-[20px] p-3 border shadow-sm flex-row items-center justify-between"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <View>
                          <ThemedText tone="muted" className="text-[10px] font-bold uppercase mb-2">
                            Date & time
                          </ThemedText>
                          <View className="flex-row items-center gap-3">
                            <View
                              className="h-9 w-9 rounded-xl items-center justify-center"
                              style={{ backgroundColor: accentSurface }}>
                              <MaterialCommunityIcons
                                name="calendar-multiselect"
                                size={18}
                                color="#8B5CF6"
                              />
                            </View>
                            <ThemedText className="text-sm font-bold" style={{ color: theme.text }}>
                              {form.date}, {form.time}
                            </ThemedText>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color="#D1D5DB" />
                      </Pressable>
                      {personalPayment && (
                        <Pressable
                          testID="entry-account-picker"
                          onPress={() => setIsAccountPickerVisible(true)}
                          className="mt-3 w-full rounded-[20px] p-3 border shadow-sm flex-row items-center justify-between"
                          style={{
                            backgroundColor: accountNeedsReview
                              ? colorScheme === 'dark'
                                ? theme.secondary
                                : '#FFFCF0'
                              : theme.card,
                            borderColor: accountNeedsReview ? '#FDE68A' : theme.border,
                          }}>
                          {accountNeedsReview && (
                            <View className="absolute -top-3 right-4 z-10 bg-yellow-400 px-2 py-0.5 rounded-lg">
                              <ThemedText className="text-[8px] font-black">Check this</ThemedText>
                            </View>
                          )}
                          <View className="flex-row items-center gap-3 flex-1 pr-2">
                            <View
                              className="h-10 w-10 rounded-2xl items-center justify-center"
                              style={{
                                backgroundColor: accountNeedsReview ? '#FEF3C7' : '#EFF6FF',
                              }}>
                              <MaterialCommunityIcons
                                name="wallet-outline"
                                size={21}
                                color={accountNeedsReview ? '#F59E0B' : '#3B82F6'}
                              />
                            </View>
                            <View className="flex-1">
                              <ThemedText tone="muted" className="text-[10px] font-bold uppercase">
                                {paymentLanguage.accountLabel}
                              </ThemedText>
                              <ThemedText
                                className="text-sm font-bold"
                                style={{ color: theme.text }}>
                                {form.account ||
                                  (compatibleAccounts.length === 0
                                    ? `Add a ${form.mode || 'matching'} account`
                                    : 'Select an account')}
                              </ThemedText>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={24} color="#D1D5DB" />
                        </Pressable>
                      )}
                      {!draftReview &&
                        personalPayment &&
                        visibleAccountSuggestion &&
                        onSetupSuggestedAccount && (
                          <View
                            testID="account-suggestion"
                            className="mt-3 rounded-[20px] border p-4"
                            style={{ backgroundColor: theme.secondary, borderColor: theme.border }}>
                            <View className="flex-row items-start gap-3">
                              <MaterialCommunityIcons
                                name="credit-card-plus-outline"
                                size={22}
                                color={accent}
                              />
                              <View className="flex-1">
                                <ThemedText
                                  className="text-sm font-black"
                                  style={{ color: theme.text }}>
                                  Add {visibleAccountSuggestion.name}?
                                </ThemedText>
                                <ThemedText tone="muted" className="mt-1 text-xs">
                                  {form.type === 'Income'
                                    ? 'Use it to record where this money was received. Review the details or create it now.'
                                    : 'Use it to keep this payment linked. Review the details or create it now.'}
                                </ThemedText>
                                <View className="mt-3 flex-row gap-3">
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() =>
                                      onSetupSuggestedAccount(visibleAccountSuggestion)
                                    }
                                    className="rounded-full px-4 py-2"
                                    style={{ backgroundColor: accent }}>
                                    <ThemedText tone="onAccent" className="text-xs font-black">
                                      Set up account
                                    </ThemedText>
                                  </Pressable>
                                  <Pressable
                                    accessibilityRole="button"
                                    disabled={autoCreatingAccount}
                                    onPress={() =>
                                      void handleAutoCreateSuggestedAccount(
                                        visibleAccountSuggestion
                                      )
                                    }
                                    className="rounded-full px-3 py-2">
                                    <ThemedText tone="muted" className="text-xs font-black">
                                      {autoCreatingAccount ? 'Creating…' : 'Create one for me'}
                                    </ThemedText>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          </View>
                        )}
                      {renderAutoCreateFeedback()}
                    </>
                  )}
                </View>

                {splitContext?.fields}

                {/* Optional details. Each one is a field only once it has been
                    asked for or already holds something; the rest wait as chips
                    at the bottom. The review sheet has its own expandable
                    summary, and a second place holding the same fields would
                    compete with it. */}
                {!draftReview &&
                  (isDetailShown('merchant') || isDetailShown('notes') || isDetailShown('tag')) && (
                    <View className="px-5 mb-6 gap-4">
                      {isDetailShown('merchant') && (
                        <Animated.View entering={motion.revealEntering()}>
                          <ThemedText
                            tone="muted"
                            className="mb-2 text-[10px] font-black uppercase tracking-widest">
                            Merchant
                          </ThemedText>
                          <View
                            className="rounded-[20px] border p-3 flex-row items-center gap-3"
                            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                            <View
                              className="h-8 w-8 rounded-xl items-center justify-center"
                              style={{ backgroundColor: detailIconSurface }}>
                              <MaterialCommunityIcons
                                name="storefront-outline"
                                size={16}
                                color={accent}
                              />
                            </View>
                            <TextInput
                              testID="entry-merchant-input"
                              value={form.merchant}
                              onChangeText={(t) => setForm((p) => ({ ...p, merchant: t }))}
                              // Only when the chip just asked for it: a merchant
                              // shown because it already had one stays put.
                              autoFocus={revealedDetails.includes('merchant') && !form.merchant}
                              className="text-sm font-black flex-1 p-0"
                              placeholder="Merchant or store name"
                              placeholderTextColor={detailInputPlaceholderColor}
                              selectionColor={accent}
                              style={{ color: theme.text, minHeight: 24 }}
                            />
                          </View>
                        </Animated.View>
                      )}

                      {isDetailShown('notes') && (
                        <Animated.View entering={motion.revealEntering()}>
                          <ThemedText
                            tone="muted"
                            className="mb-2 text-[10px] font-black uppercase tracking-widest">
                            Note
                          </ThemedText>
                          <TextInput
                            testID="entry-notes-input"
                            multiline
                            placeholder="Add a note…"
                            placeholderTextColor={detailInputPlaceholderColor}
                            value={form.notes}
                            onChangeText={(t) => setForm((p) => ({ ...p, notes: t }))}
                            autoFocus={revealedDetails.includes('notes') && !form.notes}
                            className="rounded-[20px] border px-4 py-3 text-sm font-bold min-h-[84px]"
                            textAlignVertical="top"
                            selectionColor={accent}
                            style={{
                              backgroundColor: theme.card,
                              borderColor: theme.border,
                              color: theme.text,
                            }}
                          />
                        </Animated.View>
                      )}

                      {isDetailShown('tag') && (
                        <Animated.View entering={motion.revealEntering()}>
                          <ThemedText
                            tone="muted"
                            className="mb-2 text-[10px] font-black uppercase tracking-widest">
                            Tag
                          </ThemedText>
                          <View className="flex-row flex-wrap gap-2">
                            {tagOptions.map((tag) => {
                              const selected = form.tag === tag;
                              return (
                                <Pressable
                                  key={tag}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() => {
                                    haptics.select();
                                    setForm((p) => ({ ...p, tag }));
                                  }}
                                  className="rounded-full border px-4 py-2 active:opacity-60"
                                  style={{
                                    backgroundColor: selected ? accentSurface : theme.card,
                                    borderColor: selected ? accent : theme.border,
                                  }}>
                                  <ThemedText
                                    className="text-xs font-bold"
                                    style={{ color: selected ? accent : theme.mutedStrong }}>
                                    {tag}
                                  </ThemedText>
                                </Pressable>
                              );
                            })}
                          </View>
                        </Animated.View>
                      )}
                    </View>
                  )}

                {!splitContext &&
                  mode !== 'quick-prompt' &&
                  form.type === 'Expense' &&
                  // On the review sheet a split the parser did not hear about
                  // is an extra, so it waits behind the summary rather than
                  // pushing Confirm off a clean draft. Everywhere else it is a
                  // chip until it is wanted.
                  (draftReview
                    ? form.splitEnabled || isDraftSummaryExpanded
                    : isDetailShown('split')) && (
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
                  )}

                {personalPayment &&
                  mode !== 'quick-prompt' &&
                  form.tag === 'EMI' && (
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

                {mode !== 'quick-prompt' &&
                  personalPayment &&
                  form.tag === 'Refundable' && (
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
                  (form.subscriptionEnabled || form.tag === 'Subscription') && (
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

                {!draftReview && mode !== 'quick-prompt' && isDetailShown('receipt') && (
                  <Animated.View entering={motion.revealEntering()} className="px-5 mb-6">
                    {renderReceiptField(true)}
                  </Animated.View>
                )}

                {!draftReview && availableDetailOptions.length > 0 && (
                  <View className={isCompactEntry ? 'px-5 mb-2' : 'px-5 mb-6'}>
                    <AddDetailChips
                      options={availableDetailOptions}
                      onAdd={handleAddDetail}
                      testIDPrefix="entry-add"
                      // On the capture screen the chips explain themselves, and
                      // the heading's line is what kept them under the keypad.
                      title={isCompactEntry ? '' : 'Add details'}
                      layout={isCompactEntry ? 'scroll' : 'wrap'}
                    />
                  </View>
                )}

                {!fastEntry && !draftReview && saveActions}
              </ScrollView>

              {(fastEntry || draftReview) && (
                <View
                  className="border-t px-5 pb-6 pt-3 gap-3"
                  style={{ borderColor: theme.border, backgroundColor: theme.background }}>
                  {isKeypadVisible && (
                    <>
                      {quickFills.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                          {quickFills.map((fill) => {
                            const visual = categoryVisual(fill.category, form.type);
                            return (
                              <Pressable
                                key={fill.key}
                                testID={`quick-fill-${fill.key}`}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  fill.kind === 'merchant'
                                    ? `${fill.label}, ${fill.category}`
                                    : `Category ${fill.label}`
                                }
                                onPress={() => applyQuickFill(fill)}
                                className="flex-row items-center gap-2 rounded-full border px-3 py-2 active:opacity-60"
                                style={{
                                  backgroundColor: theme.card,
                                  borderColor: theme.border,
                                }}>
                                <MaterialCommunityIcons
                                  name={visual.icon}
                                  size={14}
                                  color={visual.color}
                                />
                                <ThemedText
                                  numberOfLines={1}
                                  className="text-xs font-black"
                                  style={{ color: theme.text }}>
                                  {fill.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      )}
                      <AmountKeypad value={form.amount} onChange={handleAmountChange} />
                    </>
                  )}
                  {saveActions}
                </View>
              )}
              {splitContext?.overlay ? (
                <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.background }}>
                  {splitContext.overlay}
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {/* Date Picker Modal (iOS) */}
        {Platform.OS === 'ios' && isDatePickerVisible && (
          <TransactionDateTimeSheet
            pendingDate={pendingDate}
            onChangePendingDate={setPendingDate}
            onClose={() => setIsDatePickerVisible(false)}
            onConfirm={handleConfirmDatePicker}
          />
        )}

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
            const nextCategory = normalizeCategoryValue(customCategory, form.type);
            selectCategory(nextCategory);
            setCustomCategory('');
            setIsCategoryPickerVisible(false);
          }}
        />

        <TransactionAccountPicker
          visible={isAccountPickerVisible}
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
      </View>
    </Modal>
  );
}
