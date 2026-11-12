import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../../contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import type { Fixture, MatchRecord, World } from '../../../contracts/src/types';
import { M } from '../match/record';
import { ownLeagueClubs } from '../index';
import { INTERVAL_STAMPS, validateFullMatchRecord } from '../match-model';
import { eraRules } from '../match/rules';
import { prepareMatch } from '../match';
import {
  aggregateAddedTime,
  aggregatePlan,
  aggregateRecord,
  aggregateSkillAccess,
  matchdayRosters,
  playAggregate,
  settleParticipation,
  simulateAggregate,
} from './engine';
import { AGGREGATE_CONFIG } from './config';
import { buildAggregateInput } from './input';
import { ledgerIssues } from './ledger';
import { rebalanceIssues, scoreBefore } from './participation';
import { aggregateStreams } from './team';
import type { AggregateParticipation, AggregateSkillAccess } from './types';
import { careerWorld } from '../career.testkit';

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
const CUP = { awayGoals: false } as const;
/** The input's accessor before a plan exists: the planner reads no skill. */
const UNREAD: AggregateSkillAccess = {
  skill: () => {
    throw new Error('no skill before the plan');
  },
  finishing: () => 0,
  targetChance: () => 0,
};
const linesOf = (r: MatchRecord, side: 0 | 1) =>
  side === 0 ? r.players.slice(0, r.lineCounts![0]) : r.players.slice(r.lineCounts![0]);

