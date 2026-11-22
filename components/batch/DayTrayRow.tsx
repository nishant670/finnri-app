import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { TrayRowShell, TraySavedRow, TrayTick, trayStyles } from '@/components/tray/TrayParts';
import { PressableView } from '@/components/ui/PressableView';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import type { TimeSlot } from '@/lib/parse';
import {
  SLOT_LABELS,
  isIncome,
  itemAmount,
  itemCheckLabel,
  itemNeedsAttention,
  paidWithLabel,
  tileTimeLabel,
  type DayItem,
} from '@/lib/voice-batch';

const TILE_W = 48;
const TILE_H = 56;

/** Each part of the day keeps one tint, in both themes (board R21-Tray, R21-Dark). */
const SLOT_TINTS: Record<TimeSlot, { light: string; dark: string }> = {
  morning: { light: '#FFF1D6', dark: '#3A3122' },
  afternoon: { light: '#FFE8E5', dark: '#3A2C28' },
  evening: { light: '#F6E3EC', dark: '#352830' },
  night: { light: '#E7E6F3', dark: '#2A2A3A' },
};

const SLOT_ICONS: Record<TimeSlot, keyof typeof MaterialCommunityIcons.glyphMap> = {
  morning: 'weather-sunset-up',
  afternoon: 'white-balance-sunny',
  evening: 'weather-sunset-down',
  night: 'weather-night',
};

/** The time tile that sits where a bill row shows its photo (P110). */
export function TimeTile({ slot, label, dimmed }: { slot: TimeSlot | null; label: string; dimmed?: boolean }) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const tint = slot ? SLOT_TINTS[slot][theme.mode === 'dark' ? 'dark' : 'light'] : colors.secondary;
  return (
    <View
      accessibilityLabel={[slot ? SLOT_LABELS[slot] : null, label].filter(Boolean).join(', ')}
      style={[styles.tile, { backgroundColor: tint }, dimmed && styles.dimmed]}>
      <MaterialCommunityIcons name={slot ? SLOT_ICONS[slot] : 'clock-outline'} size={18} color={colors.text} />
      {label ? (
        <ThemedText variant="micro" style={styles.tileLabel} numberOfLines={1}>
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

type Props = {
  item: DayItem;
  index: number;
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onRemove: (key: string) => void;
};

/**
 * One spoken expense in the day tray (canvas Round 21, P110): the bill row's
 * shell with a time tile instead of the photo. Income reads in green with +.
 */
export function DayTrayRow({ item, index, onToggle, onOpen, onRemove }: Props) {
  const { colors } = useThemeTokens();
  const motion = useMotion();

  if (item.status === 'saved') {
    return (
      <TrayRowShell index={index} canDrop={false} onRemove={() => undefined}>
        <TraySavedRow />
      </TrayRowShell>
    );
  }

  const attention = itemNeedsAttention(item);
  const checkLabel = itemCheckLabel(item);
  const amount = itemAmount(item);
  const income = isIncome(item);
  const dimmed = !item.included;
  const title = item.form.title.trim() || (income ? 'Income' : 'Expense');
  const subtitle = [item.form.category, paidWithLabel(item)].filter(Boolean).join(' · ');
  const amountLabel = amount > 0 ? `${income ? '+' : ''}${formatMoney(amount, { sign: 'never' })}` : '₹ —';

  return (
    <TrayRowShell
      index={index}
      canDrop={item.status === 'ready'}
      onRemove={() => onRemove(item.key)}
      attention={!!attention}>
      <View style={trayStyles.rowInner}>
        {item.status === 'saving' ? (
          <View style={styles.tickTarget}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : (
          <TrayTick checked={item.included} label={`Include ${title}`} onPress={() => onToggle(item.key)} />
        )}
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${amountLabel}. Open to check or change.`}
          onPress={() => onOpen(item.key)}
          disabled={item.status === 'saving'}
          style={trayStyles.openArea}
          pressedStyle={trayStyles.pressed}>
          <TimeTile slot={item.slot} label={tileTimeLabel(item.form)} dimmed={dimmed} />
          <Animated.View
            entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}
            style={trayStyles.rowText}>
            <ThemedText variant="bodyStrong" numberOfLines={1} tone={dimmed ? 'muted' : 'default'}>
              {title}
            </ThemedText>
            {attention ? (
              <ThemedText variant="captionStrong" tone="negative" numberOfLines={2}>
                {attention}
              </ThemedText>
            ) : (
              <ThemedText variant="caption" tone="muted" numberOfLines={1}>
                {subtitle}
              </ThemedText>
            )}
            {attention ? null : item.saveError ? (
              <ThemedText variant="captionStrong" tone="negative" numberOfLines={2}>
                {item.saveError}
              </ThemedText>
            ) : item.duplicate ? (
              <View style={[trayStyles.chip, { backgroundColor: colors.secondary }]}>
                <ThemedText variant="micro">{item.duplicate.label}</ThemedText>
              </View>
            ) : checkLabel ? (
              <View
                style={[
                  trayStyles.chip,
                  { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder, borderWidth: 1 },
                ]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={12} color={colors.warning} />
                <ThemedText variant="micro" tone="warning">
                  {checkLabel}
                </ThemedText>
              </View>
            ) : null}
          </Animated.View>
          <ThemedText
            variant="bodyStrong"
            tone={attention ? 'negative' : dimmed ? 'muted' : income ? 'positive' : 'default'}
            style={trayStyles.amount}>
            {amountLabel}
          </ThemedText>
        </PressableView>
      </View>
    </TrayRowShell>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tileLabel: { fontWeight: '700', fontSize: 10, lineHeight: 12 },
  dimmed: { opacity: 0.6 },
  tickTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
