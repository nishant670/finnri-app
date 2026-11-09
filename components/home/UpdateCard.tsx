import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useAppUpdateStore } from '@/lib/app-update';

/**
 * The update card at the top of Home's feed (board R15-Home-Update): a newer
 * build is ready, then its download, then Restart. Never a pop-up: it waits
 * for the person, and "hide for now" holds for three days.
 *
 * The text is the next build's headline from the API: this build can't know
 * what the next one contains.
 */
export function UpdateCard() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const offer = useAppUpdateStore((state) => state.offer);
  const download = useAppUpdateStore((state) => state.download);
  const startUpdate = useAppUpdateStore((state) => state.startUpdate);
  const restart = useAppUpdateStore((state) => state.restart);
  const dismiss = useAppUpdateStore((state) => state.dismiss);

  if (offer.kind !== 'card') return null;

  const name = offer.release?.versionName ? `Finnri ${offer.release.versionName}` : 'A new Finnri';
  const downloading = download.phase === 'downloading';
  const downloaded = download.phase === 'downloaded';
  const percent = downloading ? Math.round(download.progress * 100) : 0;
  const title = downloaded ? `${name} is downloaded` : downloading ? `Downloading ${name}` : `${name} is ready`;
  const body = downloaded
    ? 'Restart to finish. It takes a few seconds, and everything you’ve logged stays.'
    : downloading
      ? 'Keep using Finnri. We’ll tell you when it’s ready.'
      : download.phase === 'failed'
        ? 'The download didn’t finish. Check your connection and try again.'
        : (offer.release?.headline ?? 'New features and fixes are ready.');

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="summary"
      testID="update-card">
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: colors.accent }]}>
          <MaterialCommunityIcons
            name={downloaded ? 'check-circle-outline' : 'creation'}
            size={22}
            color={colors.onAccent}
          />
        </View>
        <View style={styles.text}>
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
          <ThemedText tone="muted" style={styles.body}>
            {body}
          </ThemedText>
        </View>
        {!downloading && !downloaded ? (
          <PressableView
            onPress={() => void dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Hide for now"
            style={styles.close}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
          </PressableView>
        ) : null}
      </View>

      {downloading ? (
        <View style={styles.progressBlock}>
          <View
            style={[styles.track, { backgroundColor: colors.track }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: percent }}>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.max(percent, 3)}%` }]} />
          </View>
          <View style={styles.progressLine}>
            <ThemedText tone="muted" style={styles.caption}>
              Downloading in the background
            </ThemedText>
            <ThemedText style={[styles.caption, styles.bold, { color: colors.text }]}>{percent}%</ThemedText>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          variant="outline"
          label="What’s new"
          height={44}
          style={styles.action}
          onPress={() => router.push('/whats-new')}
        />
        {downloaded ? (
          <PrimaryButton label="Restart" icon="restart" height={44} style={styles.action} onPress={restart} />
        ) : (
          <PrimaryButton
            label={downloading ? 'Downloading…' : 'Update'}
            icon="download-outline"
            height={44}
            style={styles.action}
            disabled={downloading}
            onPress={() => void startUpdate()}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 8,
    gap: 14,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3, paddingTop: 1 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  close: { width: 44, height: 44, marginTop: -10, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  pressed: { opacity: 0.6 },
  progressBlock: { gap: 8, paddingRight: 8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  progressLine: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { fontSize: 12, lineHeight: 16 },
  bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, paddingRight: 8 },
  action: { flex: 1 },
});
