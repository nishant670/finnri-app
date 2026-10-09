import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

import { styles } from '@/components/accounts/account-form-styles';
import { AccountFormStepOne } from '@/components/accounts/AccountFormStepOne';
import { AccountFormStepTwo } from '@/components/accounts/AccountFormStepTwo';
import { AccountFormSuccess } from '@/components/accounts/AccountFormSuccess';
import {
  DEFAULT_ACCOUNT_COLORS,
  DEFAULT_ACCOUNT_NAMES,
  ACCOUNT_DETAIL_COPY,
  providerIcon,
  type ProviderOption,
} from '@/lib/account-form';

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
          <AccountFormStepOne
            isDefault={isDefault}
            isEditing={isEditing}
            isSaving={isSaving}
            name={name}
            saveError={saveError}
            selectedColor={selectedColor}
            selectedType={selectedType}
            setIsDefault={setIsDefault}
            setName={setName}
            setSelectedColor={setSelectedColor}
            setStep={setStep}
            typeError={typeError}
            updateSelectedType={updateSelectedType}
          />
        ) : step === 2 ? (
          <AccountFormStepTwo
            annualFee={annualFee}
            balance={balance}
            creditLimit={creditLimit}
            detailCopy={detailCopy}
            dueDay={dueDay}
            feeMonth={feeMonth}
            feeWaiverSpend={feeWaiverSpend}
            filteredIssuers={filteredIssuers}
            handleSave={handleSave}
            isEditing={isEditing}
            isSaving={isSaving}
            issuerQuery={issuerQuery}
            last4={last4}
            providerOptions={providerOptions}
            reminderDaysBefore={reminderDaysBefore}
            reminderEnabled={reminderEnabled}
            saveError={saveError}
            selectProvider={selectProvider}
            selectedType={selectedType}
            setAnnualFee={setAnnualFee}
            setBalance={setBalance}
            setCreditLimit={setCreditLimit}
            setDueDay={setDueDay}
            setFeeMonth={setFeeMonth}
            setFeeWaiverSpend={setFeeWaiverSpend}
            setIssuerQuery={setIssuerQuery}
            setReminderDaysBefore={setReminderDaysBefore}
            setReminderEnabled={setReminderEnabled}
            setSelectedIssuer={setSelectedIssuer}
            setShowDayModal={setShowDayModal}
            setShowIssuerResults={setShowIssuerResults}
            setShowMonthModal={setShowMonthModal}
            setStep={setStep}
            showDayModal={showDayModal}
            showIssuerResults={showIssuerResults}
            showMonthModal={showMonthModal}
            updateIdentifier={updateIdentifier}
          />
        ) : (
          <AccountFormSuccess
            createdAccount={createdAccount}
            handleSetCreatedDefault={handleSetCreatedDefault}
            isSaving={isSaving}
            name={name}
            resetNewAccountForm={resetNewAccountForm}
            saveError={saveError}
            selectedType={selectedType}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
