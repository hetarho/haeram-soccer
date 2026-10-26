import { describe, expect, it } from 'vitest';
import { PD, PLAYER_DETAIL_SIZE, TD } from '../../../contracts/src/detail';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { createWorld } from '../index';
import { MATERIAL_LAYOUT } from '../material';
import { validateFullMatchRecord } from '../match-model';
import { playGrid } from './engine';
import { CELL_BASELINES } from './baselines';
import { BAND_EDGES, cellOf, type Point } from './pitch';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import { FORMATIONS, lineOf } from '../player';
import { COUNTER_ZONES, crossArrival, isCutBack, lineMinutes, M, Tally } from './record';
import { buildGridSetup } from './setup';
import { createState, type GridState } from './state';
import { gridKit } from './testkit';

// The pre-feature path's kit: candidate counting rules set the setup's model.
const kit = gridKit(undefined, undefined, DISABLED_RELEASE);
const recorded = buildGridSetup(kit.w, kit.f, {
  observe: false,
  recordPlayers: true,
  tactics: ['balanced', 'balanced'],
});
const fresh = () => new Tally(recorded);
const detail = (t: Tally, side: 0 | 1 = 0) => {
  const record = t.finish(createState(recorded));
  return {
    td: record.detail![side]!,
    pd: record.players.slice(side * 11, side * 11 + 11).map((p) => p.detail!),
  };
};
const pass = (
  t: Tally,
  from: Point,
  to: Point,
  ok = true,
  extra: { lineBreaking?: boolean } = {},
) => t.passEvent(0, 7, { from, to, ok, kind: 'short', ...extra });

