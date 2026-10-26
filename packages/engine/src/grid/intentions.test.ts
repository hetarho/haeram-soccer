import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { FORMATIONS } from '../player';
import { BOX_CONFIG, boxScene, boxSide, boxZones } from './box';
import { playGrid } from './engine';
import { DISORDER_CONFIG, FREEDOM_CONFIG, looseness } from './freedom';
import {
  attackZones,
  carryTo,
  depart,
  INTENTION_REASONS,
  inDanger,
  interruptAll,
  losePass,
  restartTaken,
  setIntention,
  takeBall,
  updateIntentions,
  type EndedIntention,
  type Intention,
} from './intentions';
import type { Point } from './pitch';
import { MOTION_STATES, buildFrames } from './playback';
import { buildGridSetup } from './setup';
import { runPlan, SHAPE_CONFIG, shapePlace, targetOf } from './shape';
import { random } from '../primitives';
import { createState, type GridPlayer, type GridState } from './state';
import type { TraceEntry } from './trace';
import { gridKit, type Kit } from './testkit';

// Side 0 plays possession (4-3-3: 1 inverted full-back, 4 overlapping full-back, 7 deep-lying
// playmaker, 9 false nine), side 1 balanced (3-5-2). The pre-feature path's kit: candidate cases
// set the setup's model.
const kit = gridKit(['possession', 'balanced'], 'intention-lab', DISABLED_RELEASE);
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
const ended = (i: Intention | EndedIntention): i is EndedIntention => 'end' in i;
const held = (i: Intention | EndedIntention) => !ended(i);

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
    // A carrier who reached his reception carries on: the reception is achieved, not displaced.
    const ten = s.players[0][10]!;
    takeBall(s, ten, [ten.pos[0], ten.pos[1]], 7);
    carryTo(s, ten, [ten.pos[0] + 5, ten.pos[1]]);
    expectEnded(ten, 'receive', 'arrival');
    expect(ten.intention?.kind).toBe('carry');

    // The players who went up for a delivery hold their box spots, standing on them, for the second
    // ball until `setPiece.stay`; a turnover ends the hold earlier.
    const stay = SHAPE_CONFIG.setPiece.stay;
    const h = lab();
    const up = [h.players[0][2]!, h.players[0][3]!];
    const spots: [number, number][] = [
      [98.5, 30.5],
      [98.5, 37.5],
    ];
    up.forEach((gp, i) => (gp.pos = [...spots[i]!]));
    restartTaken(
      h,
      up.map((gp, i) => ({ gp, to: spots[i]! })),
      h.elapsed + stay,
    );
    for (let t = 1; t < stay; t++) {
      h.elapsed = t;
      updateIntentions(h);
      up.forEach((gp, i) => {
        expect(gp.intention).toMatchObject({ kind: 'run', run: 'box', priority: 'committed' });
        expect(gp.run?.kind).toBe('box');
        expect(targetOf(h, 0, gp.idx)).toEqual(spots[i]);
      });
    }
    h.elapsed = stay;
    updateIntentions(h);
    expectEnded(up[0]!, 'run', 'expiry');
    restartTaken(h, [{ gp: up[1]!, to: spots[1]! }], h.elapsed + stay);
    interruptAll(h, 'turnover');
    expectEnded(up[1]!, 'run', 'turnover');
    // In play the hold never ends on arrival.
    let holds = 0;
    for (const { i } of tracedSlots())
      if (i.kind === 'run' && i.run === 'box' && i.priority === 'committed') {
        holds++;
        if (ended(i)) expect(i.reason).not.toBe('arrival');
      }
    expect(holds).toBeGreaterThan(0);
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

    // A danger that starts while he already presses makes his press urgent, the same intention.
    const e = lab();
    e.possession = 1;
    e.owner = [1, 9];
    const runner = e.players[1][9]!;
    runner.pos = [40, 34];
    e.ball = [40, 34];
    e.players[0].forEach((gp, i) => i > 0 && i < 11 && (gp.pos = [60, 3 + 6 * i]));
    const presser = e.players[0][5]!;
    presser.pos = [42, 34];
    setIntention(e, presser, {
      kind: 'press',
      priority: 'tactical',
      target: [41, 34],
      opponent: 9,
      until: 6,
    });
    updateIntentions(e);
    expect(presser.intention).toMatchObject({ kind: 'press', priority: 'tactical', since: 0 });
    runner.pos = [20, 34];
    e.ball = [20, 34];
    presser.pos = [24, 34];
    e.elapsed = 1;
    updateIntentions(e);
    expect(presser.intention).toMatchObject({ kind: 'press', priority: 'danger', since: 0 });
  });

  it('cancels a lost receiving opportunity', () => {
    const s = lab();
    const nine = s.players[0][9]!;
    // The run he was played into ends as lost, keeping what he was doing.
    run(s, nine, [88, 30]);
    losePass(s, 0, 7, 9);
    expect(nine.intention).toBeUndefined();
    expect(nine.run).toBeUndefined();
    expectEnded(nine, 'run', 'lost');
    expect(nine.ended?.target).toEqual([88, 30]);
    // A teammate with nothing else in mind loses his chance to receive from the passer.
    const ten = s.players[0][10]!;
    losePass(s, 0, 7, 10);
    expectEnded(ten, 'receive', 'lost');
    expect(ten.ended?.teammate).toBe(7);
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
      if (ended(i) && i.reason === 'lost') {
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
      if (i.shadow !== undefined) expect(roster(side === 0 ? 1 : 0)).toContain(i.shadow);
    }
    // Every exit and entry is traced with the intention the leaver ended with, and why he left.
    for (const { result } of watched)
      for (const e of result.trace!) {
        if (e.transition !== 'exit' && e.transition !== 'entry') continue;
        changes++;
        expect(['substitution', 'injury', 'dismissal']).toContain(e.left?.reason);
        expect(e.left!.at).toBeLessThanOrEqual(e.elapsed);
      }
    expect(changes).toBeGreaterThan(0);
  });

  it('a screen ends cleared when the ball is played', () => {
    /**
     * Balanced's block in its shape against side 0's carrier 7 at [40, 34], pressed from 4 m by its
     * striker 10, with side 0's 9 ahead in the left half-space: one update gives out the screen.
     */
    const screened = () => {
      const s = lab();
      s.players[0].forEach((gp, i) => i !== 7 && (gp.pos = [1, 2 + 6 * i]));
      s.players[0][7]!.pos = [40, 34];
      s.ball = [40, 34];
      for (const gp of s.players[1]) gp.pos = shapePlace(s, 1, gp.idx);
      s.players[1][10]!.pos = [43, 36.5];
      s.players[0][9]!.pos = [72, 22];
      updateIntentions(s);
      const screener = s.players[1].find((gp) => gp.intention?.kind === 'screen')!;
      expect(screener.intention).toMatchObject({ priority: 'tactical', opponent: 7, shadow: 9 });
      return { s, screener };
    };
    const { s, screener } = screened();
    // An ordinary update keeps him in the lane.
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(screener.intention?.kind).toBe('screen');
    // The carrier plays the ball to another teammate: that lane is gone.
    const six = s.players[0][6]!;
    six.pos = [36, 20];
    takeBall(s, six, [36, 20], 7);
    s.owner = [0, 6];
    s.ball = [36, 20];
    s.elapsed += 0.5;
    updateIntentions(s);
    expectEnded(screener, 'screen', 'cleared');
    // The receiver leaving the lane for the wing in his own half ends it the same way.
    const left = screened();
    left.s.players[0][9]!.pos = [45, 2];
    left.s.elapsed += 0.5;
    updateIntentions(left.s);
    expectEnded(left.screener, 'screen', 'cleared');
    // The receiver leaving the pitch ends it as departed.
    const gone = screened();
    const nine = gone.s.players[0][9]!;
    nine.onPitch = false;
    depart(gone.s, nine, 'injury');
    expectEnded(gone.screener, 'screen', 'departed');
    // In play: screens are traced as marking the lane and never end on arrival.
    let screens = 0;
    for (const { e, k, i } of tracedSlots()) {
      if (i.kind !== 'screen') continue;
      screens++;
      if (ended(i)) expect(i.reason).not.toBe('arrival');
      else expect(MOTION_STATES[e.states[k]!]).toBe('mark');
    }
    expect(screens).toBeGreaterThan(0);
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
    // Right after an update, the targets movement reads (`advance` → `targetOf`) are the intentions'.
    const s = lab();
    s.players[1][6]!.pos = [64, 36];
    s.players[0][9]!.pos = [80, 30];
    run(s, s.players[0][9]!, [96, 30]);
    updateIntentions(s);
    const holders = s.players.flat().filter((gp) => gp.intention);
    expect(holders.map((gp) => gp.intention!.kind)).toEqual(
      expect.arrayContaining(['run', 'press', 'support', 'mark']),
    );
    for (const gp of holders) expect(targetOf(s, gp.side, gp.idx)).toEqual(gp.intention!.target);
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
      buildGridSetup(
        kit.w,
        { ...kit.f, id: 'intention-a' },
        { observe: true, recordPlayers: true },
      ),
    );
    expect(old.trace!.every((e: TraceEntry) => e.intentions === undefined)).toBe(true);
  });
});

