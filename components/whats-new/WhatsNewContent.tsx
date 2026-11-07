import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  releaseCountChips,
  releaseMonthLabel,
  type WhatsNewItem,
  type WhatsNewKind,
  type WhatsNewRelease,
} from '@/lib/whats-new/releases';

import { PREVIEWS, PreviewFrame } from './previews';

type Theme = ReturnType<typeof useThemeTokens>;

/**
 * Each kind's chip. "New" takes the mood's own tint; the others are fixed
 * hues so a kind looks the same in every mood. "Improved" is neutral ink, so it
 * never reads as Sky's accent, and "New look" goes a deeper violet under Plum
 * so it stays apart from Plum's accent.
 */
export function kindChipColors(kind: WhatsNewKind, { colors, mode, mood }: Theme) {
  if (kind === 'new') return { background: colors.secondary, foreground: colors.text };
  if (kind === 'fix') return { background: mixHex(colors.card, colors.positive, 0.16), foreground: colors.positive };
  if (kind === 'improved') return { background: mixHex(colors.card, colors.text, 0.07), foreground: colors.text };
  const plum = mood.themeColor === 'plum';
  if (mode === 'dark') return { background: plum ? '#1E1B4B' : '#2E1A4A', foreground: plum ? '#A5B4FC' : '#D8B4FE' };
  return { background: plum ? '#E0E7FF' : '#F3E8FC', foreground: plum ? '#3730A3' : '#6B2BB0' };
}

const KIND_LABELS: Record<WhatsNewKind, string> = { new: 'New', ui: 'New look', fix: 'Fixed', improved: 'Better' };
const KIND_ICONS: Record<WhatsNewKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  new: 'creation',
  ui: 'palette-outline',
  fix: 'check',
  improved: 'arrow-up-thin',
};

export function KindChip({ kind }: { kind: WhatsNewKind }) {
  const theme = useThemeTokens();
  const { background, foreground } = kindChipColors(kind, theme);
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <MaterialCommunityIcons name={KIND_ICONS[kind]} size={13} color={foreground} />
      <ThemedText style={[styles.chipText, { color: foreground }]}>{KIND_LABELS[kind]}</ThemedText>
    </View>
  );
}

/** The coloured block at the top: version, month, headline and the count chips. */
export function WhatsNewHero({ release }: { release: WhatsNewRelease }) {
  const { colors } = useThemeTokens();
  const month = releaseMonthLabel(release.month);
  const changes = release.items.length;
  const ring = mixHex(colors.accent, '#FFFFFF', 0.35);
  return (
    <View style={[styles.hero, { backgroundColor: colors.accent }]} accessibilityRole="header">
      <View style={[styles.ringLarge, { borderColor: ring }]} />
      <ThemedText tone="onAccent" style={styles.heroMeta}>
        {[month, `${changes} ${changes === 1 ? 'change' : 'changes'}`].filter(Boolean).join(' · ')}
      </ThemedText>
      <ThemedText tone="onAccent" style={styles.heroVersion}>
        Finnri {release.versionName}
      </ThemedText>
      <ThemedText tone="onAccent" style={styles.heroHeadline}>
        {release.headline}
      </ThemedText>
      <View style={styles.heroChips}>
        {releaseCountChips(release).map((chip) => (
          <View key={chip.kind} style={[styles.heroChip, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.heroChipText, { color: colors.text }]}>{chip.label}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function TryIt({ link }: { link: NonNullable<WhatsNewItem['link']> }) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  return (
    <PressableView
      onPress={() => router.push(link)}
      accessibilityRole="link"
      style={styles.tryIt}
      pressedStyle={styles.pressed}>
      <ThemedText style={[styles.tryItText, { color: colors.text }]}>Try it</ThemedText>
      <MaterialCommunityIcons name="arrow-right" size={16} color={colors.text} />
    </PressableView>
  );
}

function FixRows({ problem, fix }: { problem: string; fix: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.fixBox, { borderColor: colors.border }]}>
      <View style={[styles.fixRow, { backgroundColor: colors.warningSurface }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.warning} />
        <View style={styles.flex}>
          <ThemedText style={[styles.fixLabel, { color: colors.warning }]}>What was happening</ThemedText>
          <ThemedText style={[styles.body, { color: colors.text }]}>{problem}</ThemedText>
        </View>
      </View>
      <View style={[styles.fixRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
        <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.positive} />
        <View style={styles.flex}>
          <ThemedText style={[styles.fixLabel, { color: colors.positive }]}>What we fixed</ThemedText>
          <ThemedText style={[styles.body, { color: colors.text }]}>{fix}</ThemedText>
        </View>
      </View>
    </View>
  );
}

/**
 * One card. `live` draws previews and Try it: true once this build has the
 * feature, false for notes about a build not installed yet.
 */
export function WhatsNewCard({ item, live }: { item: WhatsNewItem; live: boolean }) {
  const { colors } = useThemeTokens();
  const Preview = live && item.preview ? PREVIEWS[item.preview] : null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {Preview ? (
        <PreviewFrame>
          <Preview />
        </PreviewFrame>
      ) : null}
      <View style={styles.cardBody}>
        <KindChip kind={item.kind} />
        <ThemedText style={[styles.cardTitle, { color: colors.text }]}>{item.title}</ThemedText>
        {item.body ? (
          <ThemedText tone="muted" style={styles.body}>
            {item.body}
          </ThemedText>
        ) : null}
        {item.kind === 'fix' && item.problem && item.fix ? <FixRows problem={item.problem} fix={item.fix} /> : null}
        {live && item.kind === 'new' && item.link ? <TryIt link={item.link} /> : null}
      </View>
    </View>
  );
}

const SECTIONS: { kind: WhatsNewKind; title: string }[] = [
  { kind: 'new', title: 'New for you' },
  { kind: 'ui', title: 'A fresh look' },
  { kind: 'fix', title: 'Fixed' },
  { kind: 'improved', title: 'Small things, better' },
];

/** Every card of a release, grouped by kind in the boards' order. */
export function WhatsNewSections({ release, live }: { release: WhatsNewRelease; live: boolean }) {
  const { colors } = useThemeTokens();
  return (
    <>
      {SECTIONS.map(({ kind, title }) => {
        const items = release.items.filter((item) => item.kind === kind);
        if (items.length === 0) return null;
        return (
          <View key={kind} style={styles.section}>
            <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
              {title}
            </ThemedText>
            {items.map((item) => (
              <WhatsNewCard key={item.title} item={item} live={live} />
            ))}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  chip: {
    alignSelf: 'flex-start',
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  hero: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    gap: 10,
    overflow: 'hidden',
  },
  ringLarge: {
    position: 'absolute',
    right: -26,
    top: -40,
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 16,
  },
  heroMeta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  heroVersion: { fontSize: 40, lineHeight: 46, fontWeight: '900' },
  heroHeadline: { fontSize: 17, lineHeight: 24, fontWeight: '500', maxWidth: 300 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  heroChip: { height: 30, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 15 },
  heroChipText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  section: { marginTop: 28, gap: 14 },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  cardBody: { padding: 16, gap: 8 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  fixBox: { marginTop: 4, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  fixRow: { flexDirection: 'row', gap: 10, padding: 12 },
  fixLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', marginBottom: 2 },
  tryIt: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  tryItText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
