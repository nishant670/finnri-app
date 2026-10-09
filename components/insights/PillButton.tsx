import { TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export function PillButton({
  label,
  muted,
  onPress,
}: {
  label: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: muted
          ? theme.mode === 'dark'
            ? '#333333'
            : '#F3F3F3'
          : theme.colors.accent,
      }}>
      <ThemedText
        className="text-[10px] font-black"
        style={{ color: muted ? theme.colors.text : '#FFFFFF' }}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}
