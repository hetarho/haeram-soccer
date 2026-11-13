/** Live squads of the playable associations (→WORLD-16). Reads never generate a new person. */
import type { Club, Player, World } from '../../contracts/src/types';
import { continuousSquad } from './npc-continuity';
import { coachingGrade } from './aptitude';
import { clubManager } from './managerMarket';
import { openEmployment, retainPerson } from './person-careers';
import { compareIds, integer, random, zeroMetrics } from './primitives';
import { facilityStage } from './club-value';
import { lineOf } from './player';
import { formationOf } from './player-state';
import { clubStyle } from './tactics';
import {
  generatedPlayer,
  invalidateNpcSquad,
  invalidateNpcSquads,
  lineup,
  NPC_SQUAD,
  selectionValue,
  squadPlaceAge,
  squadPlaces,
} from './world';
import { message } from '../../contracts/src/messages';

/** Initial levels depend on division and the fixed founding stature, never current results. */
export const CLUB_LEVELS = {
  founding: facilityStage,
  coachingAbility: [30, 40, 50, 60, 70, 80],
  /** Level points per season of income invested; T866 calibrates these starting values. */
  investment: 0.5,
  /** Level points lost in a season without investment. */
  decay: 0.05,
} as const;

export function enrollSquadPlayer(w: World, c: Club, p: Player) {
  if ((coachingGrade(p) ?? 0) < 4) return;
  retainPerson(w, p, c.id);
  openEmployment(w, p.id, 'player', c.id);
}

/** Founds only an absent registry, on this world's first day, including later-year test worlds. */
export function foundSquads(w: World) {
  for (const c of w.clubs) {
    if (c.representative || c.id === w.playerClub || c.levels) continue;
    const stage = CLUB_LEVELS.founding(w, c);
    c.levels = {
      academy: stage.academyFacility,
      ground: stage.trainingGround,
      coaching: stage.trainingGround,
    };
  }
  if (w.squads !== undefined) return;
  // Read all legacy affiliations before installing the registry. Its presence changes roster reads.
  const adopting = w.people !== undefined || !!w.freeAgents?.length;
  const founding = w.clubs
    .filter((c) => !c.representative && c.id !== w.playerClub)
    .map((c) => ({ c, players: continuousSquad(w, c) }));
  w.squads = {};
  for (const { c, players } of founding) {
    const style = clubStyle(c),
      places = squadPlaces(style),
      retained = players.length;
    while (players.length < NPC_SQUAD.size) {
      const extra = players.length - places.length,
        place = places[11 + (extra % (places.length - 11))]!,
        age = squadPlaceAge(w.seed, c.id, w.year + 1, 11 + (extra % (places.length - 11))).age,
        id = `${c.id}:founding:${w.year}:${extra}`;
      const p = generatedPlayer(
        c.country,
        w.seed,
        id,
        w.year,
        c.strength,
        place.position,
        age,
        c.tier,
        place.role,
      );
      p.fatigue = players[0]!.fatigue;
      players.push(p);
    }
    for (const [i, p] of players.entries()) {
      if (!adopting || i >= retained)
        p.until = w.year + integer(random(`${w.seed}:${p.id}:contract`), 1, 5);
      enrollSquadPlayer(w, c, p);
    }
    w.squads[c.id] = players;
    if (adopting) invalidateNpcSquads(w);
    else invalidateNpcSquad(w, c.id);
  }
}

/** The eleven in formation order, then line cover in squadPlaces order, with any spare best last. */
export function matchdaySquad(w: World, c: Club, players: Player[]): Player[] {
  const style = clubStyle(c),
    manager = clubManager(w, c);
  const chosen = lineup(players, style, manager, w.year);
  const used = new Set(chosen.map((p) => p.id));
  for (const place of squadPlaces(style).slice(chosen.length)) {
    const remaining = players.filter((p) => !used.has(p.id));
    const line = remaining.filter((p) => lineOf(p.position) === lineOf(place.position));
    const slot = formationOf(style).find((s) => s.position === place.position)!;
    const next = (line.length ? line : remaining).sort(
      (a, b) =>
        selectionValue(b, slot, manager, w.year) - selectionValue(a, slot, manager, w.year) ||
        compareIds(a.id, b.id),
    )[0];
    if (!next) break;
    chosen.push(next);
    used.add(next.id);
  }
  return chosen;
}

/** Move the live record; the owner's departed row remains only his history with the club. */
export function moveSquadPlayer(w: World, p: Player, club?: string, source?: string) {
  if (!w.squads) return;
  // Academy enrollment records the club affiliation without promoting the prospect.
  if (club === w.playerClub && w.academy?.players.some((q) => q.id === p.id)) return;
  const live = structuredClone(p);
  live.status = 'active';
  // A market settlement already knows the source; avoid scanning every other club for each move.
  const origins = source ? [[source, w.squads[source] ?? []] as const] : Object.entries(w.squads);
  for (const [id, players] of origins) {
    if (!players.some((q) => q.id === p.id)) continue;
    // An idempotent affiliation update is not a roster change.
    if (id === club) return;
    w.squads[id] = players.filter((q) => q.id !== p.id);
    invalidateNpcSquad(w, id);
  }
  const prior = w.players.findIndex((q) => q.id === p.id);
  if (club === w.playerClub) {
    const out = w.discipline?.out
      .filter((o) => o.player === p.id)
      .sort((a, b) => b.until.year - a.until.year || b.until.day - a.until.day)[0];
    if (out)
      live.injury = {
        year: out.until.year,
        day: out.until.day,
        label: message('copy.Pitch.0e9e3ce22b'),
      };
    if (prior >= 0) {
      live.career = [...w.players[prior]!.career];
      if (w.players[prior]!.graduate) live.graduate = true;
      // Most signing callers already inserted their live record and retain that reference.
      Object.assign(p, live);
      w.players[prior] = p;
    } else {
      Object.assign(p, live);
      w.players.push(p);
    }
  } else {
    if (prior >= 0) w.players[prior]!.status = 'sold';
    if (club && w.squads[club]) {
      live.career = zeroMetrics();
      live.season = zeroMetrics();
      w.squads[club] = [...w.squads[club], live];
      if (!w.people?.[live.id])
        enrollSquadPlayer(
          w,
          w.clubs.find((c) => c.id === club)!,
          live,
        );
      invalidateNpcSquad(w, club);
    }
  }
  if (club && w.freeAgents?.some((q) => q.id === p.id))
    w.freeAgents = w.freeAgents.filter((q) => q.id !== p.id);
  if (club && w.discipline) {
    w.discipline.bans = w.discipline.bans.map((b) => (b.player === p.id ? { ...b, club } : b));
    w.discipline.out = w.discipline.out.map((o) => (o.player === p.id ? { ...o, club } : o));
  }
}
