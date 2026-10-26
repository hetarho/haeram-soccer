/** Dependency-scoped, JSON-only setup cache. Importing it never imports the engine or a UI. */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computationFingerprint, sourceGraph } from '../../scripts/lib/source-graph';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = fileURLToPath(import.meta.url);
const graph = sourceGraph(ROOT);
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const sources = new Map<string, string>();
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const STALE_LOCK_MS = 20 * 60 * 1000;
const FORMAT = 'dependency-json-cache-1';

export interface CacheOptions {
  /** The local module(s) whose code the builder executes. Defaults to the calling module. */
  dependencies?: string[];
  /** Closure inputs, release flags and explicit fixture/schema versions. */
  input?: unknown;
  /** Tests can isolate their store; off still deduplicates builds within the process. */
  directory?: string | 'off';
}

export function callerFile(skip: readonly string[] = []): string {
  for (const line of (new Error().stack ?? '').split('\n').slice(1)) {
    const match = /\(?((?:file:\/\/)?\/[^():]+\.[cm]?[jt]sx?)(?::\d+){0,2}\)?\s*$/.exec(
      line.trim(),
    );
    if (!match) continue;
    const file = match[1]!.startsWith('file://') ? fileURLToPath(match[1]!) : match[1]!;
    if (
      file !== SELF &&
      !skip.includes(file) &&
      file.startsWith(ROOT) &&
      !file.includes('node_modules')
    )
      return file;
  }
  throw new Error('A cached builder must name its local dependency module');
}

function identity(id: string, build: () => unknown, options: CacheOptions) {
  const entries = options.dependencies ?? [callerFile()];
  const scope = JSON.stringify(entries);
  let source = sources.get(scope);
  if (!source) {
    source = computationFingerprint(graph, entries, [
      'packages/catalogs/data',
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.json',
    ]).sha256;
    sources.set(scope, source);
  }
  const key = createHash('sha256')
    .update(JSON.stringify([FORMAT, source, options.input, build.toString(), id]))
    .digest('hex');
  const base =
    options.directory ??
    process.env.HAERAM_WORLD_CACHE ??
    join(ROOT, 'node_modules/.cache/haeram-worlds');
  const file =
    base === 'off'
      ? undefined
      : join(
          base,
          source.slice(0, 16),
          `${id.replace(/[^\w.-]+/g, '_').slice(0, 80)}-${key.slice(0, 20)}.json`,
        );
  return { key: `${base}:${key}`, file };
}

function existing(file: string): string | undefined {
  if (!existsSync(file)) return;
  const json = readFileSync(file, 'utf8');
  try {
    JSON.parse(json);
    return json;
  } catch {
    unlinkSync(file);
  }
}

function stale(lock: string) {
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

function acquire(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  try {
    const fd = openSync(lock, 'wx');
    writeFileSync(fd, String(process.pid));
    return () => {
      closeSync(fd);
      unlinkSync(lock);
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    try {
      if (stale(lock)) unlinkSync(lock);
    } catch {
      /* Another builder released it. */
    }
  }
}

function save(file: string, value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Cached setup must survive JSON');
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, json);
  renameSync(temp, file);
  return json;
}

export function cachedJson<T>(id: string, build: () => T, options: CacheOptions = {}): T {
  const { key, file } = identity(id, build, options);
  let json = memory.get(key);
  if (json === undefined) {
    if (!file) json = JSON.stringify(build());
    else
      for (;;) {
        json = existing(file);
        if (json !== undefined) break;
        const release = acquire(file);
        if (!release) {
          Atomics.wait(sleeper, 0, 0, 100);
          continue;
        }
        try {
          json = existing(file) ?? save(file, build());
        } finally {
          release();
        }
        break;
      }
    if (json === undefined) throw new Error('Cached setup must survive JSON');
    memory.set(key, json);
  }
  return JSON.parse(json) as T;
}

export async function cachedJsonAsync<T>(
  id: string,
  build: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const { key, file } = identity(id, build, options);
  const known = memory.get(key);
  if (known !== undefined) return JSON.parse(known) as T;
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      if (!file) return JSON.stringify(await build());
      for (;;) {
        const json = existing(file);
        if (json !== undefined) return json;
        const release = acquire(file);
        if (!release) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        try {
          return existing(file) ?? save(file, await build());
        } finally {
          release();
        }
      }
    })();
    pending.set(key, job);
  }
  try {
    const json = await job;
    if (json === undefined) throw new Error('Cached setup must survive JSON');
    memory.set(key, json);
    return JSON.parse(json) as T;
  } finally {
    pending.delete(key);
  }
}
