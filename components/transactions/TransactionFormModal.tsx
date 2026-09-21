import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
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
import { calculateEMI, type EMICalculation } from '@/lib/emi';
import { formatTime, uses24HourClock } from '@/lib/datetime';
import { haptics } from '@/lib/haptics';
import { formatMoney, toAmount, toAmountInputValue, toKeypadValue } from '@/lib/money';
import { ATTACHMENT_PICKER_TYPES, isLocalAttachmentUri } from '@/lib/uploads';
import type { SplitFriend, SplitGroup } from '@/lib/splits';
import type { BillingInterval } from '@/lib/subscriptions';
import { inferNextSubscriptionDate } from '@/lib/subscription-schedule';
import { formatDateLabel, parseDateLabel } from '@/lib/transactions';
import {
  DEFAULT_CATEGORY,
  categoryOptionsFor,
  categoryVisual,
  defaultCategoryForType,
  resolveCategory,
} from '@/lib/categories';
import { buildQuickFills, type QuickFill } from '@/lib/quick-fills';
import { PAYMENT_MODES, paymentModeVisual } from '@/lib/payment-modes';
import {
  buildDraftReviewPlan,
  draftSummaryParts,
  type DraftFieldKey,
  type DraftReviewPlan,
} from '@/lib/ai-draft-review';
import type { Transaction } from '@/types/transaction';
import { AmountDisplay, AmountKeypad, hasEnteredAmount } from './AmountKeypad';
import { DraftFieldCard } from './DraftFieldCard';
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
  inputSource?: 'voice' | 'text';
};

interface TransactionFormModalProps {
  visible: boolean;
  onClose: () => void;
  initialData?: Partial<EntryForm>;
  onSave: (data: EntryForm) => Promise<void>;
  onDelete?: () => Promise<void>;
  isEdit?: boolean;
  mode?: 'audio' | 'manual' | 'quick-prompt';
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

const requiredFields: (keyof EntryForm)[] = ['title', 'amount', 'type', 'mode', 'category', 'date'];
const fieldLabels: Record<keyof EntryForm, string> = {
  title: 'Transaction Title',
  time: 'Time',
  amount: 'Amount',
  type: 'Type',
  mode: 'Mode',
  category: 'Category',
  date: 'Date',
  notes: 'Notes',
  tag: 'Tag',
  currency: 'Currency',
  accountId: 'Account',
  account: 'Account',
  merchant: 'Merchant',
  attachment: 'Attachment',
  splitEnabled: 'Split',
  splitGroupId: 'Split group',
  splitGroupName: 'Split group',
  splitParticipants: 'Split shares',
  refundableAmount: 'Refundable amount',
  refundExpectedOn: 'Expected refund date',
  refundReminderEnabled: 'Refund reminder',
  emiTenureMonths: 'EMI tenure',
  emiRatePct: 'EMI interest rate',
  subscriptionEnabled: 'Subscription',
  subscriptionName: 'Subscription name',
  subscriptionMerchant: 'Subscription merchant',
  subscriptionCategory: 'Subscription category',
  subscriptionAmount: 'Subscription amount',
  subscriptionBillingInterval: 'Billing interval',
  subscriptionNextDueDate: 'Next payment date',
  subscriptionReminderDays: 'Reminder',
  subscriptionCancelBeforeDue: 'Cancellation reminder',
  subscriptionCancelOnDate: 'Cancellation date',
  subscriptionAutopay: 'Autopay',
  subscriptionNotes: 'Subscription notes',
};

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
// `business_daily` — "Market days", which skips weekends and market holidays —
// is an SIP concept and is no longer offered anywhere subscriptions are
// created. Existing rows can still hold it, so `formatSubscriptionInterval`
// below still knows how to render it.
const subscriptionIntervalOptions: BillingInterval[] = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
];
const tagOptions = ['Investment', 'Lending', 'EMI', 'Refundable', 'Subscription', 'General'];
const emiTenureOptions = [3, 6, 9, 12, 18, 24];

