import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../../contracts/src/player';
import { createWorld } from '../index';
import { levelFactor, FORMATIONS, lineOf } from '../player';
import { fatigueLoad, slotOvr, unhappyPenalty } from '../world';
import { cellOf } from './pitch';
import { buildGridSetup } from './setup';
import { createState, enterSlot, minutesOn, skill, STRENGTH_CONFIG } from './state';

const w = createWorld({
  country: 'ENG',
  name: 'Grid State Lab',
  color: '#2a5d8f',
  seed: 'grid-state',
  level: 'normal' as const,
});
const own = w.fixtures.find((f) => f.home === w.playerClub)!;
// The fixture's season only picks the era's bench: 2022 names nine substitutes.
const setup = () =>
  buildGridSetup(w, { ...own, year: 2022 }, { observe: false, recordPlayers: true });

describe('grid state', () => {
  it('starts every player in his own half at kick-off with the ball on the spot', () => {
    const s = createState(setup());
    expect(s.ball).toEqual([52.5, 34]);
    expect(s.possession).toBe(0);
    expect(s.owner![0]).toBe(0);
    expect(lineOf(FORMATIONS[s.setup.tactics[0]].slots[s.owner![1]]!.position)).toBe('FW');
    for (const gp of s.players[0].slice(0, 11)) {
      expect(gp.onPitch).toBe(true);
      expect(gp.pos[0]).toBeLessThanOrEqual(50);
      expect(cellOf(gp.pos)).toBeGreaterThanOrEqual(0);
    }
    for (const gp of s.players[1].slice(0, 11)) {
      expect(gp.onPitch).toBe(true);
      expect(gp.pos[0]).toBeGreaterThanOrEqual(55);
    }
    for (const gp of s.players[0].slice(11)) expect([gp.onPitch, gp.slot]).toEqual([false, -1]);
    expect(s.score).toEqual([0, 0]);
    expect(s.period).toBe(1);
  });

  it('computes skills as the current engine does', () => {
    const su = setup();
    const s = createState(su);
    const side = su.own!;
    const idx = 9;
    const p = su.rosters[side][idx]!;
    const slot = FORMATIONS[su.tactics[side]].slots[idx]!;
    for (const a of ATTRIBUTES) {
      const keeper = a === 'reflexes' || a === 'handling';
      const raw =
        p.attrs[a] * levelFactor(p.positions, slot.position) * su.multiplier[side](p) -
        fatigueLoad(p.fatigue) / (keeper ? 10 : 8) -
        unhappyPenalty(p) +
        su.shift[side];
      const expected = STRENGTH_CONFIG.anchor + (raw - s.level) * STRENGTH_CONFIG.skillScale;
      expect(skill(s, side, idx, a), a).toBeCloseTo(expected, 9);
    }
  });

  it("reads skills from the match's level, the mean 실효 OVR of both starting XIs", () => {
    const su = setup();
    const s = createState(su);
    let sum = 0;
    for (const side of [0, 1] as const)
      su.rosters[side].slice(0, 11).forEach((p, i) => {
        sum += slotOvr(p, FORMATIONS[su.tactics[side]].slots[i]!, su.multiplier[side](p));
      });
    expect(s.level).toBeCloseTo(sum / 22, 9);
    // A player at the match's level, before the day's shift, plays at the anchor.
    const gp = s.players[0][5]!;
    const i = ATTRIBUTES.indexOf('pace');
    gp.base[i] = s.level - su.shift[0];
    expect(skill(s, 0, 5, 'pace')).toBeCloseTo(STRENGTH_CONFIG.anchor, 9);
  });

  it('drains skills with minutes and press', () => {
    const su = setup();
    const s = createState(su);
    const side = su.own!;
    const gp = s.players[side][5]!;
    const before = skill(s, side, 5, 'pace');
    s.elapsed = 45 * 60;
    expect(minutesOn(s, gp)).toBe(45);
    const rate =
      (((100 - gp.player.attrs.stamina) / 12) * (su.pressing[side] ? 1.3 : 1) * su.drain[side]) /
      90;
    expect(skill(s, side, 5, 'pace')).toBeCloseTo(
      before - rate * 45 * STRENGTH_CONFIG.skillScale,
      9,
    );
    gp.onAt = 45 * 60;
    expect(skill(s, side, 5, 'pace')).toBeCloseTo(before, 9);
    expect(skill(s, side, 5, 'pace')).toBeGreaterThan(before - 1);
  });

  it("recomputes a substitute's base for his slot", () => {
    const su = setup();
    const s = createState(su);
    const side = su.own!;
    const sub = s.players[side][11]!;
    const cb = FORMATIONS[su.tactics[side]].slots.findIndex((x) => x.position === 'CB');
    const gk = 0;
    enterSlot(s, sub, gk);
    const asKeeper = sub.base.slice();
    enterSlot(s, sub, cb);
    expect(sub.slot).toBe(cb);
    const expected =
      sub.player.attrs.tackling *
      levelFactor(sub.player.positions, 'CB') *
      su.multiplier[side](sub.player);
    const load = fatigueLoad(sub.player.fatigue) / 8 + unhappyPenalty(sub.player);
    expect(sub.base[ATTRIBUTES.indexOf('tackling')]).toBeCloseTo(expected - load, 9);
    expect(Array.from(asKeeper)).not.toEqual(Array.from(sub.base));
  });
});
