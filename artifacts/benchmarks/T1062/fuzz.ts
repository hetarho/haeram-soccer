/**
 * T1062-validation-parity, mutation part: seeded single-point mutations of a captured game's stored
 * world, compared two ways.
 *  - schema level: for a random schema node of the world and its value, `zodParse(node, v)` against
 *    `node.safeParse(v)`: same accept/reject, the same output (key order, undefined, −0), the same
 *    issues; and whether the fast path itself accepted (Zod's parse not called).
 *  - world level: the baseline tree's `validateWorld` against the candidate's on the whole mutated
 *    world with the same catalog and store: same result hash or the same error (class, message,
 *    Zod issues).
 *   node --import tsx fuzz.ts --db <file> --base <tree> --candidate <tree> [--nodes 4000] [--worlds 60] [--seed s]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sqlRecordStore } from '../../../apps/web/src/adapters/sqlRecordStore';
import { rowsToWorld } from '../../../apps/web/src/adapters/worldRows';
import { nodeSqliteDriver } from '../../../tests/fixtures/node-sqlite';
import { canonical } from '../../../packages/contracts/src/index';
import { LOAD_CATALOG } from '../../../packages/catalogs/src/index';

const args = process.argv.slice(2);
const flag = (n: string, f?: string) => (args.indexOf(n) < 0 ? f : args[args.indexOf(n) + 1]);
/* eslint-disable @typescript-eslint/no-explicit-any */
const schemaOf = async (tree: string) =>
  (await import(pathToFileURL(resolve(tree, 'packages/contracts/src/schema.ts')).href)) as any;
const base = await schemaOf(flag('--base')!);
const cand = await schemaOf(flag('--candidate')!);
const store = sqlRecordStore(
  nodeSqliteDriver(':memory:', new Uint8Array(readFileSync(flag('--db')!))),
);
const world: any = rowsToWorld(store, { includeCold: false });

// Seeded PRNG (mulberry32 over a hash of the seed).
let state = createHash('sha256').update(flag('--seed', 't1062')!).digest().readUInt32LE(0);
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const spelled = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(spelled)
    : typeof value === 'object' && value !== null
      ? Object.entries(value).map(([key, v]) => [key, spelled(v)])
      : Object.is(value, -0)
        ? '-0'
        : value === undefined
          ? '(undefined)'
          : typeof value === 'number' && Number.isNaN(value)
            ? 'NaN'
            : value;
const same = (a: unknown, b: unknown) => JSON.stringify(spelled(a)) === JSON.stringify(spelled(b));

/** Every (schema, value) pair under the world, sampled: containers descend, arrays by 2 elements. */
const pairs: [any, unknown, string][] = [];
function walk(node: any, value: unknown, path: string, depth: number) {
  if (value === undefined || depth > 12) return;
  pairs.push([node, value, path]);
  const def = node._zod.def;
  if (def.type === 'optional') return walk(def.innerType, value, path, depth);
  if (def.type === 'object' && value && typeof value === 'object' && !Array.isArray(value))
    for (const key of Object.keys(def.shape))
      walk(def.shape[key], (value as any)[key], `${path}.${key}`, depth + 1);
  if (def.type === 'array' && Array.isArray(value))
    for (let i = 0; i < 2 && value.length; i++) {
      const at = Math.floor(rand() * value.length);
      walk(def.element, value[at], `${path}[${at}]`, depth + 1);
    }
  if (def.type === 'record' && value && typeof value === 'object') {
    const keys = Object.keys(value);
    for (let i = 0; i < 2 && keys.length; i++) {
      const key = pick(keys);
      walk(def.valueType, (value as any)[key], `${path}{${key}}`, depth + 1);
    }
  }
  if (def.type === 'tuple' && Array.isArray(value))
    def.items.forEach((item: any, i: number) => walk(item, value[i], `${path}(${i})`, depth + 1));
}
walk(cand.worldSchema, world, 'world', 0);

