import { ThemedText } from '@/components/themed-text';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { getMoodIconName } from '@/constants/theme';
import { formatMoney } from '@/lib/money';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '@/hooks/use-motion';
import { measureFrame, type Frame } from '@/hooks/use-shared-element';
import { haptics } from '@/lib/haptics';

/**
 * A freshly saved row announces itself once.
 *
 * Before this, the sheet vanished and the row was simply *there* — the user had
 * to find it to know the save had worked, on a screen where every row looks
 * like every other row. It now expands from 0.94 with an accent wash behind it
 * that drains away, so the eye is taken to the right row and then left alone.
 *
 * ## Two entrances, and a row never plays both
 *
 * The list entrance (`entranceIndex`) and the saved-row entrance (`isNew`) look
 * alike and mean opposite things: one says "this is the feed filling in", the
 * other says "this is the thing you just did". A saved row mounts into the feed
 * and would otherwise qualify for both, so `isNew` wins — the specific
 * announcement beats the general one, and doubling them up would have the row
 * scale, slide, fade and wash all at once.
 *
 * They also live on separate views. `entering` is applied by Reanimated's
 * layout manager to the same opacity and transform an `useAnimatedStyle` writes
 * to, so the two fight for the property if they share a node.
 *
 * ## The swipe, and why it lives in here
 *
 * Editing or forgetting a transaction used to cost a navigation into detail, a
 * scroll to the bottom, a tap and a confirm dialog — four screens' worth of
 * intent for "that was wrong". The row now hands both over to a thumb.
 *
 * It is built here rather than as a wrapper the list puts around each row,
 * because the reveal has to be clipped to the row's own box and the row is the
 * only thing that knows where that box is: the card variant carries a 12px gap
 * to the next row *inside itself*, so a wrapper would have to be told about it
 * and the two would drift. `CARD_GAP` is read by the card's margin and by the
 * action panel's inset, and there is one of it.
 *
 * The clip is only on while there is something to clip. `overflow: hidden` also
 * cuts the card's shadow, and a list of shadowless cards is a worse trade than
 * a `useState` flip on touch-down — so `engaged` turns the clip on when a finger
 * lands and off again when the row settles back closed.
 */

/** Where the row starts, per the spec. */
const NEW_ROW_FROM_SCALE = 0.94;

/**
 * How long the accent tint takes to drain. Deliberately far slower than any
 * `Motion` duration: those describe how quickly the app answers a touch, and
 * this is a marker being allowed to fade rather than a response. Matching it to
 * `sheet` would read as a flash.
 */
const HIGHLIGHT_FADE_MS = 600;

/** Peak strength of the accent wash, before it fades to nothing. */
const HIGHLIGHT_OPACITY = 0.18;

/**
 * The card variant's gap to the row below it, and its corner radius.
 *
 * Both are read twice now — by the card itself and by the action panel behind
 * it, which has to stop where the card stops rather than run into the gap, and
 * has to round the same corners or its edges show past them.
 */
const CARD_GAP = 12;
const CARD_RADIUS = 24;

/** One action's width. Wide enough to be a thumb target with a label under it. */
const SWIPE_ACTION_WIDTH = 76;

/**
 * Past fully open the row keeps following the finger, at a fifth of its speed.
 *
 * Without this the row stops dead at full travel and the gesture reads as broken —
 * the finger is still moving and nothing is. With it, the row is obviously at
 * the end of its travel and obviously still being held. The same factor applies
 * to a rightward pull on a closed row, which has nothing to reveal at all.
 */
const SWIPE_RESISTANCE = 0.2;

/**
 * How much of the reveal has to be showing for a release to open rather than
 * close. Below half, because a swipe that has committed past a third of the way
 * is a swipe, and finishing the travel for the user is the point.
 */
const SWIPE_SNAP_FRACTION = 0.4;

/**
 * Where the row's icon and amount were when it was tapped.
 *
 * Measured rather than derived: the row's position depends on the scroll
 * offset, the day heading above it and whichever filters are applied, and a
 * calculated guess at any of those is a transition that starts in the wrong
 * place on exactly the screens that matter most.
 */
export type RowOrigin = { icon: Frame | null; amount: Frame | null };