describe('late box runs (T398)', () => {
  it('a box-to-box midfielder arrives in the box late in a settled attack more often than an anchor, on the candidate model only', () => {
    const B = SHAPE_CONFIG.candidate.boxRun as { odds: number; from: number };
    const kept = { odds: B.odds, from: B.from };
    // Side 1 plays balanced's 3-5-2: slot 6 the anchor, slot 7 the box-to-box midfielder.
    const runs = (candidate: boolean, slot: number, odds: number) => {
      Object.assign(B, { odds, from: 5 });
      try {
        const s = createState(
          candidate ? { ...kit.setup, model: MATCH_MODEL_REVISION } : kit.setup,
        );
        s.possession = 1;
        const gp = s.players[1][slot]!;
        const r = random('t398-box-runs');
        let n = 0;
        for (let i = 0; i < 4000; i++)
          if (runPlan(s, gp, { b: [92, 34], band: 5, line: 100 }, r)?.kind === 'box') n++;
        return n;
      } finally {
        Object.assign(B, kept);
      }
    };
    expect(runs(true, 7, 2)).toBeGreaterThan(1.6 * runs(true, 7, 1));
    expect(runs(true, 7, 1)).toBeGreaterThan(0);
    expect(runs(true, 6, 2)).toBe(0);
    // The pre-feature model keeps its own odds.
    expect(runs(false, 7, 2)).toBe(runs(false, 7, 1));
    expect(runs(true, 7, 1)).toBe(runs(false, 7, 1));
  });
});

