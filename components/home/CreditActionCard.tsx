import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { type CreditActionState } from '@/lib/home-capture';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type CreditActionCardProps = {
  creditAction: CreditActionState;
  onPress: () => void;
};

export function CreditActionCard({ creditAction, onPress }: CreditActionCardProps) {
  const themeTokens = useThemeTokens();
  const isDark = themeTokens.mode === 'dark';

  return (
    <View
      className="mx-6 mb-6 rounded-2xl border p-4"
      style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF8F4',
        borderColor: themeTokens.colors.border,
      }}>
      <View className="flex-row items-start gap-3">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: themeTokens.colors.secondary }}>
          <MaterialCommunityIcons name="creation" size={18} color={themeTokens.colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <ThemedText className="font-bold" style={{ color: themeTokens.colors.text }}>
            {creditAction.title}
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: `${themeTokens.colors.text}99` }}>
            {creditAction.message}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            className="mt-3 self-start rounded-full px-4 py-2"
            style={{ backgroundColor: themeTokens.colors.accent }}>
            <ThemedText tone="onAccent" className="text-xs font-bold">
              {creditAction.actionLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
