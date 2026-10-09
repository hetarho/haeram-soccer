import {
  COUNTRIES,
  CATALOG_VERSION,
  CATALOG_HASH,
  country,
  currency,
  priceIndex,
} from '../../catalogs/src/index';
import type { Club, Founding, Manager, Player, World, Tactic } from '../../contracts/src/types';
import { clamp, hash, integer, random, ratio, zeroMetrics, compareIds } from './primitives';
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;
export const TACTICS: Tactic[] = ['balanced', 'possession', 'counter', 'press'];
export const tacticLabel: Record<Tactic, string> = {
  balanced: '균형',
  possession: '점유',
  counter: '역습',
  press: '강한 압박',
};
export const clubOf = (w: World) => w.clubs.find((c) => c.id === w.playerClub)!;
export const activePlayers = (w: World) => w.players.filter((p) => p.status === 'active');
export const overall = (p: Player) =>
  Math.round(p.role === 'GK' ? p.keeper : (p.attack + p.passing + p.defense + p.stamina) / 4);
const quoteCache = new Map<string, string>();
export function quote(code: string, year: number, units: number): string {
  const key = `${code}:${year}:${units}`;
  const cached = quoteCache.get(key);
  if (cached !== undefined) return cached;
  const c = country(code),
    now = currency(code, year),
    initial = currency(code, 1901);
  const base = BigInt(Math.round(units * c.scale * initial.units * 10000));
  const factor = BigInt(
    Math.round((priceIndex(code, year).value / priceIndex(code, 1901).value) * 1000000),
  );
  const result = ratio(
    base.toString(),
    factor * now.num * BigInt(now.units),
    10000n * 1000000n * now.den * BigInt(initial.units),
  );
  if (quoteCache.size > 4096) quoteCache.clear();
  quoteCache.set(key, result);
  return result;
}
export function personName(code: string, r: () => number) {
  const c = country(code);
  return `${c.given[integer(r, 0, c.given.length - 1)]} ${c.family[integer(r, 0, c.family.length - 1)]}`;
}
export function makePlayer(
  code: string,
  seed: string,
  id: string,
  year: number,
  rating: number,
  role: Player['role'],
  age = integer(random(id), 18, 32),
): Player {
  const r = random(`${seed}:${id}`);
  const skill = () => clamp(integer(r, Math.round(rating) - 9, Math.round(rating) + 9), 15, 95);
  return {
    id,
    name: personName(code, r),
    role,
    born: year - age,
    attack: clamp(skill() + (role === 'FWD' ? 9 : role === 'GK' ? -20 : 0)),
    passing: clamp(skill() + (role === 'MID' ? 8 : 0)),
    defense: clamp(skill() + (role === 'DEF' ? 10 : 0)),
    keeper: role === 'GK' ? clamp(skill() + 12) : integer(r, 8, 20),
    stamina: skill(),
    potential: clamp(rating + integer(r, 10, 35), 50, 95),
    reputation: clamp(rating - 15),
    wage: quote(code, year, Math.max(15, rating - 18)),
    until: year + 3,
    status: 'active',
    fatigue: 0,
    career: zeroMetrics(),
    season: zeroMetrics(),
  };
}
/**
 * Fatigue up to this level is ordinary match fitness and costs nothing: other clubs carry the same
 * weekly load without it being modelled. Only the excess weakens a player.
 */