describe('aggregate match (→MATCH-22, MATCH-26, MATCH-27)', () => {
  it('reconciles full player and team totals', () => {
    const { w, fixtures } = others(60);
    for (const f of fixtures) {
      const { record, frames, squads } = simulateAggregate(w, f);
      expect(validateFullMatchRecord(record)).toEqual([]);
      expect(record.model).toBe(MATCH_MODEL_REVISION);
      expect(frames).toEqual([]);
      expect(record.added).toHaveLength(2);
      for (const side of [0, 1] as const) {
        const lines = linesOf(record, side);
        expect(lines.slice(0, 11).map((l) => l.id)).toEqual(
          squads[side].slice(0, 11).map((p) => p.id),
        );
        // Every counter of the team row is someone's: goals, shots, passes, tackles, saves.
        for (const index of [M.goals, M.shots, M.passes, M.tackles, M.saves])
          expect(lines.reduce((n, l) => n + l.metrics[index]!, 0)).toBe(
            record.metrics[side][index],
          );
        expect(lines.reduce((n, l) => n + l.detail![PD.keyPasses]!, 0)).toBe(
          record.detail![side][TD.keyPasses],
        );
      }
    }
  });

  it('never credits an unavailable or off-pitch player', () => {
    const { w, fixtures } = others(30);
    const f = fixtures[0]!;
    const before = simulateAggregate(w, f);
    // Ban the home side's best-placed striker and injure an away starter for this fixture.
    const banned = before.squads[0][10]!;
    const hurt = before.squads[1][5]!;
    const unavailable: World = {
      ...w,
      discipline: {
        year: f.year,
        yellows: {},
        bans: [
          { player: banned.id, club: f.home, matches: 1, scope: 'domestic', reason: 'violent' },
        ],
        out: [{ player: hurt.id, club: f.away, until: { year: f.year + 1, day: 300 } }],
      },
    };
    const after = simulateAggregate(unavailable, f);
    const ids = new Set(after.record.players.map((p) => p.id));
    const named = after.squads.flat().map((p) => p.id);
    expect(named).not.toContain(banned.id);
    expect(named).not.toContain(hurt.id);
    expect(ids.has(banned.id) || ids.has(hurt.id)).toBe(false);
    expect(validateFullMatchRecord(after.record)).toEqual([]);
    // Off the pitch: nobody who did not play has a line, and every line played.
    for (const g of fixtures) {
      const { record, squads } = simulateAggregate(w, g);
      const lineIds = new Set(record.players.map((p) => p.id));
      for (const p of record.players) expect(p.metrics[M.minutes]).toBeGreaterThan(0);
      const entered = new Set(
        (record.incidents ?? []).filter((x) => x.kind === 'sub').map((x) => x.other),
      );
      for (const side of [0, 1] as const)
        for (const p of squads[side].slice(11)) expect(lineIds.has(p.id)).toBe(entered.has(p.id));
    }
  });

  it('keeps regulation and shootout scores separate', () => {
    const { w, fixtures } = others(160);
    let extra = 0,
      shootouts = 0;
    for (const f of fixtures) {
      const league = simulateAggregate(w, f).record;
      const cup = simulateAggregate(w, f, CUP).record;
      expect(validateFullMatchRecord(cup)).toEqual([]);
      if (league.score.home !== league.score.away) {
        // A decided tie plays exactly the same 90 minutes.
        expect(cup.score).toEqual(league.score);
        expect(cup.regulation).toBeUndefined();
        continue;
      }
      extra++;
      // Extra time extends the same match: its first 90 minutes are the league result.
      expect(cup.regulation).toEqual(league.score);
      expect(cup.added).toHaveLength(4);
      expect(cup.metrics[0][M.minutes]).toBe(120);
      if (cup.score.home === cup.score.away) {
        shootouts++;
        expect(cup.shootout).toBeDefined();
        expect(cup.shootout!.home).not.toBe(cup.shootout!.away);
        // The kicks are not goals: the score and the scorers stay the 120-minute ones.
        const goals = cup.players.reduce((n, p) => n + p.metrics[M.goals]!, 0);
        expect(goals).toBe(cup.score.home + cup.score.away);
      } else expect(cup.shootout).toBeUndefined();
    }
    expect(extra).toBeGreaterThan(10);
    expect(shootouts).toBeGreaterThan(2);
  });

  it('returns identical facts on repeated calls', () => {
    const { w, fixtures } = others(6);
    const first = fixtures.map((f) => simulateAggregate(w, f, CUP).record);
    // Another order, other fixtures in between: no draw depends on what ran before.
    const again = [...fixtures].reverse().map((f) => simulateAggregate(w, f, CUP).record);
    expect(again.reverse()).toEqual(first);
  });

  it('answers a red card only when level or ahead', () => {
    // World fixtures: the team facts move with the answer, which synthetic skills hardly show.
    const { w, fixtures } = others(400, 2024);
    let made = 0,
      withheld = 0;
    fixtures.forEach((f, i) => {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      const decide = i % 4 === 0 ? CUP : undefined;
      const match = playAggregate(w, f, prepared, rosters, decide);
      // Neither a rebalance made while trailing nor one withheld while level or ahead (→STAFF-45).
      expect(rebalanceIssues(match.participation, match.facts)).toEqual([]);
      for (const x of match.participation.rebalances ?? []) {
        const score = scoreBefore(match.facts, x.side, x.minute);
        if (x.made) {
          made++;
          expect(score).toBeGreaterThanOrEqual(0);
        } else {
          withheld++;
          expect(score).toBeLessThan(0);
        }
      }
      // A fixture drawn again settles on the same retry streams every time.
      if (match.retry > 0) {
        const again = playAggregate(w, f, prepared, rosters, decide);
        expect(again.retry).toBe(match.retry);
        expect(again.facts).toEqual(match.facts);
      }
    });
    expect(made).toBeGreaterThan(0);
    expect(withheld).toBeGreaterThan(0);
  });

  it('settles a fixture that exhausts its red-card retries', () => {
    // Forced: one decision set and no retry, so an answer the score contradicts cannot be searched
    // away; a fixture never aborts the world for it.
    const { w, fixtures } = others(400, 2024);
    const tight = { rebalanceSearches: 1, rebalanceRetries: 0 };
    const play = (f: Fixture, limits?: typeof tight) => {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      return { rosters, match: playAggregate(w, f, prepared, rosters, undefined, limits) };
    };
    const f = fixtures.find((f) => play(f, tight).match.unreconciled)!;
    expect(f).toBeDefined();
    const { rosters, match } = play(f, tight);
    // The last retry's searched plan with the fewest disagreeing answers, listed, as a valid record.
    expect(match.retry).toBe(0);
    expect(match.unreconciled!.length).toBeGreaterThan(0);
    expect(match.unreconciled).toEqual(rebalanceIssues(match.participation, match.facts));
    expect(validateFullMatchRecord(aggregateRecord(f, rosters, match))).toEqual([]);
    // The same settlement on every call.
    const again = play(f, tight).match;
    expect(again.facts).toEqual(match.facts);
    expect(again.participation).toEqual(match.participation);
    expect(again.players).toEqual(match.players);
    // The configured search reconciles the same fixture.
    const settled = play(f).match;
    expect(settled.unreconciled).toBeUndefined();
    expect(rebalanceIssues(settled.participation, settled.facts)).toEqual([]);
  });

  it('settles an exhausted cup tie at 120 minutes on the earliest of tied plans', () => {
    // A cup tie level after 90 minutes whose 120-minute stretch has two searched plans that each
    // leave one red-card answer against the score. With two searches and no retry the fallback
    // settles the earlier of the tied plans. The fixture is the first replay of this world under
    // the kernel's settings whose tie goes to 120 minutes and leaves one answer so: a rare one
    // (T284: index 1209 of 3,000; T323's retune: 296; T369's box flows: 1408, the first of three in
    // 12,000 with 2370 and 3292; T400's score state and levels: 2431, with 2450 and 2596; revision
    // 3's named-manager context: 231; the free agents' refilled squads: 711, the only one in
    // 6,000; T805's age ladder: 711 again), searched for here since retuning or the squads move the
    // draws. The search checks both plans: an exhausted tie whose second plan leaves two answers
    // settles its first by fewer answers, not as the earlier of tied plans (T805 made index 483 one).
    const { w, fixtures } = others(12_000, 2024);
    const tight = { rebalanceSearches: 2, rebalanceRetries: 0 };
    const setUp = (f: Fixture) => {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      return { prepared, rosters, match: playAggregate(w, f, prepared, rosters, CUP, tight) };
    };
    // The two plans the search reaches: the 90's answers, then the earliest reached answer flipped.
    const searched = (f: Fixture, { prepared, rosters }: ReturnType<typeof setUp>) => {
      const base = buildAggregateInput(prepared, UNREAD, rosters);
      const plan = aggregatePlan(w, prepared, rosters, eraRules(f.year));
      const access = (p: AggregateParticipation) => aggregateSkillAccess(prepared, rosters, p);
      const streams = aggregateStreams(w.seed, f.id);
      const last = { searches: tight.rebalanceSearches, settle: true };
      const ninety = settleParticipation(base, plan, streams, 90, access, undefined, last)!;
      const one = { searches: 1, settle: true };
      const first = settleParticipation(base, plan, streams, 120, access, ninety.decisions, one)!;
      const [earliest] = [...first.participation.rebalances!].sort((a, b) => a.minute - b.minute);
      const flipped = new Map(first.decisions).set(earliest!.key, !earliest!.made);
      const second = settleParticipation(base, plan, streams, 120, access, flipped, one)!;
      return { first, second };
    };
    const tied = (f: Fixture) => {
      const played = setUp(f);
      if (played.match.facts.length !== 120 || played.match.unreconciled?.length !== 1)
        return false;
      const { first, second } = searched(f, played);
      return first.unreconciled?.length === 1 && second.unreconciled?.length === 1;
    };
    const f = fixtures.map((x): Fixture => ({ ...x, kind: 'cup' })).find(tied)!;
    expect(f).toBeDefined();
    const played = setUp(f);
    const { prepared, rosters, match } = played;
    expect(match.facts.length).toBe(120);
    expect(match.retry).toBe(0);
    expect(match.unreconciled).toHaveLength(1);
    expect(match.unreconciled).toEqual(rebalanceIssues(match.participation, match.facts));
    const { first, second } = searched(f, played);
    expect(second.unreconciled).toHaveLength(first.unreconciled!.length);
    expect(second.decisions).not.toEqual(first.decisions);
    expect(match.decisions).toEqual(first.decisions);
    expect(match.facts).toEqual(first.facts);
    // A valid record with its regulation score, settled the same on every call.
    const record = aggregateRecord(f, rosters, match);
    expect(record.regulation).toBeDefined();
    expect(record.regulation!.home).toBe(record.regulation!.away);
    expect(validateFullMatchRecord(record)).toEqual([]);
    expect(playAggregate(w, f, prepared, rosters, CUP, tight).facts).toEqual(match.facts);
    // The configured search reconciles the same tie.
    const settled = playAggregate(w, f, prepared, rosters, CUP);
    expect(settled.unreconciled).toBeUndefined();
    expect(rebalanceIssues(settled.participation, settled.facts)).toEqual([]);
  });

  it("draws each side's cards, injuries and stoppages on its own streams", () => {
    // A shared stream made both sides booked, hurt and changed in the same minutes.
    const { w, fixtures } = others(200, 2024);
    let compared = 0,
      same = 0;
    for (const f of fixtures) {
      const incidents = simulateAggregate(w, f).record.incidents ?? [];
      for (const kinds of [['yellow', 'secondYellow', 'red'], ['injury'], ['sub']]) {
        const at = (side: 0 | 1) =>
          incidents
            .filter((x) => x.side === side && kinds.includes(x.kind))
            .map((x) => x.minute)
            .join(',');
        if (at(0) === '' || at(1) === '') continue;
        compared++;
        if (at(0) === at(1)) same++;
      }
    }
    expect(compared).toBeGreaterThan(200);
    expect(same / compared).toBeLessThan(0.05);
  });

  it('plays wide of the box, along the flank and out of the cut-back zones as configured (T369)', () => {
    const { w, fixtures } = others(30);
    const C = AGGREGATE_CONFIG as unknown as {
      forward: { outside: number };
      lateral: { flankIntoBox: number; cutBackInward: number };
    };
    const kept = { outside: C.forward.outside, lateral: { ...C.lateral } };
    const band = (c: number) => Math.floor(c / 5),
      lane = (c: number) => c % 5;
    const inBox = (c: number) => band(c) >= 6 && lane(c) % 4 !== 0;
    const tally = () => {
      const n = { aimedIn: 0, wide: 0, flankIn: 0, along: 0, inward: 0 };
      for (const f of fixtures) {
        const prepared = prepareMatch(w, f);
        const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
        const match = playAggregate(w, f, prepared, rosters);
        expect(ledgerIssues(match.facts.ledger)).toEqual([]);
        expect(validateFullMatchRecord(aggregateRecord(f, rosters, match))).toEqual([]);
        for (const side of match.facts.ledger.sides)
          for (const m of side.moves) {
            if (m.setPiece) continue;
            const ahead = band(m.to) > band(m.from);
            const pass = m.kind === 'short' || m.kind === 'long';
            if (pass && ahead && lane(m.from) !== 2 && !inBox(m.from)) {
              if (inBox(m.to)) n.aimedIn += m.attempts;
              else if (band(m.to) >= 6) n.wide += m.attempts;
            }
            const flank = band(m.from) >= 6 && lane(m.from) % 4 === 0;
            if (flank && band(m.to) === band(m.from) && m.kind !== 'cross') {
              if (inBox(m.to)) n.flankIn += m.attempts;
              else if (m.to === m.from && pass) n.along += m.attempts;
            }
            const cutBackZone = band(m.from) === 7 && (lane(m.from) === 1 || lane(m.from) === 3);
            if (cutBackZone && m.kind === 'cutBack') n.inward += m.attempts;
          }
      }
      return n;
    };
    try {
      // At one end every pass aimed into the box from wide goes wide of it, every lateral pass
      // beside the box stays on the flank and none goes inward from a cut-back zone.
      C.forward.outside = 1;
      Object.assign(C.lateral, { flankIntoBox: 0, cutBackInward: 0 });
      const none = tally();
      expect(none).toMatchObject({ aimedIn: 0, flankIn: 0, inward: 0 });
      expect(none.wide).toBeGreaterThan(0);
      expect(none.along).toBeGreaterThan(0);
      // At the other end nothing is played wide of the box or along the flank instead.
      C.forward.outside = 0;
      Object.assign(C.lateral, { flankIntoBox: 1, cutBackInward: 1 });
      const all = tally();
      expect(all.along).toBe(0);
      expect(all.aimedIn).toBeGreaterThan(0);
      expect(all.flankIn).toBeGreaterThan(0);
      expect(all.inward).toBeGreaterThan(0);
    } finally {
      C.forward.outside = kept.outside;
      Object.assign(C.lateral, kept.lateral);
    }
  });

  it('produces valid man-short records in eras without substitutes', () => {
    for (const year of [1950, 1966, 1990, 2024]) {
      const { w, fixtures } = others(40, year);
      let subs = 0;
      for (const f of fixtures) {
        const { record } = simulateAggregate(w, f);
        expect(validateFullMatchRecord(record)).toEqual([]);
        subs += (record.incidents ?? []).filter((x) => x.kind === 'sub').length;
      }
      if (year === 1950) expect(subs).toBe(0);
      else expect(subs).toBeGreaterThan(0);
    }
  });
});

