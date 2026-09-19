import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { AvatarCircle, GroupChoiceChip } from '@/components/split/primitives/SplitPrimitives';
import { formatBalance, parseAmount } from '@/components/split/split-utils';
import { ThemedText } from '@/components/themed-text';
import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { saveAccount, type Account } from '@/lib/accounts';
import { DraftFieldCard } from '@/components/transactions/DraftFieldCard';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import {
  computeSplitShares,
  describeSplitTab,
  splitParticipantKeys,
  sumSplitWeights,
  type AdjustSplitTab,
  type SplitSelection,
  type SplitSlotPerson,
} from '@/lib/split-preferences';
import type { SplitGroup } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export type ExpenseFlowScreen = 'expense' | 'split_choice' | 'adjust_split';

function describeSplitChoice(selection: SplitSelection, people: SplitSlotPerson[]) {
  const payerLabel =
    selection.payerKey === selection.selfKey
      ? 'you'
      : (people.find((person) => person.key === selection.payerKey)?.label ?? 'a friend');
  if (selection.fullAmount) {
    return selection.payerKey === selection.selfKey
      ? 'You are owed the full amount.'
      : `${payerLabel} is owed the full amount.`;
  }
  const tabLabel = describeSplitTab(selection.tab);
  return selection.payerKey === selection.selfKey
    ? `Paid by you and ${tabLabel}.`
    : `${payerLabel} paid, ${tabLabel}.`;
}

/** The transaction composer is shared with Home; this adapter only owns allocation. */
export function AddExpenseModal({
  visible,
  flowScreen,
  errorMessage,
  initialData,
  isEdit,
  accounts,
  authToken,
  onAccountCreated,
  amount,
  groups,
  selectedGroup,
  selectedGroupId,
  isGroupLocked,
  people,
  selection,
  personalPayment,
  payerLocked,
  onChangeAmount,
  onSelectGroup,
  onChangeFlowScreen,
  onSelectPayer,
  onToggleParticipant,
  onToggleAllParticipants,
  onChangeAdjustSplitTab,
  onChangeSplitWeight,
  onApplySplit,
  onSave,
  onClose,
}: {
  visible: boolean;
  flowScreen: ExpenseFlowScreen;
  errorMessage?: string | null;
  initialData?: Partial<EntryForm>;
  isEdit: boolean;
  accounts: Account[];
  onAccountCreated?: (account: Account) => void;
  authToken?: string | null;
  amount: string;
  groups: SplitGroup[];
  selectedGroup: SplitGroup | null;
  selectedGroupId: number | null;
  isGroupLocked: boolean;
  people: SplitSlotPerson[];
  selection: SplitSelection;
  personalPayment: boolean;
  payerLocked: boolean;
  onChangeAmount: (value: string) => void;
  onSelectGroup: (groupId: number | null) => void;
  onChangeFlowScreen: (screen: ExpenseFlowScreen) => void;
  onSelectPayer: (payerKey: string, fullAmount: boolean) => void;
  onToggleParticipant: (key: string) => void;
  onToggleAllParticipants: () => void;
  onChangeAdjustSplitTab: (tab: AdjustSplitTab) => void;
  onChangeSplitWeight: (key: string, value: string) => void;
  onApplySplit: () => void;
  onSave: (form: EntryForm) => Promise<void>;
  onClose: () => void;
}) {
  const splitLabel = describeSplitChoice(selection, people);
  const onDraftChange = useCallback(
    (form: EntryForm) => onChangeAmount(form.amount),
    [onChangeAmount]
  );
  return (
    <TransactionFormModal
      visible={visible}
      initialData={initialData}
      isEdit={isEdit}
      accounts={accounts}
      authToken={authToken}
      onAutoCreateSuggestedAccount={
        authToken && onAccountCreated
          ? async (suggestion) => {
              const { type, name, color, provider, identifier } = suggestion;
              const account = await saveAccount(authToken, {
                type,
                name,
                color,
                provider,
                identifier,
                auto_created: true,
              });
              onAccountCreated(account);
              return account;
            }
          : undefined
      }
      onDraftChange={onDraftChange}
      onSave={onSave}
      onClose={onClose}
      splitContext={{
        personalPayment,
        onBack: flowScreen === 'expense' ? undefined : () => onChangeFlowScreen('expense'),
        fields: (
          <View className="px-5 mb-4 gap-3">
            <DraftFieldCard
              label="Split"
              value={splitLabel}
              icon="account-multiple-outline"
              accessibilityLabel={`Change split. ${splitLabel}`}
              onPress={() => {
                Keyboard.dismiss();
                onChangeFlowScreen('split_choice');
              }}
            />
            {!isGroupLocked && groups.length > 0 ? (
              <DraftFieldCard label="Group" icon="account-group-outline">
                <View className="mt-1 flex-row flex-wrap gap-2">
                  <GroupChoiceChip
                    label="No group"
                    selected={selectedGroupId === null}
                    onPress={() => onSelectGroup(null)}
                  />
                  {groups.map((group) => (
                    <GroupChoiceChip
                      key={group.id}
                      label={group.name}
                      selected={selectedGroupId === group.id}
                      onPress={() => onSelectGroup(group.id)}
                    />
                  ))}
                </View>
              </DraftFieldCard>
            ) : (
              <DraftFieldCard
                label="Group"
                value={selectedGroup?.name ?? 'All friends'}
                icon="account-group-outline"
              />
            )}
            {!personalPayment ? (
              <ThemedText tone="muted" className="text-xs">
                This records the split only. Your accounts, refund reminders and payment plans are
                not changed.
              </ThemedText>
            ) : null}
            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          </View>
        ),
        overlay:
          flowScreen === 'expense' ? undefined : flowScreen === 'split_choice' ? (
            <SplitChoiceScreen
              people={people}
              selection={selection}
              payerLocked={payerLocked}
              onBack={() => onChangeFlowScreen('expense')}
              onSelectPayer={onSelectPayer}
              onMoreOptions={() => onChangeFlowScreen('adjust_split')}
            />
          ) : (
            <AdjustSplitScreen
              people={people}
              selection={selection}
              amount={parseAmount(amount)}
              payerLocked={payerLocked}
              errorMessage={errorMessage}
              onBack={() => onChangeFlowScreen('split_choice')}
              onDone={onApplySplit}
              onSelectPayer={onSelectPayer}
              onToggleParticipant={onToggleParticipant}
              onToggleAll={onToggleAllParticipants}
              onChangeTab={onChangeAdjustSplitTab}
              onChangeWeight={onChangeSplitWeight}
            />
          ),
      }}
    />
  );
}

