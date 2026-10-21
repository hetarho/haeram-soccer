import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { FORMATIONS } from '../player';
import { playGrid } from './engine';
import {
  depart,
  INTENTION_REASONS,
  inDanger,
  interruptAll,
  losePass,
  setIntention,
  takeBall,
  updateIntentions,
  type EndedIntention,
  type Intention,
} from './intentions';
import { MOTION_STATES, buildFrames } from './playback';
import { buildGridSetup } from './setup';
import { SHAPE_CONFIG, targetOf } from './shape';
import { createState, type GridPlayer, type GridState } from './state';
import type { TraceEntry } from './trace';
import { gridKit } from './testkit';

// Side 0 plays possession (4-3-3: 1 inverted full-back, 4 overlapping full-back, 7 deep-lying
// playmaker, 9 false nine), side 1 balanced (3-5-2).
const kit = gridKit(['possession', 'balanced'], 'intention-lab');
const TOP = (SHAPE_CONFIG.speed.base + SHAPE_CONFIG.speed.pace) * SHAPE_CONFIG.recoverySpeed;
const CARRY = MOTION_STATES.indexOf('carry');

/** A candidate state: side 0 has the ball in midfield, side 1 stands deep and away from it. */
function lab(): GridState {
  const s = createState({ ...kit.setup, model: MATCH_MODEL_REVISION });
  s.possession = 0;
  s.owner = [0, 7];
  s.ball = [62, 34];
  s.players[0][7]!.pos = [62, 34];
  s.players[1].forEach((gp, i) => i < 11 && (gp.pos = [92, 4 + 6 * i]));
  return s;
}

const run = (s: GridState, gp: GridPlayer, target: [number, number], seconds = 6) =>
  setIntention(s, gp, {
    kind: 'run',
    run: 'behind',
    priority: 'tactical',
    target,
    until: s.elapsed + seconds,
  });

const expectEnded = (gp: GridPlayer, kind: Intention['kind'], reason: EndedIntention['reason']) => {
  expect(gp.ended?.kind).toBe(kind);
  expect(gp.ended?.reason).toBe(reason);
  expect(gp.ended?.end).toBe(INTENTION_REASONS[reason]);
};

const setupOf = (id: string, observe: boolean) =>
  buildGridSetup(
    kit.w,
    // A modern season, so the managers substitute.
    { ...kit.f, id, year: 2024 },
    { observe, recordPlayers: true, model: MATCH_MODEL_REVISION },
  );
const watched = ['intention-a', 'intention-b'].map((id) => {
  const setup = setupOf(id, true);
  return { setup, result: playGrid(setup) };
});
/** Every traced slot of a match with its intention, entry and roster index. */
function* tracedSlots() {
  for (const { setup, result } of watched) {
    const trace = result.trace!;
    for (let n = 0; n < trace.length; n++) {
      const e = trace[n]!;
      for (let k = 0; k < 22; k++) {
        const i = e.intentions?.[k];
        const side = (k < 11 ? 0 : 1) as 0 | 1;
        // Snapshots lay players out by formation slot.
        const role = FORMATIONS[setup.tactics[side]].slots[k % 11]!.role;
        if (i && e.slots[k]! >= 0) yield { e, n, trace, k, side, role, i };
      }
    }
  }
}
const held = (i: Intention | EndedIntention): i is Intention => !('end' in i);

