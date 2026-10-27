import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import {
  advanceRound,
  MANAGER_GONE,
  random,
  settleManagerTrust,
  TRUST_FLOOR_CONFIG,
  yearlyStaff,
} from './index';
import { legacySettings } from './responsibilities';
import { world } from './staff.testkit';

const REASON = '구단주와의 신뢰가 무너져 사임했습니다.';
/** The manager's own trust-floor draw for a round (→STAFF-47). */
const draw = (w: World, round: number) =>
  random(`${w.seed}:trust-floor:${w.manager.id}:${w.year}:${round}`)();
/** Rounds of the season whose draw falls in [low, high). */
const roundsDrawing = (w: World, low: number, high: number) =>
  Array.from({ length: 46 }, (_, i) => i + 1).filter((r) => draw(w, r) >= low && draw(w, r) < high);
/** Settles the trust floor as of league round `round`. */
const settleAt = (w: World, round: number) => {
  w.round = round;
  settleManagerTrust(w);
};
const kinds = (w: World, kind: string) => w.events.filter((event) => event.kind === kind);
/** A floor manager the owner has already been warned about. */
function atFloor(w: World, trust: number) {
  w.manager.trust = trust;
  w.manager.trustWarned = true;
  return w;
}

describe('the floor of trust (→STAFF-47)', () => {
  it('warns once on first reaching the floor without resigning', () => {
    const w = world('trust-floor-warn');
    const id = w.manager.id;
    w.manager.trust = TRUST_FLOOR_CONFIG.warn;
    // Even a round whose draw would take him gives the owner his warning first.
    const [hit] = roundsDrawing(w, 0, TRUST_FLOOR_CONFIG.chance);
    expect(hit).toBeDefined();
    settleAt(w, hit!);
    expect(w.manager.id).toBe(id);
    expect(w.manager.trustWarned).toBe(true);
    expect(kinds(w, 'manager-trust-warning')).toEqual([
      expect.objectContaining({ title: `${w.manager.name} 감독, 사임 고민`, round: hit }),
    ]);
    expect(kinds(w, 'manager-departure')).toHaveLength(0);
    const notice = w.inbox!.at(-1)!;
    expect(notice).toMatchObject({ kind: 'staff-report', ref: id, attention: true });
    expect(notice.title).toContain('사임을 고민');
    expect(notice.detail).toContain('공개 신임');
    // Rounds that miss the draw keep him without a second warning.
    for (const r of roundsDrawing(w, TRUST_FLOOR_CONFIG.chance, 1).slice(0, 5)) settleAt(w, r);
    expect(w.manager.id).toBe(id);
    expect(kinds(w, 'manager-trust-warning')).toHaveLength(1);
  });

  it("resigns at the draw's odds on later rounds and never as an interim", () => {
    // At trust 10 he goes on the first round whose draw is under 10%, not before.
    const ten = atFloor(world('trust-floor-odds'), TRUST_FLOOR_CONFIG.warn);
    const id = ten.manager.id,
      [first] = roundsDrawing(ten, 0, TRUST_FLOOR_CONFIG.chance);
    for (let r = 1; r < first!; r++) {
      settleAt(ten, r);
      expect(ten.manager.id).toBe(id);
    }
    settleAt(ten, first!);
    expect(ten.manager.id).not.toBe(id);
    expect(ten.manager.interim).toBe(true);
    expect(ten.critical).toBe(MANAGER_GONE);
    expect(kinds(ten, 'manager-departure').at(-1)!.detail).toContain(REASON);
    expect(ten.managerHistory!.tenures[0]).toMatchObject({ manager: id, departure: 'resigned' });

    // At trust 0 a draw between 10% and 25% takes him where trust 1 would not.
    const zero = atFloor(world('trust-floor-odds'), 0),
      one = atFloor(world('trust-floor-odds'), 1);
    const [between] = roundsDrawing(zero, TRUST_FLOOR_CONFIG.chance, TRUST_FLOOR_CONFIG.zeroChance);
    expect(between).toBeDefined();
    settleAt(zero, between!);
    settleAt(one, between!);
    expect(zero.manager.interim).toBe(true);
    expect(one.manager.id).toBe(id);

    // The interim at trust 0 is neither warned nor drawn.
    const interim = ten.manager.id;
    ten.manager.trust = 0;
    for (let r = 1; r <= 46; r++) settleAt(ten, r);
    ten.manager.trustWarned = true;
    for (let r = 1; r <= 46; r++) settleAt(ten, r);
    expect(ten.manager.id).toBe(interim);
    expect(kinds(ten, 'manager-trust-warning')).toHaveLength(0);
  });

  it('clears the warning above the floor and warns again', () => {
    const w = world('trust-floor-clear');
    const id = w.manager.id;
    w.manager.trust = 8;
    settleAt(w, 3);
    expect(w.manager.trustWarned).toBe(true);
    w.manager.trust = TRUST_FLOOR_CONFIG.warn + 1;
    settleAt(w, 4);
    expect(w.manager).not.toHaveProperty('trustWarned');
    // The fall after recovering is a new warning, again with no draw that round.
    w.manager.trust = 0;
    const [hit] = roundsDrawing(w, 0, TRUST_FLOOR_CONFIG.zeroChance).filter((r) => r > 4);
    settleAt(w, hit!);
    expect(w.manager.id).toBe(id);
    expect(w.manager.trustWarned).toBe(true);
    expect(kinds(w, 'manager-trust-warning').map((event) => event.round)).toEqual([3, hit]);
    expect(kinds(w, 'manager-departure')).toHaveLength(0);
  });

  it('a trust-0 manager leaves at the close before renewal', () => {
    // His contract runs out this close: he goes for the broken trust, not the expiry.
    const w = world('trust-floor-close');
    const id = w.manager.id;
    w.manager.trust = 0;
    w.manager.until = w.year + 1;
    w.year++;
    yearlyStaff(w);
    expect(w.manager.interim).toBe(true);
    expect(kinds(w, 'manager-departure')).toHaveLength(1);
    expect(kinds(w, 'manager-departure')[0]!.detail).toContain(REASON);
    expect(w.managerHistory!.tenures[0]).toMatchObject({ manager: id, departure: 'resigned' });
    // Trust 1 is not the floor of the close, and a caretaker at 0 stays on.
    const one = world('trust-floor-close');
    one.manager.trust = 1;
    one.year++;
    yearlyStaff(one);
    expect(one.manager.id).toBe(id);
    w.manager.trust = 0;
    const interim = w.manager.id;
    yearlyStaff(w);
    expect(w.manager.id).toBe(interim);
  });

  it('a delegated post appoints a successor at once', () => {
    const w = atFloor(world('trust-floor-delegated'), 0);
    w.intervention = 3;
    w.settings = legacySettings(3);
    const id = w.manager.id,
      [hit] = roundsDrawing(w, 0, TRUST_FLOOR_CONFIG.zeroChance);
    settleAt(w, hit!);
    expect(w.manager.id).not.toBe(id);
    expect(w.manager.interim).toBeFalsy();
    expect(w.critical).toBeUndefined();
    expect(kinds(w, 'manager-departure').at(-1)!.detail).toContain(REASON);
    expect(kinds(w, 'manager-hire').at(-1)!.title).toContain(w.manager.name);
    expect(w.managerHistory!.tenures.map((tenure) => tenure.departure)).toEqual([
      'resigned',
      'replaced',
      undefined,
    ]);
  });

  it('the draw leaves other streams unchanged', () => {
    // The same club at the same trust: one manager is drawn for this round (and stays), the other
    // is warned instead of drawn. Every match plays the same.
    const drawn = atFloor(world('trust-floor-streams'), TRUST_FLOOR_CONFIG.warn);
    const warned = world('trust-floor-streams');
    warned.manager.trust = TRUST_FLOOR_CONFIG.warn;
    const round = drawn.round + 1;
    expect(draw(drawn, round)).toBeGreaterThanOrEqual(TRUST_FLOOR_CONFIG.chance);
    for (const w of [drawn, warned]) advanceRound(w, undefined, false);
    expect(kinds(warned, 'manager-trust-warning')).toHaveLength(1);
    expect(kinds(drawn, 'manager-trust-warning')).toHaveLength(0);
    expect(drawn.manager.id).toBe(warned.manager.id);
    const scores = (w: World) =>
      w.fixtures.filter((f) => f.score).map((f) => [f.id, f.score!.home, f.score!.away]);
    expect(scores(drawn).length).toBeGreaterThan(0);
    expect(scores(drawn)).toEqual(scores(warned));
    // The next round both draw the same stream and still play alike.
    for (const w of [drawn, warned]) advanceRound(w, undefined, false);
    expect(scores(drawn)).toEqual(scores(warned));
    expect(drawn.manager.id).toBe(warned.manager.id);
    expect(() => validateWorld(drawn)).not.toThrow();
  });
});
