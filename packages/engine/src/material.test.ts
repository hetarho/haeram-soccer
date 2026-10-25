import { describe, expect, it } from 'vitest';
import { TD } from '../../contracts/src/detail';
import type { MatchMaterial, MatchRecord } from '../../contracts/src/types';
import { DISABLED_RELEASE, ENABLED_RELEASE, simulatedWorld } from '../../../tests/fixtures/worlds';
import { FOUNDING } from './finance.testkit';
import { playGrid } from './grid/engine';
import { cellOf } from './grid/pitch';
import { MaterialTally } from './grid/record';
import { buildGridSetup } from './grid/setup';
import { country } from '../../catalogs/src/index';
import { createWorld, closeSeason } from './index';
import { ranked } from './season';
import { clubOf } from './world';
import {
  heatMap,
  ownSideOf,
  passNetwork,
  seasonHeat,
  shotMap,
  tacticalReport,
  type MaterialShot,
} from './material';

const XI = Array.from({ length: 11 }, (_, i) => i);
/** A record around `material` with both sides' lines: home `h0…`, away `a0…`. */
const recordOf = (material: MatchMaterial, lines: [number, number] = [11, 11]) =>
  ({
    id: 'm',
    home: 'H',
    away: 'A',
    players: [
      ...Array.from({ length: lines[0] }, (_, i) => ({ id: `h${i}`, metrics: [] })),
      ...Array.from({ length: lines[1] }, (_, i) => ({ id: `a${i}`, metrics: [] })),
    ],
    lineCounts: lines,
    material,
  }) as unknown as MatchRecord;

