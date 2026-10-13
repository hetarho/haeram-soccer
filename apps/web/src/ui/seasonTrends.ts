import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { fixtureDay } from '../../../../packages/engine/src/calendar';
import { resultFor } from './scouting';
import { observedRate } from './matchAnalysis';

export function matchSplit(
  records: MatchRecord[],
  club: string,
  venue: 'all' | 'home' | 'away' = 'all',
) {
  const matches = records.filter(
    (m) =>
      resultFor(m, club) &&
      (venue === 'all' || (venue === 'home' ? m.home === club : m.away === club)),
  );
  let won = 0,
    drawn = 0,
    lost = 0,
    gf = 0,
    ga = 0,
    passes = 0,
    completed = 0,
    shots = 0,
    onTarget = 0;
  for (const m of matches) {
    const result = resultFor(m, club)!,
      metrics = m.metrics[m.home === club ? 0 : 1];
    if (result.result === '승') won++;
    else if (result.result === '무') drawn++;
    else lost++;
    gf += result.own;
    ga += result.other;
    passes += metrics[2];
    completed += metrics[3];
    shots += metrics[4];
    onTarget += metrics[5];
  }
  return {
    played: matches.length,
    won,
    drawn,
    lost,
    gf,
    ga,
    goalsPerMatch: matches.length ? gf / matches.length : undefined,
    pass: observedRate(completed, passes),
    shot: observedRate(onTarget, shots),
  };
}
/**
 * The season match by match in playing order (→WEB-54): league points and the goal difference as
 * they built up. Points count only league matches (the amateur league included); the goal
 * difference counts every match given.
 */
export function seasonProgress(records: MatchRecord[], club: string) {
  let points = 0,
    difference = 0;
  return records
    .filter((m) => resultFor(m, club))
    .slice()
    .sort((a, b) => a.year - b.year || fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id))
    .map((record) => {
      const result = resultFor(record, club)!,
        league = record.kind === 'league' || record.kind === 'lower';
      if (league) points += result.own > result.other ? 3 : result.own === result.other ? 1 : 0;
      difference += result.own - result.other;
      return { record, result, league, points, difference };
    });
}
