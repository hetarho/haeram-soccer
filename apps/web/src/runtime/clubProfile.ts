import type {
  Club,
  Player,
  PlayerProfileRead,
  Staff,
  World,
} from '../../../../packages/contracts/src/types';
import type { ClubPost, ClubProfile } from '../../../../packages/contracts/src/owner';
import { continuousSquad } from '../../../../packages/engine/src/npc-continuity';
import { squad } from '../../../../packages/engine/src/world';
import { overall } from '../../../../packages/engine/src/player-state';
import { clubManager } from '../../../../packages/engine/src/managerMarket';
import { clubStaffMember } from '../../../../packages/engine/src/club-staff';
import { facilityStage } from '../../../../packages/engine/src/club-value';
import { stadiumCapacity } from '../../../../packages/engine/src/facility-model';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { archivedFinish } from '../../../../packages/engine/src/club-past';
import { CLUB_POSTS } from '../../../../packages/engine/src/staff-info';

/** Last finishes a profile lists, newest first. */
const PROFILE_SEASONS = 5;

/** A post as the 코치진 tab lists its holder: name, rating, age and career record. */
function postOf(
  w: World,
  post: ClubPost['post'],
  holder: Pick<Staff, 'name' | 'ability' | 'born' | 'person'>,
): ClubPost {
  return {
    post,
    name: holder.name,
    rating: Math.round(holder.ability),
    ...(holder.born !== undefined ? { age: w.year - holder.born } : {}),
    ...(holder.person ? { person: holder.person } : {}),
  };
}

/** Our 코치진: the manager and every post, a vacant one without a holder. */
function ownPosts(w: World): ClubPost[] {
  const staff = new Map((w.staff ?? []).map((member) => [member.role, member]));
  return CLUB_POSTS.map((post) => {
    const holder = post === 'manager' ? w.manager : staff.get(post);
    return holder ? postOf(w, post, holder) : { post };
  });
}

/**
 * The 코치진 of a club nobody owns (→STAFF-17, STAFF-49): its manager with his school, then its
 * named holder of every other post, none vacant.
 */
function clubPosts(w: World, club: Club): ClubPost[] {
  const manager = clubManager(w, club);
  return CLUB_POSTS.map((post) =>
    post === 'manager'
      ? {
          ...postOf(w, post, manager),
          ...(manager.style ? { note: STYLE_INFO[manager.style].label } : {}),
        }
      : postOf(w, post, clubStaffMember(w, club, post)),
  );
}

/**
 * The profile of `clubId` in `w` (→WEB-15, WEB-58): its fielded squad, 코치진, stadium at its
 * facility stage, its honours over the archived seasons and its last finishes. Undefined for a
 * club the world does not hold.
 */
export function clubProfile(w: World, clubId: string): ClubProfile | undefined {
  const index = w.clubs.findIndex((club) => club.id === clubId);
  const club = w.clubs[index];
  if (!club) return undefined;
  const staff = clubId === w.playerClub ? ownPosts(w) : clubPosts(w, club);
  let league = 0,
    cup = 0,
    europe = 0;
  const seasons: ClubProfile['history']['seasons'] = [];
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
    squad: squad(w, club)
      .map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        age: w.year - player.born,
        ovr: overall(player),
      }))
      .sort((a, b) => b.ovr - a.ovr),
    staff,
    stadium: { seats: stadiumCapacity(facilityStage(w, club)) },
    history: { league, cup, europe, seasons: seasons.reverse().slice(0, PROFILE_SEASONS) },
  };
}

/** Every supported identity link resolves without drawing a replacement for a persisted player. */
export function squadPlayer(
  w: World,
  playerId: string,
  clubId?: string,
): PlayerProfileRead | undefined {
  const record = w.playerRecords?.[playerId];
  const read = (
    player: Player,
    kind: PlayerProfileRead['kind'],
    club?: string,
  ): PlayerProfileRead =>
    structuredClone({
      player,
      kind,
      ...(club ? { club } : {}),
      lines: record?.lines ?? [],
      ...(kind === 'retired' && record?.retired
        ? {
            retired: {
              year: record.retired.year,
              ...(record.retired.club ? { club: record.retired.club } : {}),
            },
          }
        : {}),
    });
  const own = w.players.find((p) => p.id === playerId);
  if (own) return read(own, 'own', w.playerClub);
  const hinted = w.clubs.find((c) => c.id === clubId);
  const clubs = hinted ? [hinted, ...w.clubs.filter((c) => c !== hinted)] : w.clubs;
  for (const club of clubs) {
    if (club.id === w.playerClub || club.representative) continue;
    const players = w.squads === undefined ? continuousSquad(w, club) : (w.squads[club.id] ?? []);
    const player = players.find((p) => p.id === playerId);
    if (player) return read(player, 'squad', club.id);
  }
  const free = w.freeAgents?.find((p) => p.id === playerId);
  if (free) return read(free, 'free');
  if (record?.retired) return read(record.retired.profile, 'retired', record.retired.club);
  for (const club of clubs) {
    if (!club.representative) continue;
    const player = squad(w, club).find((p) => p.id === playerId);
    if (player) return read(player, 'representative', club.id);
  }
  return undefined;
}
