/**
 * Runs `eve extension build` and repairs the damage it does to package.json.
 *
 * `eve extension build` rewrites the `exports` field in place, assuming it owns
 * the whole package: it repoints `.` at the extension entry (`./dist/eve/...`)
 * and injects a top-level `./tools` entry. For `@vercel/blob` that is wrong --
 * `.` and `./client` are the real package entry points, and the extension is
 * published under the `./eve` namespace instead.
 *
 * This script therefore:
 *   1. snapshots package.json,
 *   2. runs `eve extension build`,
 *   3. merges eve's generated entries back under the `./eve` prefix while
 *      restoring every entry the package itself declares,
 *   4. restores the snapshot verbatim if anything goes wrong.
 *
 * The single source of truth for the package's own exports is package.json
 * itself -- nothing here is hardcoded, so adding a new export only ever
 * requires editing package.json.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(packageDir, 'package.json');

/**
 * Minimum Node version the eve CLI supports. The core SDK supports Node >=20
 * (see `engines`), and CI exercises 20.x and 22.x, so the extension build is
 * skipped rather than failing the whole build on those versions. `publint` and
 * `prepublishOnly` both run on >=24, so the published artifact always contains
 * the extension -- see `assertEveBuildable` below.
 */
const MIN_EVE_NODE_MAJOR = 24;

const nodeMajor = Number(process.versions.node.split('.')[0]);

if (nodeMajor < MIN_EVE_NODE_MAJOR) {
  // `--require-eve` is passed by `prepublishOnly`: a publish must never produce
  // a tarball whose `./eve` exports point at files that were never built.
  if (process.argv.includes('--require-eve')) {
    console.error(
      `[restore-package-exports] eve extension build requires Node >=${MIN_EVE_NODE_MAJOR}, but this is ${process.version}.`,
    );
    console.error(
      '[restore-package-exports] Refusing to publish @vercel/blob without the ./eve entry points.',
    );
    process.exit(1);
  }

  console.log(
    `[restore-package-exports] skipping eve extension build: requires Node >=${MIN_EVE_NODE_MAJOR}, running ${process.version}. The core dist is unaffected.`,
  );
  process.exit(0);
}

/** Namespace the extension is published under. */
const EVE_PREFIX = './eve';
/** Any export target below this directory is considered eve-generated. */
const EVE_DIST_PREFIX = './dist/eve/';

/**
 * Maps a key from eve's generated `exports` onto the subpath we publish it as.
 * `.` -> `./eve`, `./tools` -> `./eve/tools`, and so on for anything eve adds
 * in the future.
 */
function toPublishedSubpath(key) {
  return key === '.' ? EVE_PREFIX : `${EVE_PREFIX}${key.slice(1)}`;
}

/** True for subpaths we already publish the extension under (`./eve`, `./eve/...`). */
function isPublishedEveSubpath(key) {
  return key === EVE_PREFIX || key.startsWith(`${EVE_PREFIX}/`);
}

/** True when every target in an export entry points into `./dist/eve/`. */
function isEveGenerated(entry) {
  const targets = [];
  const collect = (value) => {
    if (typeof value === 'string') {
      targets.push(value);
    } else if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) collect(nested);
    }
  };
  collect(entry);
  return (
    targets.length > 0 &&
    targets.every((target) => target.startsWith(EVE_DIST_PREFIX))
  );
}

/**
 * Rebuilds the `exports` map: the package's own entries win, and eve's
 * generated entries are re-homed under `./eve`.
 *
 * @param original `exports` as committed in package.json (source of truth).
 * @param built    `exports` as left behind by `eve extension build`.
 */
function mergeExports(original, built) {
  // Everything the package declares that eve did not generate. This drops the
  // clobbered `.` (repointed at ./dist/eve) and keeps `.`/`./client` from the
  // snapshot below.
  const own = Object.fromEntries(
    Object.entries(original).filter(([, entry]) => !isEveGenerated(entry)),
  );

  // Eve emits its entry points at the package root (`.`, `./tools`, ...), so
  // re-home them under `./eve`. Keys already in that namespace are ones a
  // previous run of this script wrote and eve passed through untouched --
  // skipping them keeps us from nesting `./eve/eve` on every build.
  const generated = Object.fromEntries(
    Object.entries(built)
      .filter(
        ([key, entry]) => isEveGenerated(entry) && !isPublishedEveSubpath(key),
      )
      .map(([key, entry]) => [toPublishedSubpath(key), entry]),
  );

  // Preserve the committed key order, then append anything newly generated.
  const merged = {};
  for (const key of Object.keys(original)) {
    if (key in own) merged[key] = own[key];
    else if (key in generated) merged[key] = generated[key];
  }
  for (const [key, entry] of Object.entries(generated)) {
    if (!(key in merged)) merged[key] = entry;
  }
  return merged;
}

function serialize(packageJson) {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function runEveBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('eve', ['extension', 'build'], {
      cwd: packageDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) reject(new Error(`eve extension build killed by ${signal}`));
      else resolve(code ?? 0);
    });
  });
}

const snapshot = await readFile(packageJsonPath, 'utf8');
const original = JSON.parse(snapshot);

// The snapshot is our only record of the package's own entry points, so refuse
// to build on top of a package.json that eve already clobbered -- otherwise we
// would treat the damage as the source of truth and bake it in.
{
  const exportsField = original.exports ?? {};
  const damage = [];
  if (exportsField['.'] && isEveGenerated(exportsField['.'])) {
    damage.push('the "." export points into ./dist/eve');
  }
  if (exportsField['./tools']) {
    damage.push('a top-level "./tools" export is present');
  }
  if (damage.length > 0) {
    console.error(
      `[restore-package-exports] package.json looks like the output of a previous failed build (${damage.join('; ')}).`,
    );
    console.error(
      '[restore-package-exports] Restore it first (git checkout -- package.json), then re-run the build.',
    );
    process.exit(1);
  }
}

/** Puts package.json back exactly as we found it. */
async function restoreSnapshot() {
  const current = await readFile(packageJsonPath, 'utf8').catch(() => null);
  if (current !== snapshot) await writeFile(packageJsonPath, snapshot);
}

// If we are interrupted while eve owns package.json, still put it back.
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    try {
      // Synchronous on purpose: async work is not guaranteed to run here.
      writeFileSync(packageJsonPath, snapshot);
    } catch {
      /* best effort */
    }
    process.exit(1);
  });
}

let exitCode = 0;
try {
  exitCode = await runEveBuild();
  if (exitCode !== 0) {
    throw new Error(`eve extension build exited with code ${exitCode}`);
  }

  const built = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const merged = mergeExports(original.exports ?? {}, built.exports ?? {});

  if (!Object.keys(merged).some((key) => key.startsWith(EVE_PREFIX))) {
    throw new Error(
      'eve extension build produced no ./dist/eve exports; refusing to write a package.json without the extension entry points',
    );
  }

  // Rebase on the snapshot so any *other* field eve touched is reverted too.
  // Always write: the file on disk is eve's clobbered version at this point,
  // so "unchanged versus the snapshot" still means "needs writing back".
  await writeFile(packageJsonPath, serialize({ ...original, exports: merged }));
} catch (error) {
  await restoreSnapshot();
  console.error(
    `[restore-package-exports] ${error instanceof Error ? error.message : error}`,
  );
  console.error('[restore-package-exports] package.json restored unchanged.');
  process.exit(exitCode || 1);
}
