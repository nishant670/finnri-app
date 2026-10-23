import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import type { Account } from '@/lib/accounts';
import { CATEGORIES, categoryVisual } from '@/lib/categories';
import { haptics } from '@/lib/haptics';
import { formatApiDate, parseDateLabel } from '@/lib/transactions';
import { formatMoney } from '@/lib/money';
import { PAYMENT_MODES, paymentModeVisual } from '@/lib/payment-modes';
import { TRANSACTION_SORTS, type TransactionSort } from '@/lib/transactions';
import {
  FILTER_PRESETS,
  applyPreset,
  emptyFilterState,
  isPresetApplied,
  type TransactionFilterState,
} from '@/lib/transaction-filters';

interface AdvancedFilterProps {
  onClose: () => void;
  onApply: (filters: TransactionFilterState) => void;
  /** Rows the current filters match, for the Show Me badge. */
  count?: number;
  currentFilters: TransactionFilterState;
  accounts: Account[];
  /** Entries per canonical category, counted ignoring the category filter. */
  categoryCounts?: Record<string, number>;
}

type SectionKey = 'sort' | 'dates' | 'type' | 'amount' | 'category' | 'account' | 'mode';

const emptyCounts: Record<string, number> = {};

const formatDate = (value: string | null) => {
  if (!value) return 'Any';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Digits only — an amount box that accepts "1,0O0" is a box that returns NaN. */
const toAmountValue = (text: string): number | null => {
  const digits = text.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
};

export const AdvancedFilter = ({
  onClose,
  onApply,
  currentFilters,
  accounts,
  count = 0,
  categoryCounts = emptyCounts,
}: AdvancedFilterProps) => {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const footerBottom = useBottomInset(24);
  const accentSurface = theme.secondary;
  const mutedText = themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.5)' : '#90A4AE';

  const [draft, setDraft] = useState<TransactionFilterState>(currentFilters);
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  /**
   * Everything starts closed. The audit's complaint was six sections open at
   * once with no way to see the shape of the thing; a closed section still
   * reports its own value in the header, so nothing is hidden — only folded.
   */
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const now = useMemo(() => new Date(), []);

  const patch = useCallback(
    (updates: Partial<TransactionFilterState>) => setDraft((prev) => ({ ...prev, ...updates })),
    []
  );

  /**
   * `patch` with the tap. Separate from `patch` itself because the amount
   * fields patch on every keystroke, and a chip's confirmation fired once per
   * character is not a confirmation.
   */
  const selectPatch = useCallback(
    (updates: Partial<TransactionFilterState>) => {
      haptics.select();
      patch(updates);
    },
    [patch]
  );

  const toggleSection = useCallback(
    (key: SectionKey) => setOpenSection((prev) => (prev === key ? null : key)),
    []
  );

  const accountName = useMemo(
    () => accounts.find((account) => account.id === draft.accountId)?.name,
    [accounts, draft.accountId]
  );

  const amountSummary =
    draft.minAmount === null && draft.maxAmount === null
      ? 'Any'
      : draft.minAmount !== null && draft.maxAmount !== null
        ? `${formatMoney(draft.minAmount)} – ${formatMoney(draft.maxAmount)}`
        : draft.minAmount !== null
          ? `Over ${formatMoney(draft.minAmount)}`
          : `Under ${formatMoney(draft.maxAmount as number)}`;

  const dateSummary =
    !draft.startDate && !draft.endDate
      ? 'Any'
      : `${formatDate(draft.startDate)} → ${formatDate(draft.endDate)}`;

  const sortLabel =
    TRANSACTION_SORTS.find((option) => option.value === draft.sort)?.label ?? 'Newest';

  const onDateChange = (selected?: Date) => {
    const target = showPicker;
    setShowPicker(null);
    if (!selected || !target) return;
    patch(
      target === 'start'
        ? { startDate: formatApiDate(selected) }
        : { endDate: formatApiDate(selected) }
    );
  };

  const renderSection = (
    key: SectionKey,
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'],
    label: string,
    summary: string,
    body: React.ReactNode
  ) => {
    const isOpen = openSection === key;
    const hasValue = summary !== 'Any';
    return (
      <View key={key} className="mb-3">
        <Pressable
          testID={`filter-section-${key}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          onPress={() => toggleSection(key)}
          className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
          style={{
            backgroundColor: theme.card,
            borderColor: isOpen ? accent : theme.border,
          }}>
          <MaterialCommunityIcons name={icon} size={18} color={hasValue ? accent : mutedText} />
          <ThemedText
            className="text-[11px] font-black uppercase tracking-widest"
            style={{ color: mutedText }}>
            {label}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            className="flex-1 text-right text-xs font-black"
            style={{ color: hasValue ? theme.text : mutedText }}>
            {summary}
          </ThemedText>
          <MaterialCommunityIcons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={mutedText}
          />
        </Pressable>
        {isOpen && <View className="px-1 pt-3">{body}</View>}
      </View>
    );
  };

  const chipStyle = (selected: boolean) => ({
    backgroundColor: selected ? accentSurface : theme.card,
    borderColor: selected ? accent : theme.border,
  });

  return (
    <View className="flex-1 rounded-t-[30px]" style={{ backgroundColor: theme.background }}>
      <View className="flex-row items-center px-6 pb-3 pt-5">
        <ThemedText className="flex-1 text-base font-black" style={{ color: theme.text }}>
          Filters
        </ThemedText>
        <Pressable
          testID="filter-close"
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          onPress={onClose}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.card }}>
          <MaterialCommunityIcons name="close" size={18} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <ThemedText
          className="mb-2 text-[10px] font-black uppercase tracking-widest"
          style={{ color: mutedText }}>
          Quick filters
        </ThemedText>
        <View className="mb-5 flex-row flex-wrap gap-2">
          {FILTER_PRESETS.map((preset) => {
            const applied = isPresetApplied(preset, draft, now);
            return (
              <Pressable
                key={preset.key}
                testID={`filter-preset-${preset.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: applied }}
                onPress={() => {
                  haptics.select();
                  setDraft((prev) => applyPreset(preset, prev, now));
                }}
                className="rounded-full border px-4 py-2.5 active:opacity-60"
                style={chipStyle(applied)}>
                <ThemedText
                  className="text-xs font-black"
                  style={{ color: applied ? accent : theme.text }}>
                  {preset.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {renderSection(
          'sort',
          'sort',
          'Sort',
          sortLabel,
          <View className="flex-row flex-wrap gap-2">
            {TRANSACTION_SORTS.map((option) => (
              <Pressable
                key={option.value}
                testID={`filter-sort-${option.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.sort === option.value }}
                onPress={() => selectPatch({ sort: option.value as TransactionSort })}
                className="rounded-full border px-4 py-2.5 active:opacity-60"
                style={chipStyle(draft.sort === option.value)}>
                <ThemedText
                  className="text-xs font-black"
                  style={{ color: draft.sort === option.value ? accent : theme.text }}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {renderSection(
          'dates',
          'calendar-month-outline',
          'When',
          dateSummary,
          <View className="flex-row gap-3">
            {(['start', 'end'] as const).map((edge) => (
              <Pressable
                key={edge}
                testID={`filter-date-${edge}`}
                accessibilityRole="button"
                onPress={() => setShowPicker(edge)}
                className="flex-1 flex-row items-center justify-between rounded-2xl border px-4 py-3"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                <View>
                  <ThemedText
                    className="text-[10px] font-black uppercase"
                    style={{ color: mutedText }}>
                    {edge === 'start' ? 'From' : 'To'}
                  </ThemedText>
                  <ThemedText className="text-xs font-bold" style={{ color: theme.text }}>
                    {formatDate(edge === 'start' ? draft.startDate : draft.endDate)}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name="calendar-outline" size={18} color={accent} />
              </Pressable>
            ))}
          </View>
        )}

        {renderSection(
          'type',
          'swap-vertical',
          'Type',
          draft.type === 'All' ? 'Any' : draft.type,
          <View className="flex-row gap-2">
            {(['All', 'Expense', 'Income'] as const).map((option) => (
              <Pressable
                key={option}
                testID={`filter-type-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.type === option }}
                onPress={() => selectPatch({ type: option })}
                className="flex-1 rounded-2xl border py-3 active:opacity-60"
                style={chipStyle(draft.type === option)}>
                <ThemedText
                  className="text-center text-xs font-black"
                  style={{ color: draft.type === option ? accent : theme.text }}>
                  {option}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {renderSection(
          'amount',
          'cash-multiple',
          'Amount',
          amountSummary,
          <View>
            <View className="flex-row items-center gap-3">
              {(['min', 'max'] as const).map((edge) => {
                const value = edge === 'min' ? draft.minAmount : draft.maxAmount;
                return (
                  <View
                    key={edge}
                    className="flex-1 rounded-2xl border px-4 py-3"
                    style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                    <ThemedText
                      className="text-[10px] font-black uppercase"
                      style={{ color: mutedText }}>
                      {edge === 'min' ? 'Minimum' : 'Maximum'}
                    </ThemedText>
                    <TextInput
                      testID={`filter-amount-${edge}`}
                      value={value === null ? '' : String(value)}
                      onChangeText={(text) =>
                        patch(
                          edge === 'min'
                            ? { minAmount: toAmountValue(text) }
                            : { maxAmount: toAmountValue(text) }
                        )
                      }
                      keyboardType="number-pad"
                      placeholder={edge === 'min' ? 'Any' : 'No limit'}
                      placeholderTextColor={mutedText}
                      selectionColor={accent}
                      className="p-0 text-sm font-black"
                      style={{ color: theme.text, minHeight: 24 }}
                    />
                  </View>
                );
              })}
            </View>
            <ThemedText className="mt-2 px-1 text-[11px]" style={{ color: mutedText }}>
              Leave the maximum empty for no upper limit.
            </ThemedText>
          </View>
        )}

        {renderSection(
          'category',
          'tag-outline',
          'Category',
          draft.uncategorised ? 'Uncategorised' : (draft.category ?? 'Any'),
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((name) => {
              const selected = draft.category === name;
              const visual = categoryVisual(name);
              const matches = categoryCounts[name] ?? 0;
              // A chip that can only return nothing is the bug this task exists
              // for. Zero-result categories stay visible but say so.
              const empty = matches === 0;
              return (
                <Pressable
                  key={name}
                  testID={`filter-category-${name}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${name}, ${matches} ${matches === 1 ? 'entry' : 'entries'}`}
                  onPress={() =>
                    selectPatch({ category: selected ? null : name, uncategorised: false })
                  }
                  className="flex-row items-center gap-2 rounded-full border px-3.5 py-2.5 active:opacity-60"
                  style={{ ...chipStyle(selected), opacity: empty && !selected ? 0.45 : 1 }}>
                  <MaterialCommunityIcons name={visual.icon} size={14} color={visual.color} />
                  <ThemedText
                    className="text-xs font-black"
                    style={{ color: selected ? accent : theme.text }}>
                    {name}
                  </ThemedText>
                  <ThemedText className="text-[11px] font-bold" style={{ color: mutedText }}>
                    {matches}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}

        {renderSection(
          'account',
          'bank-outline',
          'Account',
          accountName ?? 'Any',
          accounts.length === 0 ? (
            <ThemedText className="px-1 text-xs" style={{ color: mutedText }}>
              No accounts yet.
            </ThemedText>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = draft.accountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    testID={`filter-account-${account.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => selectPatch({ accountId: selected ? null : account.id })}
                    className="flex-row items-center gap-2 rounded-full border px-3.5 py-2.5 active:opacity-60"
                    style={chipStyle(selected)}>
                    <MaterialCommunityIcons
                      name={account.type === 'credit_card' ? 'credit-card-outline' : 'bank-outline'}
                      size={14}
                      color={selected ? accent : '#42A5F5'}
                    />
                    <ThemedText
                      className="text-xs font-black"
                      style={{ color: selected ? accent : theme.text }}>
                      {account.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )
        )}

        {renderSection(
          'mode',
          'wallet-outline',
          'Paid via',
          draft.mode ?? 'Any',
          <View className="flex-row flex-wrap gap-2">
            {PAYMENT_MODES.map((mode) => {
              const selected = draft.mode === mode;
              const visual = paymentModeVisual(mode);
              return (
                <Pressable
                  key={mode}
                  testID={`filter-mode-${mode}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectPatch({ mode: selected ? null : mode })}
                  className="flex-row items-center gap-2 rounded-full border px-3.5 py-2.5 active:opacity-60"
                  style={chipStyle(selected)}>
                  <MaterialCommunityIcons name={visual.icon} size={14} color={visual.color} />
                  <ThemedText
                    className="text-xs font-black"
                    style={{ color: selected ? accent : theme.text }}>
                    {mode}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </KeyboardAvoidingScreen>

      {showPicker && (
        <DateTimePicker
          value={
            parseDateLabel(showPicker === 'start' ? draft.startDate : draft.endDate) ?? new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(_event, selected) => onDateChange(selected)}
          onDismiss={() => setShowPicker(null)}
        />
      )}

      <View
        className="flex-row items-center gap-4 border-t px-6 pt-4"
        style={{ borderColor: theme.border, paddingBottom: footerBottom }}>
        <Pressable
          testID="filter-clear-all"
          accessibilityRole="button"
          onPress={() => {
            haptics.select();
            setDraft({ ...emptyFilterState, sort: draft.sort });
          }}
          className="py-3 active:opacity-50">
          <ThemedText className="text-sm font-bold" style={{ color: mutedText }}>
            Clear all
          </ThemedText>
        </Pressable>
        <Pressable
          testID="filter-apply"
          accessibilityRole="button"
          onPress={() => onApply(draft)}
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-3xl"
          style={{ backgroundColor: accent }}>
          <ThemedText tone="onAccent" className="text-base font-black">Show results</ThemedText>
          <View className="rounded-full bg-white/25 px-2 py-0.5">
            <ThemedText tone="onAccent" className="text-xs font-bold">{count}</ThemedText>
          </View>
        </Pressable>
      </View>
    </View>
  );
};
