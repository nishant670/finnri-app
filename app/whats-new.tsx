import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { WhatsNewHero, WhatsNewSections } from '@/components/whats-new/WhatsNewContent';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { currentBuild, useAppUpdateStore } from '@/lib/app-update';
import {
  BUNDLED_RELEASES,
  findBundledRelease,
  releaseMonthLabel,
  type WhatsNewRelease,
} from '@/lib/whats-new/releases';

type Resolved = { release: WhatsNewRelease; live: boolean } | null;

/**
 * Which notes to show.
 *
 * A bundled release is this build's own, so it is live: previews and Try it.
 * A release from the API is a build not installed yet, so it is text, with
 * Update at the bottom (board R15-WhatsNew-SkyBefore). With no version asked
 * for, a pending update's notes come first, then this build's.
 */
function resolveRelease(version: number | null, pending: WhatsNewRelease[], hasOffer: boolean): Resolved {
  if (version) {
    const bundled = findBundledRelease(version);
    if (bundled) return { release: bundled, live: true };
    const upcoming = pending.find((release) => release.versionCode === version);
    return upcoming ? { release: upcoming, live: false } : null;
  }
  if (hasOffer && pending[0]) return { release: pending[0], live: false };
  const build = currentBuild();
  const own = BUNDLED_RELEASES.find((release) => release.versionCode <= build) ?? BUNDLED_RELEASES[0];
  return own ? { release: own, live: true } : null;
}

function AllUpdates() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {BUNDLED_RELEASES.map((release, index) => (
        <ListRow
          key={release.versionCode}
          icon="creation"
          hue="#6A4BBC"
          title={`Finnri ${release.versionName}`}
          meta={[releaseMonthLabel(release.month), `${release.items.length} changes`].filter(Boolean).join(' · ')}
          chevron
          divider={index > 0}
          onPress={() => router.push({ pathname: '/whats-new', params: { version: String(release.versionCode) } })}
        />
      ))}
    </View>
  );
}

export default function WhatsNewScreen() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{ version?: string; all?: string }>();
  const pending = useAppUpdateStore((state) => state.pending.releases);
  const offer = useAppUpdateStore((state) => state.offer);
  const download = useAppUpdateStore((state) => state.download);
  const startUpdate = useAppUpdateStore((state) => state.startUpdate);
  const restart = useAppUpdateStore((state) => state.restart);
  const bottomPadding = useBottomInset(24);

  const showAll = params.all === '1';
  const version = Number(params.version) || null;
  const resolved = showAll ? null : resolveRelease(version, pending, offer.kind !== 'none');
  const canUpdate = resolved !== null && !resolved.live && offer.kind !== 'none';

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={showAll ? 'All updates' : 'What’s new'}
        onBack={() => router.back()}
        rightText={showAll ? undefined : 'All updates'}
        onRightPress={showAll ? undefined : () => router.push({ pathname: '/whats-new', params: { all: '1' } })}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: canUpdate ? 24 : bottomPadding }]}>
        {showAll ? (
          <AllUpdates />
        ) : resolved ? (
          <>
            <WhatsNewHero release={resolved.release} />
            {!resolved.live ? (
              <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
                <MaterialCommunityIcons name="download-outline" size={20} color={colors.text} />
                <ThemedText style={[styles.noticeText, { color: colors.text }]}>
                  Update to try these. Once you’re on {resolved.release.versionName}, this page shows each new screen
                  in your own colours.
                </ThemedText>
              </View>
            ) : null}
            <WhatsNewSections release={resolved.release} live={resolved.live} />
            <ThemedText tone="muted" style={styles.footer}>
              Something not right? Profile → Feedback reaches us directly.
            </ThemedText>
          </>
        ) : (
          <ThemedText tone="muted" style={styles.footer}>
            No notes for this version yet.
          </ThemedText>
        )}
      </ScrollView>

      {canUpdate ? (
        <View
          style={[
            styles.updateBar,
            { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPadding },
          ]}>
          {download.phase === 'downloaded' ? (
            <PrimaryButton label="Restart to update" icon="restart" height={50} onPress={restart} />
          ) : (
            <PrimaryButton
              label={download.phase === 'downloading' ? 'Downloading…' : 'Update now'}
              icon="download-outline"
              height={50}
              disabled={download.phase === 'downloading'}
              onPress={() => void startUpdate()}
            />
          )}
          <ThemedText tone="muted" style={styles.updateCaption}>
            Downloads in the background while you use Finnri.
          </ThemedText>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  notice: { marginTop: 14, flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16 },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  footer: { marginTop: 18, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  updateBar: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  updateCaption: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