function HeaderDoneAction({ saving, onDone }: { saving: boolean; onDone: () => void }) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save"
      disabled={saving}
      onPress={onDone}
      className="ml-4 h-10 w-10 items-center justify-center rounded-full"
      style={{ backgroundColor: theme.card }}>
      {saving ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <MaterialCommunityIcons name="check" size={26} color={theme.accent} />
      )}
    </Pressable>
  );
}

/**
 * The four shapes a split usually takes, offered before the full editor. Which
 * "friend paid" it names is whoever is currently the payer, falling back to the
 * first other person in the group.
 */
export function SplitChoiceScreen({
  people,
  selection,
  title,
  variant = 'expense',
  payerLocked = false,
  onBack,
  onDone,
  onSelectPayer,
  onMoreOptions,
}: {
  people: SplitSlotPerson[];
  selection: SplitSelection;
  title?: string;
  /**
   * A group default is a ratio, not a record of one evening. Who laid the money
   * out is decided per expense — by whoever is entering it — so the default
   * editor offers only the two self-payer shapes. Anchoring a name here is what
   * had a member's composer open on "Nishant Munjal paid" every time she added
   * something she had bought herself.
   */
  variant?: 'expense' | 'default';
  payerLocked?: boolean;
  onBack: () => void;
  onDone?: () => void;
  onSelectPayer: (payerKey: string, fullAmount: boolean) => void;
  onMoreOptions: () => void;
}) {
  const theme = useThemeTokens().colors;
  const selfPerson = people.find((person) => person.key === selection.selfKey);
  const selfName = selfPerson?.label ?? 'You';
  const others = people.filter((person) => person.key !== selection.selfKey);
  const activeOther =
    others.find((person) => person.key === selection.payerKey) ?? others[0] ?? null;
  const otherName = activeOther?.label ?? 'Friend';
  const payerIsFixed = variant === 'default';
  const cannotChangePayer = payerIsFixed || payerLocked;
  const choices: { key: string; payerKey: string; fullAmount: boolean; label: string }[] = [
    {
      key: 'self_equal',
      payerKey: selection.selfKey,
      fullAmount: false,
      label: payerIsFixed
        ? 'Whoever adds the expense paid, split equally.'
        : 'You paid, split equally.',
    },
    {
      key: 'self_full',
      payerKey: selection.selfKey,
      fullAmount: true,
      label: payerIsFixed
        ? 'Whoever adds the expense is owed the full amount.'
        : 'You are owed the full amount.',
    },
    ...(activeOther && !payerIsFixed
      ? [
          {
            key: 'other_equal',
            payerKey: activeOther.key,
            fullAmount: false,
            label: `${otherName} paid, split equally.`,
          },
          {
            key: 'other_full',
            payerKey: activeOther.key,
            fullAmount: true,
            label: `${otherName} is owed the full amount.`,
          },
        ]
      : []),
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <AppHeader
        title={title ?? 'How was this expense split?'}
        onBack={onBack}
        rightNode={<HeaderDoneAction saving={false} onDone={onDone ?? onBack} />}
        style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-6 pt-5">
          {choices
            .filter((choice) => !payerLocked || choice.payerKey === selection.payerKey)
            .map((choice) => {
              const selected =
                selection.payerKey === choice.payerKey &&
                selection.fullAmount === choice.fullAmount;
              const paidBySelf = choice.payerKey === selection.selfKey;
              return (
                <Pressable
                  key={choice.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptics.select();
                    onSelectPayer(choice.payerKey, choice.fullAmount);
                  }}
                  className="min-h-[92px] flex-row items-center gap-5">
                  <SplitAvatarStack
                    primaryLabel={paidBySelf ? selfName : otherName}
                    secondaryLabel={paidBySelf ? otherName : selfName}
                    tone={paidBySelf ? 'green' : 'orange'}
                  />
                  <TText
                    className="flex-1 text-xl"
                    style={{ color: theme.text, fontFamily: Fonts.body }}>
                    {choice.label}
                  </TText>
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={30} color={theme.text} />
                  ) : null}
                </Pressable>
              );
            })}

          {others.length > 1 && !cannotChangePayer ? (
            <View className="mt-2">
              <TText className="mb-2 text-sm" style={{ color: theme.muted }}>
                Paid by someone else
              </TText>
              <View className="flex-row flex-wrap gap-2">
                {others.map((person) => (
                  <GroupChoiceChip
                    key={person.key}
                    label={person.label}
                    selected={selection.payerKey === person.key}
                    onPress={() => onSelectPayer(person.key, selection.fullAmount)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onMoreOptions}
            className="mt-12 min-h-14 items-center justify-center self-center rounded border px-8"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
            <TText variant="button" style={{ color: theme.text }}>
              More options
            </TText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SplitAvatarStack({
  primaryLabel,
  secondaryLabel,
  tone,
}: {
  primaryLabel: string;
  secondaryLabel: string;
  tone: 'green' | 'orange';
}) {
  const theme = useThemeTokens().colors;
  const primaryColor = tone === 'green' ? theme.positive : theme.accent;
  return (
    <View className="h-12 w-[82px] flex-row items-center">
      <AvatarCircle label={primaryLabel} size={48} borderColor={primaryColor} />
      <View style={{ marginLeft: -18 }}>
        <AvatarCircle label={secondaryLabel} size={42} borderColor={theme.onAccent} />
      </View>
    </View>
  );
}

const splitTabCopy: Record<AdjustSplitTab, { heading: string; caption: string }> = {
  equally: { heading: 'Split equally', caption: 'Select which people owe an equal share.' },
  unequally: {
    heading: 'Split by exact amounts',
    caption: 'Enter what each person owes. The amounts must add up to the total.',
  },
  percentages: {
    heading: 'Split by percentages',
    caption: 'Enter each share as a percentage. They must add up to 100%.',
  },
  shares: {
    heading: 'Split by shares',
    caption: 'Enter how many shares each person carries. Two shares owe twice one.',
  },
};

export function AdjustSplitScreen({
  people,
  selection,
  amount,
  variant = 'expense',
  payerLocked = false,
  title,
  errorMessage,
  onBack,
  onDone,
  onSelectPayer,
  onToggleParticipant,
  onToggleAll,
  onChangeTab,
  onChangeWeight,
}: {
  people: SplitSlotPerson[];
  selection: SplitSelection;
  amount: number;
  /**
   * A group default is written before any amount exists, so the exact-amounts
   * tab has nothing to divide and the rupee previews have nothing to show.
   */
  variant?: 'expense' | 'default';
  payerLocked?: boolean;
  title?: string;
  errorMessage?: string | null;
  onBack: () => void;
  onDone: () => void;
  onSelectPayer: (payerKey: string, fullAmount: boolean) => void;
  onToggleParticipant: (key: string) => void;
  onToggleAll: () => void;
  onChangeTab: (tab: AdjustSplitTab) => void;
  onChangeWeight: (key: string, value: string) => void;
}) {
  const theme = useThemeTokens().colors;
  const [payerPickerVisible, setPayerPickerVisible] = useState(false);
  const isDefaultVariant = variant === 'default';
  const activeTab = selection.tab;
  const payerName = isDefaultVariant
    ? 'whoever adds the expense'
    : (people.find((person) => person.key === selection.payerKey)?.label ?? 'Somebody');
  const activeKeys = splitParticipantKeys(selection);
  const shareResult = computeSplitShares({
    amount,
    tab: activeTab,
    keys: activeKeys,
    weights: selection.weights,
  });
  const shares = shareResult.ok ? shareResult.shares : {};
  const totalSelected = activeKeys.length;
  const perPerson =
    Number.isFinite(amount) && amount > 0 && totalSelected > 0 ? amount / totalSelected : 0;
  const allSelected = people.every((person) => selection.participantKeys.includes(person.key));
  const weightTotal = sumSplitWeights(activeKeys, selection.weights);
  const tabs: { key: AdjustSplitTab; label: string }[] = [
    { key: 'equally', label: 'Equally' },
    ...(isDefaultVariant
      ? []
      : ([{ key: 'unequally', label: 'Unequally' }] as { key: AdjustSplitTab; label: string }[])),
    { key: 'percentages', label: 'By percentages' },
    { key: 'shares', label: 'By shares' },
  ];
  const copy = splitTabCopy[activeTab];

  const renderPersonRow = (person: SplitSlotPerson) => {
    const included = activeKeys.includes(person.key);
    if (activeTab === 'equally') {
      return (
        <SplitPersonRow
          key={person.key}
          label={person.label}
          subtitle={person.subtitle}
          selected={included}
          onPress={() => onToggleParticipant(person.key)}
        />
      );
    }
    return (
      <SplitWeightRow
        key={person.key}
        label={person.label}
        subtitle={person.subtitle}
        selected={included}
        value={selection.weights[person.key] ?? ''}
        prefix={activeTab === 'unequally' ? CURRENCY_SYMBOL : ''}
        suffix={activeTab === 'percentages' ? '%' : ''}
        placeholder={activeTab === 'shares' ? '1' : '0'}
        preview={
          isDefaultVariant || !included || !shareResult.ok
            ? null
            : formatBalance(shares[person.key] ?? 0)
        }
        onPress={() => onToggleParticipant(person.key)}
        onChangeValue={(value) => onChangeWeight(person.key, value)}
      />
    );
  };

  const footerSummary = () => {
    if (activeTab === 'equally') {
      return isDefaultVariant
        ? `Equal share between ${totalSelected} ${totalSelected === 1 ? 'person' : 'people'}`
        : `${formatBalance(perPerson)}/person`;
    }
    if (activeTab === 'percentages') return `${weightTotal.toFixed(2)}% of 100%`;
    if (activeTab === 'shares') return `${weightTotal} ${weightTotal === 1 ? 'share' : 'shares'}`;
    return `${formatBalance(weightTotal)} of ${formatBalance(amount)}`;
  };

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <AppHeader
        title={title ?? 'Adjust split'}
        onBack={onBack}
        rightNode={<HeaderDoneAction saving={false} onDone={onDone} />}
        style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="flex-row items-center gap-4 px-6 py-5">
          <AvatarCircle label={payerName} size={52} />
          <TText className="flex-1 text-xl" style={{ color: theme.text }}>
            Paid by <TText style={{ fontFamily: Fonts.title }}>{payerName}</TText>
          </TText>
          {!payerLocked && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change who paid"
              onPress={() => setPayerPickerVisible(true)}
              className="h-11 w-11 items-center justify-center">
              <MaterialCommunityIcons name="pencil" size={26} color={theme.text} />
            </Pressable>
          )}
        </View>
        {payerLocked ? (
          <ThemedText tone="muted" className="px-6 mb-3 text-xs">
            Payer is fixed for this linked transaction.
          </ThemedText>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b"
          style={{ borderColor: theme.border }}
          contentContainerStyle={{ paddingHorizontal: 20 }}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  haptics.select();
                  onChangeTab(tab.key);
                }}
                className="min-h-14 justify-center px-4"
                style={{ borderBottomWidth: selected ? 2 : 0, borderColor: theme.text }}>
                <TText
                  className="text-lg"
                  style={{
                    color: selected ? theme.text : theme.mutedStrong,
                    fontFamily: Fonts.title,
                  }}>
                  {tab.label}
                </TText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="items-center px-6 py-8">
          {activeTab === 'equally' ? (
            <View className="flex-row items-end gap-6">
              <MaterialCommunityIcons name="cash-multiple" size={72} color={theme.accent} />
              <MaterialCommunityIcons name="elephant" size={74} color={`${theme.accent}D9`} />
              <MaterialCommunityIcons name="heart" size={64} color={`${theme.accent}B8`} />
              <MaterialCommunityIcons name="glass-cocktail" size={66} color={`${theme.accent}99`} />
            </View>
          ) : (
            <MaterialCommunityIcons
              name={activeTab === 'percentages' ? 'percent-outline' : 'scale-balance'}
              size={64}
              color={theme.accent}
            />
          )}
          <TText variant="screenTitle" className="mt-7" style={{ color: theme.text }}>
            {copy.heading}
          </TText>
          <TText className="mt-2 text-center text-lg" style={{ color: theme.muted }}>
            {copy.caption}
          </TText>
          {selection.fullAmount ? (
            <TText className="mt-3 text-center text-base" style={{ color: theme.muted }}>
              {payerName} is owed the full amount and carries none of it.
            </TText>
          ) : null}
        </View>

        {errorMessage ? (
          <ErrorBanner message={errorMessage} style={{ marginHorizontal: 24, marginBottom: 16 }} />
        ) : null}

        <View className="px-6">{people.map(renderPersonRow)}</View>
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 min-h-[88px] flex-row items-center border-t"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-1 items-center px-3">
          <TText
            className="text-center text-lg"
            style={{ color: theme.text, fontFamily: Fonts.title }}>
            {footerSummary()}
          </TText>
          <TText className="mt-1 text-center text-base" style={{ color: theme.muted }}>
            {shareResult.ok || activeTab === 'equally'
              ? `(${totalSelected} ${totalSelected === 1 ? 'person' : 'people'})`
              : shareResult.error}
          </TText>
        </View>
        <View className="h-full w-px" style={{ backgroundColor: theme.border }} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected }}
          onPress={onToggleAll}
          className="min-h-[88px] w-40 flex-row items-center justify-center gap-4">
          <TText variant="screenTitle" style={{ color: theme.text }}>
            All
          </TText>
          <MaterialCommunityIcons
            name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={30}
            color={allSelected ? theme.accent : theme.mutedStrong}
          />
        </Pressable>
      </View>

      <AnimatedBottomSheet
        visible={payerPickerVisible}
        onClose={() => setPayerPickerVisible(false)}>
        <View
          className="rounded-t-[28px] border px-5 pb-8 pt-5"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}>
          <View className="mb-4 flex-row items-center justify-between">
            <TText variant="sectionTitle" style={{ color: theme.text }}>
              Paid by
            </TText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPayerPickerVisible(false)}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.secondary }}>
              <MaterialCommunityIcons name="close" size={20} color={theme.text} />
            </Pressable>
          </View>
          <View className="gap-2">
            {people.map((person) => (
              <PayerOptionRow
                key={person.key}
                label={person.label}
                subtitle={person.subtitle}
                selected={selection.payerKey === person.key}
                onPress={() => {
                  onSelectPayer(person.key, selection.fullAmount);
                  setPayerPickerVisible(false);
                }}
              />
            ))}
          </View>
        </View>
      </AnimatedBottomSheet>
    </View>
  );
}

