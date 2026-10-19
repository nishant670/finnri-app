import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { UpgradeSheet } from '@/components/billing/UpgradeSheet';
import { PanelActionRow } from '@/components/money/PanelActionRow';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PrimaryButton } from '@/components/ui/Button';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { ListRow } from '@/components/ui/ListRow';
import { PressableView } from '@/components/ui/PressableView';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useEntitlementGate } from '@/hooks/use-entitlement-gate';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import {
  Budget,
  createBudget,
  deleteBudget,
  fetchBudgets,
  updateBudget,
} from '@/lib/budgets';
import { CATEGORIES, categoryVisual } from '@/lib/categories';
import { formatApiDate } from '@/lib/datetime';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import { fetchDashboard, type DashboardCategory } from '@/lib/insights';

const parseAmount = (value: string) => Number(value.replace(/,/g, '').trim());
const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** A round number just above what you already spend — a limit worth setting. */
const suggestedLimitFor = (amount: number) => {
  const padded = amount * 1.1;
  const step = padded >= 10000 ? 500 : 100;
  return Math.ceil(padded / step) * step;
};

const monthToDateRange = () => {
  const now = new Date();
  return {
    start: formatApiDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: formatApiDate(now),
  };
};

export type MoneyPanelProps = {
  /**
   * True inside the Money tab, false on the standalone route the insight and
   * weekly-review screens still deep-link into with prefill params.
   *
   * The difference is only chrome: embedded, the tab already renders the
   * header and owns the back gesture, so the panel contributes an action row
   * instead of a second header stacked under the first.
   */
  embedded?: boolean;
};

