import { cancelPromises } from './promises';
import { COUNTRIES } from '../../catalogs/src/index';
import { closeEmployment, openEmployment, peopleOf, syncMentorExposures } from './person-careers';
import { cohesionAfterManager } from './adaptation';
import type {
  Club,
  Manager,
  ManagerCriteria,
  ManagerMarket,
  ManagerStyle,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random } from './primitives';
import { candidateStyles, MANAGER_STYLES, STYLE_INFO } from './styles';
import {
  affordable,
  clearlyCheaper,
  footballScaled,
  MANAGER_RENEWAL_MARGIN,
  MANAGER_TRAIT_INFO,
  managerTrait,
  staffQuote,
  releaseCost,
} from './staff';
import { addEvent } from './events';
import { clubOf } from './player-state';
import { FOUNDING_YEAR, makeManager } from './world';
import { ownLeagueClubs } from './season';
import { managerCriteriaOf } from './hiring';
import { moneyLabel } from './finance';

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
  source: 'free' | 'club' | 'internal';
  coachingRelease?: string;
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
    drawn = makeManager(
      COUNTRIES.some((c) => c.code === club.country) ? club.country : 'ENG',
      key,
      since,
      1,
      style,
    );
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

/** The free agents we may sign now; nobody signs past his 70th year (→STAFF-14). */
function freeCandidates(w: World): ManagerCandidate[] {
  return marketOf(w)
    .free.filter(
      (m): m is MarketManager => !!m.style && m.id !== w.manager.id && age(w, m) < RETIREMENT_AGE,
    )
    .map((m) => ({ ...m, source: 'free' as const, fee: signingFee(w, m) }));
}

/** The best managers of our league and the division above, who cost compensation (→STAFF-17). */
function clubCandidates(w: World): ManagerCandidate[] {
  const current = w.manager.id;
  return poachable(w)
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
}
/** Retained career managers' drawn traits, which only their seed and profile decide. */
const careerDraws = new Map<string, Manager>();
/** Retained career profiles add places without replacing the ordinary market. */
function careerCandidates(w: World): ManagerCandidate[] {
  const code = clubOf(w).country;
  return peopleOf(w).flatMap((person) => {
    const profile = person.management;
    if (
      !profile ||
      person.employment.some(
        (job) => !job.to && (job.role === 'manager' || job.role === 'player'),
      ) ||
      w.year - person.born >= RETIREMENT_AGE
    )
      return [];
    const job = person.employment.find((job) => !job.to),
      internal = job?.club === w.playerClub,
      member = internal ? w.staff?.find((member) => member.person === person.id) : undefined;
    if (job && !internal && job.wage === undefined) return [];
    const style = profile.school,
      info = STYLE_INFO[style],
      key = `${code}|${w.seed}|${person.id}|${profile.at.year}|${style}`;
    let drawn = careerDraws.get(key);
    if (!drawn) {
      drawn = makeManager(code, `${w.seed}:career-manager:${person.id}`, profile.at.year, 1, style);
      if (careerDraws.size > 8192) careerDraws.clear();
      careerDraws.set(key, drawn);
    }
    const manager = {
      ...drawn,
      id: person.id,
      person: person.id,
      name: person.name,
      born: person.born,
      ability: profile.ability,
      potential: profile.potential,
      style,
      philosophy: info.tactic ?? drawn.philosophy,
      wage: staffQuote(w, 120 + profile.ability),
      since: w.year,
      until: w.year + Math.min(info.term, person.born + RETIREMENT_AGE - w.year),
    };
    return [
      {
        ...manager,
        source: internal ? ('internal' as const) : job ? ('club' as const) : ('free' as const),
        fee: signingFee(w, manager),
        ...(job ? { club: job.club } : {}),
        ...(member ? { coachingRelease: releaseCost(w, member) } : {}),
        ...(job && !internal
          ? { compensation: ((BigInt(job.wage!) * COMPENSATION[0]) / COMPENSATION[1]).toString() }
          : {}),
      },
    ];
  });
}
/**
 * Who the owner may hire now (→STAFF-17): free agents first, then the best managers of our league
 * and the division above, who cost compensation on top of the signing fee.
 */
export function managerCandidates(w: World): ManagerCandidate[] {
  return [...freeCandidates(w), ...clubCandidates(w), ...careerCandidates(w)];
}

