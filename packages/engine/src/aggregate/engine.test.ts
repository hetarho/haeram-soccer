import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../../contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../../../contracts/src/match-model';
import type { Fixture, MatchRecord, World } from '../../../contracts/src/types';
import { M } from '../grid/record';
import { createWorld, ownLeagueClubs } from '../index';
import { INTERVAL_STAMPS, validateFullMatchRecord } from '../match-model';
import { eraRules } from '../grid/setup';
import { prepareMatch } from '../match';
import { matchdayRosters, playAggregate, simulateAggregate } from './engine';
import { rebalanceIssues, scoreBefore } from './participation';

/**
 * Fixtures between clubs nobody owns in a freshly founded world (→ARCH-21: a founding, no
 * seasons), each replayed under its own ID so every replay draws its own streams.
 */
function others(n: number, year?: number) {
  const w: World = createWorld({
    country: 'ENG',
    name: 'Aggregate Town',
    color: '#334466',
    seed: 'aggregate-engine',
    level: 'normal',
  });
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
