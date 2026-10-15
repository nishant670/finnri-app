import { ActivityIndicator, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export function PendingQuestionNotice() {
  const themeTokens = useThemeTokens();
  const isDark = themeTokens.mode === 'dark';

  return (
    <View
      className="mx-6 mb-4 flex-row items-center gap-3 rounded-3xl border p-4"
      style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF8F4',
        borderColor: themeTokens.colors.border,
      }}>
      <ActivityIndicator size="small" color={themeTokens.colors.accent} />
      <ThemedText
        variant="caption"
        numberOfLines={2}
        style={{ flex: 1, color: `${themeTokens.colors.text}99` }}>
        Looking through your transactions…
      </ThemedText>
    </View>
  );
}