// Simplified props for UI matching
interface TransactionItemProps {
  icon: string;
  title: string;
  category: string;
  subtitle?: string;
  /** Magnitude only — the row draws its own +/- from `isIncome`. */
  amount: number;
  date: string;
  color?: string;
  bgColor?: string;
  isIncome?: boolean;
  /**
   * The frames are the row's own icon and amount, measured in window
   * coordinates the moment before it navigates. C9 animates the detail
   * screen's copies out of them; a screen that does not want a transition
   * simply ignores the argument.
   */
  onPress?: (origin?: RowOrigin) => void;
  variant?: 'card' | 'list';
  showDivider?: boolean;
  maskAmount?: boolean;
  /** Just written by this session. Plays the entrance once. */
  isNew?: boolean;
  /**
   * Position in the list this row is part of, which is what staggers its
   * entrance. Omit it and the row simply appears — right for the single rows
   * that are not a list at all.
   */
  entranceIndex?: number;
  /**
   * Supply both and the row becomes swipeable. Omitting them is what keeps the
   * gesture off the screens that have nowhere to put an Undo — a delete with no
   * way back is the thing this replaces, not something to spread.
   */
  onEdit?: () => void;
  onDelete?: () => void;
  /**
   * A third action, ahead of the other two: the same transaction again, dated
   * today. Optional on its own — it needs Edit and Delete to have a row to
   * swipe at all.
   */
  onRepeat?: () => void;
  /**
   * Open state is the list's to hold, so that opening one row closes the last.
   * Two rows showing Delete at once is two rows claiming the next tap.
   */
  swipeOpen?: boolean;
  onSwipeOpenChange?: (open: boolean) => void;
  /**
   * Set while the row is being deleted: it collapses its own height to nothing
   * and takes the gap with it, so the list closes over it instead of jumping.
   */
  collapsed?: boolean;
  /** Account-less entries stay saveable, but remain visibly recoverable. */
  unlinked?: boolean;
}

