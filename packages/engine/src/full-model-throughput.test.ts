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
/**
 * The settled football facts of a candidate world: scores, own records, ledger and discipline. A
 * record's manager-tenure link (→HIST-18) is attribution, not football, so it is left out.
 */
const facts = (w: World) => ({
  scores: w.fixtures.filter((f) => f.score).map((f) => [f.id, f.score]),
  ownMatches: w.ownMatches.map((m) => {
    const { managerTenure: _tenure, ...football } = m;
    void _tenure;
    return football;
  }),
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
 * weights only up to 70 m, its block not following a ball upfield; fed163154634471c before),
 * T345's (the candidate's score state: a lead protected at 0.5 and a deficit chased at 1.6 a goal;
 * 554eb98852d175c8 before) and T348's (the defending scene keeps its marks, zones and goal after a
 * delivery's kick; 41061a91531de1d7 before). T358's portable grid math (the candidate's `exp`,
 * `sin`, `cos`, `atan2`, `hypot` and integer powers built from IEEE basic operations) left both
 * digests unchanged on darwin-arm64. T365's side share (a side's skills keep 0.8 of its distance
 * from the match's level) and possession's runs ×2.5 past halfway changed the candidate rounds
 * (aggregate records unchanged), re-recorded with its calibration artifact; c1b53321ff63cd81
 * before. T323's aggregate changes (who won each failed pass's loose ball, on a stream of its own;
 * passes, completion, through balls, progressive carries, shot scale and place, xG kind and
 * spread recalibrated toward MATCH-30) changed both, re-recorded with both calibration artifacts
 * (the grid untouched, so the candidate rounds moved through their aggregate fixtures);
 * a3c1c7230ca5bc28 and 3be456505f08231a before. T367's urgent pairing (a set-piece marker is taken,
 * never moved to another runner) left both digests unchanged: the two rounds' own grid matches
 * settled the same facts. So did T373's (a delivered taker is no carrier for the kick's update
 * while the ball is in the air). T369's aggregate box flows (passes aimed into the box from wide played
 * wide of it, lateral passes beside the box kept on the flank, the cut-back zones played inward
 * less, the box shot rate, territory and touchline outs recalibrated, forwards' shot share 2.2 →
 * 2.0) changed both again, re-recorded on T367's merged tree with the aggregate calibration
 * artifact (the grid untouched by T369); 4f190f1b1d803d86 and 53d5f04e2624eb4e before. T326's
 * speed-ups (attribution splits into reused buffers, cached move traits, action weights and
 * presence, the skill access indexed by line, a substitute's slot levels read on demand) left
 * both digests unchanged. T370's grid shot selection in the box and the tactics' build-up
 * interceptions changed the candidate rounds (aggregate records unchanged), re-recorded with its
 * calibration artifact; 0e9f347a953ed3e1 before. T371's grid restarts, finishers and balanced
 * block changed the candidate rounds again (aggregate records unchanged); c1e07cfffabede5d before.
 * T384's offside calls by the receiver's own 판단력 changed both: on the grid the call, on the
 * aggregate path the share of failed passes ending offside (0.064 / 0.32) and the receivers they
 * are credited to; d6a5c7feb76176f3 and 29d9bb53ba9487ea before. T397's through-ball count (a
 * receiver not yet past the line) and its balls in behind, first touches and cut-backs changed the
 * candidate rounds only (the aggregate path untouched); 294f1d9b278a1461 before. T398's late box
 * runs and shot scale changed them again; 8fd84923e38c3aa5 before.
 */
const BEFORE = {
  aggregateRecords: 'a8d299718d0919a0',
  candidateRounds: '93e1b3f124830eb1',
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
