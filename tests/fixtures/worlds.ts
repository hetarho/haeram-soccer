import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Founding, World } from '../../packages/contracts/src/types';
import { advanceRound, createWorld, simulateSeason } from '../../packages/engine/src/index';

/**
 * Simulated test worlds, built once and shared.
 *
 * A season of the own league costs seconds, so a test that only needs a world in some state
 * (after a season close, a few rounds in, ten seasons on) takes it from here instead of
 * simulating it again. Each state is built once per source tree: kept in memory for the file
 * and on disk under `node_modules/.cache/haeram-worlds/<source hash>` for every other file and
 * run. The key covers every non-test `.ts`/`.json` source under `packages/*\/src`, catalog data,
 * `apps/*\/src` and `tests/fixtures`, the id, the builder's code and the calling test file, so a
 * changed engine, adapter, builder or test rebuilds it. Directories of other source trees older
 * than two days are removed. Values must survive JSON (worlds do, exactly). Each call returns a
 * fresh copy.
 *
 * `HAERAM_WORLD_CACHE=off` keeps the cache in memory only; `HAERAM_WORLD_CACHE=<dir>` moves it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = fileURLToPath(import.meta.url);
const memory = new Map<string, string>();
let sources: string | undefined;

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) walk(path, out);
    else if (/\.(ts|json)$/.test(name.name) && !/\.test\.ts$/.test(name.name)) out.push(path);
  }
}

/** One hash of every non-test source the simulation can read. */
function sourceHash() {
  if (sources) return sources;
  const files: string[] = [];
  for (const pkg of readdirSync(join(ROOT, 'packages')))
    walk(join(ROOT, 'packages', pkg, 'src'), files);
  for (const app of readdirSync(join(ROOT, 'apps'))) walk(join(ROOT, 'apps', app, 'src'), files);
  walk(join(ROOT, 'packages', 'catalogs', 'data'), files);
  walk(join(ROOT, 'tests', 'fixtures'), files);
  const hash = createHash('sha256');
  // This module's caching does not shape a state; simulatedWorld's builder code is in its key.
  for (const file of files.filter((file) => file !== SELF).sort())
    hash.update(relative(ROOT, file)).update('\0').update(readFileSync(file));
  return (sources = hash.digest('hex'));
}

/** The first stack frame outside this module: the test (or fixture) file that asked. */
function callerFile() {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n').slice(1)) {
    const match = /\(?((?:file:\/\/)?\/[^():]+\.[cm]?[jt]sx?)(?::\d+){0,2}\)?\s*$/.exec(
      line.trim(),
    );
    if (!match) continue;
    const file = match[1].startsWith('file://') ? fileURLToPath(match[1]) : match[1];
    if (file !== SELF && file.startsWith(ROOT) && !file.includes('node_modules')) return file;
  }
  return undefined;
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = (ms: number) => Atomics.wait(sleeper, 0, 0, ms);
/** A builder that has not written its state after this long is taken to have died. */
const STALE_LOCK_MS = 20 * 60 * 1000;

/** A lock is stale when its builder process is gone (a killed run) or it outlived STALE_LOCK_MS. */
function staleLock(lock: string) {
  if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) return true;
  const pid = Number(readFileSync(lock, 'utf8'));
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

const KEEP_OTHER_TREES_MS = 2 * 24 * 60 * 60 * 1000;
let directory: string | null | undefined;

/** This source tree's cache directory; older trees' directories are cleared on first use. */
function cacheDir() {
  if (directory !== undefined) return directory ?? undefined;
  const setting = process.env.HAERAM_WORLD_CACHE;
  if (setting === 'off') return (directory = null) ?? undefined;
  const base = setting || join(ROOT, 'node_modules', '.cache', 'haeram-worlds'),
    tree = sourceHash().slice(0, 16);
  mkdirSync(join(base, tree), { recursive: true });
  for (const name of readdirSync(base)) {
    const path = join(base, name);
    try {
      if (name !== tree && Date.now() - statSync(path).mtimeMs > KEEP_OTHER_TREES_MS)
        rmSync(path, { recursive: true, force: true });
    } catch {
      // Another worker cleared it first.
    }
  }
  return (directory = join(base, tree));
}

function fromDisk(file: string, build: () => unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  for (;;) {
    if (existsSync(file)) return readFileSync(file, 'utf8');
    let fd: number;
    try {
      fd = openSync(lock, 'wx');
      writeFileSync(fd, String(process.pid));
    } catch {
      // Another worker builds the same state: wait for it rather than simulate twice.
      try {
        if (staleLock(lock)) unlinkSync(lock);
      } catch {
        // The lock went away between the checks; look again.
      }
      pause(250);
      continue;
    }
    try {
      const json = JSON.stringify(build());
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, json);
      renameSync(temp, file);
      return json;
    } finally {
      closeSync(fd);
      unlinkSync(lock);
    }
  }
}

function cached<T>(id: string, build: () => T, scope: string | undefined): T {
  const key = createHash('sha256')
    .update(sourceHash())
    .update('\0')
    .update(id)
    .update('\0')
    .update(build.toString())
    .update('\0')
    .update(scope ? readFileSync(scope) : '')
    .digest('hex');
  let json = memory.get(key);
  if (json === undefined) {
    const dir = cacheDir();
    const name = `${id.replace(/[^\w.-]+/g, '_').slice(0, 80)}-${key.slice(0, 20)}.json`;
    json = dir ? fromDisk(join(dir, name), build) : JSON.stringify(build());
    memory.set(key, json);
  }
  return JSON.parse(json) as T;
}

/**
 * A fresh copy of the state `build` returns, built once per source tree. `id` names the state
 * within the calling file; `build` must be self-contained (closure values are not part of the key,
 * only its code and the calling file's text).
 */
export function cachedWorld<T = World>(id: string, build: () => T): T {
  return cached(id, build, callerFile());
}

export interface Simulated {
  /** Whole seasons simulated (closed) after founding. */
  seasons?: number;
  /** Rounds then played into the next season, unobserved. */
  rounds?: number;
}

/**
 * `createWorld(input)` after `seasons` closed seasons and `rounds` unobserved rounds — the same
 * world the inline calls give, shared by every file that asks for the same founding and span.
 */
export function simulatedWorld(input: Founding, span: Simulated = {}): World {
  const { seasons = 0, rounds = 0 } = span;
  const id = `sim:${JSON.stringify(input)}:${seasons}:${rounds}`;
  return cached(
    id,
    () => {
      const w =
        rounds > 0
          ? simulatedWorld(input, { seasons })
          : seasons > 0
            ? simulatedWorld(input, { seasons: seasons - 1 })
            : createWorld(input);
      if (rounds > 0) for (let n = 0; n < rounds; n++) advanceRound(w, undefined, false);
      else if (seasons > 0) simulateSeason(w);
      return w;
    },
    undefined,
  );
}