describe('the box scene’s runs (→MATCH-33, T443)', () => {
  /**
   * Side 0's right winger 10 on the ball wide in the final third; its false nine 9, left winger 8,
   * mezzala 6 and deep-lying playmaker 7 around the box, the anchor 5 and the centre-backs 2 and 3
   * behind, the full-backs wide. Side 1 stands deep and away from it (`lab`). The false nine
   * stands nearer the near post than the far post, 8 m out since T447 (at [90, 36] he was nearer
   * the far post).
   */
  function wide(): GridState {
    const s = lab();
    s.owner = [0, 10];
    s.ball = [85, 62];
    const at: Record<number, [number, number]> = {
      1: [70, 10],
      2: [55, 26],
      3: [55, 42],
      4: [72, 56],
      5: [66, 34],
      6: [80, 28],
      7: [74, 40],
      8: [86, 14],
      9: [95, 37],
      10: [85, 62],
    };
    for (const [idx, p] of Object.entries(at)) s.players[0][Number(idx)]!.pos = p;
    return s;
  }
  const zones = boxZones(1);
  const boxJob = (gp: GridPlayer) => (gp.intention?.kind === 'run' ? gp.intention.box : undefined);

  it('with the ball wide in the final third the forwards attack the near and far post and a midfielder the penalty spot', () => {
    const s = wide();
    expect(boxSide(s, 0)).toBe(1);
    updateIntentions(s);
    const p = s.players[0];
    // The forwards take the posts (the false nine the nearer), the mezzala the spot, the
    // deep-lying playmaker the edge; each a committed box run named for the ball's side.
    expect(p[9]!.intention).toMatchObject({
      kind: 'run',
      run: 'box',
      priority: 'committed',
      box: { zone: 'nearPost', ball: 1 },
    });
    expect(boxJob(p[8]!)).toEqual({ zone: 'farPost', ball: 1 });
    expect(boxJob(p[6]!)).toEqual({ zone: 'spot', ball: 1 });
    expect(boxJob(p[7]!)).toEqual({ zone: 'edge', ball: 1 });
    // One attacker per zone, and nobody else on a box-scene run.
    expect(p.filter((gp) => boxJob(gp)).map((gp) => gp.idx)).toEqual([6, 7, 8, 9]);
    expect(p[9]!.run).toMatchObject({ kind: 'box' });
    // Who goes is read from the snapshot: the same state plans the same scene.
    const again = wide();
    expect(boxScene(again, 0)!.runners).toEqual({ nearPost: 9, farPost: 8, spot: 6, edge: 7 });
    // A forward already on a tactical run in behind is taken into the scene; a committed run stays.
    const t = wide();
    run(t, t.players[0][9]!, [96, 36]);
    expect(boxScene(t, 0)!.runners.nearPost).toBe(9);
    takeBall(t, t.players[0][9]!, [90, 36]);
    expect(boxScene(t, 0)!.runners.nearPost).not.toBe(9);
  });

  it('runners wait at their load points and attack the zones when a cross is decided', () => {
    const s = wide();
    updateIntentions(s);
    const p = s.players[0];
    const load = (z: Point): [number, number] => [z[0] - BOX_CONFIG.load, z[1]];
    expect(p[9]!.intention!.target).toEqual(load(zones.nearPost));
    expect(p[8]!.intention!.target).toEqual(load(zones.farPost));
    expect(p[6]!.intention!.target).toEqual(load(zones.spot));
    expect(p[7]!.intention!.target).toEqual(load(zones.edge));
    expect(p[9]!.run!.target).toEqual(load(zones.nearPost));
    // An ordinary update keeps them there: they wait rather than stand in the zone.
    p[9]!.pos = [95, 35];
    s.elapsed += 1;
    updateIntentions(s);
    expect(p[9]!.intention).toMatchObject({ box: { zone: 'nearPost' } });
    expect(p[9]!.intention!.target).toEqual(load(zones.nearPost));
    // The carrier decides a cross: each attacks his zone itself, and movement goes there.
    attackZones(s, 0);
    expect(p[9]!.intention!.target).toEqual([...zones.nearPost]);
    expect(p[8]!.intention!.target).toEqual([...zones.farPost]);
    expect(p[6]!.intention!.target).toEqual([...zones.spot]);
    expect(p[7]!.intention!.target).toEqual([...zones.edge]);
    expect(p[9]!.run!.target).toEqual([...zones.nearPost]);
    expect(targetOf(s, 0, 9)).toEqual([...zones.nearPost]);
    // With the ball wide with a carrier again they go back to wait at their load points.
    s.elapsed += 1;
    updateIntentions(s);
    expect(p[9]!.intention!.target).toEqual(load(zones.nearPost));
    // The ball played back out of the final third ends the scene's runs.
    s.ball = [60, 50];
    p[10]!.pos = [60, 50];
    s.elapsed += 1;
    updateIntentions(s);
    for (const idx of [6, 7, 8, 9]) {
      expect(boxJob(p[idx]!)).toBeUndefined();
      expectEnded(p[idx]!, 'run', 'cleared');
    }
  });

  it('the box jobs never share a moment with a set piece’s jobs or take a guard’s committed priority', () => {
    // §4.7's own jobs, which tests/e2e/set-piece-defence.spec.ts reads as the scene's: a committed
    // box spot without a box-scene job, a committed mark, a committed zone or goal guard.
    const setPiece = (i: Intention) =>
      i.priority === 'committed' &&
      !i.box &&
      (i.kind === 'run' || i.kind === 'mark' || (i.kind === 'cover' && !!i.zone));
    let boxJobs = 0,
      setPieceMoments = 0;
    for (const { result } of watched)
      for (const e of result.trace!) {
        const holding = (e.intentions ?? []).filter((i): i is Intention => !!i && held(i));
        const box = holding.filter((i) => i.box);
        boxJobs += box.length;
        // A box guard is a tactical cover, a box runner a committed run (§4.8).
        for (const i of box)
          expect([i.kind, i.priority]).toEqual(
            i.kind === 'cover' ? ['cover', 'tactical'] : ['run', 'committed'],
          );
        if (!holding.some(setPiece)) continue;
        setPieceMoments++;
        expect(box, `${e.elapsed}`).toEqual([]);
      }
    expect(boxJobs).toBeGreaterThan(0);
    expect(setPieceMoments).toBeGreaterThan(0);
  });

  it('the rest defence stays home', () => {
    const s = wide();
    // The anchor and a centre-back stand nearest the edge and the spot.
    s.players[0][5]!.pos = [86, 34];
    s.players[0][2]!.pos = [93, 33];
    updateIntentions(s);
    const p = s.players[0];
    for (const idx of [2, 3, 5]) expect(boxJob(p[idx]!)).toBeUndefined();
    expect(boxScene(wide(), 0)!.runners).toMatchObject({ spot: 6, edge: 7 });
    // With the midfielders busy the zones stay empty rather than call the rest defence up.
    const t = wide();
    t.players[0][5]!.pos = [86, 34];
    for (const idx of [6, 7])
      setIntention(t, t.players[0][idx]!, {
        kind: 'support',
        support: 'show',
        priority: 'tactical',
        target: [80, 50],
        teammate: 10,
        until: t.elapsed + 5,
      });
    const scene = boxScene(t, 0)!;
    expect(scene.runners.spot).toBeUndefined();
    expect(scene.runners.edge).toBeUndefined();
    expect(Object.values(scene.runners)).not.toContain(5);
  });
});

