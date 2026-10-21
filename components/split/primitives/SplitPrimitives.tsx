import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DraftFieldCard } from '@/components/transactions/DraftFieldCard';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import { getMonogram } from '@/lib/monogram';
import type { SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function AvatarCircle({
  label,
  size,
  borderColor,
}: {
  label: string;
  size: number;
  borderColor?: string;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: theme.secondary,
        borderColor: borderColor ?? theme.background,
        borderWidth: borderColor ? 2 : 0,
      }}>
      <TText
        style={{ color: theme.accent, fontFamily: Fonts.title, fontSize: Math.max(13, size / 3) }}>
        {getMonogram(label, '?')}
      </TText>
    </View>
  );
}

export function DetailPill({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.select();
        onPress?.();
      }}
      className="min-h-12 flex-row items-center gap-2 rounded-full border px-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
      <TText className="text-sm" style={{ color: theme.text, fontFamily: Fonts.title }}>
        {label}
      </TText>
    </Pressable>
  );
}

export function MemberToggleChip({
  friend,
  selected,
  onPress,
}: {
  friend: SplitFriend;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className="min-h-9 flex-row items-center gap-2 rounded-full px-3"
      style={{
        backgroundColor: selected ? theme.selectedFill : theme.card,
        borderColor: selected ? theme.selectedBorder : theme.border,
        borderWidth: 1,
      }}>
      <MaterialCommunityIcons
        name={selected ? 'check' : 'plus'}
        size={16}
        color={theme.text}
      />
      <TText
        className="text-sm"
        style={{ color: theme.text, fontWeight: selected ? '700' : '500' }}>
        {friend.name}
      </TText>
    </Pressable>
  );
}

export function GroupChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className="rounded-2xl px-3 py-2"
      style={{
        backgroundColor: selected ? theme.accent : theme.background,
        borderColor: selected ? theme.accent : theme.border,
        borderWidth: 1,
      }}>
      <TText
        className="text-xs"
        style={{ color: selected ? theme.onAccent : theme.text, fontFamily: Fonts.title }}>
        {label}
      </TText>
    </Pressable>
  );
}

/**
 * The frame every Splits form sheet shares (boards R6-CreateGroup,
 * R6-AddFriend): a handle, the title with the round × beside it, the fields,
 * and the one button pinned under them.
 */
export function SplitModal({
  visible,
  title,
  errorMessage,
  footer,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  errorMessage?: string | null;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useThemeTokens().colors;
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} avoidKeyboard backdropOpacity={0.3}>
      {/*
        * `flexShrink` rather than a percentage max-height: a percentage
        * resolves against a parent that has no height of its own, which is what
        * left a three-field form clipping its last input and scrolling for no
        * reason. Shrinking means the sheet is exactly as tall as its content
        * until the keyboard leaves it less room, and only then does the list
        * inside start to scroll.
        */}
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        <View style={styles.sheetHeader}>
          <ThemedText accessibilityRole="header" style={[styles.sheetTitle, { color: theme.text }]}>
            {title}
          </ThemedText>
          <SheetCloseButton onPress={onClose} />
        </View>
        {errorMessage ? (
          <ErrorBanner message={errorMessage} style={{ marginBottom: 12, marginHorizontal: 16 }} />
        ) : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={styles.sheetBody}>
          {children}
        </ScrollView>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </View>
    </AnimatedBottomSheet>
  );
}

/** A card of label-and-input rows (board R6-AddFriend). */
export function FormRowsCard({ children }: { children: ReactNode }) {
  const theme = useThemeTokens().colors;
  return (
    <View style={[styles.rowsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

/** One row of a `FormRowsCard`: the label on the left, the input filling the rest. */
export function FormRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  divider = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** The rule above the row: every row but the first. */
  divider?: boolean;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View style={[styles.formRow, divider && { borderTopWidth: 1, borderTopColor: theme.border }]}>
      <ThemedText style={[styles.formRowLabel, { color: theme.text }]}>{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.formRowInput, { color: theme.text, fontFamily: Fonts.body }]}
      />
    </View>
  );
}

export function FormInput({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
}) {
  const theme = useThemeTokens().colors;
  const normalizedLabel = label.toLowerCase();
  const icon: keyof typeof MaterialCommunityIcons.glyphMap = normalizedLabel.includes('phone')
    ? 'phone-outline'
    : normalizedLabel.includes('email')
      ? 'email-outline'
      : normalizedLabel.includes('amount')
        ? 'cash'
        : normalizedLabel.includes('date')
          ? 'calendar-blank-outline'
          : normalizedLabel.includes('note')
            ? 'note-text-outline'
            : 'account-outline';
  return (
    <DraftFieldCard label={label} icon={icon}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        placeholderTextColor={theme.mutedStrong}
        style={{
          minHeight: multiline ? 84 : 48,
          paddingHorizontal: 0,
          paddingVertical: 0,
          color: theme.text,
          fontFamily: Fonts.body,
          backgroundColor: 'transparent',
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </DraftFieldCard>
  );
}

export function DirectionChip({
  label,
  selected,
  onPress,
  fill = true,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Share the row equally — right for a pair like "Friend paid / You paid".
   * Off for a wrapping set of options, where equal shares squeeze six labels
   * until "Cash" breaks across two lines.
   */
  fill?: boolean;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className={fill ? 'flex-1 rounded-2xl px-3 py-3' : 'rounded-2xl px-4 py-2'}
      style={{
        backgroundColor: selected ? theme.accent : 'transparent',
        borderColor: selected ? 'transparent' : theme.border,
        borderWidth: 1,
      }}>
      <TText
        className="text-center text-xs"
        style={{ color: selected ? theme.onAccent : theme.text, fontFamily: Fonts.title }}>
        {label}
      </TText>
    </Pressable>
  );
}

/** A Splits form's one action, pinned under its fields. */
export function PrimaryModalButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return <PrimaryButton label={label} loading={loading} onPress={onPress} />;
}

export function FloatingExpenseButton({ onPress }: { onPress: () => void }) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add split expense"
      onPress={onPress}
      className="absolute bottom-6 right-6 min-h-14 flex-row items-center gap-3 rounded-full px-6"
      style={{
        backgroundColor: theme.accent,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
        elevation: 8,
      }}>
      <MaterialCommunityIcons name="receipt-text-plus-outline" size={22} color={theme.onAccent} />
      <TText variant="button" style={{ color: theme.onAccent }}>
        Add expense
      </TText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  sheetHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  sheetBody: {
    gap: 12,
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetFooter: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  rowsCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  formRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  formRowLabel: {
    width: 92,
    fontSize: 14,
    lineHeight: 20,
  },
  formRowInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    fontSize: 16,
  },
});
