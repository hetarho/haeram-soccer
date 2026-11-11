import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../../contracts/src/types';
import { careerWorld } from '../career.testkit';
import { eraRules } from '../grid/setup';
import { ownLeagueClubs } from '../index';
import { prepareMatch } from '../match';
import { validateFullMatchRecord } from '../match-model';
import { SCRIPTED_RELEASE } from '../match-model-release';
import { cellCentre, placeFor } from '../staging/shape';
import { dist } from '../staging/vec';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC, AGGREGATE_CONFIG } from './config';
import { aggregateRecord, matchdayRosters, playAggregate, simulateAggregate } from './engine';
import { isPassKind } from './ledger';
import { attributePlayerFacts, mirrorCell } from './players';
import { aggregateStreams } from './team';
import type {
  AggregateAttributionTrace,
  AggregateMoveKind,
  AggregateParticipation,
  AggregatePeriod,
  AggregateSide,
} from './types';

// Revision 11's place rule (→MATCH-16, T824), measured on a scripted-model world: fixtures between
// clubs nobody owns, each attributed with and without place on the same ledger and streams.
const REVISION = SCRIPTED_RELEASE.revision;
const FAR = 20;
/** Attributions of each measured ledger on streams of their own, to narrow the totals' intervals. */
const REPLICATES = 4;

function world() {
  const w: World = careerWorld({ seed: 'aggregate-place' }, SCRIPTED_RELEASE);
  const league = new Set(ownLeagueClubs(w).map((c) => c.id));
  const pool = w.fixtures.filter(
    (f) => f.home !== w.playerClub && f.away !== w.playerClub && !league.has(f.home),
  );
  // Every other fixture in the modern era too, so substitutes' stints are placed as well.
  const fixtures = (n: number) =>
    Array.from({ length: n }, (_, i): Fixture => {
      const f = pool[i % pool.length]!;
      return { ...f, id: `${f.id}:place:${i}`, ...(i % 2 === 1 && { year: 2024 }) };
    });
  return { w, fixtures };
}

function play(w: World, f: Fixture) {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const match = playAggregate(w, f, prepared, rosters);
  const id = match.retry === 0 ? f.id : `${f.id}:retry${match.retry}`;
  /** The match's ledger attributed on its own streams, or on a replicate's (`:replicate<n>`). */
  const attribute = (placed: boolean, replicate = 0) => {
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const players = attributePlayerFacts(
      match.input,
      { ...match.plan, placed },
      match.participation,
      match.facts,
      aggregateStreams(w.seed, replicate === 0 ? id : `${id}:replicate${replicate}`),
      trace,
    );
    return { players, trace };
  };
  return { rosters, match, attribute, placed: attribute(true), unplaced: attribute(false) };
}
type Played = ReturnType<typeof play>;

/** The slot a line held longest in a period. */
function slotIn(
  participation: AggregateParticipation,
  side: AggregateSide,
  line: number,
  period: AggregatePeriod,
) {
  const { from, to } = AGGREGATE_CONFIG.periods[period];
  let slot = -1,
    most = 0;
  for (const s of participation.stints[side])
    if (s.line === line) {
      const minutes = Math.min(to, s.to) - Math.max(from, s.from);
      if (minutes > most) [slot, most] = [s.slot, minutes];
    }
  return slot;
}

