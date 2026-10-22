import { describe, expect, it } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import type { Tactic } from '../../../contracts/src/types';
import {
  closedAt,
  COORDINATION_CONFIG,
  planCoordination,
  type CoordinationPlan,
} from './coordination';
import { combination } from './decide';
import {
  applyCoordination,
  defendSetPiece,
  depart,
  INTENTION_REASONS,
  restartTaken,
  setIntention,
  updateIntentions,
  type Intention,
} from './intentions';
import { attackFrame, type Point } from './pitch';
import { setPieceTargets, SHAPE_CONFIG, shapePlace } from './shape';
import { createState, onPitch, type GridPlayer, type GridState } from './state';
import { gridKit, type Kit } from './testkit';

const kits = new Map<string, Kit>();
/** One synthetic world per tactic pair, shared by the situations below. */
const kitOf = (tactics: [Tactic, Tactic]) => {
  const key = tactics.join('-');
  if (!kits.has(key)) kits.set(key, gridKit(tactics, 'coordination-lab'));
  return kits.get(key)!;
};

/**
 * A compact candidate situation: side 0 (`tactics[0]`) has the ball with `carrier` at `at`, every
 * other player parked at his own end, out of every job, until the test places him.
 */
function scene(
  tactics: [Tactic, Tactic] = ['possession', 'balanced'],
  carrier = 7,
  at: Point = [62, 34],
): GridState {
  const s = createState({ ...kitOf(tactics).setup, model: MATCH_MODEL_REVISION });
  for (const side of [0, 1] as const)
    s.players[side].forEach((gp, i) => (gp.pos = side === 0 ? [1, 2 + 6 * i] : [104, 2 + 6 * i]));
  s.possession = 0;
  s.owner = [0, carrier];
  s.ball = [at[0], at[1]];
  s.players[0][carrier]!.pos = [at[0], at[1]];
  s.elapsed = 600;
  s.possessionSince = 598;
  return s;
}

const put = (s: GridState, side: 0 | 1, idx: number, p: Point) =>
  (s.players[side][idx]!.pos = [p[0], p[1]]);
const jobsOf = (plan: CoordinationPlan, kind: Intention['kind']) =>
  plan.jobs.filter((j) => j.intention.kind === kind);
/** Everything a player's decisions can read, for comparing two states. */
const view = (s: GridState) =>
  JSON.stringify(
    s.players.map((side) =>
      side.map((gp) => ({ pos: gp.pos, intention: gp.intention, ended: gp.ended, run: gp.run })),
    ),
  );
const gap = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
/** `gp` with only `traits` and an average 체력, so two players compare on what a test varies. */
const plain = (gp: GridPlayer, traits: GridPlayer['player']['traits']) =>
  (gp.player = { ...gp.player, traits, attrs: { ...gp.player.attrs, stamina: 70 } });

/** The first moment of possession at which `s`'s pressured carrier gets a teammate to show. */
function firstShow(s: GridState) {
  for (let k = 0; k < 40; k++) {
    s.possessionSince = 560 + k;
    const plan = planCoordination(s, false);
    const show = plan.jobs.find((j) => j.intention.support === 'show');
    if (show) return { plan, show };
  }
  throw new Error('no teammate showed');
}

