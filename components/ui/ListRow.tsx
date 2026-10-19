import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { mixHex, withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile } from '@/lib/categories';

export type ListRowTone = 'muted' | 'default' | 'negative' | 'warning' | 'positive';

type ListRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** The tile's hue; the tile is a pale wash of it, the glyph the hue itself. */
  hue: string;
  title: string;
  /** The muted line under the title. */
  meta?: string;
  /** Top right, 15/600: the money. */
  amount?: string;
  amountTone?: ListRowTone;
  /** Under the amount: a due date, a status. Red when overdue, amber when it needs action. */
  status?: string;
  statusTone?: ListRowTone;
  onPress?: () => void;
  /** The 1dp rule above the row, inset past the tile (every row in a card but the first). */
  divider?: boolean;
  /** Shows a chevron in place of the amount column, for rows that open a choice. */
  chevron?: boolean;
  /** Anything that belongs under the two lines — a progress bar. */
  children?: ReactNode;
  /** A control at the row's end, outside its press target — a delete button. */
  accessory?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
};

/** Inset of the divider: 14 padding + 36 tile + 12 gap, as on the transaction row. */
const DIVIDER_INSET = 62;

/**
 * The redesign's 60dp row for things that are not transactions — a due date,
 * an account, a budget, a recurring payment (boards R5-*): a 36dp tile, the
 * title and its caption, and the figure with its status on the right.
 */
export function ListRow({
  icon,
  hue,
  title,
  meta,
  amount,
  amountTone = 'default',
  status,
  statusTone = 'muted',
  onPress,
  divider = false,
  chevron = false,
  children,
  accessory,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const theme = useThemeTokens();
  const { colors } = theme;
  const tile = categoryTile({ color: hue, bgColor: mixHex('#FFFFFF', hue, 0.14) }, theme.mode);
  const toneColor = (tone: ListRowTone) =>
    tone === 'muted'
      ? colors.muted
      : tone === 'negative'
        ? colors.negative
        : tone === 'warning'
          ? colors.warning
          : tone === 'positive'
            ? colors.positive
            : colors.text;

  const body = (
    <>
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: tile.background }]}>
          <MaterialCommunityIcons name={icon} size={18} color={tile.foreground} />
        </View>
        <View style={styles.text}>
          <View style={styles.line}>
            <ThemedText numberOfLines={1} style={[styles.title, { color: colors.text }]}>
              {title}
            </ThemedText>
            {amount ? (
              <ThemedText style={[styles.amount, { color: toneColor(amountTone) }]}>{amount}</ThemedText>
            ) : null}
          </View>
          {meta || status ? (
            <View style={styles.line}>
              <ThemedText tone="muted" numberOfLines={1} style={[styles.meta, styles.flex]}>
                {meta}
              </ThemedText>
              {status ? (
                <ThemedText
                  numberOfLines={1}
                  style={[
                    styles.meta,
                    { color: toneColor(statusTone), fontWeight: statusTone === 'muted' ? '400' : '600' },
                  ]}>
                  {status}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          {children}
        </View>
        {chevron ? (
          <MaterialCommunityIcons name="chevron-right" size={18} color={withAlpha(colors.text, 0.6)} />
        ) : null}
      </View>
    </>
  );

  const target = !onPress ? (
    <View testID={testID} accessibilityLabel={accessibilityLabel} style={styles.flex}>
      {body}
    </View>
  ) : (
    <PressableView
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, amount, status].filter(Boolean).join(', ')}
      onPress={onPress}
      style={styles.flex}
      pressedStyle={styles.pressed}>
      {body}
    </PressableView>
  );

  return (
    <View>
      {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
      {accessory ? (
        <View style={styles.withAccessory}>
          {target}
          {accessory}
        </View>
      ) : (
        target
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginLeft: DIVIDER_INSET,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  amount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
  withAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});
