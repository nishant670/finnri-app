import { ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
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

  const colors = theme.colors;
  const chipStyle = [styles.chip, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <View style={styles.section}>
      <ThemedText accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Quick prompts
      </ThemedText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {isLoading ? (
          // Chips, not a spinner: the strip is a fixed-height row and a spinner
          // in it is the one place on Home that visibly resizes when its
          // content lands.
          <SkeletonFrame
            label="Loading quick prompts"
            testID="quick-prompts-skeleton"
            style={styles.skeleton}>
            {[148, 156, 92].map((width, chip) => (
              <Shimmer key={width} width={width} height={40} radius={20} index={chip * 2} />
            ))}
          </SkeletonFrame>
        ) : error ? (
          <PressableView
            accessibilityRole="button"
            onPress={() => void fetchPrompts()}
            style={chipStyle}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="refresh" size={18} color={colors.negative} />
            <ThemedText tone="negative" style={styles.label}>
              Try again
            </ThemedText>
          </PressableView>
        ) : (
          prompts.map((item) => (
            <PressableView
              key={item.id}
              accessibilityRole="button"
              onPress={() => {
                haptics.select();
                onSelect(item);
              }}
              onLongPress={() => onLongPress(item)}
              style={chipStyle}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons
                name={getMoodIconName(item.icon || 'lightning-bolt', theme.mood.iconStyle) as any}
                size={18}
                color={colors.text}
              />
              <ThemedText numberOfLines={1} style={[styles.label, { color: colors.text }]}>
                {item.title}
              </ThemedText>
            </PressableView>
          ))
        )}
        {!isLoading && !error && canAddMore && (
          <PressableView
            accessibilityRole="button"
            accessibilityLabel="New quick prompt"
            onPress={onAdd}
            style={[styles.chip, styles.newChip, { borderColor: colors.borderStrong }]}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
            <ThemedText style={[styles.label, { color: colors.text }]}>New</ThemedText>
          </PressableView>
        )}
      </ScrollView>
    </View>
  );
}

/** Board R1-Home-Empty: a 14/700 heading over a row of 40dp chips, 16 in from the edge. */
const styles = StyleSheet.create({
  section: {
    marginTop: 10,
    marginBottom: 14,
  },
  heading: {
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  row: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  skeleton: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  newChip: {
    gap: 6,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
});