export const FRESH_FATIGUE = 20;
export function fatigueLoad(fatigue: number) {
  return Math.max(0, fatigue - FRESH_FATIGUE);
}
export function makeManager(code: string, seed: string, year: number, index = 0): Manager {
  const r = random(`${seed}:manager:${year}:${index}`);
  return {
    id: `coach:${year}:${index}:${hash(seed)}`,
    name: personName(code, r),
    philosophy: TACTICS[integer(r, 0, 3)],
    ability: integer(r, 45, 85),
    youth: integer(r, 40, 90),
    flexibility: integer(r, 15, 90),
    pride: integer(r, 25, 95),
    trust: 65,
    conflicts: 0,
    wage: quote(code, year, 120 + index * 30),
    since: year,
    until: year + 3,
    interim: false,
  };
}
export function createBase(input: Founding): World {
  if (
    !input.name.trim() ||
    input.name.length > 60 ||
    !/^#[0-9a-fA-F]{6}$/.test(input.color) ||
    input.seed.length > 80 ||
    ![0.5, 1, 2].includes(input.difficulty)
  )
    throw new Error('창단 정보를 확인해 주세요.');
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
          clubs.push({
            id,
            name: `${city} ${term} ${String.fromCharCode(65 + Math.floor(n / c.cities.length))}${(n % c.cities.length) + 1}`,
            short: `${city.slice(0, 2).toUpperCase()}${n + 1}`,
            country: c.code,
            tier,
            group,
            strength: integer(r, 72 - tier * 11, 82 - tier * 11),
            reputation: Math.max(8, 75 - tier * 15),
            fans: Math.max(800, 18000 - tier * 4500),
            color:
              '#' +
              Math.floor(r() * 0xffffff)
                .toString(16)
                .padStart(6, '0'),
          });
        }
  for (const c of COUNTRIES)
    for (let i = 0; i < 8; i++) {
      const id = `${c.code}:reserve:${i}`,
        r = random(`${input.seed}:${id}`);
      clubs.push({
        id,
        name: `${c.cities[i % c.cities.length]} ${c.terms[(i + 2) % c.terms.length]} Athletic`,
        short: `R${i + 1}`,
        country: c.code,
        tier: c.groups.length,
        group: 0,
        strength: integer(r, 35, 52),
        reputation: 8,
        fans: 500,
        color:
          '#' +
          Math.floor(r() * 0xffffff)
            .toString(16)
            .padStart(6, '0'),
        representative: true,
      });
    }
  const club = clubs.find(
    (c) => c.country === input.country && c.tier === selected.groups.length - 1 && c.group === 0,
  )!;
  club.name = input.name.trim();
  club.short = input.name.replace(/\s/g, '').slice(0, 3).toUpperCase();
  club.color = input.color;
  club.fans = 800;
  club.reputation = 12;
  const roles: Player['role'][] = [
    'GK',
    'GK',
    ...Array<Player['role']>(6).fill('DEF'),
    ...Array<Player['role']>(6).fill('MID'),
    ...Array<Player['role']>(4).fill('FWD'),
  ];
  // A new club starts as an ordinary member of its league: the founders' best XI rates like the
  // league's average club, whatever the country's pyramid depth.
  const peers = clubs.filter(
    (c) =>
      c.country === club.country && c.tier === club.tier && c.group === club.group && c !== club,
  );
  const target = Math.round(
    peers.reduce((sum, c) => sum + xiRating(lineup(npcSquad(input.seed, 1901, c))), 0) /
      peers.length,
  );
  const found = (base: number) =>
    roles.map((role, i) =>
      makePlayer(input.country, input.seed, `${club.id}:founder:${i}`, 1901, base, role),
    );
  let base = target;
  for (let step = 0; step < 4; step++) {
    const gap = target - xiRating(lineup(found(base)));
    if (!gap) break;
    base += gap;
  }
  club.strength = base;
  const players = found(base);
  const manager = makeManager(input.country, input.seed, 1901);
  const baseline =
    players.reduce((s, p) => s + BigInt(p.wage), 0n) +
    BigInt(manager.wage) +
    BigInt(quote(input.country, 1901, 180));
  const cash = ratio(baseline.toString(), BigInt(input.difficulty * 2), 2n);
  return {
    schema: 1,
    engine: ENGINE_VERSION,
    catalog: CATALOG_VERSION,
    catalogHash: CATALOG_HASH,
    id: `world:${hash(input.seed + input.name)}`,
    seed: input.seed,
    year: 1901,
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
        year: 1901,
        round: 0,
        kind: 'founding',
        title: '클럽의 첫 페이지',
        detail: `${club.name} 창단 · ${selected.name} ${club.tier + 1}부`,
        amount: cash,
        currency: currency(input.country, 1901).code,
      },
    ],
    cash,
    income: '0',
    expense: '0',
    currency: currency(input.country, 1901).code,
    priceIndex: priceIndex(input.country, 1901).value,
    support: 0,
    facilities: 0,
    ticket: 0.05,
    campaigns: [],
    cupWinners: {},
    europe: [],
    lastChampions: [],
    lower: false,
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
    const player = makePlayer(code, seed, `${c.id}:p:${i}:${cohort}`, year, c.strength, role, age);
    player.fatigue = fatigue;
    return player;
  });
}
/** Average role rating of a starting XI. */
export function xiRating(players: readonly Player[]) {
  return Math.round(players.reduce((sum, p) => sum + overall(p), 0) / Math.max(1, players.length));
}
/**
 * Automatic selection value. A manager's trait shifts it: youth favours players aged 21 or
 * younger, rotation rests tired players sooner, stable keeps the best XI despite fatigue.
 */
export function selectionValue(p: Player, manager?: Manager, year?: number) {
  const fatigueWeight = manager?.trait === 'rotation' ? 2.5 : manager?.trait === 'stable' ? 10 : 5;
  const youth = manager?.trait === 'youth' && year !== undefined && year - p.born <= 21 ? 4 : 0;
  return overall(p) - p.fatigue / fatigueWeight + youth;
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
  for (const p of [...players].sort((a, b) => overall(b) - overall(a)))
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
    (a, b) => overall(b) - b.fatigue / 5 - (overall(a) - a.fatigue / 5) || compareIds(a.id, b.id),
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
/**
 * Match strength of a club: its actual starting XI for every club, so the own club and the clubs
 * it plays are measured on one scale, each paying for fatigue beyond ordinary match fitness.
 */
export function rating(w: World, c: Club) {
  const xi =
    c.id === w.playerClub
      ? selectedLineup(activePlayers(w), w.lineup, w.manager, w.year)
      : startingSquad(w, c);
  return Math.round(xi.reduce((s, p) => s + overall(p) - fatigueLoad(p.fatigue) / 6, 0) / 11);
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
  const ps = squad(w, c);
  if (c.id === w.playerClub) return selectedLineup(ps, w.lineup, w.manager, w.year);
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
