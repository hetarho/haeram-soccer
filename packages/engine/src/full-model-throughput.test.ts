/**
 * T285's throughput work keeps every football fact (→ARCH-5, ARCH-31, MATCH-27): the optimised
 * aggregate path settles exactly the records and ledgers the source before it settled, a fixture's
 * facts never depend on which fixtures were played before it, and per-match caches follow the
 * lineup, availability and tactic of the fixture being played. No wall-clock assertion here; the
 * timings live in scripts/match-model-baseline.ts and docs/benchmarks/full-model-throughput.json.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Fixture, MatchRecord, Tactic, World } from '../../contracts/src/types';
import { simulateAggregate } from './aggregate/engine';
import { currentDay } from './calendar';
import { activePlayers, ownStarters } from './index';
import { advanceRound } from './season';
import { founded } from './season.testkit';
import { lineupPreset, setLineup } from './strategy';
import { withCandidateModel } from '../../../tests/fixtures/worlds';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const own = (w: World, f: Fixture) => f.home === w.playerClub || f.away === w.playerClub;
/** The first fixtures without the own club, in round and ID order. */
const npcFixtures = (w: World, n: number) =>
  w.fixtures
    .filter((f) => !own(w, f))
    .sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1))
    .slice(0, n);
/** The settled football facts of a candidate world: scores, own records, ledger and discipline. */
const facts = (w: World) => ({
  scores: w.fixtures.filter((f) => f.score).map((f) => [f.id, f.score]),
  ownMatches: w.ownMatches,
  npcSeason: w.npcSeason,
  discipline: w.discipline,
});

/**
 * Digests of the current football, so later semantics-preserving work can prove it unchanged: the
 * aggregate records recorded on 3679af8 before T285's changes and the candidate rounds on d5d6a87
 * after T321 (T285's optimisations gave the same digests on top of them), both re-recorded by T322,
 * whose MATCH-13 counting rules (cut-backs from MATCH-14's zone, through balls and line-breaking
 * passes where the players stand, restarts read in the pass zones) change recorded counters but no
 * outcome. A change that alters football outcomes refreshes them together with the calibration
 * evidence (T284's report), never alone; T324's candidate behaviour and recalibration changed the
 * candidate rounds again (aggregate records unchanged), re-recorded at its integration. T327's
 * counting rules (MATCH-3 r19 possession as the share of attempted passes; MATCH-13 r18 high
 * turnovers from every open-play ball won and PPDA over tackles, interceptions, challenges and
 * fouls) changed both digests' counters, not their outcomes: scores, xG, incidents, passes, shots
 * and discipline gave the same digests before and after it. T334's candidate counter behaviour
 * (settled directness, a higher back-line floor) changed the candidate rounds (aggregate records
 * unchanged), re-recorded with its calibration artifact; so did T336's (counter's settled pass
 * weights only up to 70 m, its block not following a ball upfield; fed163154634471c before).
 */
const BEFORE = {
  aggregateRecords: 'a3c1c7230ca5bc28',
  candidateRounds: '554eb98852d175c8',
};

describe('complete-result throughput (T285)', () => {
  it('settles exactly the records and ledgers of the source before the optimisations', () => {
    const w = founded(2024);
    const records = npcFixtures(w, 40).map((f) => simulateAggregate(w, f).record);
    const c = withCandidateModel(founded(2024));
    advanceRound(c, undefined, false);
    advanceRound(c, undefined, false);
    expect(c.npcSeason?.competitions.length).toBeGreaterThan(0);
    expect({ aggregateRecords: digest(records), candidateRounds: digest(facts(c)) }).toEqual(
      BEFORE,
    );
  });

  it('plays a fixture to the same record whatever was played before it', () => {
    const w = founded(2024);
    const list = npcFixtures(w, 12);
    const forward = list.map((f) => simulateAggregate(w, f).record);
    const fresh = founded(2024);
    const backward = [...list].reverse().map((f) => simulateAggregate(fresh, f).record);
    expect(backward.reverse()).toEqual(forward);
    // Playing it again changes nothing either.
    expect(list.map((f) => simulateAggregate(w, f).record)).toEqual(forward);
  });

  it('follows lineup, availability and tactic changes like a fresh world', () => {
    const w = founded(2024);
    const f = w.fixtures
      .filter((x) => own(w, x) && (x.kind === 'league' || x.kind === 'lower'))
      .sort((a, b) => a.round - b.round)[0]!;
    const side = f.home === w.playerClub ? 0 : 1;
    const play = (world: World) => simulateAggregate(world, f);
    /** The world's result now equals that of a copy with no cached state. */
    const settled = () => {
      const p = play(w);
      expect(p.record).toEqual(play(structuredClone(w)).record);
      return p;
    };
    const ids = (r: MatchRecord) => r.players?.map((p) => p.id);
    const first = settled();

    // Lineup: the strongest XI with its last starter swapped for a fit player on the bench.
    const xi = lineupPreset(w, 'strongest', f);
    const bench = activePlayers(w).find((p) => !xi.includes(p.id))!;
    setLineup(w, [...xi.slice(0, 10), bench.id]);
    expect(ownStarters(w, f).map((p) => p.id)).toContain(bench.id);
    const rested = settled();
    expect(rested.squads[side].map((p) => p.id)).not.toEqual(first.squads[side].map((p) => p.id));

    // Availability: an injured starter gives way.
    const hurt = ownStarters(w, f)[5]!;
    hurt.injury = { year: w.year, day: currentDay(w) + 30, label: '테스트 부상' };
    const injured = settled();
    expect(injured.squads[side].map((p) => p.id)).not.toContain(hurt.id);
    expect(ids(injured.record)).not.toContain(hurt.id);

    // Tactic: the own side plays the new one.
    const tactic: Tactic = w.tactic === 'press' ? 'counter' : 'press';
    w.tactic = tactic;
    const pressed = settled();
    expect(pressed.record.tactics?.[side]).toBe(tactic);
    expect(pressed.record).not.toEqual(injured.record);
  });
});
