import { useCallback, useRef, useState } from 'react';

import { currentBuild, markNotesSeen, readSeenNotesBuild, useAppUpdateStore } from '@/lib/app-update';
import { unseenBundledReleases, type WhatsNewRelease } from '@/lib/whats-new/releases';

/**
 * Finds the notes for an update the person hasn't seen yet and holds them for
 * the after-update sheet. Once per update: closing the sheet, either way,
 * records this build as seen.
 *
 * A phone with nothing stored has had the app since before notes existed —
 * `AppUpdateWatcher` already marked fresh installs — so it counts as having
 * seen nothing and gets this build's notes.
 *
 * Home mounts under the splash on every cold start, whoever the user turns out
 * to be, so nothing is shown until the splash has gone. By then a locked or
 * signed-out launch has already replaced Home, and this check does not run.
 */
export function useWhatsNewAnnouncement({ canInterrupt }: { canInterrupt: () => boolean }) {
  const [release, setRelease] = useState<WhatsNewRelease | null>(null);
  const shownRef = useRef(false);

  const check = useCallback(async () => {
    if (shownRef.current || !useAppUpdateStore.getState().entered) return;
    const seen = await readSeenNotesBuild();
    const unseen = unseenBundledReleases(seen ?? 0, currentBuild());
    if (unseen.length === 0 || shownRef.current || !canInterrupt()) return;
    shownRef.current = true;
    setRelease(unseen[0]);
  }, [canInterrupt]);

  const close = useCallback(() => {
    setRelease(null);
    void markNotesSeen(currentBuild());
  }, []);

  return { release, check, close };
}