describe('grid advanced counters', () => {
  it('counts a final-third pass by its start', () => {
    const t = fresh();
    pass(t, [70, 34], [75, 34]);
    pass(t, [69.9, 34], [95, 34]);
    pass(t, [80, 20], [60, 20], false);
    const { td, pd } = detail(t);
    expect(td[TD.finalThirdPasses]).toBe(2);
    expect(td[TD.finalThirdCompleted]).toBe(1);
    expect(pd[7]![PD.finalThirdPasses]).toBe(2);
    expect(pd[7]![PD.finalThirdCompleted]).toBe(1);
  });

  it('counts a progressive pass by its band', () => {
    const t = fresh();
    pass(t, [40, 34], [60, 34]);
    pass(t, [60, 34], [65, 34]);
    pass(t, [40, 34], [60, 34], false);
    const { td, pd } = detail(t);
    expect(td[TD.progressivePasses]).toBe(1);
    expect(pd[7]![PD.progressivePasses]).toBe(1);
  });

  it('counts box and front-of-box entries once per entry', () => {
    const t = fresh();
    pass(t, [60, 34], [80, 34]);
    pass(t, [80, 34], [92, 34]);
    pass(t, [92, 34], [97, 34]);
    t.carryEvent(0, 8, [75, 30], [95, 30]);
    const { td, pd } = detail(t);
    expect(td[TD.frontOfBoxEntries]).toBe(1);
    expect(td[TD.boxEntries]).toBe(2);
    expect(pd[7]![PD.boxEntries]).toBe(1);
    expect(pd[8]![PD.boxEntries]).toBe(1);
    expect(td[TD.progressiveCarries]).toBe(1);
  });

  it('counts completed cut-backs only, and a completed cross by where it arrived', () => {
    const t = fresh();
    t.passEvent(0, 7, { from: [100, 20], to: [96, 34], ok: false, kind: 'cutBack' });
    t.passEvent(0, 7, { from: [100, 20], to: [96, 34], ok: true, kind: 'cutBack' });
    const s = createState(recorded);
    s.players[0][9]!.pos = [95, 30];
    const from: Point = [85, 3];
    const header = { kind: 'shot', shooter: 9, result: 'miss', xg: 0.1, recordedXg: 0.1 } as const;
    const to = crossArrival(s, 0, header, from);
    expect(to).toEqual([95, 30]);
    expect(crossArrival(s, 0, { kind: 'held', by: 0 }, from)).toBe(from);
    t.passEvent(0, 4, { from, to, ok: true, kind: 'cross' });
    const { td, pd } = detail(t);
    expect([td[TD.cutBacks], pd[7]![PD.cutBacks]]).toEqual([1, 1]);
    expect([td[TD.boxEntries], pd[4]![PD.boxEntries]]).toEqual([1, 1]);
  });

  it('counts a line-breaking pass', () => {
    const t = fresh();
    pass(t, [50, 34], [70, 34], true, { lineBreaking: true });
    pass(t, [50, 34], [70, 34], false, { lineBreaking: true });
    pass(t, [50, 34], [70, 34]);
    expect(detail(t).td[TD.lineBreakingPasses]).toBe(1);
  });

  it('adds positive xT gains only', () => {
    const t = fresh();
    const low: Point = [20, 34];
    const high: Point = [92, 34];
    const gain = Math.round(
      (CELL_BASELINES[cellOf(high)]!.xT - CELL_BASELINES[cellOf(low)]!.xT) * 1000,
    );
    expect(gain).toBeGreaterThan(0);
    pass(t, low, high);
    pass(t, high, low);
    expect(detail(t).td[TD.xtAdded]).toBe(gain);
  });

  it("counts a high turnover at x ≥ 70 in the winner's frame", () => {
    const t = fresh();
    t.regain(0, 6, [70, 30]);
    t.regain(0, 6, [69.9, 30]);
    const { td, pd } = detail(t);
    expect(td[TD.highTurnovers]).toBe(1);
    expect(pd[6]![PD.highTurnovers]).toBe(1);
  });

  it('feeds PPDA from build-up passes and press actions', () => {
    const t = fresh();
    pass(t, [30, 34], [40, 34]);
    pass(t, [69.9, 34], [75, 34]);
    pass(t, [70, 34], [75, 34]);
    t.tackle(0, 6, [35, 34]);
    t.interception(0, 5, [34.9, 34]);
    t.interception(0, 5, [60, 34]);
    const { td } = detail(t);
    expect(td[TD.buildUpPasses]).toBe(2);
    expect(td[TD.pressActions]).toBe(2);
  });

  it('marks a big chance from 0.30 xG', () => {
    const t = fresh();
    t.shotDetail(0, 9, { from: [94, 34], xg: 0.29, recordedXg: 0.29, goal: true });
    t.shotDetail(0, 9, { from: [94, 34], xg: 0.3, recordedXg: 0.3, goal: true });
    t.shotDetail(0, 9, { from: [94, 34], xg: 0.5, recordedXg: 0.5, goal: false });
    t.shotDetail(0, 9, { from: [75, 34], xg: 0.04, recordedXg: 0.04, goal: false });
    const { td } = detail(t);
    expect(td[TD.bigChances]).toBe(2);
    expect(td[TD.bigChancesScored]).toBe(1);
    expect(td[TD.boxShots]).toBe(3);
  });

  it('credits the key pass and xA to the last passer', () => {
    const t = fresh();
    t.shotDetail(0, 9, { from: [94, 34], xg: 0.4, recordedXg: 0.42, goal: false, passer: 7 });
    t.shotDetail(0, 9, { from: [94, 34], xg: 0.1, recordedXg: 0.1, goal: false });
    const { td, pd } = detail(t);
    expect(td[TD.keyPasses]).toBe(1);
    expect(pd[7]![PD.keyPasses]).toBe(1);
    expect(pd[7]![PD.xa]).toBe(42);
    expect(pd[7]![PD.bigChancesCreated]).toBe(1);
    expect(pd[9]![PD.xg]).toBe(52);
  });

  it('counts restarts, fouls and offsides to the right side and player', () => {
    const t = fresh();
    t.restart(0, 'corner');
    t.restart(1, 'throwIn');
    t.restart(0, 'indirectFreeKick');
    t.restart(0, 'penalty', true);
    t.restart(0, 'penalty');
    t.foul(1, 3, 8);
    t.offside(0, 10);
    const home = detail(t, 0);
    expect(home.td[TD.corners]).toBe(1);
    expect(home.td[TD.freeKicks]).toBe(1);
    expect([home.td[TD.penalties], home.td[TD.penaltiesScored]]).toEqual([2, 1]);
    expect(home.td[TD.offsides]).toBe(1);
    expect(home.pd[10]![PD.offsides]).toBe(1);
    expect(home.pd[8]![PD.foulsWon]).toBe(1);
    const away = detail(t, 1);
    expect(away.td[TD.throwIns]).toBe(1);
    expect(away.td[TD.fouls]).toBe(1);
    expect(away.pd[3]![PD.fouls]).toBe(1);
  });

  it('rounds candidate minutes once per boundary so a side never passes eleven times the match', () => {
    // A modern bench, so four substitutes are named.
    const modern = buildGridSetup(
      kit.w,
      { ...kit.f, year: 2024 },
      { observe: false, recordPlayers: true },
    );
    const state = createState(modern);
    /** Entry and exit as [regulation minute, elapsed seconds]; added time keeps its period's last minute. */
    type When = [number, number];
    const at = (side: 0 | 1, idx: number, on?: When, off?: When) => {
      const gp = state.players[side][idx]!;
      if (on) [gp.onMin, gp.onAt] = on;
      if (off) [gp.offMin, gp.offAt] = off;
    };
    const m = (minute: number): When => [minute, minute * 60];
    // Off and on at 60.5 (per-line rounding gave 61 + 30), a substitute hurt within the minute he
    // came on and replaced again, and a change in added time.
    at(0, 3, undefined, m(60.5));
    at(0, 11, m(60.5));
    at(0, 7, undefined, m(75.2));
    at(0, 13, m(75.2), m(75.4));
    at(0, 14, m(75.6));
    at(0, 5, undefined, m(90));
    at(0, 12, m(90));
    const played = [...state.players[0].slice(0, 11).map((gp) => gp.idx), 11, 13, 14, 12];
    // The other side: a substitute comes on in first-half added time and is sent off in it, then a
    // half-time change — all at minute 45, in the order they happened.
    at(1, 2, undefined, [45, 2755]);
    at(1, 11, [45, 2760], [45, 3000]);
    at(1, 9, undefined, [45, 3300]);
    at(1, 12, [45, 3300]);
    const away = lineMinutes(state, 1, [...played.slice(0, 11), 11, 12], 90);
    expect([2, 11, 9, 12].map((i) => away.get(i))).toEqual([45, 1, 46, 44]);
    const minutes = lineMinutes(state, 0, played, 90);
    expect(Object.fromEntries([3, 11, 7, 13, 14, 5, 12].map((i) => [i, minutes.get(i)]))).toEqual({
      3: 61,
      11: 29,
      7: 75,
      13: 1,
      14: 14,
      5: 89,
      12: 1,
    });
    expect([...minutes.values()].reduce((a, b) => a + b, 0)).toBe(990);
    expect(minutes.get(0)).toBe(90);
    // The candidate record uses them and always carries its incident list.
    state.changes[0].entered = [11, 13, 14, 12];
    const record = new Tally({ ...modern, model: MATCH_MODEL_REVISION }).finish(state);
    expect(record.incidents).toEqual([]);
    expect(record.players.slice(0, 15).map((p) => p.metrics[M.minutes])).toEqual(
      played.map((idx) => minutes.get(idx)),
    );
    expect(new Tally(modern).finish(createState(modern)).incidents).toBeUndefined();
  });

  it('fills every match consistently with the schema rules and plausible totals', () => {
    const w = createWorld(
      {
        country: 'ENG',
        name: 'Grid Counter Lab',
        color: '#2a5d8f',
        seed: 'grid-counters',
        level: 'normal',
      },
      DISABLED_RELEASE,
    );
    const [home, away] = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    const n = 60;
    const mean = { final: 0, crosses: 0, entries: 0 };
    for (let i = 0; i < n; i++) {
      const f = { ...w.fixtures[0]!, id: `counters-${i}`, home: home!.id, away: away!.id };
      const { record: m } = playGrid(
        buildGridSetup(w, f, {
          observe: false,
          recordPlayers: true,
          tactics: ['balanced', 'balanced'],
        }),
      );
      for (const s of [0, 1] as const) {
        const t = m.detail![s]!;
        const row = m.metrics[s]!;
        expect(t[TD.keyPasses]!).toBeLessThanOrEqual(row[4]!);
        expect(t[TD.bigChancesScored]!).toBeLessThanOrEqual(t[TD.bigChances]!);
        expect(t[TD.bigChancesScored]!).toBeLessThanOrEqual(row[0]!);
        expect(t[TD.bigChances]!).toBeLessThanOrEqual(t[TD.boxShots]!);
        expect(t[TD.boxShots]!).toBeLessThanOrEqual(row[4]!);
        expect(t[TD.finalThirdCompleted]!).toBeLessThanOrEqual(t[TD.finalThirdPasses]!);
        expect(t[TD.finalThirdPasses]!).toBeLessThanOrEqual(row[2]!);
        expect(t[TD.progressivePasses]!).toBeLessThanOrEqual(row[3]!);
        expect(t[TD.takeOns]!).toBeGreaterThanOrEqual(row[8]!);
        expect(t[TD.buildUpPasses]!).toBeLessThanOrEqual(row[2]!);
        expect(t[TD.crossesCompleted]!).toBeLessThanOrEqual(t[TD.crosses]!);
        expect(t[TD.throughBallsCompleted]!).toBeLessThanOrEqual(t[TD.throughBalls]!);
        expect(t[TD.penaltiesScored]!).toBeLessThanOrEqual(t[TD.penalties]!);
        const lines = m.players.slice(s * 11, s * 11 + 11);
        expect(lines.reduce((sum, p) => sum + p.detail![PD.keyPasses]!, 0)).toBe(t[TD.keyPasses]);
        for (const p of lines) {
          const d = p.detail!;
          expect(d[PD.finalThirdCompleted]!).toBeLessThanOrEqual(d[PD.finalThirdPasses]!);
          expect(d[PD.bigChancesCreated]!).toBeLessThanOrEqual(d[PD.keyPasses]!);
          expect(d[PD.takeOns]!).toBeGreaterThanOrEqual(p.metrics[M.dribbles]!);
          expect(d[PD.xg]!).toBeLessThanOrEqual(80 * p.metrics[M.shots]!);
          expect(d[PD.xa]!).toBeLessThanOrEqual(80 * d[PD.keyPasses]!);
          expect(d[PD.crossesCompleted]!).toBeLessThanOrEqual(d[PD.crosses]!);
          expect(d[PD.throughBallsCompleted]!).toBeLessThanOrEqual(d[PD.throughBalls]!);
        }
        mean.final += t[TD.finalThirdPasses]! / (2 * n);
        mean.crosses += t[TD.crosses]! / (2 * n);
        mean.entries += t[TD.boxEntries]! / (2 * n);
      }
    }
    expect(mean.final).toBeGreaterThan(60);
    expect(mean.final).toBeLessThan(250);
    expect(mean.crosses).toBeGreaterThan(5);
    expect(mean.crosses).toBeLessThan(30);
    expect(mean.entries).toBeGreaterThan(10);
    expect(mean.entries).toBeLessThan(60);
  });
});

