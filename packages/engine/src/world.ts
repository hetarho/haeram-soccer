import { message as sourceMessage } from '../../contracts/src/messages';
import { continuousSquad } from './npc-continuity';
import { generateQualities } from './aptitude';
import { COUNTRIES, country } from '../../catalogs/src/index';
import type {
  Club,
  Fixture,
  Line,
  Manager,
  ManagerStyle,
  Player,
  Position,
  RoleId,
  World,
  Tactic,
} from '../../contracts/src/types';
import { clamp, hash, integer, random, zeroMetrics, compareIds } from './primitives';
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
import { coachProspect, MANAGER_CAREER } from './coaching';
import { isBanned, isUnavailable } from './discipline';
import { MARKET_BANDS, STYLE_INFO, YOUTH_SELECTION_BONUS } from './styles';
import { divisionFor, drawAgent, marketWageAt } from './contracts';
import { quote } from './quotes';
import {
  adaptationStart,
  generateProfile,
  LINE_MINIMUM,
  lineOf,
  type Joined,
  type Slot,
} from './player';
export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;
import { TACTICS, clubStyle } from './tactics';
export { TACTICS, tacticLabel, clubStyle } from './tactics';
import {
  clubOf,
  activePlayers,
  overall,
  lineOfPlayer,
  UNHAPPY_PENALTY,
  unhappyPenalty,
  playingAbility,
  ownMultiplier,
  cohesionMultiplier,
  slotOvr,
  formationOf,
  FRESH_FATIGUE,
  fatigueLoad,
} from './player-state';
export {
  clubOf,
  activePlayers,
  overall,
  lineOfPlayer,
  UNHAPPY_PENALTY,
  unhappyPenalty,
  playingAbility,
  ownMultiplier,
  cohesionMultiplier,
  slotOvr,
  formationOf,
  FRESH_FATIGUE,
  fatigueLoad,
};

/** Where a player joining the club starts to settle (→PLAYER-11). */
export function joinClub(p: Player, joined: Joined, year: number) {
  p.joined = year;
  p.adaptation = adaptationStart(p.personality.adaptability, joined);
  p.clubRounds = 0;
  delete p.unsettled;
  delete p.positionStarts;
}
export { quote, footballQuote, broadcastQuote } from './quotes';
/**
 * A name from his country's pools (→WORLD-12). It always takes two draws of `r`, so neither the
 * pools nor a squad's `surname` shift the draws behind his other attributes.
 */
export function personName(code: string, r: () => number, surname?: number) {
  const c = country(code);
  const given = c.given[integer(r, 0, c.given.length - 1)],
    drawn = integer(r, 0, c.family.length - 1);
  return `${given} ${c.family[surname === undefined ? drawn : surname % c.family.length]}`;
}
/** A prime step through a surname pool; no pool's size is a multiple of it (→WORLD-12). */
export const SURNAME_STRIDE = 97;
/**
 * The surname place of a generated squad's member (→WORLD-12): consecutive keys step by
 * SURNAME_STRIDE from the club's own start, so any run of keys shorter than the pool is distinct.
 */
export const squadSurname = (seed: string, club: string, key: number) =>
  hash(`${seed}:${club}:surnames`) + key * SURNAME_STRIDE;
/**
 * A generated player at his market wage (→CLUB-25) in `division`, the tier of the club he plays
 * for; without one, the division his ability suits. His agent (→CLUB-30) is the last draw of his
 * own stream, so it leaves every other attribute as it was. A generated squad's member takes his
 * `surname` place (→WORLD-12).
 */
export function makePlayer(
  code: string,
  seed: string,
  id: string,
  year: number,
  rating: number,
  position: Position,
  age = integer(random(id), 18, 32),
  division?: number,
  role?: RoleId,
  surname?: number,
): Player {
  const r = random(`${seed}:${id}`);
  // The profile has a stream of its own, so the name, potential and agent stay as they were drawn.
  const profile = generateProfile(
    random(`${seed}:player:${id}`),
    position,
    Math.round(rating),
    role,
    age,
  );
  const player: Player = {
    id,
    name: personName(code, r, surname),
    position,
    positions: profile.positions,
    born: year - age,
    attrs: profile.attrs,
    personality: profile.personality,
    qualities: generateQualities(seed, id),
    traits: profile.traits,
    adaptation: 0.8,
    potential: clamp(rating + integer(r, 10, 35), 50, 95),
    reputation: clamp(rating - 15),
    wage: '0',
    until: year + 3,
    status: 'active',
    fatigue: 0,
    career: zeroMetrics(),
    season: zeroMetrics(),
  };
  // His overall, read once: it moves with his attributes alone (T669).
  const ovr = overall(player);
  player.wage = marketWageAt(code, year, division ?? divisionFor(code, ovr), player, ovr);
  player.agent = drawAgent(r, ovr);
  return player;
}
/**
 * A manager first met in `year`. Market candidates (index 1–98) younger than their prime start
 * below the level they will reach and ask for less (→STAFF-16); the founding manager and an
 * interim keep the drawn level. A candidate of a school is drawn within its bands with the same
 * draws, so his name, id and philosophy do not depend on the school (→STAFF-14).
 */
