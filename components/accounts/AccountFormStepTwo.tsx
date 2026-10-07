import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { type AccountType } from '@/lib/accounts';
import { DAYS, MONTHS, ACCOUNT_DETAIL_COPY, type ProviderOption } from '@/lib/account-form';
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
  setShowDayModal: Dispatch<SetStateAction<boolean>>;
  setShowIssuerResults: Dispatch<SetStateAction<boolean>>;
  setShowMonthModal: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<number>>;
  showDayModal: boolean;
  showIssuerResults: boolean;
  showMonthModal: boolean;
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
  setShowDayModal,
  setShowIssuerResults,
  setShowMonthModal,
  setStep,
  showDayModal,
  showIssuerResults,
  showMonthModal,
  updateIdentifier,
}: AccountFormStepTwoProps) {
  const theme = useThemeTokens().colors;
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
              <ThemedText style={[styles.bubbleText, { color: theme.text }]}>
                {detailCopy.message}
              </ThemedText>
              <View style={[styles.bubbleTriangle, { backgroundColor: theme.secondary }]} />
            </View>
            <View style={styles.mascotRowCenter}>
              <View
                style={[
                  styles.mascotAvatar,
                  { backgroundColor: '#FFEEED', width: 56, height: 56, borderRadius: 28 },
                ]}>
                <MaterialCommunityIcons name="face-woman-outline" size={32} color={theme.accent} />
              </View>
            </View>
          </View>

          <ThemedText style={styles.sectionHeaderLabel}>VISUALS</ThemedText>

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
                <ThemedText
                  style={[
                    styles.dropdownTextSmall,
                    { color: theme.text },
                    !dueDay && { color: '#AAB7C6' },
                  ]}>
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
                <ThemedText
                  style={[
                    styles.dropdownTextSmall,
                    { color: theme.text },
                    !feeMonth && { color: '#AAB7C6' },
                  ]}>
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
              <ThemedText style={[styles.dropdownTextSmall, { color: theme.text }]}>
                Due reminder
              </ThemedText>
              <ThemedText
                style={[
                  styles.labelSmall,
                  { color: theme.text },
                  { marginTop: 2, marginBottom: 0 },
                ]}>
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
              <ThemedText style={[styles.labelSmall, { color: theme.text }]}>
                Remind me this many days before
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

        {
          <AccountSelectionSheet
            visible={showDayModal}
            onClose={() => setShowDayModal(false)}
            data={DAYS}
            onSelect={setDueDay}
            title="Select Due Day"
          />
        }
        {
          <AccountSelectionSheet
            visible={showMonthModal}
            onClose={() => setShowMonthModal(false)}
            data={MONTHS}
            onSelect={setFeeMonth}
            title="Select Fee Month"
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
        rightText={isSaving ? 'Saving' : 'Save basic'}
        onRightPress={handleSave}
      />
      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.mascotSection}>
          <View style={[styles.bubbleContainer, { backgroundColor: theme.secondary }]}>
            <ThemedText style={[styles.bubbleText, { color: theme.text }]}>
              {detailCopy.message}
            </ThemedText>
            <View style={[styles.bubbleTriangle, { backgroundColor: theme.secondary }]} />
          </View>
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
}
