import { SQUAD_TARGET } from './squad-size';
import { continuousSquad } from './npc-continuity';
import { generateQualities } from './aptitude';
import {
  COUNTRIES,
  CATALOG_VERSION,
  CATALOG_HASH,
  country,
  currency,
  broadcastingIndex,
  footballIndex,
  priceIndex,
} from '../../catalogs/src/index';
import type {
  Club,
  DifficultyLevel,
  Fixture,
  Founding,
  Line,
  Manager,
  ManagerStyle,
  Player,
  Position,
  RoleId,
  World,
  Tactic,
} from '../../contracts/src/types';
import { clamp, hash, integer, random, ratio, zeroMetrics, compareIds } from './primitives';
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
import { coachProspect, MANAGER_CAREER } from './coaching';
import { dayCountedFrom } from './calendar';
import { isBanned, isUnavailable } from './discipline';
import { MARKET_BANDS, STYLE_INFO, YOUTH_SELECTION_BONUS } from './styles';
import { divisionFor, drawAgent, marketWageAt, settleClauses } from './contracts';
import { operatingExpensesAt } from './finance';
import {
  adaptationStart,
  generateProfile,
  LINE_MINIMUM,
  lineOf,
  type Joined,
  type Slot,
} from './player';
export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;
export const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const tacticLabel: Record<Tactic, string> = {
  balanced: '균형',
  possession: '점유',
  counter: '역습',
  press: '전방 압박',
};
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
/** What a difficulty level sets: cash × the founding budget and the founding XI's offset (→WEB-3). */
export const LEVEL_CASH: Record<DifficultyLevel, number> = {
  easy: 2,
  normal: 1,
  hard: 0.5,
  extreme: 0.25,
};
export const LEVEL_OFFSET: Record<DifficultyLevel, number> = {
  easy: 0,
  normal: -2,
  hard: -4,
  extreme: -6,
};
export const DIFFICULTY_LEVELS = Object.keys(LEVEL_CASH) as DifficultyLevel[];
type Index = (code: string, year: number) => { value: number };
/** What `indexed` scales by in a country and year, worked out once per index. */
const indexFactors = new Map<
  Index,
  Map<string, { scale: number; initial: number; num: bigint; den: bigint }>
>();
/**
 * `units` of 1901 money carried to `year` by an index, in that year's currency. The base is 1901
 * prices, so an index whose real multiple starts below 1 (broadcasting) pays less than prices.
 */
function indexed(code: string, year: number, units: number, index: Index) {
  let byYear = indexFactors.get(index);
  if (!byYear) indexFactors.set(index, (byYear = new Map()));
  const key = `${code}:${year}`;
  let f = byYear.get(key);
  if (!f) {
    const now = currency(code, year),
      initial = currency(code, 1901);
    const factor = BigInt(
      Math.round((index(code, year).value / priceIndex(code, 1901).value) * 1000000),
    );
    f = {
      scale: country(code).scale,
      initial: initial.units,
      num: factor * now.num * BigInt(now.units),
      den: 10000n * 1000000n * now.den * BigInt(initial.units),
    };
    if (byYear.size > 4096) byYear.clear();
    byYear.set(key, f);
  }
  const base = BigInt(Math.round(units * f.scale * f.initial * 10000));
  return ratio(base.toString(), f.num, f.den);
}
const quoteCache = new Map<string, string>();
export function quote(code: string, year: number, units: number): string {
  const key = `${code}:${year}:${units}`;
  const cached = quoteCache.get(key);
  if (cached !== undefined) return cached;
  const result = indexed(code, year, units, priceIndex);
  if (quoteCache.size > 4096) quoteCache.clear();
  quoteCache.set(key, result);
  return result;
}
/**
 * Like `quote`, carried by the football index instead of prices alone (→ECON-26): what football
 * pays and charges. Amounts are not cached, because market amounts are rarely quoted twice; the
 * country's and year's factors are.
 */
