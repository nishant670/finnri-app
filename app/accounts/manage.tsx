import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { Fonts } from '@/constants/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Shimmer } from '@/components/ui/Shimmer';
import { SkeletonFrame } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  Account,
  AccountApiError,
  fetchAccountProviders,
  fetchAccounts,
  normalizeAccountType,
  saveAccount,
  updateAccount,
  type AccountType,
} from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';

type AccountTypeOption = {
  key: AccountType;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
};

type ProviderOption = {
  id: string;
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const typeOptions: AccountTypeOption[] = [
  { key: 'cash', label: 'Cash', icon: 'cash', color: '#2ECC71', bgColor: '#EAF8F0' },
  {
    key: 'credit_card',
    label: 'Credit',
    icon: 'credit-card',
    color: '#8257E5',
    bgColor: '#F4F1FE',
  },
  {
    key: 'debit_card',
    label: 'Debit',
    icon: 'cash-multiple',
    color: '#00A8FF',
    bgColor: '#E6F6FF',
  },
  { key: 'wallet', label: 'Wallet', icon: 'wallet', color: '#FF9F43', bgColor: '#FFF4EB' },
  { key: 'upi', label: 'UPI', icon: 'qrcode-scan', color: '#00D2B4', bgColor: '#E6FBFA' },
  { key: 'bank', label: 'Bank', icon: 'bank', color: '#3B5998', bgColor: '#EBF0FF' },
  { key: 'other', label: 'Other', icon: 'dots-horizontal', color: '#546E7A', bgColor: '#F0F4F7' },
];

const COLORS = [
  '#FF7A7A',
  '#FF9F43',
  '#FFD32D',
  '#2ECC71',
  '#54A0FF',
  '#8190FF',
  '#B57AFF',
  '#FF79B0',
];

const providerIcon = (assetKey: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  const supported: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    bank: 'bank',
    'credit-card': 'credit-card',
    wallet: 'wallet',
    'qrcode-scan': 'qrcode-scan',
    google: 'google',
    'alpha-p-circle': 'alpha-p-circle',
    amazon: 'shopping-outline',
  };
  return supported[assetKey] ?? 'bank-outline';
};

const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DEFAULT_ACCOUNT_NAMES: Record<AccountType, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank Account',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  wallet: 'Wallet',
  other: 'Other Account',
};

const DEFAULT_ACCOUNT_COLORS: Record<AccountType, string> = {
  cash: '#2ECC71',
  upi: '#00D2B4',
  bank: '#54A0FF',
  credit_card: '#8257E5',
  debit_card: '#00A8FF',
  wallet: '#FF9F43',
  other: '#546E7A',
};

const ACCOUNT_DETAIL_COPY: Record<
  AccountType,
  {
    message: string;
    providerLabel?: string;
    providerPlaceholder?: string;
    balanceLabel: string;
    balanceHint: string;
    identifierLabel?: string;
    identifierPlaceholder?: string;
    identifierIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  }
> = {
  cash: {
    message: 'Set a starting cash amount now, or save it blank and update it later.',
    balanceLabel: 'Opening balance',
    balanceHint: 'Cash in hand before your first logged transaction.',
  },
  upi: {
    message: 'Add the UPI app or handle you use most so scan payments stay grouped.',
    providerLabel: 'UPI app',
    providerPlaceholder: 'Search app or enter custom UPI source',
    balanceLabel: 'Opening balance',
    balanceHint: 'What this held before your first logged transaction.',
    identifierLabel: 'UPI handle or nickname (Optional)',
    identifierPlaceholder: 'name@bank or personal UPI',
    identifierIcon: 'at',
  },
  bank: {
    message: 'Add the bank and last 4 digits so transfers are easier to identify.',
    providerLabel: 'Bank',
    providerPlaceholder: 'Search bank or enter custom bank',
    balanceLabel: 'Opening balance',
    balanceHint: 'What this held before your first logged transaction.',
    identifierLabel: 'Last 4 digits (Optional)',
    identifierPlaceholder: '1234',
    identifierIcon: 'numeric-4-box-outline',
  },
  credit_card: {
    message: 'Add reminders and limits so this card is easier to track.',
    providerLabel: 'Card issuer',
    providerPlaceholder: 'Search issuer (e.g. HDFC, Amex)',
    balanceLabel: 'Opening outstanding',
    balanceHint: 'What you already owed before your first logged transaction.',
    identifierLabel: 'Last 4 digits',
    identifierPlaceholder: '••••',
    identifierIcon: 'numeric-4-box-outline',
  },
  debit_card: {
    message: 'Add the bank and last 4 digits so card spends can be categorized faster.',
    providerLabel: 'Bank',
    providerPlaceholder: 'Search bank or enter custom bank',
    balanceLabel: 'Opening balance',
    balanceHint: 'What this held before your first logged transaction.',
    identifierLabel: 'Last 4 digits (Optional)',
    identifierPlaceholder: '1234',
    identifierIcon: 'numeric-4-box-outline',
  },
  wallet: {
    message: 'Add the wallet provider and balance to keep prepaid spends separate.',
    providerLabel: 'Wallet',
    providerPlaceholder: 'Search wallet or enter custom wallet',
    balanceLabel: 'Opening balance',
    balanceHint: 'What this held before your first logged transaction.',
    identifierLabel: 'Wallet nickname (Optional)',
    identifierPlaceholder: 'Personal wallet',
    identifierIcon: 'wallet-outline',
  },
  other: {
    message: 'Add a balance or short identifier if this source needs extra context.',
    balanceLabel: 'Opening balance',
    balanceHint: 'What this held before your first logged transaction.',
    identifierLabel: 'Identifier (Optional)',
    identifierPlaceholder: 'Reference or nickname',
    identifierIcon: 'card-text-outline',
  },
};