/** Metres from each credited attempt's start, and each ball won, to its player's place. */
function distances(played: Played, which: 'placed' | 'unplaced') {
  const { match } = played;
  const { trace } = played[which];
  const shape = match.plan.shape!;
  const attempts: number[] = [],
    winners: number[] = [];
  for (const side of [0, 1] as const) {
    const opp: AggregateSide = side === 0 ? 1 : 0;
    match.facts.ledger.sides[side].moves.forEach((move, i) => {
      const t = trace.moves[side][i]!;
      if (!move.setPiece)
        t.attempts.forEach((k, line) => {
          if (k === 0) return;
          const slot = slotIn(match.participation, side, line, move.period);
          const d = dist(cellCentre(move.from), placeFor(shape, side, slot, move.from, true));
          for (let n = 0; n < k; n++) attempts.push(d);
        });
      const cell = mirrorCell(move.to);
      t.won.forEach((k, line) => {
        if (k === 0) return;
        const slot = slotIn(match.participation, opp, line, move.period);
        const d = dist(cellCentre(cell), placeFor(shape, opp, slot, cell, false));
        for (let n = 0; n < k; n++) winners.push(d);
      });
    });
  }
  return { attempts, winners };
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const share = (xs: readonly number[], over: number) =>
  xs.filter((d) => d > over).length / xs.length;

/** The standard normal's upper tail, 1 − Φ(z) for z ≥ 0 (Abramowitz–Stegun 7.1.26, error < 1e-7). */
const upperTail = (z: number) => {
  const x = z / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return (poly * Math.exp(-x * x)) / 2;
};
/** The two-sided z of a 95% interval held by `cells` comparisons at once (Bonferroni). */
const familyZ = (cells: number) => {
  let lo = 0,
    hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (2 * upperTail(mid) > 0.05 / cells) lo = mid;
    else hi = mid;
  }
  return hi;
};

const CLASS_OF: Record<AggregateMoveKind, string> = {
  short: 'pass',
  long: 'pass',
  cross: 'cross',
  cutBack: 'cross',
  through: 'through',
  carry: 'carry',
  takeOn: 'takeOn',
};
/** Each side's attempts a match by slot and action class, tackles and interceptions beside. */
function perSlot(match: Played['match'], trace: AggregateAttributionTrace) {
  const out: Map<string, number>[] = [new Map(), new Map()];
  const add = (side: AggregateSide, key: string, k: number) =>
    out[side]!.set(key, (out[side]!.get(key) ?? 0) + k);
  for (const side of [0, 1] as const) {
    const opp: AggregateSide = side === 0 ? 1 : 0;
    match.facts.ledger.sides[side].moves.forEach((move, i) => {
      const t = trace.moves[side][i]!;
      const pass = isPassKind(move.kind);
      t.attempts.forEach((k, line) => {
        if (k > 0)
          add(
            side,
            `${slotIn(match.participation, side, line, move.period)}:${CLASS_OF[move.kind]}`,
            k,
          );
      });
      t.won.forEach((k, line) => {
        if (k > 0)
          add(
            opp,
            `${slotIn(match.participation, opp, line, move.period)}:${pass ? 'interception' : 'tackle'}`,
            k,
          );
      });
    });
  }
  return out;
}

