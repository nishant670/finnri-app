import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StatusBar, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** The viewer is a dark room whatever the mood, so the bill is what stands out. */
const INK = '#FFFFFF';
const INK_MUTED = 'rgba(255, 255, 255, 0.7)';
const BACKDROP = '#111111';

type ReceiptViewerProps = {
  visible: boolean;
  /** A displayable URL for the image (already resolved from the stored path). */
  uri: string | null;
  /** "Electricity bill payment · ₹20": what the bill belongs to. */
  subtitle: string;
  onClose: () => void;
  onShareError?: () => void;
};

/**
 * A bill photo, full screen and in the app (board R4-ReceiptViewer). Tapping
 * the receipt used to open the web browser; the detail screen showed it as a
 * 220px crop that cut off its top and bottom.
 *
 * Pinch to zoom and pan once zoomed; a double tap zooms in, or back to fit.
 * Share hands the file itself to the system sheet.
 */
export function ReceiptViewer({ visible, uri, subtitle, onClose, onShareError }: ReceiptViewerProps) {
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // Every opening starts fitted.
  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    x.value = 0;
    y.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }, [savedScale, savedX, savedY, scale, visible, x, y]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      x.value = savedX.value + event.translationX;
      y.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      const next = zoomed ? 1 : DOUBLE_TAP_SCALE;
      scale.value = withTiming(next);
      savedScale.value = next;
      if (zoomed) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const share = async () => {
    if (!uri || sharing) return;
    setSharing(true);
    try {
      const name = uri.split('?')[0].split('/').pop() || 'bill.jpg';
      const target = `${FileSystem.cacheDirectory}${Date.now()}-${name}`;
      const { uri: local } = await FileSystem.downloadAsync(uri, target);
      await Sharing.shareAsync(local, { dialogTitle: 'Share bill photo' });
    } catch {
      onShareError?.();
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={[styles.screen, { backgroundColor: BACKDROP }]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.stage, imageStyle]}>
            {uri ? (
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel="Bill photo"
                transition={150}
              />
            ) : (
              <ActivityIndicator color={INK} />
            )}
          </Animated.View>
        </GestureDetector>

        <View style={[styles.header, { top: insets.top }]}>
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.iconButton}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="close" size={22} color={INK} />
          </PressableView>
          <View style={styles.titles}>
            <ThemedText accessibilityRole="header" style={[styles.title, { color: INK }]}>
              Bill photo
            </ThemedText>
            <ThemedText numberOfLines={1} style={[styles.subtitle, { color: INK_MUTED }]}>
              {subtitle}
            </ThemedText>
          </View>
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="Share"
            disabled={!uri || sharing}
            onPress={() => void share()}
            style={styles.iconButton}
            pressedStyle={styles.pressed}>
            {sharing ? (
              <ActivityIndicator size="small" color={INK} />
            ) : (
              <MaterialCommunityIcons name="share-variant-outline" size={22} color={INK} />
            )}
          </PressableView>
        </View>

        <ThemedText style={[styles.hint, { color: INK_MUTED, bottom: insets.bottom + 24 }]}>
          Pinch to zoom · double-tap to fit
        </ThemedText>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 110,
    marginBottom: 80,
    marginHorizontal: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.6,
  },
});
