import { describe, expect, it, vi } from 'vitest';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/worlds';
import { createWorld } from '../index';
import { validateFullMatchRecord } from '../match-model';
import { playGrid } from './engine';
import { benchPoint, IN_STRIDE_CONFIG } from './movement';
import { attackFrame } from './pitch';
import { M, Tally } from './record';
import { RESTART_CONFIG } from './restarts';
import { buildGridSetup, type DecideRule } from './setup';
import type { TraceEntry } from './trace';

// The pre-feature path's world: `candidate` below opts a fixture into the model.
const w = createWorld(
  {
    country: 'ENG',
    name: 'Grid Engine Lab',
    color: '#2a5d8f',
    seed: 'grid-engine',
    level: 'normal',
  },
  DISABLED_RELEASE,
);
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const fixture = (id: string) => ({ ...w.fixtures[0]!, id, home: home!.id, away: away!.id });
const play = (id: string, observe = false, recordPlayers = true) =>
  playGrid(
    buildGridSetup(w, fixture(id), { observe, recordPlayers, tactics: ['balanced', 'balanced'] }),
  );
/** A fixture on the candidate match model (→MATCH-12, SAVE-23), in a chosen era and as a knockout tie. */
const candidate = (id: string, observe = false, year?: number, decide?: DecideRule) =>
  playGrid(
    buildGridSetup(
      w,
      { ...fixture(id), ...(year ? { year } : {}) },
      {
        observe,
        recordPlayers: true,
        model: MATCH_MODEL_REVISION,
        ...(decide ? { decide } : {}),
      },
    ),
  );
const LEVEL: DecideRule = { awayGoals: false };

/**
 * Every open-play pass of an observed candidate match with where its passer received the ball and
 * how far the nearest opponent stood then (the snapshot before it, 32-bit positions), and the
 * pass's own tally `from` (`Tally.passEvent`, the passer's attack frame).
 */
function receptions(id: string) {
  // Copied when counted: side 0's attack-frame point is his live position.
  const froms: [number, number][] = [];
  const count = Tally.prototype.passEvent;
  const calls = vi.spyOn(Tally.prototype, 'passEvent').mockImplementation(function (
    this: Tally,
    ...args: Parameters<Tally['passEvent']>
  ) {
    froms.push([args[2].from[0], args[2].from[1]]);
    count.apply(this, args);
  });
  try {
    const { trace } = candidate(id, true);
    const passes = trace!.filter(
      (e) =>
        e.outcome !== 'incident' &&
        ((!e.spot && ['pass', 'cross', 'cutBack'].includes(e.action)) ||
          (e.spot !== undefined && e.kind === 'cross')),
    );
    expect(passes).toHaveLength(froms.length);
    const out: { e: TraceEntry; at: [number, number]; nearest: number; from: readonly number[] }[] =
      [];
    let last: TraceEntry | undefined;
    for (const e of trace!) {
      if (e.outcome === 'incident') continue;
      const before = last?.period === e.period ? last : undefined;
      last = e;
      const k = passes.indexOf(e);
      if (!before || e.spot || e.action !== 'pass' || k < 0) continue;
      const slot = Array.from(before.slots).indexOf(e.idx, e.side * 11);
      // A keeper distributes the ball from where he stands.
      if (slot < 0 || slot === e.side * 11) continue;
      const at: [number, number] = [before.positions[slot * 2]!, before.positions[slot * 2 + 1]!];
      let nearest = Infinity;
      for (let j = (1 - e.side) * 11; j < (2 - e.side) * 11; j++)
        if (before.slots[j]! >= 0)
          nearest = Math.min(
            nearest,
            Math.hypot(before.positions[j * 2]! - at[0], before.positions[j * 2 + 1]! - at[1]),
          );
      out.push({ e, at, nearest, from: froms[k]! });
    }
    return out;
  } finally {
    calls.mockRestore();
  }
}