describe('attribution with the pitch in mind (→MATCH-16, T824)', () => {
  const { w, fixtures } = world();
  const measured = fixtures(24).map((f) => ({ f, played: play(w, f) }));

  it('a scripted-model world settles other fixtures under revision 11, placed', () => {
    expect(w.matchModel?.revision).toBe(REVISION);
    for (const { f, played } of measured.slice(0, 6)) {
      expect(played.match.plan.placed).toBe(true);
      // The settled match is the placed attribution itself.
      expect(played.placed.players).toEqual(played.match.players);
      const { record } = simulateAggregate(w, f);
      expect(record.model).toBe(REVISION);
      expect(validateFullMatchRecord(record)).toEqual([]);
    }
  });

  it('team numbers do not move', () => {
    for (const { f, played } of measured) {
      const placed = aggregateRecord(f, played.rosters, played.match, REVISION);
      const unplaced = aggregateRecord(
        f,
        played.rosters,
        { ...played.match, players: played.unplaced.players },
        REVISION,
      );
      expect(validateFullMatchRecord(placed)).toEqual([]);
      expect(placed.metrics).toEqual(unplaced.metrics);
      expect(placed.detail).toEqual(unplaced.detail);
      expect(placed.xg).toEqual(unplaced.xg);
    }
  });

  it('shots keep their shooters', () => {
    for (const { played } of measured)
      expect(played.placed.players.shots).toEqual(played.unplaced.players.shots);
  });

  it('an offside is never the passer’s own', () => {
    let offsides = 0;
    for (const { played } of measured)
      for (const side of [0, 1] as const)
        played.match.facts.ledger.sides[side].moves.forEach((move, i) => {
          const t = played.placed.trace.moves[side][i]!;
          const pairs = t.offsidePairs ?? [];
          expect(pairs.length).toBe(move.offside);
          for (const [passer, receiver] of pairs) {
            expect(receiver).not.toBe(passer);
            offsides++;
          }
        });
    expect(offsides).toBeGreaterThan(0);
  });

  it('a player’s actions gather where he plays', () => {
    const pool = (which: 'placed' | 'unplaced') => {
      const attempts: number[] = [],
        winners: number[] = [];
      for (const { played } of measured) {
        const d = distances(played, which);
        attempts.push(...d.attempts);
        winners.push(...d.winners);
      }
      return {
        median: median(attempts),
        far: share(attempts, FAR),
        winnersFar: share(winners, FAR),
        attempts: attempts.length,
        winners: winners.length,
      };
    };
    const placed = pool('placed'),
      unplaced = pool('unplaced');
    console.log(`T824 place (${measured.length} fixtures)`, { placed, unplaced });
    const target = AC.place.target;
    expect(placed.median).toBeLessThanOrEqual(target.median);
    expect(placed.far).toBeLessThanOrEqual(target.far);
    expect(placed.winnersFar).toBeLessThanOrEqual(target.winnersFar);
  });

  it('expected totals hold', () => {
    const many = [
      ...measured,
      ...fixtures(300)
        .slice(24)
        .map((f) => ({ f, played: play(w, f) })),
    ];
    expect(many).toHaveLength(300);
    const diffs = new Map<string, { placed: number; unplaced: number; d: number[] }>();
    for (const { played } of many)
      for (let replicate = 0; replicate < REPLICATES; replicate++) {
        const placed = perSlot(played.match, played.attribute(true, replicate).trace),
          unplaced = perSlot(played.match, played.attribute(false, replicate).trace);
        for (const side of [0, 1] as const) {
          const keys = new Set([...placed[side]!.keys(), ...unplaced[side]!.keys()]);
          for (const key of keys) {
            const p = placed[side]!.get(key) ?? 0,
              u = unplaced[side]!.get(key) ?? 0;
            let entry = diffs.get(key);
            if (!entry) diffs.set(key, (entry = { placed: 0, unplaced: 0, d: [] }));
            entry.placed += p;
            entry.unplaced += u;
            entry.d.push(p - u);
          }
        }
      }
    // Each side of each match and replicate is one observation; a slot and class it never saw
    // counts zero. The 95% interval holds for all cells together (Bonferroni): each cell at 95%
    // alone would fail about one in twenty with no difference at all.
    const observations = many.length * 2 * REPLICATES;
    const z = familyZ(diffs.size);
    const failures: string[] = [];
    const cells: string[] = [];
    let worst = 0;
    for (const [key, { placed, unplaced, d }] of diffs) {
      while (d.length < observations) d.push(0);
      const mean = d.reduce((n, x) => n + x, 0) / observations;
      const sd = Math.sqrt(d.reduce((n, x) => n + (x - mean) ** 2, 0) / (observations - 1));
      const half = (z * sd) / Math.sqrt(observations);
      const reference = unplaced / observations;
      const relative = reference > 0 ? Math.abs(mean) / reference : 0;
      const line = `${key}: ${(placed / observations).toFixed(3)} vs ${reference.toFixed(3)} (±${half.toFixed(3)})`;
      if (relative > 0.03) cells.push(line);
      if (Math.abs(mean) > 0.03 * reference && Math.abs(mean) >= half) failures.push(line);
      worst = Math.max(worst, relative);
    }
    console.log(
      `T824 totals (${many.length} matches × ${REPLICATES} attributions, ${diffs.size} slot·class cells, z ${z.toFixed(2)})`,
      { worstRelative: worst, beyond3Percent: cells.sort(), failures },
    );
    expect(failures).toEqual([]);
  });
});
