import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { isLocalAttachmentUri } from '@/lib/uploads';

type TransactionReceiptFieldProps = {
  attachment: string | null;
  error: string | null;
  withSectionLabel: boolean;
  onPick: () => void;
  onRemove: () => void;
};

/**
 * The receipt attach row.
 *
 * Pulled out of More details because the AI draft review shows it too,
 * inside its expanded summary. Only ever one of the two is mounted.
 *
 * The heading is a section label, which is how More details reads; in the
 * review list every other row carries its label inside the card, so there
 * the row speaks for itself.
 */
export function TransactionReceiptField({
  attachment,
  error,
  withSectionLabel,
  onPick,
  onRemove,
}: TransactionReceiptFieldProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  return (
    <View>
      {withSectionLabel && (
        <ThemedText
          tone="muted"
          className="text-[10px] font-black uppercase tracking-widest mb-3 italic">
          Receipt
        </ThemedText>
      )}
      <Pressable
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel={attachment ? 'Change receipt' : 'Attach a receipt'}
        className="w-full min-h-[64px] rounded-[20px] border px-4 py-3 flex-row items-center justify-between shadow-sm"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center gap-3 flex-1 pr-3">
          <MaterialCommunityIcons
            name={attachment ? 'file-check-outline' : 'file-upload-outline'}
            size={22}
            color={attachment ? accent : detailInputPlaceholderColor}
          />
          <View className="flex-1">
            <ThemedText
              className="text-sm font-bold"
              numberOfLines={1}
              style={{ color: attachment ? theme.text : detailInputPlaceholderColor }}>
              {attachment
                ? decodeURIComponent(attachment.split('?')[0].split('/').pop() ?? 'Receipt')
                : 'Attach a photo or PDF'}
            </ThemedText>
            {attachment ? (
              <ThemedText tone="muted" className="text-[10px] font-bold mt-0.5">
                {isLocalAttachmentUri(attachment)
                  ? 'Uploads when you save'
                  : 'Saved to this transaction'}
              </ThemedText>
            ) : null}
          </View>
        </View>
        {attachment ? (
          <Pressable
            onPress={onRemove}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove receipt">
            <MaterialCommunityIcons name="close-circle" size={20} color="#EF4444" />
          </Pressable>
        ) : (
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={20}
            color={detailInputPlaceholderColor}
          />
        )}
      </Pressable>
      {error ? (
        <ThemedText tone="negative" className="text-[11px] font-bold mt-2 ml-1">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}
