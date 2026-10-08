import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type AutopayReviewCardProps = {
  onConfirm: () => void;
  onRevert: () => void;
};

export function AutopayReviewCard({ onConfirm, onRevert }: AutopayReviewCardProps) {
  const themeTokens = useThemeTokens();

  return (
    <View
      className="mx-6 mb-4 rounded-3xl border p-4"
      style={{
        backgroundColor: themeTokens.colors.card,
        borderColor: themeTokens.colors.accent,
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons name="bank-check" size={24} color={themeTokens.colors.accent} />
        <View className="flex-1">
          <ThemedText className="font-black">Autopay transaction added</ThemedText>
          <ThemedText className="mt-1 text-xs opacity-60">
            Review the recurring payment. It is already in your transaction list.
          </ThemedText>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              className="rounded-xl px-4 py-2"
              style={{ backgroundColor: themeTokens.colors.accent }}
              onPress={onConfirm}>
              <ThemedText tone="onAccent" className="text-xs font-black">
                Confirm
              </ThemedText>
            </Pressable>
            <Pressable
              className="rounded-xl border px-4 py-2"
              style={{ borderColor: themeTokens.colors.accent }}
              onPress={onRevert}>
              <ThemedText
                className="text-xs font-black"
                style={{ color: themeTokens.colors.accent }}>
                Correct / revert
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
