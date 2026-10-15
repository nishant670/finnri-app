import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export function InsightsUnlockProgressCard({ count }: { count: number }) {
  const theme = useThemeTokens();
  const progress = Math.min(3, Math.max(0, count));
  return (
    <View
      className="rounded-[28px] border p-6"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View
        className="h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.colors.secondary }}>
        <MaterialCommunityIcons
          name="chart-box-plus-outline"
          size={24}
          color={theme.colors.accent}
        />
      </View>
      <ThemedText className="mt-4 text-lg font-black">
        Add 3 transactions to unlock insights
      </ThemedText>
      <ThemedText tone="muted" className="mt-2 text-xs leading-5">
        A few real entries are enough for Finnri to start showing useful patterns.
      </ThemedText>
      <View
        className="mt-5 h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: theme.colors.secondary }}>
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: theme.colors.accent, width: `${(progress / 3) * 100}%` }}
        />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <ThemedText tone="muted" className="text-[11px] font-bold">
          {progress}/3 added
        </ThemedText>
        <ThemedText className="text-[11px] font-black" style={{ color: theme.colors.accent }}>
          {Math.max(0, 3 - progress)} to go
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)')}
        className="mt-5 items-center rounded-full py-3"
        style={{ backgroundColor: theme.colors.accent }}>
        <ThemedText tone="onAccent" className="text-sm font-black">
          Add transaction
        </ThemedText>
      </Pressable>
    </View>
  );
}