/** The going wage of a manager of this OVR: what a manager wage cap names (→STAFF-18). */
export function managerCapWage(w: World, ovr: number) {
  return staffQuote(w, 120 + ovr);
}
type ManagerCheck = [
  why: string,
  fits: (
    m: Pick<Manager, 'ability' | 'style' | 'flexibility' | 'pride' | 'youth' | 'trait' | 'wage'>,
  ) => boolean,
];
/** The manager criteria (→STAFF-18), affordability aside, each with the reason nobody passes it. */
function managerChecks(w: World, c: ManagerCriteria): ManagerCheck[] {
  const cap = c.maxWageOvr === undefined ? undefined : BigInt(managerCapWage(w, c.maxWageOvr));
  const traitLabel = (trait: ManagerCriteria['traits'][number]) =>
    trait === 'none' ? '성향 없음' : MANAGER_TRAIT_INFO[trait].label;
  return [
    [`OVR ${c.minOvr} 이상인 후보가 없어요`, (m) => m.ability >= c.minOvr],
    [
      `${c.schools.map((style) => STYLE_INFO[style].label).join('·')} 학파의 후보가 없어요`,
      (m) => !c.schools.length || (!!m.style && c.schools.includes(m.style)),
    ],
    [`유연성 ${c.minFlexibility} 이상인 후보가 없어요`, (m) => m.flexibility >= c.minFlexibility],
    [`자존심 ${c.maxPride} 이하인 후보가 없어요`, (m) => m.pride <= c.maxPride],
    [`육성 ${c.minYouth} 이상인 후보가 없어요`, (m) => m.youth >= c.minYouth],
    [
      `선발 성향이 ${c.traits.map(traitLabel).join('·')}인 후보가 없어요`,
      (m) => !c.traits.length || c.traits.includes(m.trait ?? 'none'),
    ],
    [
      `연봉 상한(OVR ${c.maxWageOvr} 감독 시세) 안의 후보가 없어요`,
      (m) => cap === undefined || BigInt(m.wage) <= cap,
    ],
  ];
}
/** Whether a manager meets every manager criterion, affordability aside (→STAFF-18). */
export function managerFits(w: World, m: Parameters<ManagerCheck[1]>[0]) {
  return managerChecks(w, managerCriteriaOf(w)).every(([, fits]) => fits(m));
}
const potentialOf = (m: Pick<Manager, 'ability' | 'potential'>) => m.potential ?? m.ability;
/**
 * The criteria's order: OVR, potential or 육성 (youth work), highest first, or the lowest wage;
 * ties keep the list.
 */
function byPriority(priority: ManagerCriteria['priority']) {
  return (a: ManagerCandidate, b: ManagerCandidate) =>
    priority === 'ovr'
      ? b.ability - a.ability
      : priority === 'potential'
        ? potentialOf(b) - potentialOf(a)
        : priority === 'youth'
          ? b.youth - a.youth
          : BigInt(a.wage) < BigInt(b.wage)
            ? -1
            : BigInt(a.wage) > BigInt(b.wage)
              ? 1
              : 0;
}
/** The signing fee plus any compensation to his club. */
export const managerHireCost = (m: ManagerCandidate) =>
  BigInt(m.fee) + BigInt(m.compensation ?? '0') + BigInt(m.coachingRelease ?? '0');
/**
 * Cash after his fee and any compensation still keeps 재정 기조's runway with his wage in place of
 * the current manager's (→STAFF-18, as →STAFF-15, →ECON-33).
 */
function affordableManager(w: World, m: ManagerCandidate) {
  return affordable(
    w,
    managerHireCost(m),
    BigInt(m.wage) -
      BigInt(w.manager.wage) -
      BigInt((m.person && w.staff?.find((member) => member.person === m.person)?.wage) || '0'),
  );
}
/** Free agents, and other clubs' managers too when the criteria allow poaching. */
const pool = (w: World, c: ManagerCriteria) =>
  managerCandidates(w).filter((m) => c.poach || m.source !== 'club');
/**
 * The candidates who meet every manager criterion and whom the club can afford, in the criteria's
 * order (→STAFF-18): the delegated staff appoint the first.
 */
export function managerMatches(w: World): ManagerCandidate[] {
  const c = managerCriteriaOf(w),
    checks = managerChecks(w, c);
  return pool(w, c)
    .filter((m) => checks.every(([, fits]) => fits(m)) && affordableManager(w, m))
    .sort(byPriority(c.priority));
}
/** 가장 나은 후보 (→STAFF-18): the best affordable free agent in the criteria's order. */
export function bestFreeAgent(w: World): ManagerCandidate | undefined {
  return managerCandidates(w)
    .filter((m) => m.source !== 'club')
    .filter((m) => affordableManager(w, m))
    .sort(byPriority(managerCriteriaOf(w).priority))[0];
}
/**
 * Whether the first match beats a manager in post who meets the criteria, at his renewal wage, by
 * the criteria's own measure: 3+ OVR, 3+ 육성, 3+ potential, or a wage at most 90% of his
 * (→STAFF-18).
 */
