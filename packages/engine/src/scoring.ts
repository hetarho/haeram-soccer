import type {
  Fixture,
  GoalScorerSeason,
  MatchPlayback,
  SeasonArchive,
  World,
} from '../../contracts/src/types';
import { currentDay } from './calendar';
import { compareIds } from './primitives';
import { clubOf } from './world';

function competitionKey(w: World) {
  const club = clubOf(w);
  return w.lower ? 'lower' : `${club.country}:${club.tier}:${club.group}`;
}

export function prepareScorers(w: World) {
  w.scorerSeason = {
    year: w.year,
    groupKey: competitionKey(w),
    trackedSinceRound: w.round + 1,
    players: [],
    history: [],
  };
  snapshotScorers(w);
}

export function ensureScorers(w: World) {
  if (
    !w.scorerSeason ||
    w.scorerSeason.year !== w.year ||
    w.scorerSeason.groupKey !== competitionKey(w)
  )
    prepareScorers(w);
}

export function isScoringFixture(w: World, fixture: Fixture) {
  return (
    (fixture.kind === 'league' || fixture.kind === 'lower') &&
    fixture.year === w.year &&
    fixture.groupKey === competitionKey(w)
  );
}

export function rankedScorers(season: GoalScorerSeason) {
  return season.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.goals > 0)
    .sort(
      (a, b) =>
        b.player.goals - a.player.goals ||
        a.player.appearances - b.player.appearances ||
        compareIds(a.player.id, b.player.id),
    );
}

/**
 * The league's ten leading scorers of the season, for its archive. A table tracked only from a
 * later round (an older save) is not the season's record, so it keeps none.
 */
export function archivedScorers(w: World): SeasonArchive['scorers'] {
  const season = w.scorerSeason;
  if (
    !season ||
    season.year !== w.year ||
    season.groupKey !== competitionKey(w) ||
    season.trackedSinceRound !== 1
  )
    return undefined;
  const index = new Map(w.clubs.map((club, i) => [club.id, i]));
  return rankedScorers(season)
    .filter(({ player }) => index.has(player.club))
    .slice(0, 10)
    .map(({ player }) => ({
      name: player.name,
      club: index.get(player.club)!,
      ...(player.clubs
        ? { clubs: player.clubs.map((part) => ({ ...part, club: index.get(part.club)! })) }
        : {}),
      position: player.position,
      goals: player.goals,
      appearances: player.appearances,
    }));
}

/**
 * Contributions share the exact goal events used by highlights, including background games; every
 * record line that played counts one appearance for its side.
 */
export function recordScorers(w: World, playback: MatchPlayback) {
  if (!isScoringFixture(w, playback.record)) return;
  const season = w.scorerSeason!;
  const members = new Map(
    playback.squads.flatMap((squad, side) => squad.map((p) => [p.id, { p, side }] as const)),
  );
  const indices = new Map(season.players.map((player, index) => [player.id, index]));
  for (const { id, metrics } of playback.record.players) {
    if (!(metrics[10]! > 0)) continue;
    const member = members.get(id);
    if (!member) throw new Error('득점 기록의 선수가 경기 명단에 없습니다.');
    const player = member.p;
    const club = member.side === 0 ? playback.record.home : playback.record.away;
    let index = indices.get(id);
    if (index === undefined) {
      index = season.players.length;
      indices.set(id, index);
      season.players.push({
        id,
        name: player.name,
        club,
        position: player.position,
        goals: 0,
        appearances: 0,
      });
    }
    const scorer = season.players[index];
    if (scorer.club !== club) {
      scorer.clubs ??= [
        { club: scorer.club, goals: scorer.goals, appearances: scorer.appearances },
      ];
      scorer.club = club;
    }
    if (scorer.clubs) {
      let contribution = scorer.clubs.find((part) => part.club === club);
      if (!contribution) {
        contribution = { club, goals: 0, appearances: 0 };
        scorer.clubs.push(contribution);
      }
      contribution.goals += metrics[0];
      contribution.appearances++;
    }
    scorer.goals += metrics[0];
    scorer.appearances++;
  }
}

export function snapshotScorers(w: World) {
  const season = w.scorerSeason;
  if (!season) return;
  season.history = [
    ...season.history.filter((snapshot) => snapshot.round !== w.round),
    {
      round: w.round,
      day: currentDay(w),
      rows: rankedScorers(season).map(({ player, index }) => [
        index,
        player.goals,
        player.appearances,
      ]),
    },
  ];
}
