import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { isLocalAttachmentUri } from '@/lib/uploads';

type TransactionReceiptFieldProps = {
  attachment: string | null;
  error: string | null;
  /** Draws the rule above the row: every row in a card but the first. */
  divider?: boolean;
  onPick: () => void;
  onRemove: () => void;
};

/**
 * The Receipt row under More details (board R2-Split): the label column, then
 * "Attach a photo or PDF" with a paperclip, or the attached file's name with a
 * way to remove it.
 */
export function TransactionReceiptField({
  attachment,
  error,
  divider = false,
  onPick,
  onRemove,
}: TransactionReceiptFieldProps) {
  const { colors } = useThemeTokens();
  const fileName = attachment
    ? decodeURIComponent(attachment.split('?')[0].split('/').pop() ?? 'Receipt')
    : '';

  return (
    <View style={divider ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
      <PressableView
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel={attachment ? 'Change receipt' : 'Attach a receipt'}
        style={styles.row}
        pressedStyle={styles.pressed}>
        <ThemedText tone="muted" style={styles.label}>
          Receipt
        </ThemedText>
        <MaterialCommunityIcons
          name={attachment ? 'file-check-outline' : 'paperclip'}
          size={18}
          color={colors.text}
        />
        <View style={styles.value}>
          <ThemedText numberOfLines={1} style={[styles.valueText, { color: colors.text }]}>
            {attachment ? fileName : 'Attach a photo or PDF'}
          </ThemedText>
          {attachment ? (
            <ThemedText tone="muted" style={styles.caption}>
              {isLocalAttachmentUri(attachment) ? 'Uploads when you save' : 'Saved to this transaction'}
            </ThemedText>
          ) : null}
        </View>
        {attachment ? (
          <Pressable
            onPress={onRemove}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove receipt">
            <MaterialCommunityIcons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={withAlpha(colors.text, 0.6)}
          />
        )}
      </PressableView>
      {error ? (
        <ThemedText tone="negative" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 6,
  },
  label: {
    width: 84,
    marginRight: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    flex: 1,
    minWidth: 0,
  },
  valueText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
