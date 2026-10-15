import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { type AccountType } from '@/lib/accounts';
import {
  DAYS,
  MONTHS,
  ACCOUNT_DETAIL_COPY,
  DEFAULT_ACCOUNT_NAMES,
  type ProviderOption,
} from '@/lib/account-form';
import { formatMoney } from '@/lib/money';
import { AccountSelectionSheet } from './AccountSelectionSheet';
import { styles } from './account-form-styles';

type AccountFormStepTwoProps = {
  annualFee: string;
  balance: string;
  creditLimit: string;
  detailCopy: (typeof ACCOUNT_DETAIL_COPY)[AccountType];
  dueDay: string;
  feeMonth: string;
  feeWaiverSpend: string;
  filteredIssuers: ProviderOption[];
  handleSave: () => Promise<void>;
  isEditing: boolean;
  isSaving: boolean;
  issuerQuery: string;
  last4: string;
  name: string;
  providerOptions: ProviderOption[];
  reminderDaysBefore: string;
  reminderEnabled: boolean;
  saveError: string | null;
  selectProvider: (provider: ProviderOption) => void;
  selectedType: AccountType;
  setAnnualFee: Dispatch<SetStateAction<string>>;
  setBalance: Dispatch<SetStateAction<string>>;
  setCreditLimit: Dispatch<SetStateAction<string>>;
  setDueDay: Dispatch<SetStateAction<string>>;
  setFeeMonth: Dispatch<SetStateAction<string>>;
  setFeeWaiverSpend: Dispatch<SetStateAction<string>>;
  setIssuerQuery: Dispatch<SetStateAction<string>>;
  setReminderDaysBefore: Dispatch<SetStateAction<string>>;
  setReminderEnabled: Dispatch<SetStateAction<boolean>>;
  setSelectedIssuer: Dispatch<SetStateAction<ProviderOption | null>>;
  setShowAnnualFee: Dispatch<SetStateAction<boolean>>;
  setShowDayModal: Dispatch<SetStateAction<boolean>>;
  setShowIssuerResults: Dispatch<SetStateAction<boolean>>;
  setShowMonthModal: Dispatch<SetStateAction<boolean>>;
  setShowReminderOptions: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<number>>;
  showAnnualFee: boolean;
  showDayModal: boolean;
  showIssuerResults: boolean;
  showMonthModal: boolean;
  showReminderOptions: boolean;
  updateIdentifier: (value: string) => void;
};

