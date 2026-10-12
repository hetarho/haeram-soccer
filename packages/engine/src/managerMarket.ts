import type { Club, Manager, ManagerMarket, ManagerStyle, World } from '../../contracts/src/types';
import { clamp, integer, random } from './primitives';
import { candidateStyles, MANAGER_STYLES, STYLE_INFO } from './styles';
import { footballScaled, managerTrait, staffQuote } from './staff';
import { addEvent, clubOf, FOUNDING_YEAR, makeManager } from './world';
import { ownLeagueClubs } from './season';

/** The market moves every four league rounds and at the season close (→STAFF-17). */
export const MARKET_REFRESH_ROUNDS = 4;
export const FREE_AGENTS = { min: 4, max: 8 } as const;
/** Chance a free agent signs elsewhere at a refresh. */
export const SIGNS_ELSEWHERE = 0.25;
/** A struggling club sacks its manager at a refresh; a relegated one at the close. */
export const SACKING = { struggling: 0.4, relegated: 0.6, lossesOfFive: 3 } as const;
/** Compensation for another club's manager: 1.5 × his annual wage. */
export const COMPENSATION = [3n, 2n] as const;
/** Other clubs' managers listed as candidates. */
export const POACH_LIST = 8;
const RETIREMENT_AGE = 70;

export type MarketManager = Manager & { style: ManagerStyle };
export interface ManagerCandidate extends MarketManager {
  source: 'free' | 'club';
  /** Signing fee paid to the manager. */
  fee: string;
  /** For another club's manager: his club and the compensation it receives. */
  club?: string;
  compensation?: string;
}

/**
 * The season's four seeded candidates, one school each (→STAFF-14); they open the market. Wages
 * and fees follow the football index (→ECON-26).
 */
export function managerOffers(w: World) {
  const code = clubOf(w).country,
    styles = candidateStyles(w.seed, w.year);
  return Array.from({ length: 4 }, (_, i) => {
    const style = styles[i],
      info = STYLE_INFO[style],
      manager = makeManager(code, w.seed, w.year, i + 1, style),
      trait = managerTrait(w, i + 1, style);
    return {
      ...manager,
      ...(trait ? { trait } : {}),
      style,
      // A school that plays one way brings its tactic; a firefighter signs to the season's end.
      philosophy: info.tactic ?? manager.philosophy,
      wage: footballScaled(w, manager.wage),
      until: w.year + info.term,
      fee: staffQuote(w, 60 + i * 40),
    };
  });
}

function seeded(w: World): ManagerMarket {
  return {
    year: w.year,
    round: w.round,
    free: managerOffers(w).map(({ fee: _fee, ...manager }) => (void _fee, manager)),
    clubs: {},
    serial: 0,
  };
}
/** The market as it stands; before it first moves, the season's four are its free agents. */
export function marketOf(w: World): ManagerMarket {
  return w.managerMarket ?? seeded(w);
}
/** The market as stored state, created from the season's four when it first changes. */
function market(w: World): ManagerMarket {
  return (w.managerMarket ??= seeded(w));
}

const cache = new Map<string, MarketManager>();
/**
 * The manager of any club, derived from the seed, the club and how many managers it has had, so
 * nothing is stored until he changes. His level follows the club's strength (±8).
 */