describe('the shared validator against corrupted aggregate records (→MATCH-27)', () => {
  const { w, fixtures } = others(80, 2024);
  const records = fixtures.map((f) => simulateAggregate(w, f, CUP).record);
  const clone = (r: MatchRecord) => structuredClone(r);
  const find = (test: (r: MatchRecord) => boolean) => {
    const r = records.find(test);
    if (!r) throw new Error('no fixture of that kind in the sample');
    return clone(r);
  };
  const has = (kind: string) => (r: MatchRecord) =>
    (r.incidents ?? []).some((x) => x.kind === kind);
  const corruptions: [string, () => MatchRecord][] = [
    [
      'a goal moved to a player without the shot',
      () => {
        const r = find((x) => x.score.home > 0);
        const scorer = linesOf(r, 0).find((l) => l.metrics[M.goals]! > 0)!;
        const other = linesOf(r, 0).find((l) => l.metrics[M.shots] === 0)!;
        scorer.metrics[M.goals]!--;
        other.metrics[M.goals]!++;
        return r;
      },
    ],
    [
      'an assist without the key pass',
      () => {
        const r = find((x) => x.metrics[0][M.assists]! > 0);
        const line = linesOf(r, 0).find((l) => l.detail![PD.keyPasses] === 0)!;
        const assister = linesOf(r, 0).find((l) => l.metrics[M.assists]! > 0)!;
        assister.metrics[M.assists]!--;
        line.metrics[M.assists]!++;
        return r;
      },
    ],
    [
      'a player row that no longer adds up',
      () => {
        const r = clone(records[0]!);
        r.players[3]!.metrics[M.passes]! += 1;
        return r;
      },
    ],
    [
      'a counter beyond the team definition',
      () => {
        const r = clone(records[1]!);
        r.players[2]!.detail![PD.crossesCompleted] = r.players[2]!.detail![PD.crosses]! + 1;
        return r;
      },
    ],
    [
      'player xG that is not the shots’',
      () => {
        const r = find((x) => x.metrics[0][M.shots]! > 0);
        linesOf(r, 0).find((l) => l.metrics[M.shots]! > 0)!.detail![PD.xg]! += 40;
        return r;
      },
    ],
    [
      'minutes past the stamped exit',
      () => {
        const r = find(has('sub'));
        const sub = r.incidents!.find((x) => x.kind === 'sub')!;
        r.players.find((p) => p.id === sub.player)!.metrics[M.minutes] = 90;
        return r;
      },
    ],
    [
      'a card after a dismissal',
      () => {
        const r = find((x) => has('red')(x) || has('secondYellow')(x));
        const red = r.incidents!.find((x) => x.kind === 'red' || x.kind === 'secondYellow')!;
        r.incidents!.push({
          minute: r.metrics[0][M.minutes]!,
          side: red.side,
          kind: 'yellow',
          player: red.player,
        });
        r.detail![red.side][TD.yellowCards]!++;
        return r;
      },
    ],
    [
      'a card outside match time',
      () => {
        const r = find(has('yellow'));
        r.incidents!.find((x) => x.kind === 'yellow')!.minute = 130;
        return r;
      },
    ],
    [
      'a substitute who never came on',
      () => {
        const r = find(has('sub'));
        r.incidents = r.incidents!.filter(
          (x) => x.kind !== 'sub' || x !== r.incidents!.find((y) => y.kind === 'sub'),
        );
        return r;
      },
    ],
    [
      'an injured player still playing',
      () => {
        const r = find(has('injury'));
        const x = r.incidents!.find((y) => y.kind === 'injury')!;
        r.players.find((p) => p.id === x.player)!.metrics[M.minutes] = r.metrics[0][M.minutes]!;
        return r;
      },
    ],
    [
      'a shoot-out added to the score',
      () => {
        const r = find((x) => !!x.shootout);
        r.score.home += r.shootout!.home;
        return r;
      },
    ],
    [
      'a red card count that disagrees with the timeline',
      () => {
        const r = clone(records[2]!);
        r.detail![1][TD.redCards]! += 1;
        return r;
      },
    ],
    [
      'a card moved to another player',
      () => {
        // The side's total still adds up; only the booked line no longer matches the incidents.
        const r = find(has('yellow'));
        const x = r.incidents!.find((y) => y.kind === 'yellow')!;
        const lines = linesOf(r, x.side);
        const booked = lines.find((l) => l.id === x.player)!;
        const other = lines.find((l) => l.detail![PD.yellowCards] === 0)!;
        booked.detail![PD.yellowCards]!--;
        other.detail![PD.yellowCards]!++;
        return r;
      },
    ],
    [
      'a fourth in-play window',
      () => {
        // A change that shared a stoppage (or the interval) moves one minute on into a fourth one.
        const windows = (r: MatchRecord, side: 0 | 1) =>
          new Set(
            (r.incidents ?? [])
              .filter((x) => x.side === side && x.kind === 'sub' && !INTERVAL_STAMPS.has(x.minute))
              .map((x) => x.minute),
          );
        for (const record of records)
          for (const side of [0, 1] as const) {
            const used = windows(record, side);
            if (used.size !== 3) continue;
            const r = clone(record);
            const incidents = r.incidents!;
            const shift = incidents.find(
              (x) =>
                x.side === side &&
                x.kind === 'sub' &&
                x.minute < 90 &&
                !used.has(x.minute + 1) &&
                (INTERVAL_STAMPS.has(x.minute) ||
                  incidents.some(
                    (y) => y !== x && y.kind === 'sub' && y.side === side && y.minute === x.minute,
                  )) &&
                !incidents.some(
                  (y) =>
                    y !== x &&
                    y.side === side &&
                    (y.minute === x.minute || y.minute === x.minute + 1) &&
                    [y.player, y.other].some((id) => id === x.player || id === x.other),
                ),
            );
            const incoming = r.players.find((p) => p.id === shift?.other);
            if (!shift || !incoming || incoming.metrics[M.minutes]! < 2) continue;
            shift.minute++;
            r.players.find((p) => p.id === shift.player)!.metrics[M.minutes]!++;
            incoming.metrics[M.minutes]!--;
            r.incidents = incidents
              .map((x, order) => ({ x, order }))
              .sort((a, b) => a.x.minute - b.x.minute || a.order - b.order)
              .map(({ x }) => x);
            expect(validateFullMatchRecord(r).join('; ')).toMatch(/windows/);
            return r;
          }
        throw new Error('no side with three in-play windows and a shared change in the sample');
      },
    ],
  ];
  for (const [name, corrupt] of corruptions)
    it(`rejects ${name}`, () => {
      expect(validateFullMatchRecord(corrupt()).length).toBeGreaterThan(0);
    });
});

