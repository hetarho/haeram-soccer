/** Live squads of the playable associations (→WORLD-16). Reads never generate a new person. */
import { hasPerson, personIdsWithPrefix } from './person-reads';
import type { Club, Player, World } from '../../contracts/src/types';
import { continuousSquad } from './npc-continuity';
import { coachingGrade } from './aptitude';
import { clubManager } from './managerMarket';
import { openEmployment, retainPerson } from './person-careers';
import { clamp, compareIds, integer, random, zeroMetrics } from './primitives';
import { MAX_LEVEL } from './facility-model';
import { facilityStage } from './club-value';
import { lineOf } from './player';
import { formationOf } from './player-state';
import { clubStyle } from './tactics';
import {
  generatedPlayer,
  joinClub,
  invalidateNpcSquad,
  invalidateNpcSquads,
  lineup,
  NPC_SQUAD,
  selectionValue,
  squadPlaceAge,
  squadPlaces,
  spreadLevels,
  spreadTerm,
} from './world';
import { message } from '../../contracts/src/messages';

/**
 * Academy, ground and coaching levels follow the club's division (→WORLD-17): each has a target,
 * its division's ladder value plus its stature's shift (`facilityStage`), at founding too.
 */
export const CLUB_LEVELS = {
  founding: facilityStage,
  coachingAbility: [30, 40, 50, 60, 70, 80],
  /** Level progress per season of income invested above the cash ceiling; T950 tunes it. */
  investment: 0.5,
  /** Progress toward the next level lost in a season without investment. */
  decay: 0.05,
  /**
   * How far above its target actual surplus investment holds a level. 0 from T950: a held level
   * lifted every lower division's intake and the divisions drifted 3–10 above their levels by 1965.
   */
  aboveTarget: 0,
  /** Levels a season a level moves toward its target, after promotion or relegation too. */
  moveAfterChange: 1,
} as const;

type LevelKey = 'academy' | 'ground' | 'coaching';
const LEVEL_KEYS: readonly LevelKey[] = ['academy', 'ground', 'coaching'];

/** Each level's target: its division's ladder value plus its stature's shift (→WORLD-17). */
export function levelTargets(w: World, c: Club): Record<LevelKey, number> {
  const stage = CLUB_LEVELS.founding(w, c);
  return {
    academy: stage.academyFacility,
    ground: stage.trainingGround,
    coaching: stage.trainingGround,
  };
}

/**
 * The books' close records a season's surplus investment in a club's levels (→WORLD-17, →ECON-36):
 * `spent` of `income` accumulates progress toward a level (at most one funded level a season),
 * a season without it lets the progress decay, and `invested` marks the season for
 * `followLevels`, which moves the levels once promotion and relegation are known.
 */
export function investLevels(c: Club, spent: bigint, income: bigint) {
  const levels = c.levels;
  if (!levels) return;
  const investing = spent > 0n;
  const share = investing && income > 0n ? Number((spent * 10000n) / income) / 10000 : 0;
  const progress = investing
    ? (levels.progress ?? 0) + share * CLUB_LEVELS.investment
    : Math.max(0, (levels.progress ?? 0) - CLUB_LEVELS.decay);
  levels.progress = Math.round(Math.min(1, progress) * 10000) / 10000;
  if (investing) levels.invested = true;
  else delete levels.invested;
}

/**
 * A season's move of a club's levels at the summer close, after promotion and relegation, so the
 * target is its new division's (→WORLD-17): a level below its target rises toward it, one above it
 * falls back, by at most `moveAfterChange` a season; a funded level (`investLevels`) lifts a level
 * at most `aboveTarget` above its target, held there while the club keeps investing.
 */