export function AccountFormStepTwo({
  annualFee,
  balance,
  creditLimit,
  detailCopy,
  dueDay,
  feeMonth,
  feeWaiverSpend,
  filteredIssuers,
  handleSave,
  isEditing,
  isSaving,
  issuerQuery,
  last4,
  name,
  providerOptions,
  reminderDaysBefore,
  reminderEnabled,
  saveError,
  selectProvider,
  selectedType,
  setAnnualFee,
  setBalance,
  setCreditLimit,
  setDueDay,
  setFeeMonth,
  setFeeWaiverSpend,
  setIssuerQuery,
  setReminderDaysBefore,
  setReminderEnabled,
  setSelectedIssuer,
  setShowAnnualFee,
  setShowDayModal,
  setShowIssuerResults,
  setShowMonthModal,
  setShowReminderOptions,
  setStep,
  showAnnualFee,
  showDayModal,
  showIssuerResults,
  showMonthModal,
  showReminderOptions,
  updateIdentifier,
}: AccountFormStepTwoProps) {
  const theme = useThemeTokens().colors;
  if (selectedType === 'credit_card') {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader
          subtitle="STEP 2 OF 2"
          onBack={() => setStep(1)}
          rightText={isSaving ? 'Saving' : 'Save now'}
          onRightPress={handleSave}
        />
        <KeyboardAvoidingScreen
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {/* A heading, not a mascot. The speech bubble said one line in
              18pt black over a cartoon face, and it was the loudest thing on
              a screen whose fields are all optional. */}
          <View style={styles.stepIntro}>
            <ThemedText style={[styles.stepEyebrow, { color: theme.accent }]}>Card details</ThemedText>
            <ThemedText style={[styles.stepTitle, { color: theme.text }]} numberOfLines={2}>
              {name.trim() || DEFAULT_ACCOUNT_NAMES[selectedType]}
            </ThemedText>
            <ThemedText style={[styles.stepDescription, { color: theme.mutedStrong }]}>
              {detailCopy.message} All optional — add the rest any time.
            </ThemedText>
          </View>

          <ThemedText style={styles.sectionHeaderLabel}>Card</ThemedText>

          <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
            {detailCopy.providerLabel}
          </ThemedText>
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
                    <ThemedText style={[styles.resultItemText, { color: theme.text }]}>
                      {item.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
            {detailCopy.identifierLabel}
          </ThemedText>
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

          <ThemedText style={styles.sectionHeaderLabel}>Limit & due date</ThemedText>

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

          <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Due day</ThemedText>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={dueDay ? `Due day ${dueDay}` : 'Choose the due day'}
            style={[styles.dropdownContainerSmall, { backgroundColor: theme.card, marginBottom: 24 }]}
            onPress={() => setShowDayModal(true)}>
            <MaterialCommunityIcons
              name="calendar-outline"
              size={20}
              color={theme.accent}
              style={styles.inputIcon}
            />
            <ThemedText
              style={[styles.dropdownTextSmall, { color: dueDay ? theme.text : theme.muted }]}>
              {dueDay ? `${dueDay} of every month` : 'Day of the month'}
            </ThemedText>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.muted} />
          </TouchableOpacity>

          {/* Two settings most cards never need touched: a reminder that is
              already on at three days, and an annual fee most people do not
              know offhand. Each folds behind a row that reads it back. */}
          <View style={{ gap: 12 }}>
            <FormDisclosure
              testID="card-reminder-options"
              label="Due-date reminder"
              icon={reminderEnabled ? 'bell-ring-outline' : 'bell-off-outline'}
              summary={
                reminderEnabled
                  ? `On · ${Number(reminderDaysBefore || 0)} day${Number(reminderDaysBefore) === 1 ? '' : 's'} before the due date`
                  : 'Off'
              }
              expanded={showReminderOptions}
              onToggle={() => setShowReminderOptions((open) => !open)}>
              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityState={{ checked: reminderEnabled }}
                onPress={() => setReminderEnabled((current) => !current)}
                style={[styles.inputContainerSmall, { backgroundColor: theme.card }]}>
                <MaterialCommunityIcons
                  name={reminderEnabled ? 'bell-ring-outline' : 'bell-off-outline'}
                  size={24}
                  color={reminderEnabled ? theme.accent : theme.muted}
                  style={styles.inputIcon}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.dropdownTextSmall, { color: theme.text }]}>
                    Remind me before it’s due
                  </ThemedText>
                  <ThemedText style={[styles.fieldHintInline, { color: theme.muted }]}>
                    {reminderEnabled ? 'On for this card' : 'Off for this card'}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons
                  name={reminderEnabled ? 'toggle-switch' : 'toggle-switch-off-outline'}
                  size={34}
                  color={reminderEnabled ? theme.accent : theme.muted}
                />
              </TouchableOpacity>

              {reminderEnabled && (
                <>
                  <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
                    Days before the due date
                  </ThemedText>
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
            </FormDisclosure>

            <FormDisclosure
              testID="card-annual-fee-options"
              label="Annual fee"
              icon="cash-clock"
              summary={
                annualFee
                  ? [
                      formatMoney(Number(annualFee)),
                      feeMonth ? `charged in ${feeMonth}` : '',
                      feeWaiverSpend ? `waived above ${formatMoney(Number(feeWaiverSpend))}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Optional — see how close you are to getting it waived'
              }
              expanded={showAnnualFee}
              onToggle={() => setShowAnnualFee((open) => !open)}>
              <View style={[styles.row, { marginBottom: 12 }]}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Fee</ThemedText>
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
                    Charged in
                  </ThemedText>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={feeMonth ? `Fee charged in ${feeMonth}` : 'Choose the fee month'}
                    style={[styles.dropdownContainerSmall, { backgroundColor: theme.card }]}
                    onPress={() => setShowMonthModal(true)}>
                    <MaterialCommunityIcons
                      name="calendar-refresh-outline"
                      size={20}
                      color={theme.accent}
                      style={styles.inputIcon}
                    />
                    <ThemedText
                      style={[
                        styles.dropdownTextSmall,
                        { color: feeMonth ? theme.text : theme.muted },
                      ]}>
                      {feeMonth || 'Month'}
                    </ThemedText>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={theme.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
                Waived if you spend (a year)
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
            </FormDisclosure>
          </View>
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
                {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Save account'}
              </ThemedText>
              {isSaving && <ActivityIndicator size="small" color="white" className="ml-2" />}
            </TouchableOpacity>
          </View>
        </View>

        {
          <AccountSelectionSheet
            visible={showDayModal}
            onClose={() => setShowDayModal(false)}
            data={DAYS}
            onSelect={setDueDay}
            title="Due day"
          />
        }
        {
          <AccountSelectionSheet
            visible={showMonthModal}
            onClose={() => setShowMonthModal(false)}
            data={MONTHS}
            onSelect={setFeeMonth}
            title="Fee month"
          />
        }
      </View>
    );
  }

  // Generic Step 2 for other account types
  return (
    <>
      <ScreenHeader
        subtitle="STEP 2 OF 2"
        onBack={() => setStep(1)}
        rightText={isSaving ? 'Saving' : 'Save now'}
        onRightPress={handleSave}
      />
      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* A heading, not a mascot. The speech bubble said one line in
            18pt black over a cartoon face, and it was the loudest thing on
            a screen whose fields are all optional. */}
        <View style={styles.stepIntro}>
          <ThemedText style={[styles.stepEyebrow, { color: theme.accent }]}>Details</ThemedText>
          <ThemedText style={[styles.stepTitle, { color: theme.text }]} numberOfLines={2}>
            {name.trim() || DEFAULT_ACCOUNT_NAMES[selectedType]}
          </ThemedText>
          <ThemedText style={[styles.stepDescription, { color: theme.mutedStrong }]}>
            {detailCopy.message} All optional — add the rest any time.
          </ThemedText>
        </View>

        {detailCopy.providerLabel && (
          <>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              {detailCopy.providerLabel}
            </ThemedText>
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
                      <ThemedText style={[styles.resultItemText, { color: theme.text }]}>
                        {item.name}
                      </ThemedText>
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
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          {detailCopy.balanceLabel}
        </ThemedText>
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
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              {detailCopy.identifierLabel}
            </ThemedText>
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
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Save account'}
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
}
