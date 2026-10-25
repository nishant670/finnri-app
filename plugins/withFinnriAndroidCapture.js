const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withStringsXml,
} = require('expo/config-plugins');

const PLUGIN_ROOT = path.join(__dirname, 'finnri-android-capture');

const replaceNamedEntry = (entries, name, value) => [
  ...(entries ?? []).filter((entry) => entry?.$?.['android:name'] !== name),
  value,
];

const withCaptureManifest = (config) =>
  withAndroidManifest(config, (nextConfig) => {
    const application = nextConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('Finnri capture plugin could not find Android application.');

    application.activity = replaceNamedEntry(application.activity, '.FinnriCaptureActivity', {
      $: {
        'android:name': '.FinnriCaptureActivity',
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:theme': '@style/FinnriCaptureTheme',
        // No fixed orientation: Android 8.0 refuses to start a translucent
        // activity that requests one, and the capture sheet is translucent.
      },
    });
    application.service = replaceNamedEntry(application.service, '.CaptureTileService', {
      $: {
        'android:name': '.CaptureTileService',
        'android:exported': 'true',
        'android:label': '@string/capture_tile_label',
        'android:icon': '@drawable/ic_mic_widget',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
      ],
    });
    application.receiver = replaceNamedEntry(application.receiver, '.FinnriWidgetProvider', {
      $: { 'android:name': '.FinnriWidgetProvider', 'android:exported': 'false' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/finnri_widget_info',
          },
        },
      ],
    });
    return nextConfig;
  });

const withCaptureStrings = (config) =>
  withStringsXml(config, (nextConfig) => {
    const values = {
      capture_tile_label: 'Capture expense',
      widget_description: 'Log an expense by speaking or typing',
      widget_prompt: 'Log an expense',
      widget_type_label: 'Type an expense',
      widget_speak_label: 'Speak an expense',
    };
    const names = new Set(Object.keys(values));
    const strings = (nextConfig.modResults.resources.string ?? []).filter(
      (entry) => !names.has(entry?.$?.name)
    );
    nextConfig.modResults.resources.string = [
      ...strings,
      ...Object.entries(values).map(([name, value]) => ({ $: { name }, _: value })),
    ];
    return nextConfig;
  });

const withCaptureStyle = (config) =>
  withAndroidStyles(config, (nextConfig) => {
    const styles = (nextConfig.modResults.resources.style ?? []).filter(
      (style) => style?.$?.name !== 'FinnriCaptureTheme'
    );
    styles.push({
      $: { name: 'FinnriCaptureTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
      // Colours come from `res/values/finnri_capture_colors.xml` (and its
      // values-night twin), which the resource copy below drops in beside the
      // app's own. The window is translucent: the capture sheet (board
      // R14-Capture) sits over a dimmed lock or home screen. `colorAccent` is
      // what tints AppCompat widgets; off-palette, the button rendered purple.
      item: [
        { $: { name: 'android:windowIsTranslucent' }, _: 'true' },
        { $: { name: 'android:windowBackground' }, _: '@android:color/transparent' },
        { $: { name: 'android:colorAccent' }, _: '@color/finnri_accent' },
        { $: { name: 'android:windowLightStatusBar' }, _: 'false' },
        { $: { name: 'android:statusBarColor' }, _: '@android:color/transparent' },
        { $: { name: 'android:navigationBarColor' }, _: '@color/finnri_background' },
      ],
    });
    nextConfig.modResults.resources.style = styles;
    return nextConfig;
  });

const copyTree = (source, destination, transform) => {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, destinationPath, transform);
      continue;
    }
    const content = fs.readFileSync(sourcePath);
    fs.writeFileSync(destinationPath, transform ? transform(content.toString('utf8')) : content);
  }
};

const withCaptureSources = (config) =>
  withDangerousMod(config, [
    'android',
    (nextConfig) => {
      const androidRoot = nextConfig.modRequest.platformProjectRoot;
      const packageName = nextConfig.android?.package ?? 'com.finnri.app';
      const packagePath = packageName.split('.').join(path.sep);
      copyTree(
        path.join(PLUGIN_ROOT, 'java', 'com', 'finnri', 'app'),
        path.join(androidRoot, 'app', 'src', 'main', 'java', packagePath),
        (content) => content.replace(/^package com\.finnri\.app/m, `package ${packageName}`)
      );
      copyTree(
        path.join(PLUGIN_ROOT, 'res'),
        path.join(androidRoot, 'app', 'src', 'main', 'res')
      );
      return nextConfig;
    },
  ]);

module.exports = function withFinnriAndroidCapture(config) {
  config = withCaptureManifest(config);
  config = withCaptureStrings(config);
  config = withCaptureStyle(config);
  return withCaptureSources(config);
};
