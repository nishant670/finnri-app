import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { defaultCategoryForType } from '@/lib/categories';
import { paymentModeVisual } from '@/lib/payment-modes';
import type { DraftFieldKey } from '@/lib/ai-draft-review';
import { DraftFieldCard } from './DraftFieldCard';
import type { EntryForm } from './TransactionFormModal';

export const tagOptions = ['Investment', 'Lending', 'EMI', 'Refundable', 'Subscription', 'General'];

type TransactionDraftFieldProps = {
  field: DraftFieldKey;
  form: EntryForm;
  setForm: Dispatch<SetStateAction<EntryForm>>;
  /** The parser was unsure of this field. */
  flagged: boolean;
  /** The user has since looked at or edited it. */
  checked: boolean;
  paymentLanguage: {
    modeLabel: string;
    modeAccessibilityPrefix: string;
    accountLabel: string;
    accountAccessibilityPrefix: string;
  };
  /** The category as shown, which may differ from the raw form value. */
  category: string;
  categoryVisual: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string };
  dateLabel: string;
  compatibleAccountCount: number;
  onChecked: (field: DraftFieldKey) => void;
  onSwitchType: (toIncome: boolean) => void;
  onOpenCategoryPicker: () => void;
  onOpenModePicker: () => void;
  onOpenAccountPicker: () => void;
  onOpenDatePicker: () => void;
};

/**
 * One field of the AI draft, as a card that says how sure the parser was.
 *
 * A picker counts as checked the moment it is opened — the chip asks the
 * user to look, and they looked, whether or not they changed anything. A
 * text field counts when it is actually edited, because opening a keyboard
 * over it proves nothing.
 */
