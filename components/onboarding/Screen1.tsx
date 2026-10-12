import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const samplePrompts = [
  'Spent ₹250 on lunch via UPI',
  'लंच पर UPI से ₹250 खर्च',
  'लंचसाठी UPI ने ₹250 खर्च',
  'లంచ్‌కు UPIతో ₹250 ఖర్చు',
  'লাঞ্চে UPI দিয়ে ₹250 খরচ',
];

const waveformHeights = [12, 18, 14, 20];

export default function Screen1() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [promptIndex, setPromptIndex] = useState(0);
  
  const pulse1 = useSharedValue(1);
  const pulse2 = useSharedValue(1);
  const promptOpacity = useSharedValue(1);

  useEffect(() => {
    pulse1.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 1500, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 1500, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    
    const pulse2Timer = setTimeout(() => {
      pulse2.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 1800, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 1800, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
    }, 500);

    return () => clearTimeout(pulse2Timer);
  }, [pulse1, pulse2]);

  useEffect(() => {
    let nextPromptTimer: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      promptOpacity.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });

      nextPromptTimer = setTimeout(() => {
        setPromptIndex(current => (current + 1) % samplePrompts.length);
        promptOpacity.value = withTiming(1, { duration: 350, easing: Easing.in(Easing.quad) });
      }, 280);
    }, 2200);

    return () => {
      clearInterval(interval);
      if (nextPromptTimer) {
        clearTimeout(nextPromptTimer);
      }
    };
  }, [promptOpacity]);

  const animatedStyle1 = useAnimatedStyle(() => ({
    transform: [{ scale: pulse1.value }],
    opacity: 0.3 - (pulse1.value - 1) * 0.3,
  }));

  const animatedStyle2 = useAnimatedStyle(() => ({
    transform: [{ scale: pulse2.value }],
    opacity: 0.2 - (pulse2.value - 1) * 0.2,
  }));

  const promptAnimatedStyle = useAnimatedStyle(() => ({
    opacity: promptOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.micCircleContainer}>
          <Animated.View style={[styles.pulseCircle, { backgroundColor: theme.accent }, animatedStyle1]} />
          <Animated.View style={[styles.pulseCircle, { backgroundColor: theme.accent }, animatedStyle2]} />
          <View style={[styles.micBox, { backgroundColor: theme.accent }]}>
             <MaterialCommunityIcons name="microphone" size={40} color={theme.onAccent} />
          </View>
        </View>

        <View style={[styles.speechBubble, { backgroundColor: theme.card, marginBottom: 64 }]}>
          <View style={styles.waveform}>
              {waveformHeights.map((height, index) => (
                  <View key={index} style={[styles.waveItem, { backgroundColor: theme.accent, height }]} />
              ))}
          </View>
          <Animated.Text style={[styles.speechText, { color: theme.text }, promptAnimatedStyle]}>
            {samplePrompts[promptIndex]}
          </Animated.Text>
        </View>
        

        <View style={styles.textGroup}>
          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.title }]}>
            Speak money in{('\n')}<Text style={{ color: theme.accent }}>your language</Text>
          </Text>
          <Text style={[styles.subtitle, { color: theme.text, opacity: 0.6, fontFamily: Fonts.body }]}>
            Finnri understands any language, so you can capture spends the way you naturally talk.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  micCircleContainer: {
    height: 140,
    width: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  pulseCircle: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
  },
  micBox: {
    height: 80,
    width: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  speechBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  waveform: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
      gap: 2,
  },
  waveItem: {
      width: 3,
      borderRadius: 1.5,
  },
  speechText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 40,
  },
  languageChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  languageText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textGroup: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