export function clubManager(w: World, club: Club): MarketManager {
  const [count, since] = w.managerMarket?.clubs[club.id] ?? [0, FOUNDING_YEAR];
  const key = `${w.seed}:club-manager:${club.id}:${count}`;
  const cached = `${key}:${since}:${club.strength}:${w.year}`;
  const hit = cache.get(cached);
  if (hit) return hit;
  const r = random(key);
  const style = MANAGER_STYLES[integer(r, 0, MANAGER_STYLES.length - 1)],
    info = STYLE_INFO[style],
    drawn = makeManager(club.country, key, since, 1, style);
  const level = clamp(Math.round(club.strength + integer(r, -8, 8)), 30, 95),
    potential = clamp(
      Math.max(level, (drawn.potential ?? level) + level - drawn.ability),
      level,
      99,
    );
  const manager: MarketManager = {
    ...drawn,
    style,
    philosophy: info.tactic ?? drawn.philosophy,
    ability: level,
    potential,
    wage: staffQuote(w, 120 + level),
    since,
    until: w.year + info.term,
  };
  if (cache.size > 2000) cache.clear();
  cache.set(cached, manager);
  return manager;
}
const age = (w: World, m: Manager) => (m.born === undefined ? 0 : w.year - m.born);
/** A new free agent, his school in turn from the season's seeded order. */
function freeAgent(w: World, serial: number): MarketManager {
  const code = clubOf(w).country,
    style = candidateStyles(w.seed, w.year)[serial % MANAGER_STYLES.length],
    info = STYLE_INFO[style],
    drawn = makeManager(code, `${w.seed}:free-manager:${serial}`, w.year, 1, style),
    trait = managerTrait({ ...w, seed: `${w.seed}:free-manager:${serial}` }, 1, style);
  return {
    ...drawn,
    ...(trait ? { trait } : {}),
    style,
    philosophy: info.tactic ?? drawn.philosophy,
    wage: staffQuote(w, 120 + drawn.ability),
    until: w.year + info.term,
  };
}
const signingFee = (w: World, m: Manager) => staffQuote(w, 40 + m.ability);

/** The clubs whose managers we may hire away: our league and the division above. */
function poachable(w: World) {
  const own = clubOf(w);
  const league = ownLeagueClubs(w).filter((club) => club.id !== own.id);
  const above =
    own.tier > 0
      ? w.clubs.filter(
          (c) => c.country === own.country && !c.representative && c.tier === own.tier - 1,
        )
      : [];
  return [...league, ...above];
}

/**
 * Who the owner may hire now (→STAFF-17): free agents first, then the best managers of our league
 * and the division above, who cost compensation on top of the signing fee.
 */
export function managerCandidates(w: World): ManagerCandidate[] {
  const current = w.manager.id;
  // Nobody signs past his 70th year (→STAFF-14), so a free agent who reached it is not offered.
  const free = marketOf(w)
    .free.filter(
      (m): m is MarketManager => !!m.style && m.id !== current && age(w, m) < RETIREMENT_AGE,
    )
    .map((m) => ({ ...m, source: 'free' as const, fee: signingFee(w, m) }));
  const clubs = poachable(w)
    .map((club) => ({ club, manager: clubManager(w, club) }))
    .filter(({ manager }) => manager.id !== current && age(w, manager) < RETIREMENT_AGE)
    .sort((a, b) => b.manager.ability - a.manager.ability || (a.club.id < b.club.id ? -1 : 1))
    .slice(0, POACH_LIST)
    .map(({ club, manager }) => ({
      ...manager,
      source: 'club' as const,
      club: club.id,
      fee: signingFee(w, manager),
      compensation: ((BigInt(manager.wage) * COMPENSATION[0]) / COMPENSATION[1]).toString(),
    }));
  return [...free, ...clubs];
}

/** The candidate leaves the market for our club; the manager he replaces becomes a free agent. */
export function takeManager(w: World, candidate: ManagerCandidate, replaced: Manager) {
  const m = market(w);
  m.free = m.free.filter((free) => free.id !== candidate.id);
  if (candidate.club) {
    const [count] = m.clubs[candidate.club] ?? [0, FOUNDING_YEAR];
    m.clubs[candidate.club] = [count + 1, w.year];
  }
  // An interim or the founding all-rounder has no school to offer the market.
  if (!replaced.interim && replaced.style && age(w, replaced) < RETIREMENT_AGE) {
    // The term he signed with us goes with his contract; his next club chooses its own.
    const { lastRequest: _l, requestHistory: _h, pending: _p, term: _t, ...rest } = replaced;
    void _l;
    void _h;
    void _p;
    void _t;
    m.free = [
      ...m.free,
      {
        ...rest,
        trust: 65,
        conflicts: 0,
        wage: staffQuote(w, 120 + rest.ability),
      },
    ].slice(-FREE_AGENTS.max);
  }
}

