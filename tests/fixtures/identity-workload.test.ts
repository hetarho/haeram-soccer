import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { LOAD_CATALOG } from '../../packages/catalogs/src/index';
import { canonical, validateWorld } from '../../packages/contracts/src/index';
import {
  CREST_PALETTE,
  CREST_PRESETS,
  KIT_ROLES,
  SHIRT_PATTERNS,
} from '../../packages/contracts/src/identity';
import { clubIdentitySchema } from '../../packages/contracts/src/identitySchema';
import type { Founding, World } from '../../packages/contracts/src/types';
import { advanceRound, clubOf } from '../../packages/engine/src/index';
import {
  appearanceSummary,
  assertAppearancesUnchanged,
  assertConsumedChoice,
  assertPendingChoice,
  identityWorkload,
  recordedAppearances,
  seasonIdentity,
  type WorkloadKitChoice,
} from './identity-workload';
import { simulatedWorld } from './worlds';

/** The active-management century's own founding (scripts/benchmark.ts), a few rounds in. */
const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Century Cooperative',
  color: '#284e35',
  seed: 'release-century-active-management',
  level: 'easy',
};
const started = () => simulatedWorld(FOUNDING, { rounds: 3 });

/** Top-level keys whose canonical value differs between two worlds. */
const changedKeys = (a: World, b: World) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(
      (key) =>
        canonical((a as unknown as Record<string, unknown>)[key] ?? null) !==
        canonical((b as unknown as Record<string, unknown>)[key] ?? null),
    )
    .sort();
/** Sporting, money, date and history facts: every cosmetic field, receipt and revision left out. */
const sporting = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    receiptIds: undefined,
    kitChoice: undefined,
    clubs: w.clubs.map((club) => ({ ...club, identity: undefined, color: undefined })),
    ownMatches: w.ownMatches.map((match) => ({ ...match, appearance: undefined })),
  });
/** The world as a load reads it, as the benchmark compares checkpoints. */
const loaded = (w: World) => canonical(validateWorld(w, LOAD_CATALOG));
/** Plays whole rounds until the chosen fixture has settled. */
function settle(w: World, choice: WorkloadKitChoice) {
  for (let n = 0; n < 6 && !w.ownMatches.some((m) => m.id === choice.fixtureId); n++)
    advanceRound(w, undefined, false);
}

describe('identity workload stays cosmetic (→KIT-13)', () => {
  it('changes only the own identity and the next-fixture choice, one revision per command', () => {
    const w = started();
    expect(w.ownMatches.length).toBeGreaterThan(0);
    const before = structuredClone(w);
    const workload = identityWorkload();
    workload.edit(w, 0);
    const choice = workload.chooseKit(w);
    // Exactly three top-level fields differ: the clubs, the stored choice and the revision.
    expect(changedKeys(before, w)).toEqual(['clubs', 'kitChoice', 'revision']);
    expect(w.revision).toBe(before.revision + 2);
    expect(w.receiptIds).toEqual(before.receiptIds);
    expect(w.kitChoice).toEqual({ fixtureId: choice.fixtureId, role: choice.role });
    // Within the clubs, only our identity and its representative colour alias changed.
    const changedClubs = w.clubs.flatMap((club, index) =>
      canonical(club) === canonical(before.clubs[index]) ? [] : [club.id],
    );
    expect(changedClubs).toEqual([w.playerClub]);
    expect({ ...clubOf(w), identity: undefined, color: undefined }).toEqual({
      ...clubOf(before),
      identity: undefined,
      color: undefined,
    });
    expect(clubOf(w).identity).toEqual(seasonIdentity(0));
    expect(clubOf(w).color).toBe(seasonIdentity(0).colours[0]);
    // Sports, money, dates and history, named one by one.
    for (const key of [
      'players',
      'tables',
      'fixtures',
      'cups',
      'europe',
      'manager',
      'tactic',
      'lineup',
      'cash',
      'income',
      'expense',
      'year',
      'round',
      'calendar',
      'history',
      'ownMatches',
      'events',
      'inbox',
      'people',
    ] as const)
      expect(canonical(w[key] ?? null), key).toBe(canonical(before[key] ?? null));
  });

  it('plays the following rounds exactly as without it', () => {
    const control = started();
    const edited = structuredClone(control);
    const workload = identityWorkload();
    workload.edit(edited, 0);
    const choice = workload.chooseKit(edited);
    // The same rounds for both, until the chosen fixture has settled.
    let rounds = 0;
    for (; rounds < 6 && !edited.ownMatches.some((m) => m.id === choice.fixtureId); rounds++)
      for (const w of [control, edited]) advanceRound(w, undefined, false);
    expect(rounds).toBeGreaterThan(0);
    assertConsumedChoice(edited, choice);
    expect(sporting(edited)).toBe(sporting(control));
    expect(edited.receiptIds).toEqual(control.receiptIds);
  });
});

