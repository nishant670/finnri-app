#!/usr/bin/env node
/**
 * Stops a build that has no "What's new" for the version it will install.
 *
 * Notes are written by hand, one file per release in `lib/whats-new/`. Twice a
 * build went out without them (Play 14, and every staging APK after 1.1), so
 * phones updated and showed nothing new. This runs on EAS before `npm install`
 * (`eas-build-pre-install` in package.json) and can be run first by hand:
 *
 *   npm run release-notes:check -- --profile preview
 *   npm run release-notes:check -- --profile production
 *
 * - production: EAS has already raised `app.json`'s versionCode for this
 *   build, so notes must exist for exactly that number.
 * - preview: the build stages the next Play release, so its newest notes must
 *   be newer than the last Play build recorded in `app.json`.
 * - anything else (development): nothing to check.
 *
 * ALLOW_NO_RELEASE_NOTES=1 lets a build through anyway, with a warning.
 * Plain Node only: it runs before dependencies are installed.
 */
/* global __dirname */
const fs = require('fs');
const path = require('path');

const { readReleaseNotesIndex } = require('./release-notes-index');

function readProfile(argv) {
  const index = argv.indexOf('--profile');
  return index >= 0 ? argv[index + 1] : process.env.EAS_BUILD_PROFILE;
}

function checkReleaseNotes({ profile, recorded, notes }) {
  const newest = notes[0];
  if (profile === 'production') {
    if (notes.some((release) => release.versionCode === recorded)) return null;
    return `No notes for versionCode ${recorded}. Add lib/whats-new/<version>.ts with versionCode: ${recorded} and list it in releases.ts.`;
  }
  if (profile === 'preview') {
    if (newest && newest.versionCode > recorded) return null;
    return (
      `This staging build has no notes newer than Play build ${recorded}` +
      `${newest ? ` (newest is ${newest.versionName}, versionCode ${newest.versionCode})` : ''}. ` +
      `Add lib/whats-new/<next version>.ts with versionCode: ${recorded + 1}, or add to it if it exists.`
    );
  }
  return null;
}

function main() {
  const profile = readProfile(process.argv.slice(2));
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const recorded = appJson.expo?.android?.versionCode ?? 0;
  const problem = checkReleaseNotes({ profile, recorded, notes: readReleaseNotesIndex() });
  if (!problem) {
    if (profile === 'production' || profile === 'preview') console.log(`Release notes: ok for ${profile}.`);
    return;
  }
  if (process.env.ALLOW_NO_RELEASE_NOTES === '1') {
    console.warn(`Release notes (allowed through): ${problem}`);
    return;
  }
  console.error(`Release notes missing: ${problem}`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = { checkReleaseNotes };
