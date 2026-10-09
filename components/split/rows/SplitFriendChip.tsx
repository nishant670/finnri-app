import { Pressable } from 'react-native';

import { Fonts } from '@/constants/theme';
import { TText } from '@/components/split/primitives/themed-interop';
import { haptics } from '@/lib/haptics';
import { type SplitFriend } from '@/lib/splits';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitFriendChipProps = {
  friend: SplitFriend;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function SplitFriendChip({ friend, selectedId, onSelect }: SplitFriendChipProps) {
  const theme = useThemeTokens().colors;
  const isSelected = friend.id === selectedId;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.select();
        onSelect(friend.id);
      }}
      className="rounded-2xl px-3 py-2"
      style={{
        borderWidth: 1,
        borderColor: isSelected ? theme.accent : theme.border,
        backgroundColor: isSelected ? theme.accent : 'transparent',
      }}>
      <TText
        className="text-xs"
        style={{ color: isSelected ? theme.onAccent : theme.text, fontFamily: Fonts.title }}>
        {friend.name}
      </TText>
    </Pressable>
  );
}
