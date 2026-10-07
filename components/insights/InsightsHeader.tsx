import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The Insights chrome — title, the period it is showing, and search.
 *
 * Extracted only because the loading frame wears it too. A screen whose header
 * appears a beat after its body is a screen that visibly assembles itself, and
 * this one already knows its period before the first byte arrives.
 */
export function InsightsHeader({
  rangeLabel,
  refreshing,
  onPickPeriod,
}: {
  rangeLabel: string;
  /** A reload behind content that is already on screen. Never true while the
   *  skeleton is up — that frame is already saying the same thing. */
  refreshing: boolean;
  onPickPeriod: () => void;
}) {
  const theme = useThemeTokens().colors;

  return (
    <View className="flex-row items-center justify-between px-5 py-4">
      <View>
        <ThemedText className="text-2xl font-black">Insights</ThemedText>
        <TouchableOpacity className="mt-1 flex-row items-center" onPress={onPickPeriod}>
          <ThemedText className="text-xs font-bold" style={{ color: theme.accent }}>
            {rangeLabel}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-down" size={14} color={theme.accent} />
        </TouchableOpacity>
      </View>
      <View className="flex-row items-center gap-3">
        {refreshing && <ActivityIndicator color={theme.accent} />}
        <HeaderIcon name="magnify" onPress={() => router.push('/transactions')} />
      </View>
    </View>
  );
}
function HeaderIcon({
  name,
  onPress,
}: {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
}) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      className="h-10 w-10 items-center justify-center rounded-full shadow-sm"
      style={{ backgroundColor: theme.colors.card }}
      onPress={onPress}>
      <MaterialCommunityIcons name={name} size={20} color={theme.colors.text} />
    </TouchableOpacity>
  );
}
