import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDay, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { npcTactic } from '../../../../packages/engine/src/strategy';
import { ownLeagueIds, orderIds } from './league';

export function resultFor(f: Fixture, club: string) {
  if (!f.score || (f.home !== club && f.away !== club)) return undefined;
  const own = f.home === club ? f.score.home : f.score.away;
  const other = f.home === club ? f.score.away : f.score.home;
  return { own, other, result: own > other ? '승' : own === other ? '무' : '패' };
}

export function scoutOpponent(w: World) {
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (club) => club.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  if (!next || !opponent) return undefined;
  const ids = ownLeagueIds(w);
  const sameLeague = ids.includes(opponent.id);
  const form = sameLeague
    ? w.fixtures
        .filter(
          (f) =>
            f.year === w.year &&
            (f.kind === 'league' || f.kind === 'lower') &&
            ids.includes(f.home) &&
            ids.includes(f.away) &&
            resultFor(f, opponent.id),
        )
        .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id))
        .slice(-5)
    : [];
  const meetings = w.ownMatches
    .slice(-30)
    .filter(
      (f) => (f.home === opponent.id || f.away === opponent.id) && resultFor(f, w.playerClub),
    );
  const table = sameLeague ? w.tables[opponent.id] : undefined;
  return {
    next,
    opponent,
    tactic: npcTactic(opponent),
    form,
    meetings,
    table,
    rank: table?.played ? orderIds(ids, w.tables).indexOf(opponent.id) + 1 : undefined,
    sameLeague,
  };
}
