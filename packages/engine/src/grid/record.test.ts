import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../../contracts/src/detail';
import { createWorld } from '../index';
import { playGrid } from './engine';
import { CELL_BASELINES } from './baselines';
import { cellOf, type Point } from './pitch';
import { M, Tally } from './record';
import { buildGridSetup } from './setup';
import { createState } from './state';
import { gridKit } from './testkit';

const kit = gridKit();
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

  it('fills every match consistently with the schema rules and plausible totals', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Grid Counter Lab',
      color: '#2a5d8f',
      seed: 'grid-counters',
      level: 'normal',
    });
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
