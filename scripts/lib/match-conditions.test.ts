import { describe, expect, it } from 'vitest';
import { canonical } from '../../packages/contracts/src/index';
import type { Fixture, Tactic } from '../../packages/contracts/src/types';
import { npcSquad } from '../../packages/engine/src/index';
import { worldMarketFixture } from '../../packages/engine/src/world-market.testkit';
import { FORMATIONS, levelFactor } from '../../packages/engine/src/player';
import { conditionedMatch } from '../match-parity';
import { forcedGap, forcedRosters } from './match-conditions';
import { NEUTRAL_SQUAD_FATIGUE } from './match-parity';

/** Three explicit clubs and retained players; no generation of a world or match progression. */
function fixture() {
  const w = worldMarketFixture();
  const clubs = [w.clubs[1]!, w.clubs[2]!] as const;
  w.squads = Object.fromEntries(
    clubs.map((club) => [
      club.id,
      npcSquad(w.seed, w.year, club).map((p, i) => ({
        ...p,
        id: `${club.id}:retained:${i}`,
        attrs: { ...p.attrs, passing: 90 - i },
      })),
    ]),
  );
  const f: Fixture = {
    id: 'conditioning:retained',
    year: w.year,
    round: 1,
    kind: 'league',
    home: clubs[0].id,
    away: clubs[1].id,
    country: 'ENG',
    groupKey: 'conditioning',
  };
  return { w, f, clubs };
}

const preparationKeys = [
  'tactics',
  'squads',
  'strength',
  'shift',
  'profiles',
  'possessionChance',
] as const;
const different = (t: Tactic): Tactic => (t === 'counter' ? 'press' : 'counter');

describe('conditioning actual persisted matchday inputs', () => {
  it('keeps the exact existing-tactic preparation and actor identities', () => {
    const { w, f } = fixture();
    const plain = conditionedMatch(w, f);
    const before = canonical(w);
    const own = conditionedMatch(w, f, { tactics: plain.prepared.tactics });
    for (const key of preparationKeys) expect(own.prepared[key]).toEqual(plain.prepared[key]);
    expect(own.rosters).toEqual(plain.rosters);
    expect(own.rosters.flat().every((p) => p.id.includes(':retained:'))).toBe(true);
    expect(own.gap).toBe(plain.gap);
    expect(own.prepared.r()).toBe(plain.prepared.r());
    expect(canonical(w)).toBe(before);
  });

  it('applies declared fatigue to the actual players equally with omitted or existing tactics', () => {
    const { w, f } = fixture();
    const plain = conditionedMatch(w, f);
    const before = canonical(w);
    const fatigue = NEUTRAL_SQUAD_FATIGUE;
    const only = conditionedMatch(w, f, { fatigue });
    const explicit = conditionedMatch(w, f, { tactics: plain.prepared.tactics, fatigue });
    expect(explicit.rosters).toEqual(only.rosters);
    for (const key of preparationKeys) expect(explicit.prepared[key]).toEqual(only.prepared[key]);
    expect(explicit.rosters.map((side) => side.map((p) => p.id))).toEqual(
      plain.rosters.map((side) => side.map((p) => p.id)),
    );
    expect(explicit.rosters.flat().every((p) => p.fatigue === fatigue)).toBe(true);
    expect(explicit.gap).toBe(only.gap);
    expect(canonical(w)).toBe(before);
  });

  it.each([false, true])(
    'retains forced pair construction, including one unchanged side (%s)',
    (mixed) => {
      const { w, f, clubs } = fixture();
      const plain = conditionedMatch(w, f);
      const tactics: [Tactic, Tactic] = [
        different(plain.prepared.tactics[0]),
        mixed ? plain.prepared.tactics[1] : different(plain.prepared.tactics[1]),
      ];
      const before = canonical(w);
      const fatigue = NEUTRAL_SQUAD_FATIGUE;
      const forced = conditionedMatch(w, f, { tactics, fatigue });
      expect(forced.rosters).toEqual(
        forcedRosters(
          w,
          f,
          clubs,
          tactics,
          [plain.rosters[0].length - 11, plain.rosters[1].length - 11],
          fatigue,
        ),
      );
      expect(forced.gap).toBe(forcedGap(w, clubs, forced.rosters, tactics));
      expect(forced.prepared.tactics).toEqual(tactics);
      expect(forced.rosters.flat().every((p) => p.fatigue === fatigue)).toBe(true);
      forced.rosters.forEach((side, i) => {
        const slots = FORMATIONS[tactics[i]!].slots;
        expect(
          side.slice(0, 11).map((p, k) => levelFactor(p.positions, slots[k]!.position)),
        ).toEqual(Array(11).fill(1));
      });
      expect(canonical(w)).toBe(before);
    },
  );
});
