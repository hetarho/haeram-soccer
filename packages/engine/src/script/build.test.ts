import { describe, expect, it } from 'vitest';
import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import { careerWorld } from '../career.testkit';
import type { DecideRule } from '../grid/rules';
import { eraRules } from '../grid/setup';
import { ownLeagueClubs } from '../index';
import { prepareMatch } from '../match';
import { SCRIPTED_RELEASE } from '../match-model-release';
import {
  aggregateRecord,
  matchdayRosters,
  playAggregate,
  type AggregateMatch,
} from '../aggregate/engine';
import { traceAggregate } from '../aggregate/trace';
import { matchDetail, recordOf } from './build';
import { detailIssues } from './detail';

// Every row counts back to the record (→MATCH-27, MATCH-38, T825): fixtures between clubs nobody
// owns on two scripted-model worlds, a modern one and one of 1975's single substitute, a third of
// them knockout ties. The sample is chosen by a fixed search over the candidates in order: each
// candidate that brings an incident, scene or tactic the sample still lacks joins it, then the
// first others fill it to 60.
const REVISION = SCRIPTED_RELEASE.revision;
const SAMPLE = 60;
const CANDIDATES = 900;
const KNOCKOUT: DecideRule = { awayGoals: false };
const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const FEATURES = [
  'sub',
  'injuryReplaced',
  'injuryUnreplaced',
  'straightRed',
  'secondYellow',
  'penaltyScored',
  'penaltyMissed',
  'directFreeKick',
  'extraTime',
  'shootout',
  ...TACTICS.flatMap((t) => [`home:${t}`, `away:${t}`]),
];

function pool(seed: string, year: number) {
  const w: World = careerWorld({ seed }, SCRIPTED_RELEASE);
  const league = new Set(ownLeagueClubs(w).map((c) => c.id));
  const fixtures = w.fixtures.filter(
    (f) => f.home !== w.playerClub && f.away !== w.playerClub && !league.has(f.home),
  );
  return { w, fixtures, year };
}

function featuresOf(match: AggregateMatch): Set<string> {
  const out = new Set<string>();
  const { incidents } = match.participation;
  for (const x of incidents) {
    if (x.kind === 'sub') out.add('sub');
    if (x.kind === 'red') out.add('straightRed');
    if (x.kind === 'secondYellow') out.add('secondYellow');
    if (x.kind === 'injury')
      out.add(
        incidents.some((y) => y.kind === 'sub' && y.side === x.side && y.player === x.player)
          ? 'injuryReplaced'
          : 'injuryUnreplaced',
      );
  }
  for (const side of match.facts.ledger.sides)
    for (const s of side.shots) {
      if (s.kind === 'penalty') out.add(s.outcome === 'goal' ? 'penaltyScored' : 'penaltyMissed');
      if (s.kind === 'freeKick' && s.source < 0) out.add('directFreeKick');
    }
  if (match.facts.length === 120) out.add('extraTime');
  if (match.shootout) out.add('shootout');
  out.add(`home:${match.input.sides[0].tactic}`);
  out.add(`away:${match.input.sides[1].tactic}`);
  return out;
}

function sample() {
  const worlds = [pool('script-detail-2024', 2024), pool('script-detail-1975', 1975)];
  const kept: ReturnType<typeof play>[] = [],
    rest: ReturnType<typeof play>[] = [];
  const have = new Set<string>();
  function play(i: number) {
    const { w, fixtures, year } = worlds[i % 2]!;
    const base = fixtures[Math.floor(i / 2) % fixtures.length]!;
    const f: Fixture = { ...base, id: `${base.id}:detail:${i}`, year };
    const decide = i % 3 === 0 ? KNOCKOUT : undefined;
    const prepared = prepareMatch(w, f);
    const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
    const match = playAggregate(w, f, prepared, rosters, decide);
    return { f, rosters, match };
  }
  for (let i = 0; i < CANDIDATES; i++) {
    if (have.size === FEATURES.length && kept.length + rest.length >= SAMPLE) break;
    const played = play(i);
    const brings = [...featuresOf(played.match)].filter((x) => !have.has(x));
    if (brings.length > 0) {
      kept.push(played);
      for (const x of brings) have.add(x);
    } else rest.push(played);
  }
  return {
    chosen: [...kept, ...rest].slice(0, Math.max(SAMPLE, kept.length)),
    missing: FEATURES.filter((x) => !have.has(x)),
  };
}

describe('the own match’s detail (→MATCH-38, T825)', () => {
  it('every row counts back to the record', () => {
    const { chosen, missing } = sample();
    expect(missing).toEqual([]);
    expect(chosen.length).toBeGreaterThanOrEqual(SAMPLE);
    const seen = new Set<string>();
    let rows = 0;
    for (const { f, rosters, match } of chosen) {
      for (const x of featuresOf(match)) seen.add(x);
      expect(match.plan.placed).toBe(true);
      const detail = matchDetail(match, rosters, traceAggregate(match));
      expect(detailIssues(detail), f.id).toEqual([]);
      rows += detail.events.length;
      const record = aggregateRecord(f, rosters, match, REVISION);
      const back = recordOf(detail);
      expect(back.score, f.id).toEqual(record.score);
      expect(back.metrics, f.id).toEqual(record.metrics);
      expect(back.detail, f.id).toEqual(record.detail);
      expect(back.players, f.id).toEqual(record.players);
      expect(back.xg, f.id).toEqual(record.xg);
      expect(back.incidents, f.id).toEqual(record.incidents);
      expect(back.regulation, f.id).toEqual(record.regulation);
      expect(back.shootout, f.id).toEqual(record.shootout);
      expect(detail.added, f.id).toEqual(record.added);
    }
    expect([...seen].sort()).toEqual([...FEATURES].sort());
    console.log(`T825 detail: ${chosen.length} matches, ${rows} event rows`);
  });
});
