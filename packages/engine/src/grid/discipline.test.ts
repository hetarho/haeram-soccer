import { describe, expect, it } from 'vitest';
import { TD } from '../../../contracts/src/detail';
import { random } from '../primitives';
import { resolveTakeOn } from './resolve';
import { computeTags } from './tags';
import { cardForFoul, dissentAt, isDogso, isTactical, type CardVerdict } from './discipline';
import type { Point } from './pitch';
import { gridKit } from './testkit';
import { createWorld } from '../index';
import { playGrid } from './engine';
import { buildGridSetup } from './setup';

const kit = gridKit();
/** All players parked in the far corners; the home side (0) is fouled by side 1 unless a test says otherwise. */
function field() {
  const s = kit.state;
  for (const side of s.players)
    for (const gp of side) {
      gp.pos = gp.side === 0 ? [0, 0] : [105, 68];
      gp.yellow = false;
      gp.sentOff = false;
    }
  s.elapsed = 600;
  s.lastRegain = undefined;
  s.ball = [60, 34];
  return s;
}
const rate = (n: number, f: (r: () => number) => CardVerdict, card: CardVerdict['card']) => {
  const r = random(`cards-${card}-${n}`);
  let hits = 0;
  for (let i = 0; i < n; i++) if (f(r).card === card) hits++;
  return hits / n;
};

describe('grid discipline (work in progress)', () => {
  it('books tactical fouls far more often than ordinary ones', () => {
    const s = field();
    s.players[1][4]!.pos = [60, 34];
    s.players[0][9]!.pos = [60, 34];
    const at: Point = [60, 34];
    const ordinary = rate(6000, (r) => cardForFoul(s, 1, 4, { at, inBox: false }, r), 'yellow');
    s.lastRegain = { side: 0, at: 598 };
    s.ball = [55, 34];
    expect(isTactical(s, 1, 4)).toBe(true);
    const tactical = rate(6000, (r) => cardForFoul(s, 1, 4, { at, inBox: false }, r), 'yellow');
    expect(ordinary).toBeGreaterThan(0.26);
    expect(ordinary).toBeLessThan(0.38);
    expect(tactical).toBeGreaterThan(0.5);
  });

  it('sends off for denying an obvious goal-scoring opportunity, less often inside the box', () => {
    const s = field();
    s.players[1].forEach((gp) => (gp.pos = [40, 60]));
    s.players[1][0]!.pos = [104, 34];
    s.players[1][4]!.pos = [85, 34];
    s.players[0][9]!.pos = [86, 34];
    const outside: Point = [86, 34];
    expect(isDogso(s, 1, 4, outside)).toBe(true);
    const red = rate(8000, (r) => cardForFoul(s, 1, 4, { at: outside, inBox: false }, r), 'red');
    const inside = rate(8000, (r) => cardForFoul(s, 1, 4, { at: [95, 34], inBox: true }, r), 'red');
    expect(red).toBeGreaterThan(0.75);
    expect(inside).toBeGreaterThan(0.25);
    expect(inside).toBeLessThan(0.4);
  });

  it('turns a second yellow into a red', () => {
    const s = field();
    s.players[1][4]!.pos = [50, 34];
    s.players[1][4]!.yellow = true;
    const r = random('second');
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++)
      seen.add(cardForFoul(s, 1, 4, { at: [50, 34], inBox: false }, r).card);
    expect(seen.has('secondYellow')).toBe(true);
    expect(seen.has('yellow')).toBe(false);
  });

  it('draws dissent rarely', () => {
    const s = field();
    s.players[0].forEach((gp, i) => i > 0 && i < 11 && (gp.onPitch = true));
    const r = random('dissent');
    let hits = 0;
    for (let i = 0; i < 5000; i++) if (dissentAt(s, 0, r)) hits++;
    expect(hits / 5000).toBeGreaterThan(0.04);
    expect(hits / 5000).toBeLessThan(0.09);
  });

  it('makes a booked player foul less', () => {
    const run = (booked: boolean) => {
      const s = field();
      s.players[0][8]!.pos = [80, 34];
      s.players[1][3]!.pos = [83, 34];
      s.players[1][3]!.yellow = booked;
      s.players[0][8]!.base.fill(40);
      s.players[1][3]!.base.fill(80);
      return s;
    };
    const w = createWorld({
      country: 'ENG',
      name: 'Booked Lab',
      color: '#2a5d8f',
      seed: 'booked',
      level: 'normal',
    });
    expect(w.clubs.length).toBeGreaterThan(1);
    const foulRate = (booked: boolean) => {
      const s = run(booked);
      const r = random(`foul-${booked}`);
      let fouls = 0;
      for (let i = 0; i < 6000; i++)
        if (resolveTakeOn(s, 0, 8, computeTags(s, 0, 8), r).kind === 'foul') fouls++;
      return fouls;
    };
    expect(foulRate(true)).toBeLessThan(foulRate(false) * 0.8);
  });

  it('plays on with ten men after a red card and keeps cards at plausible rates', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Grid Cards Lab',
      color: '#2a5d8f',
      seed: 'grid-cards',
      level: 'normal',
    });
    const [home, away] = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    let yellows = 0,
      reds = 0,
      sawTen = false;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const f = { ...w.fixtures[0]!, id: `cards-${i}`, home: home!.id, away: away!.id };
      const { record: m } = playGrid(
        buildGridSetup(w, f, {
          observe: false,
          recordPlayers: true,
          tactics: ['balanced', 'balanced'],
        }),
      );
      for (const side of [0, 1] as const) {
        yellows += m.detail![side]![TD.yellowCards]!;
        reds += m.detail![side]![TD.redCards]!;
        const sent =
          m.incidents?.filter(
            (x) => x.side === side && (x.kind === 'red' || x.kind === 'secondYellow'),
          ) ?? [];
        if (sent.length) {
          sawTen = true;
          const lines = m.players.slice(side * 11, side * 11 + 11);
          for (const x of sent) expect(lines.some((p) => p.id === x.player)).toBe(true);
          expect(lines.every((p) => p.metrics[10]! <= 90)).toBe(true);
        }
      }
    }
    expect(sawTen).toBe(true);
    expect(yellows / n).toBeGreaterThan(2);
    expect(yellows / n).toBeLessThan(6);
    expect(reds / n).toBeLessThanOrEqual(0.4);
  });
});
