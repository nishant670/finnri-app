import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { normalizeAccountType, type Account, type AccountType } from '@/lib/accounts';

export type AccountTypeOption = {
  key: AccountType;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
};

export type ProviderOption = {
  id: string;
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export const typeOptions: AccountTypeOption[] = [
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

export const COLORS = [
  '#FF7A7A',
  '#FF9F43',
  '#FFD32D',
  '#2ECC71',
  '#54A0FF',
  '#8190FF',
  '#B57AFF',
  '#FF79B0',
];

export const providerIcon = (assetKey: string): keyof typeof MaterialCommunityIcons.glyphMap => {
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

export const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
export const MONTHS = [
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

export const DEFAULT_ACCOUNT_NAMES: Record<AccountType, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank Account',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  wallet: 'Wallet',
  other: 'Other Account',
};

export const DEFAULT_ACCOUNT_COLORS: Record<AccountType, string> = {
  cash: '#2ECC71',
  upi: '#00D2B4',
  bank: '#54A0FF',
  credit_card: '#8257E5',
  debit_card: '#00A8FF',
  wallet: '#FF9F43',
  other: '#546E7A',
};

export const ACCOUNT_DETAIL_COPY: Record<
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

export const getMissingSetupCount = (account: Account) => {
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