/** One mutation somewhere inside `value` (a deep copy): its description. */
function mutate(root: { v: unknown }): string {
  // Descend a random number of steps to an object or array holder.
  let holder: any = root,
    key: string | number = 'v',
    path = '';
  for (let steps = Math.floor(rand() * 6); steps > 0; steps--) {
    const inner = holder[key];
    if (!inner || typeof inner !== 'object') break;
    const keys = Array.isArray(inner) ? inner.map((_, i) => i) : Object.keys(inner);
    if (!keys.length) break;
    holder = inner;
    key = pick(keys as (string | number)[]);
    path += `/${key}`;
  }
  const current = holder[key];
  const ops: [string, () => void][] = [
    ['delete', () => (Array.isArray(holder) ? holder.splice(key as number, 1) : delete holder[key])],
    ['undefined', () => (holder[key] = undefined)],
    ['null', () => (holder[key] = null)],
    ['string', () => (holder[key] = 'x')],
    ['empty-string', () => (holder[key] = '')],
    ['long-string', () => (holder[key] = 'x'.repeat(200))],
    ['negative', () => (holder[key] = -1)],
    ['fraction', () => (holder[key] = 1.5)],
    ['huge', () => (holder[key] = 1e12)],
    ['NaN', () => (holder[key] = NaN)],
    ['minus-zero', () => (holder[key] = -0)],
    ['true', () => (holder[key] = true)],
    ['array', () => (holder[key] = [])],
    ['object', () => (holder[key] = {})],
    ['plus-one', () => typeof current === 'number' && (holder[key] = current + 1)],
    ['minus-one', () => typeof current === 'number' && (holder[key] = current - 1)],
    [
      'extra-key',
      () => current && typeof current === 'object' && !Array.isArray(current) && (current.zz = 1),
    ],
    [
      'push-copy',
      () => Array.isArray(current) && current.length && current.push(structuredClone(current[0])),
    ],
    ['pop', () => Array.isArray(current) && current.pop()],
  ];
  const [name, apply] = pick(ops);
  apply();
  return `${path || '/'} ${name}`;
}

const schemaLevel = { cases: 0, bothAccept: 0, bothReject: 0, fastAccepted: 0, mismatches: [] as string[] };
const nodes = Number(flag('--nodes', '4000'));
for (let i = 0; i < nodes; i++) {
  const [node, value, path] = pick(pairs);
  const root = { v: structuredClone(value) };
  const what = i % 10 === 0 ? 'unchanged' : mutate(root);
  const input = root.v;
  const zod = node.safeParse(input);
  let called = 0;
  const parse = node.parse;
  node.parse = (...a: unknown[]) => (called++, parse.apply(node, a));
  let ours: { ok: true; value: unknown } | { ok: false; error: unknown };
  try {
    ours = { ok: true, value: cand.zodParse(node, input) };
  } catch (error) {
    ours = { ok: false, error };
  }
  node.parse = parse;
  schemaLevel.cases++;
  const label = `${path} ${what}`;
  if (zod.success && ours.ok) {
    schemaLevel.bothAccept++;
    if (!called) schemaLevel.fastAccepted++;
    if (!same(zod.data, ours.value)) schemaLevel.mismatches.push(`output ${label}`);
  } else if (!zod.success && !ours.ok) {
    schemaLevel.bothReject++;
    const issues = (ours.error as any).issues;
    if (JSON.stringify(issues) !== JSON.stringify(zod.error.issues))
      schemaLevel.mismatches.push(`error ${label}`);
  } else schemaLevel.mismatches.push(`verdict ${label} zod=${zod.success} ours=${ours.ok}`);
}

/** A mutation that keeps the value's type, for the reference checks behind the schema. */
const strings: string[] = [];
(function gather(v: unknown, depth: number) {
  if (typeof v === 'string' && strings.length < 5000 && rand() < 0.05) strings.push(v);
  else if (v && typeof v === 'object' && depth < 8)
    for (const x of Object.values(v).slice(0, 40)) gather(x, depth + 1);
})(world, 0);
function nudge(root: { v: unknown }): string {
  let holder: any = root,
    key: string | number = 'v',
    path = '';
  for (let steps = 1 + Math.floor(rand() * 7); steps > 0; steps--) {
    const inner = holder[key];
    if (!inner || typeof inner !== 'object') break;
    const keys = Array.isArray(inner) ? inner.map((_, i) => i) : Object.keys(inner);
    if (!keys.length) break;
    holder = inner;
    key = pick(keys as (string | number)[]);
    path += `/${key}`;
  }
  const current = holder[key];
  if (typeof current === 'number') {
    const by = pick([1, -1, 7, -7, 366, -366, 1000]);
    holder[key] = current + by;
    return `${path} ${by > 0 ? '+' : ''}${by}`;
  }
  if (typeof current === 'string') {
    holder[key] = pick(strings);
    return `${path} other-string`;
  }
  if (Array.isArray(current) && current.length) {
    if (rand() < 0.5) current.push(structuredClone(pick(current)));
    else current.splice(Math.floor(rand() * current.length), 1);
    return `${path} array-length`;
  }
  if (typeof current === 'boolean') {
    holder[key] = !current;
    return `${path} flip`;
  }
  return `${path} unchanged`;
}

