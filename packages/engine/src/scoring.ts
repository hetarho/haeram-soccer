import type { Fixture, GoalScorerSeason, MatchPlayback, World } from '../../contracts/src/types';
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

/** Contributions share the exact goal events used by highlights, including background games. */
export function recordScorers(w: World, playback: MatchPlayback) {
  if (!isScoringFixture(w, playback.record)) return;
  const season = w.scorerSeason!;
  const contributions = new Map(
    playback.record.players.map((player) => [player.id, player.metrics]),
  );
  const indices = new Map(season.players.map((player, index) => [player.id, index]));
  for (const side of [0, 1] as const) {
    const club = side === 0 ? playback.record.home : playback.record.away;
    for (const player of playback.squads[side]) {
      const metrics = contributions.get(player.id);
      if (!metrics) throw new Error('득점 기록에 경기 선수 지표가 없습니다.');
      let index = indices.get(player.id);
      if (index === undefined) {
        index = season.players.length;
        indices.set(player.id, index);
        season.players.push({
          id: player.id,
          name: player.name,
          club,
          role: player.role,
          goals: 0,
          appearances: 0,
        });
      }
      const scorer = season.players[index];
      scorer.goals += metrics[0];
      scorer.appearances++;
    }
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
