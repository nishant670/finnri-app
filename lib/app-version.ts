import Constants from 'expo-constants';

/**
 * What the build is: `1.0.0 (8)`.
 *
 * The version alone read 1.0.0 on every build ever shipped, so two phones on
 * different builds could not be told apart from the screen a bug report quotes.
 * The Android version code is the number that changes per build.
 */
export const appVersion = Constants.expoConfig?.version ?? '1.0.0';

const buildNumber = Constants.expoConfig?.android?.versionCode;

export const appVersionLabel = buildNumber ? `${appVersion} (${buildNumber})` : appVersion;