export function makeManager(
  code: string,
  seed: string,
  year: number,
  index = 0,
  style?: ManagerStyle,
): Manager {
  const r = random(`${seed}:manager:${year}:${index}`),
    bands = { ...MARKET_BANDS, ...(style && STYLE_INFO[style].bands) };
  const name = personName(code, r),
    philosophy = TACTICS[integer(r, 0, 3)],
    peak = integer(r, ...bands.peak);
  const career = coachProspect(
    `${seed}:manager-age:${year}:${index}`,
    peak,
    bands.ages,
    MANAGER_CAREER.prime,
    index > 0 && index < 99,
  );
  return {
    id: `coach:${year}:${index}:${hash(seed)}`,
    name,
    philosophy,
    ability: career.ability,
    youth: integer(r, ...bands.youth),
    flexibility: integer(r, ...bands.flexibility),
    pride: integer(r, ...bands.pride),
    trust: 65,
    wage: quote(code, year, 120 + index * 30 - (peak - career.ability) * 3),
    since: year,
    until: year + 3,
    interim: false,
    born: year - career.age,
    potential: career.potential,
  };
}
import { initialElo } from './elo';
export { initialElo } from './elo';
export { EUROPEAN_CUP_START } from './calendar';
import { tierLevel } from './tier-levels';
export { tierLevel, tierStrengthRange } from './tier-levels';
/**
 * Long-run size of each club relative to its division, stable for the career (→LEAGUE-10). Every
 * country has three giants (+13, +11, +9) and four big clubs (+6, +5, +5, +4), drawn mostly from
 * its upper divisions; of the rest 45% are ordinary (−1 to +1) and the others small (−3 to −5).
 * Real leagues keep a handful of clubs persistently on top.
 */
