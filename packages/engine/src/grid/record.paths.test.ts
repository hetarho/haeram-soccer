import { describe, expect, it } from 'vitest';
import { TD } from '../../../contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import type { Fixture, World } from '../../../contracts/src/types';
import { matchdayRosters, playAggregate } from '../aggregate/engine';
import { deriveTeamFacts, ledgerIssues } from '../aggregate/ledger';
import type { AggregateLedger, AggregateMove } from '../aggregate/types';
import { careerWorld } from '../career.testkit';
import { ownLeagueClubs } from '../index';
import { prepareMatch } from '../match';
import { BAND_EDGES, LANE_EDGES, type Point } from '../match/pitch';
import { M } from '../match/record';
import { eraRules } from '../match/rules';
import { FORMATIONS, lineOf } from '../player';
import { RUNNING, Tally } from './record';
import { buildGridSetup } from './setup';
import { createState, type GridState } from './state';
import { gridKit } from './testkit';

/*
 * The detailed engine's tally against the aggregate ledger (moved from aggregate/engine.test.ts
 * with the grid's other tests, T842): both count MATCH-13's metrics by one rule until the grid goes.
 */

/**
 * Fixtures between clubs nobody owns in a freshly founded world (→ARCH-21: a founding, no
 * seasons), each replayed under its own ID so every replay draws its own streams.
 */
function others(n: number, year?: number) {
  const w: World = careerWorld({ seed: 'aggregate-engine' });
  const league = new Set(ownLeagueClubs(w).map((c) => c.id));
  const pool = w.fixtures.filter(
    (f) => f.home !== w.playerClub && f.away !== w.playerClub && !league.has(f.home),
  );
  const fixtures = Array.from({ length: n }, (_, i): Fixture => {
    const f = pool[i % pool.length]!;
    return { ...f, id: `${f.id}:agg:${i}`, ...(year !== undefined && { year }) };
  });
  return { w, fixtures };
}
/**
 * One counting rule on both paths (→MATCH-13, MATCH-14, MATCH-30): the same synthetic actions
 * (explicitly synthetic test data) counted by the detailed tally at the cells' centres, where the
 * players stand, and by the aggregate ledger on the cells.
 */