const nextMonthClamped = (value: string) => {
  const purchased = parseDateLabel(value);
  if (!purchased) return '';
  const targetYear =
    purchased.getMonth() === 11 ? purchased.getFullYear() + 1 : purchased.getFullYear();
  const targetMonth = (purchased.getMonth() + 1) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return formatDateLabel(new Date(targetYear, targetMonth, Math.min(purchased.getDate(), lastDay)));
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
 * What the draft is about to look like. Three rows, shaped like the amount card
 * and the two field cards under it, so the parse result lands into the space it
 * was already occupying instead of shoving the sheet around.
 */
function DraftSkeleton() {
  return (
    <View testID="draft-skeleton" accessibilityLabel="Reading your entry" className="mb-4 gap-3">
      <View className="gap-3 rounded-[20px] p-4">
        <Shimmer width={90} height={10} index={0} />
        <Shimmer width={160} height={34} radius={10} index={1} />
      </View>
      {[0, 1].map((row) => (
        <View key={row} className="gap-3 rounded-[20px] p-4">
          <Shimmer width={70} height={10} index={row * 2 + 2} />
          <Shimmer width={row === 0 ? '72%' : '54%'} height={18} radius={8} index={row * 2 + 3} />
        </View>
      ))}
    </View>
  );
}

const formatSubscriptionInterval = (interval: BillingInterval) =>
  interval === 'business_daily' ? 'Market days' : interval;

export function TransactionFormModal({
  visible,
  onClose,
  initialData,
  onSave,
  onDelete,
  isEdit,
  mode = 'manual',
  isParsing = false,
  aiReview,
  accounts = emptyAccounts,
  splitFriends = emptySplitFriends,
  splitGroups = emptySplitGroups,
  onManageAccounts,
  accountSuggestion = null,
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
   * Amount-first entry: a full-width amount over a custom keypad, with
   * everything else folded behind More details.
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

  const [isMoreDetailsExpanded, setIsMoreDetailsExpanded] = useState(false);
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
  const [splitShareMode, setSplitShareMode] = useState<TransactionSplitShareMode>('amount');
  const [isDiscardDialogVisible, setIsDiscardDialogVisible] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const autoFocusedFieldRef = useRef<string | null>(null);
  const amountInputRef = useRef<TextInput>(null);

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
   * The keypad is up whenever the sheet is in its capture state. Opening More
   * details swaps it out: every field under there wants the system keyboard,
   * and two keyboards fighting for the same 250dp is worse than either.
   */
  const isKeypadVisible = fastEntry && !isMoreDetailsExpanded;
  /**
   * The stacked full form. Amount-first folds it behind More details; the AI
   * draft replaces it outright with the confidence-ranked list, so no field
   * ever renders twice on the same screen.
   */
  const showFullForm = !draftReview && (!fastEntry || isMoreDetailsExpanded);
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
      category: 'Food & Drinks',
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
      ...initialData,
    });
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
      setIsMoreDetailsExpanded(false);
      setFormError(null);
      seedForm();

      panelAnim.value = motion.springTo(0);
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
      typeSwitchAnim.value = motion.springTo(isIncome ? 1 : 0);
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
        setAttachmentError('That file could not be read. Please pick another one.');
        return;
      }
      setAttachmentError(null);
      // Stored as a local URI here; it is uploaded when the entry is saved.
      setForm((prev) => ({ ...prev, attachment: asset.uri }));
    } catch {
      setAttachmentError('That file could not be read. Please pick another one.');
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
    if (isSaving) return;
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
    const missingField = requiredFields.find((field) => {
      const value = normalizedForm[field];
      return typeof value === 'string' ? value.trim().length === 0 : !value;
    });

    if (missingField) {
      rejectSave(`Please provide ${fieldLabels[missingField]}.`);
      return;
    }
    const amountValue = Number(form.amount.replace(/,/g, ''));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      rejectSave('Please enter a valid amount.');
      return;
    }
    if (personalPayment && form.tag === 'Refundable') {
      const refundableAmount = Number(form.refundableAmount.replace(/,/g, ''));
      if (!Number.isFinite(refundableAmount) || refundableAmount <= 0) {
        rejectSave('Please enter how much is refundable.');
        return;
      }
      if (refundableAmount > amountValue) {
        rejectSave('Refundable amount cannot exceed the transaction amount.');
        return;
      }
      if (!parseDateLabel(form.refundExpectedOn)) {
        rejectSave('Please choose when the refund is expected.');
        return;
      }
    }
    if (isEMICreditCard) {
      const tenure = Number(form.emiTenureMonths);
      const rate = Number(form.emiRatePct || 0);
      if (!Number.isInteger(tenure) || tenure < 1 || tenure > 360) {
        rejectSave('Please choose an EMI tenure.');
        return;
      }
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        rejectSave('EMI interest rate must be between 0 and 100%.');
        return;
      }
      if (!emiCalculation || isCalculatingEMI) {
        rejectSave('Wait for the EMI schedule before saving.');
        return;
      }
    }
    if (form.splitEnabled && !splitContext) {
      if (form.type !== 'Expense') {
        rejectSave('Splits can be added only to expenses.');
        return;
      }
      if (form.splitParticipants.length === 0) {
        rejectSave('Add at least one friend share for the split.');
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
        rejectSave('Each split share needs a friend and a positive amount.');
        return;
      }
      if (totalSplit > amountValue) {
        rejectSave('Split shares cannot exceed the transaction amount.');
        return;
      }
    }
    if (personalPayment && form.subscriptionEnabled) {
      const subscriptionAmount = Number(form.subscriptionAmount || form.amount);
      const reminderDays = Number(form.subscriptionReminderDays || 0);
      if (form.subscriptionName.trim().length === 0) {
        rejectSave('Please provide Subscription name.');
        return;
      }
      if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
        rejectSave('Please enter a valid subscription amount.');
        return;
      }
      if (!form.subscriptionBillingInterval) {
        rejectSave('Please choose Billing interval.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.subscriptionNextDueDate.trim())) {
        rejectSave('Please enter Next payment date as YYYY-MM-DD.');
        return;
      }
      if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) {
        rejectSave('Reminder must be between 0 and 30 days.');
        return;
      }
      if (
        form.subscriptionCancelBeforeDue &&
        !/^\d{4}-\d{2}-\d{2}$/.test(form.subscriptionCancelOnDate.trim())
      ) {
        rejectSave('Please choose the date when you want the cancellation reminder.');
        return;
      }
      if (
        (form.subscriptionBillingInterval === 'daily' ||
          form.subscriptionBillingInterval === 'business_daily') &&
        !form.subscriptionAutopay
      ) {
        rejectSave('Enable Autopay for daily or market-day transactions.');
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
      rejectSave(getFriendlyErrorMessage(error, 'Something went wrong.'));
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

  /**
   * Pulled out of More details because the AI draft review shows it too,
   * inside its expanded summary. Only ever one of the two is mounted.
   *
   * The heading is a section label, which is how More details reads; in the
   * review list every other row carries its label inside the card, so there
   * the row speaks for itself.
   */
  const renderReceiptField = (withSectionLabel: boolean) => (
    <View>
      {withSectionLabel && (
        <ThemedText
          tone="muted"
          className="text-[10px] font-black uppercase tracking-widest mb-3 italic">
          Receipt
        </ThemedText>
      )}
      <Pressable
        onPress={handlePickAttachment}
        accessibilityRole="button"
        accessibilityLabel={form.attachment ? 'Change receipt' : 'Attach a receipt'}
        className="w-full min-h-[64px] rounded-[20px] border px-4 py-3 flex-row items-center justify-between shadow-sm"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center gap-3 flex-1 pr-3">
          <MaterialCommunityIcons
            name={form.attachment ? 'file-check-outline' : 'file-upload-outline'}
            size={22}
            color={form.attachment ? accent : detailInputPlaceholderColor}
          />
          <View className="flex-1">
            <ThemedText
              className="text-sm font-bold"
              numberOfLines={1}
              style={{ color: form.attachment ? theme.text : detailInputPlaceholderColor }}>
              {form.attachment
                ? decodeURIComponent(form.attachment.split('?')[0].split('/').pop() ?? 'Receipt')
                : 'Attach a photo or PDF'}
            </ThemedText>
            {form.attachment ? (
              <ThemedText tone="muted" className="text-[10px] font-bold mt-0.5">
                {isLocalAttachmentUri(form.attachment)
                  ? 'Uploads when you save'
                  : 'Saved to this transaction'}
              </ThemedText>
            ) : null}
          </View>
        </View>
        {form.attachment ? (
          <Pressable
            onPress={handleRemoveAttachment}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove receipt">
            <MaterialCommunityIcons name="close-circle" size={20} color="#EF4444" />
          </Pressable>
        ) : (
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={20}
            color={detailInputPlaceholderColor}
          />
        )}
      </Pressable>
      {attachmentError ? (
        <ThemedText tone="negative" className="text-[11px] font-bold mt-2 ml-1">
          {attachmentError}
        </ThemedText>
      ) : null}
    </View>
  );

  /**
   * One field of the AI draft, as a card that says how sure the parser was.
   *
   * A picker counts as checked the moment it is opened — the chip asks the
   * user to look, and they looked, whether or not they changed anything. A
   * text field counts when it is actually edited, because opening a keyboard
   * over it proves nothing.
   */
  const renderDraftField = (field: DraftFieldKey) => {
    const flagged = draftPlan?.flagged.includes(field) ?? false;
    const checked = checkedDraftFields.includes(field);

    switch (field) {
      case 'type':
        return (
          <DraftFieldCard
            key={field}
            label="Type"
            icon="swap-vertical"
            flagged={flagged}
            checked={checked}>
            <View className="mt-1.5 flex-row gap-2">
              {(['Expense', 'Income'] as const).map((option) => {
                const isSelected = form.type === option;
                return (
                  <Pressable
                    key={option}
                    testID={`draft-type-${option.toLowerCase()}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      setForm((previous) => ({
                        ...previous,
                        type: option,
                        category: defaultCategoryForType(option),
                      }));
                      animateTypeSwitch(option === 'Income');
                      markDraftFieldChecked('type');
                    }}
                    className="rounded-full border px-3 py-1.5"
                    style={{
                      backgroundColor: isSelected ? accentSurface : theme.card,
                      borderColor: isSelected ? accent : theme.border,
                    }}>
                    <ThemedText
                      className="text-[11px] font-black"
                      style={{ color: isSelected ? accent : theme.text }}>
                      {option}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </DraftFieldCard>
        );
      case 'title':
        return (
          <DraftFieldCard
            key={field}
            label="Transaction Title"
            icon="label-variant-outline"
            flagged={flagged}
            checked={checked}>
            <TextInput
              testID="entry-title-input"
              value={form.title}
              onChangeText={(text) => {
                setForm((previous) => ({ ...previous, title: text }));
                markDraftFieldChecked('title');
              }}
              className="p-0 text-sm font-black"
              placeholder="Short title"
              placeholderTextColor="#9CA3AF"
              selectionColor={accent}
              style={{ color: theme.text, minHeight: 22 }}
            />
          </DraftFieldCard>
        );
      case 'category':
        return (
          <DraftFieldCard
            key={field}
            testID="entry-category-picker"
            label="Category"
            value={displayedCategory}
            icon={displayedCategoryVisual.icon}
            iconColor={displayedCategoryVisual.color}
            flagged={flagged}
            checked={checked}
            accessibilityLabel={`Category ${displayedCategory}`}
            onPress={() => {
              markDraftFieldChecked('category');
              setIsCategoryPickerVisible(true);
            }}
          />
        );
      case 'mode':
        return (
          <DraftFieldCard
            key={field}
            testID="entry-mode-picker"
            label={paymentLanguage.modeLabel}
            value={form.mode}
            placeholder="Choose a payment mode"
            icon={paymentModeVisual(form.mode).icon}
            iconColor={paymentModeVisual(form.mode).color}
            flagged={flagged}
            checked={checked}
            accessibilityLabel={`${paymentLanguage.modeAccessibilityPrefix} ${form.mode || 'not set'}`}
            onPress={() => {
              markDraftFieldChecked('mode');
              setIsModePickerVisible(true);
            }}
          />
        );
      case 'account':
        return (
          <DraftFieldCard
            key={field}
            testID="entry-account-picker"
            label={paymentLanguage.accountLabel}
            value={form.account}
            placeholder={
              compatibleAccounts.length === 0
                ? `Add a ${form.mode || 'matching'} account`
                : 'Select an account'
            }
            icon="wallet-outline"
            iconColor="#3B82F6"
            flagged={flagged}
            checked={checked}
            accessibilityLabel={`${paymentLanguage.accountAccessibilityPrefix} ${form.account || 'no account yet'}`}
            onPress={() => {
              markDraftFieldChecked('account');
              setIsAccountPickerVisible(true);
            }}
          />
        );
      case 'date':
        return (
          <DraftFieldCard
            key={field}
            testID="entry-date-picker"
            label="Date & time"
            value={form.date ? `${draftDateLabel}, ${form.time}` : ''}
            placeholder="Pick a date"
            icon="calendar-multiselect"
            iconColor="#8B5CF6"
            flagged={flagged}
            checked={checked}
            onPress={() => {
              markDraftFieldChecked('date');
              handleOpenDatePicker();
            }}
          />
        );
      case 'merchant':
        return (
          <DraftFieldCard
            key={field}
            label="Merchant"
            icon="storefront-outline"
            flagged={flagged}
            checked={checked}>
            <TextInput
              testID="entry-merchant-input"
              value={form.merchant}
              onChangeText={(text) => {
                setForm((previous) => ({ ...previous, merchant: text }));
                markDraftFieldChecked('merchant');
              }}
              className="p-0 text-sm font-black"
              placeholder="Merchant or store name"
              placeholderTextColor={detailInputPlaceholderColor}
              selectionColor={accent}
              style={{ color: theme.text, minHeight: 22 }}
            />
          </DraftFieldCard>
        );
      case 'tag':
        return (
          <DraftFieldCard
            key={field}
            label="Tag"
            icon="tag-outline"
            flagged={flagged}
            checked={checked}>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {tagOptions.map((tag) => {
                const isSelected = form.tag === tag;
                return (
                  <Pressable
                    key={tag}
                    onPress={() => {
                      setForm((previous) => ({ ...previous, tag }));
                      markDraftFieldChecked('tag');
                    }}
                    className="rounded-full border px-3 py-1.5"
                    style={{
                      backgroundColor: isSelected ? accentSurface : theme.card,
                      borderColor: isSelected ? accent : theme.border,
                    }}>
                    <ThemedText
                      className="text-[11px] font-black"
                      style={{ color: isSelected ? accent : '#6B7280' }}>
                      {tag}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </DraftFieldCard>
        );
      case 'notes':
        return (
          <DraftFieldCard
            key={field}
            label="Notes"
            icon="note-text-outline"
            flagged={flagged}
            checked={checked}>
            <TextInput
              testID="entry-notes-input"
              multiline
              value={form.notes}
              onChangeText={(text) => {
                setForm((previous) => ({ ...previous, notes: text }));
                markDraftFieldChecked('notes');
              }}
              className="p-0 text-sm font-bold"
              placeholder="Add a note..."
              placeholderTextColor={detailInputPlaceholderColor}
              selectionColor={accent}
              style={{ color: theme.text, minHeight: 22 }}
            />
          </DraftFieldCard>
        );
      default:
        // `amount` is the headline above this list and never a row in it.
        return null;
    }
  };

  // Rendered inside the scroll view everywhere except the amount-first path,
  // where it is pinned above the keypad so a save never needs a scroll.
  const saveActions = (
    <View className="px-5 gap-3">
      <Pressable
        testID="entry-save-button"
        onPress={handleConfirmEntry}
        disabled={isSaving || (fastEntry && !amountEntered)}
        style={{ backgroundColor: accent, opacity: fastEntry && !amountEntered ? 0.4 : 1 }}
        className="w-full py-4 rounded-[20px] flex-row items-center justify-center gap-2 shadow-lg">
        {isSaving ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <ThemedText tone="onAccent" className="text-base font-black">
              {isEdit
                ? mode === 'quick-prompt'
                  ? 'Save Prompt'
                  : 'Update Details'
                : mode === 'quick-prompt'
                  ? 'Create Prompt'
                  : fastEntry
                    ? 'Save'
                    : 'Confirm & Save'}
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
                <View className="h-1.5 w-12 rounded-full absolute top-3 bg-gray-200" />
                <Pressable
                  onPress={requestClose}
                  className="absolute right-5 top-5 h-9 w-9 rounded-full items-center justify-center z-10"
                  style={{ backgroundColor: colorScheme === 'dark' ? theme.card : '#F3F4F6' }}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </Pressable>
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
                        ? 'Edit Quick Prompt'
                        : 'Update Details'
                      : mode === 'audio'
                        ? aiReview?.smartSortingDisabled
                          ? 'Review AI Draft'
                          : "I've sorted the details!"
                        : mode === 'quick-prompt'
                          ? 'New Quick Prompt'
                          : splitContext
                            ? 'New split expense'
                            : 'New Transaction'}
                  </ThemedText>
                  {/* The review sheet's banner already says how many fields
                      want a look, and a second line saying it again costs the
                      height that keeps a clean draft scroll-free. Smart Sorting
                      being off is the one thing the banner cannot say. */}
                  {!fastEntry && (!draftReview || aiReview?.smartSortingDisabled) && (
                    <ThemedText tone="muted" className="text-center text-sm leading-5 px-3">
                      {isEdit
                        ? 'Make your changes and confirm below.'
                        : mode === 'audio'
                          ? aiReview?.smartSortingDisabled
                            ? 'Smart Sorting is off, so choose the category and payment details before saving.'
                            : "Here's the AI draft. Review every field before you save."
                          : mode === 'quick-prompt'
                            ? 'These details will be used for your shortcut.'
                            : 'Fill in the transaction details below.'}
                    </ThemedText>
                  )}
                </View>

                <View className={isKeypadVisible ? 'px-5 mb-6 flex-1 justify-center' : 'px-5 mb-6'}>
                  {draftReview && aiReview?.sourceText ? (
                    <View
                      className="mb-3 rounded-[20px] border px-4 py-3"
                      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                      <View className="flex-row items-center gap-1.5">
                        <MaterialCommunityIcons
                          name={
                            aiReview.inputSource === 'text'
                              ? 'keyboard-outline'
                              : 'microphone-outline'
                          }
                          size={13}
                          color="#9CA3AF"
                        />
                        <ThemedText
                          tone="muted"
                          className="text-[10px] font-black uppercase tracking-widest">
                          {aiReview.inputSource === 'text' ? 'You typed' : 'You said'}
                        </ThemedText>
                      </View>
                      <ThemedText
                        testID="draft-source-text"
                        className="mt-1.5 text-sm font-bold italic"
                        style={{ color: theme.text }}>
                        “{aiReview.sourceText}”
                      </ThemedText>
                    </View>
                  ) : null}

                  {mode === 'audio' && (
                    <View className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                          <MaterialCommunityIcons
                            name="creation-outline"
                            size={18}
                            color="#D97706"
                          />
                          <ThemedText
                            tone="warning"
                            className="ml-2 text-[11px] font-black uppercase tracking-widest">
                            AI draft
                          </ThemedText>
                        </View>
                        <View className="rounded-full border border-amber-200 bg-white px-2 py-1 dark:border-amber-800 dark:bg-gray-800">
                          <ThemedText tone="warning" className="text-[9px] font-black uppercase">
                            {/* Mid-parse the chip has no fields to count, and
                                the fallback "Review all fields" is a claim about
                                a draft that does not exist yet. */}
                            {isParsing
                              ? 'Reading'
                              : (draftReview ? draftPendingCount : reviewFields.length) > 0
                                ? `${draftReview ? draftPendingCount : reviewFields.length} field${(draftReview ? draftPendingCount : reviewFields.length) === 1 ? '' : 's'} to check`
                                : hasReviewMetadata
                                  ? 'No issues flagged'
                                  : 'Review all fields'}
                          </ThemedText>
                        </View>
                      </View>
                      {/* The review sheet gives every flagged field its own card
                          below, so naming them here as well would say it twice. */}
                      {!draftReview && reviewFields.length > 0 && (
                        <ThemedText tone="warning" className="mt-3 text-sm font-bold">
                          Check: {reviewFields.map(formatFieldName).join(', ')}
                        </ThemedText>
                      )}
                      {/* On the review sheet these exist to prompt the checks
                          below; once every flagged field has been answered the
                          banner reads "No issues flagged", and a question left
                          sitting under that line contradicts it. */}
                      {(!draftReview || draftPendingCount > 0) &&
                        aiReview?.clarifications?.map((clarification) => (
                          <View key={clarification} className="mt-2 flex-row items-start">
                            <MaterialCommunityIcons
                              name="help-circle-outline"
                              size={16}
                              color="#D97706"
                            />
                            <ThemedText tone="warning" className="ml-2 flex-1 text-sm">
                              {clarification}
                            </ThemedText>
                          </View>
                        ))}
                      <ThemedText tone="warning" className="mt-3 text-xs">
                        AI suggestions are never saved until you confirm.
                      </ThemedText>
                    </View>
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

                  {/* The review sheet shows the type as a card in its ranked
                      list instead, where it sits with the rest of the draft. */}
                  {!draftReview && !splitContext && (
                    <View className="mb-4">
                      <ThemedText
                        tone="muted"
                        className="text-[10px] font-black uppercase tracking-widest mb-2 italic">
                        Transaction Type
                      </ThemedText>
                      <View className="flex-row bg-gray-100 dark:bg-gray-800 rounded-[22px] p-1 relative overflow-hidden">
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
                          onPress={() => {
                            setForm((p) => ({
                              ...p,
                              type: 'Expense',
                              category: defaultCategoryForType('Expense'),
                            }));
                            animateTypeSwitch(false);
                          }}
                          className="flex-1 py-3 items-center justify-center z-10">
                          <ThemedText
                            className={`text-sm font-black tracking-tight ${form.type === 'Expense' ? 'text-white' : 'text-gray-400'}`}>
                            EXPENSE
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setForm((p) => ({
                              ...p,
                              type: 'Income',
                              category: defaultCategoryForType('Income'),
                            }));
                            animateTypeSwitch(true);
                          }}
                          className="flex-1 py-3 items-center justify-center z-10">
                          <ThemedText
                            className={`text-sm font-black tracking-tight ${form.type === 'Income' ? 'text-white' : 'text-gray-400'}`}>
                            INCOME
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {isKeypadVisible && (
                    <>
                      <AmountDisplay value={form.amount} />

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

                  {showFullForm && (
                    <View
                      className="rounded-[20px] p-3 border shadow-sm mb-3"
                      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                      <ThemedText tone="muted" className="text-[10px] font-bold uppercase mb-2">
                        Transaction Title
                      </ThemedText>
                      <View className="flex-row items-center gap-3">
                        <MaterialCommunityIcons
                          name="label-variant-outline"
                          size={22}
                          color={accent}
                        />
                        <TextInput
                          testID="entry-title-input"
                          value={form.title}
                          onChangeText={(t) => setForm((p) => ({ ...p, title: t }))}
                          className="text-base font-black flex-1 p-0"
                          style={{ color: theme.text, height: 24 }}
                          // On the amount-first path a blank title is saved as
                          // this, so the placeholder is the actual outcome.
                          placeholder={
                            fastEntry
                              ? form.merchant.trim() ||
                                normalizeCategoryValue(form.category, form.type)
                              : 'Short title'
                          }
                          placeholderTextColor="#9CA3AF"
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

                  {mode !== 'quick-prompt' && showFullForm && (
                    <>
                      <Pressable
                        onPress={handleOpenDatePicker}
                        className="w-full rounded-[20px] p-3 border shadow-sm flex-row items-center justify-between"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <View>
                          <ThemedText tone="muted" className="text-[10px] font-bold uppercase mb-2">
                            Date & Time
                          </ThemedText>
                          <View className="flex-row items-center gap-3">
                            <View className="h-9 w-9 rounded-xl bg-purple-50 items-center justify-center">
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

                {!splitContext &&
                  mode !== 'quick-prompt' &&
                  form.type === 'Expense' &&
                  // On the review sheet a split the parser did not hear about
                  // is an extra, so it waits behind the summary rather than
                  // pushing Confirm off a clean draft.
                  (showFullForm ||
                    (draftReview && (form.splitEnabled || isDraftSummaryExpanded))) && (
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
                  (showFullForm || draftReview) &&
                  form.tag === 'EMI' && (
                    <View className="px-5 mb-6">
                      <View
                        className="rounded-[24px] border p-4"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <View className="flex-row items-start gap-3">
                          <View
                            className="h-10 w-10 items-center justify-center rounded-2xl"
                            style={{ backgroundColor: accentSurface }}>
                            <MaterialCommunityIcons
                              name="calendar-month-outline"
                              size={20}
                              color={accent}
                            />
                          </View>
                          <View className="flex-1">
                            <ThemedText
                              className="text-sm font-black"
                              style={{ color: theme.text }}>
                              EMI schedule
                            </ThemedText>
                            <ThemedText tone="muted" className="mt-1 text-xs">
                              {isEMICreditCard
                                ? `Convert this purchase on ${selectedAccount?.name ?? 'the selected card'}.`
                                : isEdit
                                  ? 'Existing entries keep EMI as a label. Create a new credit-card transaction to build an instalment schedule.'
                                  : 'EMI is only a label until you choose a credit-card account. Non-card entries are saved without an instalment schedule.'}
                            </ThemedText>
                          </View>
                        </View>

                        {isEMICreditCard ? (
                          <View className="mt-4 gap-4">
                            <View>
                              <ThemedText
                                tone="muted"
                                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                                Tenure
                              </ThemedText>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View className="flex-row gap-2">
                                  {emiTenureOptions.map((months) => (
                                    <Pressable
                                      key={months}
                                      accessibilityRole="button"
                                      accessibilityState={{
                                        selected: form.emiTenureMonths === String(months),
                                      }}
                                      onPress={() =>
                                        setForm((previous) => ({
                                          ...previous,
                                          emiTenureMonths: String(months),
                                        }))
                                      }
                                      className="rounded-full border px-4 py-2"
                                      style={{
                                        borderColor:
                                          form.emiTenureMonths === String(months)
                                            ? accent
                                            : theme.border,
                                        backgroundColor:
                                          form.emiTenureMonths === String(months)
                                            ? accent
                                            : theme.card,
                                      }}>
                                      <ThemedText
                                        className="text-xs font-black"
                                        style={{
                                          color:
                                            form.emiTenureMonths === String(months)
                                              ? '#FFFFFF'
                                              : theme.text,
                                        }}>
                                        {months} mo
                                      </ThemedText>
                                    </Pressable>
                                  ))}
                                </View>
                              </ScrollView>
                            </View>
                            <View className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                              <ThemedText
                                tone="muted"
                                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                                Annual interest rate
                              </ThemedText>
                              <TextInput
                                value={form.emiRatePct}
                                onChangeText={(text) =>
                                  setForm((previous) => ({ ...previous, emiRatePct: text }))
                                }
                                placeholder="0 for no-cost EMI"
                                placeholderTextColor={detailInputPlaceholderColor}
                                keyboardType="decimal-pad"
                                className="p-0 text-sm font-bold"
                                style={{ color: theme.text }}
                              />
                            </View>
                            <View
                              className="rounded-2xl p-4"
                              style={{ backgroundColor: theme.secondary }}>
                              {isCalculatingEMI ? (
                                <View className="flex-row items-center gap-2">
                                  <ActivityIndicator size="small" color={accent} />
                                  <ThemedText tone="muted" className="text-xs">
                                    Calculating schedule…
                                  </ThemedText>
                                </View>
                              ) : emiCalculation ? (
                                <>
                                  <ThemedText
                                    className="text-base font-black"
                                    style={{ color: theme.text }}>
                                    {formatMoney(emiCalculation.principal_amount)} ÷{' '}
                                    {emiCalculation.tenure_months} ={' '}
                                    {formatMoney(emiCalculation.monthly_emi)}/mo
                                  </ThemedText>
                                  <ThemedText tone="muted" className="mt-1 text-xs">
                                    First instalment{' '}
                                    {emiFirstInstallment || 'one month after purchase'}
                                    {emiCalculation.total_interest > 0
                                      ? ` · ${formatMoney(emiCalculation.total_interest)} total interest`
                                      : ' · No-cost EMI'}
                                  </ThemedText>
                                </>
                              ) : (
                                <ThemedText
                                  tone={emiCalculationError ? 'negative' : 'muted'}
                                  className="text-xs">
                                  {emiCalculationError ??
                                    'Choose a tenure to preview the monthly schedule.'}
                                </ThemedText>
                              )}
                            </View>
                            <View className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-900/20">
                              <ThemedText tone="warning" className="text-xs font-bold">
                                Saving replaces this purchase entry with the EMI plan. Only each
                                monthly instalment will appear as spending, so the purchase is not
                                counted twice.
                              </ThemedText>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  )}

                {mode !== 'quick-prompt' &&
                  (showFullForm || draftReview) &&
                  personalPayment &&
                  form.tag === 'Refundable' && (
                    <View className="px-5 mb-6">
                      <View
                        className="rounded-[24px] border p-4"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <View className="flex-row items-center gap-3">
                          <View
                            className="h-10 w-10 items-center justify-center rounded-2xl"
                            style={{ backgroundColor: accentSurface }}>
                            <MaterialCommunityIcons name="cash-refund" size={20} color={accent} />
                          </View>
                          <View className="flex-1">
                            <ThemedText
                              className="text-sm font-black"
                              style={{ color: theme.text }}>
                              Refund tracking
                            </ThemedText>
                            <ThemedText tone="muted" className="text-xs">
                              Track the part of this payment expected back.
                            </ThemedText>
                          </View>
                        </View>
                        <View className="mt-4 gap-3">
                          <View className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                            <ThemedText
                              tone="muted"
                              className="mb-2 text-[10px] font-black uppercase tracking-widest">
                              How much is refundable?
                            </ThemedText>
                            <TextInput
                              value={form.refundableAmount}
                              onChangeText={(text) =>
                                setForm((previous) => ({ ...previous, refundableAmount: text }))
                              }
                              placeholder="5,000"
                              placeholderTextColor={detailInputPlaceholderColor}
                              keyboardType="decimal-pad"
                              className="p-0 text-sm font-bold"
                              style={{ color: theme.text }}
                            />
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              const current = parseDateLabel(form.refundExpectedOn) ?? new Date();
                              if (Platform.OS === 'android') {
                                DateTimePickerAndroid.open({
                                  value: current,
                                  mode: 'date',
                                  onValueChange: (_event, selected) => {
                                    if (selected)
                                      setForm((previous) => ({
                                        ...previous,
                                        refundExpectedOn: formatDateLabel(selected),
                                      }));
                                  },
                                  onDismiss: () => undefined,
                                });
                              } else {
                                setIsRefundDatePickerVisible(true);
                              }
                            }}
                            className="flex-row items-center justify-between rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                            <View>
                              <ThemedText
                                tone="muted"
                                className="text-[10px] font-black uppercase tracking-widest">
                                Expected back
                              </ThemedText>
                              <ThemedText
                                className="mt-1 text-sm font-bold"
                                style={{ color: theme.text }}>
                                {form.refundExpectedOn || 'Choose a date'}
                              </ThemedText>
                            </View>
                            <MaterialCommunityIcons
                              name="calendar-outline"
                              size={20}
                              color={accent}
                            />
                          </Pressable>
                          {isRefundDatePickerVisible && Platform.OS !== 'android' ? (
                            <DateTimePicker
                              value={parseDateLabel(form.refundExpectedOn) ?? new Date()}
                              mode="date"
                              display="inline"
                              onChange={(_event, selected) => {
                                if (selected)
                                  setForm((previous) => ({
                                    ...previous,
                                    refundExpectedOn: formatDateLabel(selected),
                                  }));
                                setIsRefundDatePickerVisible(false);
                              }}
                            />
                          ) : null}
                          <View
                            className="flex-row items-center justify-between rounded-2xl border p-3"
                            style={{ borderColor: theme.border }}>
                            <View className="flex-1 pr-3">
                              <ThemedText
                                className="text-sm font-black"
                                style={{ color: theme.text }}>
                                Remind me
                              </ThemedText>
                              <ThemedText tone="muted" className="text-xs">
                                Notify me on the expected date.
                              </ThemedText>
                            </View>
                            <Pressable
                              accessibilityRole="switch"
                              accessibilityState={{ checked: form.refundReminderEnabled }}
                              onPress={() =>
                                setForm((previous) => ({
                                  ...previous,
                                  refundReminderEnabled: !previous.refundReminderEnabled,
                                }))
                              }
                              className="h-8 w-14 justify-center rounded-full px-1"
                              style={{
                                backgroundColor: form.refundReminderEnabled ? accent : '#E5E7EB',
                              }}>
                              <View
                                className="h-6 w-6 rounded-full bg-white"
                                style={{
                                  alignSelf: form.refundReminderEnabled ? 'flex-end' : 'flex-start',
                                }}
                              />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                {mode !== 'quick-prompt' &&
                  !isEdit &&
                  (showFullForm || draftReview) &&
                  personalPayment &&
                  (form.subscriptionEnabled || form.tag === 'Subscription') && (
                    <View className="px-5 mb-6">
                      <View
                        className="rounded-[24px] border p-3"
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-3">
                            <View
                              className="h-10 w-10 items-center justify-center rounded-2xl"
                              style={{ backgroundColor: accentSurface }}>
                              <MaterialCommunityIcons
                                name="calendar-sync-outline"
                                size={20}
                                color={accent}
                              />
                            </View>
                            <View>
                              <ThemedText
                                className="text-sm font-black"
                                style={{ color: theme.text }}>
                                Add subscription
                              </ThemedText>
                              <ThemedText tone="muted" className="text-xs">
                                Save recurring details with this payment.
                              </ThemedText>
                            </View>
                          </View>
                          <Pressable
                            accessibilityRole="switch"
                            accessibilityState={{ checked: form.subscriptionEnabled }}
                            onPress={() =>
                              setForm((prev) => ({
                                ...prev,
                                subscriptionEnabled: !prev.subscriptionEnabled,
                                subscriptionName:
                                  !prev.subscriptionEnabled && !prev.subscriptionName
                                    ? prev.merchant || prev.title
                                    : prev.subscriptionName,
                                subscriptionAmount:
                                  !prev.subscriptionEnabled && !prev.subscriptionAmount
                                    ? prev.amount
                                    : prev.subscriptionAmount,
                                subscriptionCategory:
                                  !prev.subscriptionEnabled && !prev.subscriptionCategory
                                    ? prev.category
                                    : prev.subscriptionCategory,
                              }))
                            }
                            className="h-8 w-14 justify-center rounded-full px-1"
                            style={{
                              backgroundColor: form.subscriptionEnabled ? accent : '#E5E7EB',
                            }}>
                            <View
                              className="h-6 w-6 rounded-full bg-white"
                              style={{
                                alignSelf: form.subscriptionEnabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </Pressable>
                        </View>

                        {form.subscriptionEnabled && (
                          <View className="mt-5 gap-4">
                            <View className="flex-row gap-3">
                              <TextInput
                                value={form.subscriptionName}
                                onChangeText={(text) =>
                                  setForm((p) => ({ ...p, subscriptionName: text }))
                                }
                                placeholder="Subscription name"
                                placeholderTextColor="#9CA3AF"
                                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                                style={{ color: theme.text }}
                              />
                              <TextInput
                                value={form.subscriptionAmount}
                                onChangeText={(text) =>
                                  setForm((p) => ({
                                    ...p,
                                    subscriptionAmount: text.replace(/[^0-9.]/g, ''),
                                  }))
                                }
                                keyboardType="decimal-pad"
                                placeholder="Amount"
                                placeholderTextColor="#9CA3AF"
                                className="w-28 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                                style={{ color: theme.text }}
                              />
                            </View>
                            <View className="flex-row gap-3">
                              <TextInput
                                value={form.subscriptionMerchant}
                                onChangeText={(text) =>
                                  setForm((p) => ({ ...p, subscriptionMerchant: text }))
                                }
                                placeholder="Merchant"
                                placeholderTextColor="#9CA3AF"
                                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                                style={{ color: theme.text }}
                              />
                              <TextInput
                                value={form.subscriptionCategory}
                                onChangeText={(text) =>
                                  setForm((p) => ({ ...p, subscriptionCategory: text }))
                                }
                                placeholder="Category"
                                placeholderTextColor="#9CA3AF"
                                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                                style={{ color: theme.text }}
                              />
                            </View>

                            <View>
                              <ThemedText
                                tone="muted"
                                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                                Billing interval
                              </ThemedText>
                              <View className="flex-row flex-wrap gap-2">
                                {subscriptionIntervalOptions.map((interval) => (
                                  <Pressable
                                    key={interval}
                                    onPress={() =>
                                      setForm((p) => ({
                                        ...p,
                                        subscriptionBillingInterval: interval,
                                        subscriptionNextDueDate:
                                          p.subscriptionNextDueDate ||
                                          inferNextSubscriptionDate(p.date, interval),
                                        subscriptionAutopay:
                                          interval === 'daily' || interval === 'business_daily'
                                            ? true
                                            : p.subscriptionAutopay,
                                        subscriptionReminderDays:
                                          interval === 'daily' || interval === 'business_daily'
                                            ? '0'
                                            : p.subscriptionReminderDays || '3',
                                      }))
                                    }
                                    className="rounded-full border px-3 py-2"
                                    style={{
                                      backgroundColor:
                                        form.subscriptionBillingInterval === interval
                                          ? accentSurface
                                          : 'transparent',
                                      borderColor:
                                        form.subscriptionBillingInterval === interval
                                          ? accent
                                          : theme.border,
                                    }}>
                                    <ThemedText
                                      className="text-xs font-bold capitalize"
                                      style={{
                                        color:
                                          form.subscriptionBillingInterval === interval
                                            ? accent
                                            : theme.text,
                                      }}>
                                      {formatSubscriptionInterval(interval)}
                                    </ThemedText>
                                  </Pressable>
                                ))}
                              </View>
                            </View>

                            <View className="flex-row gap-3">
                              {form.subscriptionBillingInterval !== 'daily' &&
                              form.subscriptionBillingInterval !== 'business_daily' ? (
                                <Pressable
                                  testID="subscription-next-payment-picker"
                                  accessibilityRole="button"
                                  accessibilityLabel="Choose next payment date"
                                  onPress={handleOpenSubscriptionDatePicker}
                                  className="flex-1 flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                                  <View className="flex-1">
                                    <ThemedText
                                      tone="muted"
                                      className="text-[10px] font-black uppercase tracking-widest">
                                      Next payment date
                                    </ThemedText>
                                    <ThemedText
                                      className="mt-1 text-sm font-bold"
                                      style={{
                                        color: form.subscriptionNextDueDate
                                          ? theme.text
                                          : detailInputPlaceholderColor,
                                      }}>
                                      {form.subscriptionNextDueDate || 'Choose date'}
                                    </ThemedText>
                                  </View>
                                  <MaterialCommunityIcons
                                    name="calendar-month-outline"
                                    size={20}
                                    color={accent}
                                  />
                                </Pressable>
                              ) : (
                                <View
                                  className="flex-1 rounded-2xl px-4 py-3"
                                  style={{ backgroundColor: accentSurface }}>
                                  <ThemedText
                                    className="text-[10px] font-black uppercase tracking-widest"
                                    style={{ color: accent }}>
                                    Automatic schedule
                                  </ThemedText>
                                  <ThemedText
                                    className="mt-1 text-xs font-bold"
                                    style={{ color: theme.text }}>
                                    {form.subscriptionBillingInterval === 'business_daily'
                                      ? 'Next market day; weekends and holidays are skipped.'
                                      : 'Runs every day automatically.'}
                                  </ThemedText>
                                </View>
                              )}
                              {form.subscriptionBillingInterval !== 'daily' &&
                              form.subscriptionBillingInterval !== 'business_daily' ? (
                                <View className="w-28 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-gray-800">
                                  <ThemedText
                                    tone="muted"
                                    className="text-[9px] font-black uppercase tracking-wider">
                                    Remind before
                                  </ThemedText>
                                  <TextInput
                                    value={form.subscriptionReminderDays}
                                    onChangeText={(text) =>
                                      setForm((p) => ({
                                        ...p,
                                        subscriptionReminderDays: text.replace(/[^0-9]/g, ''),
                                      }))
                                    }
                                    keyboardType="number-pad"
                                    placeholder="Days"
                                    placeholderTextColor="#9CA3AF"
                                    className="p-0 pt-1 text-sm font-bold"
                                    style={{ color: theme.text }}
                                  />
                                  <ThemedText tone="muted" className="text-[10px]">
                                    days
                                  </ThemedText>
                                </View>
                              ) : null}
                            </View>

                            <Pressable
                              onPress={() =>
                                setForm((p) => ({
                                  ...p,
                                  subscriptionAutopay: !p.subscriptionAutopay,
                                }))
                              }
                              className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                              <View className="flex-1 pr-3">
                                <ThemedText
                                  className="text-sm font-bold"
                                  style={{ color: theme.text }}>
                                  Autopay
                                </ThemedText>
                                <ThemedText tone="muted" className="mt-1 text-[11px]">
                                  Automatically add each payment from the selected account, then ask
                                  you to confirm or correct it.
                                </ThemedText>
                              </View>
                              <MaterialCommunityIcons
                                name={
                                  form.subscriptionAutopay
                                    ? 'toggle-switch'
                                    : 'toggle-switch-off-outline'
                                }
                                size={34}
                                color={form.subscriptionAutopay ? accent : '#9CA3AF'}
                              />
                            </Pressable>

                            <Pressable
                              onPress={() =>
                                setForm((p) => ({
                                  ...p,
                                  subscriptionCancelBeforeDue: !p.subscriptionCancelBeforeDue,
                                }))
                              }
                              className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                              <ThemedText
                                className="text-sm font-bold"
                                style={{ color: theme.text }}>
                                Remind me to cancel
                              </ThemedText>
                              <MaterialCommunityIcons
                                name={
                                  form.subscriptionCancelBeforeDue
                                    ? 'checkbox-marked-circle'
                                    : 'checkbox-blank-circle-outline'
                                }
                                size={22}
                                color={form.subscriptionCancelBeforeDue ? accent : '#9CA3AF'}
                              />
                            </Pressable>

                            {form.subscriptionCancelBeforeDue && (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                  setPendingCancellationDate(
                                    form.subscriptionCancelOnDate
                                      ? new Date(`${form.subscriptionCancelOnDate}T12:00:00`)
                                      : new Date()
                                  );
                                  setIsCancellationDatePickerVisible(true);
                                }}
                                className="flex-row items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
                                <View>
                                  <ThemedText
                                    tone="muted"
                                    className="text-[10px] font-black uppercase tracking-widest">
                                    Cancellation reminder date
                                  </ThemedText>
                                  <ThemedText className="mt-1 text-sm font-bold">
                                    {form.subscriptionCancelOnDate || 'Choose date'}
                                  </ThemedText>
                                </View>
                                <MaterialCommunityIcons
                                  name="calendar-month-outline"
                                  size={20}
                                  color={accent}
                                />
                              </Pressable>
                            )}

                            <TextInput
                              multiline
                              value={form.subscriptionNotes}
                              onChangeText={(text) =>
                                setForm((p) => ({ ...p, subscriptionNotes: text }))
                              }
                              placeholder="Plan tier, cancellation link, or renewal notes"
                              placeholderTextColor="#9CA3AF"
                              className="min-h-[78px] rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                              textAlignVertical="top"
                              style={{ color: theme.text }}
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                {showFullForm && (
                  <View className="px-5 mb-6">
                    <ThemedText
                      tone="muted"
                      className="text-[11px] font-black uppercase tracking-widest italic mb-4">
                      {categoryNeedsReview ? 'Needs Attention' : 'Category'}
                    </ThemedText>
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
                              onPress={() => setForm((p) => ({ ...p, category: suggestion }))}
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
                  </View>
                )}

                {/* The review sheet has its own expandable summary; a second
                    disclosure holding the same fields would compete with it. */}
                {!draftReview && (
                  <View className="px-5 mb-4">
                    <Pressable
                      testID="entry-more-details-toggle"
                      onPress={() => setIsMoreDetailsExpanded(!isMoreDetailsExpanded)}
                      className="flex-row items-center justify-between py-3 border-b border-gray-50">
                      <View className="flex-row items-center gap-2">
                        <MaterialCommunityIcons name="tune-variant" size={20} color={theme.text} />
                        <ThemedText className="text-sm font-black opacity-60">
                          More details
                        </ThemedText>
                      </View>
                      <MaterialCommunityIcons
                        name={isMoreDetailsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={24}
                        color={theme.text}
                        className="opacity-40"
                      />
                    </Pressable>
                    {isMoreDetailsExpanded && (
                      <View className="mt-4 gap-4">
                        <View className="flex-row gap-4">
                          <View className="flex-1">
                            <ThemedText
                              tone="muted"
                              className="text-[10px] font-black uppercase tracking-widest mb-3 italic">
                              Merchant
                            </ThemedText>
                            <View
                              className="rounded-[20px] border p-3 flex-row items-center gap-3 shadow-sm"
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
                                value={form.merchant}
                                onChangeText={(t) => setForm((p) => ({ ...p, merchant: t }))}
                                className="text-sm font-black flex-1 p-0"
                                placeholder="Merchant or store name"
                                placeholderTextColor={detailInputPlaceholderColor}
                                selectionColor={accent}
                                style={{ color: theme.text, minHeight: 24 }}
                              />
                            </View>
                          </View>
                        </View>

                        <View>
                          <ThemedText
                            tone="muted"
                            className="text-[10px] font-black uppercase tracking-widest mb-3 italic">
                            Tags
                          </ThemedText>
                          <View className="flex-row flex-wrap gap-2">
                            {tagOptions.map((tag) => (
                              <Pressable
                                key={tag}
                                onPress={() => setForm((p) => ({ ...p, tag }))}
                                className="rounded-full border px-4 py-2"
                                style={{
                                  backgroundColor: form.tag === tag ? accentSurface : theme.card,
                                  borderColor: form.tag === tag ? accent : theme.border,
                                }}>
                                <ThemedText
                                  className="text-xs font-bold"
                                  style={{ color: form.tag === tag ? accent : '#6B7280' }}>
                                  {tag}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View>
                          <ThemedText
                            tone="muted"
                            className="text-[10px] font-black uppercase tracking-widest mb-3 italic">
                            Notes
                          </ThemedText>
                          <TextInput
                            multiline
                            placeholder="Add a note..."
                            placeholderTextColor={detailInputPlaceholderColor}
                            value={form.notes}
                            onChangeText={(t) => setForm((p) => ({ ...p, notes: t }))}
                            className="rounded-[20px] border px-4 py-3 text-sm font-bold min-h-[92px] shadow-sm"
                            textAlignVertical="top"
                            selectionColor={accent}
                            style={{
                              backgroundColor: theme.card,
                              borderColor: theme.border,
                              color: theme.text,
                            }}
                          />
                        </View>

                        {renderReceiptField(true)}
                      </View>
                    )}
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
          <AnimatedBottomSheet
            visible={isDatePickerVisible}
            onClose={() => setIsDatePickerVisible(false)}
            backdropOpacity={0.3}>
            <View
              className="rounded-t-3xl px-4 pb-6 pt-4"
              style={{ backgroundColor: theme.background }}>
              <ThemedText className="text-center text-sm font-bold">Select Date & Time</ThemedText>
              <DateTimePicker
                value={pendingDate}
                mode="datetime"
                display="spinner"
                onValueChange={(_e, d) => d && setPendingDate(d)}
                onDismiss={() => setIsDatePickerVisible(false)}
                style={{ width: '100%' }}
              />
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  className="flex-1 items-center rounded-2xl border py-3 border-gray-100"
                  onPress={() => setIsDatePickerVisible(false)}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  className="flex-1 items-center rounded-2xl py-3"
                  style={{ backgroundColor: accent }}
                  onPress={handleConfirmDatePicker}>
                  <ThemedText tone="onAccent" className="font-bold">
                    Set Date
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </AnimatedBottomSheet>
        )}

        {isCancellationDatePickerVisible && (
          <AnimatedBottomSheet
            visible
            onClose={() => setIsCancellationDatePickerVisible(false)}
            backdropOpacity={0.3}>
            <View
              className="rounded-t-3xl px-4 pb-6 pt-4"
              style={{ backgroundColor: theme.background }}>
              <ThemedText className="text-center text-sm font-bold">
                Cancellation reminder date
              </ThemedText>
              <DateTimePicker
                value={pendingCancellationDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onValueChange={(_event, date) => date && setPendingCancellationDate(date)}
                onDismiss={() => setIsCancellationDatePickerVisible(false)}
                style={{ width: '100%' }}
              />
              <Pressable
                className="mt-4 items-center rounded-2xl py-3"
                style={{ backgroundColor: accent }}
                onPress={() => {
                  setForm((p) => ({
                    ...p,
                    subscriptionCancelOnDate: formatApiDate(pendingCancellationDate),
                  }));
                  setIsCancellationDatePickerVisible(false);
                }}>
                <ThemedText tone="onAccent" className="font-bold">
                  Set reminder date
                </ThemedText>
              </Pressable>
            </View>
          </AnimatedBottomSheet>
        )}

        {Platform.OS === 'ios' && isSubscriptionDatePickerVisible && (
          <AnimatedBottomSheet
            visible={isSubscriptionDatePickerVisible}
            onClose={() => setIsSubscriptionDatePickerVisible(false)}
            backdropOpacity={0.3}>
            <View
              className="rounded-t-3xl px-4 pb-6 pt-4"
              style={{ backgroundColor: theme.background }}>
              <ThemedText className="text-center text-sm font-bold">Next payment date</ThemedText>
              <DateTimePicker
                value={pendingSubscriptionDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onValueChange={(_event, date) => date && setPendingSubscriptionDate(date)}
                onDismiss={() => setIsSubscriptionDatePickerVisible(false)}
                style={{ width: '100%' }}
              />
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  className="flex-1 items-center rounded-2xl border py-3"
                  style={{ borderColor: theme.border }}
                  onPress={() => setIsSubscriptionDatePickerVisible(false)}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  className="flex-1 items-center rounded-2xl py-3"
                  style={{ backgroundColor: accent }}
                  onPress={() => {
                    setForm((prev) => ({
                      ...prev,
                      subscriptionNextDueDate: formatApiDate(pendingSubscriptionDate),
                    }));
                    setIsSubscriptionDatePickerVisible(false);
                  }}>
                  <ThemedText tone="onAccent" className="font-bold">
                    Set date
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </AnimatedBottomSheet>
        )}

        {/* Mode Picker */}
        <AnimatedBottomSheet
          visible={isModePickerVisible}
          onClose={() => setIsModePickerVisible(false)}
          backdropOpacity={0.3}>
          <View
            className="rounded-t-3xl px-4 pb-10 pt-4"
            style={{ backgroundColor: theme.background }}>
            <ThemedText className="text-center text-base font-bold mb-6">
              Select Payment Method
            </ThemedText>
            <View className="gap-2">
              {modeOptions.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setForm((p) => resolveEntryFormAccount({ ...p, mode: m }));
                    setIsModePickerVisible(false);
                  }}
                  className="flex-row items-center justify-between rounded-2xl border p-4"
                  style={{
                    backgroundColor:
                      form.mode === m
                        ? accentSurface
                        : colorScheme === 'dark'
                          ? theme.card
                          : '#F9FAFB',
                    borderColor: form.mode === m ? accent : 'transparent',
                  }}>
                  <ThemedText
                    className="font-bold"
                    style={{ color: form.mode === m ? accent : theme.text }}>
                    {m}
                  </ThemedText>
                  {form.mode === m && (
                    <MaterialCommunityIcons name="check" size={20} color={accent} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </AnimatedBottomSheet>

        {/* Category Picker */}
        <AnimatedBottomSheet
          visible={isCategoryPickerVisible}
          onClose={() => setIsCategoryPickerVisible(false)}
          backdropOpacity={0.3}>
          <View
            className="rounded-t-3xl px-4 pb-10 pt-4"
            style={{ backgroundColor: theme.background }}>
            <ThemedText className="text-center text-base font-bold mb-6">
              Select Category
            </ThemedText>
            <ScrollView style={{ maxHeight: 430 }}>
              {visibleCategorySuggestions.length > 0 && (
                <View className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                  <ThemedText
                    tone="warning"
                    className="mb-2 text-[10px] font-black uppercase tracking-widest">
                    Suggested from history
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {visibleCategorySuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        accessibilityRole="button"
                        onPress={() => {
                          setForm((p) => ({ ...p, category: suggestion }));
                          setIsCategoryPickerVisible(false);
                        }}
                        className="rounded-full px-3 py-2"
                        style={{ backgroundColor: theme.card }}>
                        <ThemedText className="text-xs font-black" style={{ color: accent }}>
                          {suggestion}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              <View className="flex-row flex-wrap gap-4 justify-between">
                {selectableCategoryOptions.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setForm((p) => ({ ...p, category: c }));
                      setIsCategoryPickerVisible(false);
                    }}
                    className="w-[47%] items-center gap-2 rounded-3xl border p-4"
                    style={{
                      backgroundColor:
                        form.category === c
                          ? accentSurface
                          : colorScheme === 'dark'
                            ? theme.card
                            : '#F9FAFB',
                      borderColor: form.category === c ? accent : 'transparent',
                    }}>
                    <ThemedText
                      className="text-xs font-bold"
                      style={{ color: form.category === c ? accent : theme.text }}>
                      {c}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <View className="mt-5 rounded-3xl border p-4" style={{ borderColor: theme.border }}>
                <ThemedText
                  tone="muted"
                  className="mb-3 text-[10px] font-black uppercase tracking-widest">
                  Custom category
                </ThemedText>
                <View className="flex-row gap-3">
                  <TextInput
                    testID="entry-custom-category-input"
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    placeholder="Add category"
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                    style={{ color: theme.text }}
                  />
                  <Pressable
                    testID="entry-add-custom-category-button"
                    accessibilityRole="button"
                    onPress={() => {
                      const nextCategory = normalizeCategoryValue(customCategory, form.type);
                      setForm((p) => ({ ...p, category: nextCategory }));
                      setCustomCategory('');
                      setIsCategoryPickerVisible(false);
                    }}
                    className="items-center justify-center rounded-2xl px-4"
                    style={{ backgroundColor: accent }}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </AnimatedBottomSheet>

        {/* Account Picker */}
        <AnimatedBottomSheet
          visible={isAccountPickerVisible}
          onClose={() => setIsAccountPickerVisible(false)}
          backdropOpacity={0.3}>
          <View
            className="rounded-t-3xl px-4 pb-10 pt-4"
            style={{ backgroundColor: theme.background }}>
            <ThemedText className="text-center text-base font-bold mb-6">Select Account</ThemedText>
            <View className="gap-2">
              {compatibleAccounts.map((account) => (
                <Pressable
                  key={account.id}
                  onPress={() => {
                    setForm((p) => ({ ...p, accountId: account.id, account: account.name }));
                    setIsAccountPickerVisible(false);
                  }}
                  className={`p-4 rounded-2xl flex-row items-center justify-between ${form.accountId === account.id ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                  <View>
                    <ThemedText
                      className={`font-bold ${form.accountId === account.id ? 'text-blue-500' : 'text-gray-700'}`}>
                      {account.name}
                    </ThemedText>
                    <ThemedText tone="muted" className="text-xs">
                      {account.provider || account.type}
                    </ThemedText>
                  </View>
                  {form.accountId === account.id && (
                    <MaterialCommunityIcons name="check" size={20} color="#3B82F6" />
                  )}
                </Pressable>
              ))}
              {compatibleAccounts.length === 0 && (
                <View className="items-center gap-4 py-4">
                  <ThemedText tone="muted" className="text-center text-sm">
                    {`No ${form.mode || 'matching'} account found.`}
                  </ThemedText>
                  {actionableAccountSuggestion && onSetupSuggestedAccount ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setIsAccountPickerVisible(false);
                        onSetupSuggestedAccount(actionableAccountSuggestion);
                      }}
                      className="rounded-2xl px-5 py-3"
                      style={{ backgroundColor: accent }}>
                      <ThemedText tone="onAccent" className="font-bold">
                        Set up account
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {actionableAccountSuggestion && onAutoCreateSuggestedAccount ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={autoCreatingAccount}
                      onPress={() =>
                        void handleAutoCreateSuggestedAccount(actionableAccountSuggestion)
                      }
                      className="rounded-2xl border px-5 py-3"
                      style={{ borderColor: accent }}>
                      <ThemedText className="font-bold" style={{ color: accent }}>
                        {autoCreatingAccount ? 'Creating…' : 'Create one for me'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  {autoCreateAccountError ? (
                    <ThemedText tone="negative" className="text-center text-xs">
                      {autoCreateAccountError}
                    </ThemedText>
                  ) : null}
                  {onManageAccounts ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setIsAccountPickerVisible(false);
                        onManageAccounts(actionableAccountSuggestion ?? undefined);
                      }}
                      className="px-3 py-2">
                      <ThemedText tone="muted" className="text-xs font-bold">
                        Manage accounts
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {compatibleAccounts.length > 0 && onManageAccounts && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setIsAccountPickerVisible(false);
                    onManageAccounts();
                  }}
                  className="mt-2 flex-row items-center justify-center gap-2 rounded-2xl border p-4"
                  style={{ borderColor: accent }}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={20} color={accent} />
                  <ThemedText className="font-bold" style={{ color: accent }}>
                    Add or manage payment accounts
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </AnimatedBottomSheet>

        <ThemedDeleteDialog
          visible={isDiscardDialogVisible}
          title="Discard this transaction?"
          message="Your transcribed draft and any changes you made will be lost."
          cancelLabel="Keep editing"
          confirmLabel="Discard transaction"
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