describe('post-match material', () => {
  it('fills material for own matches only', () => {
    const w = createWorld({ ...FOUNDING, seed: 'material' });
    const ownFixture = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
    const [home, away] = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    const npcFixture = { ...w.fixtures[0]!, id: 'npc', home: home!.id, away: away!.id };
    const play = (f: typeof ownFixture, observe: boolean) =>
      playGrid(buildGridSetup(w, f, { observe, recordPlayers: true })).record;

    const own = play(ownFixture, false);
    expect(play(npcFixture, false).material).toBeUndefined();
    // Observation never changes what is counted (→MATCH-7).
    expect(play(ownFixture, true).material).toEqual(own.material);

    const m = own.material!;
    const side = ownSideOf(own, w.playerClub)!;
    const lines = own.lineCounts![side];
    expect(m.heat).toHaveLength((lines + 2) * 40);
    expect(m.report).toHaveLength(60);
    // Every shot of both sides is on the map, at the shooter's line.
    const shots = shotMap(own);
    expect(shots.filter((s) => s.side === 0)).toHaveLength(own.metrics[0][4]);
    expect(shots.filter((s) => s.side === 1)).toHaveLength(own.metrics[1][4]);
    expect(shots.filter((s) => s.outcome === 'goal')).toHaveLength(own.score.home + own.score.away);
    for (const s of shots) {
      const line = own.players.slice(s.side === 0 ? 0 : own.lineCounts![0])[s.line]!;
      expect(s.player).toBe(line.id);
      expect(line.metrics[4]).toBeGreaterThan(0);
    }
    // The own lines add up to the own total, and the network counts the same touches.
    const total = heatMap(own, 'own', side)!;
    const network = passNetwork(own, side)!;
    let sum = 0;
    for (const node of network.nodes) {
      expect(heatMap(own, node.player!, side)!.touches).toBe(node.touches);
      sum += node.touches;
    }
    expect(total.touches).toBe(sum);
    expect(heatMap(own, 'opponent', side)!.touches).toBeGreaterThan(0);
    expect(m.network.length).toBe(lines * 3 + network.pairs.length * 3);
    for (const s of [0, 1] as const) {
      const report = tacticalReport(own, s)!;
      expect(report.crosses).toBe(own.detail![s][TD.crosses]);
      expect(report.aerials.won).toBeLessThanOrEqual(report.aerials.total);
      expect(report.takeOns.won).toBe(own.metrics[s][8]);
      expect(report.tackles.won).toBe(own.metrics[s][6]);
    }
  });

  it('counts touches per cell', () => {
    const t = new MaterialTally(0, 14);
    // Home attacks toward x = 105: its frame is the engine frame.
    t.touch(0, 3, [60, 30], 'progression');
    t.touch(0, 3, [61, 31], 'progression');
    t.received(0, 3, 9, [95, 34]);
    // Away's frame is mirrored: engine (10, 30) is (95, 38) for it.
    t.touch(1, 4, [10, 30], 'finalThird');
    const m = t.finish([XI, XI]);
    const r = recordOf(m);
    const cells = heatMap(r, 'h3', 0)!.cells;
    expect(cells[cellOf([60, 30])]).toBe(2);
    expect(heatMap(r, 'h3', 0)!.touches).toBe(2);
    expect(heatMap(r, 'h9', 0)!.cells[cellOf([95, 34])]).toBe(1);
    expect(heatMap(r, 'own', 0)!.touches).toBe(3);
    expect(heatMap(r, 'opponent', 0)!.cells[cellOf([95, 38])]).toBe(1);
    // An away player is not an own line.
    expect(heatMap(r, 'a4', 0)).toBeUndefined();
    expect(passNetwork(r, 0)!.nodes[3]).toEqual({
      line: 3,
      player: 'h3',
      x: 60.5,
      y: 30.5,
      touches: 2,
    });
  });

  it('keeps the pass network pairs that happened at least twice', () => {
    const t = new MaterialTally(1, 16);
    t.received(1, 2, 5, [50, 30]);
    t.received(1, 2, 5, [52, 30]);
    t.received(1, 2, 5, [54, 30]);
    t.received(1, 5, 2, [40, 30]);
    // A substitute (roster 14) came on for roster 7: he is the twelfth line.
    t.received(1, 14, 9, [30, 20]);
    t.received(1, 14, 9, [30, 22]);
    // The opponent's passes are not the own network.
    t.received(0, 2, 5, [50, 30]);
    t.received(0, 2, 5, [50, 30]);
    const m = t.finish([XI, [...XI, 14]]);
    const r = recordOf(m, [11, 12]);
    const network = passNetwork(r, 1)!;
    expect(network.nodes).toHaveLength(12);
    expect(network.pairs).toEqual([
      { from: 2, to: 5, fromPlayer: 'a2', toPlayer: 'a5', completed: 3 },
      { from: 11, to: 9, fromPlayer: 'a11', toPlayer: 'a9', completed: 2 },
    ]);
  });

  it('reduces material to season heat maps at the close', () => {
    // The pre-feature season, whatever the switch: this club plays no playoff on it, so the league
    // season is all its material (the candidate's playoff is the next case).
    const w = simulatedWorld(FOUNDING, { rounds: 46 }, DISABLED_RELEASE);
    const season = w.ownMatches.filter((m) => m.year === w.year);
    expect(season.length).toBeGreaterThan(0);
    // The saved own record keeps only the own lines and its material.
    for (const m of season) expect(m.material).toBeDefined();
    const expected: Record<string, number[]> = {};
    for (const m of season)
      for (const p of m.players) {
        const cells = heatMap(m, p.id)!.cells;
        const sum = (expected[p.id] ??= new Array<number>(40).fill(0));
        cells.forEach((n, c) => (sum[c]! += n));
      }
    for (const id of Object.keys(expected))
      if (expected[id]!.every((n) => n === 0)) delete expected[id];
    const year = w.year;

    closeSeason(w);

    const archive = w.history.find((h) => h.year === year)!;
    expect(archive.heat).toEqual(expected);
    const [first] = Object.keys(expected);
    expect(seasonHeat(archive, first!)!.cells).toEqual(expected[first!]);
    expect(seasonHeat(archive, 'nobody')).toBeUndefined();
    for (const m of w.ownMatches.filter((m) => m.year === year)) {
      expect(m.material).toBeUndefined();
      // Outcomes, xG and counters stay (→MATCH-5).
      expect(m.score).toBeDefined();
      expect(m.xg).toBeDefined();
    }
  });

  it("the promotion playoff's material is reduced at the close", () => {
    // On the candidate this club plays the lower promotion playoff, which `promote` plays inside
    // the close. Where it finishes is the football's to decide (T441's lanes moved it out), so it
    // takes the record of the club in the playoff's second place: tied there, it ranks at most one
    // place either way, still among the four the playoff takes after the direct places.
    const w = simulatedWorld(FOUNDING, { rounds: 46 }, ENABLED_RELEASE);
    const year = w.year;
    const cp = country(clubOf(w).country);
    const places = cp.groups[cp.groups.length - 1]!.length * 2;
    const amateurs = w.clubs.filter((c) =>
      w.fixtures.some((f) => f.kind === 'lower' && (f.home === c.id || f.away === c.id)),
    );
    w.tables[w.playerClub] = { ...w.tables[ranked(w, amateurs)[places]!.id]! };
    const touches = (heat: Record<string, number[]> = {}) =>
      Object.values(heat)
        .flat()
        .reduce((s, n) => s + n, 0);
    let league = 0;
    for (const m of w.ownMatches.filter((m) => m.year === year))
      for (const p of m.players) league += heatMap(m, p.id)!.touches;

    closeSeason(w);

    // Whichever ties it played: its semi-final, and the final when it wins that (the football
    // decides which, so T445's second balls changed them).
    const playoff = w.ownMatches.filter((m) => m.id.startsWith(`${year}:lower-promotion:`));
    expect(playoff.length).toBeGreaterThan(0);
    for (const m of playoff) {
      expect(m.material).toBeUndefined();
      // Outcomes, highlights, match xG and counters stay (→MATCH-5).
      expect(m.score).toBeDefined();
      expect(m.highlights.length).toBeGreaterThan(0);
      expect(m.xg).toHaveLength(2);
      expect(m.metrics).toHaveLength(2);
      expect(m.detail).toHaveLength(2);
    }
    // The season heat maps take the playoff touches too.
    expect(touches(w.history.find((h) => h.year === year)!.heat)).toBeGreaterThan(league);
  });

  it('decodes what it encodes', () => {
    const t = new MaterialTally(0, 11);
    t.touch(0, 9, [80, 34], 'settled');
    t.shot(0, 9, 'goal', { x: 96.24, y: 33.96, xg: 0.314, header: false, setPiece: true });
    t.shot(1, 6, 'save', { x: 90, y: 40, xg: 0.08, header: true, setPiece: false });
    t.touch(1, 2, [80, 34], 'counter');
    t.shot(1, 2, 'block', { x: 82.5, y: 20, xg: 0.05, header: false, setPiece: false });
    t.regain(0, [75, 10]);
    t.regain(1, [20, 10]);
    t.entry(0, [60, 30], [72, 30]);
    t.entry(0, [80, 50], [95, 50]);
    t.aerial(1);
    t.takeOn(0);
    t.dribble(0);
    t.tackle(1);
    t.pass(0, 'cross');
    t.pass(0, 'through');
    t.pass(1, 'cutBack');
    const r = recordOf(t.finish([XI, XI]));
    const shots: MaterialShot[] = shotMap(r);
    expect(shots).toEqual([
      {
        side: 0,
        line: 9,
        player: 'h9',
        x: 96.2,
        y: 34,
        xg: 0.31,
        outcome: 'goal',
        header: false,
      },
      { side: 1, line: 6, player: 'a6', x: 90, y: 40, xg: 0.08, outcome: 'save', header: true },
      { side: 1, line: 2, player: 'a2', x: 82.5, y: 20, xg: 0.05, outcome: 'block', header: false },
    ]);
    // On a saved record the opponent's lines are gone: the shot keeps its line, not a name.
    const saved = recordOf(r.material!, [11, 0]);
    expect(shotMap(saved)[1]).not.toHaveProperty('player');
    expect(ownSideOf(saved)).toBe(0);
    expect(heatMap(saved, 'h9')!.touches).toBe(1);

    expect(tacticalReport(r, 0)).toEqual({
      finalThirdEntries: [0, 0, 1, 0, 0],
      boxEntries: [0, 0, 0, 1, 0],
      regains: [0, 0, 1],
      losses: [0, 0, 1],
      setPieceShots: 1,
      setPieceGoals: 1,
      aerials: { won: 0, total: 1 },
      takeOns: { won: 1, total: 1 },
      tackles: { won: 0, total: 0 },
      counterAttacks: 0,
      counterShots: 0,
      highRegains: 1,
      crosses: 1,
      cutBacks: 0,
      throughBalls: 1,
    });
    expect(tacticalReport(r, 1)).toMatchObject({
      regains: [1, 0, 0],
      losses: [1, 0, 0],
      aerials: { won: 1, total: 1 },
      tackles: { won: 1, total: 2 },
      counterAttacks: 1,
      counterShots: 1,
      cutBacks: 1,
    });
    // The header was the header taker's touch, in his own frame.
    expect(heatMap(r, 'opponent', 0)!.cells[cellOf([90, 40])]).toBe(1);
  });
});
