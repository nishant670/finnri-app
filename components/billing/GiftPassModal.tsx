import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile } from '@/lib/categories';
import { GIFT_PASS_NOTIFICATION_TYPE } from '@/lib/gift-pass';
import { notificationKind } from '@/lib/notification-kinds';

type GiftPassModalProps = {
  visible: boolean;
  title: string;
  /** The notification's own sentence: which pass, until when, how many credits. */
  body: string;
  onSeePass: () => void;
  onClose: () => void;
};

/** Where the sparkles sit around the gift, as offsets in the 132pt hero. */
const SPARKLES = [
  { top: 6, left: 14, size: 18 },
  { top: 0, right: 20, size: 14 },
  { top: 52, right: 0, size: 20 },
  { bottom: 8, left: 4, size: 14 },
  { bottom: 0, right: 30, size: 12 },
] as const;

/**
 * The moment someone learns they've been gifted a pass.
 *
 * A notification row is easy to miss, and a gift is good news worth a beat of
 * its own, so it gets a pop-up: the gift on the same green tile it has in
 * Notifications, popping in with a few sparkles, the notification's sentence,
 * and one way through to the pass itself. Under reduced motion it simply
 * appears.
 */
export function GiftPassModal({ visible, title, body, onSeePass, onClose }: GiftPassModalProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const tile = categoryTile(notificationKind(GIFT_PASS_NOTIFICATION_TYPE), theme.mode);
  const muted = theme.mode === 'dark' ? 'rgba(255,255,255,0.62)' : '#6B7280';

  const pop = useSharedValue(0);
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      pop.value = 0;
      sparkle.value = 0;
      return;
    }
    pop.value = motion.springTo(1);
    sparkle.value = withDelay(motion.stagger(3), withTiming(1, motion.enter('sheet')));
  }, [motion, pop, sparkle, visible]);

  const giftStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + 0.4 * pop.value }, { rotate: `${(1 - pop.value) * -12}deg` }],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value,
    transform: [{ scale: 0.5 + 0.5 * sparkle.value }],
  }));

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityViewIsModal
          testID="gift-pass-modal"
          style={[styles.card, theme.shadows.soft, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.hero}>
            {SPARKLES.map((spot, index) => (
              <Animated.View key={index} style={[styles.sparkle, spot, sparkleStyle]}>
                <MaterialCommunityIcons name="star-four-points" size={spot.size} color={colors.accent} />
              </Animated.View>
            ))}
            <Animated.View style={[styles.giftTile, { backgroundColor: tile.background }, giftStyle]}>
              <MaterialCommunityIcons name="gift-outline" size={46} color={tile.foreground} />
            </Animated.View>
          </View>

          <ThemedText style={[styles.eyebrow, { color: tile.foreground }]}>A gift for you</ThemedText>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.body, { color: muted }]}>{body}</ThemedText>

          <Button label="See your pass" icon="arrow-right" height={50} onPress={onSeePass} style={styles.primary} />
          <PressableView
            accessibilityRole="button"
            onPress={onClose}
            style={styles.later}
            pressedStyle={styles.pressed}>
            <ThemedText style={[styles.laterLabel, { color: muted }]}>Later</ThemedText>
          </PressableView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  hero: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sparkle: {
    position: 'absolute',
  },
  giftTile: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  primary: {
    alignSelf: 'stretch',
    marginTop: 22,
  },
  later: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  laterLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
