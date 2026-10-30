export { aptitudeLabel } from '../../../../packages/engine/src/career-assessment';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { recentClubResults } from '../../../../packages/engine/src/recent-results';
import { RECENT_RESULT_LIMIT } from '../../../../packages/contracts/src/recent-results';
import { npcTactic } from '../../../../packages/engine/src/tactics';

export function resultFor(f: Fixture, club: string) {
  if (!f.score || (f.home !== club && f.away !== club)) return undefined;
  const own = f.home === club ? f.score.home : f.score.away;
  const other = f.home === club ? f.score.away : f.score.home;
  const result: '승' | '무' | '패' = own > other ? '승' : own === other ? '무' : '패';
  return { own, other, result };
}

/**
 * What the manager's report on the next match reads (→WEB-11): both sides' last ten results, the
 * opponent's manager and shape, and our last ten meetings. Both clubs use the same retained,
 * cross-season results, supplied by the worker even when the rival plays in another league.
 */
export function matchBriefing(w: World) {
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (club) => club.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  if (!next || !opponent) return undefined;
  return {
    next,
    opponent,
    home: next.home === w.playerClub,
    tactic: npcTactic(opponent),
    ownRecent: recentClubResults(w, w.playerClub),
    theirRecent: recentClubResults(w, opponent.id),
    meetings: w.ownMatches
      .filter(
        (f) => (f.home === opponent.id || f.away === opponent.id) && resultFor(f, w.playerClub),
      )
      .slice(-RECENT_RESULT_LIMIT),
  };
}
