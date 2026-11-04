import type {
  CareerEmployment,
  Club,
  PersonCareer,
  Staff,
  StaffCandidate,
  StaffMarket,
  StaffRole,
  World,
} from '../../contracts/src/types';
import { TAKEOVER_DECADES } from '../../contracts/src/owner';
import { clamp, compareIds, integer, random, ratio } from './primitives';
import { DELEGATED_TERM, STAFF_INFO, STAFF_ROLES } from './staff-info';
import { coachWage, moneyCountry } from './staff';
import { COACH_CAREER, coachProspect } from './coaching';
import { hasOwner } from './owner';
import { networkCandidates, networkedCandidate } from './owner-traits';
import { clubOf } from './player-state';
import { personName } from './world';
import { poachable } from './managerMarket';
import { activeCoachingEmployment, closeEmployment, profiledCoaches } from './person-careers';
import { coachingEntryReady } from './coaching-entry';

/**
 * The staff markets (→STAFF-49): each post's free agents, kept 3–6 (마당발's one more, →OWNER-5,
 * read from `OWNER_TRAITS.networker`), and other clubs' holders, the six ablest of our league and
 * the division above, who cost one annual wage of compensation. New free agents are drawn at
 * levels 45–85; a club's holder stands within 8 of its strength inside the same levels. Like the
 * manager market, a refresh's pool may grow past its floor by `growth` a draw, and a coach retires
 * at `retireAge` as a manager does.
 */
export const STAFF_MARKET_CONFIG = {
  poolMin: 3,
  poolMax: 6,
  signElsewhere: 0.25,
  compensationWages: 1,
  poachList: 6,
  levels: [45, 85] as const,
  spread: 8,
  growth: 0.3,
  retireAge: 70,
} as const;
/** Where a club and post missing from the market started counting, as the manager market's. */
const MARKET_START = TAKEOVER_DECADES[0];

const age = (w: World, member: Pick<Staff, 'born'>) =>
  member.born === undefined ? 0 : w.year - member.born;
/** The free agents each pool holds: 3–6, and 마당발's more (→OWNER-5). */
function poolRange(w: World) {
  const more = networkCandidates(w);
  return { min: STAFF_MARKET_CONFIG.poolMin + more, max: STAFF_MARKET_CONFIG.poolMax + more };
}
/** Former players waiting for a coaching post count toward their department's pool (→STAFF-27). */
function retainedCount(w: World, role: StaffRole) {
  let count = 0;
  for (const person of profiledCoaches(w))
    if (person.coaching?.role === role && coachingEntryReady(person)) count++;
  return count;
}
/** The newest `room` of a pool; the oldest leave first. */
const capped = (pool: Staff[], room: number) => pool.slice(Math.max(0, pool.length - room));

/** A new free agent of the post, drawn at the market's levels in the coach age bands (→STAFF-16). */
function freeAgent(w: World, role: StaffRole, round: number, n: number): Staff {
  const id = `staff-free:${role}:${w.year}:${round}:${n}`,
    r = random(`${w.seed}:${id}`),
    traits = STAFF_INFO[role].traits;
  const name = personName(clubOf(w).country, r),
    peak = integer(r, ...STAFF_MARKET_CONFIG.levels),
    trait = traits[integer(r, 0, traits.length - 1)],
    // A young coach is cheaper now and grows toward his level (→STAFF-16).
    career = coachProspect(`${w.seed}:${id}:age`, peak, COACH_CAREER.ages, COACH_CAREER.prime),
    wage = coachWage(w, career.ability);
  return networkedCandidate(w, {
    id,
    role,
    name,
    ability: career.ability,
    ...(trait ? { trait } : {}),
    wage,
    since: w.year,
    until: w.year + DELEGATED_TERM,
    born: w.year - career.age,
    potential: career.potential,
  });
}
/**
 * The pool after `kept`: new free agents fill it to its floor, and with a refresh's stream `r`
 * may grow toward its ceiling; it never holds more than the ceiling's room beside the former
 * players waiting for the post.
 */
function filled(w: World, role: StaffRole, kept: Staff[], round: number, r?: () => number) {
  const { min, max } = poolRange(w),
    retained = retainedCount(w, role),
    pool = [...kept];
  let n = 0;
  while (
    pool.length + retained < min ||
    (r && pool.length + retained < max && r() < STAFF_MARKET_CONFIG.growth)
  )
    pool.push(freeAgent(w, role, round, n++));
  return capped(pool, max - retained);
}
/** The season's opening pools, each at its floor, numbered from the season's first round. */
function seeded(w: World, clubs: StaffMarket['clubs'] = {}): StaffMarket {
  return {
    year: w.year,
    round: 0,
    free: Object.fromEntries(STAFF_ROLES.map((role) => [role, filled(w, role, [], 0)])),
    clubs,
  };
}
/** Before anyone owns a club nobody hires from the markets: only holder counts are kept. */
const ownerless = (w: World): StaffMarket => ({
  year: w.year,
  round: w.round,
  free: {},
  clubs: {},
});
/** The markets as they stand; before they first change, the season's opening pools. */
export function staffMarketOf(w: World): StaffMarket {
  return w.staffMarket ?? (hasOwner(w) ? seeded(w) : ownerless(w));
}
/** The markets as stored state, created as `staffMarketOf` reads them when they first change. */
function market(w: World): StaffMarket {
  return (w.staffMarket ??= hasOwner(w) ? seeded(w) : ownerless(w));
}
/**
 * The markets a takeover opens (→STAFF-49, WORLD-13): the world before it kept no free agent, so
 * the season's opening pools become its free agents; the clubs' holder counts stay.
 */
