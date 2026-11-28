const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

// app.json locks the app to portrait. Android reads that lock as a hard
// requirement for a portrait screen, so Play hides the app from devices that
// can't report one (some Chromebooks, TVs, XR headsets) and flags the release.
// Declaring the feature optional keeps the portrait lock and lifts the filter.
const withOptionalPortraitScreen = (config) =>
  withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;
    manifest['uses-feature'] = [
      ...(manifest['uses-feature'] ?? []).filter(
        (entry) => entry?.$?.['android:name'] !== FEATURE,
      ),
      { $: { 'android:name': FEATURE, 'android:required': 'false' } },
    ];
    return nextConfig;
  });

module.exports = withOptionalPortraitScreen;
