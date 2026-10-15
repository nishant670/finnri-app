import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DraftFieldCard } from '@/components/transactions/DraftFieldCard';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
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
      className="flex-row items-center gap-2 rounded-2xl px-3 py-2"
      style={{
        backgroundColor: selected ? theme.accent : theme.background,
        borderColor: selected ? theme.accent : theme.border,
        borderWidth: 1,
      }}>
      <MaterialCommunityIcons
        name={selected ? 'check-circle' : 'plus-circle-outline'}
        size={16}
        color={selected ? theme.onAccent : theme.accent}
      />
      <TText
        className="text-xs"
        style={{ color: selected ? theme.onAccent : theme.text, fontFamily: Fonts.title }}>
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
    <AnimatedBottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      {/*
        * `flexShrink` rather than a percentage max-height: a percentage
        * resolves against a parent that has no height of its own, which is what
        * left a three-field form clipping its last input and scrolling for no
        * reason. Shrinking means the sheet is exactly as tall as its content
        * until the keyboard leaves it less room, and only then does the list
        * inside start to scroll.
        */}
      <View
        className="rounded-t-[28px] border px-5 pb-8 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border, flexShrink: 1 }}>
        <View className="mb-4 flex-row items-center justify-between">
          <TText variant="sectionTitle">
            {title}
          </TText>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={20} color={theme.text} />
          </Pressable>
        </View>
        {errorMessage ? (
          <ErrorBanner message={errorMessage} style={{ marginBottom: 12 }} />
        ) : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: 12, paddingBottom: footer ? 12 : 0 }}>
          {children}
        </ScrollView>
        {footer ? (
          <View className="border-t pt-4" style={{ borderColor: theme.border }}>
            {footer}
          </View>
        ) : null}
      </View>
    </AnimatedBottomSheet>
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

export function PrimaryModalButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      className="mt-2 min-h-12 flex-row items-center justify-center gap-2"
      style={[
        { backgroundColor: theme.accent, borderRadius: 20, opacity: loading ? 0.75 : 1 },
        themeTokens.shadows.soft,
      ]}>
      {loading ? (
        <ActivityIndicator color={theme.onAccent} />
      ) : (
        <>
          <TText className="text-sm" style={{ color: theme.onAccent, fontFamily: Fonts.title }}>
            {label}
          </TText>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={theme.onAccent} />
        </>
      )}
    </Pressable>
  );
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
