import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { WhatsNewRelease } from '@/lib/whats-new/releases';

import { kindChipColors } from './WhatsNewContent';

const KIND_TAGS = { new: 'NEW', ui: 'NEW LOOK', fix: 'FIXED', improved: 'BETTER' } as const;

/** Most of what changed, without the screen: four rows is what fits above the buttons. */
const MAX_ROWS = 4;

type Props = {
  release: WhatsNewRelease | null;
  onSeeAll: () => void;
  onClose: () => void;
};

/**
 * The once-per-update sheet on the first open after updating (board
 * R15-AfterUpdate-Dark). Play updates most people on its own, so this, not the
 * update card, is where most of them hear what changed.
 */
export function WhatsNewSheet({ release, onSeeAll, onClose }: Props) {
  const theme = useThemeTokens();
  const { colors } = theme;
  const bottomInset = useBottomInset(20);
  // `release` goes null as the sheet starts closing; keep drawing it on the way out.
  const lastRelease = useRef(release);
  if (release) lastRelease.current = release;
  const shown = lastRelease.current;
  const rows = shown?.items.slice(0, MAX_ROWS) ?? [];

  return (
    <AnimatedBottomSheet visible={release !== null} onClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: bottomInset }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.head}>
          <View style={[styles.tile, { backgroundColor: colors.accent, borderColor: colors.secondary }]}>
            <MaterialCommunityIcons name="creation" size={30} color={colors.onAccent} />
          </View>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            You’re on Finnri {shown?.versionName}
          </ThemedText>
          <ThemedText tone="muted" style={styles.subtitle}>
            Here’s what changed since you last opened the app.
          </ThemedText>
        </View>

        <View style={[styles.list, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {rows.map((item, index) => {
            const chip = kindChipColors(item.kind, theme);
            return (
              <View
                key={item.title}
                style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <ThemedText numberOfLines={2} style={[styles.rowTitle, { color: colors.text }]}>
                  {item.title}
                </ThemedText>
                <View style={[styles.tag, { backgroundColor: chip.background }]}>
                  <ThemedText style={[styles.tagText, { color: chip.foreground }]}>{KIND_TAGS[item.kind]}</ThemedText>
                </View>
              </View>
            );
          })}
        </View>

        <PrimaryButton label="See everything new" icon="arrow-right" height={50} onPress={onSeeAll} />
        <PressableView onPress={onClose} accessibilityRole="button" style={styles.later} pressedStyle={styles.pressed}>
          <ThemedText style={[styles.laterText, { color: colors.text }]}>Got it</ThemedText>
        </PressableView>
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, gap: 14 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2 },
  head: { alignItems: 'center', gap: 8, paddingTop: 6 },
  tile: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 6, fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagText: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  laterText: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
