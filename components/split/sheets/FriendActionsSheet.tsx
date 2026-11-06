import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import type { SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function FriendActionsSheet({
  friend,
  onClose,
  onEdit,
  onDelete,
  onArchive,
}: {
  friend: SplitFriend | null;
  onClose: () => void;
  onEdit: (friend: SplitFriend) => void;
  onDelete: (friend: SplitFriend) => void;
  onArchive: (friend: SplitFriend) => void;
}) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(32);
  return (
    <AnimatedBottomSheet visible={Boolean(friend)} onClose={onClose}>
      <View
        className="rounded-t-[28px] border px-5 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border, paddingBottom: sheetBottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <TText variant="sectionTitle">
              {friend?.name ?? 'Friend'}
            </TText>
            <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
              Manage this split friend
            </TText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={20} color={theme.text} />
          </Pressable>
        </View>
        <View className="gap-2">
          <FriendActionRow
            icon="pencil-outline"
            label="Edit friend"
            onPress={() => {
              if (friend) onEdit(friend);
            }}
          />
          <FriendActionRow
            icon="trash-can-outline"
            label="Delete from active list"
            destructive
            onPress={() => {
              if (friend) onDelete(friend);
            }}
          />
          <FriendActionRow
            icon="archive-outline"
            label="Archive friend"
            onPress={() => {
              if (friend) onArchive(friend);
            }}
          />
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}

function FriendActionRow({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  const color = destructive ? theme.negative : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 rounded-2xl px-3"
      style={{ backgroundColor: destructive ? `${theme.negative}1F` : theme.secondary }}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <TText className="text-sm" style={{ color, fontFamily: Fonts.title }}>
        {label}
      </TText>
    </Pressable>
  );
}
