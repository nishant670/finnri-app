import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { Account, normalizeAccountType, type AccountType } from '@/lib/accounts';
import { typeOptions, getMissingSetupCount } from '@/lib/account-form';
import { styles } from './account-form-styles';

type AccountFormSuccessProps = {
  createdAccount: Account | null;
  handleSetCreatedDefault: () => Promise<void>;
  isSaving: boolean;
  name: string;
  resetNewAccountForm: () => void;
  saveError: string | null;
  selectedType: AccountType;
};

export function AccountFormSuccess({
  createdAccount,
  handleSetCreatedDefault,
  isSaving,
  name,
  resetNewAccountForm,
  saveError,
  selectedType,
}: AccountFormSuccessProps) {
  const theme = useThemeTokens().colors;
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
              style={[
                styles.fullWidthButton,
                styles.secondaryFullWidthButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
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
              style={[
                styles.fullWidthButton,
                styles.secondaryFullWidthButton,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
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
            style={[
              styles.fullWidthButton,
              styles.secondaryFullWidthButton,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
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
}
