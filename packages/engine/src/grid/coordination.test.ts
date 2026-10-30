import { describe, expect, it, vi } from 'vitest';
import { MATCH_MODEL_REVISION, MATCH_MODEL_REVISIONS } from '../../../contracts/src/match-model';
import type { Tactic } from '../../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { lineOf } from '../player';
import { BOX_CONFIG, boxGuardPoint, boxLineDepth, boxZones } from './box';
import {
  closedAt,
  COORDINATION_CONFIG,
  planCoordination,
  pressReach,
  screenable,
  screenPoint,
  type CoordinationPlan,
} from './coordination';
import { combination } from './decide';
import { playGrid } from './engine';
import { FREEDOM_CONFIG, freedomPlan, SWAP_CONFIG } from './freedom';
import {
  applyCoordination,
  attackZones,
  defendSetPiece,
  depart,
  inDanger,
  INTENTION_REASONS,
  restartTaken,
  setIntention,
  takeBall,
  updateIntentions,
  type Intention,
} from './intentions';
import { SHADOW_CONFIG } from './lanes';
import { attackFrame, PITCH, type Point } from './pitch';
import { lineX, newShapeCache, setPieceTargets, SHAPE_CONFIG, shapePlace, targetOf } from './shape';
import { createState, onPitch, other, slotOf, type GridPlayer, type GridState } from './state';
import type { GridSetup } from './setup';
import { gridKit, type Kit } from './testkit';

/**
 * The engine's `readsOf` speculative update (`updateIntentions(s, false, true)`), sampled during a
 * played match: `sample` sees each state just before it, `real` is the unwrapped update. Every other
 * call passes straight through.
 */
const speculative = vi.hoisted(() => ({
  sample: undefined as ((s: GridState) => void) | undefined,
  real: undefined as
    ((s: GridState, inFlight?: boolean, defenceOnly?: boolean) => void) | undefined,
}));
vi.mock('./intentions', async (importOriginal) => {
  const real = await importOriginal<typeof import('./intentions')>();
  speculative.real = real.updateIntentions;
  return {
    ...real,
    updateIntentions: (s: GridState, inFlight = false, defenceOnly = false) => {
      if (defenceOnly) speculative.sample?.(s);
      real.updateIntentions(s, inFlight, defenceOnly);
    },
  };
});

const kits = new Map<string, Kit>();
/**
 * One synthetic world per tactic pair on the pre-feature path, shared by the situations below;
 * candidate situations set the setup's model.
 */