/**
 * The candidate model's tally counts MATCH-13 by the rules both paths share (→MATCH-30): passes are
 * classified where the players stand when they are played. Synthetic positions, marked as such.
 */
describe('candidate counting rules (→MATCH-13, MATCH-14, MATCH-30)', () => {
  const candidate = buildGridSetup(kit.w, kit.f, {
    observe: false,
    recordPlayers: true,
    tactics: ['balanced', 'balanced'],
    model: MATCH_MODEL_REVISION,
  });
  /** A candidate tally whose opponents stand by line at these x (side 0's attack frame). */
  const placed = (at: { GK: number; DF: number; MF: number; FW: number }) => {
    const s: GridState = createState(candidate);
    const slots = FORMATIONS[candidate.tactics[1]].slots;
    s.players[1].slice(0, 11).forEach((gp, i) => {
      gp.pos = [at[lineOf(slots[i]!.position)], 4 + 6 * i];
    });
    return { t: new Tally(candidate, s), s };
  };
  const counted = (t: Tally, s: GridState) => t.finish(s).detail![0]!;
  const play = (t: Tally, from: Point, to: Point, ok = true, kind: 'short' | 'cross' = 'short') =>
    t.passEvent(0, 7, { from, to, ok, kind });
  const received = (receiver: number, to: [number, number]) =>
    ({ target: receiver, outcome: { kind: 'complete', to, receiver } }) as const;

  it("counts a cut-back only from MATCH-14's zone", () => {
    const { t, s } = placed({ GK: 104, DF: 100, MF: 90, FW: 70 });
    // The goal-area band's half-spaces are the zone; the box is where it goes.
    expect(isCutBack(cellOf([101, 20]), cellOf([95, 34]))).toBe(true);
    play(t, [101, 20], [95, 34]);
    play(t, [101, 50], [102, 34]);
    play(t, [101, 20], [95, 34], false);
    // Beside the box at the byline, in the box's half-space, or out of the box: no cut-back.
    play(t, [101, 8], [95, 34]);
    play(t, [95, 20], [95, 34]);
    play(t, [101, 20], [80, 34]);
    // A pulled-back cross is a cross and a cut-back; the decision's label decides nothing.
    play(t, [101, 20], [94, 30], true, 'cross');
    t.passEvent(0, 7, { from: [90, 34], to: [95, 30], ok: true, kind: 'cutBack' });
    const td = counted(t, s);
    expect(td[TD.cutBacks]).toBe(3);
    expect([td[TD.crosses], td[TD.crossesCompleted]]).toEqual([1, 1]);
    // The pre-feature tally keeps the decision's label (its golden facts do not move).
    const old = fresh();
    old.passEvent(0, 7, { from: [90, 34], to: [95, 30], ok: true, kind: 'cutBack' });
    play(old, [101, 20], [95, 34]);
    expect(detail(old).td[TD.cutBacks]).toBe(1);
  });

  it('counts a line-breaking pass by one rule on both paths', () => {
    // Midfielders deepest at 60, defenders at 85, the keeper behind them.
    const { t, s } = placed({ GK: 102, DF: 85, MF: 60, FW: 40 });
    play(t, [55, 30], [65, 30]); // beyond the midfield line
    play(t, [80, 30], [88, 30]); // beyond the defensive line
    play(t, [60, 30], [70, 30]); // from level with the midfield line: still played beyond it
    play(t, [62, 30], [80, 30]); // already past the midfielders, short of the defenders
    play(t, [55, 30], [65, 30], false); // not completed
    play(t, [65, 30], [55, 30]); // back past the line
    // The decision's flag decides nothing on the candidate model.
    t.passEvent(0, 7, {
      from: [20, 30],
      to: [30, 30],
      ok: true,
      kind: 'short',
      lineBreaking: true,
    });
    // A restart played as a pass counts by the same rule.
    s.players[0][9]!.pos = [64, 30];
    t.restartPass(0, 4, [50, 30], received(9, [64, 30]));
    expect(counted(t, s)[TD.lineBreakingPasses]).toBe(4);
  });

  it('counts a through ball into the space beyond the deepest outfield defender', () => {
    const { t, s } = placed({ GK: 104, DF: 85, MF: 60, FW: 40 });
    play(t, [70, 30], [90, 30]); // in behind, completed
    play(t, [70, 30], [92, 40], false); // in behind, not completed (an offside or a lost one)
    play(t, [70, 30], [84, 30]); // to feet in front of the line
    play(t, [88, 30], [95, 30]); // passed from beyond the line already
    play(t, [70, 20], [92, 34], true, 'cross'); // a cross stays a cross
    const td = counted(t, s);
    expect([td[TD.throughBalls], td[TD.throughBallsCompleted]]).toEqual([2, 1]);
  });

  it('a pass to a receiver already beyond the deepest defender is not a through ball (T397)', () => {
    const { t, s } = placed({ GK: 104, DF: 85, MF: 60, FW: 40 });
    const pass = (receiverAt: Point, to: Point) =>
      t.passEvent(0, 7, { from: [70, 30], to, receiverAt, ok: true, kind: 'short' });
    pass([84, 30], [90, 30]); // a runner level with the line, played in behind
    pass([80, 40], [92, 40]); // a runner short of the line, played in behind
    pass([88, 30], [90, 30]); // already past the line: to his feet, not into the space
    pass([92, 30], [95, 30]);
    // A restart's receiver stands where the ball goes, so one past the line is no through ball.
    s.players[0][9]!.pos = [90, 30];
    t.restartPass(0, 4, [70, 30], received(9, [90, 30]));
    const td = counted(t, s);
    expect([td[TD.throughBalls], td[TD.throughBallsCompleted]]).toEqual([2, 2]);
  });

  it("keeps PPDA's build-up zone the same on both paths", () => {
    // The zones sit on MATCH-14's bands: the final third from 70 m, the press from 35 m.
    expect(BAND_EDGES[COUNTER_ZONES.finalThird]).toBe(70);
    expect(BAND_EDGES[COUNTER_ZONES.press]).toBe(35);
    expect(BAND_EDGES[COUNTER_ZONES.highTurnover]).toBe(70);
    const { t, s } = placed({ GK: 104, DF: 85, MF: 60, FW: 40 });
    play(t, [69.9, 34], [75, 34]);
    play(t, [70, 34], [75, 34]);
    // Restarts played as passes count where they start, as every aggregate pass does.
    s.players[0][2]!.pos = [20, 20];
    t.restartPass(0, 0, [6, 34], received(2, [20, 20]));
    t.restartPass(0, 3, [75, 0], { target: 2, outcome: { kind: 'held' } });
    t.tackle(0, 6, [35, 34]);
    t.interception(0, 5, [34.9, 34]);
    t.regain(0, 6, [70, 30]);
    t.regain(0, 6, [69.9, 30]);
    const record = t.finish(s);
    const td = record.detail![0]!;
    expect([td[TD.buildUpPasses], td[TD.finalThirdPasses]]).toEqual([2, 2]);
    expect(td[TD.pressActions]).toBe(1);
    expect(td[TD.highTurnovers]).toBe(1);
    // Every pass attempt is read in one zone or the other.
    expect(td[TD.buildUpPasses]! + td[TD.finalThirdPasses]!).toBe(record.metrics[0]![M.passes]);
    // The pre-feature tally leaves restarts out of the zones, as its golden facts record.
    const old = fresh();
    old.restartPass(0, 0, [6, 34], received(2, [20, 20]));
    const before = detail(old).td;
    expect([before[TD.buildUpPasses], before[TD.finalThirdPasses]]).toEqual([0, 0]);
  });

  it('counts a high turnover from an open-play win within 40 m', () => {
    // Every ball won in open play reaches the tally through `regain` — a tackle, an interception,
    // a loose ball or a claim; a restart hands the ball over without it — and starts the winner's
    // sequence. MATCH-14 has no edge 40 m from goal (65 m), so both paths start the zone at the
    // nearest one, 35 m out (→MATCH-13 r18, COUNTER_ZONES).
    expect(BAND_EDGES[COUNTER_ZONES.highTurnover]).toBe(70);
    const { t, s } = placed({ GK: 104, DF: 85, MF: 60, FW: 40 });
    t.tackle(0, 6, [70, 30]);
    t.regain(0, 6, [70, 30]); // a tackle at the zone's edge
    t.regain(0, 9, [96, 34]); // a loose ball won in the box
    t.regain(0, 6, [69.9, 30]); // in the band below: 35.1 m out
    t.regain(0, 3, [20, 34]); // in the own third
    t.regain(1, 9, [80, 34]); // the other side's, in its own frame
    const record = t.finish(s);
    const [own, other] = record.detail!;
    expect(own![TD.highTurnovers]).toBe(2);
    expect(other![TD.highTurnovers]).toBe(1);
    const pd = (idx: number) => record.players[idx]!.detail![PD.highTurnovers];
    expect([pd(6), pd(9), pd(3)]).toEqual([1, 1, 0]);
  });

  it("divides PPDA by every defensive action in the opponent's 60%", () => {
    // The zone sits on MATCH-14's two-thirds edge for 60%: the presser's 35 m, the passer's 70 m.
    const { t, s } = placed({ GK: 104, DF: 85, MF: 60, FW: 40 });
    const theirs = (from: Point, to: Point, ok = true) =>
      t.passEvent(1, 7, { from, to, ok, kind: 'short' });
    theirs([30, 34], [40, 34]);
    theirs([60, 34], [66, 34], false);
    theirs([75, 34], [80, 34]); // in its final third: outside the numerator
    // Our tackle, interception, challenge lost to a take-on and foul from 35 m in our frame.
    t.tackle(0, 6, [40, 30]);
    t.interception(0, 5, [36, 30]);
    t.dribble(1, 9, [60, 34]); // he beat us 60 m up in his frame, 45 m up in ours
    t.foul(0, 4, 9, [50, 30]);
    // The same actions deeper in our half are not pressing.
    t.tackle(0, 6, [34.9, 30]);
    t.dribble(1, 9, [75, 34]);
    t.foul(0, 4, 9, [20, 30]);
    const record = t.finish(s);
    const [own, other] = record.detail!;
    expect(own![TD.pressActions]).toBe(4);
    expect(other![TD.buildUpPasses]).toBe(2);
    expect(own![TD.fouls]).toBe(2);
    // The pre-feature tally keeps tackles and interceptions only (its golden facts).
    const old = fresh();
    old.tackle(0, 6, [40, 30]);
    old.dribble(1, 9, [60, 34]);
    old.foul(0, 4, 9, [50, 30]);
    expect(detail(old).td[TD.pressActions]).toBe(1);
  });
});

