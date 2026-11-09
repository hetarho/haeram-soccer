import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Tactic, World } from '../../../contracts/src/types';
import { MATCH_MODEL_REVISIONS } from '../../../contracts/src/match-model';
import type { MatchModelRelease } from '../match-model-release';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { careerWorld } from '../career.testkit';
import { MARKET_CONFIG } from '../market-prices';
import { actionMix, DECISION_CONFIG } from './decide';
import { computeTags } from './tags';
import { gridKit, gridKitFromWorld, type Kit } from './testkit';

const seed = 'grid-lab';
const release = structuredClone(DISABLED_RELEASE);
function preparedSnapshot(actualSeed: string, actualRelease: MatchModelRelease) {
  const input = { version: 1, seed: actualSeed, release: structuredClone(actualRelease) };
  return JSON.stringify(
    cachedWorld('grid-testkit-parity', () => careerWorld({ seed: input.seed }, input.release), {
      dependencies: [
        fileURLToPath(import.meta.url),
        fileURLToPath(new URL('../career.testkit.ts', import.meta.url)),
      ],
      input,
    }),
  );
}
// Capture the canonical generation state before any test changes a runtime setting.
const snapshot = preparedSnapshot(seed, release);
const prepared = (tactics?: [Tactic, Tactic], json = snapshot) =>
  gridKitFromWorld(JSON.parse(json) as World, tactics);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const draws = (kit: Kit) => Array.from({ length: 16 }, () => kit.setup.r());

/** A decision-only override uses fresh setup/state, even while the canonical world is retained. */
function mix(kit: Kit) {
  const state = kit.state;
  state.setup = { ...state.setup, model: MATCH_MODEL_REVISIONS[2] };
  for (const side of state.players)
    for (const player of side) player.pos = [player.side === 0 ? 3 : 102, 2];
  state.players[0][9]!.pos = [80, 34];
  state.owner = [0, 9];
  state.ball = [80, 34];
  state.possession = 0;
  state.elapsed = 600;
  state.possessionSince = 595;
  return actionMix(state, 0, 9, computeTags(state, 0, 9));
}

describe('prepared grid-world boundary', () => {
  it('matches an uncached direct career in world, fixture, roster, setup, state and RNG facts', () => {
    // gridKit is deliberately the uncached direct baseline; a cache directory of off is not one.
    const direct = gridKit(undefined, seed, release);
    const copy = prepared();
    expect(digest(copy)).toBe(digest(direct));
    expect(copy.setup.w).toBe(copy.w);
    expect(copy.state.setup).toBe(copy.setup);
    expect(copy.state.math).toBe(direct.state.math);
    for (const side of [0, 1] as const)
      expect(copy.setup.rosters[side].map((p) => copy.setup.multiplier[side](p))).toEqual(
        direct.setup.rosters[side].map((p) => direct.setup.multiplier[side](p)),
      );
    expect(draws(copy)).toEqual(draws(direct));
  });

  it('isolates nested world, roster, typed-array state and RNG mutations between scenes', () => {
    const first = prepared();
    const second = prepared();
    const original = digest(second);
    expect(first.w).not.toBe(second.w);
    expect(first.setup.rosters[0][0]).not.toBe(second.setup.rosters[0][0]);
    first.w.players[0]!.attrs.finishing = 1;
    first.w.clubs[0]!.name = 'Mutated synthetic club';
    first.setup.rosters[0][0]!.attrs.finishing = 2;
    first.state.players[0][0]!.base[0] = 3;
    first.state.players[0][0]!.pos[0] = 4;
    draws(first);
    expect(digest(second)).toBe(original);
    const third = prepared();
    expect(digest(third)).toBe(original);
    expect(draws(second)).toEqual(draws(third));
  });

  it('preserves action outputs when decision settings change after world preparation', () => {
    const quality = DECISION_CONFIG.candidate.shotQuality as { power: number };
    const old = quality.power;
    try {
      for (const power of [old, 0]) {
        quality.power = power;
        const direct = gridKit(undefined, seed, release);
        const copy = prepared();
        expect(digest(copy)).toBe(digest(direct));
        expect(mix(copy)).toEqual(mix(direct));
        expect(draws(copy)).toEqual(draws(direct));
      }
    } finally {
      quality.power = old;
    }
  });

  it('keeps seed, complete release and tactics distinct in prepared construction', () => {
    const alternateSeed = 'grid-lab-alternate';
    const alternateRelease = { ...release, enabled: true, revision: MATCH_MODEL_REVISIONS[2]! };
    const tactics: [Tactic, Tactic] = ['possession', 'press'];
    const bySeed = prepared(tactics, preparedSnapshot(alternateSeed, release));
    const directSeed = gridKit(tactics, alternateSeed, release);
    expect(digest(bySeed)).toBe(digest(directSeed));
    expect(bySeed.w.seed).toBe(alternateSeed);
    expect(bySeed.setup.tactics).toEqual(tactics);
    expect(digest(bySeed)).not.toBe(digest(prepared()));
    const byRelease = prepared(tactics, preparedSnapshot(seed, alternateRelease));
    const directRelease = gridKit(tactics, seed, alternateRelease);
    expect(digest(byRelease)).toBe(digest(directRelease));
    expect(byRelease.setup.model).toBe(alternateRelease.revision);
    expect(prepared().setup.model).toBeUndefined();
    expect(draws(byRelease)).toEqual(draws(directRelease));
  });

  it('leaves generic gridKit sensitive to current generation settings on every call', () => {
    const old = MARKET_CONFIG.wage;
    const direct = gridKit(undefined, seed, release);
    try {
      MARKET_CONFIG.wage = old * 1.1;
      const changed = gridKit(undefined, seed, release);
      expect(changed.w.players.map((p) => p.wage)).not.toEqual(direct.w.players.map((p) => p.wage));
      expect(digest(changed.w)).not.toBe(digest(direct.w));
    } finally {
      MARKET_CONFIG.wage = old;
    }
    expect(digest(prepared())).toBe(digest(gridKit(undefined, seed, release)));
  });
});