/** A tendency row with this freedom and neutral others (T432 reads only the freedom). */
const tendency = (freedom: number) => ({
  freedom,
  discipline: 0.5,
  pressing: 0.5,
  anticipation: 0.5,
});
/**
 * A revision-2 state of `k` with the per-match tendencies T432 reads: every player free by `base`,
 * side 0's `free` by their own, side 0 holding the ball at `ball` with nobody of side 1 near it.
 * `none` leaves the tendencies out, the freedom-less places to compare with.
 */
function freeLab(
  k: Kit,
  ball: Point,
  free: Record<number, number> = {},
  base = 0.1,
  none = false,
): GridState {
  const s = createState({
    ...k.setup,
    model: MATCH_MODEL_REVISION,
    ...(none
      ? {}
      : {
          tendencies: [
            k.setup.rosters[0].map((_, i) => tendency(free[i] ?? base)),
            k.setup.rosters[1].map(() => tendency(base)),
          ] as [ReturnType<typeof tendency>[], ReturnType<typeof tendency>[]],
        }),
  });
  s.possession = 0;
  s.owner = [0, 6];
  s.ball = [ball[0], ball[1]];
  s.players[0][6]!.pos = [ball[0], ball[1]];
  s.players[1].forEach((gp, i) => i < 11 && (gp.pos = [104, 4 + 6 * i]));
  s.elapsed = 600;
  return s;
}

