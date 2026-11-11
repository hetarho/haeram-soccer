/**
 * T825's sample of own-match details (→MATCH-38): fixtures between clubs nobody owns on two
 * scripted-model worlds, a modern one and one of 1975's single substitute, a third of them knockout
 * ties. The sample is chosen by a fixed search over the candidates in order: each candidate that
 * brings an incident, scene or tactic the sample still lacks joins it, then the first others fill
 * it to 60. Shared by the detail's test (build.test.ts) and the script's (sample.test.ts).
 */
import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import { careerWorld } from '../career.testkit';
import type { DecideRule } from '../grid/rules';
import { eraRules } from '../grid/setup';
import { ownLeagueClubs } from '../index';
import { prepareMatch } from '../match';
import { SCRIPTED_RELEASE } from '../match-model-release';
import { matchdayRosters, playAggregate, type AggregateMatch } from '../aggregate/engine';

export const SAMPLE = 60;
const CANDIDATES = 900;
const KNOCKOUT: DecideRule = { awayGoals: false };
const TACTICS: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
export const FEATURES = [
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

/** The incidents, scenes and tactics a match brings to the sample. */
export function featuresOf(match: AggregateMatch): Set<string> {
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

/** The sample's matches with their fixtures and rosters, and the features no candidate brought. */
export function detailSample() {
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