describe('grid intentions', () => {
  it('retains a feasible intention', () => {
    const s = lab();
    const nine = s.players[0][9]!;
    nine.pos = [70, 30];
    expect(run(s, nine, [88, 30])).toBe(true);
    const intention = nine.intention!;
    expect(nine.run).toEqual({ kind: 'behind', until: intention.until, target: [88, 30] });
    // Ordinary updates while he runs keep the same intention, target and start.
    for (let k = 1; k <= 5; k++) {
      s.elapsed += 0.5;
      nine.pos = [70 + 2 * k, 30];
      updateIntentions(s);
      expect(nine.intention).toBe(intention);
      expect(intention.target).toEqual([88, 30]);
      expect(intention.since).toBe(0);
      // Movement goes where the intention goes.
      expect(targetOf(s, 0, 9)).toEqual([88, 30]);
    }
    // A higher priority takes its place; a lower one cannot displace that in turn.
    takeBall(s, nine, [74, 30], 7);
    expectEnded(nine, 'run', 'replaced');
    expect(nine.run).toBeUndefined();
    expect(run(s, nine, [90, 30])).toBe(false);
    expect(nine.intention?.kind).toBe('receive');
    interruptAll(s, 'turnover');
    // Arrival achieves it; expiry ends one that ran out of time.
    run(s, nine, [80, 30]);
    nine.pos = [80, 30];
    updateIntentions(s);
    expectEnded(nine, 'run', 'arrival');
    run(s, nine, [82, 30], 2);
    s.elapsed += 2;
    updateIntentions(s);
    expectEnded(nine, 'run', 'expiry');
    // A target he cannot reach in time is no longer feasible.
    run(s, nine, [104, 2], 1);
    updateIntentions(s);
    expectEnded(nine, 'run', 'unreachable');
  });

  it('interrupts on a turnover or urgent danger', () => {
    const s = lab();
    const nine = s.players[0][9]!;
    const marker = s.players[1][3]!;
    run(s, nine, [90, 30]);
    setIntention(s, marker, {
      kind: 'mark',
      priority: 'tactical',
      target: [88, 30],
      opponent: 9,
      until: 8,
    });
    const taker = s.players[1][5]!;
    setIntention(s, taker, { kind: 'restart', priority: 'restart', target: [70, 68], until: 30 });
    interruptAll(s, 'turnover');
    expectEnded(nine, 'run', 'turnover');
    expectEnded(marker, 'mark', 'turnover');
    // A restart place outranks a turnover; a dead ball itself interrupts it.
    expect(taker.intention?.kind).toBe('restart');
    interruptAll(s, 'restart');
    expectEnded(taker, 'restart', 'restart');

    // Side 1's carrier 15 m from side 0's goal: an urgent danger for side 0.
    const d = lab();
    d.possession = 1;
    d.owner = [1, 9];
    const carrier = d.players[1][9]!;
    carrier.pos = [15, 34];
    d.ball = [15, 34];
    d.players[0].forEach((gp, i) => i > 0 && i < 11 && (gp.pos = [40, 3 + 6 * i]));
    const back = d.players[0][2]!;
    back.pos = [18, 30];
    setIntention(d, back, { kind: 'recover', priority: 'tactical', target: [8, 30], until: 6 });
    expect(inDanger(d, 0)).toBe(true);
    updateIntentions(d);
    expectEnded(back, 'recover', 'danger');
    expect(back.intention).toMatchObject({ kind: 'press', priority: 'danger', opponent: 9 });
    // Out of the defenders' line to stop him: goal-side of the carrier.
    expect(back.intention!.target[0]).toBeLessThan(15);
    // The danger passes once he is back in midfield.
    carrier.pos = [60, 34];
    d.ball = [60, 34];
    d.elapsed += 1;
    updateIntentions(d);
    expect(inDanger(d, 0)).toBe(false);
    expectEnded(back, 'press', 'cleared');
  });

  it('cancels a lost receiving opportunity', () => {
    const s = lab();
    const nine = s.players[0][9]!;
    run(s, nine, [88, 30]);
    losePass(s, 0, 7, 9);
    expect(nine.intention).toBeUndefined();
    expect(nine.run).toBeUndefined();
    expectEnded(nine, 'receive', 'lost');
    expect(nine.ended?.teammate).toBe(7);
    // A ball he was taking goes to someone else.
    const six = s.players[0][6]!;
    takeBall(s, six, [60, 40], 7);
    expect(six.intention).toMatchObject({ kind: 'receive', priority: 'committed', teammate: 7 });
    s.owner = [1, 7];
    s.possession = 1;
    updateIntentions(s);
    expectEnded(six, 'receive', 'lost');
    // A teammate showing for a carrier who no longer has the ball stops.
    const t = lab();
    const eight = t.players[0][8]!;
    setIntention(t, eight, {
      kind: 'support',
      priority: 'tactical',
      target: [58, 30],
      teammate: 7,
      until: 5,
    });
    t.owner = [0, 9];
    updateIntentions(t);
    expectEnded(eight, 'support', 'moved');
    // In play: passes that did not arrive cancel the receivers' chances.
    let lost = 0;
    for (const { i, e } of tracedSlots())
      if (!held(i) && i.kind === 'receive' && i.reason === 'lost') {
        lost++;
        expect(i.at).toBeLessThanOrEqual(e.elapsed);
      }
    expect(lost).toBeGreaterThan(20);
  });

  it('clears departed-player references', () => {
    const s = lab();
    const nine = s.players[0][9]!;
    const marker = s.players[1][3]!;
    const six = s.players[0][6]!;
    run(s, nine, [90, 30]);
    setIntention(s, marker, {
      kind: 'mark',
      priority: 'tactical',
      target: [88, 30],
      opponent: 9,
      until: 8,
    });
    setIntention(s, six, {
      kind: 'support',
      priority: 'tactical',
      target: [58, 30],
      teammate: 9,
      until: 5,
    });
    nine.onPitch = false;
    depart(s, nine, 'injury');
    expectEnded(nine, 'run', 'injury');
    expectEnded(marker, 'mark', 'departed');
    expectEnded(six, 'support', 'departed');
    // A player leaving with nothing in mind still records why.
    const seven = s.players[0][7]!;
    seven.sentOff = true;
    depart(s, seven, 'dismissal');
    expect(seven.ended).toMatchObject({ kind: 'exit', reason: 'dismissal', end: 'displaced' });
    // Through whole matches with substitutions, no intention points at someone off the pitch.
    let changes = 0;
    for (const { e, side, i } of tracedSlots()) {
      if (!held(i)) continue;
      const roster = (sd: 0 | 1) => Array.from(e.slots.slice(sd * 11, sd * 11 + 11));
      if (i.teammate !== undefined) expect(roster(side)).toContain(i.teammate);
      if (i.opponent !== undefined) expect(roster(side === 0 ? 1 : 0)).toContain(i.opponent);
    }
    for (const { result } of watched)
      changes += result.trace!.filter((e) => e.action === 'sub' || e.action === 'injury').length;
    expect(changes).toBeGreaterThan(0);
  });

  it('keeps role differences observable', () => {
    /** Run intentions side 0's players start over many moments of the same situation. */
    const runs = (traits?: GridPlayer['player']['traits']) => {
      const s = lab();
      if (traits) s.players[0][9]!.player = { ...s.players[0][9]!.player, traits };
      const count = new Map<number, Set<string>>();
      for (let k = 0; k < 800; k++) {
        s.elapsed = k * 0.7;
        for (const gp of s.players[0]) gp.intention = gp.run = undefined;
        updateIntentions(s);
        for (const gp of s.players[0])
          if (gp.intention?.kind === 'run')
            count.set(gp.idx, (count.get(gp.idx) ?? new Set()).add(`${gp.intention.run}@${k}`));
      }
      return (idx: number) => count.get(idx)?.size ?? 0;
    };
    const plain = runs([]);
    // The overlapping full-back overlaps, the inverted one on the other side never does.
    expect(plain(4)).toBeGreaterThan(0);
    expect(plain(1)).toBe(0);
    expect(plain(9)).toBeGreaterThan(0);
    // A speedster runs more from the same moments.
    expect(runs(['speedster'])(9)).toBeGreaterThan(plain(9));
    // In play: an overlap only comes from an overlapping role, a run in behind from a forward or
    // a runner's role, and a covering role covers more than any other.
    const covers = new Map<string, number>();
    let overlaps = 0;
    for (const { i, role } of tracedSlots()) {
      if (!held(i)) continue;
      if (i.kind === 'run' && i.run === 'overlap') {
        overlaps++;
        expect(['overlappingFullBack', 'attackingWingBack']).toContain(role);
      }
      if (i.kind === 'cover') covers.set(role, (covers.get(role) ?? 0) + 1);
    }
    expect(overlaps).toBeGreaterThan(0);
    const ranked = [...covers].sort((a, b) => b[1] - a[1]);
    expect(['coverDefender', 'anchor']).toContain(ranked[0]![0]);
  });

  it('is deterministic with observation disabled', () => {
    const quiet = playGrid(setupOf('intention-a', false));
    const again = playGrid(setupOf('intention-a', false));
    expect(again.record).toEqual(quiet.record);
    expect(again.elapsed).toBe(quiet.elapsed);
    // Observation reads the intentions and never changes them.
    expect(watched[0]!.result.record).toEqual(quiet.record);
    expect(watched[0]!.result.elapsed).toBe(quiet.elapsed);
    expect(quiet.trace).toBeUndefined();
    // Another fixture draws other intentions.
    expect(playGrid(setupOf('intention-c', false)).record).not.toEqual(quiet.record);
  });

  it('exposes the engine target and partner to trace and playback without jumps', () => {
    let checked = 0,
      changed = 0;
    for (const { e, n, trace, k, i } of tracedSlots()) {
      if (!held(i)) continue;
      if (e.states[k] !== CARRY) {
        // The traced target is the one the engine moves him to.
        expect(e.targets[k * 2]).toBeCloseTo(i.target[0], 3);
        expect(e.targets[k * 2 + 1]).toBeCloseTo(i.target[1], 3);
        checked++;
      }
      const prev = trace[n - 1];
      const before = prev?.intentions?.[k];
      if (!prev || prev.period !== e.period || e.transition || prev.slots[k] !== e.slots[k])
        continue;
      if (before && held(before) && before.since === i.since && before.kind === i.kind) continue;
      // A new intention starts where he stood: bounded movement, never a jump.
      changed++;
      const moved = Math.hypot(
        e.positions[k * 2]! - prev.positions[k * 2]!,
        e.positions[k * 2 + 1]! - prev.positions[k * 2 + 1]!,
      );
      expect(moved).toBeLessThanOrEqual(TOP * (e.elapsed - prev.elapsed) + 1e-3);
    }
    expect(checked).toBeGreaterThan(1000);
    expect(changed).toBeGreaterThan(100);
    // Playback frames carry the same intention, target and partner by player ID.
    const { setup, result } = watched[0]!;
    const frames = buildFrames(result, setup, kit.w.seed);
    const ids = new Set(setup.rosters.flat().map((p) => p.id));
    let shown = 0;
    for (const f of frames)
      for (const sample of f.motion ?? [])
        for (const side of sample.players)
          for (const p of side) {
            if (!p.intention) continue;
            shown++;
            if (p.intention.teammate) expect(ids.has(p.intention.teammate)).toBe(true);
            if (p.intention.opponent) expect(ids.has(p.intention.opponent)).toBe(true);
            if (!p.intention.ended && p.state !== 'carry') {
              expect(p.intent[0]).toBeCloseTo(p.intention.target[0], 3);
              expect(p.intent[1]).toBeCloseTo(p.intention.target[1], 3);
            }
          }
    expect(shown).toBeGreaterThan(1000);
    // On the pre-feature path nothing changes: no intentions are traced.
    const old = playGrid(
      buildGridSetup(kit.w, { ...kit.f, id: 'intention-a' }, { observe: true, recordPlayers: true }),
    );
    expect(old.trace!.every((e: TraceEntry) => e.intentions === undefined)).toBe(true);
  });
});
