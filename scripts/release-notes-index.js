/* global __dirname */
const fs = require('fs');
const path = require('path');

/**
 * The release notes in `lib/whats-new/`, read as plain text so that
 * `app.config.js` and the EAS pre-install check can use them without
 * TypeScript or `node_modules` (the check runs before `npm install`).
 *
 * A notes file is named after its version, `1.3.ts`, and holds one
 * `versionCode: 15` and one `versionName: '1.3'`. `__tests__/appUpdate.test.ts`
 * checks this list against `BUNDLED_RELEASES`, so the two can't drift apart.
 */
const NOTES_DIR = path.join(__dirname, '..', 'lib', 'whats-new');
const NOTES_FILE = /^\d+(\.\d+)+\.ts$/;

/** Every notes file as `{ file, versionCode, versionName }`, newest first. */
function readReleaseNotesIndex(dir = NOTES_DIR) {
  return fs
    .readdirSync(dir)
    .filter((file) => NOTES_FILE.test(file))
    .map((file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      const code = source.match(/versionCode:\s*(\d+)/);
      const name = source.match(/versionName:\s*['"]([^'"]+)['"]/);
      if (!code || !name) throw new Error(`lib/whats-new/${file} has no versionCode or versionName.`);
      return { file, versionCode: Number(code[1]), versionName: name[1] };
    })
    .sort((a, b) => b.versionCode - a.versionCode);
}

module.exports = { readReleaseNotesIndex };
