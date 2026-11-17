/**
 * T943: the frozen contract of T916's four-variant generation repair experiment, shared by the
 * preparation/execution CLI (`generation-repair.mjs`) and the per-run child
 * (`generation-repair-run.ts`). Pure checks only: nothing here loads a world, reads a locale or
 * changes production source. Failures are structured machine codes, never display prose.
 */
import { createHash } from 'node:crypto';

/** Historical primary source of the experiment and the control whose runtime it must equal. */
export const SOURCE = '6e9b05dce6929e6a557fa2a2294c660bfd8e0792';
export const CONTROL = 'fc5d4c26e5fb1572e1cacbcc9fc7065295b8a173';
/** The original persisted-world observer's seed. */
export const SEED = 'persisted-world-invariants';
export const START_YEAR = 1930;
export const END_YEAR = 1950;
/** LEAGUE-10's ±5 band around the original 1930 founding level, in every 1950 cell. */
export const BAND = 5;
export const EXPECTED_CELLS = 21;
/** T916's measurement cap; preparation never extends it. */
export const TIMEBOX_MS = 30 * 60 * 1000;
export const MAX_CHILDREN = 4;

/**
 * The control endpoint oracle, from run 59fbc4b7 (artifacts/natural-football/261114-final-validation.json,
 * current1950Diagnostic). Its serializer is declared, not proved: only an exact control
 * reproduction of both bytes and hash proves it. A mismatch leaves the oracle unresolved; the
 * oracle itself never changes.
 */
export const ORACLE = {
  sha256: '9a3d6e9654f933c65f72625c21523272500de0f92860f59e63e2b01a1e568be2',
  bytes: 26404832,
  year: END_YEAR,
  day: 0,
  round: 0,
  serializer: 'sha256(utf8(JSON.stringify(world))) at 1950 day 0 round 0',
  serializerStatus: 'unproved',
  source: 'artifacts/natural-football/261114-final-validation.json#current1950Diagnostic',
} as const;

/** Files the candidate patches touch, pinned to their exact historical Git blobs at SOURCE. */
export const ANCHORS = {
  'packages/engine/src/world.ts': {
    blob: '0c029d77479d5ae942344e039025265f0db13448',
    sha256: '59405eea5be354f8e327e678f988a7ae469d2a33121ca050fa1fb3aeef9cca2f',
  },
  'packages/engine/src/npc-careers.ts': {
    blob: '93dbabb8a5c88271384b8d198abe77fd177c237f',
    sha256: '38829e41e9942e923caea8674d8cfd2457a82ac4433f375a3cb3b6244fcc84d9',
  },
} as const;

export type VariantId = 'control' | 'c1' | 'c2' | 'c1-c2';
export interface Variant {
  id: VariantId;
  patch: string;
  sha256: string;
}
/** Exactly the four predeclared variants; no search, no other coefficient. */
export const VARIANTS: readonly Variant[] = [
  {
    id: 'control',
    patch: 'control.patch',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    id: 'c1',
    patch: 'c1.patch',
    sha256: 'eb09a8a9fe1ba3d15969a119bd5369edc04567956492fe54890e8f737d749a7f',
  },
  {
    id: 'c2',
    patch: 'c2.patch',
    sha256: '413ba80a9b32f7e18da5182e2b47838ab1268c6b9e8e8a94d6b957ddc191a7aa',
  },
  {
    id: 'c1-c2',
    patch: 'c1-c2.patch',
    sha256: '1e026a6e337b34a63286118f2c616fed779bcc6be53ab398bc1e508297f32e8b',
  },
];

/** Paths whose Git trees must match between SOURCE and CONTROL, apart from ALLOWED_DIFFERENCES. */
export const RUNTIME_INPUTS = [
  'packages',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  '.node-version',
] as const;
export const ALLOWED_DIFFERENCES = [
  'packages/engine/src/material.test.ts',
  'packages/engine/src/persisted-world.integration.test.ts',
] as const;

export const sha256 = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

export interface Failure {
  code: string;
  subject: string;
  expected?: string | number;
  observed?: string | number;
}

/** Each variant's patch bytes against its frozen hash; a missing patch fails closed. */
export function patchFailures(read: (name: string) => Uint8Array | undefined): Failure[] {
  return VARIANTS.flatMap((variant): Failure[] => {
    const bytes = read(variant.patch);
    if (!bytes) return [{ code: 'patch-missing', subject: variant.id }];
    const observed = sha256(bytes);
    return observed === variant.sha256
      ? []
      : [{ code: 'patch-hash', subject: variant.id, expected: variant.sha256, observed }];
  });
}

/** Tree entries (path → blob id) that differ between two trees, outside the allowed test files. */
export function treeFailures(
  source: ReadonlyMap<string, string>,
  control: ReadonlyMap<string, string>,
): Failure[] {
  const allowed = new Set<string>(ALLOWED_DIFFERENCES);
  const paths = [...new Set([...source.keys(), ...control.keys()])].sort();
  return paths
    .filter((path) => source.get(path) !== control.get(path) && !allowed.has(path))
    .map((path) => ({
      code: 'runtime-differs',
      subject: path,
      expected: control.get(path) ?? 'absent',
      observed: source.get(path) ?? 'absent',
    }));
}

