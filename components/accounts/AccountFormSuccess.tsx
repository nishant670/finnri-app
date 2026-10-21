import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SetupChecklist } from '@/components/accounts/SetupChecklist';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getAccountSetupItems } from '@/lib/account-display';
import { typeOptions } from '@/lib/account-form';
import { Account, normalizeAccountType, type AccountType } from '@/lib/accounts';

type AccountFormSuccessProps = {
  createdAccount: Account | null;
  handleSetCreatedDefault: () => Promise<void>;
  isSaving: boolean;
  name: string;
  resetNewAccountForm: () => void;
  saveError: string | null;
  selectedType: AccountType;
};

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four'];

/**
 * The step after an account is saved (board R5-AcctAdded): what was added,
 * the details still worth filling in, whether it is the default, and where to
 * go next. Its buttons were a hard-coded purple in every mood, with white text
 * on the orange one; they are the app's primary and outline buttons now.
 */
export function AccountFormSuccess({
  createdAccount,
  handleSetCreatedDefault,
  isSaving,
  name,
  resetNewAccountForm,
  saveError,
  selectedType,
}: AccountFormSuccessProps) {
  const { colors } = useThemeTokens();
  const accountType = normalizeAccountType(createdAccount?.type ?? selectedType);
  const accountName = createdAccount?.name ?? name.trim();
  const visual = typeOptions.find((option) => option.key === accountType) ?? typeOptions[6];
  const setupItems = createdAccount ? getAccountSetupItems(createdAccount) : [];
  const missing = setupItems.filter((item) => !item.complete).length;

  return (
    <>
      <View style={styles.header}>
        <PressableView
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={styles.close}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="close" size={22} color={colors.text} />
        </PressableView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View>
            <View style={[styles.tile, { backgroundColor: visual.bgColor }]}>
              <MaterialCommunityIcons name={visual.icon} size={30} color={visual.color} />
            </View>
            <View style={[styles.badge, { backgroundColor: colors.positive, borderColor: colors.background }]}>
              <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
            </View>
          </View>
          <ThemedText accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: colors.text }]}>
            {`${accountName} added`}
          </ThemedText>
          <ThemedText tone="muted" style={styles.lede}>
            Finnri will use it whenever a payment matches.
          </ThemedText>
        </View>

        {createdAccount && missing > 0 ? (
          <SetupChecklist
            title={`${COUNT_WORDS[missing] ?? missing} detail${missing === 1 ? '' : 's'} left`}
            items={setupItems}
            onAdd={() =>
              router.replace({
                pathname: '/accounts/manage',
                params: { id: String(createdAccount.id), focus: 'details' },
              })
            }
            style={styles.block}
          />
        ) : null}

        {createdAccount ? (
          <View style={[styles.card, styles.gap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingsRow
              icon="star-outline"
              title="Make it my default account"
              subtitle={
                createdAccount.is_default
                  ? 'Used first when a payment could match more than one. Make another account the default to change it.'
                  : 'Used first when a payment could match more than one'
              }
              accessory={
                <HapticSwitch
                  value={Boolean(createdAccount.is_default)}
                  // Only ever turned on here: an account stops being the
                  // default when another one becomes it.
                  disabled={isSaving || Boolean(createdAccount.is_default)}
                  onValueChange={(on) => {
                    if (on) void handleSetCreatedDefault();
                  }}
                  accessibilityLabel="Make it my default account"
                />
              }
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        {saveError ? (
          <ThemedText tone="negative" style={styles.error}>
            {saveError}
          </ThemedText>
        ) : null}
        {createdAccount ? (
          <PrimaryButton
            label="View account"
            height={50}
            onPress={() =>
              router.replace({
                pathname: '/accounts/[id]',
                params: { id: String(createdAccount.id) },
              })
            }
          />
        ) : null}
        <Button variant="outline" label="Add another account" height={48} onPress={resetNewAccountForm} />
        <PressableView
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.done}
          pressedStyle={styles.pressed}>
          <ThemedText style={[styles.doneLabel, { color: colors.text }]}>Done</ThemedText>
        </PressableView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  hero: {
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 8,
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 18,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  lede: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  block: {
    marginTop: 28,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gap: {
    marginTop: 12,
  },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  done: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