export function footballQuote(code: string, year: number, units: number): string {
  return indexed(code, year, units, footballIndex);
}
/**
 * Like `footballQuote`, carried by the broadcasting index (→ECON-31): what league distributions pay
 * (→ECON-28), a small fraction of prices before television and far above the football index from
 * the 1990s.
 */
export function broadcastQuote(code: string, year: number, units: number): string {
  return indexed(code, year, units, broadcastingIndex);
}
export function personName(code: string, r: () => number) {
  const c = country(code);
  return `${c.given[integer(r, 0, c.given.length - 1)]} ${c.family[integer(r, 0, c.family.length - 1)]}`;
}
/**
 * A generated player at his market wage (→CLUB-25) in `division`, the tier of the club he plays
 * for; without one, the division his ability suits. His agent (→CLUB-30) is the last draw of his
 * own stream, so it leaves every other attribute as it was.
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
    name: personName(code, r),
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
  player.wage = marketWageAt(code, year, division ?? divisionFor(code, overall(player)), player);
  player.agent = drawAgent(r, overall(player));
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
    conflicts: 0,
    wage: quote(code, year, 120 + index * 30 - (peak - career.ability) * 3),
    since: year,
    until: year + 3,
    interim: false,
    born: year - career.age,
    potential: career.potential,
  };
}
/** The European Cup starts in 1955; every club is founded five seasons earlier (→WEB-2). */
export const EUROPEAN_CUP_START = 1955;
export const FOUNDING_YEAR = EUROPEAN_CUP_START - 5;
/** Amateur clubs per country below the professional pyramid; with the owner's club, a league of 16. */
import { AMATEUR_CLUBS } from './league-fixtures';
export { AMATEUR_CLUBS } from './league-fixtures';
/**
 * Generated strength of a club in a pyramid tier: each professional tier is about 11 points below
 * the one above, and the amateur level (tier = professional depth) sits one more step down.
 */
