import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { Fonts, mixHex, withAlpha } from '@/constants/theme';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import type { AccountSetupItem, SetupInlineField } from '@/lib/account-display';

/**
 * An account's missing details as a checklist (boards R5-AcctCard,
 * R5-AcctBank, R5-AcctAdded): how many are done and a bar for it, then a row
 * per detail — a tick and what was entered, or a dashed ring, what adding it
 * gets you, and Add.
 */
export function SetupChecklist({
  title,
  items,
  onAdd,
  inlineFieldFor,
  onSaveInline,
  style,
}: {
  title: string;
  items: AccountSetupItem[];
  /** Opens where the detail can be filled in, for a detail with no inline field. */
  onAdd: (item: AccountSetupItem) => void;
  /**
   * P62: the field a row opens into, so the detail is filled in where it is
   * listed. Null sends the row to `onAdd`.
   */
  inlineFieldFor?: (item: AccountSetupItem) => SetupInlineField | null;
  onSaveInline?: (item: AccountSetupItem, value: string) => Promise<void>;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeTokens();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRow = (item: AccountSetupItem) => {
    const field = inlineFieldFor?.(item);
    if (!field || !onSaveInline) {
      onAdd(item);
      return;
    }
    setOpenKey(item.key);
    setValue('');
    setError(null);
  };

  const save = async (item: AccountSetupItem, field: SetupInlineField) => {
    const problem = field.validate(value);
    if (problem) {
      setError(problem);
      return;
    }
    if (!onSaveInline || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveInline(item, value);
      setOpenKey(null);
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, 'Could not save that. Try again.'));
    } finally {
      setSaving(false);
    }
  };
  const done = items.filter((item) => item.complete).length;
  const fraction = items.length > 0 ? done / items.length : 0;

  return (
    <View
      accessibilityLabel={`${title}. ${done} of ${items.length} done`}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <View style={styles.head}>
        <View style={styles.headRow}>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
          <ThemedText tone="muted" style={styles.count}>
            {done} of {items.length} done
          </ThemedText>
        </View>
        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: colors.positive }]} />
        </View>
      </View>
      {items.map((item, index) => (
        <View key={item.key} style={styles.row}>
          {index > 0 ? <View style={[styles.rule, { backgroundColor: colors.border }]} /> : null}
          {item.complete ? (
            <View style={[styles.mark, { backgroundColor: withAlpha(colors.positive, 0.14) }]}>
              <MaterialCommunityIcons name="check" size={16} color={colors.positive} />
            </View>
          ) : (
            <View style={[styles.mark, styles.markOpen, { borderColor: colors.borderStrong }]} />
          )}
          <View style={styles.text}>
            <ThemedText style={[styles.label, { color: colors.text }]}>{item.label}</ThemedText>
            <ThemedText tone="muted" numberOfLines={2} style={styles.detail}>
              {item.detail}
            </ThemedText>
          </View>
          {item.complete || openKey === item.key ? null : (
            <PressableView
              testID={`setup-add-${item.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.label.toLowerCase()}`}
              onPress={() => openRow(item)}
              style={[styles.add, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.addLabel, { color: colors.text }]}>Add</ThemedText>
            </PressableView>
          )}
          {openKey === item.key && inlineFieldFor?.(item) ? (
            <InlineField
              field={inlineFieldFor(item)!}
              label={item.label}
              value={value}
              onChange={(next) => {
                setValue(next);
                if (error) setError(null);
              }}
              error={error}
              saving={saving}
              onSave={() => void save(item, inlineFieldFor(item)!)}
              onCancel={() => setOpenKey(null)}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  head: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
  },
  track: {
    height: 6,
    marginTop: 8,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    // An opened row's field wraps onto its own line under the label.
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
  },
  rule: {
    position: 'absolute',
    top: 0,
    left: 54,
    right: 0,
    height: 1,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOpen: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  add: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  addLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});

/** A setup row opened into its field: what to enter, Save, and Cancel (P62). */
function InlineField({
  field,
  label,
  value,
  onChange,
  error,
  saving,
  onSave,
  onCancel,
}: {
  field: SetupInlineField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View testID="setup-inline-field" style={inlineStyles.wrap}>
      <View style={inlineStyles.line}>
        <View style={[inlineStyles.field, { backgroundColor: mixHex(colors.card, colors.track, 0.6) }]}>
          {field.prefix ? (
            <ThemedText tone="muted" style={inlineStyles.prefix}>
              {field.prefix}
            </ThemedText>
          ) : null}
          <TextInput
            accessibilityLabel={label}
            autoFocus
            value={value}
            onChangeText={onChange}
            onSubmitEditing={onSave}
            placeholder={field.placeholder}
            placeholderTextColor={colors.muted}
            keyboardType={field.keyboard === 'number' ? 'decimal-pad' : 'default'}
            autoCapitalize="none"
            returnKeyType="done"
            editable={!saving}
            style={[inlineStyles.input, { color: colors.text, fontFamily: Fonts.body }]}
          />
        </View>
        <Button label="Save" height={40} loading={saving} onPress={onSave} />
      </View>
      {error ? (
        <ThemedText tone="negative" style={inlineStyles.error}>
          {error}
        </ThemedText>
      ) : null}
      <PressableView accessibilityRole="button" onPress={onCancel} hitSlop={8} style={inlineStyles.cancel}>
        <ThemedText tone="muted" style={inlineStyles.cancelLabel}>
          Cancel
        </ThemedText>
      </PressableView>
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 6,
    paddingTop: 8,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  field: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  prefix: {
    fontSize: 15,
    lineHeight: 20,
  },
  input: {
    flex: 1,
    height: 40,
    padding: 0,
    fontSize: 15,
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
  },
  cancel: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
