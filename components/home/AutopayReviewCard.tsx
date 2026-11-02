import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type AutopayReviewCardProps = {
  onConfirm: () => void;
  onRevert: () => void;
};

export function AutopayReviewCard({ onConfirm, onRevert }: AutopayReviewCardProps) {
  const themeTokens = useThemeTokens();

  return (
    <View
      className="mx-4 mb-3 rounded-2xl border p-4"
      style={{
        backgroundColor: themeTokens.colors.card,
        borderColor: themeTokens.colors.border,
      }}>
      <View className="flex-row items-start gap-3">
        <MaterialCommunityIcons name="bank-check" size={24} color={themeTokens.colors.accent} />
        <View className="flex-1">
          <ThemedText className="font-black">Autopay transaction added</ThemedText>
          <ThemedText className="mt-1 text-xs opacity-60">
            Review the recurring payment. It is already in your transaction list.
          </ThemedText>
          <View className="mt-3 flex-row gap-2">
            <Button label="Confirm" height={36} onPress={onConfirm} />
            <Button label="Fix it" variant="outline" height={36} onPress={onRevert} />
          </View>
        </View>
      </View>
    </View>
  );
}