/** Historical anchor contents against their pinned SHA-256; a missing anchor fails closed. */
export function anchorFailures(read: (path: string) => Uint8Array | undefined): Failure[] {
  return Object.entries(ANCHORS).flatMap(([path, anchor]): Failure[] => {
    const bytes = read(path);
    if (!bytes) return [{ code: 'anchor-missing', subject: path }];
    const observed = sha256(bytes);
    return observed === anchor.sha256
      ? []
      : [{ code: 'anchor-hash', subject: path, expected: anchor.sha256, observed }];
  });
}

/** One hash over the recipe's executable files and patches, in name order. */
export function recipeHash(files: Readonly<Record<string, Uint8Array | string>>) {
  const hash = createHash('sha256').update('t943-generation-repair-recipe-v1');
  for (const name of Object.keys(files).sort()) hash.update(name).update('\0').update(files[name]!);
  return hash.digest('hex');
}

/** Two manifests differ when any canonical JSON byte differs. */
export function manifestFailures(committed: unknown, computed: unknown): Failure[] {
  const expected = canonical(committed),
    observed = canonical(computed);
  return expected === observed
    ? []
    : [
        {
          code: 'manifest-differs',
          subject: 'manifest',
          expected: sha256(expected),
          observed: sha256(observed),
        },
      ];
}

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

export interface ReviewReceipt {
  task: string;
  recipeHash: string;
  manifestHash: string;
  patches: Readonly<Record<string, string>>;
  reviewer: { provider: string; session: string };
  author: { provider: string; session: string };
  approved: boolean;
}

/**
 * An independent review matches only this exact recipe, manifest and patches, approved by a
 * session other than the author's. Review of another workload (the war replay, the 1950
 * continuation) never matches.
 */
export function reviewFailures(
  receipt: Partial<ReviewReceipt> | undefined,
  expected: { recipeHash: string; manifestHash: string },
): Failure[] {
  if (!receipt) return [{ code: 'review-missing', subject: 'review' }];
  const out: Failure[] = [];
  if (receipt.task !== 'T943')
    out.push({
      code: 'review-task',
      subject: 'task',
      expected: 'T943',
      observed: String(receipt.task),
    });
  if (receipt.recipeHash !== expected.recipeHash)
    out.push({
      code: 'review-recipe',
      subject: 'recipeHash',
      expected: expected.recipeHash,
      observed: String(receipt.recipeHash),
    });
  if (receipt.manifestHash !== expected.manifestHash)
    out.push({
      code: 'review-manifest',
      subject: 'manifestHash',
      expected: expected.manifestHash,
      observed: String(receipt.manifestHash),
    });
  for (const variant of VARIANTS)
    if (receipt.patches?.[variant.id] !== variant.sha256)
      out.push({
        code: 'review-patch',
        subject: variant.id,
        expected: variant.sha256,
        observed: String(receipt.patches?.[variant.id]),
      });
  if (receipt.approved !== true) out.push({ code: 'review-not-approved', subject: 'approved' });
  const reviewer = receipt.reviewer?.session,
    author = receipt.author?.session;
  if (!reviewer || !author || reviewer === author)
    out.push({ code: 'review-not-independent', subject: 'session', observed: String(reviewer) });
  return out;
}

export interface ClubStrength {
  country: string;
  tier: number;
  strength: number;
  representative?: boolean;
}
export interface DivisionRow {
  country: string;
  tier: number;
  clubs: number;
  mean: number;
}

/** First-day division means of every playable country/tier, stored strength as the observer reads it. */
export function divisionRows(
  clubs: readonly ClubStrength[],
  countries: readonly { code: string; tiers: number }[],
): DivisionRow[] {
  return countries.flatMap((country) =>
    Array.from({ length: country.tiers }, (_, tier) => {
      const held = clubs.filter(
        (c) => !c.representative && c.country === country.code && c.tier === tier,
      );
      return {
        country: country.code,
        tier,
        clubs: held.length,
        mean: held.reduce((n, c) => n + c.strength, 0) / held.length,
      };
    }),
  );
}

/** Every strict-order failure of the original observer: a tier not below the one above it. */
export function orderFailures(year: number, rows: readonly DivisionRow[]) {
  return rows
    .filter((row) => row.tier > 0)
    .flatMap((row) => {
      const above = rows.find((r) => r.country === row.country && r.tier === row.tier - 1);
      return above && !(row.mean < above.mean)
        ? [{ year, country: row.country, tier: row.tier, mean: row.mean, above: above.mean }]
        : [];
    });
}

/** All 1950 cells against the same original 1930 baseline; a missing cell is an outside cell. */
export function cellsAgainstBaseline(
  rows: readonly DivisionRow[],
  baseline: readonly DivisionRow[],
) {
  return baseline.map((base) => {
    const row = rows.find((r) => r.country === base.country && r.tier === base.tier);
    const delta = row ? row.mean - base.mean : Number.NaN;
    return {
      country: base.country,
      tier: base.tier,
      founding: base.mean,
      mean: row?.mean ?? null,
      delta: row ? delta : null,
      band: BAND,
      outsideBand: !row || !(Math.abs(delta) <= BAND),
    };
  });
}
