import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PressableView, type PressableViewProps } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type ScreenProps = SafeAreaViewProps & {
  padded?: boolean;
};

export function Screen({ style, padded = false, children, ...props }: ScreenProps) {
  const theme = useThemeTokens();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: padded ? theme.components.screen.horizontalPadding : 0,
        },
        style,
      ]}
      {...props}>
      {children}
    </SafeAreaView>
  );
}

type CardProps = ViewProps & {
  compact?: boolean;
};

export function Card({ style, compact = false, children, ...props }: CardProps) {
  const theme = useThemeTokens();
  const card = compact ? theme.components.compactCard : theme.components.card;

  return (
    <View
      style={[
        {
          backgroundColor: theme.mode === 'dark' ? theme.colors.card : '#FFFFFF',
          borderColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(45,45,45,0.04)',
          borderRadius: card.radius,
          borderWidth: StyleSheet.hairlineWidth,
          padding: card.padding,
        },
        theme.shadows.soft,
        style,
      ]}
      {...props}>
      {children}
    </View>
  );
}

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const theme = useThemeTokens();

  return (
    <View style={styles.sectionHeader}>
      <ThemedText variant="sectionTitle" style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18 }}>
        {title}
      </ThemedText>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <ThemedText variant="captionStrong" style={{ color: theme.colors.accent }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

type TextActionProps = Omit<PressableViewProps, 'children'> & {
  label: string;
  expanded?: boolean;
  children?: ReactNode;
};

export function TextAction({ label, expanded, style, children, ...props }: TextActionProps) {
  const theme = useThemeTokens();

  return (
    <PressableView
      accessibilityRole="button"
      hitSlop={10}
      style={[
        styles.textAction,
        {
          minHeight: theme.components.textAction.minHeight,
          gap: theme.components.textAction.gap,
        },
        style,
      ]}
      pressedStyle={{ opacity: 0.7 }}
      {...props}>
      <ThemedText variant="captionStrong" style={{ color: theme.colors.accent }}>
        {label}
      </ThemedText>
      {children}
    </PressableView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  textAction: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
