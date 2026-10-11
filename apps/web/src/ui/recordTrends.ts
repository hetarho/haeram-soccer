import type { Club, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { eloOf, eloRank } from '../../../../packages/engine/src/ratings';
import { divisionName } from './careerRecords';
import { seasonName } from './format';
import { ownLeagueIds } from './league';

/**
 * Overall place in the country's pyramid: every club in the divisions above, then the rank; the
 * amateur league sits below the whole professional game (→HIST-12).
 */
export function pyramidPosition(code: string, h: Pick<SeasonArchive, 'tier' | 'rank'>) {
  const groups = country(code).groups;
  let above = 0;
  for (let tier = 0; tier < Math.min(h.tier, groups.length); tier++)
    above += groups[tier].reduce((sum, size) => sum + size, 0);
  return above + h.rank;
}

/**
 * One season on the league position chart: "1987/88 · 2부 B조 3위 · 승점 71 · 피라미드 23위",
 * then 우승 for a first place and 승격 or 강등 when the next season (after the last archive, the
 * division played now) is a higher or lower division.
 */
export function leaguePositionDetail(
  code: string,
  seasons: readonly SeasonArchive[],
  index: number,
  tierNow: number,
) {
  const h = seasons[index],
    next = seasons[index + 1]?.tier ?? tierNow;
  return [
    seasonName(h.year),
    `${divisionName(code, h.tier, h.group)} ${h.rank}위`,
    `승점 ${h.points}`,
    `피라미드 ${pyramidPosition(code, h)}위`,
    ...(h.rank === 1 ? ['우승'] : []),
    ...(next < h.tier ? ['승격'] : next > h.tier ? ['강등'] : []),
  ].join(' · ');
}

/**
 * One season on the Elo chart: "1987/88 · Elo 1530 · 전체 412위", then the league's and the world's
 * spread (highest first) for seasons that recorded it.
 */
export function eloDetail(h: SeasonArchive) {
  const range = h.eloRange;
  return [
    seasonName(h.year),
    `Elo ${Math.round(h.elo ?? 0)}`,
    ...(h.eloRank ? [`전체 ${h.eloRank}위`] : []),
    ...(range ? [`리그 ${range[3]}–${range[2]}`, `세계 ${range[1]}–${range[0]}`] : []),
  ].join(' · ');
}

/** A club with its rounded Club Elo. */
export interface RatedClub {
  club: Club;
  elo: number;
}

function extremes(clubs: readonly Club[]) {
  let high = clubs[0],
    low = clubs[0];
  for (const c of clubs) {
    if (eloOf(c) > eloOf(high)) high = c;
    if (eloOf(c) < eloOf(low)) low = c;
  }
  const rated = (club: Club): RatedClub => ({ club, elo: Math.round(eloOf(club)) });
  return { high: rated(high), low: rated(low) };
}

/**
 * Where our Club Elo stands today, from every club's live rating: the world rank among all clubs,
 * the world's and our league's highest and lowest clubs, and the gap to our league's highest.
 */
export function eloStanding(w: World) {
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  const ids = new Set(ownLeagueIds(w));
  const league = w.clubs.filter((c) => ids.has(c.id));
  const elo = Math.round(eloOf(own)),
    leagueSpread = extremes(league.length ? league : [own]);
  return {
    elo,
    rank: eloRank(w),
    total: w.clubs.length,
    world: extremes(w.clubs),
    league: leagueSpread,
    leagueSize: Math.max(1, league.length),
    gap: elo - leagueSpread.high.elo,
  };
}