export function BudgetsPanel({ embedded = false }: MoneyPanelProps) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { token } = useAuthStore();
  const dialog = useAppDialog();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const source = toParam(params.source);
  const budgetId = toParam(params.budgetId);
  const prefillCategory = toParam(params.category);
  const suggestedLimit = toParam(params.suggestedLimit);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [threshold, setThreshold] = useState('80');
  const [active, setActive] = useState(true);
  /**
   * The form is a thing you open, not the top of the screen. It used to sit
   * above the list permanently — five inputs and an unlabelled switch between
   * the user and the budgets they came to check, the same "the screen is the
   * form" shape M2 took out of Subscriptions.
   */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showBudgetOptions, setShowBudgetOptions] = useState(false);
  const [routePrefillConsumed, setRoutePrefillConsumed] = useState(false);
  const {
    entitlement,
    locked,
    sheetVisible,
    capture: captureEntitlement,
    present: presentUpgrade,
    dismiss: dismissUpgrade,
    clear: clearEntitlement,
  } = useEntitlementGate();
  const [previewCategories, setPreviewCategories] = useState<DashboardCategory[]>([]);

  const formTitle = editing ? 'Edit budget' : 'New monthly budget';
  const submitLabel = editing ? 'Save changes' : 'Create budget';
  /** A budget is named after what it caps unless the user names it. */
  const derivedName = category ? `${category} budget` : 'Monthly spending';
  const showForm = !locked && (isFormOpen || editing !== null || (!loading && budgets.length === 0));
  const categorySpend = previewCategories.find((entry) => entry.category === category);
  const activeBudgets = useMemo(() => budgets.filter((budget) => budget.active).length, [budgets]);

  const editBudget = useCallback((budget: Budget) => {
    setEditing(budget);
    setShowBudgetOptions(false);
    setName(budget.name);
    setCategory(budget.category ?? '');
    setLimitAmount(String(budget.limit_amount));
    setThreshold(String(budget.alert_threshold_percent));
    setActive(budget.active);
    setError(null);
  }, []);

  useEffect(() => {
    if (source !== 'insight' || editing || routePrefillConsumed) return;
    if (budgetId && budgets.length > 0) {
      const matchedBudget = budgets.find((budget) => String(budget.id) === budgetId);
      if (matchedBudget) {
        editBudget(matchedBudget);
        setRoutePrefillConsumed(true);
        return;
      }
    }
    const cleanCategory = prefillCategory?.trim();
    const parsedLimit = parseAmount(suggestedLimit ?? '');
    if (cleanCategory) {
      setCategory(cleanCategory);
    }
    setIsFormOpen(true);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      setLimitAmount(String(Math.ceil(parsedLimit * 1.1)));
    }
    setThreshold('80');
    setActive(true);
    setRoutePrefillConsumed(true);
  }, [budgetId, budgets, editBudget, editing, prefillCategory, routePrefillConsumed, source, suggestedLimit]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setCategory('');
    setLimitAmount('');
    setThreshold('80');
    setActive(true);
    setShowBudgetOptions(false);
    setRoutePrefillConsumed(true);
    setError(null);
  };

  const openNewBudget = () => {
    resetForm();
    setIsFormOpen(true);
    // The user's own spend is the best hint at a limit; the same read the
    // paywall uses, so it costs one request.
    void loadPreview();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  /**
   * Budgets are gated, so the screen has to be able to sell itself with the
   * user's own numbers. The dashboard is not gated and already knows what they
   * spent per category this month.
   */
  const loadPreview = useCallback(async () => {
    if (!token) return;
    const { start, end } = monthToDateRange();
    try {
      const dashboard = await fetchDashboard(token, start, end);
      setPreviewCategories(
        (dashboard.top_categories ?? []).filter((entry) => entry.amount > 0).slice(0, 3)
      );
    } catch {
      // The paywall still stands on its own copy without the numbers.
      setPreviewCategories([]);
    }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) {
      setBudgets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setBudgets(await fetchBudgets(token));
      clearEntitlement();
    } catch (loadError) {
      // A 402 is an offer, not a failure — no error state, no red text.
      if (captureEntitlement(loadError)) {
        setBudgets([]);
        void loadPreview();
        return;
      }
      setError(getFriendlyErrorMessage(loadError, "Couldn't load your budgets. Try again in a moment."));
    } finally {
      setLoading(false);
    }
  }, [captureEntitlement, clearEntitlement, loadPreview, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const saveBudget = async () => {
    if (!token || saving) return;
    const amount = parseAmount(limitAmount);
    const thresholdValue = Math.round(parseAmount(threshold));
    const nextErrors: string[] = [];

    if (!Number.isFinite(amount) || amount <= 0) nextErrors.push('Enter a monthly limit above zero.');
    if (!Number.isInteger(thresholdValue) || thresholdValue < 1 || thresholdValue > 100) {
      nextErrors.push('Alert level should be between 1% and 100%.');
      // It lives under More options; a message about a hidden field opens it.
      setShowBudgetOptions(true);
    }
    if (nextErrors.length > 0) {
      haptics.rejected();
      setError(nextErrors.join('\n'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim() || derivedName,
        category: category.trim(),
        limit_amount: amount,
        alert_threshold_percent: thresholdValue,
        active,
      };
      if (editing) {
        await updateBudget(token, editing.id, payload);
      } else {
        await createBudget(token, payload);
      }
      haptics.saved();
      closeForm();
      await load();
    } catch (saveError) {
      if (captureEntitlement(saveError)) {
        presentUpgrade();
        void loadPreview();
        return;
      }
      // A server refusal is the same event to the finger as a missing field —
      // C3's argument for routing both through one rejection, one panel over.
      haptics.rejected();
      setError(
        getFriendlyErrorMessage(saveError, "Couldn't save this budget. Check your connection and try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (budget: Budget) => {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete budget?',
      message: `You'll stop getting alerts for ${budget.name}.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteBudget(token, budget.id);
      if (editing?.id === budget.id) closeForm();
      await load();
    } catch (deleteError) {
      if (captureEntitlement(deleteError)) {
        presentUpgrade();
        return;
      }
      setError(getFriendlyErrorMessage(deleteError, "Couldn't delete this budget. Try again."));
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {embedded ? (
          <PanelActionRow
            subtitle={
              locked
                ? 'Monthly limits · part of the Finnri plan'
                : `${activeBudgets} active monthly limit${activeBudgets === 1 ? '' : 's'}`
            }
            actionLabel={locked ? undefined : 'Add'}
            onAction={locked ? undefined : openNewBudget}
            colors={colors}
          />
        ) : (
          <AppHeader
            title="Budgets"
            subtitle={locked ? 'On the Finnri plan' : `${activeBudgets} active`}
            onBack={() => router.back()}
            rightIcon={locked ? undefined : 'plus'}
            onRightPress={locked ? undefined : openNewBudget}
          />
        )}

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: embedded ? 40 : 32 }]}>
          {locked ? (
            <BudgetPaywallPreview
              categories={previewCategories}
              featureLabel={entitlement?.featureLabel ?? 'Budgets'}
              onUpgrade={presentUpgrade}
              colors={colors}
            />
          ) : showForm ? (
            <View
              testID="budget-form"
              style={[styles.card, styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.formHeader}>
                <View style={styles.flex}>
                  <ThemedText style={[styles.cardTitle, { color: colors.text }]}>{formTitle}</ThemedText>
                  <ThemedText tone="muted" style={styles.caption}>
                    Finnri warns you before you go over.
                  </ThemedText>
                </View>
                {budgets.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close the budget form"
                    onPress={closeForm}
                    hitSlop={10}>
                    <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>

              <ThemedText style={[styles.label, { color: colors.text }]}>What do you want to cap?</ThemedText>
              {/* The canonical list as chips. This was a free-text box, so
                  "food" made a budget no entry could ever count towards — the
                  category it needed to match is "Food & Drinks". */}
              <View style={styles.chips}>
                {['', ...CATEGORIES].map((option) => {
                  const selected = category === option;
                  const visual = option ? categoryVisual(option) : null;
                  return (
                    <PressableView
                      key={option || 'all'}
                      testID={`budget-category-${option || 'all'}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        haptics.select();
                        setCategory(option);
                      }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.selectedFill : colors.card,
                          borderColor: selected ? colors.selectedBorder : colors.border,
                        },
                      ]}
                      pressedStyle={styles.pressed}>
                      <MaterialCommunityIcons
                        name={visual ? visual.icon : 'chart-donut'}
                        size={16}
                        color={colors.text}
                      />
                      <ThemedText
                        style={[styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
                        {option || 'All spending'}
                      </ThemedText>
                    </PressableView>
                  );
                })}
              </View>

              <BudgetInput
                label="Monthly limit"
                value={limitAmount}
                onChangeText={(value) => setLimitAmount(value.replace(/[^0-9.]/g, ''))}
                placeholder="10,000"
                keyboardType="decimal-pad"
                colors={colors}
                testID="budget-limit-input"
              />
              {categorySpend ? (
                <PressableView
                  accessibilityRole="button"
                  onPress={() => {
                    haptics.select();
                    setLimitAmount(String(suggestedLimitFor(categorySpend.amount)));
                  }}
                  style={[styles.hint, { backgroundColor: colors.selectedFill }]}
                  pressedStyle={styles.pressed}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.text} />
                  <ThemedText style={[styles.hintText, { color: colors.text }]}>
                    {`You've spent ${formatMoney(categorySpend.amount)} on ${category} this month. Use ${formatMoney(
                      suggestedLimitFor(categorySpend.amount)
                    )}?`}
                  </ThemedText>
                </PressableView>
              ) : null}

              <FormDisclosure
                testID="budget-more-options"
                label="More options"
                summary={[
                  `Called “${name.trim() || derivedName}”`,
                  `Alert at ${threshold || '0'}%`,
                  editing && !active ? 'Paused' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                expanded={showBudgetOptions}
                onToggle={() => setShowBudgetOptions((open) => !open)}>
                <BudgetInput
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  placeholder={derivedName}
                  colors={colors}
                />
                <BudgetInput
                  label="Alert me at (% of the limit)"
                  value={threshold}
                  onChangeText={(value) => setThreshold(value.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  colors={colors}
                />
                {editing ? (
                  <View style={[styles.switchRow, { borderColor: colors.border }]}>
                    <View style={styles.flex}>
                      <ThemedText style={[styles.switchTitle, { color: colors.text }]}>Active</ThemedText>
                      <ThemedText tone="muted" style={styles.caption}>
                        A paused budget keeps its history but stops alerting.
                      </ThemedText>
                    </View>
                    <HapticSwitch
                      accessibilityLabel="Budget active"
                      value={active}
                      onValueChange={setActive}
                    />
                  </View>
                ) : null}
              </FormDisclosure>

              {error && (
                <ThemedText tone="negative" style={[styles.caption, styles.error]}>
                  {error}
                </ThemedText>
              )}

              <PrimaryButton
                testID="budget-save"
                label={submitLabel}
                loading={saving}
                onPress={saveBudget}
                style={styles.save}
              />
            </View>
          ) : null}

          {locked ? null : loading ? (
            <View style={styles.gutter}>
              <SkeletonFrame label="Loading budgets" testID="budgets-skeleton">
                <SkeletonCards count={3} lines={2} radius={16} />
              </SkeletonFrame>
            </View>
          ) : budgets.length === 0 ? (
            <ThemedText tone="muted" style={[styles.caption, styles.emptyHint]}>
              Start with the one area that surprises you most each month. You can add more later.
            </ThemedText>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {budgets.map((budget, index) => {
                const visual = budget.category ? categoryVisual(budget.category) : null;
                return (
                  <ListRow
                    key={budget.id}
                    icon={visual ? visual.icon : 'chart-donut'}
                    hue={visual ? visual.color : '#64748B'}
                    title={budget.name}
                    meta={`${budget.category ? budget.category : 'All spending'} · alert at ${budget.alert_threshold_percent}%`}
                    amount={`${formatMoney(budget.limit_amount)} limit`}
                    status={budget.active ? 'Active' : 'Paused'}
                    statusTone={budget.active ? 'positive' : 'muted'}
                    divider={index > 0}
                    onPress={() => editBudget(budget)}
                    accessory={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${budget.name}`}
                        onPress={() => void confirmDelete(budget)}
                        hitSlop={6}
                        style={styles.delete}>
                        <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.negative} />
                      </Pressable>
                    }
                  />
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <UpgradeSheet visible={sheetVisible} entitlement={entitlement} onClose={dismissUpgrade} />
    </View>
  );
}

type BudgetPaywallPreviewProps = {
  categories: DashboardCategory[];
  featureLabel: string;
  onUpgrade: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

/**
 * What stands in for the create form when budgets are locked. A form you
 * cannot submit teaches nothing; the user's own spend does — every row here is
 * a limit they could plausibly set, priced off what they actually spent this
 * month.
 */
function BudgetPaywallPreview({
  categories,
  featureLabel,
  onUpgrade,
  colors,
}: BudgetPaywallPreviewProps) {
  const lead = categories[0];

  return (
    <View style={[styles.card, styles.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText style={[styles.cardTitle, { color: colors.text }]}>
        Limits from what you already spend
      </ThemedText>
      <ThemedText tone="muted" style={styles.body}>
        {lead
          ? `Set a limit on ${lead.category} — you spent ${formatMoney(lead.amount)} this month.`
          : 'Set a monthly limit and hear about it before you cross it, not after.'}
      </ThemedText>

      {categories.length > 0 && (
        <View style={styles.previewRows}>
          {categories.map((entry, index) => {
            const visual = categoryVisual(entry.category);
            const suggestion = suggestedLimitFor(entry.amount);
            const share = suggestion > 0 ? Math.min(1, entry.amount / suggestion) : 0;
            return (
              <View
                key={entry.category}
                style={[
                  styles.previewRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}>
                <View style={[styles.previewTile, { backgroundColor: visual.bgColor }]}>
                  <MaterialCommunityIcons name={visual.icon} size={18} color={visual.color} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.previewLine}>
                    <ThemedText numberOfLines={1} style={[styles.previewTitle, { color: colors.text }]}>
                      {entry.category}
                    </ThemedText>
                    <ThemedText style={[styles.previewLimit, { color: colors.text }]}>
                      {formatMoney(suggestion)} limit
                    </ThemedText>
                  </View>
                  <View style={[styles.bar, { backgroundColor: colors.track }]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.round(share * 100)}%`, backgroundColor: visual.color },
                      ]}
                    />
                  </View>
                  <View style={styles.previewLine}>
                    <ThemedText tone="muted" style={[styles.caption, styles.flex]}>
                      {formatMoney(entry.amount)} spent this month
                    </ThemedText>
                    <ThemedText tone="muted" style={styles.caption}>
                      {Math.round(share * 100)}%
                    </ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <PrimaryButton
        label={`Unlock ${featureLabel}`}
        icon="lock-outline"
        onPress={onUpgrade}
        style={styles.save}
      />
    </View>
  );
}

type BudgetInputProps = {
  label: string;
  testID?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

function BudgetInput({
  label,
  testID,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  colors,
}: BudgetInputProps) {
  return (
    <View style={styles.field}>
      <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingTop: 14,
  },
  gutter: {
    marginHorizontal: SCREEN_GUTTER,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  form: {
    padding: 16,
    gap: 4,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  field: {
    marginBottom: 12,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  switchTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  error: {
    marginTop: 8,
  },
  save: {
    marginTop: 14,
  },
  emptyHint: {
    marginHorizontal: SCREEN_GUTTER + 8,
    textAlign: 'center',
  },
  delete: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  previewRows: {
    marginTop: 8,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  previewTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  previewTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  previewLimit: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: 6,
    marginVertical: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  pressed: {
    opacity: 0.7,
  },
});
