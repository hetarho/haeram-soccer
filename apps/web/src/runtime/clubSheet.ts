import type { World } from '../../../../packages/contracts/src/types';
import type { ClubSheetFacts } from '../../../../packages/contracts/src/owner';
import { squad } from '../../../../packages/engine/src/world';
import { overall } from '../../../../packages/engine/src/player-state';
import { clubManager } from '../../../../packages/engine/src/managerMarket';
import { facilityStage } from '../../../../packages/engine/src/club-value';
import { stadiumCapacity } from '../../../../packages/engine/src/facility-model';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { archivedFinish } from '../../../../packages/engine/src/club-past';

/** Last finishes a sheet lists, newest first. */
const SHEET_SEASONS = 5;

/**
 * The sheet of `clubId` in a world nobody owns yet (→WEB-15, ECON-38): its fielded squad, the
 * manager who stays with it, its stadium at the stage it would be bought with, its honours over
 * the archived seasons and its last finishes. Undefined for a club the world does not hold.
 */
export function clubSheetFacts(w: World, clubId: string): ClubSheetFacts | undefined {
  const index = w.clubs.findIndex((club) => club.id === clubId);
  const club = w.clubs[index];
  if (!club) return undefined;
  const manager = clubManager(w, club);
  const stage = facilityStage(w, club);
  let league = 0,
    cup = 0,
    europe = 0;
  const seasons: ClubSheetFacts['history']['seasons'] = [];
  for (const season of w.history) {
    for (const champion of season.champions) {
      if (champion.club === clubId) league++;
      if (champion.cup === clubId) cup++;
    }
    europe += season.europe.filter((entry) => entry.winner === clubId).length;
    const finish = archivedFinish(w, season.standings, index);
    if (finish) seasons.push({ year: season.year, division: finish.tier, place: finish.place });
  }
  return {
    ...(club.identity ? { crest: club.identity.crest } : {}),
    squad: squad(w, club).map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      age: w.year - player.born,
      ovr: overall(player),
    })),
    manager: {
      name: manager.name,
      age: manager.born !== undefined ? w.year - manager.born : 0,
      rating: manager.ability,
      ...(manager.style ? { note: STYLE_INFO[manager.style].label } : {}),
    },
    stadium: { seats: stadiumCapacity(stage) },
    history: { league, cup, europe, seasons: seasons.reverse().slice(0, SHEET_SEASONS) },
  };
}