describe('candidate own match record (→MATCH-13, MATCH-25, MATCH-26)', () => {
  it("names every participant of both sides while the material stays the own side's", () => {
    const w = kit.w;
    const f = w.fixtures.find((x) => x.home === w.playerClub || x.away === w.playerClub)!;
    const setup = buildGridSetup(w, f, {
      observe: false,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
    });
    const { record } = playGrid(setup);
    expect(validateFullMatchRecord(record)).toEqual([]);
    for (const side of [0, 1] as const) {
      const lines =
        side === 0
          ? record.players.slice(0, record.lineCounts![0])
          : record.players.slice(record.lineCounts![0]);
      const roster = new Set(setup.rosters[side].map((p) => p.id));
      expect(lines.length).toBeGreaterThanOrEqual(11);
      for (const line of lines) {
        expect(roster.has(line.id)).toBe(true);
        expect(line.detail).toHaveLength(PLAYER_DETAIL_SIZE);
      }
      // The opponent's passes are credited to his named players as the own side's are.
      expect(lines.reduce((n, l) => n + l.metrics[M.passes]!, 0)).toBe(
        record.metrics[side][M.passes],
      );
    }
    // Post-match material covers the own lines only, as its lifetime has always assumed.
    const cells = MATERIAL_LAYOUT.cells;
    expect(record.material!.heat).toHaveLength((record.lineCounts![setup.own!] + 2) * cells);
  });
});