export function openStaffMarket(w: World) {
  w.staffMarket = seeded(w, w.staffMarket?.clubs);
}

/** A club's post as its holder count stands, after holders who reached `retireAge` moved on. */
type Holder = { count: number; since: number; born: number };
const holders = new Map<string, Holder>();
const identityKey = (w: World, club: Club, role: StaffRole, count: number) =>
  `${w.seed}:club-staff:${club.id}:${role}:${count}`;
function holderOf(w: World, club: Club, role: StaffRole): Holder {
  const [stored, from] = w.staffMarket?.clubs[club.id]?.[role] ?? [0, MARKET_START];
  const cached = `${w.seed}:${club.id}:${role}:${stored}:${from}:${w.year}`;
  const hit = holders.get(cached);
  if (hit) return hit;
  let count = stored,
    since = from,
    born =
      since - integer(random(`${identityKey(w, club, role, count)}:age`), ...COACH_CAREER.ages);
  // A holder retires at `retireAge` and his club names the next (bounded for a far-future year).
  for (let step = 0; born + STAFF_MARKET_CONFIG.retireAge <= w.year && step < 40; step++) {
    since = born + STAFF_MARKET_CONFIG.retireAge;
    count++;
    born =
      since - integer(random(`${identityKey(w, club, role, count)}:age`), ...COACH_CAREER.ages);
  }
  const holder = { count, since, born };
  if (holders.size > 8192) holders.clear();
  holders.set(cached, holder);
  return holder;
}

/** Former players placed at clubs nobody owns (→STAFF-43), by club and post, per employment list. */
const placedIndexes = new WeakMap<
  readonly unknown[],
  Map<string, { person: PersonCareer; job: CareerEmployment }>
>();
function placedAt(w: World, club: string, role: StaffRole) {
  const active = activeCoachingEmployment(w);
  let index = placedIndexes.get(active);
  if (!index) {
    index = new Map();
    for (const entry of active)
      if (entry.job.club !== w.playerClub) index.set(`${entry.job.club}:${entry.job.role}`, entry);
    placedIndexes.set(active, index);
  }
  return index.get(`${club}:${role}`);
}

const members = new Map<string, Staff>();
/**
 * The holder of a club's post (→STAFF-49): derived from the seed, the club, the post and its
 * holder count, so nothing is stored until he changes. His ability stands within 8 of the club's
 * strength inside the market's levels; his age and ceiling follow the coach bands (→STAFF-16). A
 * former player placed there (→STAFF-43) holds it instead while employed.
 */
export function clubStaffMember(w: World, club: Club, role: StaffRole): Staff {
  const placed = placedAt(w, club.id, role);
  if (placed) {
    const { person, job } = placed,
      ability = person.coaching?.ability ?? 50;
    return {
      id: person.id,
      person: person.id,
      role,
      name: person.name,
      ability,
      wage: job.wage ?? coachWage(w, ability, moneyCountry(club)),
      since: job.from.year,
      until: job.contractUntil?.year ?? w.year + 1,
      born: person.born,
      ...(person.coaching ? { potential: person.coaching.potential } : {}),
    };
  }
  const { count, since, born } = holderOf(w, club, role),
    key = identityKey(w, club, role, count),
    // Before the takeover his club's money prices him; after it, the owner's club's (→WORLD-13).
    priced = hasOwner(w) ? clubOf(w).country : moneyCountry(club),
    cached = `${key}:${since}:${club.strength}:${w.year}:${priced}`;
  const hit = members.get(cached);
  if (hit) return hit;
  const r = random(key),
    traits = STAFF_INFO[role].traits;
  const name = personName(moneyCountry(club), r),
    trait = traits[integer(r, 0, traits.length - 1)],
    { spread, levels } = STAFF_MARKET_CONFIG,
    ability = clamp(Math.round(club.strength + integer(r, -spread, spread)), ...levels),
    // Younger than his prime he can still reach 0.9–1.8 a year above his level (→STAFF-16).
    room = Math.max(0, COACH_CAREER.prime - (w.year - born)),
    potential = clamp(Math.round(ability + room * (0.9 + r() * 0.9)), ability, 95);
  const member: Staff = {
    id: `club-staff:${club.id}:${role}:${count}`,
    role,
    name,
    ability,
    ...(trait ? { trait } : {}),
    wage: coachWage(w, ability, priced),
    since,
    until: w.year + 1,
    born,
    potential,
  };
  if (members.size > 8192) members.clear();
  members.set(cached, member);
  return member;
}

