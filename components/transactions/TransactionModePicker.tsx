import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TransactionModePickerProps = {
  visible: boolean;
  options: readonly string[];
  selected: string;
  onClose: () => void;
  onSelect: (mode: string) => void;
};

/** The payment-method sheet opened from the composer's mode row. */
export function TransactionModePicker({
  visible,
  options,
  selected,
  onClose,
  onSelect,
}: TransactionModePickerProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const colorScheme = themeTokens.mode;
  const accent = theme.accent;
  const accentSurface = theme.secondary;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-10 pt-4" style={{ backgroundColor: theme.background }}>
        <ThemedText className="text-center text-base font-bold mb-6">
          Choose a payment method
        </ThemedText>
        <View className="gap-2">
          {options.map((m) => (
            <Pressable
              key={m}
              onPress={() => onSelect(m)}
              className="flex-row items-center justify-between rounded-2xl border p-4"
              style={{
                backgroundColor:
                  selected === m ? accentSurface : colorScheme === 'dark' ? theme.card : '#F9FAFB',
                borderColor: selected === m ? accent : 'transparent',
              }}>
              <ThemedText
                className="font-bold"
                style={{ color: selected === m ? accent : theme.text }}>
                {m}
              </ThemedText>
              {selected === m && <MaterialCommunityIcons name="check" size={20} color={accent} />}
            </Pressable>
          ))}
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}