describe('one counting rule on both paths (→MATCH-13, MATCH-30)', () => {
  const kit = gridKit();
  const setup = buildGridSetup(kit.w, kit.f, {
    observe: false,
    recordPlayers: true,
    tactics: ['balanced', 'balanced'],
    model: MATCH_MODEL_REVISION,
  });
  const cell = (band: number, lane: number) => band * 5 + lane;
  /** The centre of a cell in the acting side's attack frame (MATCH-14's markings). */
  const centre = (c: number): Point => {
    const band = Math.floor(c / 5),
      lane = c % 5;
    return [
      (BAND_EDGES[band]! + BAND_EDGES[band + 1]!) / 2,
      (LANE_EDGES[lane]! + LANE_EDGES[lane + 1]!) / 2,
    ];
  };
  const mirror = (p: Point): Point => [105 - p[0], 68 - p[1]];
  /** A detailed tally whose opponents' lines stand at these x of side 0's attack frame. */
  const tally = (at = { GK: 104, DF: 85, MF: 60, FW: 40 }) => {
    const s: GridState = createState(setup);
    const slots = FORMATIONS[setup.tactics[1]].slots;
    s.players[1].slice(0, 11).forEach((gp, i) => {
      gp.pos = [at[lineOf(slots[i]!.position) as keyof typeof at], 4 + 6 * i];
    });
    return { t: new Tally(setup, s), s };
  };
  const move = (m: Partial<AggregateMove>): AggregateMove => ({
    period: 'regulation',
    from: 0,
    to: 0,
    kind: 'short',
    attempts: 1,
    completed: 1,
    lineBreaking: 0,
    offside: 0,
    intercepted: 0,
    outTouch: 0,
    outByline: 0,
    cornersWon: 0,
    recovered: 0,
    ...m,
  });
  /** A one-period ledger with only these moves of each side. */
  const ledger = (own: Partial<AggregateMove>[], opp: Partial<AggregateMove>[] = []) => {
    const side = (moves: Partial<AggregateMove>[]) => ({
      moves: moves.map(move),
      shots: [],
      fouled: [],
      held: [1200],
      cards: { yellow: 0, red: 0 },
      cardFouls: 0,
    });
    return {
      length: 90,
      periods: ['regulation'],
      sides: [side(own), side(opp)],
    } as AggregateLedger;
  };
  const aggregate = (l: AggregateLedger) => {
    expect(ledgerIssues(l)).toEqual([]);
    return deriveTeamFacts(l).sides[0].detail;
  };
  /** Each pass group, played by the detailed tally once per attempt. */
  const replay = (t: Tally, moves: Partial<AggregateMove>[]) => {
    for (const m of moves.map(move))
      for (let i = 0; i < m.attempts; i++)
        t.passEvent(0, 7, {
          from: centre(m.from),
          to: centre(m.to),
          ok: i < m.completed,
          kind: m.kind === 'cross' ? 'cross' : 'short',
        });
  };

  it("counts a cut-back only from MATCH-14's zone", () => {
    const moves: Partial<AggregateMove>[] = [
      // From the goal-area half-spaces into the box: cut-backs, whatever the kind.
      { from: cell(7, 1), to: cell(6, 1), attempts: 2, completed: 1 },
      { from: cell(7, 3), to: cell(7, 2), kind: 'cutBack' },
      { from: cell(7, 1), to: cell(7, 2), kind: 'cross' },
      // The kernel's pull-back flow from elsewhere is no cut-back (T284's zone).
      { from: cell(6, 0), to: cell(6, 1), kind: 'cutBack', attempts: 3, completed: 3 },
      { from: cell(7, 0), to: cell(7, 1), kind: 'cutBack' },
      { from: cell(6, 1), to: cell(6, 2), kind: 'cutBack' },
    ];
    const { t, s } = tally();
    replay(t, moves);
    const grid = t.finish(s).detail![0]!;
    const agg = aggregate(ledger(moves));
    expect(agg[TD.cutBacks]).toBe(3);
    expect(grid[TD.cutBacks]).toBe(agg[TD.cutBacks]);
  });

  it('counts a line-breaking pass by one rule on both paths', () => {
    // Opponent midfielders deepest at 60 m (band 4), defenders at 85 m (band 5).
    const moves: Partial<AggregateMove>[] = [
      { from: cell(3, 2), to: cell(4, 2), attempts: 3, completed: 2, lineBreaking: 2 },
      { from: cell(5, 1), to: cell(6, 2), kind: 'cross', lineBreaking: 1 },
      { from: cell(4, 1), to: cell(4, 2) },
      { from: cell(2, 2), to: cell(1, 2) },
    ];
    const { t, s } = tally();
    replay(t, moves);
    const grid = t.finish(s).detail![0]!;
    const agg = aggregate(ledger(moves));
    expect(agg[TD.lineBreakingPasses]).toBe(3);
    expect(grid[TD.lineBreakingPasses]).toBe(agg[TD.lineBreakingPasses]);
    // A pass that does not end upfield never breaks a line, nor more than its completions.
    const lateral = ledger([{ from: cell(4, 1), to: cell(4, 2), lineBreaking: 1 }]);
    expect(ledgerIssues(lateral).join()).toMatch(/line-breaking/);
    const over = ledger([{ from: cell(3, 2), to: cell(4, 2), lineBreaking: 2 }]);
    expect(ledgerIssues(over).join()).toMatch(/line-breaking/);
  });

  it("keeps PPDA's build-up zone the same on both paths", () => {
    const own: Partial<AggregateMove>[] = [
      { from: cell(4, 2), to: cell(4, 1), attempts: 3, completed: 3 },
      { from: cell(5, 2), to: cell(5, 1), attempts: 2, completed: 2 },
    ];
    // The opponent's actions in its own frame: carries tackled in its band 4 (our band 3) and
    // band 5 (our band 2), and a pass intercepted where it was played to, its band 2 (our band 5).
    const opp: Partial<AggregateMove>[] = [
      { from: cell(4, 2), to: cell(4, 2), kind: 'carry', attempts: 2, completed: 0 },
      { from: cell(5, 2), to: cell(5, 2), kind: 'carry', completed: 0 },
      { from: cell(1, 2), to: cell(2, 2), completed: 0, intercepted: 1 },
    ];
    const agg = aggregate(ledger(own, opp));
    const { t, s } = tally();
    replay(t, own);
    for (const at of [cell(4, 2), cell(4, 2), cell(5, 2)]) t.tackle(0, 6, mirror(centre(at)));
    t.interception(0, 5, mirror(centre(cell(2, 2))));
    for (const at of [cell(4, 2), cell(4, 2), cell(5, 2), cell(2, 2)])
      t.regain(0, 6, mirror(centre(at)));
    const grid = t.finish(s).detail![0]!;
    for (const k of [TD.buildUpPasses, TD.finalThirdPasses, TD.pressActions, TD.highTurnovers])
      expect(grid[k]).toBe(agg[k]);
    expect([agg[TD.buildUpPasses], agg[TD.finalThirdPasses]]).toEqual([3, 2]);
    expect([agg[TD.pressActions], agg[TD.highTurnovers]]).toEqual([3, 1]);
  });

  it('counts high turnovers and PPDA by the published conventions on both paths', () => {
    // The opponent's actions in its own frame; ours are read mirrored (our band = 7 − its band).
    const opp: Partial<AggregateMove>[] = [
      // A carry tackled in its band 2 (our 5) and a pass intercepted in its band 1 (our 6).
      { from: cell(2, 2), to: cell(2, 2), kind: 'carry', completed: 0 },
      { from: cell(1, 2), to: cell(1, 1), completed: 0, intercepted: 1 },
      // Of two passes into its band 2 one is lost loose (we recover it), and one goes out.
      { from: cell(2, 2), to: cell(2, 1), attempts: 2, completed: 1, recovered: 1 },
      { from: cell(2, 1), to: cell(2, 0), completed: 0, outTouch: 1 },
      // A take-on beats us in its band 4 (our 3); one is tackled in its band 5 (our 2).
      { from: cell(4, 2), to: cell(4, 2), kind: 'takeOn' },
      { from: cell(5, 2), to: cell(5, 2), kind: 'takeOn', completed: 0 },
    ];
    const l = ledger([], opp);
    // Our fouls on its actions in its band 3 (our 4) and band 5 (our 2).
    l.sides[1].fouled = [
      { period: 'regulation', cell: cell(3, 2), n: 2, penalties: 0 },
      { period: 'regulation', cell: cell(5, 2), n: 1, penalties: 0 },
    ];
    expect(ledgerIssues(l)).toEqual([]);
    const facts = deriveTeamFacts(l).sides;
    // The detailed engine plays the same: wins reach `regain`, the out of play does not.
    const { t, s } = tally();
    const ours = (c: number) => mirror(centre(c));
    const theirs = (from: number, to: number, ok: boolean) =>
      t.passEvent(1, 7, { from: centre(from), to: centre(to), ok, kind: 'short' });
    t.tackle(0, 6, ours(cell(2, 2)));
    t.regain(0, 6, ours(cell(2, 2)));
    theirs(cell(1, 2), cell(1, 1), false);
    t.interception(0, 5, ours(cell(1, 1)));
    t.regain(0, 5, ours(cell(1, 1)));
    theirs(cell(2, 2), cell(2, 1), true);
    theirs(cell(2, 2), cell(2, 1), false);
    t.regain(0, 9, ours(cell(2, 1)));
    theirs(cell(2, 1), cell(2, 0), false);
    t.takeOnAttempt(1, 9);
    t.dribble(1, 9, centre(cell(4, 2)));
    t.takeOnAttempt(1, 9);
    t.tackle(0, 6, ours(cell(5, 2)));
    t.regain(0, 6, ours(cell(5, 2)));
    for (const c of [cell(3, 2), cell(3, 2), cell(5, 2)]) t.foul(0, 4, 9, ours(c));
    const record = t.finish(s);
    for (const side of [0, 1] as const) {
      for (const k of [TD.highTurnovers, TD.pressActions, TD.buildUpPasses, TD.fouls])
        expect(record.detail![side]![k], `side ${side} TD ${k}`).toBe(facts[side].detail[k]);
      for (const k of [M.tackles, M.interceptions, M.passes, M.dribbles])
        expect(record.metrics[side]![k], `side ${side} M ${k}`).toBe(facts[side].metrics[k]);
    }
    const [own, other] = facts;
    // Tackle, interception and loose ball in our high zone; not the tackle deeper or the out.
    expect(own.detail[TD.highTurnovers]).toBe(3);
    // Tackle, interception, the challenge lost and two fouls from our band 3 on.
    expect(own.detail[TD.pressActions]).toBe(5);
    expect(other.detail[TD.buildUpPasses]).toBe(4);
  });

  it('counts a loose ball as a high turnover only when the opponent won it (T323)', () => {
    // Three of the opponent's passes into its band 2 (our 5) go loose; we won one of them.
    const loose: Partial<AggregateMove> = {
      from: cell(2, 2),
      to: cell(2, 1),
      attempts: 4,
      completed: 1,
      recovered: 1,
    };
    expect(aggregate(ledger([], [loose]))[TD.highTurnovers]).toBe(1);
    expect(aggregate(ledger([], [{ ...loose, recovered: 0 }]))[TD.highTurnovers]).toBe(0);
    // More won than went loose, or a carry won loose, does not hold together.
    expect(ledgerIssues(ledger([], [{ ...loose, recovered: 4 }])).join()).toMatch(/failed/);
    const carry = { ...loose, kind: 'carry' as const, completed: 3, recovered: 1 };
    expect(ledgerIssues(ledger([], [carry])).join()).toMatch(/pass outcomes/);
    // Generated matches: the opponent wins about `failed.loose.share` (times its press) of them.
    const { w, fixtures } = others(40);
    let won = 0,
      free = 0;
    for (const f of fixtures) {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      const match = playAggregate(w, f, prepared, rosters);
      for (const side of match.facts.ledger.sides)
        for (const m of side.moves) {
          const rest = m.attempts - m.completed - m.offside - m.intercepted;
          const left = rest - m.outTouch - m.outByline;
          expect(m.recovered).toBeLessThanOrEqual(left);
          won += m.recovered;
          free += left;
        }
    }
    expect(won / free).toBeGreaterThan(0.15);
    expect(won / free).toBeLessThan(0.3);
  });

  it('reads possession as the share of attempted passes', () => {
    // Thirty of our pass attempts to their twenty, whatever the seconds on the ball or carries.
    const own: Partial<AggregateMove>[] = [
      { from: cell(3, 2), to: cell(3, 1), attempts: 24, completed: 22 },
      { from: cell(5, 2), to: cell(5, 3), attempts: 6, completed: 3 },
      { from: cell(4, 2), to: cell(4, 2), kind: 'carry', attempts: 15, completed: 15 },
    ];
    const opp: Partial<AggregateMove>[] = [
      { from: cell(2, 2), to: cell(2, 1), attempts: 20, completed: 15 },
    ];
    const l = ledger(own, opp);
    l.sides[0].held = [600];
    l.sides[1].held = [3000];
    expect(ledgerIssues(l)).toEqual([]);
    const facts = deriveTeamFacts(l).sides;
    const { t, s } = tally();
    replay(t, own.slice(0, 2));
    for (let i = 0; i < 20; i++)
      t.passEvent(1, 7, {
        from: centre(cell(2, 2)),
        to: centre(cell(2, 1)),
        ok: i < 15,
        kind: 'short',
      });
    t.possession(0, 600);
    t.possession(1, 3000);
    const record = t.finish(s);
    // 30 / (30 + 20) of 90.
    expect([facts[0].metrics[M.possession], facts[1].metrics[M.possession]]).toEqual([54, 36]);
    expect(record.metrics.map((m) => m[M.possession])).toEqual([54, 36]);
    // Playback shares running possession by the same passes (grid/playback.ts reads this slot).
    const running = t.running();
    expect([running[M.minutes], running[RUNNING + M.minutes]]).toEqual([30, 20]);
  });
});