export function TransactionDraftField({
  field,
  form,
  setForm,
  flagged,
  checked,
  paymentLanguage,
  category,
  categoryVisual,
  dateLabel,
  compatibleAccountCount,
  onChecked,
  onSwitchType,
  onOpenCategoryPicker,
  onOpenModePicker,
  onOpenAccountPicker,
  onOpenDatePicker,
}: TransactionDraftFieldProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  switch (field) {
    case 'type':
      return (
        <DraftFieldCard
          key={field}
          label="Type"
          icon="swap-vertical"
          flagged={flagged}
          checked={checked}>
          <View className="mt-1.5 flex-row gap-2">
            {(['Expense', 'Income'] as const).map((option) => {
              const isSelected = form.type === option;
              return (
                <Pressable
                  key={option}
                  testID={`draft-type-${option.toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    setForm((previous) => ({
                      ...previous,
                      type: option,
                      category: defaultCategoryForType(option),
                    }));
                    onSwitchType(option === 'Income');
                    onChecked('type');
                  }}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    backgroundColor: isSelected ? accentSurface : theme.card,
                    borderColor: isSelected ? accent : theme.border,
                  }}>
                  <ThemedText
                    className="text-[11px] font-black"
                    style={{ color: isSelected ? accent : theme.text }}>
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </DraftFieldCard>
      );
    case 'title':
      return (
        <DraftFieldCard
          key={field}
          label="Transaction Title"
          icon="label-variant-outline"
          flagged={flagged}
          checked={checked}>
          <TextInput
            testID="entry-title-input"
            value={form.title}
            onChangeText={(text) => {
              setForm((previous) => ({ ...previous, title: text }));
              onChecked('title');
            }}
            className="p-0 text-sm font-black"
            placeholder="Short title"
            placeholderTextColor="#9CA3AF"
            selectionColor={accent}
            style={{ color: theme.text, minHeight: 22 }}
          />
        </DraftFieldCard>
      );
    case 'category':
      return (
        <DraftFieldCard
          key={field}
          testID="entry-category-picker"
          label="Category"
          value={category}
          icon={categoryVisual.icon}
          iconColor={categoryVisual.color}
          flagged={flagged}
          checked={checked}
          accessibilityLabel={`Category ${category}`}
          onPress={() => {
            onChecked('category');
            onOpenCategoryPicker();
          }}
        />
      );
    case 'mode':
      return (
        <DraftFieldCard
          key={field}
          testID="entry-mode-picker"
          label={paymentLanguage.modeLabel}
          value={form.mode}
          placeholder="Choose a payment mode"
          icon={paymentModeVisual(form.mode).icon}
          iconColor={paymentModeVisual(form.mode).color}
          flagged={flagged}
          checked={checked}
          accessibilityLabel={`${paymentLanguage.modeAccessibilityPrefix} ${form.mode || 'not set'}`}
          onPress={() => {
            onChecked('mode');
            onOpenModePicker();
          }}
        />
      );
    case 'account':
      return (
        <DraftFieldCard
          key={field}
          testID="entry-account-picker"
          label={paymentLanguage.accountLabel}
          value={form.account}
          placeholder={
            compatibleAccountCount === 0
              ? `Add a ${form.mode || 'matching'} account`
              : 'Select an account'
          }
          icon="wallet-outline"
          iconColor="#3B82F6"
          flagged={flagged}
          checked={checked}
          accessibilityLabel={`${paymentLanguage.accountAccessibilityPrefix} ${form.account || 'no account yet'}`}
          onPress={() => {
            onChecked('account');
            onOpenAccountPicker();
          }}
        />
      );
    case 'date':
      return (
        <DraftFieldCard
          key={field}
          testID="entry-date-picker"
          label="Date & time"
          value={form.date ? `${dateLabel}, ${form.time}` : ''}
          placeholder="Pick a date"
          icon="calendar-multiselect"
          iconColor="#8B5CF6"
          flagged={flagged}
          checked={checked}
          onPress={() => {
            onChecked('date');
            onOpenDatePicker();
          }}
        />
      );
    case 'merchant':
      return (
        <DraftFieldCard
          key={field}
          label="Merchant"
          icon="storefront-outline"
          flagged={flagged}
          checked={checked}>
          <TextInput
            testID="entry-merchant-input"
            value={form.merchant}
            onChangeText={(text) => {
              setForm((previous) => ({ ...previous, merchant: text }));
              onChecked('merchant');
            }}
            className="p-0 text-sm font-black"
            placeholder="Merchant or store name"
            placeholderTextColor={detailInputPlaceholderColor}
            selectionColor={accent}
            style={{ color: theme.text, minHeight: 22 }}
          />
        </DraftFieldCard>
      );
    case 'tag':
      return (
        <DraftFieldCard
          key={field}
          label="Tag"
          icon="tag-outline"
          flagged={flagged}
          checked={checked}>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const isSelected = form.tag === tag;
              return (
                <Pressable
                  key={tag}
                  onPress={() => {
                    setForm((previous) => ({ ...previous, tag }));
                    onChecked('tag');
                  }}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    backgroundColor: isSelected ? accentSurface : theme.card,
                    borderColor: isSelected ? accent : theme.border,
                  }}>
                  <ThemedText
                    className="text-[11px] font-black"
                    style={{ color: isSelected ? accent : '#6B7280' }}>
                    {tag}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </DraftFieldCard>
      );
    case 'notes':
      return (
        <DraftFieldCard
          key={field}
          label="Notes"
          icon="note-text-outline"
          flagged={flagged}
          checked={checked}>
          <TextInput
            testID="entry-notes-input"
            multiline
            value={form.notes}
            onChangeText={(text) => {
              setForm((previous) => ({ ...previous, notes: text }));
              onChecked('notes');
            }}
            className="p-0 text-sm font-bold"
            placeholder="Add a note..."
            placeholderTextColor={detailInputPlaceholderColor}
            selectionColor={accent}
            style={{ color: theme.text, minHeight: 22 }}
          />
        </DraftFieldCard>
      );
    default:
      // `amount` is the headline above this list and never a row in it.
      return null;
  }
}