const fee = (wage: string) => ratio(wage, 1n, 4n);
/** The post's free agents we may sign now, at the going signing fee of a quarter of his wage. */
export function freeStaff(w: World, role: StaffRole): StaffCandidate[] {
  return (staffMarketOf(w).free[role] ?? [])
    .filter((member) => age(w, member) < STAFF_MARKET_CONFIG.retireAge)
    .map((member) => ({
      ...member,
      since: w.year,
      until: w.year + DELEGATED_TERM,
      source: 'free' as const,
      fee: fee(member.wage),
    }));
}
/**
 * The post's ablest holders at the clubs of our league and the division above (→STAFF-49), each
 * costing his club compensation of `compensationWages` annual wages on top of his signing fee.
 */
export function poachStaff(
  w: World,
  role: StaffRole,
  clubs: readonly Club[] = poachable(w),
): StaffCandidate[] {
  return clubs
    .map((club) => ({ club, member: clubStaffMember(w, club, role) }))
    .sort((a, b) => b.member.ability - a.member.ability || compareIds(a.club.id, b.club.id))
    .slice(0, STAFF_MARKET_CONFIG.poachList)
    .map(({ club, member }) => ({
      ...member,
      since: w.year,
      until: w.year + DELEGATED_TERM,
      source: 'club' as const,
      club: club.id,
      fee: fee(member.wage),
      compensation: (
        BigInt(member.wage) * BigInt(STAFF_MARKET_CONFIG.compensationWages)
      ).toString(),
    }));
}

/** The club names its next holder of the post: the one after whoever holds it now. */
export function nameNextHolder(w: World, clubId: string, role: StaffRole) {
  const club = w.clubs.find((one) => one.id === clubId);
  if (!club) return;
  const { count } = holderOf(w, club, role),
    clubs = market(w).clubs;
  (clubs[clubId] ??= {})[role] = [count + 1, w.year];
}
/**
 * A hired candidate leaves the market (→STAFF-49): a free agent his pool; another club's holder
 * his post, a former player's employment there closing, and that club names its next holder.
 */
export function takeStaff(
  w: World,
  candidate: Pick<StaffCandidate, 'id' | 'role' | 'person' | 'source' | 'club'>,
) {
  if (candidate.source === 'club' && candidate.club) {
    if (candidate.person) closeEmployment(w, candidate.person, candidate.role);
    nameNextHolder(w, candidate.club, candidate.role);
    return;
  }
  // A former player waits as himself, not in a stored pool (→STAFF-27).
  if (candidate.person) return;
  const m = market(w),
    pool = m.free[candidate.role];
  if (pool) m.free[candidate.role] = pool.filter((member) => member.id !== candidate.id);
}
/**
 * A paid coach who leaves our club, replaced, released or unrenewed, joins his post's free agents
 * at the going wage for his ability (→STAFF-49). Volunteers and former players, who wait as the
 * people they are (→STAFF-27), do not; nor does anyone past `retireAge`.
 */
export function joinStaffPool(w: World, member: Staff) {
  if (
    !hasOwner(w) ||
    member.person ||
    BigInt(member.wage) === 0n ||
    age(w, member) >= STAFF_MARKET_CONFIG.retireAge
  )
    return;
  const m = market(w),
    { term: _term, ...rest } = member;
  void _term;
  const pool = [
    ...(m.free[member.role] ?? []).filter((other) => other.id !== member.id),
    { ...rest, wage: coachWage(w, member.ability), since: w.year, until: w.year + DELEGATED_TERM },
  ];
  m.free[member.role] = capped(pool, poolRange(w).max - retainedCount(w, member.role));
}

/**
 * The markets move (→STAFF-49) every four league rounds and at the season close, once per date:
 * each free agent signs elsewhere with 25% from a stream of his own, so matches and other draws
 * stay put, or retires at `retireAge`; new free agents fill each pool. Before anyone owns a club
 * nobody hires from them.
 */
export function refreshStaffMarket(w: World) {
  if (!hasOwner(w)) return;
  const m = market(w);
  if (m.year === w.year && m.round === w.round) return;
  for (const role of STAFF_ROLES) {
    const kept = (m.free[role] ?? []).filter(
      (member) =>
        age(w, member) < STAFF_MARKET_CONFIG.retireAge &&
        random(`${w.seed}:staff-market:${role}:${member.id}:${w.year}:${w.round}`)() >=
          STAFF_MARKET_CONFIG.signElsewhere,
    );
    m.free[role] = filled(
      w,
      role,
      kept,
      w.round,
      random(`${w.seed}:staff-market:${role}:${w.year}:${w.round}`),
    );
  }
  m.year = w.year;
  m.round = w.round;
}