const STATURE_TOP = [13, 11, 9, 6, 5, 5, 4] as const;
const statures = new Map<string, Map<string, number>>();
export function stature(seed: string, id: string) {
  const code = id.split(':')[0];
  const key = `${seed}:${code}`;
  let table = statures.get(key);
  if (!table) {
    const profile = COUNTRIES.find((c) => c.code === code);
    table = new Map();
    if (profile) {
      const ids: { id: string; tier: number }[] = [];
      profile.groups.forEach((groups, tier) =>
        groups.forEach((size, group) => {
          for (let n = 0; n < size; n++) ids.push({ id: `${code}:${tier}:${group}:${n}`, tier });
        }),
      );
      const draw = (entry: string) => random(`${seed}:stature:${entry}`)();
      const ranked = ids
        .map((entry) => ({ ...entry, key: entry.tier * 0.35 + draw(entry.id) }))
        .sort((a, b) => a.key - b.key);
      ranked.forEach((entry, rank) => {
        const v = random(`${seed}:stature-size:${entry.id}`)();
        table!.set(
          entry.id,
          rank < STATURE_TOP.length
            ? STATURE_TOP[rank]
            : v < 0.55
              ? Math.round(v * 3.6) - 1
              : -3 - Math.round((v - 0.55) * 4.4),
        );
      });
    }
    if (statures.size > 64) statures.clear();
    statures.set(key, table);
  }
  return (
    table.get(id) ??
    (id.startsWith('euro:') ? Math.round(random(`${seed}:stature:${id}`)() * 12) - 4 : 0)
  );
}
const colorOf = (r: () => number) =>
  '#' +
  Math.floor(r() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
/**
 * Every generated club of the playable countries (→WORLD-15): each professional club at its
 * division's level (tier t: 77 − 11t) + its stature (→LEAGUE-10) ± 3, within 15–92.
 */
export function generateClubs(seed: string): Club[] {
  const clubs: Club[] = [];
  for (const c of COUNTRIES)
    for (let tier = 0; tier < c.groups.length; tier++)
      for (let group = 0; group < c.groups[tier].length; group++)
        for (let n = 0; n < c.groups[tier][group]; n++) {
          const id = `${c.code}:${tier}:${group}:${n}`,
            r = random(`${seed}:${id}`);
          const city = c.cities[integer(r, 0, c.cities.length - 1)],
            term = c.terms[integer(r, 0, c.terms.length - 1)];
          // Clubs start near their division's level, giants above it and small clubs below.
          const strength = clamp(
            Math.round(tierLevel(tier) + stature(seed, id) + integer(r, -3, 3)),
            15,
            92,
          );
          clubs.push({
            id,
            name: `${city} ${term} ${String.fromCharCode(65 + Math.floor(n / c.cities.length))}${(n % c.cities.length) + 1}`,
            short: `${city.slice(0, 2).toUpperCase()}${n + 1}`,
            country: c.code,
            tier,
            group,
            strength,
            reputation: Math.max(8, 75 - tier * 15),
            fans: Math.max(800, 18000 - tier * 4500),
            color: colorOf(r),
            elo: initialElo(strength),
          });
        }
  return clubs;
}
const npcCaches = new WeakMap<World, { year: number; clubs: Map<string, Player[]> }>();
export function squad(w: World, c: Club): Player[] {
  if (c.id === w.playerClub) return activePlayers(w);
  let cache = npcCaches.get(w);
  if (!cache || cache.year !== w.year) {
    cache = { year: w.year, clubs: new Map() };
    npcCaches.set(w, cache);
  }
  let players = cache.clubs.get(c.id);
  if (!players) {
    players = continuousSquad(w, c);
    cache.clubs.set(c.id, players);
  }
  return players;
}
/** Any recorded move/retirement invalidates derived rosters immediately. */
export function invalidateNpcSquads(w: World) {
  npcCaches.delete(w);
}
/** One club's derived roster, when only its generated places changed (a free agent, →CLUB-49). */
export function invalidateNpcSquad(w: World, club: string) {
  npcCaches.get(w)?.clubs.delete(club);
}
/**
 * Weekly load a pressing club carries. Unowned squads do not track fatigue match by match, so a
 * pressing style pays its usual cost up front instead of pressing for free.
 */
export const PRESS_LOAD_FATIGUE = 32;
export { LINE_MINIMUM };
/**
 * The 18 places of a squad playing a tactic (→CLUB-1, →WORLD-6): its formation's 11 slots, then a
 * bench bringing every line to its minimum, each at the line's formation positions in turn.
 */
export function squadPlaces(tactic: Tactic): { position: Position; role?: RoleId }[] {
  const slots = formationOf(tactic);
  const bench = (['GK', 'DF', 'MF', 'FW'] as const).flatMap((line) => {
    const options = slots.filter((s) => lineOf(s.position) === line);
    return Array.from({ length: LINE_MINIMUM[line] - options.length }, (_, k) => ({
      position: options[k % options.length]!.position,
    }));
  });
  return [...slots.map((s) => ({ position: s.position, role: s.role })), ...bench];
}
/** First cover two keepers, then the line furthest below its minimum, in formation order. */
export function refillPlace(
  tactic: Tactic,
  players: readonly Pick<Player, 'position'>[],
): Position {
  const held = (line: Line) => players.filter((p) => lineOf(p.position) === line).length;
  if (held('GK') < LINE_MINIMUM.GK) return 'GK';
  const line = (['DF', 'MF', 'FW'] as const)
    .map((line, order) => ({ line, order, short: held(line) - LINE_MINIMUM[line] }))
    .sort((a, b) => a.short - b.short || a.order - b.order)[0].line;
  const options = formationOf(tactic).filter((slot) => lineOf(slot.position) === line);
  return options[held(line) % options.length].position;
}
export const refillPosition = (w: World) => refillPlace(w.tactic, activePlayers(w));
/**
 * The 18 generated players of a club nobody owns, renewed by cohort each year (→WORLD-6); `style`
 * builds them for another tactic's formation (measurement of forced tactics, T321).
 */
export function npcSquad(
  seed: string,
  year: number,
  c: Club,
  style: Tactic = clubStyle(c),
): Player[] {
  const code = COUNTRIES.some((p) => p.code === c.country) ? c.country : 'ENG';
  const fatigue = style === 'press' ? PRESS_LOAD_FATIGUE : 0;
  return squadPlaces(style).map((place, i) => {
    const age = 18 + ((year + i) % 18),
      cohort = Math.floor((year + i) / 18);
    // His join year keeps his surname through his cohort; a season's 18 hold 18 consecutive ones.
    const player = makePlayer(
      code,
      seed,
      `${c.id}:p:${i}:${cohort}`,
      year,
      c.strength,
      place.position,
      age,
      c.tier,
      place.role,
      squadSurname(seed, c.id, 18 * cohort - i),
    );
    player.fatigue = fatigue;
    return player;
  });
}
/** Average 실효 OVR of a starting XI at its formation's slots, before any multiplier. */
export function xiRating(players: readonly Player[], tactic: Tactic) {
  const slots = formationOf(tactic);
  return Math.round(
    players.reduce((sum, p, i) => sum + slotOvr(p, slots[i]!), 0) / Math.max(1, players.length),
  );
}
/**
 * Automatic selection value: the ability he plays at, less fatigue. A manager's trait shifts it:
 * youth favours players aged 21 or younger, rotation rests tired players sooner, stable keeps the
 * best XI despite fatigue.
 */
export function selectionValue(
  p: Player,
  slot: Slot,
  manager?: Manager,
  year?: number,
  multiplier = 1,
) {
  const fatigueWeight = manager?.trait === 'rotation' ? 2.5 : manager?.trait === 'stable' ? 10 : 5;
  const youth =
    (manager?.trait === 'youth' || manager?.style === 'developer') &&
    year !== undefined &&
    year - p.born <= 21
      ? YOUTH_SELECTION_BONUS
      : 0;
  return slotOvr(p, slot, multiplier) - p.fatigue / fatigueWeight + youth;
}
/**
 * The automatic XI in a tactic's formation, slot order (→CLUB-6): the best remaining pairing of a
 * player and a slot goes first, so a centre back is not spent at full back while a full back waits.
 * Own players carry their adaptation's multiplier; other clubs' players share one, so it is left out.
 */
export function lineup(
  players: Player[],
  tactic: Tactic,
  manager?: Manager,
  year?: number,
  multiplier: (p: Player) => number = () => 1,
): Player[] {
  const slots = formationOf(tactic);
  const pairs: { p: Player; slot: number; value: number }[] = [];
  for (const p of players)
    slots.forEach((slot, i) =>
      pairs.push({ p, slot: i, value: selectionValue(p, slot, manager, year, multiplier(p)) }),
    );
  pairs.sort((a, b) => b.value - a.value || a.slot - b.slot || compareIds(a.p.id, b.p.id));
  const chosen: (Player | undefined)[] = Array(slots.length);
  const used = new Set<string>();
  for (const pair of pairs) {
    if (chosen[pair.slot] || used.has(pair.p.id)) continue;
    chosen[pair.slot] = pair.p;
    used.add(pair.p.id);
  }
  return chosen.filter((p): p is Player => !!p);
}

import { isInjured } from './player-state';
export { injuryDaysLeft, isInjured } from './player-state';
/**
 * The own club's starting XI: the manager's automatic choice among fit players (→CLUB-6); an
 * injured player plays only when too few are fit to field eleven. A player banned for the
 * fixture's competition never plays it (→MATCH-19).
 */
export function ownStarters(w: World, f?: Pick<Fixture, 'kind' | 'groupKey'>): Player[] {
  if (f || scope?.w !== w) return chooseStarters(w, f);
  if (!scope.starters) scope.starters = Object.freeze(chooseStarters(w)) as Player[];
  return scope.starters;
}
/**
 * The open read scope (`readingOnce`): its world and, once chosen there, that world's XI without a
 * fixture.
 */
let scope: { w: World; starters?: Player[] } | undefined;
/**
 * Runs `read`, a pure read of `w` that changes nothing in it (the Host's view, →ARCH-6), with
 * `ownStarters(w)` without a fixture chosen once and the same frozen XI reused. The scope holds
 * only this exact world and closes when `read` returns or throws, restoring any outer scope, so a
 * read of another world, or a scope opened inside this one, chooses its own. A read inside it must
 * not try a what-if on `w` in place (as `signingVerdict` and `seasonEndWithWage` do before
 * restoring it) but on a `{ ...w }` copy with the changed fields replaced, as `officeRead` does,
 * which the scope never matches.
 */
export function readingOnce<T>(w: World, read: () => T): T {
  const outer = scope;
  scope = { w };
  try {
    return read();
  } finally {
    scope = outer;
  }
}
function chooseStarters(w: World, f?: Pick<Fixture, 'kind' | 'groupKey'>) {
  const active = f ? activePlayers(w).filter((p) => !isBanned(w, p.id, f)) : activePlayers(w);
  const fit = active.filter((p) => !isInjured(w, p));
  const xi = lineup(fit, w.tactic, w.manager, w.year, ownMultiplier);
  return xi.length >= 11 || fit.length === active.length
    ? xi
    : lineup(active, w.tactic, w.manager, w.year, ownMultiplier);
}
/** The tactic a club plays: the own club's applied one, else its style. */
export const tacticOf = (w: World, c: Club) => (c.id === w.playerClub ? w.tactic : clubStyle(c));
/**
 * Match strength of a club: its actual starting XI for every club, so the own club and the clubs
 * it plays are measured on one scale, each paying for fatigue beyond ordinary match fitness and
 * for unhappy players.
 */
/**
 * Another club's XI at its slots before its 조직력: its squad is fixed for the season and carries
 * no unhappiness, so it is summed once per cached lineup.
 */
const npcBase = new WeakMap<Player[], { ovr: number; load: number }>();
export function rating(w: World, c: Club, f?: Pick<Fixture, 'kind' | 'groupKey'>) {
  return ratingOf(w, c, startingSquad(w, c, f));
}
/**
 * `rating` of the XI `startingSquad` gives the club for a fixture (the own club's `ownStarters`),
 * for a caller that already holds it: `prepareMatch` reads both (T450).
 */
export function ratingOf(w: World, c: Club, xi: Player[]) {
  const own = c.id === w.playerClub;
  const slots = formationOf(tacticOf(w, c));
  if (!own) {
    let base = npcBase.get(xi);
    if (!base) {
      base = { ovr: 0, load: 0 };
      xi.forEach((p, i) => {
        base!.ovr += slotOvr(p, slots[i]!);
        base!.load += fatigueLoad(p.fatigue) / 6;
      });
      npcBase.set(xi, base);
    }
    return Math.round((base.ovr * cohesionMultiplier(c) - base.load) / 11);
  }
  return Math.round(
    xi.reduce(
      (s, p, i) => s + slotOvr(p, slots[i]!, ownMultiplier(p)) - fatigueLoad(p.fatigue) / 6,
      0,
    ) / 11,
  );
}
export { addEvent } from './events';

const npcLineups = new WeakMap<Player[], Player[]>();
/**
 * A club's XI for a fixture. Another club's squad is made one player per formation slot first
 * (→WORLD-6): those eleven start, and one injured or banned for the fixture gives way to the best
 * available of places 11–17 of his line at that slot, else to any available place (→LEAGUE-15).
 */
export function startingSquad(w: World, c: Club, f?: Pick<Fixture, 'kind' | 'groupKey'>) {
  if (c.id === w.playerClub) return ownStarters(w, f);
  const ps = squad(w, c);
  let cached = npcLineups.get(ps);
  if (!cached) {
    cached = ps.slice(0, formationOf(clubStyle(c)).length);
    npcLineups.set(ps, cached);
  }
  if (!f || !w.discipline) return cached;
  const out = (p: Player) => isUnavailable(w, p, c.id, f);
  if (!cached.some(out)) return cached;
  const slots = formationOf(clubStyle(c));
  const used = new Set(cached.filter((p) => !out(p)));
  return cached.map((p, i) => {
    if (!out(p)) return p;
    const slot = slots[i]!;
    const best = (pool: Player[]) =>
      pool
        .filter((q) => !used.has(q) && !out(q))
        .sort((a, b) => slotOvr(b, slot) - slotOvr(a, slot) || compareIds(a.id, b.id))[0];
    const bench = ps.slice(cached.length, 18);
    const replacement =
      best(bench.filter((q) => lineOf(q.position) === lineOf(slot.position))) ||
      best(ps.slice(cached.length));
    // Nobody left: the unavailable player's place stays as it was rather than leave a gap.
    if (!replacement) return p;
    used.add(replacement);
    return replacement;
  });
}
const clubMaps = new WeakMap<Club[], Map<string, Club>>();
/** The club with `id`, or undefined when the world has none. */
export function clubById(w: Pick<World, 'clubs'>, id: string): Club | undefined {
  let map = clubMaps.get(w.clubs);
  if (!map || map.size !== w.clubs.length) {
    map = new Map(w.clubs.map((c) => [c.id, c]));
    clubMaps.set(w.clubs, map);
  }
  return map.get(id);
}
export function findClub(w: World, id: string) {
  const c = clubById(w, id);
  if (!c) throw new Error(sourceMessage('copy.world.c93911c504'));
  return c;
}
