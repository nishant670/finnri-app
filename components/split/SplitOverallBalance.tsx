import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { BalanceFigure } from '@/components/split/BalanceFigure';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitOverallBalanceProps = {
  value: number;
  color: string;
  hasActivity: boolean;
  onOpenFilter: () => void;
};

export function SplitOverallBalance({
  value,
  color,
  hasActivity,
  onOpenFilter,
}: SplitOverallBalanceProps) {
  const theme = useThemeTokens().colors;
  return (
    <View className="mt-7 flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <BalanceFigure value={value} color={color} overall hasActivity={hasActivity} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Filter split balances"
        onPress={onOpenFilter}
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.secondary }}>
        <MaterialCommunityIcons name="tune-variant" size={24} color={theme.text} />
      </Pressable>
    </View>
  );
}