describe('freedom in movement (→MATCH-17, STAFF-46, T432)', () => {
  // Side 0 plays counter (4-4-2: 1 LB, 2–3 CB, 4 RB, 5 LM, 6–7 CM, 8 RM, 9–10 ST).
  const counter = gridKit(['counter', 'balanced'], 'intention-lab', DISABLED_RELEASE);
  const D = FREEDOM_CONFIG.drift;

  it('a free full-back overlaps beyond his winger while a low-freedom one stays', () => {
    // The ball on the left flank in the opponents' half.
    const ball: Point = [80, 8];
    const free = freeLab(counter, ball, { 1: 1 });
    const still = freeLab(counter, ball);
    const plain = freeLab(counter, ball, {}, 0.1, true);
    expect(shapePlace(free, 0, 1)[0]).toBeGreaterThan(shapePlace(free, 0, 5)[0]);
    expect(shapePlace(free, 0, 1)[0] - shapePlace(plain, 0, 1)[0]).toBeCloseTo(
      FREEDOM_CONFIG.overlap * D,
    );
    // A low-freedom full-back stays near his place, behind his winger.
    expect(shapePlace(still, 0, 1)[0]).toBeLessThan(shapePlace(still, 0, 5)[0]);
    expect(shapePlace(still, 0, 1)[0] - shapePlace(plain, 0, 1)[0]).toBeLessThanOrEqual(
      0.1 * D + 1e-9,
    );
    // The far full-back holds while the free one goes: the rest defence stays (4-4-2's back four).
    expect(shapePlace(free, 0, 4)).toEqual(shapePlace(plain, 0, 4));
    for (const cb of [2, 3]) expect(shapePlace(free, 0, cb)).toEqual(shapePlace(plain, 0, cb));
  });

  it('a forward with freedom drops into midfield in the build-up', () => {
    // The ball with a centre-midfielder in his own half.
    const ball: Point = [30, 30];
    const free = freeLab(counter, ball, { 9: 1, 10: 0.2 });
    const plain = freeLab(counter, ball, {}, 0.1, true);
    const dropped = (s: GridState, idx: number) =>
      shapePlace(plain, 0, idx)[0] - shapePlace(s, 0, idx)[0];
    expect(dropped(free, 9)).toBeCloseTo(FREEDOM_CONFIG.drop * D);
    // Of the two strikers only the freer drops; the other holds the front line.
    expect(dropped(free, 10)).toBe(0);
    // Out of possession he holds his slot.
    const without = freeLab(counter, ball, { 9: 1 });
    without.possession = 1;
    without.owner = undefined;
    const plainWithout = freeLab(counter, ball, {}, 0.1, true);
    plainWithout.possession = 1;
    plainWithout.owner = undefined;
    expect(shapePlace(without, 0, 9)).toEqual(shapePlace(plainWithout, 0, 9));
  });

  it('disorder loosens after a turnover and re-forms', () => {
    const s = freeLab(counter, [60, 34]);
    const gp = s.players[0][7]!;
    gp.pos = [20, 60];
    const place = shapePlace(s, 0, 7);
    const toward = (t: [number, number]) => [
      (t[0] - place[0]) / (gp.pos[0] - place[0]),
      (t[1] - place[1]) / (gp.pos[1] - place[1]),
    ];
    // Ordered, he heads for his place.
    expect(targetOf(s, 0, 7)).toEqual(place);
    // Straight after a turnover he keeps `loosen` of his distance from it, whatever his freedom.
    s.lastLoss = { side: 1, at: s.elapsed };
    s.lastRegain = { side: 0, at: s.elapsed };
    for (const share of toward(targetOf(s, 0, 7)))
      expect(share).toBeCloseTo(DISORDER_CONFIG.loosen);
    // Halfway through the re-forming it is half as loose, and it has re-formed by `reform` s.
    s.elapsed += DISORDER_CONFIG.reform / 2;
    for (const share of toward(targetOf(s, 0, 7)))
      expect(share).toBeCloseTo(DISORDER_CONFIG.loosen / 2);
    s.elapsed += DISORDER_CONFIG.reform / 2;
    expect(targetOf(s, 0, 7)).toEqual(place);
    // The keeper never loosens.
    s.lastLoss = { side: 1, at: s.elapsed };
    const keeper = s.players[0][0]!;
    keeper.pos = [30, 10];
    expect(targetOf(s, 0, 0)).toEqual(shapePlace(s, 0, 0));
    // A set piece's kick loosens it the same way (`restartTaken`).
    const t = freeLab(counter, [60, 34]);
    t.players[0][7]!.pos = [20, 60];
    restartTaken(t, [{ gp: t.players[0][9]!, to: [96, 34] }], t.elapsed + 8);
    expect(t.setPieceAt).toBe(t.elapsed);
    expect(targetOf(t, 0, 7)).not.toEqual(shapePlace(t, 0, 7));
    // Behind late, the chasing side plays loose until it is level; the side ahead does not.
    const late = freeLab(counter, [60, 34]);
    late.period = 2;
    late.t = 35 * 60;
    late.elapsed = 80 * 60;
    late.score = [0, 1];
    late.players[0][7]!.pos = [20, 60];
    expect(looseness(late, 0)).toBe(DISORDER_CONFIG.loosen);
    expect(looseness(late, 1)).toBe(0);
    late.score = [1, 1];
    expect(looseness(late, 0)).toBe(0);
    // Before revision 2 nothing loosens.
    const plain = freeLab(counter, [60, 34], {}, 0.1, true);
    plain.lastLoss = { side: 1, at: plain.elapsed };
    plain.players[0][7]!.pos = [20, 60];
    expect(targetOf(plain, 0, 7)).toEqual(shapePlace(plain, 0, 7));
  });
});
