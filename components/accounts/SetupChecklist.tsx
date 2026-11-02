import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { AccountSetupItem } from '@/lib/account-display';

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
  style,
}: {
  title: string;
  items: AccountSetupItem[];
  /** Opens where the detail can be filled in. */
  onAdd: (item: AccountSetupItem) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeTokens();
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
          {item.complete ? null : (
            <PressableView
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.label.toLowerCase()}`}
              onPress={() => onAdd(item)}
              style={[styles.add, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
              pressedStyle={styles.pressed}>
              <ThemedText style={[styles.addLabel, { color: colors.text }]}>Add</ThemedText>
            </PressableView>
          )}
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
