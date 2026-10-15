import type { ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const theme = useThemeTokens();

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between px-1">
        <ThemedText className="text-lg font-black">{title}</ThemedText>
        {actionLabel && (
          <TouchableOpacity onPress={onAction}>
            <ThemedText className="text-xs font-bold" style={{ color: theme.colors.accent }}>
              {actionLabel}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}
