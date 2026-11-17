import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { Shimmer } from '@/components/ui/Shimmer';
import { SkeletonFrame } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  Account,
  AccountApiError,
  fetchAccountProviders,
  fetchAccounts,
  normalizeAccountType,
  saveAccount,
  setAccountBalance,
  toAccountPayload,
  updateAccount,
  type AccountPayload,
  type AccountType,
  type CardNetwork,
  type CardProductSummary,
  type CreditKind,
} from '@/lib/accounts';
import { cardBankName, cardNetworkLabel, cardProductTitle, productArt } from '@/lib/card-art';
import { userDisplayName } from '@/lib/display-name';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { withSetupDetail, type AccountSetupItem } from '@/lib/account-display';
import { haptics } from '@/lib/haptics';

import { CardNetworkChips, CardProductPicker } from '@/components/cards/CardProductPicker';
import { SketchCard } from '@/components/cards/SketchCard';
import { styles } from '@/components/accounts/account-form-styles';
import { AccountStyleFold } from '@/components/accounts/AccountFormStepOne';
import { AccountFormStepTwo } from '@/components/accounts/AccountFormStepTwo';
import { AccountFormSuccess } from '@/components/accounts/AccountFormSuccess';
import { AccountIdentityFields, AccountTypeChips } from '@/components/accounts/AccountSheetFields';
import {
  DEFAULT_ACCOUNT_COLORS,
  DEFAULT_ACCOUNT_NAMES,
  ACCOUNT_DETAIL_COPY,
  PAY_LATER_DETAIL_COPY,
  moreDetailsSummary,
  providerIcon,
  suggestAccountName,
  type ProviderOption,
} from '@/lib/account-form';

