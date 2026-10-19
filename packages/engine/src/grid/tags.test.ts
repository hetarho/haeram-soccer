import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../player';
import type { Point } from './pitch';
import { computeTags } from './tags';
import { gridKit } from './testkit';

/** A side-0 carrier (slot 9) on the ball at `at`, every other player parked far away; returns the kit. */
function scene(at: Point) {
  const kit = gridKit(['balanced', 'balanced']);
  const s = kit.state;
  for (const side of s.players)
    for (const gp of side) gp.pos = [gp.side === 0 ? 3 : 102, gp.side === 0 ? 2 : 66];
  s.players[0][9]!.pos = [...at];
  s.owner = [0, 9];
  s.ball = [...at];
  s.possession = 0;
  return kit;
}
const place = (kit: ReturnType<typeof gridKit>, side: 0 | 1, idx: number, p: Point) => {
  kit.state.players[side][idx]!.pos = [...p];
};
const tags = (kit: ReturnType<typeof gridKit>, opts?: Parameters<typeof computeTags>[3]) =>
  computeTags(kit.state, 0, 9, opts);
const slotIndex = (side: 0 | 1, positions: string[]) =>
  FORMATIONS.balanced.slots
    .map((slot, i) => [slot, i] as const)
    .filter(([slot]) => positions.includes(slot.position))
    .map(([, i]) => i);

describe('grid tags', () => {
  it('counts pressure with goal-side opponents weighing double', () => {
    const kit = scene([60, 34]);
    place(kit, 1, 3, [63, 34]);
    expect(tags(kit).pressure).toBe(1);
    expect(tags(kit).nearest).toBeCloseTo(3, 9);
    place(kit, 1, 3, [57, 34]);
    expect(tags(kit).pressure).toBe(0.5);
    place(kit, 1, 3, [65, 34]);
    expect(tags(kit).pressure).toBe(0);
    place(kit, 1, 4, [63, 34]);
    expect(tags(kit).pressure).toBe(1);
  });

  it('detects between the lines and a pocket', () => {
    const kit = scene([60, 30]);
    // Opponent (side 1) lines in side 0's frame: MF line at x 55, DF line at x 75.
    for (const i of slotIndex(1, ['LM', 'CM', 'RM', 'DM', 'AM'])) place(kit, 1, i, [55, 20]);
    for (const i of slotIndex(1, ['CB', 'LB', 'RB'])) place(kit, 1, i, [75, 40]);
    expect(tags(kit).lane).toBe(2);
    expect(tags(kit).betweenLines).toBe(true);
    expect(tags(kit).pocket).toBe(true);
    place(kit, 1, 4, [64, 30]);
    expect(tags(kit).betweenLines).toBe(true);
    expect(tags(kit).pocket).toBe(false);
    const wide = scene([60, 5]);
    expect(computeTags(wide.state, 0, 9).betweenLines).toBe(false);
  });

  it('detects in behind against the second-last defender', () => {
    const kit = scene([80, 34]);
    place(kit, 1, 0, [104, 34]);
    place(kit, 1, 2, [85, 20]);
    place(kit, 1, 3, [86, 40]);
    for (const i of [1, 4, 5, 6, 7, 8, 9, 10]) place(kit, 1, i, [60, 60]);
    expect(tags(kit).inBehind).toBe(false);
    place(kit, 0, 9, [87, 34]);
    expect(tags(kit).inBehind).toBe(true);
  });

  it('detects the CB–FB channel', () => {
    const kit = scene([75, 20]);
    const [cb] = slotIndex(1, ['CB']);
    const [fb] = slotIndex(1, ['LB', 'RB', 'LWB', 'RWB']);
    // In side 0's frame the opponent CB stands at y 30 and its FB at y 12; the carrier at y 20 sits between.
    place(kit, 1, cb!, [75, 30]);
    place(kit, 1, fb!, [76, 12]);
    for (const i of slotIndex(1, ['CB', 'LB', 'RB', 'LWB', 'RWB']))
      if (i !== cb && i !== fb) place(kit, 1, i, [76, 60]);
    expect(tags(kit).lane).toBe(1);
    expect(tags(kit).channel).toBe(true);
    place(kit, 0, 9, [75, 40]);
    kit.state.ball = [75, 40];
    expect(tags(kit).channel).toBe(false);
    place(kit, 0, 9, [50, 20]);
    expect(tags(kit).channel).toBe(false);
  });

  it('reads back to goal after a backward pass under goal-side pressure', () => {
    const kit = scene([60, 34]);
    kit.state.lastPass = { dx: -8, dy: 2 };
    place(kit, 1, 3, [62, 34]);
    expect(tags(kit).orientation).toBe('backToGoal');
    place(kit, 1, 3, [58, 34]);
    expect(tags(kit).orientation).toBe('facing');
    kit.state.lastPass = { dx: 1, dy: 9 };
    expect(tags(kit).orientation).toBe('halfTurn');
    place(kit, 1, 3, [62, 34]);
    expect(tags(kit).orientation).toBe('facing');
    kit.state.lastPass = undefined;
    expect(tags(kit).orientation).toBe('facing');
  });

  it('names phases: build-up, progression, final third, counter within 8 s of a regain, set piece', () => {
    const phaseAt = (x: number, opts?: Parameters<typeof computeTags>[3]) => {
      const kit = scene([x, 34]);
      kit.state.elapsed = 100;
      kit.state.possessionSince = 95;
      return tags(kit, opts).phase;
    };
    expect(phaseAt(20)).toBe('buildUp');
    expect(phaseAt(45)).toBe('progression');
    expect(phaseAt(80)).toBe('finalThird');
    expect(phaseAt(80, { setPiece: true })).toBe('setPiece');
    expect(phaseAt(45, { contest: true })).toBe('contest');
    const kit = scene([45, 34]);
    kit.state.elapsed = 100;
    kit.state.possessionSince = 95;
    kit.state.lastRegain = { side: 0, at: 94 };
    // Eleven opponents stand goal-side of the ball: no counter yet.
    expect(tags(kit).phase).toBe('progression');
    for (const i of [1, 2, 3, 4, 5, 6]) place(kit, 1, i, [30, 10 + i * 8]);
    expect(tags(kit).phase).toBe('counter');
    kit.state.lastRegain = { side: 0, at: 90 };
    expect(tags(kit).phase).toBe('progression');
    kit.state.lastRegain = { side: 1, at: 96 };
    expect(tags(kit).phase).toBe('progression');
    kit.state.lastRegain = undefined;
    kit.state.possessionSince = 60;
    expect(tags(kit).phase).toBe('settled');
    place(kit, 0, 9, [80, 34]);
    kit.state.ball = [80, 34];
    expect(tags(kit).phase).toBe('finalThird');
  });

  it("reports lead, minute and men difference from the carrier's side", () => {
    const kit = scene([60, 34]);
    kit.state.score = [2, 1];
    kit.state.elapsed = 61 * 60 + 5;
    kit.state.players[1][5]!.sentOff = true;
    const home = computeTags(kit.state, 0, 9);
    expect([home.lead, home.minute, home.menDiff]).toEqual([1, 62, 1]);
    kit.state.players[1][4]!.pos = [30, 34];
    kit.state.players[1][4]!.onPitch = true;
    const away = computeTags(kit.state, 1, 4);
    expect([away.lead, away.minute, away.menDiff]).toEqual([-1, 62, -1]);
    expect(home.overload).toBe(1 - 0);
  });
});
