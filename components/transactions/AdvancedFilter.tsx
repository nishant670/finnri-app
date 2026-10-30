import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { getAccountVisual } from '@/lib/account-display';
import type { Account } from '@/lib/accounts';
import { CATEGORIES, categoryVisual } from '@/lib/categories';
import { haptics } from '@/lib/haptics';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { PAYMENT_MODES, paymentModeVisual } from '@/lib/payment-modes';
import {
  TRANSACTION_SORTS,
  formatApiDate,
  parseDateLabel,
  type TransactionSort,
} from '@/lib/transactions';
import {
  FILTER_PRESETS,
  applyPreset,
  emptyFilterState,
  isPresetApplied,
  type TransactionFilterState,
} from '@/lib/transaction-filters';

import { AccountFilterPicker } from './AccountFilterPicker';

interface AdvancedFilterProps {
  onClose: () => void;
  onApply: (filters: TransactionFilterState) => void;
  currentFilters: TransactionFilterState;
  accounts: Account[];
  /** Entries per canonical category, counted ignoring the category filter. */
  categoryCounts?: Record<string, number>;
}

type MCIName = keyof typeof MaterialCommunityIcons.glyphMap;

const emptyCounts: Record<string, number> = {};

/**
 * The quick filters folded into the sections they belong to (board
 * R3-Filters): the date ones are chips under Date, "Income only" is the Type
 * control, "Over ₹1,000" is the At least field, and Uncategorised is a
 * category chip.
 */
const DATE_PRESETS = FILTER_PRESETS.filter((preset) =>
  ['this-month', 'last-30'].includes(preset.key)
);

/** The modes are stored title-cased; the chips speak in sentence case. */
const MODE_LABELS: Record<string, string> = {
  'Bank Account': 'Bank account',
  'Credit Card': 'Credit card',
  Wallets: 'Wallet',
};

const TYPE_OPTIONS = [
  { key: 'All', label: 'All', testID: 'filter-type-All' },
  { key: 'Expense', label: 'Expenses', testID: 'filter-type-Expense' },
  { key: 'Income', label: 'Income', testID: 'filter-type-Income' },
] as const;

const SORT_OPTIONS = TRANSACTION_SORTS.map((option) => ({
  key: option.value,
  label: option.label,
  testID: `filter-sort-${option.value}`,
}));

const parseApiDate = (value: string | null) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

/** en-US for the month: en-IN writes "Sept", which no other screen does. */
const dayMonthYear = (date: Date) =>
  `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}`;

/** "1 – 24 Oct 2026", sharing what both ends share. */
export const dateRangeLabel = (start: string | null, end: string | null): string => {
  const from = parseApiDate(start);
  const to = parseApiDate(end);
  if (from && to) {
    if (from.getFullYear() !== to.getFullYear()) return `${dayMonthYear(from)} – ${dayMonthYear(to)}`;
    const month = (date: Date) => date.toLocaleString('en-US', { month: 'short' });
    if (from.getMonth() !== to.getMonth()) {
      return `${from.getDate()} ${month(from)} – ${dayMonthYear(to)}`;
    }
    return from.getDate() === to.getDate()
      ? dayMonthYear(to)
      : `${from.getDate()} – ${dayMonthYear(to)}`;
  }
  if (from) return `From ${dayMonthYear(from)}`;
  if (to) return `Until ${dayMonthYear(to)}`;
  return '';
};

/** Digits only — an amount box that accepts "1,0O0" is a box that returns NaN. */
const toAmountValue = (text: string): number | null => {
  const digits = text.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
};

/** How many sections hold a choice, for the count beside the title. */
export const activeFilterCount = (state: TransactionFilterState) =>
  [
    state.type !== 'All',
    state.startDate !== null || state.endDate !== null,
    state.minAmount !== null || state.maxAmount !== null,
    state.category !== null || state.uncategorised,
    state.mode !== null,
    state.accountId !== null,
  ].filter(Boolean).length;

type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  icon?: MCIName;
  iconColor?: string;
  count?: number;
  accessibilityLabel?: string;
  /** A category nothing matches: still there, but quieter. */
  quiet?: boolean;
};

/**
 * A choice chip (board R3-Filters): a tick when chosen, on the selected
 * tint and in bold — never accent text.
 */
function FilterChip({
  label,
  selected,
  onPress,
  testID,
  icon,
  iconColor,
  count,
  accessibilityLabel,
  quiet,
}: FilterChipProps) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.selectedFill, borderColor: 'transparent' }
          : { backgroundColor: colors.card, borderColor: colors.borderStrong },
        quiet && !selected && styles.quiet,
      ]}
      pressedStyle={styles.pressed}>
      {selected ? <MaterialCommunityIcons name="check" size={16} color={colors.text} /> : null}
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={iconColor ?? colors.text} /> : null}
      <ThemedText
        numberOfLines={1}
        style={[styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
        {label}
      </ThemedText>
      {count !== undefined ? (
        <ThemedText tone="muted" style={styles.chipCount}>
          {count}
        </ThemedText>
      ) : null}
    </PressableView>
  );
}