export function TransactionItem({
  icon,
  title,
  category,
  subtitle,
  amount,
  date,
  color,
  bgColor,
  isIncome,
  onPress,
  variant = 'card',
  showDivider = false,
  maskAmount = false,
  isNew = false,
  entranceIndex,
  onEdit,
  onDelete,
  onRepeat,
  swipeOpen = false,
  onSwipeOpenChange,
  collapsed = false,
  unlinked = false,
}: TransactionItemProps) {
  const theme = useThemeTokens();
  const motion = useMotion();
  const isList = variant === 'list';
  const swipeable = Boolean(onEdit && onDelete);
  /** How far the row travels with every action fully showing. */
  const swipeOpenDistance = SWIPE_ACTION_WIDTH * (onRepeat ? 3 : 2);
  // The two halves C9 carries across. They are refs rather than state because
  // nothing renders from them — they are read once, on the way out.
  const iconRef = useRef<View>(null);
  const amountRef = useRef<View>(null);

  /**
   * Measure, then navigate.
   *
   * Both measurements are taken before the push starts, because after it the
   * row is on a screen that is already moving. `measureInWindow` is a callback
   * per view, so the two are awaited together rather than in series — a row
   * tap must not wait two frames to respond.
   */
  const handlePress = useCallback(async () => {
    if (!onPress) return;
    const [icon, amount] = await Promise.all([measureFrame(iconRef), measureFrame(amountRef)]);
    onPress({ icon, amount });
  }, [onPress]);
  // Starts settled. A row that is not new must never animate, and every row in
  // the feed mounts as not new.
  const entrance = useSharedValue(1);
  const highlight = useSharedValue(0);

  useEffect(() => {
    if (!isNew) return;
    if (motion.reduced) {
      // The wash still happens — it is a colour, not a movement — but it
      // arrives rather than grows.
      highlight.value = HIGHLIGHT_OPACITY;
      highlight.value = withTiming(0, { duration: HIGHLIGHT_FADE_MS });
      return;
    }
    entrance.value = NEW_ROW_FROM_SCALE;
    entrance.value = withTiming(1, motion.enter('base'));
    highlight.value = HIGHLIGHT_OPACITY;
    highlight.value = withTiming(0, { duration: HIGHLIGHT_FADE_MS });
  }, [entrance, highlight, isNew, motion]);

  // How far the row is pulled aside, and how much of its height is left. Both
  // start at rest, because a row that is not being touched must not animate.
  const swipe = useSharedValue(0);
  const collapse = useSharedValue(1);
  const measuredHeight = useSharedValue(0);
  /**
   * Whether the row needs its clip. See the note on `TransactionItem`: this
   * exists so a resting list keeps its shadows, and it flips on touch-down
   * rather than on movement so no frame of the pull escapes the box.
   */
  const [engaged, setEngaged] = useState(false);

  // Open state is the list's, so the row follows the prop rather than its own
  // gesture — which is also what closes this row when another one opens.
  useEffect(() => {
    if (!swipeable) return;
    swipe.value = motion.springTo(swipeOpen ? -swipeOpenDistance : 0);
    if (!swipeOpen) setEngaged(false);
  }, [motion, swipe, swipeOpen, swipeOpenDistance, swipeable]);

  /**
   * Latched on the first collapse and never unset, because it is what decides
   * whether this row's height is a number at all.
   *
   * A height can only be animated from something to something, so the collapse
   * needs the measurement — but a row that has never been deleted must keep its
   * automatic height, or every row in the list is pinned to whatever it happened
   * to measure once. Latching means the style gains a `height` key exactly once,
   * in the direction that adds it, and never has to clear one again. The cost is
   * that an undone row stays pinned to the height it had; its content is a saved
   * transaction and does not change size.
   */
  const [hasCollapsed, setHasCollapsed] = useState(false);

  useEffect(() => {
    if (!collapsed) return;
    setHasCollapsed(true);
    // The row is on its way out and the Undo window has opened. Not `saved` —
    // nothing has been written yet — and not `rejected`, which would say the
    // app turned the delete down.
    haptics.removed();
  }, [collapsed]);

  useEffect(() => {
    if (!hasCollapsed) return;
    // Out on the exit curve, back on the entry one — the row leaving is faster
    // than the row returning, which is C1's rule and the reason `exit` exists.
    collapse.value = collapsed
      ? withTiming(0, motion.exit('base'))
      : withTiming(1, motion.enter('base'));
  }, [collapse, collapsed, hasCollapsed, motion]);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      // Only while the height is still the row's own. Once it is being animated,
      // every layout pass reports the animation's current value, and feeding
      // that back would chase the collapse down and stall the restore.
      if (!hasCollapsed && height > 0) measuredHeight.value = height;
    },
    [hasCollapsed, measuredHeight]
  );

  const pan = Gesture.Pan()
    // The rows live in a vertical ScrollView, so the pan has to lose every
    // argument about which direction this is: it needs 12px of sideways travel
    // before it claims the touch, and gives up entirely on 12px of vertical.
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    // On activation, not on touch-down. `onBegin` fires for every touch inside
    // the row, including a plain tap that will never move — and since a pan that
    // never activates never reaches `onEnd`, the clip would latch on and that
    // row would lose its shadow for good. Nothing has moved by `onStart`, so
    // this is still early enough that no frame of the pull escapes the box.
    .onStart(() => {
      runOnJS(setEngaged)(true);
    })
    .onUpdate((event) => {
      const from = swipeOpen ? -swipeOpenDistance : 0;
      const next = from + event.translationX;
      if (next < -swipeOpenDistance) {
        swipe.value = -swipeOpenDistance + (next + swipeOpenDistance) * SWIPE_RESISTANCE;
      } else if (next > 0) {
        swipe.value = next * SWIPE_RESISTANCE;
      } else {
        swipe.value = next;
      }
    })
    .onEnd(() => {
      const open = swipe.value <= -swipeOpenDistance * SWIPE_SNAP_FRACTION;
      swipe.value = motion.springTo(open ? -swipeOpenDistance : 0);
      // C8's, deferred from C5 on purpose. It fires on the snap in *both*
      // directions: the row springing shut is as much a decision landing as the
      // row springing open, and buzzing only one of them would say the gesture
      // half-worked. `runOnJS` because this is a worklet, and the module's
      // functions are stable references for exactly that reason.
      runOnJS(haptics.select)();
      // Told rather than assumed: the list owns the open row, and it may close
      // this one again on the same tick if something else opened.
      if (onSwipeOpenChange) runOnJS(onSwipeOpenChange)(open);
      if (!open) runOnJS(setEngaged)(false);
    });

  const collapseStyle = useAnimatedStyle(
    () =>
      hasCollapsed
        ? { height: measuredHeight.value * collapse.value, opacity: collapse.value }
        : {},
    [hasCollapsed]
  );

  const entranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipe.value }, { scale: entrance.value }],
    opacity: interpolate(entrance.value, [NEW_ROW_FROM_SCALE, 1], [0.4, 1], 'clamp'),
  }));

  /**
   * The actions only fade up as the row uncovers them. At rest they are behind
   * an opaque card and invisible either way, but a half-open row showing them at
   * full strength reads as two rows overlapping rather than one being pulled
   * aside.
   */
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(swipe.value, [0, -swipeOpenDistance * 0.6], [0, 1], 'clamp'),
  }));

  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));
  const titleColor = theme.mode === 'dark' ? '#F3F4F6' : '#1F2933';
  const mutedColor = theme.mode === 'dark' ? 'rgba(255,255,255,0.5)' : '#9A9697';

  const body = (
    // One view, not a fragment. `GestureDetector` clones its child to inject
    // `collapsable={false}`, which is precisely what stops Android flattening
    // the view away — a fragment swallows the prop and the gesture attaches to
    // nothing. The collapse host doubles as the stage the actions are positioned
    // against, so this costs no extra node either way.
    <Animated.View
      onLayout={swipeable ? measure : undefined}
      style={[
        collapseStyle,
        // The clip is only on while there is something to clip — see the note
        // on this component. A permanent one costs every card its shadow.
        (engaged || hasCollapsed) && styles.clipped,
      ]}>
      {swipeable && (
        <Animated.View
          style={[
            styles.actions,
            // Stop where the card stops. Running into the gap would put a red
            // panel in the space between two rows.
            { bottom: isList ? 0 : CARD_GAP, borderRadius: isList ? 0 : CARD_RADIUS },
            actionsStyle,
          ]}>
          {onRepeat && (
            <SwipeAction
              icon="repeat"
              label="Repeat"
              color="#FFFFFF"
              background={theme.colors.accent}
              onPress={onRepeat}
            />
          )}
          <SwipeAction
            icon="pencil-outline"
            label="Edit"
            color={theme.colors.accent}
            background={theme.colors.secondary}
            onPress={onEdit}
          />
          <SwipeAction
            icon="trash-can-outline"
            label="Delete"
            color="#FFFFFF"
            background="#E5484D"
            onPress={onDelete}
          />
        </Animated.View>
      )}
      <Animated.View style={entranceStyle}>
        {/* Behind the row, not over it — a tint the content sits on rather than a
            film the content is read through. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: theme.colors.accent }, highlightStyle]}
        />
        <Pressable
          // An open row's next tap belongs to the row, not to the detail
          // screen: the actions are showing precisely because the user is
          // deciding, and navigating away from that decision is the wrong
          // answer to "never mind".
          onPress={swipeOpen ? () => onSwipeOpenChange?.(false) : handlePress}
          style={[
            styles.itemBase,
            isList ? styles.listItem : styles.cardItem,
            !isList ? { backgroundColor: theme.mode === 'dark' ? '#1F2937' : '#FFFFFF' } : undefined,
            !isList ? theme.shadows.soft : undefined,
          ]}>
          <View
            ref={iconRef}
            // Android flattens a plain container view out of the hierarchy, and
            // a flattened view has nothing to measure — the same prop, and the
            // same reason, as the collapse host C5 had to add for the gesture.
            collapsable={false}
            style={[
              isList ? styles.listIcon : styles.cardIcon,
              {
                backgroundColor: bgColor || (isIncome ? '#E8F5E9' : '#FFEBEE'),
                borderRadius: isList
                  ? Math.min(theme.icon.containerRadius, 20)
                  : theme.icon.containerRadius,
              },
            ]}>
            <MaterialCommunityIcons
              name={getMoodIconName(icon, theme.mood.iconStyle) as any}
              size={isList ? 18 : 22}
              color={color || (isIncome ? '#27AE60' : '#E57373')}
            />
          </View>

          <View style={styles.details}>
            <ThemedText
              numberOfLines={1}
              variant={isList ? 'bodyStrong' : 'sectionTitle'}
              style={[
                styles.title,
                {
                  color: titleColor,
                },
                isList ? styles.listTitleText : styles.cardTitleText,
              ]}>
              {title}
            </ThemedText>
            <View style={styles.metaRow}>
              <View
                style={[
                  isList ? styles.listPill : styles.cardPill,
                  { backgroundColor: bgColor || '#F3F4F6' },
                ]}>
                <ThemedText
                  numberOfLines={1}
                  variant="micro"
                  style={[
                    styles.category,
                    {
                      color: color || '#6B7280',
                    },
                    isList ? styles.listCategoryText : styles.cardCategoryText,
                  ]}>
                  {category}
                </ThemedText>
              </View>
              {subtitle && (
                <ThemedText
                  numberOfLines={1}
                  variant="caption"
                  style={[
                    styles.subtitle,
                    {
                      color: mutedColor,
                    },
                    isList ? styles.listSubtitleText : styles.cardSubtitleText,
                  ]}>
                  {isList ? subtitle : `• ${subtitle}`}
                </ThemedText>
              )}
              {unlinked ? (
                <View style={styles.unlinkedPill}>
                  <MaterialCommunityIcons name="link-variant-off" size={11} color="#D97706" />
                  <ThemedText variant="micro" style={styles.unlinkedText}>
                    Unlinked
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <View ref={amountRef} collapsable={false} style={styles.amountBlock}>
            <ThemedText
              numberOfLines={1}
              variant="amount"
              style={[
                styles.amount,
                {
                  color: isIncome ? '#27AE60' : theme.colors.text,
                },
                isList ? styles.listAmountText : styles.cardAmountText,
              ]}>
              {isIncome ? '+' : '-'}
              {maskAmount ? `${CURRENCY_SYMBOL}••••` : formatMoney(amount, { sign: 'never' })}
            </ThemedText>
            {date ? (
              <ThemedText
                numberOfLines={1}
                variant="micro"
                style={[
                  styles.date,
                  {
                    color: mutedColor,
                  },
                ]}>
                {date}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        {showDivider ? <View style={styles.divider} /> : null}
      </Animated.View>
    </Animated.View>
  );

  return (
    <Animated.View
      entering={isNew || entranceIndex == null ? undefined : motion.rowEntering(entranceIndex)}
      // A filter or a period change rewrites the list under the rows that
      // survive it. Without this they teleport to their new positions while the
      // ones arriving fade in, which reads as two unrelated events.
      layout={motion.reflow()}>
      {swipeable ? <GestureDetector gesture={pan}>{body}</GestureDetector> : body}
    </Animated.View>
  );
}

/**
 * One action behind the row.
 *
 * The label is not decoration: an icon alone leaves the difference between Edit
 * and Delete to two glyphs the user is reading with their thumb over one of
 * them, and the cost of guessing wrong is asymmetric.
 */
function SwipeAction({
  icon,
  label,
  color,
  background,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  color: string;
  background: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { backgroundColor: background }]}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <ThemedText variant="micro" style={[styles.actionLabel, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clipped: {
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  action: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    textTransform: 'uppercase',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  itemBase: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: CARD_RADIUS,
    marginBottom: CARD_GAP,
  },
  listItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardIcon: {
    height: 48,
    width: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  listIcon: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  details: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {},
  listTitleText: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardTitleText: {
    fontSize: 14,
    lineHeight: 19,
  },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  cardPill: {
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 8,
  },
  listPill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 10,
    marginRight: 8,
    maxWidth: 118,
  },
  category: {
    textTransform: 'uppercase',
  },
  listCategoryText: {
    fontSize: 8,
    lineHeight: 11,
  },
  cardCategoryText: {
    fontSize: 10,
    lineHeight: 13,
  },
  subtitle: {
    flex: 1,
  },
  listSubtitleText: {
    fontSize: 10,
    lineHeight: 13,
  },
  cardSubtitleText: {
    fontSize: 12,
    lineHeight: 16,
  },
  unlinkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unlinkedText: {
    color: '#B45309',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  amountBlock: {
    minWidth: 88,
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {},
  listAmountText: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardAmountText: {
    fontSize: 14,
    lineHeight: 18,
  },
  date: {
    marginTop: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
    backgroundColor: 'rgba(45,45,45,0.08)',
  },
});