const kitOf = (tactics: [Tactic, Tactic]) => {
  const key = tactics.join('-');
  if (!kits.has(key)) kits.set(key, gridKit(tactics, 'coordination-lab', DISABLED_RELEASE));
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
  extra: Partial<GridSetup> = {},
): GridState {
  const s = createState({ ...kitOf(tactics).setup, model: MATCH_MODEL_REVISION, ...extra });
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
  it('revision 8: a showing teammate offers at a passing distance from the carrier', () => {
    const [, , , , , , seventh, eighth] = MATCH_MODEL_REVISIONS;
    const shown = (model: (typeof MATCH_MODEL_REVISIONS)[number]) => {
      const s = scene(undefined, undefined, undefined, { model });
      put(s, 1, 7, [64, 35]);
      put(s, 0, 6, [59, 32]);
      return gap(firstShow(s).show.intention.target, s.players[0][7]!.pos);
    };
    expect(shown(seventh)).toBeLessThanOrEqual(COORDINATION_CONFIG.support.distance + 1e-9);
    expect(shown(eighth)).toBeGreaterThan(COORDINATION_CONFIG.support.distance + 1);
    expect(shown(eighth)).toBeLessThanOrEqual(
      COORDINATION_CONFIG.revision8.support.distance + 1e-9,
    );
  });

  it('shows to receive while another opens the lane', () => {
    const s = scene();
    put(s, 1, 7, [64, 35]); // presses the carrier
    put(s, 0, 6, [59, 32]); // the mezzala, nearest, shows
    const { show } = firstShow(s);
    expect(show.idx).toBe(6);
    expect(show.intention).toMatchObject({ kind: 'support', teammate: 7, priority: 'tactical' });
    const target = show.intention.target;
    // The show stays onside and within reach of the carrier (a passing distance on revision 8).
    expect(gap(target, s.players[0][7]!.pos)).toBeLessThanOrEqual(
      COORDINATION_CONFIG.revision8.support.distance + 1e-9,
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
    // Settled: press engages furthest, counter around halfway, balanced's mid block as far as
    // possession (T321: one presser each; T371: balanced 10 → 12 m).
    expect(at(7, false)).toEqual([1, 1, 1, 1]);
    expect(at(11.5, false)).toEqual([1, 1, 0, 1]);
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

  it("gives the defence the same targets from the attack's box runs alone (T517)", () => {
    // `readsOf` plans the attack's box runs alone in its speculative update: a defender's target
    // reads only those of the attack's jobs (`boxMarkPoint`, `zoneRunner`). Played matches check it
    // on every speculative update against the full plan, each run from the same intentions.
    const real = speculative.real!;
    const defenders = (s: GridState, defenceOnly: boolean) => {
      const everyone = [...s.players[0], ...s.players[1]];
      const kept = everyone.map((gp) => ({
        intention: gp.intention,
        fields: gp.intention && { ...gp.intention },
        ended: gp.ended,
        run: gp.run,
      }));
      real(s, false, defenceOnly);
      const side = other(s.owner![0]);
      const cache = newShapeCache();
      const targets = s.players[side].map((gp) =>
        onPitch(gp) ? targetOf(s, side, gp.idx, cache) : undefined,
      );
      const boxRuns = s.players[s.owner![0]].filter((gp) => gp.intention?.box).length;
      everyone.forEach((gp, k) => {
        const was = kept[k]!;
        if (was.intention) Object.assign(was.intention, was.fields);
        gp.intention = was.intention;
        gp.ended = was.ended;
        gp.run = was.run;
      });
      return { targets, boxRuns };
    };
    let samples = 0,
      withBoxRuns = 0;
    const differing: number[] = [];
    speculative.sample = (s) => {
      const full = defenders(s, false);
      const reduced = defenders(s, true);
      samples++;
      if (reduced.boxRuns) withBoxRuns++;
      if (JSON.stringify(reduced.targets) !== JSON.stringify(full.targets))
        differing.push(s.elapsed);
    };
    try {
      for (const tactics of [
        ['possession', 'counter'],
        ['press', 'balanced'],
      ] as [Tactic, Tactic][])
        playGrid({ ...kitOf(tactics).setup, model: MATCH_MODEL_REVISION });
    } finally {
      speculative.sample = undefined;
    }
    expect(differing).toEqual([]);
    expect(samples).toBeGreaterThan(200);
    expect(withBoxRuns).toBeGreaterThan(0);
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

  /**
   * T366's case: `set-piece-1`'s short corner at 1767.70 as the update that reads its kick sees it
   * (here side 0 attacks toward x = 105). Five attackers hold the box spots (`setPiece.box`) and
   * runner 8 the edge; attacker 5 has just received the short corner on his spot, 12 m from goal, an
   * urgent danger. The defending scene marks the five box runners goal-side (`setPiece.mark`: 3 on 2,
   * 2 on 3, 10 on 9, 7 on 6, 4 on 5), guards the three zones (5, 6, 8) and the goal; nobody's place
   * names runner 8, and the two men outside the scene stand far from it.
   */
  function shortCorner(edge: Point = SHAPE_CONFIG.setPiece.edge) {
    const SP = SHAPE_CONFIG.setPiece;
    const s = scene(['possession', 'balanced'], 5, SP.box[4]);
    const [att, def] = s.players;
    const spots = [2, 3, 9, 6, 5].map((idx, k) => ({ gp: att[idx]!, to: SP.box[k]! }));
    const up = [...spots, { gp: att[8]!, to: edge }];
    for (const { gp, to } of up) gp.pos = [to[0], to[1]];
    put(s, 0, 4, [105, 67.5]); // the taker, at the corner flag
    const marks = [
      ...spots.map(({ gp, to }, k) => {
        const marker = def[[3, 2, 10, 7, 4][k]!]!;
        marker.pos = [to[0] + SP.mark, to[1]];
        return { gp: marker, to: [marker.pos[0], marker.pos[1]] as [number, number], opponent: gp };
      }),
      ...[5, 6, 8].map((idx, k) => {
        const zone = def[idx]!;
        zone.pos = [SP.zonal[k]![0], SP.zonal[k]![1]];
        return { gp: zone, to: [zone.pos[0], zone.pos[1]] as [number, number] };
      }),
    ];
    put(s, 1, 0, [103, 39]);
    put(s, 1, 1, [45, 20]);
    put(s, 1, 9, [45.5, 43.4]);
    // The kick: the runners hold their spots, the scene takes its jobs and 5 has the ball.
    restartTaken(s, up, until(s));
    defendSetPiece(s, { marks, keeper: def[0]! }, until(s));
    takeBall(s, att[5]!, SP.box[4], 4);
    return s;
  }
  type Marker = { idx: number; priority: string; since: number };
  /** Who marks whom on the defending side: runner → his markers, with their priority and start. */
  const markersOf = (s: GridState) => {
    const out: Record<number, Marker[]> = {};
    for (const gp of s.players[1])
      if (gp.intention?.kind === 'mark') {
        const { opponent, priority, since } = gp.intention;
        (out[opponent!] ??= []).push({ idx: gp.idx, priority, since });
      }
    return out;
  };

  it("a corner marker keeps his runner when the kick's urgent pairing runs", () => {
    const s = shortCorner();
    const kick = s.elapsed;
    const runner = s.players[0][8]!;
    const marker = s.players[1][10]!;
    // Runner 8 is nearer the man marking 9 than any other defender who could take him.
    expect(gap(marker.pos, runner.pos)).toBeCloseTo(9.3, 6);
    // The update that reads the kick meets the danger: 4's man has the ball, so 4 presses him.
    updateIntentions(s);
    expect(s.players[1][4]!.intention).toMatchObject({ kind: 'press', priority: 'danger' });
    // Before T367 that update paired 8 with 10, a committed mark counting as free for an urgent
    // one, and left 9 to the central zone's guard 2.3 s later. Now every scene marker keeps the
    // runner his place names, from the kick on, and 8 gets the central zone's guard at once.
    const committed = (idx: number): Marker[] => [{ idx, priority: 'committed', since: kick }];
    const expected = {
      2: committed(3),
      3: committed(2),
      9: committed(10),
      6: committed(7),
      8: [{ idx: 8, priority: 'danger', since: kick }],
    };
    expect(markersOf(s)).toEqual(expected);
    expect(s.players[1][8]!.ended).toMatchObject({ kind: 'cover', reason: 'danger' });
    // 2.3 s later, nobody having moved, the same men mark the same runners.
    s.elapsed += 2.3;
    updateIntentions(s);
    expect(markersOf(s)).toEqual(expected);
  });

  it('an unmarked runner at the kick gets the nearest defender with no mark', () => {
    const SP = SHAPE_CONFIG.setPiece;
    /** The urgent marks: [runner, marker]. */
    const urgent = (s: GridState) =>
      Object.entries(markersOf(s)).flatMap(([foe, ms]) =>
        ms.filter((m) => m.priority === 'danger').map((m) => [Number(foe), m.idx]),
      );
    // The nearest defender without a mark: the central zone's guard, though four markers and the
    // other two zones' guards are within reach and four of the markers nearer.
    const s = shortCorner();
    const runner = s.players[0][8]!;
    const d = (idx: number) => gap(s.players[1][idx]!.pos, runner.pos);
    for (const idx of [10, 7, 2, 3]) expect(d(idx)).toBeLessThan(d(8));
    for (const idx of [5, 6]) expect(d(idx)).toBeGreaterThan(d(8));
    updateIntentions(s);
    expect(urgent(s)).toEqual([[8, 8]]);
    // A man of the shape with no job nearer than that guard takes him, and every zone is kept.
    const free = shortCorner();
    put(free, 1, 9, [SP.edge[0], SP.edge[1] - 12]);
    updateIntentions(free);
    expect(urgent(free)).toEqual([[8, 9]]);
    for (const idx of [5, 6, 8])
      expect(free.players[1][idx]!.intention).toMatchObject({
        kind: 'cover',
        priority: 'committed',
      });
    // With only markers within reach (the zones more than `mark.pick` m away) he stays unmarked:
    // no marker leaves his man for him.
    const far = shortCorner([80, 34]);
    const reach = (idx: number) => gap(far.players[1][idx]!.pos, far.players[0][8]!.pos);
    for (const idx of [10, 7, 2, 3])
      expect(reach(idx)).toBeLessThanOrEqual(COORDINATION_CONFIG.mark.pick);
    for (const idx of [5, 6, 8]) expect(reach(idx)).toBeGreaterThan(COORDINATION_CONFIG.mark.pick);
    updateIntentions(far);
    expect(urgent(far)).toEqual([]);
    expect(markersOf(far)).toEqual({
      2: [expect.objectContaining({ idx: 3, priority: 'committed' })],
      3: [expect.objectContaining({ idx: 2, priority: 'committed' })],
      9: [expect.objectContaining({ idx: 10, priority: 'committed' })],
      6: [expect.objectContaining({ idx: 7, priority: 'committed' })],
    });
  });

  /**
   * T373: a corner from side 0's left flag as the engine leaves it for the update that reads the
   * kick. Both sides stand around the box, the scene on its places (`setPieceTargets`: six runners,
   * five box marks, three zones, the edge mark, the keeper; the most advanced defender stays up),
   * the runners hold their spots and the defenders their set-piece jobs; the taker is still
   * recorded on the ball at the flag.
   */
  function corner() {
    const flag: Point = [105, 0.5];
    const taker = 7;
    const s = scene(['possession', 'balanced'], taker, flag);
    s.players[0].forEach((gp, i) => i > 0 && i !== taker && (gp.pos = [84 + 2 * i, 14 + 4 * i]));
    s.players[1].forEach((gp, i) => i > 0 && (gp.pos = [86 + 1.5 * i, 14 + 4 * i]));
    put(s, 1, 0, [104, 34]);
    put(s, 1, 1, [60, 30]); // upfield: he stays up for the counter
    const sc = setPieceTargets(s, 0, taker);
    for (const { gp, to } of [...sc.up, ...sc.marks]) gp.pos = [to[0], to[1]];
    restartTaken(s, sc.up, until(s));
    defendSetPiece(s, sc, until(s));
    return { s, sc, flag, taker };
  }
  /** The defending side's intentions, for comparing before and after an update. */
  const defending = (s: GridState) =>
    JSON.stringify(s.players[1].map((gp) => gp.intention ?? null));

  it('nobody presses a corner taker once the ball is in the air', () => {
    const { s, sc, flag, taker } = corner();
    expect(sc.marks.filter((m) => m.opponent)).toHaveLength(sc.up.length);
    const jobs = defending(s);
    // The delivery was headed out for a goal kick at the kick: nobody has the ball, so the taker is
    // no carrier for the update that reads the kick (`playGrid` passes `inFlight`). Nobody presses
    // him and the whole scene keeps its set-piece jobs through the flight.
    updateIntentions(s, true);
    expect(s.players[1].some((gp) => gp.intention?.kind === 'press')).toBe(false);
    expect(defending(s)).toBe(jobs);
    // Read as the carrier, as before T373, he is an urgent danger at the flag (within
    // `INTENTION_CONFIG.danger` m of the goal line): the nearest defender, beyond any press reach,
    // leaves his set-piece job to press him there.
    const old = corner().s;
    updateIntentions(old);
    const pressers = old.players[1].filter((gp) => gp.intention?.kind === 'press');
    expect(pressers).toHaveLength(1);
    const [presser] = pressers;
    expect(presser!.intention).toMatchObject({ priority: 'danger', opponent: taker });
    expect(presser!.ended).toMatchObject({ priority: 'committed', reason: 'danger' });
    expect(gap(presser!.pos, flag)).toBeGreaterThan(pressReach(old, 1));
  });

  it("the second ball's winner is pressed as usual", () => {
    const { s, sc } = corner();
    // The header comes back off the keeper and the attacker on the central box spot wins it 5 m
    // out: the engine hands him the ball (`setOwner`), so the update reads him as the carrier and
    // he is an urgent danger.
    const winner = sc.up[2]!.gp;
    const loose: Point = [100, winner.pos[1]];
    takeBall(s, winner, loose);
    s.owner = [0, winner.idx];
    s.ball = [loose[0], loose[1]];
    updateIntentions(s);
    // His own marker, whose mark ends with his run, presses him; nobody else leaves a job.
    const marker = sc.marks.find((m) => m.opponent === winner)!.gp;
    const pressers = s.players[1].filter((gp) => gp.intention?.kind === 'press');
    expect(pressers).toEqual([marker]);
    expect(marker.intention).toMatchObject({ priority: 'danger', opponent: winner.idx });
    for (const { gp, opponent } of sc.marks)
      if (gp !== marker && opponent)
        expect(gp.intention).toMatchObject({
          kind: 'mark',
          priority: 'committed',
          opponent: opponent.idx,
        });
  });

  it('possession starts more runs outside a break only past halfway, on the candidate model only', () => {
    const SR = COORDINATION_CONFIG.settledRuns as { odds: Partial<Record<Tactic, number>> };
    const odds = SR.odds.possession!;
    expect(odds).toBeGreaterThan(1);
    expect(COORDINATION_CONFIG.settledRuns.from).toBe(4);
    /** Runs `tactic`'s side starts over 300 planning moments with the ball at `x` (no regain). */
    const runs = (tactic: Tactic, x: number, settled: number) => {
      SR.odds[tactic] = settled;
      try {
        const s = scene([tactic, 'balanced'], 7, [x, 34]);
        let n = 0;
        for (let k = 0; k < 300; k++) {
          s.elapsed = 600 + k * 0.7;
          for (const gp of s.players[0]) gp.intention = gp.run = undefined;
          n += jobsOf(planCoordination(s, false), 'run').length;
        }
        return n;
      } finally {
        if (tactic === 'possession') SR.odds.possession = odds;
        else delete SR.odds[tactic];
      }
    };
    // Past halfway (band 4) possession starts more runs at its odds than at 1; in its own half
    // (band 3, 35–52.5 m) the same, draw for draw.
    expect(runs('possession', 62, odds)).toBeGreaterThan(runs('possession', 62, 1) * 1.5);
    expect(runs('possession', 45, odds)).toBe(runs('possession', 45, 1));
    // Only possession is listed: the other tactics' settled runs are as they were.
    expect(Object.keys(SR.odds)).toEqual(['possession']);
    // The pre-feature model never plans coordination, so its matches do not read the odds.
    const record = () =>
      playGrid(gridKit(['possession', 'balanced'], 'settled-runs', DISABLED_RELEASE).setup).record;
    const before = record();
    SR.odds.possession = 1;
    try {
      expect(record()).toEqual(before);
    } finally {
      SR.odds.possession = odds;
    }
  });
});

describe('shutting the carrier’s lanes (→MATCH-32, T442)', () => {
  /** How far `p` stands from the line through `a` and `b`. */
  const offLine = (p: readonly number[], a: readonly number[], b: readonly number[]) =>
    Math.abs((b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!)) / gap(a, b);
  /**
   * Side 0's carrier 7 in midfield, pressed 4 m goal-side by balanced's box-to-box midfielder;
   * side 0's 9 ahead of him in the left half-space, a nearby option nobody reaches.
   */
  const shadowScene = (tactic: Tactic = 'balanced') => {
    const s = scene(['possession', tactic], 7, [62, 34]);
    put(s, 1, 7, [66, 34]);
    put(s, 0, 9, [75, 22]);
    return s;
  };

  it('the presser approaches between the carrier and his dangerous option', () => {
    const s = shadowScene();
    const carrier = s.players[0][7]!;
    const presser = s.players[1][7]!;
    const press = jobsOf(planCoordination(s, false), 'press');
    expect(press).toMatchObject([
      { side: 1, idx: 7, intention: { priority: 'tactical', shadow: 9 } },
    ]);
    applyCoordination(s, planCoordination(s, false));
    const target = presser.intention!.target;
    // He turns from straight goal-side of the carrier onto the line to the option, as close.
    const goalSide: Point = [62 + SHAPE_CONFIG.pressGoalSide, 34];
    expect(offLine(goalSide, carrier.pos, s.players[0][9]!.pos)).toBeGreaterThan(0.5);
    expect(offLine(target, carrier.pos, s.players[0][9]!.pos)).toBeLessThan(1e-9);
    expect(gap(target, carrier.pos)).toBeCloseTo(SHAPE_CONFIG.pressGoalSide, 9);
    expect(gap(target, goalSide)).toBeLessThanOrEqual(SHADOW_CONFIG.curve);
    // Between them: on the option's side of the carrier.
    const toOption = [75 - 62, 22 - 34];
    expect((target[0] - 62) * toOption[0]! + (target[1] - 34) * toOption[1]!).toBeGreaterThan(0);
    // Movement goes there, and every step after follows the carrier the same way.
    expect(targetOf(s, 1, 7)).toEqual(target);
    put(s, 0, 7, [63, 35]);
    expect(offLine(targetOf(s, 1, 7), carrier.pos, s.players[0][9]!.pos)).toBeLessThan(1e-9);
    put(s, 0, 7, [62, 34]);
    // With the option gone back behind the carrier there is none: straight goal-side again.
    put(s, 0, 9, [55, 40]);
    const cleared = planCoordination(s, false);
    expect(cleared.shadows).toEqual([{ side: 1, idx: 7 }]);
    applyCoordination(s, cleared);
    expect(presser.intention!.shadow).toBeUndefined();
    expect(presser.intention!.target[0]).toBeCloseTo(goalSide[0], 9);
    expect(presser.intention!.target[1]).toBe(34);
  });

  it('each tactic shadows from its own press reach', () => {
    const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
    /** Whether a presser already on the carrier, `d` m from him, keeps the option in his shadow. */
    const shadows = (tactic: Tactic, d: number, lost: boolean) => {
      const s = shadowScene(tactic);
      put(s, 1, 7, [62 + d, 34]);
      setIntention(s, s.players[1][7]!, {
        kind: 'press',
        priority: 'tactical',
        target: [62 + d, 34],
        opponent: 7,
        until: s.elapsed + 6,
      });
      if (lost) s.lastLoss = { side: 1, at: s.elapsed - 1 };
      return planCoordination(s, false).shadows.some((sh) => sh.option === 9);
    };
    // Press reaches 16 m, the others 11–12; just after a loss possession and press reach 18.
    expect(TACTICS.map((t) => shadows(t, 10, false))).toEqual([true, true, true, true]);
    expect(TACTICS.map((t) => shadows(t, 14, false))).toEqual([false, true, false, false]);
    expect(TACTICS.map((t) => shadows(t, 14, true))).toEqual([true, true, false, false]);
  });

  /**
   * Balanced's block standing in its shape against side 0's carrier 7 at [40, 34], whom its
   * striker 10 presses from 4 m; every other player of side 0 is parked at his own end.
   */
  function screening() {
    const s = scene(['possession', 'balanced'], 7, [40, 34]);
    for (const gp of s.players[1]) gp.pos = shapePlace(s, 1, gp.idx);
    put(s, 1, 10, [43, 36.5]);
    return s;
  }
  const isScreener = (s: GridState, gp: GridPlayer) =>
    ['MF', 'DF'].includes(lineOf(slotOf(s, gp).position));

  it('one free midfielder screens the lane to a receiver between the lines', () => {
    const s = screening();
    const carrier = s.players[0][7]!;
    const receiver = s.players[0][9]!;
    const df = PITCH.length - lineX(s, 1, 'DF');
    expect(PITCH.length - lineX(s, 1, 'MF')).toBeLessThan(df - 2);
    put(s, 0, 9, [df - 2, 34]);
    expect(screenable(s, carrier, receiver)).toBe(true);
    // Further than a nearby option, so no presser shadows him.
    expect(gap(carrier.pos, receiver.pos)).toBeGreaterThan(SHADOW_CONFIG.near);
    const plan = planCoordination(s, false);
    expect(jobsOf(plan, 'press').map((j) => j.idx)).toEqual([10]);
    const screens = jobsOf(plan, 'screen');
    expect(screens).toMatchObject([
      { side: 1, intention: { kind: 'screen', priority: 'tactical', opponent: 7, shadow: 9 } },
    ]);
    const screen = screens[0]!;
    const gp = s.players[1][screen.idx]!;
    expect(lineOf(slotOf(s, gp).position)).toBe('MF');
    // He stands in the lane, no further than his step from his shape place.
    const home = shapePlace(s, 1, gp.idx);
    expect(gap(screen.intention.target, home)).toBeLessThanOrEqual(SHADOW_CONFIG.screen.step);
    expect(offLine(screen.intention.target, carrier.pos, receiver.pos)).toBeLessThan(1e-9);
    // The nearest of the men whose shape place lies by the lane takes it.
    const cost = gap(gp.pos, screen.intention.target);
    for (const o of s.players[1]) {
      const at = o !== gp && isScreener(s, o) && screenPoint(s, o, carrier, receiver);
      if (at) expect(gap(o.pos, at)).toBeGreaterThanOrEqual(cost);
    }
    // One job per player and one screen per carrier: nobody else takes the lane once it is given.
    applyCoordination(s, plan);
    expect(gp.intention).toMatchObject({ kind: 'screen', opponent: 7, shadow: 9 });
    expect(jobsOf(planCoordination(s, false), 'screen')).toEqual([]);
    // An ordinary update keeps him in the lane as the receiver moves.
    put(s, 0, 9, [df - 2, 37]);
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(gp.intention?.kind).toBe('screen');
    expect(gp.intention!.target).toEqual(screenPoint(s, gp, carrier, receiver));
    // Outside the press reach the block waits: a press held 14 m off (balanced's reach 12) screens
    // nothing, one 10 m off does.
    const reach = (d: number) => {
      const t = screening();
      put(t, 0, 9, [df - 2, 34]);
      put(t, 1, 10, [40 + d, 34]);
      setIntention(t, t.players[1][10]!, {
        kind: 'press',
        priority: 'tactical',
        target: [40 + d, 34],
        opponent: 7,
        until: t.elapsed + 6,
      });
      return jobsOf(planCoordination(t, false), 'screen').length;
    };
    expect(reach(14)).toBe(0);
    expect(reach(10)).toBe(1);
  });

  it("no screen leaves the last defender or a marker's runner", () => {
    const s = screening();
    // A receiver in the left half-space ahead of the carrier, 34 m away.
    put(s, 0, 9, [72, 22]);
    const [screen] = jobsOf(planCoordination(s, false), 'screen');
    expect(screen).toBeDefined();
    const x = screen!.idx;
    // Every other man of the shape already has a job: he is the only one free to screen.
    for (const gp of s.players[1])
      if (gp.slot > 0 && gp.idx !== x && gp.idx !== 10)
        setIntention(s, gp, {
          kind: 'recover',
          priority: 'tactical',
          target: [gp.pos[0], gp.pos[1]],
          until: s.elapsed + 6,
        });
    expect(jobsOf(planCoordination(s, false), 'screen').map((j) => j.idx)).toEqual([x]);
    // Standing deepest of his side he is its last man: nobody screens.
    const home: Point = [s.players[1][x]!.pos[0], s.players[1][x]!.pos[1]];
    put(s, 1, x, [100, 34]);
    expect(jobsOf(planCoordination(s, false), 'screen')).toEqual([]);
    put(s, 1, x, home);
    // A runner beside him: he marks the runner, and nobody screens.
    put(s, 0, 10, [home[0] - 4, home[1]]);
    setIntention(s, s.players[0][10]!, {
      kind: 'run',
      run: 'behind',
      priority: 'tactical',
      target: [90, home[1]],
      until: s.elapsed + 6,
    });
    const marking = planCoordination(s, false);
    expect(jobsOf(marking, 'mark').map((j) => j.idx)).toEqual([x]);
    expect(jobsOf(marking, 'screen')).toEqual([]);
    // Holding that mark, he still never leaves the runner for the lane.
    applyCoordination(s, marking);
    expect(jobsOf(planCoordination(s, false), 'screen')).toEqual([]);
  });

  it('an urgent press keeps its goal-side target', () => {
    const s = shadowScene();
    const presser = s.players[1][7]!;
    applyCoordination(s, planCoordination(s, false));
    expect(presser.intention).toMatchObject({ kind: 'press', priority: 'tactical', shadow: 9 });
    // The carrier runs on to 25 m from goal, his option still ahead of him: an urgent danger.
    put(s, 0, 7, [80, 34]);
    s.ball = [80, 34];
    put(s, 1, 7, [84, 34]);
    put(s, 0, 9, [90, 26]);
    expect(inDanger(s, 1)).toBe(true);
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(presser.intention).toMatchObject({ kind: 'press', priority: 'danger', opponent: 7 });
    expect(presser.intention!.shadow).toBeUndefined();
    // Straight goal-side of him, 1.2 m toward the goal, and movement goes there.
    const goalSide = (st: GridState, gp: GridPlayer) => {
      expect(gp.intention!.target[0]).toBeCloseTo(80 + SHAPE_CONFIG.pressGoalSide, 9);
      expect(gp.intention!.target[1]).toBe(34);
      expect(targetOf(st, gp.side, gp.idx)).toEqual(gp.intention!.target);
    };
    goalSide(s, presser);
    // A press that starts in the danger takes no shadow either.
    const t = shadowScene();
    put(t, 0, 7, [80, 34]);
    t.ball = [80, 34];
    put(t, 1, 7, [84, 34]);
    put(t, 0, 9, [90, 26]);
    updateIntentions(t);
    expect(t.players[1][7]!.intention).toMatchObject({ kind: 'press', priority: 'danger' });
    expect(t.players[1][7]!.intention!.shadow).toBeUndefined();
    goalSide(t, t.players[1][7]!);
  });
});

describe('protecting the box goal-side (→MATCH-34, T443)', () => {
  /**
   * Counter's 4-4-2 (side 0) attacks with its right midfielder 8 on the ball wide in the final
   * third: strikers 9 and 10 by the box, the box-to-box midfielder 6 and the deep-lying playmaker
   * 7 behind them. Possession's 4-3-3 (side 1) stands in its shape: 1 LB, 2 and 3 CB, 4 RB,
   * 5 the anchor, 6 and 7 CM.
   *
   * Revision 10 pairs goal-side marks by where the defenders stand (T599), so side 1 first takes
   * its shape around the ball with the runners still away, then every man moves at once against
   * them: nobody is paired from his parked spot on his goal line, or from a teammate placed before
   * him.
   */
  function boxDefence() {
    const s = scene(['counter', 'possession'], 8, [88, 62]);
    for (const gp of s.players[1]) gp.pos = shapePlace(s, 1, gp.idx);
    put(s, 0, 9, [92, 38]);
    put(s, 0, 10, [90, 28]);
    put(s, 0, 6, [82, 36]);
    put(s, 0, 7, [76, 30]);
    const places = s.players[1].map((gp) => shapePlace(s, 1, gp.idx));
    s.players[1].forEach((gp, i) => (gp.pos = places[i]!));
    return s;
  }
  /** `side`'s frame x of `p`: metres from its own goal line. */
  const depth = (side: 0 | 1, p: readonly number[]) => attackFrame(side, [p[0]!, p[1]!])[0];
  const guardOf = (gp: GridPlayer) =>
    gp.intention?.kind === 'cover' ? gp.intention.box : undefined;
  /** Whether `p` lies between the runner and his zone, `markGoalSide` m from him, goal-side. */
  const between = (p: readonly number[], runner: GridPlayer) => {
    const job = runner.intention!.box!;
    // Side 0 attacks in the engine frame, so its zones are engine points.
    const z = boxZones(job.ball)[job.zone as 'nearPost'];
    expect(offLine(p, runner.pos, z)).toBeLessThan(1e-9);
    expect(gap(p, runner.pos)).toBeCloseTo(SHAPE_CONFIG.markGoalSide, 9);
    expect(gap(p, z)).toBeLessThan(gap(runner.pos, z));
    expect(depth(1, p)).toBeLessThan(depth(1, runner.pos));
  };
  const offLine = (p: readonly number[], a: readonly number[], b: readonly number[]) =>
    Math.abs((b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!)) / gap(a, b);

  it('the defending line drops goal-side with a centre-back at the near post and the far full-back at the far post', () => {
    const s = boxDefence();
    const unscened = scene(['counter', 'possession'], 8, [60, 50]);
    const [lo, hi] = BOX_CONFIG.defend.line;
    // Without the scene the back line stands well up; with it, at the line's depth and narrower.
    for (const idx of [1, 2, 3, 4]) {
      const home = shapePlace(unscened, 1, idx);
      const now = shapePlace(s, 1, idx);
      expect(depth(1, home)).toBeGreaterThan(hi);
      expect(depth(1, now)).toBeCloseTo(boxLineDepth(s, 1), 9);
      expect(Math.abs(now[1] - 34)).toBeLessThanOrEqual(Math.abs(home[1] - 34) + 1e-9);
    }
    expect(boxLineDepth(s, 1)).toBeGreaterThanOrEqual(lo);
    expect(boxLineDepth(s, 1)).toBeLessThanOrEqual(hi);
    const plan = planCoordination(s, inDanger(s, 1));
    const guards = Object.fromEntries(
      jobsOf(plan, 'cover')
        .filter((j) => j.intention.box)
        .map((j) => [j.intention.box!.zone, j.idx]),
    );
    // The ball is on side 1's left: its left centre-back takes the near post, the other the
    // middle, the right back (the far side) the far post.
    expect(guards).toMatchObject({ nearPost: 2, middle: 3, farPost: 4 });
    for (const j of jobsOf(plan, 'cover').filter((j) => j.intention.box))
      expect(j).toMatchObject({ side: 1, intention: { priority: 'tactical', box: { ball: 1 } } });
    // Their points: the posts' and the middle on the line's depth, each post on its zone's line.
    const zones = boxZones(1);
    const near = boxGuardPoint(s, 1, 'nearPost', 1);
    const far = boxGuardPoint(s, 1, 'farPost', 1);
    expect(depth(1, near)).toBeCloseTo(boxLineDepth(s, 1), 9);
    expect(near[1]).toBeCloseTo(zones.nearPost[1], 9);
    expect(far[1]).toBeCloseTo(zones.farPost[1], 9);
    const middle = boxGuardPoint(s, 1, 'middle', 1);
    expect(middle[1]).toBeCloseTo((zones.nearPost[1] + zones.farPost[1]) / 2, 9);
    // Given out, the guards hold; nobody plans the same guard twice.
    updateIntentions(s);
    expect(guardOf(s.players[1][2]!)).toEqual({ zone: 'nearPost', ball: 1 });
    expect(guardOf(s.players[1][4]!)).toEqual({ zone: 'farPost', ball: 1 });
    s.elapsed += 0.5;
    updateIntentions(s);
    expect(guardOf(s.players[1][2]!)).toEqual({ zone: 'nearPost', ball: 1 });
    expect(
      s.players[1].filter((gp) => guardOf(gp)?.zone === 'nearPost').map((gp) => gp.idx),
    ).toEqual([2]);
    // The ball played back out of the final third releases the shape: the guards end cleared and
    // the line steps up together.
    s.ball = [60, 50];
    put(s, 0, 8, [60, 50]);
    s.elapsed += 0.5;
    updateIntentions(s);
    for (const idx of [2, 3, 4]) {
      expect(guardOf(s.players[1][idx]!)).toBeUndefined();
      expect(s.players[1][idx]!.ended).toMatchObject({ kind: 'cover', reason: 'cleared' });
    }
    for (const idx of [1, 2, 3, 4]) expect(depth(1, shapePlace(s, 1, idx))).toBeGreaterThan(hi);
    // A set piece keeps §4.7's defence: a corner's committed mark leaves the scene off.
    const t = boxDefence();
    setIntention(t, t.players[1][2]!, {
      kind: 'mark',
      priority: 'committed',
      target: [96, 34],
      opponent: 9,
      until: t.elapsed + 8,
    });
    expect(jobsOf(planCoordination(t, false), 'cover').some((j) => j.intention.box)).toBe(false);
  });

  it('a holding midfielder drops to the edge', () => {
    const s = boxDefence();
    updateIntentions(s);
    const anchor = s.players[1][5]!;
    expect(slotOf(s, anchor).position).toBe('DM');
    // Side 0's deep-lying playmaker fills the edge: the anchor, nearest, drops to it.
    expect(guardOf(s.players[0][7]!)).toBeUndefined();
    expect(s.players[0][7]!.intention?.box).toEqual({ zone: 'edge', ball: 1 });
    expect(guardOf(anchor)).toEqual({ zone: 'edge', ball: 1 });
    expect(boxGuardPoint(s, 1, 'edge', 1)).toEqual([...boxZones(1).edge]);
    // Only one midfielder drops.
    expect(
      s.players[1].filter((gp) => guardOf(gp)?.zone === 'edge' || guardOf(gp)?.zone === 'spot'),
    ).toHaveLength(1);
    // With the edge left empty and the spot filled he drops to the spot instead.
    const t = boxDefence();
    setIntention(t, t.players[0][7]!, {
      kind: 'support',
      support: 'show',
      priority: 'tactical',
      target: [80, 50],
      teammate: 8,
      until: t.elapsed + 5,
    });
    updateIntentions(t);
    expect(t.players[0][6]!.intention?.box).toEqual({ zone: 'spot', ball: 1 });
    expect(guardOf(t.players[1][5]!)).toEqual({ zone: 'spot', ball: 1 });
  });

  it('markers stay goal-side of their runners', () => {
    const s = boxDefence();
    updateIntentions(s);
    s.elapsed += 0.5;
    updateIntentions(s);
    const att = s.players[0];
    // A guard whose zone a runner attacks takes him: between him and the zone, goal-side.
    const nearRunner = att.find((gp) => gp.intention?.box?.zone === 'nearPost')!;
    between(targetOf(s, 1, 2), nearRunner);
    const edgeRunner = att.find((gp) => gp.intention?.box?.zone === 'edge')!;
    between(targetOf(s, 1, 5), edgeRunner);
    // The spot's runner has no guard of his own: a marker takes him, between him and the spot.
    const spotRunner = att.find((gp) => gp.intention?.box?.zone === 'spot')!;
    const markers = s.players[1].filter(
      (gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === spotRunner.idx,
    );
    expect(markers).toHaveLength(1);
    between(targetOf(s, 1, markers[0]!.idx), spotRunner);
    // Nobody marks a runner his zone's guard already takes, and no guard leaves for a mark.
    expect(
      s.players[1].some(
        (gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === nearRunner.idx,
      ),
    ).toBe(false);
    // When he attacks his zone the guard keeps between them all the way.
    attackZones(s, 0);
    put(s, 0, nearRunner.idx, [99, 34.5]);
    between(targetOf(s, 1, 2), nearRunner);
  });
});

describe('freedom covers and swaps (→MATCH-17, T432)', () => {
  const tendency = (freedom: number) => ({
    freedom,
    discipline: 0.5,
    pressing: 0.5,
    anticipation: 0.5,
  });
  /** `scene` on revision 2 with tendencies: side 0's `free` by their own freedom, everyone else by `base`. */
  const freeScene = (
    tactics: [Tactic, Tactic],
    at: Point,
    free: Record<number, number> = {},
    base = 0.1,
    none = false,
  ) => {
    const k = kitOf(tactics);
    return scene(
      tactics,
      6,
      at,
      none
        ? {}
        : {
            tendencies: [
              k.setup.rosters[0].map((_, i) => tendency(free[i] ?? base)),
              k.setup.rosters[1].map(() => tendency(base)),
            ],
          },
    );
  };

  it('a vacated zone is covered', () => {
    // 4-4-2: the free left-back (1) overlaps with the ball on his flank in the other half.
    const tactics: [Tactic, Tactic] = ['counter', 'balanced'];
    const s = freeScene(tactics, [80, 8], { 1: 1 });
    const plain = freeScene(tactics, [80, 8], {}, 0.1, true);
    const moved = (idx: number) => {
      const [a, b] = [shapePlace(s, 0, idx), shapePlace(plain, 0, idx)];
      return [a[0] - b[0], a[1] - b[1]];
    };
    expect(moved(1)[0]).toBeGreaterThan(FREEDOM_CONFIG.vacated);
    // The central midfielder on his side (6) drops toward the zone he left, the other (7) stays.
    const [dx, dy] = moved(6);
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
    expect(moved(7)).toEqual([0, 0]);
    // The rest defence holds: both centre-backs and the far full-back keep their places.
    for (const idx of [2, 3, 4]) expect(moved(idx)).toEqual([0, 0]);
    // A low-freedom full-back (his move under `vacated` metres) leaves no zone to cover.
    const still = freeScene(
      tactics,
      [80, 8],
      {},
      (FREEDOM_CONFIG.vacated / FREEDOM_CONFIG.drift) * 0.5,
    );
    const [a, b] = [shapePlace(still, 0, 6), shapePlace(plain, 0, 6)];
    expect(a).toEqual(b);
  });

  it('wingers swap flanks when both are free', () => {
    // 4-3-3: the left winger (8) and the right winger (10).
    const tactics: [Tactic, Tactic] = ['possession', 'balanced'];
    const blocks = Array.from({ length: 12 }, (_, k) => k * SWAP_CONFIG.block + 30);
    const jobs = (free: Record<number, number>) =>
      blocks.map((elapsed) => {
        // The ball central short of halfway: nobody's freedom moves him, so each stands at his job's place.
        const s = freeScene(tactics, [48, 34], free);
        s.elapsed = elapsed;
        return { s, job: freedomPlan(s, 0)!.job };
      });
    const both = jobs({ 8: 0.9, 10: 0.9 });
    const swapped = both.filter(({ job }) => job[8] === 10);
    // They swap in some blocks and swap back in others, each doing the other's job.
    expect(swapped.length).toBeGreaterThan(0);
    expect(swapped.length).toBeLessThan(blocks.length);
    for (const { s, job } of swapped) {
      expect(job[10]).toBe(8);
      expect(shapePlace(s, 0, 8)[1]).toBeGreaterThan(PITCH.width / 2);
      expect(shapePlace(s, 0, 10)[1]).toBeLessThan(PITCH.width / 2);
    }
    for (const { s } of both.filter(({ job }) => job[8] === 8))
      expect(shapePlace(s, 0, 8)[1]).toBeLessThan(PITCH.width / 2);
    // Out of possession a swapped winger defends from his new flank too.
    const { s } = swapped[0]!;
    s.possession = 1;
    s.owner = undefined;
    expect(shapePlace(s, 0, 8)[1]).toBeGreaterThan(PITCH.width / 2);
    // One winger at or below the threshold: nobody swaps.
    for (const free of [
      { 8: 0.9, 10: SWAP_CONFIG.threshold },
      { 8: 0.3, 10: 0.9 },
    ])
      for (const { job } of jobs(free))
        expect(job.slice(0, 11)).toEqual(job.map((_, i) => i).slice(0, 11));
    // Free full-backs rotate with their wingers when the wingers do not swap flanks.
    const rotating = jobs({ 1: 0.9, 4: 0.9, 8: 0.9, 10: 0.9 }).filter(
      ({ job }) => job[1] === 8 || job[4] === 10,
    );
    expect(rotating.length).toBeGreaterThan(0);
    for (const { job } of rotating) expect(job[8] === 10).toBe(false);
  });
});