describe('identity workload is deterministic', () => {
  it('derives each season design from its number alone and covers the catalogues', () => {
    const designs = Array.from({ length: 101 }, (_, n) => seasonIdentity(n));
    for (const [n, design] of designs.entries()) {
      expect(canonical(seasonIdentity(n))).toBe(canonical(design));
      expect(clubIdentitySchema.safeParse(design).success, `season ${n}`).toBe(true);
      if (n) expect(canonical(design), `season ${n}`).not.toBe(canonical(designs[n - 1]));
      expect(new Set(KIT_ROLES.map((role) => design.kits[role].pattern)).size).toBe(3);
    }
    const cycle = designs.slice(0, 24);
    expect(new Set(cycle.map((design) => design.colours[0]))).toEqual(new Set(CREST_PALETTE));
    for (const role of KIT_ROLES)
      expect(new Set(cycle.map((design) => design.kits[role].pattern))).toEqual(
        new Set(SHIRT_PATTERNS),
      );
    expect(
      new Set(cycle.map(({ crest }) => `${crest.shape}/${crest.pattern}/${crest.emblem}`)),
    ).toEqual(new Set(CREST_PRESETS.map((p) => `${p.shape}/${p.pattern}/${p.emblem}`)));
    expect(cycle.slice(0, 3).map((design) => design.colours.length)).toEqual([1, 2, 3]);
    expect(canonical(designs[24])).toBe(canonical(designs[0]));
  });

  it('leaves equal worlds and evidence for equal careers', () => {
    const [a, b] = [started(), started()];
    const runs = [a, b].map((w) => {
      const workload = identityWorkload();
      workload.edit(w, 5);
      for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
      workload.edit(w, 6);
      const choice = workload.chooseKit(w);
      return { choice, evidence: workload.evidence() };
    });
    expect(canonical(a)).toBe(canonical(b));
    expect(runs[0]).toEqual(runs[1]);
    const { choice, evidence } = runs[0];
    expect(choice.role).not.toBe(choice.automatic);
    expect(evidence).toMatchObject({
      edits: 2,
      firstSeason: 5,
      lastSeason: 6,
      appearanceChecks: 3,
      kitChoices: [choice],
    });
    expect(evidence.recordsWearingAppliedDesign).toBeGreaterThan(0);
  });
});

describe('earlier recorded appearances survive the workload (→KIT-12, SAVE-22)', () => {
  it('keeps old records and dresses the next ones in the applied design', () => {
    const w = started();
    const old = recordedAppearances(w);
    expect(old.length).toBeGreaterThan(0);
    expect(old.every(Boolean)).toBe(true);
    const founded = canonical(clubOf(w).identity!.crest);
    const workload = identityWorkload();
    workload.edit(w, 0);
    assertAppearancesUnchanged(w, old, 'the first edit');
    for (const match of w.ownMatches)
      expect(canonical(match.appearance!.sides[match.home === w.playerClub ? 0 : 1].crest)).toBe(
        founded,
      );
    for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
    const worn = w.ownMatches.slice(old.length);
    expect(worn.length).toBeGreaterThan(0);
    for (const match of worn)
      expect(match.appearance!.sides[match.home === w.playerClub ? 0 : 1].crest).toEqual(
        seasonIdentity(0).crest,
      );
    const afterFirst = recordedAppearances(w);
    // The next edit checks those records first, then repaints only the future.
    workload.edit(w, 1);
    assertAppearancesUnchanged(w, afterFirst, 'the second edit');
    expect(afterFirst.slice(0, old.length)).toEqual(old);
    expect(workload.evidence().recordsWearingAppliedDesign).toBe(worn.length);
    expect(appearanceSummary(w)).toMatchObject({ records: w.ownMatches.length, absent: 0 });
  });

  it('fails loudly when a recorded appearance is rewritten', () => {
    const w = started();
    const workload = identityWorkload();
    workload.edit(w, 0);
    for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
    const recorded = recordedAppearances(w);
    const tampered = structuredClone(w);
    tampered.ownMatches[0].appearance!.sides[0].shirt.primary = '#000001';
    expect(() => assertAppearancesUnchanged(tampered, recorded, 'a rewrite')).toThrow(
      `Recorded appearance of ${w.ownMatches[0].id} changed during a rewrite`,
    );
    tampered.ownMatches.pop();
    expect(() => assertAppearancesUnchanged(tampered, recorded, 'a rewrite')).toThrow(
      'Own match records changed',
    );
    // A record since the last edit that does not wear it stops the next edit before it runs.
    const latest = w.ownMatches.at(-1)!;
    latest.appearance!.sides[latest.home === w.playerClub ? 0 : 1].crest.primary = '#000001';
    const before = canonical(w);
    expect(() => workload.edit(w, 1)).toThrow('does not wear the design applied before it');
    expect(canonical(w)).toBe(before);
  });
});

describe('the pending choice through a checkpoint', () => {
  it('survives encode/decode and is worn and used up on both resumed copies', async () => {
    const w = started();
    const workload = identityWorkload();
    workload.edit(w, 0);
    const choice = workload.chooseKit(w);
    const restored = (await decode(await encode(w, 2, 1))).world;
    expect(canonical(restored)).toBe(loaded(w));
    assertPendingChoice(restored, choice);
    const continued = structuredClone(w);
    for (const copy of [continued, restored]) settle(copy, choice);
    assertConsumedChoice(continued, choice);
    assertConsumedChoice(restored, choice);
    expect(loaded(restored)).toBe(loaded(continued));
    // The check is not vacuous: before the fixture settles it fails.
    expect(() => assertConsumedChoice(w, choice)).toThrow('Shirt choice outlived its fixture');
  });
});