const getMissingSetupCount = (account: Account) => {
  const accountType = normalizeAccountType(account.type);
  const hasProvider = Boolean(account.provider?.trim());
  const hasIdentifier = Boolean(
    account.last4?.trim() ||
      account.upi_handle?.trim() ||
      account.wallet_nickname?.trim() ||
      account.identifier?.trim()
  );
  const hasBalance = typeof account.balance === 'number' && account.balance !== 0;
  const hasCreditLimit = Boolean(account.credit_limit && account.credit_limit > 0);
  const hasDueDay = Boolean(account.due_day && account.due_day >= 1 && account.due_day <= 31);

  if (accountType === 'credit_card') {
    return [hasProvider, hasIdentifier, hasCreditLimit, hasDueDay].filter((complete) => !complete)
      .length;
  }

  if (accountType === 'cash') {
    return hasBalance ? 0 : 1;
  }

  return [hasProvider, hasIdentifier, hasBalance].filter((complete) => !complete).length;
};

export default function ManageAccountScreen() {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();
  const {
    id,
    type,
    focus,
    name: suggestedName,
    provider,
    identifier,
    color,
  } = useLocalSearchParams<{
    id?: string;
    type?: string;
    focus?: string;
    name?: string;
    provider?: string;
    identifier?: string;
    color?: string;
  }>();
  const accountId = id ? Number(id) : null;
  const isEditing = Number.isInteger(accountId) && accountId !== null && accountId > 0;
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAccount, setIsLoadingAccount] = useState(isEditing);
  const [isDefault, setIsDefault] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<Account | null>(null);

  // Step navigation
  const [step, setStep] = useState(1);

  // Step 1 States
  const [selectedType, setSelectedType] = useState<AccountType>('bank');
  const [selectedColor, setSelectedColor] = useState('#54A0FF');
  const [name, setName] = useState('');

  // Step 2 States
  const [issuerQuery, setIssuerQuery] = useState('');
  const [selectedIssuer, setSelectedIssuer] = useState<ProviderOption | null>(null);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [showIssuerResults, setShowIssuerResults] = useState(false);

  const [last4, setLast4] = useState('');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState('3');
  const [feeMonth, setFeeMonth] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [feeWaiverSpend, setFeeWaiverSpend] = useState('');

  // Modal States
  const [showDayModal, setShowDayModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);

  useEffect(() => {
    if (isEditing || !type) return;
    const presetType = normalizeAccountType(type);
    setSelectedType(presetType);
    setSelectedColor(color || DEFAULT_ACCOUNT_COLORS[presetType]);
    setName(suggestedName || DEFAULT_ACCOUNT_NAMES[presetType]);
    setIssuerQuery(provider || '');
    setSelectedIssuer(null);
    setLast4(identifier || '');
  }, [color, identifier, isEditing, provider, suggestedName, type]);

  useEffect(() => {
    if (!token || !isEditing || accountId === null) {
      setIsLoadingAccount(false);
      return;
    }
    let active = true;
    void fetchAccounts(token)
      .then((accounts) => {
        if (!active) return;
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) {
          throw new Error('Account not found.');
        }
        setSelectedType(account.type);
        setSelectedColor(account.color || '#54A0FF');
        setName(account.name);
        setIssuerQuery(account.provider || '');
        setSelectedIssuer(
          account.provider_id
            ? {
                id: account.provider_id,
                name: account.provider_details?.display_name || account.provider || account.name,
                icon: providerIcon(account.provider_details?.asset_key || 'bank'),
              }
            : null
        );
        setLast4(
          account.last4 || account.upi_handle || account.wallet_nickname || account.identifier || ''
        );
        setBalance(account.balance ? String(account.balance) : '');
        setCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
        setDueDay(account.due_day ? String(account.due_day) : '');
        setReminderEnabled(account.reminder_enabled !== false);
        setReminderDaysBefore(String(account.reminder_days_before ?? 3));
        setFeeMonth(account.fee_month || '');
        setAnnualFee(account.annual_fee ? String(account.annual_fee) : '');
        setFeeWaiverSpend(account.fee_waiver_spend ? String(account.fee_waiver_spend) : '');
        setIsDefault(Boolean(account.is_default));
        if (focus === 'details') {
          setStep(2);
        }
      })
      .catch((error) => {
        setSaveError(getFriendlyErrorMessage(error, 'Unable to load account.'));
        router.back();
      })
      .finally(() => {
        if (active) setIsLoadingAccount(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, focus, isEditing, token]);

  useEffect(() => {
    if (!token) {
      setProviderOptions([]);
      return;
    }
    let active = true;
    void fetchAccountProviders(token, selectedType)
      .then((providers) => {
        if (!active) return;
        const options = providers.map((item) => ({
          id: item.id,
          name: item.display_name,
          icon: providerIcon(item.asset_key),
        }));
        setProviderOptions(options);
      })
      .catch(() => {
        if (active) setProviderOptions([]);
      });
    return () => {
      active = false;
    };
  }, [selectedType, token]);

  useEffect(() => {
    if (selectedIssuer || !issuerQuery.trim()) return;
    const normalized = issuerQuery.trim().toLowerCase();
    const match = providerOptions.find((item) => item.name.toLowerCase() === normalized);
    if (match) {
      setSelectedIssuer(match);
      setIssuerQuery(match.name);
    }
  }, [issuerQuery, providerOptions, selectedIssuer]);

  const updateSelectedType = (nextType: AccountType) => {
    if (nextType === selectedType) {
      setTypeError(null);
      return;
    }
    setSelectedType(nextType);
    setSelectedColor((currentColor) =>
      currentColor === DEFAULT_ACCOUNT_COLORS[selectedType]
        ? DEFAULT_ACCOUNT_COLORS[nextType]
        : currentColor
    );
    setName((currentName) => {
      if (!currentName || currentName === DEFAULT_ACCOUNT_NAMES[selectedType]) {
        return DEFAULT_ACCOUNT_NAMES[nextType];
      }
      return currentName;
    });
    setIssuerQuery('');
    setSelectedIssuer(null);
    setShowIssuerResults(false);
    setLast4('');
    setCreditLimit('');
    setDueDay('');
    setReminderEnabled(true);
    setReminderDaysBefore('3');
    setFeeMonth('');
    setAnnualFee('');
    setFeeWaiverSpend('');
    setTypeError(null);
  };

  const resetNewAccountForm = () => {
    const nextType: AccountType = 'bank';
    setCreatedAccount(null);
    setSelectedType(nextType);
    setSelectedColor(DEFAULT_ACCOUNT_COLORS[nextType]);
    setName(DEFAULT_ACCOUNT_NAMES[nextType]);
    setIssuerQuery('');
    setSelectedIssuer(null);
    setShowIssuerResults(false);
    setLast4('');
    setBalance('');
    setCreditLimit('');
    setDueDay('');
    setReminderEnabled(true);
    setReminderDaysBefore('3');
    setFeeMonth('');
    setAnnualFee('');
    setFeeWaiverSpend('');
    setIsDefault(false);
    setSaveError(null);
    setTypeError(null);
    setStep(1);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!name) {
      haptics.rejected();
      setSaveError('Please enter a name for the account.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        type: normalizeAccountType(selectedType),
        name: name.trim(),
        color: selectedColor,
        provider: selectedIssuer?.name || issuerQuery.trim(),
        identifier: last4,
        provider_id: selectedIssuer?.id || '',
        last4:
          selectedType === 'bank' || selectedType === 'credit_card' || selectedType === 'debit_card'
            ? last4
            : '',
        upi_handle: selectedType === 'upi' ? last4 : '',
        wallet_nickname: selectedType === 'wallet' ? last4 : '',
        credit_limit: parseFloat(creditLimit) || 0,
        due_day: parseInt(dueDay) || 0,
        reminder_enabled: reminderEnabled,
        reminder_days_before: Math.min(30, Math.max(0, parseInt(reminderDaysBefore) || 0)),
        fee_month: feeMonth,
        // Card-only. Left out for other types so the server keeps what it has.
        ...(selectedType === 'credit_card'
          ? {
              annual_fee: parseFloat(annualFee) || 0,
              fee_waiver_spend: parseFloat(feeWaiverSpend) || 0,
            }
          : {}),
        balance: parseFloat(balance) || 0,
        is_default: isDefault,
      };
      if (isEditing && accountId !== null) {
        await updateAccount(token, accountId, payload);
        haptics.saved();
        router.back();
      } else {
        const savedAccount = await saveAccount(token, payload);
        haptics.saved();
        setCreatedAccount(savedAccount);
        setStep(3);
      }
    } catch (err: unknown) {
      haptics.rejected();
      if (err instanceof AccountApiError && err.fields?.type) {
        setStep(1);
        setTypeError('Choose an account type and try again.');
      }
      setSaveError(getFriendlyErrorMessage(err, 'Failed to save account.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCreatedDefault = async () => {
    if (!token || !createdAccount || createdAccount.is_default) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updatedAccount = await updateAccount(token, createdAccount.id, {
        type: normalizeAccountType(createdAccount.type),
        name: createdAccount.name,
        color: createdAccount.color,
        provider: createdAccount.provider,
        identifier: createdAccount.identifier,
        provider_id: createdAccount.provider_id,
        last4: createdAccount.last4,
        upi_handle: createdAccount.upi_handle,
        wallet_nickname: createdAccount.wallet_nickname,
        account_nickname: createdAccount.account_nickname,
        credit_limit: createdAccount.credit_limit,
        due_day: createdAccount.due_day,
        fee_month: createdAccount.fee_month,
        balance: createdAccount.balance,
        is_default: true,
      });
      setCreatedAccount(updatedAccount);
      setIsDefault(true);
    } catch (err: unknown) {
      setSaveError(getFriendlyErrorMessage(err, 'Unable to set default account.'));
    } finally {
      setIsSaving(false);
    }
  };

  const detailCopy = ACCOUNT_DETAIL_COPY[selectedType];

  const filteredIssuers = useMemo(() => {
    if (!issuerQuery) return [];
    return providerOptions.filter((i) => i.name.toLowerCase().includes(issuerQuery.toLowerCase()));
  }, [issuerQuery, providerOptions]);

  const selectProvider = (provider: ProviderOption) => {
    setSelectedIssuer(provider);
    setIssuerQuery(provider.name);
    setShowIssuerResults(false);
  };

  const updateIdentifier = (value: string) => {
    if (
      selectedType === 'bank' ||
      selectedType === 'credit_card' ||
      selectedType === 'debit_card'
    ) {
      setLast4(value.replace(/[^0-9]/g, '').slice(0, 4));
      return;
    }
    setLast4(value.slice(0, 40));
  };

  const renderSelectionModal = (
    visible: boolean,
    onClose: () => void,
    data: string[],
    onSelect: (item: string) => void,
    title: string
  ) => (
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
      <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
        <View style={styles.modalHeader}>
          <ThemedText style={[styles.modalTitle, { color: theme.text }]}>{title}</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalList}>
          {data.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.modalItem}
              onPress={() => {
                onSelect(item);
                onClose();
              }}>
              <ThemedText style={[styles.modalItemText, { color: theme.text }]}>{item}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );

  const renderStep1 = () => (
    <>
      <ScreenHeader
        subtitle="STEP 1 OF 2"
        onBack={() => router.back()}
        rightIcon="help-circle-outline"
      />

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.stepIntro}>
          <ThemedText style={styles.stepEyebrow}>Account basics</ThemedText>
          <ThemedText style={[styles.stepTitle, { color: theme.text }]}>
            {isEditing ? 'Update this account' : 'Add a payment source'}
          </ThemedText>
          <ThemedText style={styles.stepDescription}>
            Choose the account type and name Finnri should use when matching transactions.
          </ThemedText>
        </View>

        {/* Account Type Selection */}
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>What kind of account is this?</ThemedText>
        <View style={styles.gridContainer}>
          {typeOptions.map((option) => {
            const isSelected = selectedType === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => updateSelectedType(option.key)}
                style={[
                  styles.gridItem,
                  isSelected ? styles.gridItemSelected : styles.gridItemUnselected,
                  { backgroundColor: theme.card },
                  isSelected && { borderColor: theme.accent },
                ]}>
                <View style={[styles.gridIconContainer, { backgroundColor: option.bgColor }]}>
                  <MaterialCommunityIcons name={option.icon} size={24} color={option.color} />
                </View>
                <View style={styles.gridLabelContainer}>
                  <ThemedText
                    style={[
                      styles.gridLabel,
                      { color: isSelected ? theme.text : theme.muted },
                    ]}>
                    {option.label}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {typeError ? <ThemedText style={styles.errorText}>{typeError}</ThemedText> : null}

        {/* Name Input */}
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>What should we call it?</ThemedText>
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <MaterialCommunityIcons
            name="tag-outline"
            size={24}
            color={theme.accent}
            style={styles.inputIcon}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="My Spending Account"
            placeholderTextColor={theme.muted}
            style={[styles.textInput, { color: theme.text }]}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setIsDefault((current) => !current)}
          style={[styles.defaultCard, { backgroundColor: theme.card }]}>
          <View style={styles.defaultIcon}>
            <MaterialCommunityIcons name="star-outline" size={22} color={theme.accent} />
          </View>
          <View style={styles.defaultCopy}>
            <ThemedText style={[styles.defaultTitle, { color: theme.text }]}>Use as default account</ThemedText>
            <ThemedText style={styles.defaultDescription}>
              Finnri will preselect it when a transaction matches this payment type.
            </ThemedText>
          </View>
          <View
            style={[
              styles.defaultToggle,
              { backgroundColor: theme.card, borderColor: theme.border },
              isDefault && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}>
            {isDefault && <MaterialCommunityIcons name="check" size={16} color="white" />}
          </View>
        </TouchableOpacity>

        {/* Color Picker */}
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Choose account color</ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.colorScroll}>
          {COLORS.map((color) => {
            const isSelected = selectedColor === color;
            return (
              <TouchableOpacity
                key={color}
                onPress={() => setSelectedColor(color)}
                style={[
                  styles.colorItem,
                  { backgroundColor: color },
                  isSelected && styles.colorItemSelected,
                ]}>
                {isSelected && <View style={[styles.colorRing, { borderColor: theme.accent }]} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingScreen>

      {/* Footer Step 1 */}
      <View style={[styles.footer, { backgroundColor: theme.background }]}>
        {saveError ? (
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
            <ThemedText style={styles.errorText}>{saveError}</ThemedText>
          </View>
        ) : null}
        <View style={styles.footerActions}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStep(2)}
            style={[
              styles.saveButton,
              { backgroundColor: theme.accent, shadowColor: theme.accent },
            ]}
            disabled={isSaving}>
            <ThemedText style={styles.saveButtonText}>Continue</ThemedText>
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <MaterialCommunityIcons name="thumb-up-outline" size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const renderStep2 = () => {
    if (selectedType === 'credit_card') {
      return (
        <View style={{ flex: 1 }}>
          <ScreenHeader
            subtitle="STEP 2 OF 2"
            onBack={() => setStep(1)}
            rightText={isSaving ? 'Saving' : 'Save basic'}
            onRightPress={handleSave}
          />
          <KeyboardAvoidingScreen
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {/* Mascot & Message Step 2 */}
            <View style={styles.mascotSection}>
              <View style={[styles.bubbleContainer, { backgroundColor: theme.secondary }]}>
                <ThemedText style={[styles.bubbleText, { color: theme.text }]}>{detailCopy.message}</ThemedText>
                <View style={[styles.bubbleTriangle, { backgroundColor: theme.secondary }]} />
              </View>
              <View style={styles.mascotRowCenter}>
                <View
                  style={[
                    styles.mascotAvatar,
                    { backgroundColor: '#FFEEED', width: 56, height: 56, borderRadius: 28 },
                  ]}>
                  <MaterialCommunityIcons
                    name="face-woman-outline"
                    size={32}
                    color={theme.accent}
                  />
                </View>
              </View>
            </View>

            <ThemedText style={styles.sectionHeaderLabel}>VISUALS</ThemedText>

            <ThemedText style={[styles.labelSmall, { color: theme.text }]}>{detailCopy.providerLabel}</ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.providerChips}>
              {providerOptions.slice(0, 5).map((provider) => {
                const isActive = issuerQuery === provider.name;
                return (
                  <TouchableOpacity
                    key={provider.id}
                    onPress={() => selectProvider(provider)}
                    style={[
                      styles.providerChip,
                      { backgroundColor: theme.card },
                      isActive && { borderColor: theme.accent, backgroundColor: '#F4F1FE' },
                    ]}>
                    <MaterialCommunityIcons
                      name={provider.icon}
                      size={16}
                      color={isActive ? theme.accent : '#64748B'}
                    />
                    <ThemedText
                      style={[styles.providerChipText, isActive && { color: theme.accent }]}>
                      {provider.name}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.searchWrapper}>
              <View style={[styles.dropdownContainer, { backgroundColor: theme.card }]}>
                <MaterialCommunityIcons
                  name="credit-card-outline"
                  size={24}
                  color={theme.accent}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInputSmall, { color: theme.text }]}
                  value={issuerQuery}
                  onChangeText={(text) => {
                    setIssuerQuery(text);
                    setSelectedIssuer(null);
                    setShowIssuerResults(true);
                  }}
                  onFocus={() => setShowIssuerResults(true)}
                  placeholder={detailCopy.providerPlaceholder}
                  placeholderTextColor={theme.muted}
                />
                <MaterialCommunityIcons name="chevron-down" size={24} color="#AAB7C6" />
              </View>

              {showIssuerResults && filteredIssuers.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: theme.card }]}>
                  {filteredIssuers.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.resultItem}
                      onPress={() => {
                        selectProvider(item);
                      }}>
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={20}
                        color={theme.accent}
                        style={{ marginRight: 10 }}
                      />
                      <ThemedText style={[styles.resultItemText, { color: theme.text }]}>{item.name}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <ThemedText style={[styles.labelSmall, { color: theme.text }]}>{detailCopy.identifierLabel}</ThemedText>
            <View style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
              <MaterialCommunityIcons
                name={detailCopy.identifierIcon ?? 'numeric-4-box-outline'}
                size={24}
                color={theme.accent}
                style={styles.inputIcon}
              />
              <TextInput
                value={last4}
                onChangeText={updateIdentifier}
                placeholder={detailCopy.identifierPlaceholder}
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                style={[styles.textInputSmall, { color: theme.text }]}
              />
            </View>

            <View style={{ height: 24 }} />

            <ThemedText style={styles.sectionHeaderLabel}>ALERTS & LIMITS</ThemedText>

            <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Credit limit</ThemedText>
            <View style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
              <MaterialCommunityIcons
                name="currency-inr"
                size={24}
                color={theme.accent}
                style={styles.inputIcon}
              />
              <TextInput
                value={creditLimit}
                onChangeText={(val) => setCreditLimit(val.replace(/[^0-9]/g, ''))}
                placeholder="1,00,000"
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                style={[styles.textInputSmall, { color: theme.text }]}
              />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Due Day</ThemedText>
                <TouchableOpacity
                  style={[styles.dropdownContainerSmall, { backgroundColor: theme.card }]}
                  onPress={() => setShowDayModal(true)}>
                  <MaterialCommunityIcons
                    name="calendar-outline"
                    size={20}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <ThemedText style={[styles.dropdownTextSmall, { color: theme.text }, !dueDay && { color: '#AAB7C6' }]}>
                    {dueDay || 'Day'}
                  </ThemedText>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#AAB7C6" />
                </TouchableOpacity>
              </View>
              <View style={{ width: 16 }} />
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Fee Month</ThemedText>
                <TouchableOpacity
                  style={[styles.dropdownContainerSmall, { backgroundColor: theme.card }]}
                  onPress={() => setShowMonthModal(true)}>
                  <MaterialCommunityIcons
                    name="calendar-refresh-outline"
                    size={20}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <ThemedText style={[styles.dropdownTextSmall, { color: theme.text }, !feeMonth && { color: '#AAB7C6' }]}>
                    {feeMonth || 'Month'}
                  </ThemedText>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#AAB7C6" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.row, { marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Annual fee</ThemedText>
                <View style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
                  <MaterialCommunityIcons
                    name="currency-inr"
                    size={20}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    testID="card-annual-fee"
                    value={annualFee}
                    onChangeText={(val) => setAnnualFee(val.replace(/[^0-9]/g, ''))}
                    placeholder="500"
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    style={[styles.textInputSmall, { color: theme.text }]}
                  />
                </View>
              </View>
              <View style={{ width: 16 }} />
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
                  Waived above (yearly)
                </ThemedText>
                <View style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
                  <MaterialCommunityIcons
                    name="currency-inr"
                    size={20}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    testID="card-fee-waiver"
                    value={feeWaiverSpend}
                    onChangeText={(val) => setFeeWaiverSpend(val.replace(/[^0-9]/g, ''))}
                    placeholder="1,00,000"
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    style={[styles.textInputSmall, { color: theme.text }]}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: reminderEnabled }}
              onPress={() => setReminderEnabled((current) => !current)}
              style={[styles.inputContainerSmall, { marginTop: 20 }]}>
              <MaterialCommunityIcons
                name={reminderEnabled ? 'bell-ring-outline' : 'bell-off-outline'}
                size={24}
                color={reminderEnabled ? theme.accent : '#AAB7C6'}
                style={styles.inputIcon}
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.dropdownTextSmall, { color: theme.text }]}>Due reminder</ThemedText>
                <ThemedText style={[styles.labelSmall, { color: theme.text }, { marginTop: 2, marginBottom: 0 }]}>
                  {reminderEnabled ? 'Enabled for this card' : 'Off for this card'}
                </ThemedText>
              </View>
              <MaterialCommunityIcons
                name={reminderEnabled ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={34}
                color={reminderEnabled ? theme.accent : '#AAB7C6'}
              />
            </TouchableOpacity>

            {reminderEnabled && (
              <>
                <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Remind me this many days before</ThemedText>
                <View style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
                  <MaterialCommunityIcons
                    name="calendar-clock-outline"
                    size={24}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={reminderDaysBefore}
                    onChangeText={(value) =>
                      setReminderDaysBefore(value.replace(/[^0-9]/g, '').slice(0, 2))
                    }
                    placeholder="3"
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    style={[styles.textInputSmall, { color: theme.text }]}
                  />
                </View>
              </>
            )}
          </KeyboardAvoidingScreen>

          {/* Footer Step 2 */}
          <View style={[styles.footer, { backgroundColor: theme.background }]}>
            {saveError ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
                <ThemedText style={styles.errorText}>{saveError}</ThemedText>
              </View>
            ) : null}
            <View style={styles.footerActions}>
              <TouchableOpacity onPress={() => setStep(1)} style={styles.cancelButton}>
                <ThemedText style={styles.cancelText}>Back</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[
                  styles.saveButton,
                  { backgroundColor: theme.accent, shadowColor: theme.accent },
                ]}
                disabled={isSaving}>
                <ThemedText style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Done 🎉'}
                </ThemedText>
                {isSaving && <ActivityIndicator size="small" color="white" className="ml-2" />}
              </TouchableOpacity>
            </View>
          </View>

          {renderSelectionModal(
            showDayModal,
            () => setShowDayModal(false),
            DAYS,
            setDueDay,
            'Select Due Day'
          )}
          {renderSelectionModal(
            showMonthModal,
            () => setShowMonthModal(false),
            MONTHS,
            setFeeMonth,
            'Select Fee Month'
          )}
        </View>
      );
    }

    // Generic Step 2 for other account types
    return (
      <>
        <ScreenHeader
          subtitle="STEP 2 OF 2"
          onBack={() => setStep(1)}
          rightText={isSaving ? 'Saving' : 'Save basic'}
          onRightPress={handleSave}
        />
        <KeyboardAvoidingScreen
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.mascotSection}>
            <View style={[styles.bubbleContainer, { backgroundColor: theme.secondary }]}>
              <ThemedText style={[styles.bubbleText, { color: theme.text }]}>{detailCopy.message}</ThemedText>
              <View style={[styles.bubbleTriangle, { backgroundColor: theme.secondary }]} />
            </View>
          </View>

          {detailCopy.providerLabel && (
            <>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>{detailCopy.providerLabel}</ThemedText>
              {providerOptions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.providerChips}>
                  {providerOptions.map((provider) => {
                    const isActive = issuerQuery === provider.name;
                    return (
                      <TouchableOpacity
                        key={provider.id}
                        onPress={() => selectProvider(provider)}
                        style={[
                          styles.providerChip,
                          { backgroundColor: theme.card },
                      { backgroundColor: theme.card },
                          isActive && { borderColor: theme.accent, backgroundColor: '#F4F1FE' },
                        ]}>
                        <MaterialCommunityIcons
                          name={provider.icon}
                          size={16}
                          color={isActive ? theme.accent : '#64748B'}
                        />
                        <ThemedText
                          style={[styles.providerChipText, isActive && { color: theme.accent }]}>
                          {provider.name}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <View style={styles.searchWrapper}>
                <View style={[styles.dropdownContainer, { backgroundColor: theme.card }]}>
                  <MaterialCommunityIcons
                    name={
                      selectedType === 'upi'
                        ? 'qrcode-scan'
                        : selectedType === 'wallet'
                          ? 'wallet-outline'
                          : 'bank-outline'
                    }
                    size={24}
                    color={theme.accent}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.textInputSmall, { color: theme.text }]}
                    value={issuerQuery}
                    onChangeText={(text) => {
                      setIssuerQuery(text);
                      setSelectedIssuer(null);
                      setShowIssuerResults(true);
                    }}
                    onFocus={() => setShowIssuerResults(true)}
                    placeholder={detailCopy.providerPlaceholder}
                    placeholderTextColor={theme.muted}
                  />
                </View>

                {showIssuerResults && filteredIssuers.length > 0 && (
                  <View style={[styles.resultsList, { backgroundColor: theme.card }]}>
                    {filteredIssuers.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.resultItem}
                        onPress={() => selectProvider(item)}>
                        <MaterialCommunityIcons
                          name={item.icon}
                          size={20}
                          color={theme.accent}
                          style={{ marginRight: 10 }}
                        />
                        <ThemedText style={[styles.resultItemText, { color: theme.text }]}>{item.name}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}

          {/* One name for one field. This used to be "Cash in hand", "Tracked
              balance", "Initial balance", "Linked balance" and "Wallet balance"
              across five account types — five words for the number Finnri now
              runs a real balance forward from. */}
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>{detailCopy.balanceLabel}</ThemedText>
          <ThemedText style={styles.fieldHint}>{detailCopy.balanceHint}</ThemedText>
          <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
            <MaterialCommunityIcons
              name="scale-balance"
              size={24}
              color={theme.accent}
              style={styles.inputIcon}
            />
            <TextInput
              value={balance}
              onChangeText={(value) => setBalance(value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={theme.muted}
              keyboardType="decimal-pad"
              style={[styles.textInput, { color: theme.text }]}
            />
          </View>

          {detailCopy.identifierLabel && (
            <>
              <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>{detailCopy.identifierLabel}</ThemedText>
              <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
                <MaterialCommunityIcons
                  name={detailCopy.identifierIcon ?? 'card-text-outline'}
                  size={24}
                  color={theme.accent}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={last4}
                  onChangeText={updateIdentifier}
                  placeholder={detailCopy.identifierPlaceholder}
                  placeholderTextColor={theme.muted}
                  keyboardType={
                    selectedType === 'bank' || selectedType === 'debit_card'
                      ? 'number-pad'
                      : 'default'
                  }
                  autoCapitalize="none"
                  style={[styles.textInput, { color: theme.text }]}
                />
              </View>
            </>
          )}
        </KeyboardAvoidingScreen>

        <View style={[styles.footer, { backgroundColor: theme.background }]}>
          {saveError ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
              <ThemedText style={styles.errorText}>{saveError}</ThemedText>
            </View>
          ) : null}
          <View style={styles.footerActions}>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.cancelButton}>
              <ThemedText style={styles.cancelText}>Back</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[
                styles.saveButton,
                { backgroundColor: theme.accent, shadowColor: theme.accent },
              ]}
              disabled={isSaving}>
              <ThemedText style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Finish Setup'}
              </ThemedText>
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <MaterialCommunityIcons name="check-all" size={20} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  };

  const renderSuccess = () => {
    const accountType = normalizeAccountType(createdAccount?.type ?? selectedType);
    const accountName = createdAccount?.name ?? name.trim();
    const visual = typeOptions.find((option) => option.key === accountType) ?? typeOptions[6];
    const missingSetupCount = createdAccount ? getMissingSetupCount(createdAccount) : 0;

    return (
      <>
        <ScreenHeader subtitle="ACCOUNT ADDED" onBack={() => router.back()} />
        <View style={styles.successContent}>
          <View style={[styles.successCard, { backgroundColor: theme.card }]}>
            <View style={[styles.successIcon, { backgroundColor: visual.bgColor }]}>
              <MaterialCommunityIcons name={visual.icon} size={34} color={visual.color} />
            </View>
            <ThemedText style={[styles.successTitle, { color: theme.text }]} numberOfLines={2}>
              {accountName}
            </ThemedText>
            <ThemedText style={styles.successMessage}>
              This account is ready for transaction tracking. You can view it now or add another
              payment source.
            </ThemedText>
          </View>
        </View>
        <View style={[styles.footer, { backgroundColor: theme.background }]}>
          {saveError ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
              <ThemedText style={styles.errorText}>{saveError}</ThemedText>
            </View>
          ) : null}
          <View style={styles.successActions}>
            {createdAccount && (
              <TouchableOpacity
                onPress={() =>
                  router.replace({
                    pathname: '/accounts/[id]',
                    params: { id: String(createdAccount.id) },
                  })
                }
                style={[styles.fullWidthButton, { backgroundColor: theme.accent }]}>
                <ThemedText style={styles.saveButtonText}>View account</ThemedText>
                <MaterialCommunityIcons name="arrow-right" size={20} color="white" />
              </TouchableOpacity>
            )}
            {createdAccount && missingSetupCount > 0 && (
              <TouchableOpacity
                onPress={() =>
                  router.replace({
                    pathname: '/accounts/manage',
                    params: { id: String(createdAccount.id), focus: 'details' },
                  })
                }
                style={[styles.fullWidthButton, styles.secondaryFullWidthButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText style={styles.secondaryFullWidthText}>
                  Complete {missingSetupCount} detail{missingSetupCount > 1 ? 's' : ''}
                </ThemedText>
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={20}
                  color={theme.accent}
                />
              </TouchableOpacity>
            )}
            {createdAccount && !createdAccount.is_default && (
              <TouchableOpacity
                onPress={handleSetCreatedDefault}
                disabled={isSaving}
                style={[styles.fullWidthButton, styles.secondaryFullWidthButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {isSaving ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <ThemedText style={styles.secondaryFullWidthText}>Set as default</ThemedText>
                    <MaterialCommunityIcons name="star-outline" size={20} color={theme.accent} />
                  </>
                )}
              </TouchableOpacity>
            )}
            {createdAccount?.is_default && (
              <View style={styles.successDefaultPill}>
                <MaterialCommunityIcons name="star" size={16} color={theme.accent} />
                <ThemedText style={styles.successDefaultText}>Default account</ThemedText>
              </View>
            )}
            <TouchableOpacity
              onPress={resetNewAccountForm}
              style={[styles.fullWidthButton, styles.secondaryFullWidthButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={styles.secondaryFullWidthText}>Add another account</ThemedText>
              <MaterialCommunityIcons name="plus" size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={styles.doneTextButton}>
              <ThemedText style={[styles.cancelText, { textAlign: 'center' }]}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom']}>
      <View style={styles.container}>
        {isLoadingAccount ? (
          <SkeletonFrame
            label="Loading account"
            testID="account-form-skeleton"
            style={{ paddingHorizontal: 24, paddingTop: 24, gap: 20 }}>
            <Shimmer width="56%" height={26} radius={10} index={0} />
            {[0, 1, 2, 3].map((field) => (
              <View key={field} style={{ gap: 10 }}>
                <Shimmer width="34%" height={10} index={field * 2 + 1} />
                <Shimmer height={54} radius={18} index={field * 2 + 2} />
              </View>
            ))}
          </SkeletonFrame>
        ) : step === 1 ? (
          renderStep1()
        ) : step === 2 ? (
          renderStep2()
        ) : (
          renderSuccess()
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9F7FC',
  },
  container: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successCard: {
    alignItems: 'center',
    borderRadius: 32,
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  successTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: Fonts.title,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    paddingBottom: 2,
  },
  successMessage: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.body,
    color: '#64748B',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  stepIntro: {
    marginBottom: 28,
  },
  stepEyebrow: {
    fontSize: 12,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#8257E5',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: Fonts.title,
    fontWeight: '900',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  mascotSection: {
    marginBottom: 40,
  },
  bubbleContainer: {
    backgroundColor: '#EFEAFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    position: 'relative',
  },
  bubbleText: {
    fontSize: 18,
    fontFamily: Fonts.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  bubbleTriangle: {
    position: 'absolute',
    bottom: -8,
    left: 24,
    width: 16,
    height: 16,
    backgroundColor: '#EFEAFF',
    transform: [{ rotate: '45deg' }],
  },
  mascotRowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFDED6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'white',
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#AAB7C6',
    letterSpacing: 1.5,
    marginBottom: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '900',
    marginBottom: 16,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: -10,
    marginBottom: 12,
    color: '#7C8EA8',
  },
  labelSmall: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '900',
    marginBottom: 10,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 32,
  },
  gridItem: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 24,
  },
  gridItemSelected: {
    borderColor: 'transparent',
    backgroundColor: 'white',
  },
  gridItemUnselected: {
    borderColor: 'transparent',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  gridIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridLabel: {
    fontSize: 12,
    fontFamily: Fonts.title,
    fontWeight: '900',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  inputContainerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchWrapper: {
    zIndex: 1000,
    position: 'relative',
  },
  dropdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  resultsList: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 24,
    maxHeight: 200,
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    paddingVertical: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  resultItemText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '600',
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.title,
    fontWeight: 'bold',
  },
  textInputSmall: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dropdownContainerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  dropdownTextSmall: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '900',
  },
  providerChips: {
    gap: 10,
    paddingRight: 24,
    paddingBottom: 14,
  },
  providerChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 14,
  },
  providerChipText: {
    fontSize: 12,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#64748B',
  },
  colorScroll: {
    gap: 12,
    paddingRight: 24,
  },
  colorItem: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: 'transparent',
  },
  colorItemSelected: {
    borderColor: 'white',
  },
  colorRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 30,
    borderWidth: 2,
  },
  defaultCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: 'white',
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: -6,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  defaultIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F1FE',
    marginRight: 14,
  },
  defaultCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  defaultTitle: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '900',
  },
  defaultDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  defaultToggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: 'white',
  },
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#F9F7FC',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  successActions: {
    gap: 12,
  },
  fullWidthButton: {
    minHeight: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  secondaryFullWidthButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
  },
  secondaryFullWidthText: {
    fontSize: 15,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#8257E5',
  },
  successDefaultPill: {
    minHeight: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F4F1FE',
    paddingHorizontal: 16,
  },
  successDefaultText: {
    fontSize: 13,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#8257E5',
  },
  doneTextButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: 'rgba(211, 47, 47, 0.12)',
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: '#D32F2F',
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '900',
    color: '#BDBDBD',
  },
  saveButton: {
    backgroundColor: '#90A4AE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 32,
    shadowColor: '#90A4AE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: Fonts.title,
    fontWeight: '900',
    marginRight: 8,
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.title,
    fontWeight: '900',
  },
  modalList: {
    paddingHorizontal: 24,
  },
  modalItem: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  modalItemText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '600',
  },
});
