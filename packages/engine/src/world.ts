import { message as sourceMessage } from '../../contracts/src/messages';
import { continuousSquad } from './npc-continuity';
import { matchdaySquad } from './persisted-squads';
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
  GENERATED_ATTRIBUTES,
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
/** A generated player's potential headroom above his rating as released: 10–35 at every age. */
const RELEASED_HEADROOM: readonly [number, number] = [10, 35];
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
  return drawPlayer(
    code,
    seed,
    id,
    year,
    rating,
    position,
    age,
    division,
    role,
    surname,
    RELEASED_HEADROOM,
  );
}
/**
 * A generated squad member or a refill of his place at `level` (→WORLD-6): `makePlayer` as
 * released, or with `SQUAD_SPREAD` at `spread` his potential headroom narrowing with his age
 * (`spreadHeadroom`), drawn with the same one draw so his agent stays as it was.
 */
export function generatedPlayer(
  code: string,
  seed: string,
  id: string,
  year: number,
  level: number,
  position: Position,
  age: number,
  division: number,
  role?: RoleId,
  surname?: number,
): Player {
  const headroom = SQUAD_SPREAD.inForce === 'spread' ? spreadHeadroom(age) : RELEASED_HEADROOM;
  return drawPlayer(code, seed, id, year, level, position, age, division, role, surname, headroom);
}
function drawPlayer(
  code: string,
  seed: string,
  id: string,
  year: number,
  rating: number,
  position: Position,
  age: number,
  division: number | undefined,
  role: RoleId | undefined,
  surname: number | undefined,
  headroom: readonly [number, number],
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
    potential: clamp(rating + integer(r, headroom[0], headroom[1]), 50, 95),
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
const npcReadVersions = new WeakMap<World, number>();
/** Standing size, including the founding places beyond the matchday eighteen (→WORLD-16). */
export const NPC_SQUAD = { size: 22 };
/** All live players at a club; market and scouting reads also include those outside its eighteen. */
export function clubPlayers(w: World, c: Club): Player[] {
  return c.id === w.playerClub ? activePlayers(w) : (w.squads?.[c.id] ?? squad(w, c));
}
export function squad(w: World, c: Club): Player[] {
  if (c.id === w.playerClub) return activePlayers(w);
  let cache = npcCaches.get(w);
  if (!cache || cache.year !== w.year) {
    cache = { year: w.year, clubs: new Map() };
    npcCaches.set(w, cache);
  }
  let players = cache.clubs.get(c.id);
  if (!players) {
    players = w.squads?.[c.id] ? w.squads[c.id].slice(0, 18) : continuousSquad(w, c);
    cache.clubs.set(c.id, players);
  }
  return players;
}
/** Drop transient slices after a read-copy change, preserving each stored matchday choice. */
export function invalidateNpcSquads(w: World) {
  npcCaches.delete(w);
  npcReadVersions.set(w, (npcReadVersions.get(w) ?? 0) + 1);
}
/** Choose at a simulation boundary; the stored order also carries the choice across a load/helper. */
export function refreshNpcSquads(w: World) {
  for (const club of Object.keys(w.squads ?? {})) invalidateNpcSquad(w, club);
  invalidateNpcSquads(w);
}
/** Only the club whose players changed chooses its matchday squad again. */
export function invalidateNpcSquad(w: World, club: string) {
  const players = w.squads?.[club];
  if (players) {
    const c = clubById(w, club);
    if (c) {
      const chosen = matchdaySquad(w, c, players),
        ids = new Set(chosen.map((p) => p.id));
      w.squads![club] = [...chosen, ...players.filter((p) => !ids.has(p.id))];
    }
  }
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
/** A generated squad's places: one player of each age from 18 to 35 (→WORLD-6). */
export const SQUAD_AGES = 18;
/**
 * A club's age ladder (→WORLD-6): where it starts (`start`, 0–17) and the order of its places
 * (`order`, a permutation of the 18), drawn once from a stream of the seed and the club, so clubs
 * of one tactic do not field the same ages in the same places.
 */
export function ageLadder(seed: string, club: string) {
  const r = random(`${seed}:${club}:age-ladder`);
  const start = integer(r, 0, SQUAD_AGES - 1);
  // Fisher–Yates, so every engine shuffles alike.
  const order = Array.from({ length: SQUAD_AGES }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = integer(r, 0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { start, order };
}
/**
 * Generated place `place`'s (0–17, `squadPlaces` order) age in `year` and its birth cohort on its
 * club's ladder: the place holds one person through the 18 seasons of a cohort, a year older each
 * season, then the next cohort's 18-year-old. `ladder` is the club's `ageLadder`, for callers
 * placing a whole squad.
 */
export function squadPlaceAge(
  seed: string,
  club: string,
  year: number,
  place: number,
  ladder = ageLadder(seed, club),
) {
  const step = year + ladder.order[place]! + ladder.start;
  return { age: 18 + (step % SQUAD_AGES), cohort: Math.floor(step / SQUAD_AGES) };
}
/**
 * T806's squad spread (→WORLD-6), a setting held at `flat` until T808 reads its gate: `flat` draws
 * every generated place at the club's strength, as released; `spread` gives each generated player
 * his own class and an age term, sits the bench below the starters, re-centres the starters on the
 * club's strength and narrows a player's potential headroom with his age (`SQUAD_SPREAD_CONFIG`).
 */
export const SQUAD_SPREAD: { inForce: 'flat' | 'spread' } = { inForce: 'flat' };
/**
 * WORLD-6's spread terms. `class` and `bench` are chosen within WORLD-6's ranges (±6, 3–8) to keep a
 * squad's market cost, which the means level reads (`squadCostAt`, →LEAGUE-10), nearest the flat
 * draw's over strengths 50–95 and the star pay spread's eras: spread squads cost less (the age term
 * lowers the young and the old; below a star pay spread of 1 a starter lifted above OVR 80 earns
 * little more; at 95 the ceiling holds the starters), so the bench sits as near as WORLD-6 allows and
 * the class is the narrowest that still spreads the eleven to an OVR SD of 2.5 at every strength up
 * to 90 (5 leaves 2.39 at 90); T806's result lists the cost per strength and era.
 */
export const SQUAD_SPREAD_CONFIG = {
  /** A player's class: symmetric within ± this of his place's level, triangular so stars are rare. */
  class: 6,
  /** How far the bench sits below the starters' mean. */
  bench: 3,
  /** [age, term] anchors, linear between them and flat outside. */
  age: [
    [18, -7],
    [20, -4],
    [22, -1],
    [24, 0],
    [29, 0],
    [31, -1],
    [33, -3],
    [35, -5],
  ] as [number, number][],
  /** Potential headroom: `young` at `from` years or younger, narrowing linearly to `old` from `to`. */
  headroom: { from: 20, young: [10, 35], to: 27, old: [0, 4] } as {
    from: number;
    young: readonly [number, number];
    to: number;
    old: readonly [number, number];
  },
  /** Levels stay within what generated attributes reach. */
  ...GENERATED_ATTRIBUTES,
};
/** WORLD-6's age term: a young or ageing player stands below his place's level. */
export function spreadAgeTerm(age: number) {
  const anchors = SQUAD_SPREAD_CONFIG.age;
  if (age <= anchors[0]![0]) return anchors[0]![1];
  for (let i = 1; i < anchors.length; i++) {
    const [from, low] = anchors[i - 1]!,
      [to, high] = anchors[i]!;
    if (age <= to) return low + ((high - low) * (age - from)) / (to - from);
  }
  return anchors[anchors.length - 1]![1];
}
/** A generated person's class: drawn once from his own stream, so the same every season he plays. */
export function spreadClass(seed: string, id: string) {
  const r = random(`${seed}:${id}:class`);
  return SQUAD_SPREAD_CONFIG.class * (r() + r() - 1);
}
/**
 * What a generated person's class and age put on his place's level (→WORLD-6), the one term a
 * squad's member and a refill of his place take alike; nothing while `SQUAD_SPREAD` is `flat`.
 */
export function spreadTerm(seed: string, id: string, age: number) {
  return SQUAD_SPREAD.inForce === 'spread' ? spreadClass(seed, id) + spreadAgeTerm(age) : 0;
}
/** WORLD-6's potential headroom at `age`, rounded to whole points. */
export function spreadHeadroom(age: number): readonly [number, number] {
  const { from, young, to, old } = SQUAD_SPREAD_CONFIG.headroom;
  const t = clamp((age - from) / (to - from), 0, 1);
  return [
    Math.round(young[0] + (old[0] - young[0]) * t),
    Math.round(young[1] + (old[1] - young[1]) * t),
  ];
}
/**
 * The whole-point levels of a squad whose places' terms are `terms` (`spreadTerm`), the first
 * `starters` the eleven a club nobody owns fields (`startingSquad`): the bench sits
 * `SQUAD_SPREAD_CONFIG.bench` lower, the squad moves together until the starters' mean is
 * `strength`, then the starters alone move further as far as the ceiling takes what some of them
 * cannot reach, so the bench stays below them; whole points keep the starters' sum where it fell.
 */
export function spreadLevels(strength: number, terms: readonly number[], starters: number) {
  const { bench, floor, ceiling } = SQUAD_SPREAD_CONFIG;
  const raw = terms.map((term, i) => strength + term - (i < starters ? 0 : bench));
  const fit = (level: number) => clamp(level, floor, ceiling);
  const mean = (shift: number) =>
    raw.slice(0, starters).reduce((sum, level) => sum + fit(level + shift), 0) / starters;
  const shift = strength - raw.slice(0, starters).reduce((sum, level) => sum + level, 0) / starters;
  // The starters' own shift: the squad's, raised while the ceiling holds some of them back.
  let low = shift,
    high = shift + (ceiling - floor);
  if (mean(low) < strength)
    for (let step = 0; step < 60; step++) {
      const mid = (low + high) / 2;
      if (mean(mid) < strength) low = mid;
      else high = mid;
    }
  const lift = mean(low) < strength ? high : low;
  const levels = raw.map((level, i) => fit(level + (i < starters ? lift : shift)));
  return [...wholeLevels(levels.slice(0, starters)), ...levels.slice(starters).map(Math.round)];
}
/** Whole points with the same sum, rounded to the nearest whole, the largest remainders first. */
function wholeLevels(levels: readonly number[]) {
  const floors = levels.map(Math.floor);
  let left =
    Math.round(levels.reduce((sum, level) => sum + level, 0)) - floors.reduce((a, b) => a + b, 0);
  const order = levels
    .map((level, i) => ({ i, rest: level - floors[i]! }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}
/**
 * The 18 generated players of a club nobody owns, renewed by cohort each year (→WORLD-6); `style`
 * builds them for another tactic's formation (measurement of forced tactics, T321). With
 * `SQUAD_SPREAD` at `spread` each takes his level from `spreadLevels`, else the club's strength.
 */
export function npcSquad(
  seed: string,
  year: number,
  c: Club,
  style: Tactic = clubStyle(c),
): Player[] {
  const code = COUNTRIES.some((p) => p.code === c.country) ? c.country : 'ENG';
  const fatigue = style === 'press' ? PRESS_LOAD_FATIGUE : 0;
  const ladder = ageLadder(seed, c.id);
  const places = squadPlaces(style).map((place, i) => {
    const { age, cohort } = squadPlaceAge(seed, c.id, year, i, ladder);
    return { ...place, age, id: `${c.id}:p:${i}:${cohort}` };
  });
  const levels =
    SQUAD_SPREAD.inForce === 'spread'
      ? spreadLevels(
          c.strength,
          places.map((place) => spreadTerm(seed, place.id, place.age)),
          formationOf(style).length,
        )
      : undefined;
  return places.map((place, i) => {
    // The year he turned 18 keeps his surname through his cohort; a season's 18 hold 18
    // consecutive ones.
    const player = generatedPlayer(
      code,
      seed,
      place.id,
      year,
      levels?.[i] ?? c.strength,
      place.position,
      place.age,
      c.tier,
      place.role,
      squadSurname(seed, c.id, year + 18 - place.age),
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
 * not try a what-if on `w` in place, changing and restoring it, but on a `{ ...w }` copy with the
 * changed fields replaced, as `officeRead` does, which the scope never matches.
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
 * Another club's XI before its 조직력, summed once per attribute revision of its cached lineup.
 */
const npcBase = new WeakMap<Player[], { ovr: number; load: number; version: number }>();
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
    const version = npcReadVersions.get(w) ?? 0;
    if (!base || base.version !== version) {
      base = { ovr: 0, load: 0, version };
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
 * A club's XI for a fixture: its cached eleven, with an unavailable starter replaced for this
 * fixture by the best available bench player, then one outside the eighteen (→LEAGUE-15).
 * Representatives keep their generated places and the bench's line-first cover.
 */
export function startingSquad(w: World, c: Club, f?: Pick<Fixture, 'kind' | 'groupKey'>) {
  if (c.id === w.playerClub) return ownStarters(w, f);
  const ps = squad(w, c);
  let cached = npcLineups.get(ps);
  if (!cached) {
    cached = ps.slice(0, formationOf(clubStyle(c)).length);
    npcLineups.set(ps, cached);
  }
  if (!f) return cached;
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
    const chosen = new Set(ps.map((q) => q.id));
    const outside = (w.squads?.[c.id] ?? []).filter((q) => !chosen.has(q.id));
    const replacement = w.squads?.[c.id]
      ? best(bench) || best(outside)
      : best(bench.filter((q) => lineOf(q.position) === lineOf(slot.position))) ||
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