describe('grid coordination', () => {
  it('shows to receive while another opens the lane', () => {
    const s = scene();
    put(s, 1, 7, [64, 35]); // presses the carrier
    put(s, 0, 6, [59, 32]); // the mezzala, nearest, shows
    const { show } = firstShow(s);
    expect(show.idx).toBe(6);
    expect(show.intention).toMatchObject({ kind: 'support', teammate: 7, priority: 'tactical' });
    const target = show.intention.target;
    // The show stays onside and within reach of the carrier.
    expect(gap(target, s.players[0][7]!.pos)).toBeLessThanOrEqual(
      COORDINATION_CONFIG.support.distance + 1e-9,
    );
    // Nobody stood in the lane, so nobody cleared it.
    expect(planCoordination(s, false).jobs.some((j) => j.intention.support === 'open')).toBe(false);
    // The right winger stands in the lane the ball would take to the show: he steps out of it.
    const c = s.players[0][7]!.pos;
    const mid: Point = [c[0] + 0.6 * (target[0] - c[0]), c[1] + 0.6 * (target[1] - c[1])];
    put(s, 0, 10, mid);
    const plan = planCoordination(s, false);
    const again = plan.jobs.find((j) => j.intention.support === 'show')!;
    expect(again).toEqual(show);
    const open = plan.jobs.find((j) => j.intention.support === 'open')!;
    expect(open).toMatchObject({ side: 0, idx: 10, intention: { kind: 'support', teammate: 7 } });
    expect(gap(open.intention.target, mid)).toBeCloseTo(COORDINATION_CONFIG.open.distance, 6);
    // Out of the lane, at a right angle to it.
    const lane = [target[0] - c[0], target[1] - c[1]];
    const step = [open.intention.target[0] - mid[0], open.intention.target[1] - mid[1]];
    expect(Math.abs(lane[0]! * step[0]! + lane[1]! * step[1]!)).toBeLessThan(1e-6);
    // One show and one clearance per carrier: no two players claim the same job.
    expect(jobsOf(plan, 'support')).toHaveLength(2);
    applyCoordination(s, plan);
    expect(planCoordination(s, false).jobs.filter((j) => j.intention.kind === 'support')).toEqual(
      [],
    );
    // The carrier now sees the show as a combination, not the clearance.
    expect(combination(s, s.players[0][6]!, 7, attackFrame(0, c))).toBe('show');
    expect(combination(s, s.players[0][10]!, 7, attackFrame(0, c))).toBeUndefined();
    // The rest defence stays home: a centre-back beside the carrier in the opponent's half never shows.
    const r = scene();
    put(r, 1, 7, [64, 35]);
    put(r, 0, 2, [59, 32]);
    for (let k = 0; k < 40; k++) {
      r.possessionSince = 560 + k;
      expect(planCoordination(r, false).jobs.some((j) => j.idx === 2)).toBe(false);
    }
  });

  it('waits for and releases an overlap', () => {
    // Press (4-2-3-1): both full-backs overlap. With both on the right flank only one takes it.
    const s = scene(['press', 'balanced'], 7, [70, 50]);
    put(s, 0, 1, [60, 52]);
    put(s, 0, 4, [62, 56]);
    let overlaps = 0;
    for (let k = 0; k < 600; k++) {
      s.elapsed = 600 + k * 0.7;
      for (const gp of s.players[0]) gp.intention = gp.run = undefined;
      const plan = planCoordination(s, false);
      const mine = plan.jobs.filter((j) => j.intention.run === 'overlap');
      expect(mine.length).toBeLessThanOrEqual(1);
      for (const j of mine) {
        overlaps++;
        // The overlap combines with the carrier.
        expect(j.intention.teammate).toBe(7);
      }
    }
    expect(overlaps).toBeGreaterThan(0);
    // The carrier waits while it arrives and releases it once it is level with him.
    const rb = s.players[0][4]!;
    for (const gp of s.players[0]) gp.intention = gp.run = undefined;
    setIntention(s, rb, {
      kind: 'run',
      run: 'overlap',
      priority: 'tactical',
      target: [80, 62],
      teammate: 7,
      until: s.elapsed + 5,
    });
    const c = attackFrame(0, s.players[0][7]!.pos);
    expect(combination(s, rb, 7, c)).toBe('waiting');
    rb.pos = [72, 60];
    expect(combination(s, rb, 7, c)).toBe('release');
    // Another carrier is not part of this combination.
    expect(combination(s, rb, 6, c)).toBeUndefined();
  });

  it('presses with cover behind', () => {
    const s = scene();
    put(s, 1, 7, [66, 34]); // balanced's box-to-box midfielder, 4 m from the carrier
    put(s, 1, 6, [76, 34]); // the anchor, behind him
    put(s, 1, 3, [80, 30]); // the covering centre-back
    const plan = planCoordination(s, false);
    const press = jobsOf(plan, 'press');
    expect(press.map((j) => [j.side, j.idx])).toEqual([[1, 7]]);
    const cover = jobsOf(plan, 'cover');
    expect(cover).toHaveLength(1);
    expect(cover[0]!.intention.teammate).toBe(7);
    expect(cover[0]!.side).toBe(1);
    applyCoordination(s, plan);
    const presser = s.players[1][7]!;
    const coverer = s.players[1][cover[0]!.idx]!;
    // The cover stands goal-side of the presser, who stands goal-side of the carrier.
    expect(attackFrame(1, coverer.intention!.target)[0]).toBeLessThan(
      attackFrame(1, presser.intention!.target)[0],
    );
    expect(attackFrame(1, presser.intention!.target)[0]).toBeLessThan(
      attackFrame(1, s.players[0][7]!.pos)[0],
    );
    // Next update: the jobs hold, nobody adds a second cover or presser.
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(s.players[1].filter((gp) => gp.intention?.kind === 'cover')).toHaveLength(1);
    expect(s.players[1].filter((gp) => gp.intention?.kind === 'press')).toHaveLength(1);
    // Once the press stops, the cover is over too.
    s.owner = [0, 9];
    put(s, 0, 9, [30, 10]);
    s.ball = [30, 10];
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(coverer.ended).toMatchObject({ kind: 'cover', reason: 'cleared' });
  });

  it('tracks and hands over a runner', () => {
    const s = scene();
    const runner = s.players[0][9]!;
    const a = s.players[1][2]!; // balanced's stopper
    const b = s.players[1][4]!; // the ball-playing centre-back on the other side
    const zoneA = shapePlace(s, 1, 2);
    const zoneB = shapePlace(s, 1, 4);
    expect(gap(zoneA, zoneB)).toBeGreaterThan(
      COORDINATION_CONFIG.mark.zone + COORDINATION_CONFIG.mark.handover,
    );
    // The runner starts in A's zone: A picks him up.
    runner.pos = [zoneA[0], zoneA[1]];
    a.pos = [zoneA[0] + 3, zoneA[1]];
    b.pos = [zoneB[0], zoneB[1]];
    setIntention(s, runner, {
      kind: 'run',
      run: 'behind',
      priority: 'tactical',
      target: [zoneB[0], zoneB[1]],
      until: s.elapsed + 6,
    });
    updateIntentions(s);
    expect(a.intention).toMatchObject({ kind: 'mark', opponent: 9 });
    expect(b.intention).toBeUndefined();
    // He tracks the runner across the line until the runner reaches B's zone, then hands him over.
    runner.pos = [zoneB[0] + 2, zoneB[1] - 2];
    a.pos = [zoneB[0] + 5, zoneB[1] - 6];
    s.elapsed += 1;
    updateIntentions(s);
    expect(a.ended).toMatchObject({ kind: 'mark', reason: 'handover', teammate: 4 });
    expect(a.ended!.end).toBe(INTENTION_REASONS.handover);
    expect(b.intention).toMatchObject({ kind: 'mark', opponent: 9, priority: 'tactical' });
    // One marker per runner, before and after.
    const markers = s.players[1].filter(
      (gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === 9,
    );
    expect(markers).toEqual([b]);
  });

  it('abandons a combination after the opportunity closes', () => {
    const s = scene(['press', 'balanced'], 7, [70, 50]);
    const rb = s.players[0][4]!;
    rb.pos = [62, 58];
    const overlap = (at: number) =>
      setIntention(s, rb, {
        kind: 'run',
        run: 'overlap',
        priority: 'tactical',
        target: [80, 62],
        teammate: 7,
        until: at + 5,
      });
    overlap(s.elapsed);
    updateIntentions(s);
    expect(rb.intention).toMatchObject({ kind: 'run', run: 'overlap' });
    // A defender steps into the space the overlap was going to: the combination is off.
    put(s, 1, 5, [80.5, 61]);
    expect(closedAt(s, 0, [80, 62])).toBe(true);
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(rb.ended).toMatchObject({ kind: 'run', run: 'overlap', reason: 'closed' });
    expect(rb.ended!.end).toBe('infeasible');
    expect(combination(s, rb, 7, attackFrame(0, s.players[0][7]!.pos))).toBeUndefined();
    // He does not start another run at once.
    for (let k = 1; k * 0.5 < COORDINATION_CONFIG.combination.retry; k++) {
      s.elapsed += 0.5;
      updateIntentions(s);
      expect(rb.intention?.kind).not.toBe('run');
    }
    // The carrier playing on ends the overlap too, as moved.
    put(s, 1, 5, [104, 32]);
    overlap(s.elapsed);
    s.owner = [0, 6];
    s.players[0][6]!.pos = [60, 40];
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(rb.ended).toMatchObject({ kind: 'run', run: 'overlap', reason: 'moved' });
    // A show whose space a defender takes ends the same way.
    const t = scene();
    put(t, 1, 7, [64, 35]);
    put(t, 0, 6, [59, 32]);
    const { plan, show } = firstShow(t);
    applyCoordination(t, plan);
    put(t, 1, 8, show.intention.target);
    t.elapsed += 0.5;
    updateIntentions(t);
    expect(t.players[0][6]!.ended).toMatchObject({ kind: 'support', reason: 'closed' });
  });

  it('does not depend on player iteration order', () => {
    // Two centre-backs with the same press weight, equally far from the carrier: the lower player
    // ID presses, whichever roster index he holds.
    const pressOf = (swap: boolean) => {
      const s = scene();
      const [c, d] = [s.players[1][3]!, s.players[1][4]!];
      plain(c, []);
      plain(d, []);
      if (swap) [c.player, d.player] = [d.player, c.player];
      c.pos = [66, 30];
      d.pos = [66, 38];
      const press = jobsOf(planCoordination(s, false), 'press');
      expect(press).toHaveLength(1);
      return s.players[1][press[0]!.idx]!.player.id;
    };
    const first = pressOf(false);
    expect(pressOf(true)).toBe(first);
    const ids = [kitOf(['possession', 'balanced']).state.players[1][3]!.player.id];
    ids.push(kitOf(['possession', 'balanced']).state.players[1][4]!.player.id);
    expect(first).toBe(ids.sort()[0]);

    // Every job comes from one snapshot: giving them out in any order gives the same intentions.
    const busy = () => {
      const s = scene(['possession', 'press']);
      put(s, 1, 5, [65, 33]);
      put(s, 1, 6, [60, 37]);
      put(s, 1, 2, [74, 34]);
      put(s, 1, 3, [76, 26]);
      put(s, 0, 6, [57, 30]);
      put(s, 0, 9, [82, 30]);
      setIntention(s, s.players[0][9]!, {
        kind: 'run',
        run: 'behind',
        priority: 'tactical',
        target: [92, 30],
        until: s.elapsed + 6,
      });
      s.lastLoss = { side: 1, at: s.elapsed - 1 };
      return s;
    };
    const s = busy();
    const plan = planCoordination(s, false);
    expect(new Set(plan.jobs.map((j) => `${j.side}:${j.idx}`)).size).toBe(plan.jobs.length);
    expect(plan.jobs.map((j) => j.intention.kind)).toEqual(
      expect.arrayContaining(['press', 'cover', 'mark', 'recover']),
    );
    applyCoordination(s, plan);
    const reversed = busy();
    applyCoordination(reversed, { ...plan, jobs: [...plan.jobs].reverse() });
    expect(view(reversed)).toBe(view(s));
  });

  it('preserves four tactic differences', () => {
    const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
    /** Who presses a carrier `d` m from the nearest two defenders, with or without a loss just before. */
    const pressers = (tactic: Tactic, d: number, lost: boolean) => {
      const s = scene(['balanced', tactic]);
      put(s, 1, 6, [62 + d, 34]);
      put(s, 1, 7, [62 + d, 36]);
      if (lost) s.lastLoss = { side: 1, at: s.elapsed - 1 };
      return jobsOf(planCoordination(s, false), 'press').length;
    };
    const at = (d: number, lost: boolean) => TACTICS.map((t) => pressers(t, d, lost));
    // Settled: press engages furthest, counter around halfway, balanced in the middle (T321: one
    // presser each).
    expect(at(7, false)).toEqual([1, 1, 1, 1]);
    expect(at(11, false)).toEqual([1, 1, 1, 0]);
    expect(at(12.5, false)).toEqual([0, 1, 0, 0]);
    // Just after a loss possession and press counter-press furthest, counter does not.
    expect(at(17, true)).toEqual([1, 1, 0, 0]);
    for (const t of TACTICS) {
      const cfg = SHAPE_CONFIG.candidate.tactic[t] ?? SHAPE_CONFIG.tactic[t];
      expect(pressers(t, 17, true)).toBe(Math.max(cfg.press, cfg.counterPress) >= 17 ? 1 : 0);
      expect(pressers(t, 11.5, true)).toBe(Math.max(cfg.press, cfg.counterPress) >= 11.5 ? 1 : 0);
    }
  });

  it('does not change the world when only inspected', () => {
    const s = scene(['possession', 'press']);
    put(s, 1, 5, [65, 33]);
    put(s, 0, 6, [57, 30]);
    put(s, 0, 9, [82, 30]);
    put(s, 1, 2, [84, 32]);
    setIntention(s, s.players[0][9]!, {
      kind: 'run',
      run: 'behind',
      priority: 'tactical',
      target: [92, 30],
      until: s.elapsed + 6,
    });
    const before = view(s);
    const plan = planCoordination(s, false);
    expect(view(s)).toBe(before);
    // Planning again from the same snapshot plans the same.
    expect(planCoordination(s, false)).toEqual(plan);
    expect(plan.jobs.length).toBeGreaterThan(0);
  });

  it('keeps comparable role and trait differences, deterministically', () => {
    /** Which of two centre-backs, equally far from the carrier, presses. */
    const presser = (traits: [GridPlayer['player']['traits'], GridPlayer['player']['traits']]) => {
      const s = scene();
      const [c, d] = [s.players[1][3]!, s.players[1][4]!];
      plain(c, traits[0]);
      plain(d, traits[1]);
      c.pos = [66, 30];
      d.pos = [66, 38];
      const plan = planCoordination(s, false);
      expect(planCoordination(s, false)).toEqual(plan);
      return jobsOf(plan, 'press')[0]!.idx;
    };
    // A tackler or a worker presses before a teammate without the trait, either way round.
    expect(presser([['tackler'], []])).toBe(3);
    expect(presser([[], ['tackler']])).toBe(4);
    expect(presser([['workrate'], []])).toBe(3);
    // A stopper presses before a covering centre-back standing as far away; the covering one covers.
    const s = scene();
    put(s, 1, 2, [66, 30]);
    put(s, 1, 3, [66, 38]);
    plain(s.players[1][2]!, []);
    plain(s.players[1][3]!, []);
    const plan = planCoordination(s, false);
    expect(jobsOf(plan, 'press').map((j) => j.idx)).toEqual([2]);
    expect(jobsOf(plan, 'cover').map((j) => j.idx)).toEqual([3]);
    // A playmaker shows before a teammate as near without the trait.
    const shower = (traits: [GridPlayer['player']['traits'], GridPlayer['player']['traits']]) => {
      const t = scene(['counter', 'balanced'], 6);
      put(t, 1, 7, [64, 35]);
      const [l, r] = [t.players[0][5]!, t.players[0][8]!]; // the two wide midfielders
      plain(l, traits[0]);
      plain(r, traits[1]);
      l.pos = [56, 30];
      r.pos = [56, 38];
      return firstShow(t).show.idx;
    };
    expect(shower([['playmaker'], []])).toBe(5);
    expect(shower([[], ['playmaker']])).toBe(8);
  });

  it('makes the nearest presser urgent when a danger starts', () => {
    const s = scene(['possession', 'press'], 9, [80, 34]);
    const near = s.players[1][6]!;
    const far = s.players[1][5]!;
    for (const [gp, x] of [
      [far, 90],
      [near, 84],
    ] as const) {
      gp.pos = [x, 34];
      setIntention(s, gp, {
        kind: 'press',
        priority: 'tactical',
        target: [x - 1, 34],
        opponent: 9,
        until: s.elapsed + 6,
      });
    }
    const plan = planCoordination(s, true);
    expect(plan.escalate).toEqual([1, 6]);
  });

  /** A delivery being played: side 0's carrier on the ball wide in the box, pressed beside him. */
  const delivery = () => {
    const s = scene(['possession', 'balanced'], 7, [100, 12]);
    put(s, 1, 8, [100, 13.5]);
    return s;
  };
  const until = (s: GridState) => s.elapsed + SHAPE_CONFIG.setPiece.stay;

  it('cover follows a displaced runner', () => {
    const s = delivery();
    const runner = s.players[0][9]!;
    const marker = s.players[1][2]!;
    const cover = s.players[1][3]!;
    // A six-yard zone (T348): the defender guarding it stands on it, the runner went up beside it.
    const zone: [number, number] = [101.5, 37];
    put(s, 0, 9, [95, 34]);
    put(s, 1, 2, [95.8, 34]);
    put(s, 1, 3, zone);
    restartTaken(s, [{ gp: runner, to: [95, 34] }], until(s));
    defendSetPiece(
      s,
      {
        marks: [
          { gp: marker, to: [95.8, 34], opponent: runner },
          { gp: cover, to: zone },
        ],
      },
      until(s),
    );
    updateIntentions(s);
    // Nobody near his zone: he holds it.
    expect(cover.intention).toMatchObject({ kind: 'cover', priority: 'committed', zone });
    expect(cover.intention!.target).toEqual(zone);
    /** The runner displaced to `p`: where the cover goes after the next update. */
    const displaced = (p: Point) => {
      put(s, 0, 9, p);
      s.elapsed += 0.4;
      updateIntentions(s);
      expect(cover.intention?.kind).toBe('cover');
      return cover.intention!.target;
    };
    // Into his zone: he meets the runner goal-side, and follows him across it.
    const met = displaced([100, 35.5]);
    expect(met[0]).toBeCloseTo(100 + SHAPE_CONFIG.markGoalSide, 9);
    expect(met[1]).toBeCloseTo(35.5, 9);
    expect(displaced([100.5, 38.5])[1]).toBeCloseTo(38.5, 9);
    // Following him is no second marking job: his marker keeps him, alone.
    expect(
      s.players[1].filter(
        (gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === runner.idx,
      ),
    ).toEqual([marker]);
    expect(planCoordination(s, true).jobs.filter((j) => j.intention.opponent === 9)).toEqual([]);
    // Out of it again, the cover goes back to his zone.
    expect(displaced([95, 30])).toEqual(zone);
  });

  it('dismissed players never receive a marking assignment', () => {
    const s = delivery();
    // Both sides around the box for the delivery.
    s.players[0].forEach((gp, i) => i > 0 && i < 11 && i !== 7 && (gp.pos = [86 + i, 20 + 3 * i]));
    s.players[1].forEach((gp, i) => i > 0 && i < 11 && (gp.pos = [92 + i, 18 + 3 * i]));
    const taker = 7;
    const before = setPieceTargets(s, 0, taker);
    // The best header and the defender who would mark him are sent off before the delivery.
    const best = before.up[0]!.gp;
    const stopper = before.marks[0]!.gp;
    best.sentOff = stopper.sentOff = true;
    const sc = setPieceTargets(s, 0, taker);
    expect(sc.up.some((u) => u.gp === best)).toBe(false);
    expect(sc.marks.some((m) => m.gp === stopper || m.opponent === best)).toBe(false);
    for (const m of sc.marks)
      expect(onPitch(m.gp) && (!m.opponent || onPitch(m.opponent))).toBe(true);
    // A marker and another marker's man sent off before the kick: the first takes no job, the
    // second's marker guards his zone instead of marking a man who is gone.
    const [, late, orphan] = sc.marks;
    late!.gp.sentOff = true;
    orphan!.opponent!.sentOff = true;
    restartTaken(
      s,
      sc.up.filter((u) => onPitch(u.gp)),
      until(s),
    );
    defendSetPiece(s, sc, until(s));
    expect(late!.gp.intention).toBeUndefined();
    expect(orphan!.gp.intention).toMatchObject({ kind: 'cover', zone: orphan!.to });
    const marked = () =>
      s.players[1].flatMap((gp) =>
        gp.intention?.kind === 'mark' ? [s.players[0][gp.intention.opponent!]!] : [],
      );
    updateIntentions(s);
    expect(marked().length).toBeGreaterThan(2);
    expect(marked().every(onPitch)).toBe(true);
    // In play: a marked runner sent off ends his marker's job as departed, and no job names him.
    const pair = sc.marks.find((m) => m.opponent && m.gp.intention?.kind === 'mark')!;
    const gone = pair.opponent!;
    depart(s, gone, 'dismissal');
    gone.sentOff = true;
    expect(pair.gp.ended).toMatchObject({ kind: 'mark', reason: 'departed' });
    s.elapsed += 0.4;
    expect(
      planCoordination(s, true).jobs.some((j) => j.side === 1 && j.intention.opponent === gone.idx),
    ).toBe(false);
    updateIntentions(s);
    expect(marked()).not.toContain(gone);
    expect(marked().every(onPitch)).toBe(true);
  });
});