export function managerBeats(
  c: ManagerCriteria,
  match: ManagerCandidate,
  m: Pick<Manager, 'ability' | 'potential' | 'youth'>,
  renewalWage: string,
) {
  if (c.priority === 'ovr') return match.ability >= m.ability + MANAGER_RENEWAL_MARGIN;
  if (c.priority === 'youth') return match.youth >= m.youth + MANAGER_RENEWAL_MARGIN;
  if (c.priority === 'potential')
    return potentialOf(match) >= potentialOf(m) + MANAGER_RENEWAL_MARGIN;
  return clearlyCheaper(match.wage, renewalWage);
}
/** "육성형 Name(OVR 72/80, 연봉 …)" with his club and compensation when he is another club's. */
export function managerLine(w: World, m: ManagerCandidate) {
  const club = m.club ? w.clubs.find((other) => other.id === m.club)?.name : undefined;
  return `${STYLE_INFO[m.style].label} ${m.name}(OVR ${m.ability}/${potentialOf(m)} · 연봉 ${moneyLabel(w, m.wage)}${
    club ? ` · ${club} · 웃돈 ${moneyLabel(w, m.compensation ?? '0')}` : ''
  })`;
}
/** Why no candidate matches: the first criterion nobody meets, or that nobody is affordable. */
function noManagerReason(w: World, c: ManagerCriteria) {
  let left = pool(w, c);
  if (!left.length) return '선임할 수 있는 후보가 없어요';
  for (const [why, fits] of managerChecks(w, c)) {
    left = left.filter(fits);
    if (!left.length) return why;
  }
  return '자금 여력에 맞는 후보가 없어요';
}
/**
 * Whom the staff would appoint if the post fell vacant today (→STAFF-18): the first match, or with
 * 가장 나은 후보 the fallback free agent, else why nobody and that the interim would stay.
 */
export function managerPickPreview(w: World): {
  pick?: ManagerCandidate;
  /** The pick is 가장 나은 후보's fallback, not a match. */
  fallback?: boolean;
  reason: string;
} {
  const c = managerCriteriaOf(w),
    match = managerMatches(w)[0];
  if (match) return { pick: match, reason: `${managerLine(w, match)} · 감독 기조에 맞는 첫 후보` };
  const why = noManagerReason(w, c),
    best = c.whenNone === 'best' ? bestFreeAgent(w) : undefined;
  if (best)
    return {
      pick: best,
      fallback: true,
      reason: `${managerLine(w, best)} · 감독 기조에 맞는 감독이 없어(${why}) 가장 나은 자유계약 감독`,
    };
  return { reason: `감독 기조에 맞는 감독이 없어요 · ${why} · 임시 감독 체제로 기다려요` };
}
/** Why nobody was appointed, for the staff's report. */
export function managerSearchReason(w: World) {
  return noManagerReason(w, managerCriteriaOf(w));
}

/** The candidate leaves the market for our club; the manager he replaces becomes a free agent. */
export function takeManager(w: World, candidate: ManagerCandidate, replaced: Manager) {
  cancelPromises(w, replaced.id, '구단이 새 감독을 선임해 요청한 감독이 떠났어요.');
  const m = market(w);
  m.free = m.free.filter((free) => free.id !== candidate.id);
  if (candidate.club && !candidate.person) {
    const club = w.clubs.find((one) => one.id === candidate.club);
    const before = club && clubManager(w, club);
    const [count] = m.clubs[candidate.club] ?? [0, FOUNDING_YEAR];
    m.clubs[candidate.club] = [count + 1, w.year];
    // The club he left names its next manager, and its squad starts to learn him (→LEAGUE-12).
    if (club && before) cohesionAfterManager(club, before.style === clubManager(w, club).style);
  }
  // An interim or the founding all-rounder has no school to offer the market.
  if (
    !replaced.person &&
    !replaced.interim &&
    replaced.style &&
    age(w, replaced) < RETIREMENT_AGE
  ) {
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
  if (replaced.person) {
    const person = w.people?.[replaced.person];
    if (person?.management)
      Object.assign(person.management, {
        ability: replaced.ability,
        potential: replaced.potential ?? replaced.ability,
      });
    closeEmployment(w, replaced.person, 'manager');
  }
  if (candidate.person) {
    const person = w.people![candidate.person];
    const member = w.staff?.find((member) => member.person === person.id);
    if (member && person.coaching)
      Object.assign(person.coaching, {
        ability: member.ability,
        potential: member.potential ?? person.coaching.potential,
      });
    for (const job of person.employment.filter((job) => !job.to))
      closeEmployment(w, person.id, job.role);
    w.staff = w.staff?.filter((member) => member.person !== person.id);
    openEmployment(w, person.id, 'manager', w.playerClub);
  }
  syncMentorExposures(w);
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
    // The squad starts to learn its next manager (→LEAGUE-12).
    cohesionAfterManager(club, manager.style === clubManager(w, club).style);
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
  syncMentorExposures(w);
}

/** Rounds until the market next moves, for the candidates tab. */
export function roundsUntilRefresh(w: World) {
  return MARKET_REFRESH_ROUNDS - (w.round % MARKET_REFRESH_ROUNDS);
}
