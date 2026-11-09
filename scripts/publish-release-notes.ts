/**
 * Publishes a release's notes from `lib/whats-new/` to the API, so builds
 * that don't have them yet can show the update card and the text notes.
 *
 *   npm run release-notes:publish -- --env staging
 *   npm run release-notes:publish -- --env production --version 13
 *   npm run release-notes:publish -- --env production --version 13 --min-supported
 *   npm run release-notes:publish -- --env staging --dry-run
 *
 * Needs two secrets in the environment, never in this repo:
 *   FINNRI_AUTH_BEARER   the API's AUTH_BEARER for that environment (every /v1/admin call passes it)
 *   FINNRI_ADMIN_TOKEN   the API's ADMIN_STATIC_TOKEN for that environment (sent as X-Admin-Token)
 *
 * Running it twice leaves one release: it updates the notes for that build if
 * they exist, creates them if not, then publishes. `--min-supported` forces
 * every older build to update; leave it off unless the release fixes something
 * critical. Without it, a release already marked stays marked.
 *
 * Previews and Try it links stay in the app: the API only carries text.
 */
import { BUNDLED_RELEASES } from '../lib/whats-new/releases';
import { releaseToApiPayload } from '../lib/whats-new/api-payload';

const API_URLS = {
  staging: 'https://ez-money-be-staging.up.railway.app',
  production: 'https://api.finnri.app',
} as const;

type Env = keyof typeof API_URLS;

type AdminRelease = { id: number; version_code: number; status: string; min_supported: boolean };

function readArgs(argv: string[]) {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const env = value('--env');
  if (env !== 'staging' && env !== 'production') {
    throw new Error('Pass --env staging or --env production.');
  }
  const version = value('--version');
  if (version !== undefined && !(Number.isInteger(Number(version)) && Number(version) > 0)) {
    throw new Error(`--version takes a versionCode such as 13, not "${version}".`);
  }
  return {
    env: env as Env,
    versionCode: version ? Number(version) : null,
    minSupported: argv.includes('--min-supported'),
    dryRun: argv.includes('--dry-run'),
  };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const release = args.versionCode
    ? BUNDLED_RELEASES.find((candidate) => candidate.versionCode === args.versionCode)
    : BUNDLED_RELEASES[0];
  if (!release) throw new Error(`No notes in lib/whats-new for versionCode ${args.versionCode}.`);

  const base = API_URLS[args.env];
  const bearer = process.env.FINNRI_AUTH_BEARER?.trim();
  const adminToken = process.env.FINNRI_ADMIN_TOKEN?.trim();

  if (args.dryRun) {
    console.log(`Would publish Finnri ${release.versionName} (${release.versionCode}) to ${base}:`);
    console.log(JSON.stringify(releaseToApiPayload(release, args.minSupported), null, 2));
    return;
  }
  if (!bearer || !adminToken) {
    throw new Error('Set FINNRI_AUTH_BEARER and FINNRI_ADMIN_TOKEN for this environment.');
  }

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        'X-Admin-Token': adminToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  };

  const { releases } = await call<{ releases: AdminRelease[] }>('GET', '/v1/admin/releases?platform=android');
  const existing = releases.find((candidate) => candidate.version_code === release.versionCode);
  const payload = releaseToApiPayload(release, args.minSupported || Boolean(existing?.min_supported));

  const saved = existing
    ? await call<AdminRelease>('PUT', `/v1/admin/releases/${existing.id}`, payload)
    : await call<AdminRelease>('POST', '/v1/admin/releases', payload);
  await call<AdminRelease>('POST', `/v1/admin/releases/${saved.id}/publish`);

  console.log(
    `${existing ? 'Updated' : 'Created'} and published Finnri ${release.versionName} (${release.versionCode}) on ${args.env}` +
      (payload.min_supported ? ', marked as the minimum supported build.' : '.')
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
