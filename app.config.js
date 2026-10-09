/**
 * Android packaging, which depends on what the build is *for*.
 *
 * The settings that make a directly-installed APK small are the same settings
 * that make a Play Store AAB worse, so they cannot both live in `app.json`:
 *
 * - **Directly installed** (the APK sent to a phone over a link). Everything
 *   any device might need is in the one file, so the file carries whatever is
 *   not stripped out here: four ABIs where a phone runs one, and libraries
 *   stored uncompressed because Play would otherwise have compressed them.
 * - **Play Store** (`production`, an AAB). Play splits the bundle per device
 *   and compresses on the way down, so the upload keeps every ABI and leaves
 *   compression off — doing it here would shrink nothing and cost startup.
 *
 * `EAS_BUILD_PROFILE` is set by EAS on its builders. Locally it is unset, and
 * a local build is one going straight onto a handset, which is why unset means
 * the APK settings rather than the store ones.
 */
const isPlayStoreBundle = process.env.EAS_BUILD_PROFILE === 'production';

/**
 * Sentry's config plugin adds a source-map upload step to the native build,
 * which needs an org, a project and an auth token. Adding it unconditionally
 * would make every build depend on credentials that do not exist yet, so it is
 * added only once a DSN is configured. Until then the native build is exactly
 * what it was before crash reporting was introduced.
 *
 * Read inside the export rather than at module scope so it reflects the
 * environment the config is evaluated in, not the one at require time.
 */
const crashReportingEnabled = () => Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);

/**
 * The preview variant: a second copy of the app, installed beside the Play
 * Store one to test a build on the same phone.
 *
 * Android refuses to install an APK over an app signed with a different key,
 * and Play re-signs its copy, so a same-package test APK only goes on after
 * uninstalling the Play one — which drops the phone out of closed testing. A
 * different package is a different app: both install side by side, each with
 * its own data and sign-in.
 *
 * It gets its own URL schemes too. Google's Android sign-in returns to a scheme
 * named after the package (`app/auth.tsx` reads it from here), and if both apps
 * registered `com.finnri.app` the Play copy's sign-in could come back into this
 * one. The finnri.app invite App Link is dropped for the same reason, so
 * invites keep opening the Play copy.
 *
 * Set by the `preview` profile in `eas.json`. Unset everywhere else, so the
 * production build is exactly `app.json`.
 */
const isPreviewVariant = () => process.env.APP_VARIANT === 'preview';
const PREVIEW_PACKAGE = 'com.finnri.app.preview';

const withVariant = (config) =>
  isPreviewVariant()
    ? {
        ...config,
        name: 'Finnri Preview',
        scheme: ['finnri-preview', PREVIEW_PACKAGE],
        android: { ...config.android, package: PREVIEW_PACKAGE, intentFilters: [] },
      }
    : config;

module.exports = ({ config }) => ({
  ...withVariant(config),
  plugins: [
    ...config.plugins,
    ...(crashReportingEnabled() ? ['@sentry/react-native'] : []),
    [
      'expo-build-properties',
      {
        android: isPlayStoreBundle
          ? { useLegacyPackaging: false, enableBundleCompression: false }
          : {
              // One ABI instead of four. `x86`/`x86_64` are emulator-only and
              // every 64-bit handset runs `arm64-v8a`; building for an x86
              // emulator means building the `production` profile or adding the
              // ABI back here.
              buildArchs: ['arm64-v8a'],
              // Compress the native libraries. Larger on disk once installed,
              // much smaller to send.
              useLegacyPackaging: true,
              // Compress the JS bundle. Costs some cold-start time, because a
              // compressed bundle is extracted where an uncompressed one is
              // mapped straight into memory. Flip to `false` to trade the
              // ~3.5MB back for the startup.
              enableBundleCompression: true,
            },
      },
    ],
  ],
});
