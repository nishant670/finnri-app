import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type AccountSetupNudgeCardProps = {
  title: string;
  body: string;
  onComplete: () => void;
  onLater: () => void;
};

export function AccountSetupNudgeCard({
  title,
  body,
  onComplete,
  onLater,
}: AccountSetupNudgeCardProps) {
  const themeTokens = useThemeTokens();

  return (
    <View
      className="mx-6 mb-4 rounded-3xl border p-4"
      style={{
        backgroundColor: themeTokens.colors.card,
        borderColor: themeTokens.colors.border,
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons
          name="wallet-plus-outline"
          size={24}
          color={themeTokens.colors.accent}
        />
        <View className="flex-1">
          <ThemedText className="font-black">{title}</ThemedText>
          <ThemedText className="mt-1 text-xs opacity-60">{body}</ThemedText>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              className="rounded-xl px-4 py-2"
              style={{ backgroundColor: themeTokens.colors.accent }}
              onPress={onComplete}>
              <ThemedText tone="onAccent" className="text-xs font-black">
                Complete setup
              </ThemedText>
            </Pressable>
            <Pressable className="rounded-xl px-4 py-2" onPress={onLater}>
              <ThemedText tone="muted" className="text-xs font-black">
                Later
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