describe('the score state (MATCH-22 r22, T400)', () => {
  const SS = AGGREGATE_CONFIG.scoreState as {
    segments: number;
    volume: number;
    risk: number;
    cap: number;
  };
  /** Runs `body` with the score state set as given, then puts it back. */
  const withState = <T>(set: Partial<typeof SS>, body: () => T): T => {
    const kept = { ...SS };
    Object.assign(SS, set);
    try {
      return body();
    } finally {
      Object.assign(SS, kept);
    }
  };
  /** Each regulation segment's open-play shots by the side ahead and the side behind at its start. */
  const sharesBehind = (fixtures: Fixture[], w: World) => {
    let ahead = 0,
      behind = 0;
    for (const f of fixtures) {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      const { facts } = playAggregate(w, f, prepared, rosters);
      const shots = facts.ledger.sides.map((side) =>
        side.shots.filter((x) => x.period === 'regulation' && x.kind === 'open'),
      );
      const span = 90 / 6;
      const goals = [0, 0];
      for (let k = 0; k < 6; k++) {
        const lo = k * span,
          hi = (k + 1) * span;
        const lead = goals[0]! - goals[1]!;
        const n = shots.map((list) => list.filter((x) => x.minute > lo && x.minute <= hi).length);
        if (lead !== 0) {
          const [up, down] = lead > 0 ? [n[0]!, n[1]!] : [n[1]!, n[0]!];
          ahead += up;
          behind += down;
        }
        shots.forEach((list, side) => {
          goals[side]! += list.filter(
            (x) => x.outcome === 'goal' && x.minute > lo && x.minute <= hi,
          ).length;
        });
      }
    }
    return behind / Math.max(1, ahead + behind);
  };

  it("a side behind takes a larger share of the later segments' shots than a side ahead", () => {
    const { w, fixtures } = others(160);
    const without = withState({ segments: 1, volume: 0, risk: 0 }, () => sharesBehind(fixtures, w));
    const segmented = withState({ segments: 6, volume: 0.35, risk: 0 }, () =>
      sharesBehind(fixtures, w),
    );
    expect(segmented).toBeGreaterThan(0.5);
    expect(segmented).toBeGreaterThan(without + 0.05);
  });

  it('segmented matches reconcile goals, contributors and minutes exactly', () => {
    const { w, fixtures } = others(60);
    withState({ segments: 6, volume: 0.3, risk: 0.2 }, () => {
      for (const f of fixtures) {
        const { record } = simulateAggregate(w, f);
        expect(validateFullMatchRecord(record)).toEqual([]);
        for (const side of [0, 1] as const) {
          const lines = linesOf(record, side);
          for (const index of [M.goals, M.shots, M.passes])
            expect(lines.reduce((n, l) => n + l.metrics[index]!, 0)).toBe(
              record.metrics[side][index],
            );
        }
        expect(record.metrics[0][M.goals]! + record.metrics[1][M.goals]!).toBe(
          record.score.home + record.score.away,
        );
        for (const h of record.highlights)
          expect(h.minute).toBeLessThanOrEqual(record.regulation ? 120 : 90);
      }
    });
  });
});

