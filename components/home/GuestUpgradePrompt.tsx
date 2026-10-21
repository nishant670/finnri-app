import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The ask to turn a guest into an account, shown on Home once the guest has
 * entries worth keeping. It names the count on purpose: "Save your data" is an
 * abstraction, "Save these 7 transactions" is a thing the user just made.
 */
export function GuestUpgradePrompt({
  entryCount,
  onUpgrade,
  onDismiss,
}: {
  entryCount: number;
  onUpgrade: () => void;
  onDismiss: () => void;
}) {
  const theme = useThemeTokens();

  return (
    <View
      accessibilityRole="summary"
      className="mx-4 mb-3 rounded-2xl border p-4"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.accent }}>
      <View className="flex-row items-start gap-3">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.colors.secondary }}>
          <MaterialCommunityIcons name="cloud-upload" size={18} color={theme.colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <ThemedText className="font-black" style={{ color: theme.colors.text }}>
            Save {entryCount === 1 ? 'this transaction' : `these ${entryCount} transactions`} to
            your account?
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: `${theme.colors.text}99` }}>
            They live on this device only. An account backs them up and moves them to your next
            phone. Takes about a minute.
          </ThemedText>
          <View className="mt-3 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={onUpgrade}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: theme.colors.accent }}>
              <ThemedText tone="onAccent" className="text-xs font-black">Save my data</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              className="rounded-full px-4 py-2">
              <ThemedText className="text-xs font-bold" style={{ color: `${theme.colors.text}99` }}>
                Not now
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