function SectionHeading({ label, detail }: { label: string; detail?: string }) {
  return (
    <View style={styles.heading}>
      <ThemedText accessibilityRole="header" tone="muted" style={styles.headingLabel}>
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText tone="muted" style={styles.headingDetail}>
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * The transactions filter sheet (boards R3-Filters, R3-Filters-Dark).
 *
 * One scrolling sheet with every section open. It replaced seven folded
 * sections under a row of quick filters: to change two things you opened two
 * folds, and the quick filters repeated what the sections already held.
 */
export const AdvancedFilter = ({
  onClose,
  onApply,
  currentFilters,
  accounts,
  categoryCounts = emptyCounts,
}: AdvancedFilterProps) => {
  const { colors } = useThemeTokens();
  const footerBottom = useBottomInset(16);

  const [draft, setDraft] = useState<TransactionFilterState>(currentFilters);
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const appliedDatePreset = DATE_PRESETS.find((preset) => isPresetApplied(preset, draft, now));
  const hasDates = draft.startDate !== null || draft.endDate !== null;
  /** Custom range is open once chosen, and whenever the dates are not a preset's. */
  const [isCustomRange, setIsCustomRange] = useState(hasDates && !appliedDatePreset);

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

  const selectedAccount = accounts.find((account) => account.id === draft.accountId);
  const selectedAccountVisual = selectedAccount ? getAccountVisual(selectedAccount) : null;
  const filterCount = activeFilterCount(draft);

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

  return (
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Filters
        </ThemedText>
        {filterCount > 0 ? (
          <View
            testID="filter-count"
            accessibilityLabel={`${filterCount} ${filterCount === 1 ? 'filter' : 'filters'} chosen`}
            style={[styles.countPill, { backgroundColor: colors.text }]}>
            <ThemedText style={[styles.countPillLabel, { color: colors.background }]}>
              {filterCount}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
        <SheetCloseButton testID="filter-close" accessibilityLabel="Close filters" onPress={onClose} />
      </View>

      <KeyboardAvoidingScreen
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.body}>
        <SectionHeading label="Sort by" />
        <Segments<TransactionSort>
          active={draft.sort}
          options={SORT_OPTIONS}
          onChange={(sort) => patch({ sort })}
        />

        <SectionHeading label="Type" />
        <Segments<TransactionFilterState['type']>
          active={draft.type}
          options={TYPE_OPTIONS}
          onChange={(type) => patch({ type })}
        />

        <SectionHeading label="Date" detail={dateRangeLabel(draft.startDate, draft.endDate)} />
        <View style={styles.chips}>
          <FilterChip
            testID="filter-date-any"
            label="Any time"
            selected={!hasDates && !isCustomRange}
            onPress={() => {
              setIsCustomRange(false);
              selectPatch({ startDate: null, endDate: null });
            }}
          />
          {DATE_PRESETS.map((preset) => (
            <FilterChip
              key={preset.key}
              testID={`filter-preset-${preset.key}`}
              label={preset.label}
              selected={!isCustomRange && appliedDatePreset?.key === preset.key}
              onPress={() => {
                haptics.select();
                setIsCustomRange(false);
                setDraft((prev) => applyPreset(preset, prev, now));
              }}
            />
          ))}
          <FilterChip
            testID="filter-date-custom"
            label="Custom range"
            icon="calendar-blank-outline"
            selected={isCustomRange}
            onPress={() => {
              haptics.select();
              setIsCustomRange(true);
            }}
          />
        </View>
        {isCustomRange ? (
          <View style={styles.fieldPair}>
            {(['start', 'end'] as const).map((edge) => {
              const value = edge === 'start' ? draft.startDate : draft.endDate;
              const parsed = parseApiDate(value);
              return (
                <PressableView
                  key={edge}
                  testID={`filter-date-${edge}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${edge === 'start' ? 'From' : 'To'}, ${parsed ? dayMonthYear(parsed) : 'any'}`}
                  onPress={() => setShowPicker(edge)}
                  style={styles.field}
                  pressedStyle={styles.pressed}>
                  <ThemedText tone="muted" style={styles.fieldLabel}>
                    {edge === 'start' ? 'From' : 'To'}
                  </ThemedText>
                  <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                    <ThemedText
                      numberOfLines={1}
                      tone={parsed ? 'default' : 'muted'}
                      style={styles.fieldText}>
                      {parsed ? dayMonthYear(parsed) : 'Any'}
                    </ThemedText>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.muted} />
                  </View>
                </PressableView>
              );
            })}
          </View>
        ) : null}

        <SectionHeading label="Amount" />
        <View style={styles.fieldPair}>
          {(['min', 'max'] as const).map((edge, index) => {
            const value = edge === 'min' ? draft.minAmount : draft.maxAmount;
            return (
              <React.Fragment key={edge}>
                {index === 1 ? (
                  <ThemedText tone="muted" style={styles.dash}>
                    –
                  </ThemedText>
                ) : null}
                <View style={styles.field}>
                  <ThemedText tone="muted" style={styles.fieldLabel}>
                    {edge === 'min' ? 'At least' : 'At most'}
                  </ThemedText>
                  <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                    <ThemedText tone="muted" style={styles.fieldText}>
                      {CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      testID={`filter-amount-${edge}`}
                      accessibilityLabel={edge === 'min' ? 'At least' : 'At most'}
                      value={value === null ? '' : String(value)}
                      onChangeText={(text) =>
                        patch(
                          edge === 'min'
                            ? { minAmount: toAmountValue(text) }
                            : { maxAmount: toAmountValue(text) }
                        )
                      }
                      keyboardType="number-pad"
                      placeholder={edge === 'min' ? '0' : 'No limit'}
                      placeholderTextColor={colors.muted}
                      selectionColor={colors.accent}
                      style={[styles.fieldInput, { color: colors.text }]}
                    />
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <SectionHeading label="Category" />
        <View style={styles.chips}>
          {CATEGORIES.map((name) => {
            const selected = draft.category === name;
            const visual = categoryVisual(name);
            const matches = categoryCounts[name] ?? 0;
            return (
              <FilterChip
                key={name}
                testID={`filter-category-${name}`}
                label={name}
                icon={visual.icon}
                iconColor={visual.color}
                count={matches}
                accessibilityLabel={`${name}, ${matches} ${matches === 1 ? 'entry' : 'entries'}`}
                // A chip that can only return nothing stays visible but says so.
                quiet={matches === 0}
                selected={selected}
                onPress={() =>
                  selectPatch({ category: selected ? null : name, uncategorised: false })
                }
              />
            );
          })}
          <FilterChip
            testID="filter-category-uncategorised"
            label="Uncategorised"
            icon="tag-outline"
            iconColor={colors.muted}
            selected={draft.uncategorised}
            // Asking for a category and for none at once is a contradiction.
            onPress={() =>
              selectPatch(
                draft.uncategorised ? { uncategorised: false } : { uncategorised: true, category: null }
              )
            }
          />
        </View>

        <SectionHeading label="Paid via" />
        <View style={styles.chips}>
          {PAYMENT_MODES.map((mode) => {
            const selected = draft.mode === mode;
            const visual = paymentModeVisual(mode);
            return (
              <FilterChip
                key={mode}
                testID={`filter-mode-${mode}`}
                label={MODE_LABELS[mode] ?? mode}
                icon={visual.icon}
                iconColor={visual.color}
                selected={selected}
                onPress={() => selectPatch({ mode: selected ? null : mode })}
              />
            );
          })}
        </View>

        <SectionHeading label="Account" />
        <PressableView
          testID="filter-account-row"
          accessibilityRole="button"
          accessibilityLabel={`Account, ${selectedAccount?.name ?? 'any account'}`}
          onPress={() => setIsAccountPickerOpen(true)}
          style={[styles.accountRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons
            name={selectedAccountVisual?.icon ?? 'wallet-outline'}
            size={20}
            color={selectedAccountVisual?.color ?? colors.muted}
          />
          <ThemedText numberOfLines={1} style={[styles.accountLabel, { color: colors.text }]}>
            {selectedAccount?.name ?? 'Any account'}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </PressableView>
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

      {/* No count on Show results: the one it carried was for the filters
          already applied, so it never moved while choosing — a number that
          stands still while you change what it counts. */}
      <View
        style={[
          styles.footer,
          { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: footerBottom },
        ]}>
        <Button
          testID="filter-clear-all"
          variant="outline"
          height={50}
          label="Clear all"
          style={styles.clearButton}
          onPress={() => {
            haptics.select();
            setIsCustomRange(false);
            setDraft({ ...emptyFilterState, sort: draft.sort });
          }}
        />
        <PrimaryButton
          testID="filter-apply"
          label="Show results"
          style={styles.applyButton}
          onPress={() => onApply(draft)}
        />
      </View>

      <AccountFilterPicker
        visible={isAccountPickerOpen}
        accounts={accounts}
        selectedId={draft.accountId}
        onSelect={(accountId) => {
          selectPatch({ accountId });
          setIsAccountPickerOpen(false);
        }}
        onClose={() => setIsAccountPickerOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  countPill: {
    height: 22,
    minWidth: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  heading: {
    marginTop: 18,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  headingLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  headingDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  chipCount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  quiet: {
    opacity: 0.45,
  },
  fieldPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  fieldBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  fieldText: {
    flex: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  dash: {
    height: 44,
    lineHeight: 44,
    fontSize: 15,
  },
  accountRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  accountLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  clearButton: {
    flex: 1,
  },
  applyButton: {
    flex: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