describe('grid engine', () => {
  it('plays deterministically for a seed', () => {
    expect(play('seed-a').record).toEqual(play('seed-a').record);
    expect(play('seed-a').record).not.toEqual(play('seed-b').record);
  });

  it('returns the same record whether observed or not', () => {
    const quiet = play('observe-1');
    const watched = play('observe-1', true);
    expect(watched.record).toEqual(quiet.record);
    expect(watched.elapsed).toBe(quiet.elapsed);
  });

  it('keeps the record consistent', () => {
    for (let i = 0; i < 60; i++) {
      const { record } = play(`consistent-${i}`);
      const counts = record.lineCounts!;
      expect(record.players).toHaveLength(counts[0] + counts[1]);
      for (const side of [0, 1] as const) {
        const lines = record.players.slice(side * counts[0], side * counts[0] + counts[side]);
        const team = record.metrics[side]!;
        expect(lines.reduce((sum, p) => sum + p.metrics[M.goals]!, 0)).toBe(
          side === 0 ? record.score.home : record.score.away,
        );
        expect(team[M.goals]).toBe(side === 0 ? record.score.home : record.score.away);
        for (let m = M.assists; m < M.minutes; m++)
          expect(
            lines.reduce((sum, p) => sum + p.metrics[m]!, 0),
            `metric ${m}`,
          ).toBe(team[m]);
        expect(team[M.completed]!).toBeLessThanOrEqual(team[M.passes]!);
        expect(team[M.onTarget]!).toBeLessThanOrEqual(team[M.shots]!);
        expect(team[M.assists]!).toBeLessThanOrEqual(team[M.goals]!);
        const left = new Set(
          (record.incidents ?? []).filter((x) => x.kind !== 'yellow').map((x) => x.player),
        );
        expect(
          lines.every((p) =>
            left.has(p.id) ? p.metrics[M.minutes]! <= 90 : p.metrics[M.minutes] === 90,
          ),
        ).toBe(true);
        expect(team[M.minutes]).toBe(90);
      }
      expect(record.metrics[0]![M.possession]! + record.metrics[1]![M.possession]!).toBe(90);
      expect(record.detail).toHaveLength(2);
      expect(record.xg![0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('never hands the ball over without an event', () => {
    const switching = new Set([
      'intercepted',
      'tackled',
      'loose',
      'out',
      'foul',
      'offside',
      'shot',
      'held',
    ]);
    for (let i = 0; i < 8; i++) {
      // Cards, substitutions, injuries and whistles are not touches of the ball.
      const trace = play(`handover-${i}`, true).trace!.filter((e) => e.outcome !== 'incident');
      for (let k = 1; k < trace.length; k++)
        if (trace[k]!.side !== trace[k - 1]!.side && trace[k]!.period === trace[k - 1]!.period)
          expect(
            switching.has(trace[k - 1]!.outcome),
            `${trace[k - 1]!.action} -> ${trace[k - 1]!.outcome}`,
          ).toBe(true);
    }
  });

  it('ends each half after its added time', () => {
    for (let i = 0; i < 20; i++) {
      const result = play(`added-${i}`);
      const added = result.record.added!;
      expect(added).toHaveLength(2);
      expect(added[0]).toBeGreaterThanOrEqual(1);
      expect(added[0]).toBeLessThanOrEqual(6);
      expect(added[1]).toBeGreaterThanOrEqual(2);
      expect(added[1]).toBeLessThanOrEqual(10);
      expect(result.elapsed).toBeGreaterThanOrEqual(5400 + (added[0]! + added[1]!) * 60);
      expect(result.elapsed).toBeLessThan(5400 + (added[0]! + added[1]!) * 60 + 400);
    }
  });

  it('produces plausible football before calibration', () => {
    let goals = 0,
      passes = 0,
      shots = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const { record } = play(`plausible-${i}`, false, false);
      goals += record.score.home + record.score.away;
      passes += record.metrics[0]![M.passes]! + record.metrics[1]![M.passes]!;
      shots += record.metrics[0]![M.shots]! + record.metrics[1]![M.shots]!;
    }
    expect(goals / n).toBeGreaterThan(1.0);
    expect(goals / n).toBeLessThan(5.0);
    expect(passes / n / 2).toBeGreaterThan(250);
    expect(passes / n / 2).toBeLessThan(800);
    expect(shots / n / 2).toBeGreaterThan(5);
    expect(shots / n / 2).toBeLessThan(25);
    for (let i = 0; i < 10; i++)
      for (const e of play(`halves-${i}`, true).trace!)
        if (e.action === 'shot' && e.from)
          expect(e.side === 0 ? e.from[0] : 105 - e.from[0]).toBeGreaterThanOrEqual(52.5);
  });

  it('traces every touch with 22 positions when observed and nothing otherwise', () => {
    expect(play('trace-0').trace).toBeUndefined();
    const { trace, record } = play('trace-1', true);
    expect(trace!.length).toBeGreaterThan(300);
    // A side left short (no substitutes before 1965) has no position for the empty slot.
    const short = (record.incidents ?? []).filter(
      (x) => x.kind === 'red' || x.kind === 'secondYellow' || x.kind === 'injury',
    ).length;
    for (const e of trace!) {
      expect(e.positions).toHaveLength(44);
      const missing = e.positions.filter((v) => !Number.isFinite(v)).length;
      expect(missing % 2).toBe(0);
      expect(missing / 2).toBeLessThanOrEqual(short);
    }
    expect(trace!.every((e, i) => i === 0 || e.elapsed >= trace![i - 1]!.elapsed)).toBe(true);
  });

  it('keeps the pre-feature path without model metadata', () => {
    const { record, trace } = play('pre-feature', true);
    expect(record.model).toBeUndefined();
    expect(trace!.some((e) => e.knots || e.transition)).toBe(false);
  });

  it('settles the same candidate record whether observed or not', () => {
    for (const id of ['cand-observe-1', 'cand-observe-2']) {
      const quiet = candidate(id);
      const watched = candidate(id, true);
      expect(watched.record).toEqual(quiet.record);
      expect(watched.elapsed).toBe(quiet.elapsed);
      expect(watched.diagnostics).toEqual(quiet.diagnostics);
    }
  });

  it('passes the full record check on every candidate match, minutes included', () => {
    const years = [2024, 2010, 1966, 1950];
    for (let i = 0; i < 40; i++) {
      const { record } = candidate(
        `cand-valid-${i}`,
        false,
        years[i % 4],
        i % 4 === 0 ? LEVEL : undefined,
      );
      expect(record.model).toBe(MATCH_MODEL_REVISION);
      expect(validateFullMatchRecord(record), record.id).toEqual([]);
      const length = record.regulation ? 120 : 90;
      for (const side of [0, 1] as const) {
        const lines =
          side === 0
            ? record.players.slice(0, record.lineCounts![0])
            : record.players.slice(record.lineCounts![0]);
        expect(lines.reduce((n, p) => n + p.metrics[M.minutes]!, 0)).toBeLessThanOrEqual(
          11 * length,
        );
      }
    }
  });

  it('accounts dead time, ball in play and added time on one clock', () => {
    for (let i = 0; i < 4; i++) {
      const { trace, elapsed, diagnostics, record } = candidate(`cand-clock-${i}`, true);
      // Every restart's preparation is its dead time, counted once beside the time in play.
      const dead = trace!.reduce((n, e) => n + (e.outcome !== 'incident' ? (e.dead ?? 0) : 0), 0);
      // After each whistle the rest of its final minute is the interval before the next period.
      const whistles = trace!.filter((e) => e.action === 'whistle' && e.transition !== 'period');
      const rest = whistles.reduce((n, e) => n + Math.ceil(e.elapsed / 60) * 60 - e.elapsed, 0);
      expect(dead + diagnostics.ballInPlay + rest).toBeCloseTo(elapsed, 6);
      for (const e of trace!)
        if (e.knots?.[0]?.kind === 'retrieve')
          expect(e.dead).toBeGreaterThanOrEqual(
            Math.min(...Object.values(RESTART_CONFIG.dead)) - 1e-9,
          );
      // Each period stops inside its last added minute, and its minutes fill the clock exactly.
      const added = record.added!;
      expect(elapsed).toBe(5400 + (added[0]! + added[1]!) * 60);
      for (const e of whistles) expect(e.elapsed % 60).toBeGreaterThan(0);
    }
  });

  it('marks substitution, injury, dismissal, goal and extra-time transitions', () => {
    const seen = { entry: 0, injury: 0, dismissal: 0, goal: 0, extra: 0 };
    for (let i = 0; i < 60 && Object.values(seen).some((n) => n === 0); i++) {
      const { trace, record, elapsed } = candidate(`cand-moment-${i}`, true, 2024, LEVEL);
      const t = trace!;
      // Extra time included, the clock holds whole minutes: (90 or 120 + added) × 60 exactly.
      const minutes = (record.regulation ? 120 : 90) + record.added!.reduce((a, b) => a + b, 0);
      expect(elapsed).toBe(minutes * 60);
      t.forEach((e, k) => {
        if (e.transition === 'entry') {
          seen.entry++;
          // The substitute stands on the touchline, at halfway on his side, when he comes on.
          expect(e.to).toEqual(benchPoint(e.side));
          const slot = Array.from(e.slots).indexOf(e.other!, e.side * 11);
          expect([e.positions[slot * 2], e.positions[slot * 2 + 1]]).toEqual(benchPoint(e.side));
          expect(Array.from(e.slots.slice(e.side * 11, e.side * 11 + 11))).not.toContain(e.idx);
        }
        if (e.action === 'injury' || e.action === 'red' || e.action === 'secondYellow') {
          expect(e.transition).toBe('exit');
          if (e.action === 'injury') seen.injury++;
          else seen.dismissal++;
          // He is gone from the pitch from then on.
          const next = t.slice(k + 1).find((x) => x.outcome !== 'incident');
          if (next)
            expect(Array.from(next.slots.slice(e.side * 11, e.side * 11 + 11))).not.toContain(
              e.idx,
            );
        }
        if (e.action === 'kickoff' && e.knots?.[0]?.kind === 'retrieve') {
          seen.goal++;
          // After a goal the ball comes back from the net and everyone walks to the kick-off line-up.
          expect([0, 105]).toContain(e.knots[0].ball[0]);
          expect(e.knots[1]!.ball).toEqual([52.5, 34]);
          expect(e.dead).toBeGreaterThanOrEqual(RESTART_CONFIG.dead.goal);
        }
      });
      const periods = t.filter((e) => e.transition === 'period').map((e) => e.period);
      expect(periods).toEqual(record.regulation ? [1, 2, 3, 4] : [1, 2]);
      if (record.regulation) seen.extra++;
    }
    expect(seen.entry).toBeGreaterThan(0);
    expect(seen.injury).toBeGreaterThan(0);
    expect(seen.dismissal).toBeGreaterThan(0);
    expect(seen.goal).toBeGreaterThan(0);
    expect(seen.extra).toBeGreaterThan(0);
  });

  it('a free receiver carries in stride before his pass', () => {
    const R = IN_STRIDE_CONFIG.pressureRadius;
    let free = 0,
      carried = 0;
    for (const { e, at, nearest, from } of receptions('cand-stride-1')) {
      const knots = e.knots!;
      const kick = knots.find((k) => k.kind === 'kick');
      // Kept off the 32-bit snapshot's edge of the pressure radius.
      if (!kick || nearest <= R + 0.1) continue;
      free++;
      const [start, end] = knots.filter((k) => k.kind === 'carry');
      if (!start || !end) continue;
      // From where he received it to where he kicks it, and the pass is counted from there.
      expect(start.ball[0]).toBeCloseTo(at[0], 3);
      expect(start.ball[1]).toBeCloseTo(at[1], 3);
      expect(kick.ball).toEqual(end.ball);
      expect(kick.at).toBeGreaterThanOrEqual(end.at);
      expect(e.from).toEqual(kick.ball);
      expect(from).toEqual(attackFrame(e.side, kick.ball));
      if (Math.hypot(kick.ball[0] - at[0], kick.ball[1] - at[1]) >= 1) carried++;
    }
    expect(free).toBeGreaterThan(100);
    // A first-time ball whose flight takes the whole action is still played where it arrives.
    expect(carried / free).toBeGreaterThan(0.8);
  });

  it('a pressed receiver shields', () => {
    const R = IN_STRIDE_CONFIG.pressureRadius;
    let pressed = 0;
    for (const { e, at, nearest, from } of receptions('cand-stride-1')) {
      const kick = e.knots!.find((k) => k.kind === 'kick');
      if (!kick || nearest >= R - 0.1) continue;
      pressed++;
      expect(e.knots!.some((k) => k.kind === 'carry')).toBe(false);
      expect(kick.ball[0]).toBeCloseTo(at[0], 3);
      expect(kick.ball[1]).toBeCloseTo(at[1], 3);
      expect(from).toEqual(attackFrame(e.side, kick.ball));
    }
    expect(pressed).toBeGreaterThan(50);
  });
});