export function followLevels(w: World, c: Club) {
  const levels = c.levels;
  if (!levels) return;
  const investing = !!levels.invested,
    funded = (levels.progress ?? 0) >= 1;
  const targets = levelTargets(w, c),
    step = CLUB_LEVELS.moveAfterChange;
  for (const key of LEVEL_KEYS) {
    const target = targets[key],
      held = target + (investing ? CLUB_LEVELS.aboveTarget : 0),
      level = levels[key];
    const next =
      level < target
        ? Math.min(target, level + step)
        : level > held
          ? Math.max(held, level - step)
          : funded && level < held
            ? level + 1
            : level;
    levels[key] = clamp(next, 0, MAX_LEVEL);
  }
  if (funded) levels.progress = 0;
  delete levels.invested;
}

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
  // Existing people keep their identity even outside a reconstructed first team.
  const reserved = new Set([
    ...personIdsWithPrefix(w, ''),
    ...Object.keys(w.playerRecords ?? {}),
    ...w.players.map((p) => p.id),
    ...(w.academy?.players ?? []).map((p) => p.id),
    ...(w.freeAgents ?? []).map((p) => p.id),
    ...founding.flatMap(({ players }) => players.map((p) => p.id)),
  ]);
  w.squads = {};
  for (const { c, players } of founding) {
    const style = clubStyle(c),
      places = squadPlaces(style),
      retained = players.length;
    const starterTerms = players
      .slice(0, formationOf(style).length)
      .map((p) => spreadTerm(w.seed, p.id, w.year - p.born));
    while (players.length < NPC_SQUAD.size) {
      const extra = players.length - places.length,
        place = places[11 + (extra % (places.length - 11))]!,
        age = squadPlaceAge(w.seed, c.id, w.year + 1, 11 + (extra % (places.length - 11))).age;
      let suffix = extra,
        id = `${c.id}:founding:${w.year}:${suffix}`;
      while (reserved.has(id)) id = `${c.id}:founding:${w.year}:${++suffix}`;
      reserved.add(id);
      const p = generatedPlayer(
        c.country,
        w.seed,
        id,
        w.year,
        spreadLevels(
          c.strength,
          [...starterTerms, spreadTerm(w.seed, id, age)],
          starterTerms.length,
        )[starterTerms.length]!,
        place.position,
        age,
        c.tier,
        place.role,
      );
      p.fatigue = players[0]!.fatigue;
      players.push(p);
    }
    for (const [i, p] of players.entries()) {
      if (!adopting || i >= retained) {
        p.until = w.year + integer(random(`${w.seed}:${p.id}:contract`), 1, 5);
        joinClub(p, 'founding', w.year);
      }
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
    // Each candidate's value is read once, not again at every comparison.
    const next = (line.length ? line : remaining)
      .map((p) => ({ p, value: selectionValue(p, slot, manager, w.year) }))
      .sort((a, b) => b.value - a.value || compareIds(a.p.id, b.p.id))[0]?.p;
    if (!next) break;
    chosen.push(next);
    used.add(next.id);
  }
  return chosen;
}

/**
 * Move the live record; the owner's departed row remains only his history with the club. `source`
 * is the squad he leaves: a club id, null for none, undefined when unknown. Returns
 * the clubs whose matchday squad it chose again, so a caller need not repeat that work.
 */
export function moveSquadPlayer(
  w: World,
  p: Player,
  club?: string,
  source?: string | null,
): string[] {
  const chosenAgain: string[] = [];
  if (!w.squads) return chosenAgain;
  // Academy enrollment records the club affiliation without promoting the prospect.
  if (club === w.playerClub && w.academy?.players.some((q) => q.id === p.id)) return chosenAgain;
  const live = structuredClone(p);
  live.status = 'active';
  // A caller that knows the origin avoids scanning every other club for each move: a club id names
  // his squad, null states he is in none (a free agent); undefined is unknown and keeps the scan.
  const origins =
    source === null
      ? []
      : source
        ? [[source, w.squads[source] ?? []] as const]
        : Object.entries(w.squads);
  for (const [id, players] of origins) {
    if (!players.some((q) => q.id === p.id)) continue;
    // An idempotent affiliation update is not a roster change.
    if (id === club) return chosenAgain;
    w.squads[id] = players.filter((q) => q.id !== p.id);
    invalidateNpcSquad(w, id);
    chosenAgain.push(id);
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
      if (!hasPerson(w, live.id))
        enrollSquadPlayer(
          w,
          w.clubs.find((c) => c.id === club)!,
          live,
        );
      invalidateNpcSquad(w, club);
      chosenAgain.push(club);
    }
  }
  if (club && w.freeAgents?.some((q) => q.id === p.id))
    w.freeAgents = w.freeAgents.filter((q) => q.id !== p.id);
  if (club && w.discipline) {
    w.discipline.bans = w.discipline.bans.map((b) => (b.player === p.id ? { ...b, club } : b));
    w.discipline.out = w.discipline.out.map((o) => (o.player === p.id ? { ...o, club } : o));
  }
  return chosenAgain;
}
