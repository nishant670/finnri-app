import type { WhatsNewRelease } from './types';

/**
 * A bundled release as the API's admin endpoints take it, for
 * `scripts/publish-release-notes.ts`. Text and in-app links travel; previews
 * stay in the app, since only a build that has the screen can draw it.
 */
export function releaseToApiPayload(release: WhatsNewRelease, minSupported: boolean) {
  return {
    platform: 'android',
    version_code: release.versionCode,
    version_name: release.versionName,
    headline: release.headline,
    min_supported: minSupported,
    items: release.items.map((item) => ({
      kind: item.kind,
      title: item.title,
      body: item.body ?? '',
      problem: item.problem ?? '',
      fix: item.fix ?? '',
      deep_link: item.kind === 'new' && typeof item.link === 'string' ? item.link : '',
    })),
  };
}
