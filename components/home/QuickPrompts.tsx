import { Pressable, ScrollView, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Shimmer } from '@/components/ui/Shimmer';
import { SkeletonFrame } from '@/components/ui/Skeleton';
import { getMoodIconName } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import { API_BASE_URL } from '@/lib/transactions';

export type QuickPrompt = {
  id: number;
  title: string;
  amount: number;
  /** "expense" or "income". Absent from servers older than the field. */
  type?: string;
  mode: string;
  category: string;
  /** The exact account to pay from; null means the default for `mode`. */
  account_id?: number | null;
  merchant?: string;
  tag?: string;
  notes?: string;
  icon: string;
};

export function QuickPrompts({
  onSelect,
  onAdd,
  onLongPress,
}: {
  onSelect: (prompt: QuickPrompt) => void;
  onAdd: () => void;
  onLongPress: (prompt: QuickPrompt) => void;
}) {
  const theme = useThemeTokens();
  const { token } = useAuthStore();

  const [prompts, setPrompts] = useState<QuickPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    if (!token) {
      setPrompts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/v1/quick-prompts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        throw new Error('Unable to load quick prompts.');
      }
      const data = await resp.json();
      setPrompts(data);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load quick prompts.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const canAddMore = prompts.length < 10;

  return (
    <View className="py-6 flex-row items-center">
      <ThemedText variant="micro" className="pl-6 uppercase tracking-widest opacity-40 mr-3">
        QUICK PROMPTS:
      </ThemedText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingRight: theme.components.screen.horizontalPadding,
          gap: theme.spacing.sm + 2,
          alignItems: 'center',
        }}>
        {isLoading ? (
          // Chips, not a spinner: the strip is a fixed-height row and a spinner
          // in it is the one place on Home that visibly resizes when its
          // content lands.
          <SkeletonFrame
            label="Loading quick prompts"
            testID="quick-prompts-skeleton"
            style={{ flexDirection: 'row', gap: theme.spacing.sm + 2 }}>
            {[132, 104, 148].map((width, chip) => (
              <Shimmer key={width} width={width} height={34} radius={17} index={chip * 2} />
            ))}
          </SkeletonFrame>
        ) : error ? (
          <Pressable
            onPress={() => void fetchPrompts()}
            className="flex-row items-center rounded-full border border-red-100 bg-red-50 px-4 py-2 dark:border-red-900/30 dark:bg-red-900/20">
            <MaterialCommunityIcons name="refresh" size={14} color={theme.colors.accent} />
            <ThemedText tone="negative" variant="captionStrong" className="ml-2">
              Retry prompts
            </ThemedText>
          </Pressable>
        ) : (
          prompts.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                haptics.select();
                onSelect(item);
              }}
              onLongPress={() => onLongPress(item)}
              className="flex-row items-center bg-white dark:bg-gray-800 rounded-full px-5 py-2 gap-2 shadow-sm active:opacity-70 border border-gray-50 dark:border-gray-700">
              <MaterialCommunityIcons
                name={getMoodIconName(item.icon || 'lightning-bolt', theme.mood.iconStyle) as any}
                size={14}
                color={theme.colors.accent}
              />
              <ThemedText variant="captionStrong" className="opacity-80">
                {item.title}
              </ThemedText>
            </Pressable>
          ))
        )}
        {!isLoading && !error && canAddMore && (
          <Pressable
            onPress={onAdd}
            className="flex-row items-center bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-full px-4 py-2 gap-2 active:opacity-70">
            <ThemedText tone="muted" variant="captionStrong" >
              Add +
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
