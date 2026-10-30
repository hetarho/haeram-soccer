export { aptitudeLabel } from '../../../../packages/engine/src/career-assessment';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDay, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { npcTactic } from '../../../../packages/engine/src/tactics';
import { clubManager } from '../../../../packages/engine/src/managerMarket';

export function resultFor(f: Fixture, club: string) {
  if (!f.score || (f.home !== club && f.away !== club)) return undefined;
  const own = f.home === club ? f.score.home : f.score.away;
  const other = f.home === club ? f.score.away : f.score.home;
  return { own, other, result: own > other ? '승' : own === other ? '무' : '패' };
}

/** Settled fixtures in the order they were played: season, then match day. */
function byDate(a: Fixture, b: Fixture) {
  return a.year - b.year || fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id);
}

/**
 * What the manager's report on the next match reads (→WEB-11): both sides' last ten results, the
 * opponent's manager and shape, and our last ten meetings. Only settled fixtures the view holds
 * count, so a rival from another league shows its cup ties and its games against us.
 */
export function matchBriefing(w: World) {
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (club) => club.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  if (!next || !opponent) return undefined;
  const known = new Map<string, Fixture>();
  for (const f of [
    ...w.fixtures,
    ...(w.cups ?? []).flatMap((cup) => cup.fixtures),
    ...w.europe.flatMap((tournament) => tournament.fixtures),
    ...w.ownMatches,
  ])
    if (resultFor(f, opponent.id)) known.set(f.id, f);
  return {
    next,
    opponent,
    home: next.home === w.playerClub,
    manager: clubManager(w, opponent),
    tactic: npcTactic(opponent),
    ownRecent: w.ownMatches.filter((f) => resultFor(f, w.playerClub)).slice(-10),
    theirRecent: [...known.values()].sort(byDate).slice(-10),
    meetings: w.ownMatches
      .filter(
        (f) => (f.home === opponent.id || f.away === opponent.id) && resultFor(f, w.playerClub),
      )
      .slice(-10),
  };
}