/** Each club's last five league results, newest first, from one pass over the fixtures. */
function lastFive(w: World, ids: Set<string>) {
  const form = new Map<string, ('W' | 'D' | 'L')[]>();
  const played = w.fixtures
    .filter((f) => f.score && (f.kind === 'league' || f.kind === 'lower') && f.year === w.year)
    .sort((a, b) => b.round - a.round);
  for (const f of played)
    for (const [club, goals, against] of [
      [f.home, f.score!.home, f.score!.away],
      [f.away, f.score!.away, f.score!.home],
    ] as const) {
      if (!ids.has(club)) continue;
      const list = form.get(club) ?? [];
      if (list.length < 5) list.push(goals > against ? 'W' : goals < against ? 'L' : 'D');
      form.set(club, list);
    }
  return form;
}

/**
 * The market moves (→STAFF-17): free agents sign elsewhere, struggling clubs of our league (or the
 * relegated ones at the close) sack their managers into the pool, retirees are replaced and new
 * free agents fill it. Its own stream keeps every other draw where it was.
 */
export function refreshManagerMarket(w: World, relegated?: Set<string>) {
  const m = market(w);
  const r = random(
    `${w.seed}:manager-market:${w.year}:${w.round}:${relegated ? 'close' : 'round'}`,
  );
  m.free = m.free.filter(() => r() >= SIGNS_ELSEWHERE);
  const own = clubOf(w);
  const league = ownLeagueClubs(w).filter((club) => club.id !== own.id);
  const sacking = new Set<string>();
  if (relegated) {
    for (const id of relegated) if (r() < SACKING.relegated) sacking.add(id);
  } else {
    const table = league
      .map((club) => ({ club, row: w.tables[club.id] }))
      .filter((entry) => entry.row)
      .sort(
        (a, b) =>
          a.row.points - b.row.points ||
          a.row.gf - a.row.ga - (b.row.gf - b.row.ga) ||
          (a.club.id < b.club.id ? -1 : 1),
      );
    const bottom = table.slice(0, Math.max(1, Math.floor(table.length / 4)));
    const form = lastFive(w, new Set(bottom.map((entry) => entry.club.id)));
    for (const { club } of bottom) {
      const losses = (form.get(club.id) ?? []).filter((result) => result === 'L').length;
      if (losses >= SACKING.lossesOfFive && r() < SACKING.struggling) sacking.add(club.id);
    }
  }
  // Relegated clubs have left our league by the close; they still sack their managers.
  const changing = [
    ...league,
    ...w.clubs.filter((club) => sacking.has(club.id) && !league.includes(club)),
  ];
  for (const club of changing) {
    const manager = clubManager(w, club);
    const sacked = sacking.has(club.id);
    if (!sacked && age(w, manager) < RETIREMENT_AGE) continue;
    const [count] = m.clubs[club.id] ?? [0, FOUNDING_YEAR];
    m.clubs[club.id] = [count + 1, w.year];
    if (!sacked) continue;
    m.free.push({ ...manager, until: w.year + STYLE_INFO[manager.style].term });
    addEvent(
      w,
      'rival-sacking',
      `${club.name}, ${manager.name} 감독 경질`,
      `${STYLE_INFO[manager.style].label} · OVR ${manager.ability} · 자유계약 감독 명단에 올랐어요`,
    );
  }
  while (m.free.length < FREE_AGENTS.min || (m.free.length < FREE_AGENTS.max && r() < 0.3))
    m.free.push(freeAgent(w, m.serial++));
  m.free = m.free.slice(-FREE_AGENTS.max);
  m.year = w.year;
  m.round = w.round;
}

/** Rounds until the market next moves, for the candidates tab. */
export function roundsUntilRefresh(w: World) {
  return MARKET_REFRESH_ROUNDS - (w.round % MARKET_REFRESH_ROUNDS);
}
