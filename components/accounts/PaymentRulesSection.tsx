import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';
import {
  PAYMENT_RULE_PRESETS,
  deletePaymentRule,
  listPaymentRules,
  savePaymentRule,
  type PaymentRule,
} from '@/lib/payment-rules';

const phraseKey = (phrase: string) => phrase.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * "Use this card for…": phrases that pre-fill this account on a new expense
 * the bill or sentence did not say how it was paid for. A preset is a spend
 * family the API knows, so "Fuel" also covers petrol, diesel and the pumps.
 *
 * One phrase belongs to one account; adding a phrase another account has
 * asks before moving it here.
 */
export function PaymentRulesSection({
  token,
  account,
  accounts,
  usedNoun,
}: {
  token: string | null | undefined;
  account: Account;
  /** Every account, to name the one a phrase would move from. */
  accounts: Account[];
  usedNoun: string;
}) {
  const { colors: theme } = useThemeTokens();
  const dialog = useAppDialog();
  const [rules, setRules] = useState<PaymentRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setRules(await listPaymentRules(token));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load these.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(
    () => (rules ?? []).filter((rule) => rule.account_id === account.id),
    [account.id, rules]
  );
  const presets = useMemo(
    () =>
      PAYMENT_RULE_PRESETS.filter(
        (preset) => !mine.some((rule) => phraseKey(rule.phrase) === phraseKey(preset))
      ),
    [mine]
  );

  const add = async (phrase: string) => {
    const trimmed = phrase.trim().replace(/\s+/g, ' ');
    if (!token || !trimmed || busy) return;
    const elsewhere = (rules ?? []).find(
      (rule) => phraseKey(rule.phrase) === phraseKey(trimmed) && rule.account_id !== account.id
    );
    if (elsewhere) {
      const from = accounts.find((item) => item.id === elsewhere.account_id)?.name ?? 'another account';
      const move = await dialog.confirm({
        title: `Move "${elsewhere.phrase}" here?`,
        message: `${from} is used for ${elsewhere.phrase} now. One account per phrase, so it would start on ${account.name} instead.`,
        confirmLabel: 'Move it',
        cancelLabel: 'Keep it',
        iconName: 'swap-horizontal',
      });
      if (!move) return;
    }
    setBusy(true);
    try {
      await savePaymentRule(token, account.id, trimmed);
      setDraft('');
      setAdding(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rule: PaymentRule) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      await deletePaymentRule(token, rule.id);
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove that.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) return null;

  return (
    <View
      testID="payment-rules-section"
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText tone="muted" style={styles.caption}>
        New expenses that mention these start on this {usedNoun} when the bill doesn&apos;t say
        how you paid. You can still change it each time.
      </ThemedText>

      {rules === null && !error ? (
        <ActivityIndicator style={styles.loading} color={theme.muted} />
      ) : (
        <View style={styles.chips}>
          {mine.map((rule) => (
            <PressableView
              key={rule.id}
              testID={`payment-rule-${rule.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${rule.phrase}`}
              disabled={busy}
              onPress={() => void remove(rule)}
              style={[styles.chip, { backgroundColor: theme.selectedFill, borderColor: theme.selectedBorder }]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.chipLabel, { color: theme.text }]}>{rule.phrase}</ThemedText>
              <MaterialCommunityIcons name="close" size={14} color={theme.text} />
            </PressableView>
          ))}
          {presets.map((preset) => (
            <PressableView
              key={preset}
              testID={`payment-rule-preset-${phraseKey(preset).replace(/ /g, '-')}`}
              accessibilityRole="button"
              accessibilityLabel={`Use for ${preset}`}
              disabled={busy}
              onPress={() => void add(preset)}
              style={[styles.chip, styles.dashed, { borderColor: theme.border }]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name="plus" size={14} color={theme.muted} />
              <ThemedText tone="muted" style={styles.chipLabel}>
                {preset}
              </ThemedText>
            </PressableView>
          ))}
          {!adding ? (
            <PressableView
              testID="payment-rule-add"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setAdding(true)}
              style={[styles.chip, styles.dashed, { borderColor: theme.border }]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name="plus" size={14} color={theme.muted} />
              <ThemedText tone="muted" style={styles.chipLabel}>
                Your own
              </ThemedText>
            </PressableView>
          ) : null}
        </View>
      )}

      {adding ? (
        <View style={[styles.inputRow, { borderColor: theme.border }]}>
          <TextInput
            testID="payment-rule-input"
            autoFocus
            value={draft}
            onChangeText={setDraft}
            maxLength={40}
            placeholder="A word or shop, e.g. Swiggy"
            placeholderTextColor={theme.muted}
            returnKeyType="done"
            onSubmitEditing={() => void add(draft)}
            style={[styles.input, { color: theme.text }]}
          />
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Add"
            disabled={busy || !draft.trim()}
            onPress={() => void add(draft)}
            style={styles.inputAction}
            pressedStyle={styles.pressed}>
            <ThemedText style={[styles.inputActionLabel, { color: draft.trim() ? theme.accent : theme.muted }]}>
              Add
            </ThemedText>
          </PressableView>
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => {
              setAdding(false);
              setDraft('');
            }}
            style={styles.inputAction}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="close" size={18} color={theme.muted} />
          </PressableView>
        </View>
      ) : null}

      {error ? (
        <ThemedText tone="negative" style={styles.caption}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  loading: {
    alignSelf: 'flex-start',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  dashed: {
    borderStyle: 'dashed',
  },
  chipLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  inputAction: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inputActionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
