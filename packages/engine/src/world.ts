import {
  COUNTRIES,
  CATALOG_VERSION,
  CATALOG_HASH,
  country,
  currency,
  footballIndex,
  priceIndex,
} from '../../catalogs/src/index';
import type {
  Club,
  Founding,
  Manager,
  ManagerStyle,
  Player,
  World,
  Tactic,
} from '../../contracts/src/types';
import { clamp, hash, integer, random, ratio, zeroMetrics, compareIds } from './primitives';
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
import { coachProspect, MANAGER_CAREER } from './coaching';
import { dayCountedFrom } from './calendar';
import { MARKET_BANDS, STYLE_INFO, YOUTH_SELECTION_BONUS } from './styles';
import { divisionFor, marketWageAt } from './contracts';
export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;
export const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const tacticLabel: Record<Tactic, string> = {
  balanced: '균형',
  possession: '점유',
  counter: '역습',
  press: '전방 압박',
};
export const clubOf = (w: World) => w.clubs.find((c) => c.id === w.playerClub)!;
export const activePlayers = (w: World) => w.players.filter((p) => p.status === 'active');
export const overall = (p: Player) =>
  Math.round(p.role === 'GK' ? p.keeper : (p.attack + p.passing + p.defense + p.stamina) / 4);
/** Points an unhappy player plays below his ability (→CLUB-27); his attributes stay as they are. */
export const UNHAPPY_PENALTY = 3;
export const unhappyPenalty = (p: Player) => (p.unhappy ? UNHAPPY_PENALTY : 0);
/** The ability a player plays at: his overall, less the unhappy penalty. */
export const playingAbility = (p: Player) => overall(p) - unhappyPenalty(p);
/** `units` of 1901 money carried to `year` by an index, in that year's currency. */
function indexed(
  code: string,
  year: number,
  units: number,
  index: (code: string, year: number) => { value: number },
) {
  const c = country(code),
    now = currency(code, year),
    initial = currency(code, 1901);
  const base = BigInt(Math.round(units * c.scale * initial.units * 10000));
  const factor = BigInt(Math.round((index(code, year).value / index(code, 1901).value) * 1000000));
  return ratio(
    base.toString(),
    factor * now.num * BigInt(now.units),
    10000n * 1000000n * now.den * BigInt(initial.units),
  );
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
 * pays and charges. Uncached, because market amounts are rarely quoted twice.
 */
export function footballQuote(code: string, year: number, units: number): string {
  return indexed(code, year, units, footballIndex);
}
export function personName(code: string, r: () => number) {
  const c = country(code);
  return `${c.given[integer(r, 0, c.given.length - 1)]} ${c.family[integer(r, 0, c.family.length - 1)]}`;
}
/**
 * A generated player at his market wage (→CLUB-25) in `division`, the tier of the club he plays
 * for; without one, the division his ability suits.
 */
export function makePlayer(
  code: string,
  seed: string,
  id: string,
  year: number,
  rating: number,
  role: Player['role'],
  age = integer(random(id), 18, 32),
  division?: number,
): Player {
  const r = random(`${seed}:${id}`);
  const skill = () => clamp(integer(r, Math.round(rating) - 9, Math.round(rating) + 9), 15, 95);
  // Attributes top out at 99, so no ability exceeds the highest potential.
  const top = (value: number) => clamp(value, 0, 99);
  const player: Player = {
    id,
    name: personName(code, r),
    role,
    born: year - age,
    attack: top(skill() + (role === 'FWD' ? 9 : role === 'GK' ? -20 : 0)),
    passing: top(skill() + (role === 'MID' ? 8 : 0)),
    defense: top(skill() + (role === 'DEF' ? 10 : 0)),
    keeper: role === 'GK' ? top(skill() + 12) : integer(r, 8, 20),
    stamina: skill(),
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
  return player;
}
/**
 * Fatigue up to this level is ordinary match fitness and costs nothing: other clubs carry the same
 * weekly load without it being modelled. Only the excess weakens a player.
 */
export const FRESH_FATIGUE = 20;
export function fatigueLoad(fatigue: number) {
  return Math.max(0, fatigue - FRESH_FATIGUE);
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
export const AMATEUR_CLUBS = 15;
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
    ![0.5, 1, 2].includes(input.difficulty)
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
  const roles: Player['role'][] = [
    'GK',
    'GK',
    ...Array<Player['role']>(6).fill('DEF'),
    ...Array<Player['role']>(6).fill('MID'),
    ...Array<Player['role']>(4).fill('FWD'),
  ];
  // A new club starts as an ordinary member of its league: the founders' best XI rates like the
  // league's average club.
  const peers = clubs
    .filter((c) => c.country === club.country && c.representative && c.tier === club.tier)
    .slice(0, AMATEUR_CLUBS);
  const target = Math.round(
    peers.reduce((sum, c) => sum + xiRating(lineup(npcSquad(input.seed, year, c))), 0) /
      peers.length,
  );
  const found = (base: number) =>
    roles.map((role, i) =>
      makePlayer(
        input.country,
        input.seed,
        `${club.id}:founder:${i}`,
        year,
        base,
        role,
        undefined,
        club.tier,
      ),
    );
  let base = target;
  for (let step = 0; step < 4; step++) {
    const gap = target - xiRating(lineup(found(base)));
    if (!gap) break;
    base += gap;
  }
  club.strength = base;
  club.elo = initialElo(base);
  const players = found(base);
  const manager = makeManager(input.country, input.seed, year);
  const baseline =
    players.reduce((s, p) => s + BigInt(p.wage), 0n) +
    BigInt(manager.wage) +
    BigInt(quote(input.country, year, 180));
  const cash = ratio(baseline.toString(), BigInt(input.difficulty * 2), 2n);
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
    difficulty: input.difficulty,
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
    currency: currency(input.country, year).code,
    priceIndex: priceIndex(input.country, year).value,
    support: 0,
    facilities: 0,
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
    players = npcSquad(w.seed, w.year, c);
    cache.clubs.set(c.id, players);
  }
  return players;
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
/** The 18 generated players of a club nobody owns, renewed by cohort each year. */
export function npcSquad(seed: string, year: number, c: Club): Player[] {
  const code = COUNTRIES.some((p) => p.code === c.country) ? c.country : 'ENG';
  const fatigue = clubStyle(c) === 'press' ? PRESS_LOAD_FATIGUE : 0;
  return Array.from({ length: 18 }, (_, i) => {
    const age = 18 + ((year + i) % 18),
      cohort = Math.floor((year + i) / 18);
    const role: Player['role'] = i < 2 ? 'GK' : i < 8 ? 'DEF' : i < 14 ? 'MID' : 'FWD';
    const player = makePlayer(
      code,
      seed,
      `${c.id}:p:${i}:${cohort}`,
      year,
      c.strength,
      role,
      age,
      c.tier,
    );
    player.fatigue = fatigue;
    return player;
  });
}
/** Average role rating of a starting XI. */
export function xiRating(players: readonly Player[]) {
  return Math.round(players.reduce((sum, p) => sum + overall(p), 0) / Math.max(1, players.length));
}
/**
 * Automatic selection value: the ability he plays at, less fatigue. A manager's trait shifts it:
 * youth favours players aged 21 or younger, rotation rests tired players sooner, stable keeps the
 * best XI despite fatigue.
 */
export function selectionValue(p: Player, manager?: Manager, year?: number) {
  const fatigueWeight = manager?.trait === 'rotation' ? 2.5 : manager?.trait === 'stable' ? 10 : 5;
  const youth =
    (manager?.trait === 'youth' || manager?.style === 'developer') &&
    year !== undefined &&
    year - p.born <= 21
      ? YOUTH_SELECTION_BONUS
      : 0;
  return playingAbility(p) - p.fatigue / fatigueWeight + youth;
}
export function lineup(players: Player[], manager?: Manager, year?: number): Player[] {
  const value = (p: Player) => selectionValue(p, manager, year);
  const selected: Player[] = [];
  for (const [role, count] of [
    ['GK', 1],
    ['DEF', 4],
    ['MID', 3],
    ['FWD', 3],
  ] as const) {
    selected.push(
      ...players
        .filter((p) => p.role === role)
        .sort((a, b) => value(b) - value(a) || compareIds(a.id, b.id))
        .slice(0, count),
    );
  }
  for (const p of [...players].sort((a, b) => playingAbility(b) - playingAbility(a)))
    if (selected.length < 11 && !selected.includes(p)) selected.push(p);
  const result = selected.slice(0, 11);
  return result;
}
export const LINEUP_ROLES: Player['role'][] = [
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'FWD',
  'FWD',
  'FWD',
];

/** Preferred starters remain slot-safe; a sold or retired player is replaced automatically. */
export function selectedLineup(
  players: Player[],
  preferred?: string[],
  manager?: Manager,
  year?: number,
): Player[] {
  if (!preferred) return lineup(players, manager, year);
  const active = players.filter((player) => player.status === 'active');
  const byId = new Map(active.map((player) => [player.id, player]));
  const used = new Set<string>();
  const selected = LINEUP_ROLES.map((role, i) => {
    const player = byId.get(preferred[i]);
    if (!player || player.role !== role || used.has(player.id)) return undefined;
    used.add(player.id);
    return player;
  });
  const fit = [...active].sort(
    (a, b) =>
      playingAbility(b) - b.fatigue / 5 - (playingAbility(a) - a.fatigue / 5) ||
      compareIds(a.id, b.id),
  );
  return selected.flatMap((player, i) => {
    const replacement =
      player ||
      fit.find((candidate) => candidate.role === LINEUP_ROLES[i] && !used.has(candidate.id)) ||
      fit.find((candidate) => !used.has(candidate.id));
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
 * injured player plays only when too few are fit to field eleven.
 */
export function ownStarters(w: World) {
  const active = activePlayers(w);
  const fit = active.filter((p) => !isInjured(w, p));
  const xi = selectedLineup(fit, w.lineup, w.manager, w.year);
  return xi.length >= 11 || fit.length === active.length
    ? xi
    : selectedLineup(active, w.lineup, w.manager, w.year);
}
/**
 * Match strength of a club: its actual starting XI for every club, so the own club and the clubs
 * it plays are measured on one scale, each paying for fatigue beyond ordinary match fitness and
 * for unhappy players.
 */
export function rating(w: World, c: Club) {
  const xi = c.id === w.playerClub ? ownStarters(w) : startingSquad(w, c);
  return Math.round(
    xi.reduce((s, p) => s + playingAbility(p) - fatigueLoad(p.fatigue) / 6, 0) / 11,
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
export function startingSquad(w: World, c: Club) {
  if (c.id === w.playerClub) return ownStarters(w);
  const ps = squad(w, c);
  let cached = npcLineups.get(ps);
  if (!cached) {
    cached = lineup(ps);
    npcLineups.set(ps, cached);
  }
  return cached;
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
