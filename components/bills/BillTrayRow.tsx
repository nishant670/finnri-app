import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { TrayRowShell, TraySavedRow, TrayTick } from '@/components/tray/TrayParts';
import { PressableView } from '@/components/ui/PressableView';
import { Shimmer } from '@/components/ui/Shimmer';
import { Motion } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  billAmount,
  billCheckLabel,
  billNeedsAttention,
  shortBillDate,
  type BillItem,
} from '@/lib/bill-batch';
import { formatMoney } from '@/lib/money';

const THUMB_W = 48;
const THUMB_H = 60;
/** The scan line's sweep, one way (board R20-Motion: 1.4 s each way). */
const SCAN_MS = 1400;

type Props = {
  item: BillItem;
  index: number;
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
};

const subtitleFor = (item: BillItem) => {
  const form = item.form;
  if (!form) return '';
  const date = shortBillDate(form.date);
  const paidWith = form.account && form.mode !== 'Cash' ? form.account : form.mode;
  return [form.category, date, paidWith].filter(Boolean).join(' · ');
};

/**
 * One bill in the tray (canvas Round 20, P97–P99). Its states, in order:
 * waiting (dimmed photo, breathing bar), reading (a coral line sweeps the
 * photo), read (the details rise into place), failed (a small shake, and it
 * says it cost nothing), saving, saved (a tick, then the row folds away).
 */
export function BillTrayRow({ item, index, onToggle, onOpen, onRetry, onRemove }: Props) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const scan = useSharedValue(0);
  const shake = useSharedValue(0);

  const reading = item.status === 'reading';
  useEffect(() => {
    if (!reading || motion.reduced) {
      scan.value = 0;
      return;
    }
    scan.value = withRepeat(
      withTiming(1, { duration: SCAN_MS, easing: Easing.bezier(...Motion.ease.standard) }),
      -1,
      true
    );
  }, [motion.reduced, reading, scan]);

  const failed = item.status === 'failed';
  useEffect(() => {
    if (!failed || motion.reduced) return;
    // Three small swings in ~300 ms (board R20-Motion), paced off the press token.
    const step = { duration: motion.duration('instant') / 2 };
    shake.value = withSequence(
      withTiming(-4, step),
      withTiming(4, step),
      withTiming(-4, step),
      withTiming(4, step),
      withTiming(0, step)
    );
  }, [failed, motion, shake]);

  // A bill being read can't be dropped: its read would land on nothing, and
  // Undo would bring it back stuck on "Reading…".
  const canDrop = item.status !== 'reading' && item.status !== 'saving' && item.status !== 'saved';

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scan.value * (THUMB_H - 4) }],
  }));

  const checkLabel = billCheckLabel(item);
  const attention = billNeedsAttention(item);
  const amount = billAmount(item);
  const dimmed = !item.included && item.status === 'read';

  const tick = (
    <TrayTick
      checked={item.included}
      label={`Include ${item.form?.title || `bill ${index + 1}`}`}
      onPress={() => onToggle(item.key)}
    />
  );

  const thumb = (
    <View style={[styles.thumb, { backgroundColor: colors.secondary }]}>
      <Image
        source={{ uri: item.uri }}
        style={[styles.thumbImage, item.status === 'waiting' && styles.waitingImage]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
      {reading ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { backgroundColor: colors.accent, shadowColor: colors.accent },
            scanStyle,
          ]}
        />
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (item.status === 'waiting' || item.status === 'reading') {
    body = (
      <View style={styles.rowInner}>
        <View style={styles.tickSpacer} />
        {thumb}
        <View style={styles.text}>
          <ThemedText variant={reading ? 'bodyStrong' : 'body'} tone={reading ? 'default' : 'muted'}>
            {reading ? 'Reading…' : 'Waiting'}
          </ThemedText>
          <Shimmer width="70%" height={10} radius={5} index={index} />
        </View>
      </View>
    );
  } else if (item.status === 'failed') {
    body = (
      <View style={styles.rowInner}>
        <View style={styles.tickSpacer} />
        {thumb}
        <View style={styles.text}>
          <ThemedText variant="bodyStrong" tone="negative" numberOfLines={2}>
            {item.failure?.title ?? "Couldn't read this one"}
          </ThemedText>
          <ThemedText variant="caption" tone="muted" numberOfLines={2}>
            {item.failure?.message ?? 'No credits used.'}
          </ThemedText>
        </View>
        {item.failure?.retryable !== false ? (
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Retry reading this bill"
            onPress={() => onRetry(item.key)}
            style={styles.textButton}
            pressedStyle={styles.pressed}>
            <ThemedText variant="captionStrong">Retry</ThemedText>
          </PressableView>
        ) : null}
        <PressableView
          accessibilityRole="button"
          accessibilityLabel="Remove this bill"
          onPress={() => onRemove(item.key)}
          style={styles.iconButton}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
        </PressableView>
      </View>
    );
  } else if (item.status === 'saved') {
    body = <TraySavedRow />;
  } else {
    body = (
      <View style={styles.rowInner}>
        {item.status === 'saving' ? (
          <View style={styles.tickTarget}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : (
          tick
        )}
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`${item.form?.title || 'Bill'}, ${formatMoney(amount, { sign: 'never' })}. Open to check or change.`}
          onPress={() => onOpen(item.key)}
          disabled={item.status === 'saving'}
          style={styles.openArea}
          pressedStyle={styles.pressed}>
          {thumb}
          <Animated.View
            entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('base'))}
            style={styles.text}>
            <ThemedText variant="bodyStrong" numberOfLines={1} tone={dimmed ? 'muted' : 'default'}>
              {item.form?.title || 'Bill'}
            </ThemedText>
            <ThemedText variant="caption" tone="muted" numberOfLines={1}>
              {subtitleFor(item)}
            </ThemedText>
            {attention ? (
              <ThemedText variant="captionStrong" tone="negative" numberOfLines={2}>
                {attention}
              </ThemedText>
            ) : item.saveError ? (
              <ThemedText variant="captionStrong" tone="negative" numberOfLines={2}>
                {item.saveError}
              </ThemedText>
            ) : item.duplicate ? (
              <View style={[styles.chip, { backgroundColor: colors.secondary }]}>
                <ThemedText variant="micro">{item.duplicate.label}</ThemedText>
              </View>
            ) : checkLabel ? (
              <View
                style={[
                  styles.chip,
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
            tone={attention ? 'negative' : dimmed ? 'muted' : 'default'}
            style={styles.amount}>
            {amount > 0 ? formatMoney(amount, { sign: 'never' }) : '₹ —'}
          </ThemedText>
        </PressableView>
      </View>
    );
  }

  return (
    <TrayRowShell
      index={index}
      canDrop={canDrop}
      onRemove={() => onRemove(item.key)}
      attention={!!attention}
      nudge={shake}
      style={styles.row}>
      {body}
    </TrayRowShell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 84,
    justifyContent: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 84,
    paddingRight: 8,
  },
  tickSpacer: {
    width: 48,
  },
  tickTarget: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 4,
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 0,
  },
  thumbImage: {
    width: THUMB_W,
    height: THUMB_H,
  },
  waitingImage: {
    opacity: 0.6,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 2,
    height: 3,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingLeft: 12,
  },
  amount: {
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  textButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
