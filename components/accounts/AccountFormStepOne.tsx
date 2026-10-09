import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { type AccountType } from '@/lib/accounts';
import { typeOptions, COLORS } from '@/lib/account-form';
import { styles } from './account-form-styles';

type AccountFormStepOneProps = {
  isDefault: boolean;
  isEditing: boolean;
  isSaving: boolean;
  name: string;
  saveError: string | null;
  selectedColor: string;
  selectedType: AccountType;
  setIsDefault: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setSelectedColor: Dispatch<SetStateAction<string>>;
  setStep: Dispatch<SetStateAction<number>>;
  typeError: string | null;
  updateSelectedType: (nextType: AccountType) => void;
};

export function AccountFormStepOne({
  isDefault,
  isEditing,
  isSaving,
  name,
  saveError,
  selectedColor,
  selectedType,
  setIsDefault,
  setName,
  setSelectedColor,
  setStep,
  typeError,
  updateSelectedType,
}: AccountFormStepOneProps) {
  const theme = useThemeTokens().colors;
  return (
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
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          What kind of account is this?
        </ThemedText>
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
                    style={[styles.gridLabel, { color: isSelected ? theme.text : theme.muted }]}>
                    {option.label}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {typeError ? <ThemedText style={styles.errorText}>{typeError}</ThemedText> : null}

        {/* Name Input */}
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          What should we call it?
        </ThemedText>
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
            <ThemedText style={[styles.defaultTitle, { color: theme.text }]}>
              Use as default account
            </ThemedText>
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
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          Choose account color
        </ThemedText>
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
}