describe('aggregate added time and second cautions (T409)', () => {
  const withConfig = <T>(set: () => () => void, body: () => T): T => {
    const restore = set();
    try {
      return body();
    } finally {
      restore();
    }
  };
  it("credits the aggregate's own added seconds to each period within ADDED_CONFIG's bounds", () => {
    const { w, fixtures } = others(20, 2024);
    let longer = 0;
    for (const f of fixtures) {
      const prepared = prepareMatch(w, f);
      const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
      const { facts, participation } = playAggregate(w, f, prepared, rosters);
      const base = aggregateAddedTime(facts, participation.incidents);
      const extra = withConfig(
        () => {
          const kept = [...AGGREGATE_CONFIG.addedSeconds];
          (AGGREGATE_CONFIG.addedSeconds as unknown as number[]).splice(0, 4, 60, 120, 0, 0);
          return () => (AGGREGATE_CONFIG.addedSeconds as unknown as number[]).splice(0, 4, ...kept);
        },
        () => aggregateAddedTime(facts, participation.incidents),
      );
      // A minute more in the first half and two in the second, short of each period's bound.
      expect(extra[0]! - base[0]!).toBeGreaterThanOrEqual(0);
      expect(extra[0]! - base[0]!).toBeLessThanOrEqual(1);
      expect(extra[1]! - base[1]!).toBeGreaterThanOrEqual(0);
      expect(extra[1]! - base[1]!).toBeLessThanOrEqual(2);
      if (extra[1]! > base[1]!) longer++;
    }
    expect(longer).toBeGreaterThan(0);
  });

  it("scales each side's second cautions by its tactic's factor", () => {
    const { w, fixtures } = others(300, 2024);
    const seconds = (factor: number) =>
      withConfig(
        () => {
          const T = AGGREGATE_CONFIG.tactics as Record<string, { secondYellow: number }>;
          const kept = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.secondYellow]));
          for (const v of Object.values(T)) v.secondYellow = factor;
          return () => {
            for (const [k, v] of Object.entries(kept)) T[k]!.secondYellow = v;
          };
        },
        () =>
          fixtures.reduce((n, f) => {
            const { record } = simulateAggregate(w, f);
            return n + (record.incidents ?? []).filter((x) => x.kind === 'secondYellow').length;
          }, 0),
      );
    expect(seconds(0)).toBe(0);
    expect(seconds(3)).toBeGreaterThan(seconds(1));
  });
});