export default function ManageAccountScreen() {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token, user } = useAuthStore();
  const keyboardInset = useKeyboardInset();
  const {
    id,
    type,
    name: suggestedName,
    provider,
    identifier,
    color,
    focus,
  } = useLocalSearchParams<{
    id?: string;
    type?: string;
    name?: string;
    provider?: string;
    identifier?: string;
    color?: string;
    focus?: string;
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
  // Credit and Pay later are both credit_card accounts; this tells them apart.
  const [creditKind, setCreditKind] = useState<CreditKind>('');
  const [selectedColor, setSelectedColor] = useState('#54A0FF');
  const [name, setName] = useState('');
  // Until the user types a name, the name follows the bank and last 4 digits.
  // An account being edited, or a name a caller suggested, is left alone.
  const [nameTouched, setNameTouched] = useState(isEditing || Boolean(suggestedName));

  // Step 2 States
  const [issuerQuery, setIssuerQuery] = useState('');
  const [selectedIssuer, setSelectedIssuer] = useState<ProviderOption | null>(null);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [showIssuerResults, setShowIssuerResults] = useState(false);

  // Credit cards: the exact card from the catalogue (plan §6), or "isn't
  // listed", and the network printed on it.
  const [cardProduct, setCardProduct] = useState<CardProductSummary | null>(null);
  const [cardNotListed, setCardNotListed] = useState(false);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork | ''>('');

  const [last4, setLast4] = useState('');
  const [balance, setBalance] = useState('');
  // The field asks for today's balance, but the account stores an opening
  // one. Untouched, the opening goes back as it was; typed, the server works
  // back to a new opening from it.
  const [balanceTouched, setBalanceTouched] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [creditLimit, setCreditLimit] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState('3');
  const [feeMonth, setFeeMonth] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [feeWaiverSpend, setFeeWaiverSpend] = useState('');

  // Folds: the optional settings each screen keeps out of the way.
  const [showStyleOptions, setShowStyleOptions] = useState(false);
  // Open when editing, or when the Account added screen sent someone here to
  // fill a detail in: the field they came for must be on screen.
  const [showMoreDetails, setShowMoreDetails] = useState(isEditing || focus === 'details');
  const [showReminderOptions, setShowReminderOptions] = useState(false);
  const [showAnnualFee, setShowAnnualFee] = useState(false);

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
        setCreditKind(account.credit_kind ?? '');
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
        setOpeningBalance(account.balance ?? 0);
        const running = account.summary?.running_balance;
        setBalance(
          normalizeAccountType(account.type) === 'credit_card'
            ? account.balance
              ? String(account.balance)
              : ''
            : typeof running === 'number'
              ? String(running)
              : ''
        );
        setCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
        setDueDay(account.due_day ? String(account.due_day) : '');
        setReminderEnabled(account.reminder_enabled !== false);
        setReminderDaysBefore(String(account.reminder_days_before ?? 3));
        setFeeMonth(account.fee_month || '');
        setAnnualFee(account.annual_fee ? String(account.annual_fee) : '');
        setFeeWaiverSpend(account.fee_waiver_spend ? String(account.fee_waiver_spend) : '');
        setCardProduct(account.card_product ?? null);
        setCardNetwork(account.card_network ?? '');
        setIsDefault(Boolean(account.is_default));
      })
      .catch((error) => {
        setSaveError(getFriendlyErrorMessage(error, "Couldn't load this account."));
        router.back();
      })
      .finally(() => {
        if (active) setIsLoadingAccount(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, isEditing, token]);

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
          creditKind: item.credit_kind,
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
      setShowIssuerResults(false);
    }
  }, [issuerQuery, providerOptions, selectedIssuer]);

  const pickingProduct = selectedType === 'credit_card' && creditKind !== 'pay_later';
  // A product belongs to one bank: choosing another bank drops it.
  useEffect(() => {
    if (cardProduct && selectedIssuer && cardProduct.issuer_id !== selectedIssuer.id) {
      setCardProduct(null);
      setCardNotListed(false);
    }
  }, [cardProduct, selectedIssuer]);

  const nameSuggestion = suggestAccountName({
    type: selectedType,
    creditKind,
    provider:
      pickingProduct && cardProduct
        ? cardProductTitle(selectedIssuer?.id, selectedIssuer?.name || issuerQuery, cardProduct.name)
        : selectedIssuer?.name || issuerQuery,
    identifier: last4,
  });
  useEffect(() => {
    if (!nameTouched) setName(nameSuggestion);
  }, [nameSuggestion, nameTouched]);

  const updateSelectedType = (nextType: AccountType, nextKind: CreditKind = '') => {
    if (nextType === selectedType && nextKind === creditKind) {
      setTypeError(null);
      return;
    }
    setSelectedType(nextType);
    setCreditKind(nextKind);
    setSelectedColor((currentColor) =>
      currentColor === DEFAULT_ACCOUNT_COLORS[selectedType]
        ? DEFAULT_ACCOUNT_COLORS[nextType]
        : currentColor
    );
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
    setCardProduct(null);
    setCardNotListed(false);
    setCardNetwork('');
    setTypeError(null);
  };

  const resetNewAccountForm = () => {
    const nextType: AccountType = 'bank';
    setCreatedAccount(null);
    setSelectedType(nextType);
    setCreditKind('');
    setSelectedColor(DEFAULT_ACCOUNT_COLORS[nextType]);
    setNameTouched(false);
    setShowMoreDetails(false);
    setIssuerQuery('');
    setSelectedIssuer(null);
    setShowIssuerResults(false);
    setLast4('');
    setBalance('');
    setBalanceTouched(false);
    setOpeningBalance(0);
    setCreditLimit('');
    setDueDay('');
    setReminderEnabled(true);
    setReminderDaysBefore('3');
    setFeeMonth('');
    setAnnualFee('');
    setFeeWaiverSpend('');
    setCardProduct(null);
    setCardNotListed(false);
    setCardNetwork('');
    setIsDefault(false);
    setSaveError(null);
    setTypeError(null);
    setStep(1);
  };

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim()) {
      haptics.rejected();
      setSaveError('Give this account a name.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const isCard = selectedType === 'credit_card';
      const typedBalance = balance.trim() ? parseFloat(balance) : NaN;
      const balanceFields: Pick<AccountPayload, 'balance' | 'current_balance' | 'balance_tracked'> =
        isCard
          ? { balance: parseFloat(balance) || 0 }
          : !balanceTouched
            ? { balance: openingBalance }
            : Number.isNaN(typedBalance)
              ? // Cleared: stop showing a balance.
                { balance: 0, balance_tracked: false }
              : { balance: openingBalance, current_balance: typedBalance };
      const payload: AccountPayload = {
        type: normalizeAccountType(selectedType),
        name: name.trim(),
        color: selectedColor,
        provider: selectedIssuer?.name || issuerQuery.trim(),
        identifier: last4,
        provider_id: selectedIssuer?.id || '',
        last4:
          (selectedType === 'bank' || selectedType === 'credit_card' || selectedType === 'debit_card') &&
          creditKind !== 'pay_later'
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
        ...balanceFields,
        ...(isCard ? { credit_kind: creditKind } : {}),
        ...(pickingProduct ? { card_product_id: cardProduct?.id ?? '', card_network: cardNetwork } : {}),
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
        setTypeError('Pick an account type, then try again.');
      }
      setSaveError(
        getFriendlyErrorMessage(err, "Couldn't save this account. Check your connection and try again.")
      );
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
      setSaveError(getFriendlyErrorMessage(err, "Couldn't make this your default. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const isCardType =
    (selectedType === 'credit_card' && creditKind !== 'pay_later') || selectedType === 'debit_card';
  const identifierIsDigits =
    selectedType === 'bank' || selectedType === 'credit_card' || selectedType === 'debit_card';
  const detailCopy =
    creditKind === 'pay_later' ? PAY_LATER_DETAIL_COPY : ACCOUNT_DETAIL_COPY[selectedType];
  const changeBalance: Dispatch<SetStateAction<string>> = (value) => {
    setBalanceTouched(true);
    setBalance(value);
  };

  const filteredIssuers = useMemo(() => {
    const query = issuerQuery.trim().toLowerCase();
    // Once one is chosen, reopening the list offers all of them again, not
    // just the one whose name is now in the field.
    const searching = query !== '' && selectedIssuer?.name.toLowerCase() !== query;
    return providerOptions
      .filter(
        (i) =>
          (!searching || i.name.toLowerCase().includes(query)) &&
          // A card's issuers and a pay-later line's lenders are separate lists.
          (selectedType !== 'credit_card' || (i.creditKind ?? '') === creditKind)
      )
      .slice(0, 6);
  }, [creditKind, issuerQuery, providerOptions, selectedIssuer, selectedType]);

  const selectProvider = (provider: ProviderOption) => {
    setSelectedIssuer(provider);
    setIssuerQuery(provider.name);
    setShowIssuerResults(false);
  };

  const updateIdentifier = (value: string) => {
    if (identifierIsDigits) {
      setLast4(value.replace(/[^0-9]/g, '').slice(0, 4));
      return;
    }
    setLast4(value.slice(0, 40));
  };

  const stepTwo = (embedded: boolean) => (
          <AccountFormStepTwo
            embedded={embedded}
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
            name={name}
            providerOptions={providerOptions}
            reminderDaysBefore={reminderDaysBefore}
            reminderEnabled={reminderEnabled}
            saveError={saveError}
            selectProvider={selectProvider}
            selectedType={selectedType}
            setAnnualFee={setAnnualFee}
            setBalance={changeBalance}
            setCreditLimit={setCreditLimit}
            setDueDay={setDueDay}
            setFeeMonth={setFeeMonth}
            setFeeWaiverSpend={setFeeWaiverSpend}
            setIssuerQuery={setIssuerQuery}
            setReminderDaysBefore={setReminderDaysBefore}
            setReminderEnabled={setReminderEnabled}
            setSelectedIssuer={setSelectedIssuer}
            setShowAnnualFee={setShowAnnualFee}
            setShowDayModal={setShowDayModal}
            setShowIssuerResults={setShowIssuerResults}
            setShowMonthModal={setShowMonthModal}
            setShowReminderOptions={setShowReminderOptions}
            setStep={setStep}
            showAnnualFee={showAnnualFee}
            showDayModal={showDayModal}
            showIssuerResults={showIssuerResults}
            showMonthModal={showMonthModal}
            showReminderOptions={showReminderOptions}
            updateIdentifier={updateIdentifier}
            payLater={creditKind === 'pay_later'}
          />
  );

  const pickCardProduct = (product: CardProductSummary & { annual_fee?: number | null; fee_waiver_spend?: number | null }) => {
    setCardProduct(product);
    setCardNotListed(false);
    // The catalogue fills what the user has not typed; the server does the same.
    if (!annualFee.trim() && product.annual_fee) setAnnualFee(String(product.annual_fee));
    if (!feeWaiverSpend.trim() && product.fee_waiver_spend) setFeeWaiverSpend(String(product.fee_waiver_spend));
  };

  const productStep =
    pickingProduct && selectedIssuer ? (
      <>
        <CardProductPicker
          token={token}
          issuerId={selectedIssuer.id}
          bankName={selectedIssuer.name}
          selectedId={cardProduct?.id ?? ''}
          notListed={cardNotListed}
          onSelect={pickCardProduct}
          onNotListed={() => {
            setCardProduct(null);
            setCardNotListed(true);
          }}
        />
        {cardProduct ? (
          // The card as it will be drawn, updating as the digits go in.
          <View style={sheetStyles.preview} testID="card-product-preview">
            <SketchCard
              art={productArt(cardProduct)}
              bank={cardBankName(selectedIssuer.id, selectedIssuer.name)}
              product={cardProduct.name}
              last4={/^\d{4}$/.test(last4) ? last4 : undefined}
              network={cardNetworkLabel(cardNetwork)}
              holder={userDisplayName(user?.username, '')}
              width={productArt(cardProduct).portrait ? 150 : 260}
            />
          </View>
        ) : null}
      </>
    ) : null;

  /** P62: a detail filled in on the Account added screen. */
  const saveCreatedDetail = async (item: AccountSetupItem, value: string) => {
    if (!token || !createdAccount) return;
    const updated =
      item.key === 'balance'
        ? await setAccountBalance(token, createdAccount.id, Number(value.replace(/[^0-9.-]/g, '')))
        : await updateAccount(
            token,
            createdAccount.id,
            toAccountPayload(withSetupDetail(createdAccount, item.key, value))
          );
    setCreatedAccount(updated);
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
        ) : step !== 3 ? (
          <>
            {/* One sheet, one question at a time (P21, board R16-Account-A):
                what it is, which one, its name, and the rest folded away. */}
            <View style={sheetStyles.header}>
              <ThemedText accessibilityRole="header" style={[sheetStyles.title, { color: theme.text }]}>
                {isEditing ? 'Edit account' : 'Add an account'}
              </ThemedText>
              <SheetCloseButton onPress={() => router.back()} />
            </View>
            <KeyboardAvoidingScreen
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}>
              <AccountTypeChips
                selectedType={selectedType}
                creditKind={creditKind}
                typeError={typeError}
                onSelect={updateSelectedType}
              />
              <AccountIdentityFields
                detailCopy={detailCopy}
                noun={isCardType ? 'card' : 'account'}
                filteredIssuers={filteredIssuers}
                issuerIcon={selectedIssuer?.icon}
                issuerQuery={issuerQuery}
                last4={last4}
                name={name}
                nameIsSuggested={!nameTouched}
                onChangeName={(value) => {
                  setNameTouched(true);
                  setName(value);
                }}
                selectProvider={selectProvider}
                setIssuerQuery={setIssuerQuery}
                setSelectedIssuer={setSelectedIssuer}
                setShowIssuerResults={setShowIssuerResults}
                showIssuerResults={showIssuerResults}
                isDigitsIdentifier={identifierIsDigits}
                updateIdentifier={updateIdentifier}
                afterProvider={productStep}
                afterIdentifier={
                  pickingProduct ? <CardNetworkChips value={cardNetwork} onChange={setCardNetwork} /> : null
                }
              />
              {/* How much cash is on you is the one fact a cash account has. */}
              {selectedType === 'cash' ? stepTwo(true) : null}
              <View style={sheetStyles.more}>
                <FormDisclosure
                  testID="account-more-details"
                  label="More details"
                  summary={moreDetailsSummary(selectedType, creditKind)}
                  expanded={showMoreDetails}
                  onToggle={() => setShowMoreDetails((open) => !open)}>
                  {selectedType === 'cash' ? null : stepTwo(true)}
                  <ThemedText style={styles.sectionHeaderLabel}>Colour & default</ThemedText>
                  <AccountStyleFold
                    flat
                    isDefault={isDefault}
                    selectedColor={selectedColor}
                    setIsDefault={setIsDefault}
                    setSelectedColor={setSelectedColor}
                    open={showStyleOptions}
                    setOpen={setShowStyleOptions}
                  />
                </FormDisclosure>
              </View>
            </KeyboardAvoidingScreen>
            <View
              style={[
                styles.footer,
                { backgroundColor: theme.background, borderTopColor: theme.border, marginBottom: keyboardInset },
              ]}>
              {saveError ? (
                <View style={styles.errorContainer}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.negative} />
                  <ThemedText style={styles.errorText}>{saveError}</ThemedText>
                </View>
              ) : null}
              <PrimaryButton
                testID="account-save"
                label={isSaving ? 'Saving…' : isEditing ? 'Save changes' : isCardType ? 'Save card' : 'Save account'}
                loading={isSaving}
                onPress={handleSave}
              />
            </View>
          </>
        ) : (
          <AccountFormSuccess
            onSaveDetail={saveCreatedDetail}
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

const sheetStyles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
  },
  more: {
    marginTop: 20,
    marginBottom: 8,
  },
  preview: {
    marginTop: 14,
    alignSelf: 'center',
    borderRadius: 14,
    // A pale card on a light page needs an edge to sit on.
    shadowColor: '#281E3C',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
});
