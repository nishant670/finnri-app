import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getAccountVisual } from '@/lib/account-display';
import { normalizeAccountType, type Account, type AccountType } from '@/lib/accounts';

type AccountGroup = { key: string; label: string; types: AccountType[] };

/** Board R3-FilterAccount: cards first, since that is most of most people's list. */
const ACCOUNT_GROUPS: AccountGroup[] = [
  { key: 'cards', label: 'Cards', types: ['credit_card', 'debit_card'] },
  { key: 'bank', label: 'Bank and cash', types: ['bank', 'cash'] },
  { key: 'wallets', label: 'Wallets and UPI', types: ['wallet', 'upi', 'other'] },
];

type AccountFilterPickerProps = {
  visible: boolean;
  accounts: Account[];
  selectedId: number | null;
  onSelect: (accountId: number | null) => void;
  onClose: () => void;
};

/**
 * The Account filter's own picker (board R3-FilterAccount).
 *
 * It replaced a wall of account chips inside the filter sheet. Seventeen
 * accounts drawn as chips filled the screen, and every one wore a bank icon
 * unless it was a credit card — Cash, Sodexo and PhonePe included. Here they
 * are grouped by kind, searchable, and each wears its own type's icon.
 */
export function AccountFilterPicker({
  visible,
  accounts,
  selectedId,
  onSelect,
  onClose,
}: AccountFilterPickerProps) {
  const { colors } = useThemeTokens();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? accounts.filter((account) =>
          [account.name, account.provider].some((text) => text?.toLowerCase().includes(needle))
        )
      : accounts;
    return ACCOUNT_GROUPS.map((group) => ({
      ...group,
      accounts: matching.filter((account) =>
        group.types.includes(normalizeAccountType(account.type))
      ),
    })).filter((group) => group.accounts.length > 0);
  }, [accounts, query]);

  const choose = (accountId: number | null) => {
    onSelect(accountId);
    setQuery('');
  };

  const close = () => {
    onClose();
    setQuery('');
  };

  const renderRow = ({
    key,
    label,
    selected,
    icon,
    iconColor,
    onPress,
    testID,
  }: {
    key: string;
    label: string;
    selected: boolean;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    iconColor?: string;
    onPress: () => void;
    testID: string;
  }) => (
    <PressableView
      key={key}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected && { backgroundColor: colors.selectedFill }]}
      pressedStyle={styles.pressed}>
      {icon ? (
        <MaterialCommunityIcons name={icon} size={18} color={iconColor ?? colors.text} />
      ) : (
        <View style={styles.iconSpace} />
      )}
      <ThemedText
        numberOfLines={1}
        style={[styles.rowLabel, { color: colors.text, fontWeight: selected ? '700' : '400' }]}>
        {label}
      </ThemedText>
      {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.text} /> : null}
    </PressableView>
  );

  return (
    <PickerSheet visible={visible} title="Account" onClose={close} maxBodyHeight={560} avoidKeyboard>
      <View style={[styles.search, { backgroundColor: colors.track }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
        <TextInput
          testID="filter-account-search"
          accessibilityLabel="Search accounts"
          value={query}
          onChangeText={setQuery}
          placeholder="Search accounts"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Account">
        {query.trim()
          ? null
          : renderRow({
              key: 'any',
              label: 'Any account',
              selected: selectedId === null,
              onPress: () => choose(null),
              testID: 'filter-account-any',
            })}
        {groups.map((group) => (
          <View key={group.key}>
            <ThemedText tone="muted" style={styles.groupLabel}>
              {`${group.label} · ${group.accounts.length}`}
            </ThemedText>
            {group.accounts.map((account) => {
              const visual = getAccountVisual(account);
              return renderRow({
                key: String(account.id),
                label: account.name,
                selected: selectedId === account.id,
                icon: visual.icon,
                iconColor: visual.color,
                onPress: () => choose(account.id),
                testID: `filter-account-${account.id}`,
              });
            })}
          </View>
        ))}
        {groups.length === 0 ? (
          <ThemedText tone="muted" style={styles.empty}>
            {accounts.length === 0 ? 'No accounts yet.' : 'No account matches that.'}
          </ThemedText>
        ) : null}
      </View>
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  iconSpace: {
    width: 18,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  groupLabel: {
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 12,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