/** Moves one job of a person with several so that it may overlap another (the pairwise check). */
function overlap(people: Record<string, any>): string {
  const many = Object.values(people).filter((p) => p.employment.length >= 2);
  const person = pick(many);
  const job = pick(person.employment as any[]);
  const other = pick(person.employment as any[]);
  const move = pick(['from-back', 'to-on', 'same-club-player', 'reopen']);
  if (move === 'from-back') job.from = { ...job.from, year: job.from.year - pick([1, 2, 5]) };
  if (move === 'to-on' && job.to) job.to = { ...job.to, year: job.to.year + pick([1, 2, 5]) };
  if (move === 'same-club-player') {
    job.club = other.club;
    job.from = { ...other.from };
  }
  if (move === 'reopen') delete job.to;
  return `/${person.id} ${move} (${person.employment.length} jobs)`;
}

/** World level: baseline and candidate validateWorld on whole mutated worlds. */
const outcome = (fn: any, input: unknown) => {
  try {
    const out = fn(input, LOAD_CATALOG, store);
    return { ok: true, hash: createHash('sha256').update(canonical(out)).digest('hex').slice(0, 16) };
  } catch (error: any) {
    return {
      ok: false,
      error: `${error?.constructor?.name}: ${error?.message?.slice(0, 2000)}`,
      issues: error?.issues ? JSON.stringify(error.issues) : undefined,
    };
  }
};
const worldLevel = { cases: 0, bothAccept: 0, bothReject: 0, mismatches: [] as string[], kinds: {} as Record<string, number> };
const worlds = Number(flag('--worlds', '60'));
// Reference checks first: targets the validateWorld body reads beyond the schema.
const targets = (flag('--targets') ?? '').split(',').filter(Boolean).length
  ? flag('--targets')!.split(',')
  : ['people', 'players', 'squads', 'fixtures', 'playerRecords', 'recentResults', 'history', 'ownMatches', 'clubs', 'tables', 'freeAgents', 'npcSeason'].filter((k) => world[k]);
for (let i = 0; i < worlds; i++) {
  const input = structuredClone(world);
  let what = 'unchanged';
  if (i > 0) {
    const field = targets[i % targets.length];
    const root = { v: input[field] };
    what =
      field === 'people' && flag('--overlap') && i % 2 === 0
        ? `people${overlap(root.v as any)}`
        : `${field}${i % 3 === 0 ? mutate(root) : nudge(root)}`;
    input[field] = root.v;
  }
  const b = outcome(base.validateWorld, structuredClone(input));
  const c = outcome(cand.validateWorld, structuredClone(input));
  worldLevel.cases++;
  const kind = b.ok ? 'accept' : (b.error as string).split(':')[0] + ':' + (b.error as string).slice(0, 60);
  worldLevel.kinds[kind] = (worldLevel.kinds[kind] ?? 0) + 1;
  if (b.ok && c.ok) {
    worldLevel.bothAccept++;
    if (b.hash !== c.hash) worldLevel.mismatches.push(`hash ${what}`);
  } else if (!b.ok && !c.ok) {
    worldLevel.bothReject++;
    if (b.error !== c.error || b.issues !== c.issues) worldLevel.mismatches.push(`error ${what}`);
  } else worldLevel.mismatches.push(`verdict ${what} base=${b.ok} cand=${c.ok}`);
  console.error(`world ${i} ${what} ${b.ok ? 'accept' : 'reject'}`);
}
const report = { db: flag('--db'), seed: flag('--seed', 't1062'), pairs: pairs.length, schemaLevel, worldLevel };
if (flag('--out')) writeFileSync(flag('--out')!, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, schemaLevel: { ...schemaLevel, mismatches: schemaLevel.mismatches.slice(0, 20) } }, null, 2));
process.exit(0);