export function tierStrengthRange(tier: number, amateur = false): [number, number] {
  return amateur ? [72 - tier * 11, 80 - tier * 11] : [72 - tier * 11, 82 - tier * 11];
}
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
      for (let i = 0; i < AMATEUR_CLUBS; i++)
        ids.push({ id: `${code}:reserve:${i}`, tier: profile.groups.length });
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
/** Where a club of this stature settles in a division (professional, or the amateur level). */
export function tierLevel(tier: number, amateur = false) {
  const [low, high] = tierStrengthRange(tier, amateur);
  return (low + high) / 2;
}
/** A rough Club Elo from strength: one rating point is about 16 Elo points (→HIST-12). */
export function initialElo(strength: number) {
  return Math.round(1350 + (strength - 60) * 16);
}
const colorOf = (r: () => number) =>
  '#' +
  Math.floor(r() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
export function createBase(input: Founding): World {
  if (
    !input.name.trim() ||
    input.name.length > 60 ||
    !/^#[0-9a-fA-F]{6}$/.test(input.color) ||
    input.seed.length > 80 ||
    !DIFFICULTY_LEVELS.includes(input.level)
  )
    throw new Error('창단 정보를 확인해 주세요.');
  const year = FOUNDING_YEAR;
  const selected = country(input.country);
  const clubs: Club[] = [];
  for (const c of COUNTRIES)
    for (let tier = 0; tier < c.groups.length; tier++)
      for (let group = 0; group < c.groups[tier].length; group++)
        for (let n = 0; n < c.groups[tier][group]; n++) {
          const id = `${c.code}:${tier}:${group}:${n}`,
            r = random(`${input.seed}:${id}`);
          const city = c.cities[integer(r, 0, c.cities.length - 1)],
            term = c.terms[integer(r, 0, c.terms.length - 1)];
          // Clubs start near their division's level, giants above it and small clubs below.
          const strength = clamp(
            Math.round(tierLevel(tier) + stature(input.seed, id) + integer(r, -3, 3)),
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
  // Amateur clubs below each professional pyramid: the owner's league and the pool that swaps
  // places with clubs relegated out of the professional game.
  for (const c of COUNTRIES)
    for (let i = 0; i < AMATEUR_CLUBS; i++) {
      const id = `${c.code}:reserve:${i}`,
        r = random(`${input.seed}:${id}`);
      const strength = clamp(
        Math.round(tierLevel(c.groups.length, true) + stature(input.seed, id) + integer(r, -3, 3)),
        15,
        92,
      );
      clubs.push({
        id,
        name: `${c.cities[i % c.cities.length]} ${c.terms[(i + 2) % c.terms.length]} ${i < c.cities.length ? 'Athletic' : 'Amateurs'}`,
        short: `R${i + 1}`,
        country: c.code,
        tier: c.groups.length,
        group: 0,
        strength,
        reputation: 8,
        fans: 500,
        color: colorOf(r),
        representative: true,
        elo: initialElo(strength),
      });
    }
  // The new club starts as an amateur club, one league below the professional game (→WEB-2).
  const club: Club = {
    id: `${input.country}:club`,
    name: input.name.trim(),
    short: input.name.replace(/\s/g, '').slice(0, 3).toUpperCase(),
    country: input.country,
    tier: selected.groups.length,
    group: 0,
    strength: 0,
    reputation: 12,
    fans: 800,
    color: input.color,
  };
  clubs.push(club);
  const manager = makeManager(input.country, input.seed, year);
  // The founders cover the founding manager's formation: one per slot, then the bench (→CLUB-1).
  const tactic = manager.philosophy;
  const places = squadPlaces(tactic);
  while (places.length < SQUAD_TARGET) places.push({ position: refillPlace(tactic, places) });
  // A new club starts at its league's average club plus its level's offset (→CLUB-1, →WEB-3).
  const peers = clubs
    .filter((c) => c.country === club.country && c.representative && c.tier === club.tier)
    .slice(0, AMATEUR_CLUBS);
  const target =
    Math.round(
      peers.reduce((sum, c) => {
        const style = clubStyle(c);
        return sum + xiRating(lineup(npcSquad(input.seed, year, c), style), style);
      }, 0) / peers.length,
    ) + LEVEL_OFFSET[input.level];
  const found = (base: number) =>
    places.map((place, i) =>
      makePlayer(
        input.country,
        input.seed,
        `${club.id}:founder:${i}`,
        year,
        base,
        place.position,
        undefined,
        club.tier,
        place.role,
      ),
    );
  let base = target;
  for (let step = 0; step < 4; step++) {
    const gap = target - xiRating(lineup(found(base), tactic), tactic);
    if (!gap) break;
    base += gap;
  }
  club.strength = base;
  club.elo = initialElo(base);
  const players = found(base);
  // The founders sign on the founding day, each with his contract's clauses (→CLUB-29).
  for (const p of players) {
    p.clauses = settleClauses(input.seed, p, p.agent!, year, 0);
    joinClub(p, 'founding', year);
  }
  // A club's first season pays the amateur level's floor of operating expenses (→ECON-30).
  const operatingExpenses = operatingExpensesAt(input.country, year, club.tier);
  // The founding season's fixed costs (→WEB-3): wages, upkeep and those operating expenses.
  const baseline =
    players.reduce((s, p) => s + BigInt(p.wage), 0n) +
    BigInt(manager.wage) +
    BigInt(footballQuote(input.country, year, 180)) +
    BigInt(operatingExpenses);
  const cash = ratio(baseline.toString(), BigInt(LEVEL_CASH[input.level] * 4), 4n);
  return {
    schema: 1,
    engine: ENGINE_VERSION,
    catalog: CATALOG_VERSION,
    catalogHash: CATALOG_HASH,
    id: `world:${hash(input.seed + input.name)}`,
    seed: input.seed,
    year,
    round: 0,
    revision: 0,
    playerClub: club.id,
    level: input.level,
    clubs,
    players,
    manager,
    tactic: manager.philosophy,
    fixtures: [],
    tables: {},
    ownMatches: [],
    history: [],
    events: [
      {
        year,
        round: 0,
        kind: 'founding',
        title: '클럽의 첫 페이지',
        detail: `${club.name} 창단 · ${selected.name} 아마추어 리그`,
        amount: cash,
        currency: currency(input.country, year).code,
      },
    ],
    cash,
    income: '0',
    expense: '0',
    operatingExpenses,
    currency: currency(input.country, year).code,
    priceIndex: priceIndex(input.country, year).value,
    support: 0,
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    ticket: 0.05,
    campaigns: [],
    cupWinners: {},
    europe: [],
    lastChampions: [],
    lower: true,
    receiptIds: [],
  };
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
/** Stable playing style of a club nobody owns, shared by simulation and scouting. */
export function clubStyle(club: Pick<Club, 'id'>): Tactic {
  return TACTICS[
    Math.abs(club.id.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0)) % 4
  ];
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

/**
 * The owner's saved XI keeps its slots, anyone in any slot (→CLUB-6); a sold, retired or unfit
 * player's slot takes the best available player there (→CLUB-9).
 */
export function selectedLineup(
  players: Player[],
  preferred: string[] | undefined,
  tactic: Tactic,
  manager?: Manager,
  year?: number,
  multiplier: (p: Player) => number = ownMultiplier,
): Player[] {
  if (!preferred) return lineup(players, tactic, manager, year, multiplier);
  const slots = formationOf(tactic);
  const active = players.filter((player) => player.status === 'active');
  const byId = new Map(active.map((player) => [player.id, player]));
  const used = new Set<string>();
  const selected = slots.map((_, i) => {
    const player = byId.get(preferred[i]!);
    if (!player || used.has(player.id)) return undefined;
    used.add(player.id);
    return player;
  });
  return selected.flatMap((player, i) => {
    const slot = slots[i]!;
    const replacement =
      player ||
      active
        .filter((candidate) => !used.has(candidate.id))
        .sort(
          (a, b) =>
            selectionValue(b, slot, undefined, undefined, multiplier(b)) -
              selectionValue(a, slot, undefined, undefined, multiplier(a)) ||
            compareIds(a.id, b.id),
        )[0];
    if (!replacement) return [];
    used.add(replacement.id);
    return [replacement];
  });
}
/** Days until an injured player can play again (→CLUB-23); 0 when fit. */
export function injuryDaysLeft(w: World, p: Player) {
  return p.injury ? Math.max(0, p.injury.day - dayCountedFrom(w, p.injury.year)) : 0;
}
export function isInjured(w: World, p: Player) {
  return injuryDaysLeft(w, p) > 0;
}
/**
 * The own club's starting XI: the manager's (or the owner's saved) choice among fit players; an
 * injured player plays only when too few are fit to field eleven. A player banned for the
 * fixture's competition never plays it (→MATCH-19).
 */
export function ownStarters(w: World, f?: Pick<Fixture, 'kind' | 'groupKey'>) {
  const active = f ? activePlayers(w).filter((p) => !isBanned(w, p.id, f)) : activePlayers(w);
  const fit = active.filter((p) => !isInjured(w, p));
  const xi = selectedLineup(fit, w.lineup, w.tactic, w.manager, w.year);
  return xi.length >= 11 || fit.length === active.length
    ? xi
    : selectedLineup(active, w.lineup, w.tactic, w.manager, w.year);
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
export function addEvent(w: World, kind: string, title: string, detail: string, amount?: string) {
  w.events.push({
    year: w.year,
    round: w.round,
    kind,
    title,
    detail,
    ...(amount ? { amount, currency: w.currency } : {}),
  });
}

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
export function findClub(w: World, id: string) {
  let map = clubMaps.get(w.clubs);
  if (!map || map.size !== w.clubs.length) {
    map = new Map(w.clubs.map((c) => [c.id, c]));
    clubMaps.set(w.clubs, map);
  }
  const c = map.get(id);
  if (!c) throw new Error('경기 클럽 식별자 오류');
  return c;
}
