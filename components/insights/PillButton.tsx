import { Button } from '@/components/ui/Button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * A small action inside an Insights card. Both weights are outlined, so a
 * card's own buttons never compete with the screen's one orange action; the
 * stronger one is tinted.
 */
export function PillButton({
  label,
  muted,
  onPress,
}: {
  label: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useThemeTokens();

  return (
    <Button
      variant="outline"
      height={36}
      label={label}
      onPress={onPress}
      style={[
        { paddingHorizontal: 14 },
        muted ? null : { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder },
      ]}
    />
  );
}
