import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { type AccountType } from '@/lib/accounts';
import { typeOptions, COLORS, COLOR_NAMES } from '@/lib/account-form';
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
  setShowStyleOptions: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<number>>;
  showStyleOptions: boolean;
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
  setShowStyleOptions,
  setStep,
  showStyleOptions,
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
          <ThemedText style={[styles.stepEyebrow, { color: theme.accent }]}>Account basics</ThemedText>
          <ThemedText style={[styles.stepTitle, { color: theme.text }]}>
            {isEditing ? 'Update this account' : 'Add a payment source'}
          </ThemedText>
          <ThemedText style={[styles.stepDescription, { color: theme.mutedStrong }]}>
            Pick a type and give it a name. Everything else is optional.
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

        {/* Colour and default are preferences rather than facts about the
            account, and both arrive with an answer already chosen — so they
            wait behind one row that says what that answer is. */}
        <FormDisclosure
          testID="account-style-options"
          label="Colour & default"
          icon="palette-outline"
          summary={`${COLOR_NAMES[selectedColor] ?? 'Custom colour'} · ${
            isDefault ? 'Your default for these payments' : 'Not your default'
          }`}
          expanded={showStyleOptions}
          onToggle={() => setShowStyleOptions((open) => !open)}>
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="switch"
            accessibilityState={{ checked: isDefault }}
            onPress={() => setIsDefault((current) => !current)}
            style={[styles.defaultCard, styles.defaultCardInFold, { backgroundColor: theme.card }]}>
            <View style={[styles.defaultIcon, { backgroundColor: theme.secondary }]}>
              <MaterialCommunityIcons name="star-outline" size={22} color={theme.accent} />
            </View>
            <View style={styles.defaultCopy}>
              <ThemedText style={[styles.defaultTitle, { color: theme.text }]}>
                Use as default account
              </ThemedText>
              <ThemedText style={[styles.defaultDescription, { color: theme.muted }]}>
                Finnri picks it first for matching payments.
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

          <ThemedText style={[styles.labelSmall, { color: theme.text }]}>Colour</ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorScroll}>
            {COLORS.map((color) => {
              const isSelected = selectedColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  accessibilityRole="radio"
                  accessibilityLabel={`${COLOR_NAMES[color] ?? color} colour`}
                  accessibilityState={{ selected: isSelected }}
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
        </FormDisclosure>
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
              <MaterialCommunityIcons name="arrow-right" size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
