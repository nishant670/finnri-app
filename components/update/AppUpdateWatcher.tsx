import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { currentBuild, markNotesSeen, readSeenNotesBuild, useAppUpdateStore } from '@/lib/app-update';
import { hasCompletedOnboarding } from '@/lib/onboarding';

/**
 * Asks Play and the API about updates: on launch, and on return to the app at
 * most every six hours (`useAppUpdateStore.check`). Mounted once, in the root
 * layout, so a required update covers every screen, sign-in included.
 */
export function AppUpdateWatcher() {
  const check = useAppUpdateStore((state) => state.check);
  const offer = useAppUpdateStore((state) => state.offer);

  useEffect(() => {
    void check({ force: true });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  // A fresh install has nothing to catch up on: it starts with this build's
  // notes counted as seen. Someone who had the app before (onboarding done,
  // nothing stored yet) is the person the after-update sheet is for.
  useEffect(() => {
    void (async () => {
      if ((await readSeenNotesBuild()) !== null) return;
      if (!(await hasCompletedOnboarding())) await markNotesSeen(currentBuild());
    })();
  }, []);

  return offer.kind === 'required' ? <UpdateRequiredScreen /> : null;
}

/**
 * Blocks the app below the minimum supported build (board R15-UpdateRequired),
 * only ever set for a critical fix. Play's own full-screen update opens from
 * Update now; this screen is what stays if the person backs out of it.
 */
function UpdateRequiredScreen() {
  const { colors } = useThemeTokens();
  const offer = useAppUpdateStore((state) => state.offer);
  const startUpdate = useAppUpdateStore((state) => state.startUpdate);
  const release = offer.kind === 'required' ? offer.release : null;
  const fix = release?.items.find((item) => item.kind === 'fix');

  return (
    // Back does nothing: there is nowhere safe to go back to.
    <Modal visible animationType="fade" onRequestClose={() => undefined}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.phone, { borderColor: colors.text, backgroundColor: colors.card }]}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <View style={[styles.line, styles.lineShort, { backgroundColor: colors.border }]} />
              <View style={[styles.line, styles.lineMid, { backgroundColor: colors.border }]} />
            </View>
            <View style={[styles.arrow, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <MaterialCommunityIcons name="arrow-up" size={30} color={colors.onAccent} />
            </View>
          </View>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Update Finnri to keep going
          </ThemedText>
          <ThemedText tone="muted" style={styles.body}>
            This version has a problem we’ve fixed. Updating takes about a minute, and everything you’ve logged stays
            as it is.
          </ThemedText>
          {fix ? (
            <View style={[styles.fix, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.positive} />
              <View style={styles.fixText}>
                <ThemedText style={[styles.fixLabel, { color: colors.positive }]}>
                  Fixed in {release?.versionName}
                </ThemedText>
                <ThemedText style={[styles.fixBody, { color: colors.text }]}>{fix.title}</ThemedText>
              </View>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Update now" icon="download-outline" height={50} onPress={() => void startUpdate()} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 24 },
  art: { width: 132, height: 168, marginBottom: 18 },
  phone: {
    position: 'absolute',
    left: 24,
    top: 0,
    width: 84,
    height: 160,
    borderWidth: 6,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingTop: 18,
    gap: 8,
  },
  line: { height: 8, borderRadius: 4 },
  lineShort: { width: '70%' },
  lineMid: { width: '85%' },
  arrow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  fix: { alignSelf: 'stretch', marginTop: 14, flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  fixText: { flex: 1, gap: 2 },
  fixLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  fixBody: { fontSize: 14, lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingBottom: 16 },
});
