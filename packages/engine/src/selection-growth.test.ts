import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Player, Tactic } from '../../contracts/src/types';
import { ATTRIBUTES, POSITIONS, type Attribute } from '../../contracts/src/player';
import { compareIds } from './primitives';
import { weightsFor } from './player';
import { formationOf, lineup, makePlayer, selectionValue, TACTICS } from './world';
import { growAttributes } from './training';

/**
 * T984's two kernels on small synthetic squads and players: `bestFreePairs` (per-slot bests) must
 * pick exactly the players the full-scan pass picked, and `growStep`'s unrolled writes must ask
 * `only` and `factor` in ATTRIBUTES order.
 */
const base = POSITIONS.map((position, i) =>
  makePlayer('ENG', 'lineup-seed', `base:${position}`, 1950, 40 + i * 3, position, 19 + i),
);
/** A copy of `p` under another id, so its values tie his in every slot. */
const twin = (p: Player, id: string, fatigue = p.fatigue): Player => ({ ...p, id, fatigue });

/** The sort-based `lineup`, used for non-finite values as `lineup` does. */
function sortedLineup(players: Player[], tactic: Tactic, multiplier: (p: Player) => number) {
  const slots = formationOf(tactic);
  const pairs: { p: Player; slot: number; value: number }[] = [];
  for (const p of players)
    slots.forEach((slot, i) =>
      pairs.push({ p, slot: i, value: selectionValue(p, slot, undefined, 1950, multiplier(p)) }),
    );
  pairs.sort((a, b) => b.value - a.value || a.slot - b.slot || compareIds(a.p.id, b.p.id));
  const chosen: (Player | undefined)[] = Array(slots.length);
  const used = new Set<string>();
  for (const pair of pairs) {
    if (chosen[pair.slot] || used.has(pair.p.id)) continue;
    chosen[pair.slot] = pair.p;
    used.add(pair.p.id);
  }
  return chosen.filter((p): p is Player => !!p);
}

/** The full-scan `bestFreePairs` T984 replaced (every free pair rescanned per pick), copied. */
function scanLineup(players: Player[], tactic: Tactic, multiplier: (p: Player) => number) {
  const slots = formationOf(tactic);
  const width = slots.length;
  const values = players.flatMap((p) =>
    slots.map((slot) => selectionValue(p, slot, undefined, 1950, multiplier(p))),
  );
  if (!values.every(Number.isFinite)) return sortedLineup(players, tactic, multiplier);
  const chosen: (Player | undefined)[] = Array(width);
  const used = new Uint8Array(players.length);
  for (;;) {
    let bestPlayer = -1;
    let bestSlot = -1;
    let bestValue = 0;
    for (let i = 0; i < players.length; i++) {
      if (used[i]) continue;
      for (let s = 0; s < width; s++) {
        if (chosen[s]) continue;
        const value = values[i * width + s]!;
        if (
          bestPlayer < 0 ||
          value > bestValue ||
          (value === bestValue &&
            (s < bestSlot ||
              (s === bestSlot && compareIds(players[i]!.id, players[bestPlayer]!.id) < 0)))
        ) {
          bestPlayer = i;
          bestSlot = s;
          bestValue = value;
        }
      }
    }
    if (bestPlayer < 0) break;
    const p = players[bestPlayer]!;
    chosen[bestSlot] = p;
    for (let i = 0; i < players.length; i++) if (players[i]!.id === p.id) used[i] = 1;
  }
  return chosen.filter((p): p is Player => !!p);
}

/** The same player objects, in the same slots: a same-id record from elsewhere fails it. */
const sameObjects = (a: Player[], b: Player[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((p, i) => expect(p).toBe(b[i]));
};

describe('per-slot best pairs (T984)', () => {
  it('picks the same player objects as the full-scan pass', () => {
    const member = fc.record({
      from: fc.integer({ min: 0, max: base.length - 1 }),
      id: fc.integer({ min: 0, max: 12 }),
      fatigue: fc.constantFrom(0, 10, 25, Number.NaN),
    });
    fc.assert(
      fc.property(
        fc.array(member, { maxLength: 30 }),
        fc.constantFrom(...TACTICS),
        fc.constantFrom(1, 0, 0.9),
        (members, tactic, factor) => {
          const squad = members.map((m) => twin(base[m.from]!, `p:${m.id}`, m.fatigue));
          const multiplier = (p: Player) => (p.id.endsWith('3') ? factor : 1);
          sameObjects(
            lineup(squad, tactic, undefined, 1950, multiplier),
            scanLineup(squad, tactic, multiplier),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps squad order among distinct records sharing an id and tying in value', () => {
    // Every pair below shares an id and ties in every slot; the record listed first must play.
    const pairs = base.slice(3, 11).flatMap((p, i) => [twin(p, `dup:${i}`), twin(p, `dup:${i}`)]);
    const flat = () => 1;
    for (const tactic of TACTICS) {
      const xi = lineup(pairs, tactic, undefined, 1950, flat);
      sameObjects(xi, scanLineup(pairs, tactic, flat));
      for (const p of xi) expect(pairs.indexOf(p) % 2).toBe(0);
    }
    // A finite squad whose duplicate ids differ in value, and one with a NaN (the sort fallback).
    const finite = [...pairs, twin(base[5]!, 'dup:2', 0), twin(base[9]!, 'dup:4', 30)];
    const withNaN = [...finite, twin(base[7]!, 'nan', Number.NaN)];
    for (const tactic of TACTICS)
      for (const squad of [finite, withNaN])
        sameObjects(lineup(squad, tactic, undefined, 1950, flat), scanLineup(squad, tactic, flat));
  });
});

describe('explicit growth writes (T984)', () => {
  /** One player at every position, so every attribute is weighted somewhere. */
  const players = POSITIONS.map((position, i) => {
    const p = makePlayer('ENG', 'growth-order', `grow:${position}`, 1950, 50 + i, position, 20);
    p.potential = 99;
    return p;
  });

  it('weights every attribute at some position', () => {
    const weighted = new Set(
      players.flatMap((p) => ATTRIBUTES.filter((a) => weightsFor(p.position)[a])),
    );
    expect([...weighted].sort()).toEqual([...ATTRIBUTES].sort());
  });

  it('asks only and factor in ATTRIBUTES order at every position', () => {
    for (const source of players) {
      const weights = weightsFor(source.position);
      const weighted = ATTRIBUTES.filter((a) => weights[a]);
      for (const skip of [undefined, ...weighted]) {
        const player = structuredClone(source);
        const asked: Attribute[] = [],
          factored: Attribute[] = [];
        const only = (a: Attribute) => (asked.push(a), a !== skip);
        const factor = (a: Attribute) => (factored.push(a), 1.1);
        expect(growAttributes(player, 2, factor, { only })).toBeGreaterThan(0);
        // The weight sums ask every attribute, the steps every weighted one, in ATTRIBUTES order.
        expect(asked).toEqual([...ATTRIBUTES, ...weighted]);
        expect(factored).toEqual(weighted.filter((a) => a !== skip));
        // Only the attributes it stepped changed, and none fell.
        for (const a of ATTRIBUTES) {
          if (factored.includes(a)) expect(player.attrs[a]).toBeGreaterThanOrEqual(source.attrs[a]);
          else expect(player.attrs[a]).toBe(source.attrs[a]);
        }
      }
      const grown = structuredClone(source);
      const unfiltered: Attribute[] = [];
      growAttributes(grown, 2, (a) => (unfiltered.push(a), 1));
      expect(unfiltered).toEqual(weighted);
    }
  });
});
