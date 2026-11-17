/**
 * Start worlds of the market-season harness: a lived world's first day stored once per seed and
 * year as a gzipped JSON snapshot under `.tmp/market-seasons/`, keyed by the measurement identity
 * of the code that built it, so a source change never reuses an older world. The store is generic
 * JSON (no engine import) and is separate from the shared world caches (`.git/haeram/worlds`,
 * `node_modules/.cache/haeram-worlds`), which measurements must not touch.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { toolMessage } from './tool-messages';

export const START_WORLD_DIR = '.tmp/market-seasons';
/** Most snapshots kept; the oldest by modification time go first. */
export const START_WORLD_CAP = 12;

export interface StartWorldKey {
  /** The measurement identity's sha256 of the world-building code and inputs. */
  identity: string;
  seed: string;
  year: number;
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/**
 * A file-name-safe key: identity prefix, a readable seed, the complete seed's hash and the year.
 * The readable part folds characters a file name cannot hold, so the hash keeps two seeds that
 * fold alike ('a/0' and 'a_0') apart.
 */
export function startWorldName(key: StartWorldKey): string {
  const seed = key.seed.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${key.identity.slice(0, 16)}-${seed}-${sha256(key.seed).slice(0, 16)}-${key.year}`;
}
const dataPath = (dir: string, key: StartWorldKey) => join(dir, `${startWorldName(key)}.json.gz`);
const sumPath = (dir: string, key: StartWorldKey) => join(dir, `${startWorldName(key)}.sha256`);

/** Removes the snapshots beyond `cap`, oldest first; `keep` (the entry just written) always stays. */
export function pruneStartWorlds(dir: string, cap = START_WORLD_CAP, keep?: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir)
    .filter((name) => name.endsWith('.json.gz'))
    .map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
  const removed: string[] = [];
  let kept = 0;
  for (const { name } of entries) {
    const base = name.replace(/\.json\.gz$/, '');
    if (base === keep || kept < cap) {
      kept++;
      continue;
    }
    rmSync(join(dir, name), { force: true });
    rmSync(join(dir, `${base}.sha256`), { force: true });
    removed.push(base);
  }
  return removed;
}

/** Stores `world` and returns the data file's path; the file appears whole or not at all. */
export function saveStartWorld(
  dir: string,
  key: StartWorldKey,
  world: unknown,
  cap = START_WORLD_CAP,
): string {
  mkdirSync(dir, { recursive: true });
  const bytes = gzipSync(Buffer.from(JSON.stringify(world)));
  const path = dataPath(dir, key),
    sum = sumPath(dir, key);
  // Each writer stages under its own name and publishes by rename, the checksum first, so a
  // concurrent writer of the same key never removes another's staging file and a reader never
  // sees a data file without its checksum. Writers of one key store the same world.
  const stage = `.${process.pid}.${randomBytes(6).toString('hex')}.part`;
  writeFileSync(sum + stage, sha256(bytes));
  writeFileSync(path + stage, bytes);
  renameSync(sum + stage, sum);
  renameSync(path + stage, path);
  pruneStartWorlds(dir, cap, startWorldName(key));
  return path;
}

/**
 * The stored world, or undefined when none is stored or its bytes no longer match the recorded
 * sha256 (a damaged entry is removed so the caller rebuilds it).
 */
export function loadStartWorld<T>(dir: string, key: StartWorldKey): T | undefined {
  return readStartWorldFile<T>(dataPath(dir, key), sumPath(dir, key), true);
}

/** A snapshot named by path (`file:<path>`); its sha256 sidecar is checked when present. */
export function loadStartWorldFile<T>(path: string): T {
  const sum = path.replace(/\.json\.gz$/, '.sha256');
  const world = readStartWorldFile<T>(path, sum, false);
  if (world === undefined) throw new Error(toolMessage('marketSeasons.noSnapshot', { path }));
  return world;
}

function readStartWorldFile<T>(path: string, sum: string, repair: boolean): T | undefined {
  if (!existsSync(path)) return undefined;
  const bytes = readFileSync(path);
  const expected = existsSync(sum) ? readFileSync(sum, 'utf8').trim() : undefined;
  if (expected !== undefined && expected !== sha256(bytes)) {
    if (!repair) throw new Error(toolMessage('marketSeasons.snapshotMismatch', { path }));
    rmSync(path, { force: true });
    rmSync(sum, { force: true });
    return undefined;
  }
  return JSON.parse(gunzipSync(bytes).toString('utf8')) as T;
}
