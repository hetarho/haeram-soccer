import { describe, expect, it } from 'vitest';
import { overall } from '../player-state';
import { FORMATIONS } from '../player';
import { eraRules } from '../grid/rules';
import { buildGridSetup } from '../grid/setup';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import {
  generateLabSide,
  LAB_CONFIG,
  labPlaces,
  labSideFromOvrs,
  labStarterAverage,
  setLabPlayerOvr,
} from './sides';
import { createLabWorld, labFixture, leftAtHome } from './match';

const input = {
  side: 0 as const,
  seed: 'unit',
  tactic: 'possession' as const,
  average: 70,
  spread: 6,
};

describe('lab sides', () => {
  it('same seed same side', () => {
    const a = generateLabSide(input),
      b = generateLabSide(input);
    expect(b.ovrs).toEqual(a.ovrs);
    expect(b.players.map((p) => p.name)).toEqual(a.players.map((p) => p.name));
    expect(b.players.map((p) => p.attrs)).toEqual(a.players.map((p) => p.attrs));
    expect(generateLabSide({ ...input, seed: 'other' }).ovrs).not.toEqual(a.ovrs);
  });

  it('fields the formation, then the era’s named substitutes', () => {
    for (const tactic of ['balanced', 'possession', 'counter', 'press'] as const) {
      const side = generateLabSide({ ...input, tactic });
      const slots = FORMATIONS[tactic].slots;
      expect(side.players).toHaveLength(slots.length + eraRules(LAB_CONFIG.year).named);
      slots.forEach((slot, i) => expect(side.players[i]!.position).toBe(slot.position));
      expect(labPlaces(tactic).filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('mean equals average', () => {
    for (const average of [40, 55, 70, 90])
      for (const spread of [0, 7, 15]) {
        const side = generateLabSide({ ...input, average, spread });
        expect(labStarterAverage(side)).toBe(average);
        // Each player lands on his place's OVR as the game generates one (±1 rounding).
        side.players.forEach((p, i) =>
          expect(Math.abs(overall(p) - side.ovrs[i]!)).toBeLessThanOrEqual(1),
        );
      }
  });

  it('spread bounds', () => {
    const side = generateLabSide({ ...input, average: 60, spread: 5 });
    const n = FORMATIONS[side.tactic].slots.length;
    // The starters' shift is the draw's mean error, at most the spread itself; rounding adds one.
    side.ovrs.slice(0, n).forEach((v) => expect(Math.abs(v - 60)).toBeLessThanOrEqual(2 * 5 + 1));
    side.ovrs.slice(n).forEach((v) => expect(Math.abs(v - 60)).toBeLessThanOrEqual(5 + 1));
    expect(generateLabSide({ ...input, spread: 0 }).ovrs.every((v) => v === 70)).toBe(true);
  });

  it('single player edit', () => {
    const side = generateLabSide(input);
    const edited = setLabPlayerOvr(side, 0, 3, 88);
    expect(setLabPlayerOvr(side, 0, 3, 120).ovrs[3]).toBe(LAB_CONFIG.ovrRange[1]);
    expect(edited.ovrs[3]).toBe(88);
    expect(Math.abs(overall(edited.players[3]!) - 88)).toBeLessThanOrEqual(1);
    expect(edited.players[3]!.id).toBe(side.players[3]!.id);
    expect(edited.players[3]!.position).toBe(side.players[3]!.position);
    edited.players.forEach((p, i) => i !== 3 && expect(p).toBe(side.players[i]));
    // Rebuilt from its OVRs, the edited side is the same side.
    const rebuilt = labSideFromOvrs(input, edited.ovrs);
    expect(rebuilt.players.map((p) => p.attrs)).toEqual(edited.players.map((p) => p.attrs));
  });
});

describe('lab setup', () => {
  const lab = createLabWorld();

  it('lab squads drive the setup', () => {
    const left = generateLabSide({ ...input, average: 80 });
    const right = generateLabSide({ ...input, side: 1, tactic: 'press', average: 50 });
    const f = labFixture(lab, 'setup', 0);
    expect(leftAtHome(0)).toBe(true);
    const setup = buildGridSetup(lab.w, f, {
      observe: false,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      lab: { rosters: [left.players, right.players], tactics: [left.tactic, right.tactic] },
    });
    expect(setup.tactics).toEqual(['possession', 'press']);
    expect(setup.rosters[0]).toEqual(left.players);
    expect(setup.rosters[1]).toEqual(right.players);
    expect(setup.bench).toEqual([left.players.length - 11, right.players.length - 11]);
    // No 조직력 or adaptation term: every lab player plays at his own level.
    expect(setup.multiplier.map((m, side) => m(setup.rosters[side]![0]!))).toEqual([1, 1]);
    expect(setup.tendencies?.[1]).toHaveLength(right.players.length);
    expect(labFixture(lab, 'setup', 1).home).toBe(f.away);
  });
});
