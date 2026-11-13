import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { AccountType, CreditKind } from '@/lib/accounts';
import { typeOptions, type ACCOUNT_DETAIL_COPY, type ProviderOption } from '@/lib/account-form';
import { styles as formStyles } from './account-form-styles';

type TypeChip = { type: AccountType; creditKind?: CreditKind; label: string };

/** The types most accounts are, in one row (board R16-Account-A). */
const MAIN_CHIPS: TypeChip[] = [
  { type: 'bank', label: 'Bank' },
  { type: 'credit_card', label: 'Credit card' },
  { type: 'upi', label: 'UPI' },
  { type: 'wallet', label: 'Wallet' },
  { type: 'cash', label: 'Cash' },
];
const MORE_CHIPS: TypeChip[] = [
  { type: 'debit_card', label: 'Debit card' },
  { type: 'credit_card', creditKind: 'pay_later', label: 'Pay later' },
  { type: 'other', label: 'Other' },
];

const chipId = ({ type, creditKind }: TypeChip) => creditKind || type;

export function AccountTypeChips({
  selectedType,
  creditKind,
  typeError,
  onSelect,
}: {
  selectedType: AccountType;
  creditKind: CreditKind;
  typeError: string | null;
  onSelect: (type: AccountType, kind: CreditKind) => void;
}) {
  const theme = useThemeTokens().colors;
  const [moreOpened, setMoreOpened] = useState(false);
  const rowRef = useRef<ScrollView>(null);
  const revealMore = useRef(false);

  const isSelected = (chip: TypeChip) =>
    chip.type === selectedType && (chip.creditKind ?? '') === creditKind;
  // An account being edited can already be one of the types behind More.
  const showMore = moreOpened || MORE_CHIPS.some(isSelected);

  const chip = (item: TypeChip, inMore: boolean) => {
    const selected = isSelected(item);
    const option = typeOptions.find(
      (candidate) =>
        candidate.key === item.type && (candidate.creditKind ?? '') === (item.creditKind ?? '')
    );
    if (!option) return null;
    return (
      <PressableView
        key={chipId(item)}
        testID={`account-type-${chipId(item)}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onLayout={
          selected && inMore
            ? (event) =>
                rowRef.current?.scrollTo({
                  x: Math.max(0, event.nativeEvent.layout.x - 24),
                  animated: false,
                })
            : undefined
        }
        onPress={() => {
          if (inMore) setMoreOpened(true);
          onSelect(item.type, item.creditKind ?? '');
        }}
        style={[
          sheetStyles.chip,
          {
            backgroundColor: selected ? theme.selectedFill : theme.card,
            borderColor: selected ? theme.selectedBorder : theme.border,
          },
        ]}
        pressedStyle={sheetStyles.pressed}>
        <ThemedText
          style={[sheetStyles.chipLabel, { color: theme.text, fontWeight: selected ? '700' : '500' }]}>
          {item.label}
        </ThemedText>
      </PressableView>
    );
  };

  return (
    <View>
      <ThemedText style={[sheetStyles.label, { color: theme.text }]}>What is it?</ThemedText>
      <ScrollView
        ref={rowRef}
        horizontal
        accessibilityRole="radiogroup"
        accessibilityLabel="Account type"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sheetStyles.chips}
        onContentSizeChange={() => {
          if (!revealMore.current) return;
          revealMore.current = false;
          rowRef.current?.scrollToEnd({ animated: true });
        }}>
        {MAIN_CHIPS.map((item) => chip(item, false))}
        {showMore ? (
          MORE_CHIPS.map((item) => chip(item, true))
        ) : (
          <PressableView
            testID="account-type-more"
            accessibilityRole="button"
            accessibilityLabel="More account types"
            onPress={() => {
              revealMore.current = true;
              setMoreOpened(true);
            }}
            style={[sheetStyles.chip, { backgroundColor: theme.card, borderColor: theme.border }]}
            pressedStyle={sheetStyles.pressed}>
            <ThemedText style={[sheetStyles.chipLabel, { color: theme.text, fontWeight: '500' }]}>
              More
            </ThemedText>
          </PressableView>
        )}
      </ScrollView>
      {typeError ? <ThemedText style={formStyles.errorText}>{typeError}</ThemedText> : null}
    </View>
  );
}

type AccountIdentityFieldsProps = {
  detailCopy: (typeof ACCOUNT_DETAIL_COPY)[AccountType];
  /** What the name's helper line calls this account. */
  noun: string;
  filteredIssuers: ProviderOption[];
  issuerIcon?: ProviderOption['icon'];
  issuerQuery: string;
  last4: string;
  name: string;
  /** The name is still Finnri's suggestion, so the field says so. */
  nameIsSuggested: boolean;
  onChangeName: (value: string) => void;
  selectProvider: (provider: ProviderOption) => void;
  setIssuerQuery: Dispatch<SetStateAction<string>>;
  setSelectedIssuer: Dispatch<SetStateAction<ProviderOption | null>>;
  setShowIssuerResults: Dispatch<SetStateAction<boolean>>;
  showIssuerResults: boolean;
  isDigitsIdentifier: boolean;
  updateIdentifier: (value: string) => void;
  /** A credit card's product step, between the bank and the last 4 digits. */
  afterProvider?: ReactNode;
  /** A credit card's network, after its last 4 digits. */
  afterIdentifier?: ReactNode;
};

/**
 * What tells this account apart, each field under its own label: which one it
 * is, its last digits, then the name, which fills itself in from those two.
 * The name used to sit straight under the type chips with no label, and read
 * as part of them.
 */
export function AccountIdentityFields({
  detailCopy,
  noun,
  filteredIssuers,
  issuerIcon,
  issuerQuery,
  last4,
  name,
  nameIsSuggested,
  onChangeName,
  selectProvider,
  setIssuerQuery,
  setSelectedIssuer,
  setShowIssuerResults,
  showIssuerResults,
  isDigitsIdentifier,
  updateIdentifier,
  afterProvider,
  afterIdentifier,
}: AccountIdentityFieldsProps) {
  const theme = useThemeTokens().colors;
  const fieldColors = { backgroundColor: theme.card, borderColor: theme.border };
  const closeIssuers = () => setShowIssuerResults(false);

  return (
    <View>
      {detailCopy.providerQuestion ? (
        <View style={sheetStyles.field}>
          <ThemedText style={[sheetStyles.label, { color: theme.text }]}>
            {detailCopy.providerQuestion}
          </ThemedText>
          <View style={[sheetStyles.input, sheetStyles.inputRow, fieldColors]}>
            {issuerIcon ? (
              <MaterialCommunityIcons name={issuerIcon} size={20} color={theme.text} />
            ) : null}
            <TextInput
              accessibilityLabel={detailCopy.providerQuestion}
              value={issuerQuery}
              onChangeText={(text) => {
                setIssuerQuery(text);
                setSelectedIssuer(null);
                setShowIssuerResults(true);
              }}
              onFocus={() => setShowIssuerResults(true)}
              placeholder={detailCopy.providerPlaceholder}
              placeholderTextColor={theme.muted}
              style={[sheetStyles.inputText, { color: theme.text }]}
            />
            <PressableView
              accessibilityRole="button"
              accessibilityLabel={showIssuerResults ? 'Hide the list' : 'Show the list'}
              accessibilityState={{ expanded: showIssuerResults }}
              hitSlop={12}
              onPress={() => setShowIssuerResults((open) => !open)}
              pressedStyle={sheetStyles.pressed}>
              <MaterialCommunityIcons
                name={showIssuerResults ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={withAlpha(theme.text, 0.6)}
              />
            </PressableView>
          </View>
          {showIssuerResults && filteredIssuers.length > 0 ? (
            <View style={[sheetStyles.results, fieldColors]}>
              {filteredIssuers.map((item, index) => (
                <PressableView
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => selectProvider(item)}
                  style={[
                    sheetStyles.result,
                    index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  ]}
                  pressedStyle={sheetStyles.pressed}>
                  <MaterialCommunityIcons name={item.icon} size={18} color={theme.text} />
                  <ThemedText numberOfLines={1} style={[sheetStyles.resultText, { color: theme.text }]}>
                    {item.name}
                  </ThemedText>
                </PressableView>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {afterProvider}

      {detailCopy.identifierLabel ? (
        <View style={sheetStyles.field}>
          <ThemedText style={[sheetStyles.label, { color: theme.text }]}>
            {detailCopy.identifierLabel}
          </ThemedText>
          <TextInput
            accessibilityLabel={detailCopy.identifierLabel}
            value={last4}
            onChangeText={updateIdentifier}
            onFocus={closeIssuers}
            placeholder={detailCopy.identifierPlaceholder}
            placeholderTextColor={theme.muted}
            keyboardType={isDigitsIdentifier ? 'number-pad' : 'default'}
            autoCapitalize="none"
            style={[sheetStyles.input, sheetStyles.inputText, fieldColors, { color: theme.text }]}
          />
        </View>
      ) : null}

      {afterIdentifier}

      <View style={sheetStyles.field}>
        <ThemedText style={[sheetStyles.label, { color: theme.text }]}>Name</ThemedText>
        <TextInput
          accessibilityLabel="Account name"
          value={name}
          onChangeText={onChangeName}
          onFocus={closeIssuers}
          selectTextOnFocus={nameIsSuggested}
          placeholder="Salary account"
          placeholderTextColor={theme.muted}
          style={[sheetStyles.input, sheetStyles.inputText, fieldColors, { color: theme.text }]}
        />
        {nameIsSuggested ? (
          <ThemedText tone="muted" style={sheetStyles.helper}>
            {`Filled in for you. Change it to what you call this ${noun}.`}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  field: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 20,
  },
  chipLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputText: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 16,
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginHorizontal: 2,
  },
  results: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  result: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  resultText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