function PayerOptionRow({
  label,
  subtitle,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className="min-h-16 flex-row items-center gap-4 rounded-2xl px-3"
      style={{ backgroundColor: selected ? theme.secondary : 'transparent' }}>
      <AvatarCircle label={label} size={44} />
      <View className="flex-1">
        <TText variant="cardTitle" style={{ color: theme.text }}>
          {label}
        </TText>
        {subtitle ? (
          <TText className="mt-1 text-xs" style={{ color: theme.muted }} numberOfLines={1}>
            {subtitle}
          </TText>
        ) : null}
      </View>
      {selected ? <MaterialCommunityIcons name="check" size={22} color={theme.accent} /> : null}
    </Pressable>
  );
}

function SplitPersonRow({
  label,
  subtitle,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[88px] flex-row items-center gap-5">
      <AvatarCircle label={label} size={54} />
      <View className="flex-1">
        <TText variant="screenTitle" style={{ color: theme.text }}>
          {label}
        </TText>
        {subtitle ? (
          <TText className="mt-1 text-sm" style={{ color: theme.muted }} numberOfLines={1}>
            {subtitle}
          </TText>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={30}
        color={selected ? theme.accent : theme.mutedStrong}
      />
    </Pressable>
  );
}

/**
 * The weighted counterpart to `SplitPersonRow`. The checkbox still decides who
 * is in the split — the field only says how heavily they carry it — so the two
 * rows stay interchangeable as the tab changes under them.
 */
function SplitWeightRow({
  label,
  subtitle,
  selected,
  value,
  prefix,
  suffix,
  placeholder,
  preview,
  onPress,
  onChangeValue,
}: {
  label: string;
  subtitle?: string;
  selected: boolean;
  value: string;
  prefix: string;
  suffix: string;
  placeholder: string;
  preview: string | null;
  onPress: () => void;
  onChangeValue: (value: string) => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View className="min-h-[88px] flex-row items-center gap-4">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`Include ${label} in this split`}
        onPress={() => {
          haptics.select();
          onPress();
        }}
        className="flex-1 flex-row items-center gap-4">
        <AvatarCircle label={label} size={54} />
        <View className="flex-1">
          <TText variant="screenTitle" style={{ color: theme.text }}>
            {label}
          </TText>
          {preview ? (
            <TText className="mt-1 text-base" style={{ color: theme.accent }}>
              {preview}
            </TText>
          ) : subtitle ? (
            <TText className="mt-1 text-sm" style={{ color: theme.muted }} numberOfLines={1}>
              {subtitle}
            </TText>
          ) : null}
        </View>
      </Pressable>
      <View
        className="min-h-12 w-28 flex-row items-center rounded-xl border px-3"
        style={{
          backgroundColor: selected ? theme.card : 'transparent',
          borderColor: selected ? theme.border : theme.border,
          opacity: selected ? 1 : 0.45,
        }}>
        {prefix ? (
          <TText className="mr-1 text-lg" style={{ color: theme.text }}>
            {prefix}
          </TText>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeValue}
          editable={selected}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.mutedStrong}
          accessibilityLabel={`Split value for ${label}`}
          style={{
            flex: 1,
            minHeight: 48,
            textAlign: 'right',
            color: theme.text,
            fontFamily: Fonts.title,
            fontSize: 18,
          }}
        />
        {suffix ? (
          <TText className="ml-1 text-lg" style={{ color: theme.text }}>
            {suffix}
          </TText>
        ) : null}
      </View>
    </View>
  );
}
