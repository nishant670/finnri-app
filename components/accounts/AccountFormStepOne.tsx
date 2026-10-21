import type { Dispatch, SetStateAction } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
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
  const colorName = COLOR_NAMES[selectedColor] ?? 'Custom colour';
  return (
    <>
      <ScreenHeader
        subtitle="Step 1 of 2"
        onBack={() => router.back()}
        rightIcon="help-circle-outline"
      />

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.stepIntro}>
          <ThemedText style={[styles.stepTitle, { color: theme.text }]}>
            {isEditing ? 'Update this account' : 'Add a payment source'}
          </ThemedText>
          <ThemedText style={[styles.stepDescription, { color: theme.muted }]}>
            Pick a type and give it a name. Everything else is optional.
          </ThemedText>
        </View>

        {/* Board R5-Account1: the types as a two-column grid of tiles. */}
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          What kind of account is this?
        </ThemedText>
        <View style={styles.gridContainer}>
          {typeOptions.map((option) => {
            const isSelected = selectedType === option.key;
            return (
              <PressableView
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => updateSelectedType(option.key)}
                style={[
                  styles.gridItem,
                  {
                    backgroundColor: isSelected ? theme.selectedFill : theme.card,
                    borderColor: isSelected ? theme.selectedBorder : theme.border,
                  },
                ]}
                pressedStyle={{ opacity: 0.7 }}>
                <MaterialCommunityIcons name={option.icon} size={20} color={theme.text} />
                <ThemedText
                  numberOfLines={1}
                  style={[styles.gridLabel, { color: theme.text, fontWeight: isSelected ? '700' : '500' }]}>
                  {option.label}
                </ThemedText>
                {isSelected ? <MaterialCommunityIcons name="check" size={18} color={theme.text} /> : null}
              </PressableView>
            );
          })}
        </View>
        {typeError ? <ThemedText style={styles.errorText}>{typeError}</ThemedText> : null}

        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          What should we call it?
        </ThemedText>
        <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            accessibilityLabel="Account name"
            value={name}
            onChangeText={setName}
            placeholder="My Spending Account"
            placeholderTextColor={theme.muted}
            style={[styles.textInput, { color: theme.text }]}
          />
        </View>

        {/* Colour and default are preferences rather than facts about the
            account, and both arrive with an answer already chosen — so each
            is a row that says what that answer is. */}
        <View style={[styles.rowsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <PressableView
            testID="account-style-options"
            accessibilityRole="button"
            accessibilityState={{ expanded: showStyleOptions }}
            accessibilityLabel={`Colour, ${colorName}`}
            onPress={() => setShowStyleOptions((open) => !open)}
            style={styles.prefRow}
            pressedStyle={{ opacity: 0.7 }}>
            <ThemedText tone="muted" style={styles.prefLabel}>
              Colour
            </ThemedText>
            <View style={[styles.colorDot, { backgroundColor: selectedColor }]} />
            <ThemedText style={[styles.prefValue, { color: theme.text }]}>{colorName}</ThemedText>
            <MaterialCommunityIcons
              name={showStyleOptions ? 'chevron-up' : 'chevron-right'}
              size={16}
              color={withAlpha(theme.text, 0.6)}
            />
          </PressableView>
          {showStyleOptions ? (
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
                    style={[styles.colorItem, { backgroundColor: color }, isSelected && styles.colorItemSelected]}>
                    {isSelected && <View style={[styles.colorRing, { borderColor: theme.text }]} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
          <PressableView
            accessibilityRole="switch"
            accessibilityState={{ checked: isDefault }}
            accessibilityLabel="Use as default account"
            accessibilityHint="Finnri picks it first for matching payments."
            onPress={() => setIsDefault((current) => !current)}
            style={[styles.prefRow, { borderTopWidth: 1, borderTopColor: theme.border }]}
            pressedStyle={{ opacity: 0.7 }}>
            <ThemedText tone="muted" style={styles.prefLabel}>
              Default
            </ThemedText>
            <ThemedText style={[styles.prefValue, { color: theme.text }]}>
              {isDefault ? 'Your default for these payments' : 'Not your default'}
            </ThemedText>
            <MaterialCommunityIcons
              name={isDefault ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={20}
              color={theme.text}
            />
          </PressableView>
        </View>
      </KeyboardAvoidingScreen>

      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        {saveError ? (
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D32F2F" />
            <ThemedText style={styles.errorText}>{saveError}</ThemedText>
          </View>
        ) : null}
        <View style={styles.footerActions}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
            <ThemedText style={[styles.cancelText, { color: theme.text }]}>Cancel</ThemedText>
          </TouchableOpacity>
          <PrimaryButton
            label="Continue"
            icon="arrow-right"
            loading={isSaving}
            onPress={() => setStep(2)}
            style={styles.saveButton}
          />
        </View>
      </View>
    </>
  );
}
