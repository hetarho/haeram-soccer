import { message as sourceMessage } from '../../contracts/src/messages';
import {
  considerPlayingCoach,
  handoverPlayingCoaches,
  expirePlayingCoachProposals,
} from './playing-coach';
import { coachingEntryReady } from './coaching-entry';
import { closeEmployment, openEmployment, profiledCoaches } from './person-careers';
import { ATTRIBUTES, type Attribute } from '../../contracts/src/player';
import { ATTRIBUTE_LABEL } from './player';
import { moraleOf } from './morale';
import type {
  Club,
  BudgetResponsibility,
  CoachCriteria,
  ContractTerm,
  ManagerStyle,
  ManagerTrait,
  PersonCareer,
  Player,
  Staff,
  StaffCandidate,
  StaffRole,
  TrainingFocus,
  World,
} from '../../contracts/src/types';
import { COUNTRIES, footballIndex } from '../../catalogs/src/index';
import { addEvent } from './events';
import { clubOf } from './player-state';
import { ownStarters, personName } from './world';
import { quote } from './quotes';
import { clamp, compareIds, integer, random, ratio, scaleBy } from './primitives';
import { debit } from './transactions';
import { appointDelegatedManager, contractSeason, managerRenewal, renewManager } from './ops-staff';
import { managerBeats, managerFits, managerLine, managerMatches } from './managerMarket';
import { directionLine } from './direction';
import { spendingStance } from './delegation';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts } from './finance';
import { currentDay, seasonDayOf } from './calendar';
import { coachSeason } from './coaching';
import { STYLE_INFO } from './styles';
import { freeStaff, joinStaffPool, poachStaff, takeStaff } from './club-staff';
import { poachable } from './managerMarket';
import { reachBand, SCOUT_CONFIG, SCOUT_HOME_LABEL } from './scout-search';
import {
  coachCriteriaOf,
  coachDelegated,
  MANAGER_PRIORITY_INFO,
  managerCriteriaOf,
} from './hiring';
import { isDelegated } from './responsibilities';
import { decisionId } from './stopping';
import {
  STAFF_ROLES,
  STAFF_INFO,
  STAFF_TRAIT_INFO,
  staffMember,
  CONTRACT_TERMS,
  DELEGATED_TERM,
  seasonsLeft,
  releaseCost,
  AUTO_RECOVERY_FATIGUE,
  AUTO_HARD_FATIGUE,
  AUTO_HARD_MORALE,
  AUTO_PLAYER_RECOVERY,
  isExpiring,
} from './staff-info';
export {
  STAFF_ROLES,
  STAFF_INFO,
  STAFF_TRAIT_INFO,
  MANAGER_TRAIT_INFO,
  staffMember,
  CONTRACT_TERMS,
  DELEGATED_TERM,
  seasonsLeft,
  releaseCost,
  AUTO_RECOVERY_FATIGUE,
  AUTO_HARD_FATIGUE,
  AUTO_HARD_MORALE,
  AUTO_PLAYER_RECOVERY,
  isExpiring,
} from './staff-info';

export interface StaffEffects {
  /** Per-attribute round development multipliers, set by the department owning each (→STAFF-11). */
  development: Record<Attribute, number>;
  /** Extra multiplier for players aged 21 or younger. */
  youthDevelopment: number;
  /** Fatigue recovered per settled round, added to the training focus. */
  recoveryBonus: number;
  /** Potential added to academy intakes. */
  academyQuality: number;
  /** Academy round development multiplier. */
  academyGrowth: number;
  /** Multiplier on asking transfer fees. */
  feeMultiplier: number;
  /** Added to the chance that a selling club accepts our bid (0–1 scale). */
  bidAcceptance: number;
}

/** Hire-candidate habits; a fourth of candidates have none. */
export const MANAGER_TRAITS: readonly ManagerTrait[] = ['youth', 'rotation', 'stable'];

/**
 * A hire candidate's selection habit, drawn from its own stream so other attributes stay put. A
 * school that never shows the drawn habit shows the one it maps to instead (→STAFF-14).
 */
export function managerTrait(
  w: World,
  index: number,
  style?: ManagerStyle,
): ManagerTrait | undefined {
  const drawn =
    MANAGER_TRAITS[
      integer(random(`${w.seed}:manager-trait:${w.year}:${index}`), 0, MANAGER_TRAITS.length)
    ];
  const shown = drawn && style ? STYLE_INFO[style].traits?.[drawn] : undefined;
  return shown === undefined ? drawn : shown || undefined;
}

const NEUTRAL_ABILITY = 50;
/** A department without a coach is worse than an unremarkable volunteer. */
const VACANT_MULTIPLIER = 0.9;
/** The attributes each coaching department grows (→STAFF-11, →PLAYER-15). */
export const DEPARTMENT_ATTRIBUTES: Partial<Record<StaffRole, readonly Attribute[]>> = {
  assistant: ['passing', 'vision', 'decisions', 'composure'],
  attack: ['finishing', 'dribbling', 'crossing'],
  defense: ['tackling', 'positioning', 'heading'],
  goalkeeping: ['reflexes', 'handling', 'distribution'],
  fitness: ['pace', 'stamina', 'strength'],
};
/** A developer coach's pull on growth of players aged 21 or younger, multiplied across roles. */
export const YOUTH_DEVELOPER: Partial<Record<StaffRole, number>> = {
  assistant: 1.3,
  youth: 1.1,
  attack: 1.05,
  defense: 1.05,
};
/** Rounds without producing -0, which would differ from 0 under strict equality. */
const whole = (value: number) => Math.round(value) || 0;

/** Department strength: exactly 1 at ability 50, bounded to 0.85–1.25. */
export function departmentMultiplier(ability: number) {
  return clamp(1 + (ability - NEUTRAL_ABILITY) / 200, 0.85, 1.25);
}

function neutralEffects(): StaffEffects {
  return {
    development: Object.fromEntries(ATTRIBUTES.map((a) => [a, 1])) as Record<Attribute, number>,
    youthDevelopment: 1,
    recoveryBonus: 0,
    academyQuality: 0,
    academyGrowth: 1,
    feeMultiplier: 1,
    bidAcceptance: 0,
  };
}

/** Applies one department's coach (or vacancy) to the effects it owns. */
function applyDepartment(effects: StaffEffects, role: StaffRole, member: Staff | undefined) {
  const factor = member
    ? departmentMultiplier(member.ability) * (member.trait === 'specialist' ? 1.15 : 1)
    : VACANT_MULTIPLIER;
  for (const attribute of DEPARTMENT_ATTRIBUTES[role] ?? [])
    effects.development[attribute] = factor;
  if (member?.trait === 'developer') effects.youthDevelopment *= YOUTH_DEVELOPER[role] ?? 1;
  if (role === 'fitness')
    effects.recoveryBonus = member
      ? clamp(whole((member.ability - NEUTRAL_ABILITY) / 20), -1, 2) +
        (member.trait === 'recovery' ? 2 : 0)
      : -1;
  if (role === 'youth') {
    effects.academyQuality = member
      ? whole((member.ability - NEUTRAL_ABILITY) / 5) + (member.trait === 'spotter' ? 6 : 0)
      : -5;
    effects.academyGrowth = member
      ? departmentMultiplier(member.ability) * (member.trait === 'developer' ? 1.3 : 1)
      : VACANT_MULTIPLIER;
  }
  // The 단장 carries the transfer negotiation (→STAFF-20).
  if (role === 'director') {
    effects.feeMultiplier = member?.trait === 'negotiator' ? 0.9 : 1;
    effects.bidAcceptance = member
      ? (member.ability - NEUTRAL_ABILITY) / 250 + (member.trait === 'negotiator' ? 0.1 : 0)
      : -0.05;
  }
}

/** Neutral for absent staff (older saves) and for ability-50 staff without a trait. */
export function staffEffects(w: World): StaffEffects {
  const effects = neutralEffects();
  if (!w.staff) return effects;
  for (const role of STAFF_ROLES) applyDepartment(effects, role, staffMember(w, role));
  return effects;
}
/**
 * What one department adds on its own, every other effect neutral: `staffEffects` applies the
 * departments in turn, so these combine to it (→WEB-116).
 */
export function departmentEffects(w: World, role: StaffRole): StaffEffects {
  const effects = neutralEffects();
  if (w.staff) applyDepartment(effects, role, staffMember(w, role));
  return effects;
}

const times = (value: number) => `×${value.toFixed(2)}`;
const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
/** One line describing what this department currently adds, for the coaching staff view. */
export function staffImpact(w: World, role: StaffRole): string {
  const effects = neutralEffects();
  const member = w.staff ? staffMember(w, role) : ({ role, ability: NEUTRAL_ABILITY } as Staff);
  applyDepartment(effects, role, member);
  const lines: string[] = [];
  const owned = DEPARTMENT_ATTRIBUTES[role];
  if (owned)
    lines.push(
      sourceMessage('copy.staff.5b59177d56', {
        p0: owned.map((a) => ATTRIBUTE_LABEL[a]).join('·'),
        p1: times(effects.development[owned[0]!]),
      }),
    );
  if (effects.youthDevelopment !== 1)
    lines.push(sourceMessage('copy.staff.413059d5de', { p0: times(effects.youthDevelopment) }));
  if (role === 'fitness')
    lines.push(sourceMessage('copy.staff.d9633a4a27', { p0: signed(effects.recoveryBonus) }));
  if (role === 'youth')
    lines.push(
      sourceMessage('copy.staff.a90e5fd56d', { p0: signed(effects.academyQuality) }),
      sourceMessage('copy.staff.3bdb44c221', { p0: times(effects.academyGrowth) }),
    );
  // How far he looks and how many he lists per line (→CLUB-51), before the club's settings.
  if (role === 'scout') {
    const band = reachBand(member?.ability);
    lines.push(
      sourceMessage('copy.staff.3c614719b7', { p0: SCOUT_HOME_LABEL[band.home] }),
      sourceMessage('copy.staff.05ebd74ab4', { p0: band.perLine }),
    );
    if (member?.trait === 'spotter')
      lines.push(sourceMessage('copy.staff.09d42b99df', { p0: SCOUT_CONFIG.youngAge }));
  }
  if (role === 'director') {
    lines.push(
      sourceMessage('copy.staff.9861fae062', {
        p0: signed(Math.round(effects.bidAcceptance * 100)),
      }),
    );
    if (effects.feeMultiplier !== 1)
      lines.push(
        sourceMessage('copy.RecruitmentDesk.73bc6c6e24', { p0: times(effects.feeMultiplier) }),
      );
  }
  return `${member ? '' : sourceMessage('copy.staff.90c032fb75')}${lines.join(' · ')}`;
}

/** A new club's staff: one unpaid ability-50 member per post, the 단장 too, so it starts neutral. */
export function basicStaff(w: World): Staff[] {
  const code = clubOf(w).country;
  return STAFF_ROLES.map((role) => ({
    id: `${w.playerClub}:staff:basic:${role}`,
    role,
    name: personName(code, random(`${w.seed}:staff:basic:${role}`)),
    ability: NEUTRAL_ABILITY,
    // Unpaid 1901 volunteers: the founding budget is unchanged by the staff.
    wage: '0',
    since: w.year,
    until: w.year + 1,
  }));
}
export function staffWageTotal(w: World): bigint {
  return (w.staff || []).reduce((sum, member) => sum + BigInt(member.wage), 0n);
}
/**
 * The country whose money prices a club's manager and coaches before anyone owns a club
 * (→WORLD-13): its own, or the first playable country's for a club from outside them.
 */
export function moneyCountry(club: Pick<Club, 'country'>) {
  return COUNTRIES.some((c) => c.code === club.country) ? club.country : COUNTRIES[0]!.code;
}
/** A price-indexed amount carried onto the football index of the club's country (→ECON-26). */
export function footballScaled(w: World, amount: string, code = clubOf(w).country) {
  const real = footballIndex(code, w.year).real;
  return scaleBy(amount, real, 1_000_000n);
}
/** What a manager or coach asks this season: the price quote on the football index (→ECON-26). */
export function staffQuote(w: World, units: number, code = clubOf(w).country) {
  return footballScaled(w, quote(code, w.year, units), code);
}
export function checkTerm(term: ContractTerm | undefined) {
  if (term !== undefined && !CONTRACT_TERMS.includes(term))
    throw new Error(sourceMessage('copy.staff.ccee77b460'));
}
/** The owner's chosen term stays with the contract; one signed without a choice has none. */
export function withTerm<T extends { term?: ContractTerm }>(person: T, term?: ContractTerm): T {
  const { term: _previous, ...rest } = person;
  void _previous;
  return (term === undefined ? rest : { ...rest, term }) as T;
}
/**
 * A coach's going wage: it follows his current ability (→STAFF-16). A coach wage cap names this
 * wage for an ability of 50–90 (→STAFF-15).
 */
export function coachWage(w: World, ability: number, code = clubOf(w).country) {
  return staffQuote(w, Math.max(0, (ability - 30) * 1.5), code);
}
/**
 * A post's candidates (→STAFF-49): its free agents, the former players waiting for it (→STAFF-27),
 * then other clubs' holders; anyone already working for us is not offered.
 */
export function staffCandidates(w: World, role: StaffRole): StaffCandidate[] {
  if (!STAFF_ROLES.includes(role)) return [];
  return staffMarket(w, [role])[role]!;
}
/**
 * Every role's candidates at once, reading the person registry and the clubs a single time: the
 * registry grows with the career, and the view lists every department each day.
 */
export function staffMarket(
  w: World,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Partial<Record<StaffRole, StaffCandidate[]>> {
  const employed = new Set((w.staff || []).map((member) => member.id)),
    ready = new Map<StaffRole, PersonCareer[]>(),
    quotes = new Map<number, { wage: string; fee: string }>(),
    clubs = poachable(w);
  for (const person of profiledCoaches(w)) {
    const role = person.coaching?.role;
    if (!role || !roles.includes(role) || !coachingEntryReady(person)) continue;
    const same = ready.get(role);
    if (same) same.push(person);
    else ready.set(role, [person]);
  }
  return Object.fromEntries(
    roles.map((role) => {
      const retained: StaffCandidate[] = (ready.get(role) ?? [])
        .sort((a, b) => compareIds(a.id, b.id))
        .map((person) => {
          const coaching = person.coaching!;
          let quote = quotes.get(coaching.ability);
          if (!quote) {
            const wage = coachWage(w, coaching.ability);
            quote = { wage, fee: ratio(wage, 1n, 4n) };
            quotes.set(coaching.ability, quote);
          }
          return {
            id: person.id,
            person: person.id,
            name: person.name,
            born: person.born,
            role,
            ability: coaching.ability,
            potential: coaching.potential,
            wage: quote.wage,
            since: w.year,
            until: w.year + 3,
            source: 'free' as const,
            fee: quote.fee,
          };
        });
      return [
        role,
        [...freeStaff(w, role), ...retained, ...poachStaff(w, role, clubs)].filter(
          (candidate) => !employed.has(candidate.id),
        ),
      ];
    }),
  );
}
const roleOrder = (a: Staff, b: Staff) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role);
/** His signing fee and any compensation to his club (→STAFF-49). */
export const staffHireCost = (candidate: Pick<StaffCandidate, 'fee' | 'compensation'>) =>
  BigInt(candidate.fee) + BigInt(candidate.compensation ?? '0');
/**
 * A hired candidate leaves the market and, with the fields only an offer carries dropped, becomes
 * a member of our staff under the record his move keeps (→STAFF-50); another club's holder is
 * named with the compensation it took.
 */
function fromMarket(w: World, candidate: StaffCandidate) {
  const person = takeStaff(w, candidate);
  const { fee: _fee, source: _source, club, compensation, ...member } = candidate;
  void _fee;
  void _source;
  const from = club && w.clubs.find((one) => one.id === club)?.name;
  return {
    member: person ? { ...member, person } : member,
    note: from
      ? [
          sourceMessage('copy.staff.054dd38a4d', { p0: from }),
          sourceMessage('copy.staff.1024b0eddb', { p0: moneyLabel(w, compensation ?? '0') }),
        ]
      : [],
  };
}

/**
 * Hires a candidate for `term` seasons at the wage he asks now, fixed for the term; without a term
 * he signs for the length he was offered with. Another club's holder also costs his club its
 * compensation (→STAFF-49).
 */
export function hireStaff(
  w: World,
  role: StaffRole,
  candidate: number,
  term?: ContractTerm,
  candidateId?: string,
): void {
  checkTerm(term);
  const pool = staffCandidates(w, role);
  const offer = candidateId
    ? pool.find((person) => person.id === candidateId)
    : Number.isInteger(candidate)
      ? pool[candidate]
      : undefined;
  if (!offer) throw new Error(sourceMessage('copy.staff.505336b8a6'));
  // Older saves without staff start from the neutral volunteers.
  const staff = w.staff || basicStaff(w),
    current = staff.find((member) => member.role === role),
    owed = releaseCost(w, current),
    total = (staffHireCost(offer) + BigInt(owed)).toString();
  debit(w, total);
  const { member: offered, note } = fromMarket(w, offer);
  const member = withTerm(term ? { ...offered, until: w.year + term } : offered, term);
  departStaff(w, current);
  if (member.person) openEmployment(w, member.person, member.role, w.playerClub);
  w.staff = [...staff.filter((other) => other.role !== role), member].sort(roleOrder);
  addEvent(
    w,
    'staff-hire',
    sourceMessage('copy.staff.3398e98a96', { p0: STAFF_INFO[role].label, p1: member.name }),
    [
      ...note.slice(0, 1),
      sourceMessage('copy.staff.9a9b1e4758', { p0: member.ability }),
      member.trait ? STAFF_TRAIT_INFO[member.trait].label : sourceMessage('copy.staff.93fdd090e1'),
      sourceMessage('copy.ScoutShortlist.572ddadbfc', { p0: moneyLabel(w, member.wage) }),
      sourceMessage('copy.format.87aef223c3', { p0: contractSeason(member.until) }),
      sourceMessage('copy.ops_staff.612034e799', { p0: moneyLabel(w, offer.fee) }),
      ...note.slice(1),
      ...(owed !== '0'
        ? [sourceMessage('copy.staff.bf5993148d', { p0: current!.name, p1: moneyLabel(w, owed) })]
        : []),
    ].join(' · '),
    total,
  );
}
/**
 * A member leaves our staff: his employment with us closes (→STAFF-50), a former player's with his
 * learned values kept; a paid coach joins his post's free agents (→STAFF-49).
 */
export function departStaff(w: World, member?: Staff) {
  if (!member) return;
  const coaching = member.person && w.people?.[member.person]?.coaching;
  if (coaching) {
    coaching.ability = member.ability;
    coaching.potential = member.potential ?? coaching.potential;
  }
  if (member.person) closeEmployment(w, member.person, member.role);
  joinStaffPool(w, member);
}
export function releaseStaff(w: World, role: StaffRole, mandatory = false): void {
  const staff = w.staff || basicStaff(w),
    member = staff.find((other) => other.role === role);
  if (!member) throw new Error(sourceMessage('copy.staff.4ea7757113'));
  const owed = releaseCost(w, member);
  if (owed !== '0') debit(w, owed, mandatory);
  departStaff(w, member);
  w.staff = staff.filter((other) => other.role !== role);
  addEvent(
    w,
    'staff-release',
    sourceMessage('copy.staff.d481d4cf1e', { p0: STAFF_INFO[role].label, p1: member.name }),
    owed !== '0'
      ? sourceMessage('copy.staff.515589e951', {
          p0: seasonsLeft(w, member.until),
          p1: moneyLabel(w, owed),
        })
      : sourceMessage('copy.staff.91ea5b6155'),
    owed !== '0' ? owed : undefined,
  );
}
/** The assistant's reasoning, for showing why the staff chose this week's focus. */
export function autoTrainingAdvice(w: World): { focus: TrainingFocus; reason: string } {
  const starters = ownStarters(w);
  if (!starters.length)
    return { focus: 'balanced', reason: sourceMessage('copy.staff.098c9d8278') };
  const fatigue = starters.reduce((sum, player) => sum + player.fatigue, 0) / starters.length,
    tired = sourceMessage('copy.staff.4a48879849', { p0: Math.round(fatigue) });
  if (fatigue >= AUTO_RECOVERY_FATIGUE)
    return { focus: 'recovery', reason: sourceMessage('copy.staff.03c7709857', { p0: tired }) };
  // 하드 트레이닝 only on fresh legs and a squad in good spirits (→CLUB-13).
  const fresh = fatigue < AUTO_HARD_FATIGUE && moraleOf(w) >= AUTO_HARD_MORALE;
  if (fresh && staffMember(w, 'assistant')?.trait === 'developer')
    return { focus: 'hard', reason: sourceMessage('copy.staff.8a11aaca16', { p0: tired }) };
  // 데뷔 시점 빠른 데뷔 calls for hard work from two young starters (→CLUB-13, CLUB-32).
  const young = starters.filter((player) => isYouth(w, player)).length;
  if (fresh && young >= (w.direction?.debut === 'early' ? 2 : 3))
    return {
      focus: 'hard',
      reason: sourceMessage('copy.staff.d7899928f2', { p0: tired, p1: young }),
    };
  return { focus: 'balanced', reason: sourceMessage('copy.staff.fd15ae244c', { p0: tired }) };
}
/** The assistant's player rule: 회복 for a player at 40+ fatigue, no other exception of his own. */
export function autoPlayerFocus(_w: World, p: Player): TrainingFocus | undefined {
  return p.fatigue >= AUTO_PLAYER_RECOVERY ? 'recovery' : undefined;
}
/** The assistant's choice when training is delegated. */
export function autoTrainingFocus(w: World): TrainingFocus {
  return autoTrainingAdvice(w).focus;
}
/** An unpaid ability-50 coach the staff can always find, so no department stays empty. */
export function volunteer(w: World, role: StaffRole): Staff {
  return {
    id: `${w.playerClub}:staff:volunteer:${role}:${w.year}`,
    role,
    name: personName(clubOf(w).country, random(`${w.seed}:staff:volunteer:${role}:${w.year}`)),
    ability: NEUTRAL_ABILITY,
    wage: '0',
    since: w.year,
    until: w.year + 1,
  };
}
/** Cash left after `spend` still keeps the delegated person's cutoff with `wage` added to the costs. */
export function affordable(
  w: World,
  spend: bigint,
  wage: bigint,
  responsibility: BudgetResponsibility = 'staff',
) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / 46n;
  return BigInt(w.cash) - spend >= perRound * BigInt(spendingStance(w, responsibility).runway);
}
/** A match this much abler beats an expiring coach who meets the criteria, under 능력 높은 순. */
export const COACH_RENEWAL_MARGIN = 3;
/**
 * Under 연봉 낮은 순 a match beats the man in post when he asks at most 90% of the going wage the
 * man in post would renew at (→STAFF-15, STAFF-18).
 */
export function clearlyCheaper(wage: string, than: string) {
  return BigInt(wage) * 10n <= BigInt(than) * 9n;
}
type CoachCheck = [
  why: string,
  fits: (coach: Pick<Staff, 'ability' | 'trait' | 'wage'>) => boolean,
];
/**
 * The criteria a coach is judged by, affordability aside, each with the reason nobody passes it. A
 * trait the department lacks reads as any, as the criteria lines show it.
 */
function coachChecks(w: World, role: StaffRole, c: CoachCriteria): CoachCheck[] {
  const trait = c.trait && STAFF_INFO[role].traits.includes(c.trait) ? c.trait : undefined,
    cap = c.maxWageOvr === undefined ? undefined : BigInt(coachWage(w, c.maxWageOvr));
  return [
    [
      sourceMessage('copy.staff.614681d845', { p0: c.minAbility }),
      (coach) => coach.ability >= c.minAbility,
    ],
    ...(trait
      ? [
          [
            sourceMessage('copy.staff.81eb3103e9', { p0: STAFF_TRAIT_INFO[trait].label }),
            (coach) => coach.trait === trait,
          ] satisfies CoachCheck,
        ]
      : []),
    ...(cap === undefined
      ? []
      : [
          [
            sourceMessage('copy.staff.bb6522d828', { p0: c.maxWageOvr }),
            (coach) => BigInt(coach.wage) <= cap,
          ] satisfies CoachCheck,
        ]),
  ];
}
/** Whether a coach meets the department's criteria, affordability aside (→STAFF-15). */
export function coachFits(
  w: World,
  role: StaffRole,
  coach: Pick<Staff, 'ability' | 'trait' | 'wage'>,
) {
  return coachChecks(w, role, coachCriteriaOf(w)).every(([, fits]) => fits(coach));
}
const byWage = (a: { wage: string }, b: { wage: string }) =>
  BigInt(a.wage) < BigInt(b.wage) ? -1 : BigInt(a.wage) > BigInt(b.wage) ? 1 : 0;
/** At equal standing a free agent comes before another club's holder (→STAFF-15). */
const freeFirst = (a: StaffCandidate, b: StaffCandidate) =>
  (a.source === 'club' ? 1 : 0) - (b.source === 'club' ? 1 : 0);
/**
 * The post's candidates (→STAFF-49) who meet 코치 기조 and whom the club can afford in place of
 * `replacing` (cash after his fee and any compensation still keeps 재정 기조's runway with his wage
 * instead of the replaced one), in the option's order: the ablest or the cheapest first, then a
 * free agent before another club's holder, then the list's order (→STAFF-15).
 */
export function coachMatches(w: World, role: StaffRole, replacing?: Staff) {
  const c = coachCriteriaOf(w),
    checks = coachChecks(w, role, c),
    freed = replacing ? BigInt(replacing.wage) : 0n;
  return staffCandidates(w, role)
    .filter(
      (offer) =>
        checks.every(([, fits]) => fits(offer)) &&
        affordable(w, staffHireCost(offer), BigInt(offer.wage) - freed),
    )
    .sort(
      c.priority === 'ability'
        ? (a, b) => b.ability - a.ability || freeFirst(a, b)
        : (a, b) => byWage(a, b) || freeFirst(a, b),
    );
}
/** Why no candidate matches: the first criterion nobody meets, or that nobody is affordable. */
function noCoachReason(w: World, role: StaffRole) {
  let pool = staffCandidates(w, role);
  if (!pool.length) return sourceMessage('copy.staff.86001b51d0');
  for (const [why, fits] of coachChecks(w, role, coachCriteriaOf(w))) {
    pool = pool.filter(fits);
    if (!pool.length) return why;
  }
  return sourceMessage('copy.managerMarket.3bf57ff1eb');
}
const VOLUNTEER_HOLDS = sourceMessage('copy.staff.90376685f9');
/**
 * Whom 코치 기조 would hire today in a department, or why nobody, for its card (→STAFF-15). A coach
 * under contract stays until it ends; the line says so.
 */
export function coachPickPreview(
  w: World,
  role: StaffRole,
): { pick?: StaffCandidate; reason: string } {
  const c = coachCriteriaOf(w),
    member = staffMember(w, role),
    contracted = !!member && BigInt(member.wage) > 0n,
    later = contracted ? sourceMessage('copy.staff.2819959fa4') : '';
  if (c.volunteer) return { reason: sourceMessage('copy.staff.497bcb4825', { p0: later }) };
  const pick = coachMatches(w, role, member)[0];
  if (!pick)
    return {
      reason: sourceMessage('copy.staff.bed67f751b', {
        p0: noCoachReason(w, role),
        p1: contracted ? later : ` · ${VOLUNTEER_HOLDS}`,
      }),
    };
  const from = pick.club && w.clubs.find((club) => club.id === pick.club)?.name;
  return {
    pick,
    reason:
      [
        sourceMessage('copy.AcademyPanel.95ca4ba319', { p0: pick.name, p1: pick.ability }),
        ...(from ? [from] : []),
        pick.trait ? STAFF_TRAIT_INFO[pick.trait].label : sourceMessage('copy.staff.93fdd090e1'),
        sourceMessage('copy.ScoutShortlist.572ddadbfc', { p0: moneyLabel(w, pick.wage) }),
        sourceMessage('copy.ops_staff.612034e799', { p0: moneyLabel(w, pick.fee) }),
        ...(pick.compensation
          ? [sourceMessage('copy.staff.1024b0eddb', { p0: moneyLabel(w, pick.compensation) })]
          : []),
        sourceMessage('copy.staff.19bfb52d83', { p0: c.term }),
      ].join(' · ') + later,
  };
}
/** Once a season per department: the staff found no coach who meets 코치 기조 (→STAFF-15). */
function reportNoCoach(w: World, role: StaffRole) {
  const ref = `coach-search:${role}:${w.year}`;
  if (w.inbox?.some((item) => item.ref === ref)) return;
  const label = STAFF_INFO[role].label;
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.staff.ad27139d55', { p0: label }),
    detail: [noCoachReason(w, role), directionLine(w, 'coaches'), VOLUNTEER_HOLDS]
      .join(' · ')
      .slice(0, 400),
    attention: false,
    ref,
  });
}
/**
 * A delegated department's vacancy or volunteer's post (→STAFF-15): the first match takes it at
 * once for the criteria's term; with none, or with 자원봉사로 운영, a volunteer holds it, and a
 * search that found nobody is reported once a season. A coach under contract stays until it ends.
 * Older saves without staff are left as they are.
 */
export function fillDelegatedPost(w: World, role: StaffRole) {
  if (!w.staff) return;
  const member = staffMember(w, role);
  if (member && BigInt(member.wage) > 0n) return;
  if (considerPlayingCoach(w, role)) return;
  const c = coachCriteriaOf(w),
    hire = c.volunteer ? undefined : coachMatches(w, role, member)[0];
  if (hire) {
    appoint(w, { ...hire, until: w.year + c.term });
    return;
  }
  if (!member) appoint(w, volunteer(w, role));
  if (!c.volunteer) reportNoCoach(w, role);
}
/**
 * What a coach asks to stay `term` more seasons after his contract ends (two when absent;
 * delegated staff renew for their criteria's term): the going rate for his ability this season,
 * fixed for the term, and a 10% signing fee. At the season boundary his contract ended with the
 * season just closed.
 */
export function renewalTerms(w: World, member: Staff, term: ContractTerm = DELEGATED_TERM) {
  const wage = coachWage(w, member.ability);
  return { wage, fee: ratio(wage, 1n, 10n), until: Math.max(member.until, w.year) + term };
}
export function renewStaff(w: World, role: StaffRole, term?: ContractTerm) {
  checkTerm(term);
  const member = staffMember(w, role);
  if (!member || !isExpiring(w, member)) throw new Error(sourceMessage('copy.staff.f56d379331'));
  const terms = renewalTerms(w, member, term);
  debit(w, terms.fee);
  w.staff = w.staff!.map((other) =>
    other.role === role
      ? withTerm({ ...other, wage: terms.wage, until: terms.until }, term)
      : other,
  );
  addEvent(
    w,
    'staff-renew',
    sourceMessage('copy.staff.7422c62c85', { p0: STAFF_INFO[role].label, p1: member.name }),
    sourceMessage('copy.staff.6a03d48098', {
      p0: member.ability,
      p1: moneyLabel(w, terms.wage),
      p2: contractSeason(terms.until),
      p3: moneyLabel(w, terms.fee),
    }),
    terms.fee,
  );
}
/**
 * Puts `member` in charge of his post: a candidate is signed from the market, paying his signing
 * fee and any compensation to his club (→STAFF-49); a volunteer costs nothing.
 */
function appoint(w: World, member: Staff | StaffCandidate) {
  const offer = 'source' in member ? member : undefined,
    cost = offer ? staffHireCost(offer) : 0n,
    { member: staff, note } = offer ? fromMarket(w, offer) : { member, note: [] };
  if (cost > 0n) debit(w, cost.toString(), true);
  departStaff(w, staffMember(w, staff.role));
  if (staff.person) openEmployment(w, staff.person, staff.role, w.playerClub);
  w.staff = [...(w.staff || []).filter((other) => other.role !== staff.role), staff].sort(
    roleOrder,
  );
  addEvent(
    w,
    'staff-hire',
    sourceMessage('copy.staff.3398e98a96', { p0: STAFF_INFO[staff.role].label, p1: staff.name }),
    [
      ...note.slice(0, 1),
      sourceMessage('copy.staff.9a9b1e4758', { p0: staff.ability }),
      staff.trait ? STAFF_TRAIT_INFO[staff.trait].label : sourceMessage('copy.staff.93fdd090e1'),
      BigInt(staff.wage) > 0n
        ? sourceMessage('copy.ScoutShortlist.572ddadbfc', { p0: moneyLabel(w, staff.wage) })
        : sourceMessage('copy.staff.aae487bde3'),
      sourceMessage('copy.format.87aef223c3', { p0: contractSeason(staff.until) }),
      ...note.slice(1),
      sourceMessage('copy.staff.bf6725c150'),
    ].join(' · '),
    cost > 0n ? cost.toString() : undefined,
  );
  return staff;
}
/**
 * A delegated department at the season boundary (→STAFF-15), with `member` the coach whose term
 * ended (or none): a vacancy or a volunteer's post goes to the first match; an expiring paid coach
 * who meets the criteria and is affordable is renewed (going wage, 10% fee, the criteria's term)
 * unless the first match beats him clearly, otherwise the first match replaces him, else he is
 * renewed when affordable, else a volunteer takes the post. 자원봉사로 운영 keeps a volunteer.
 * Returns the line for the season's summary.
 */
function delegatedSeason(w: World, role: StaffRole, member: Staff | undefined) {
  const c = coachCriteriaOf(w),
    label = STAFF_INFO[role].label,
    first = c.volunteer ? undefined : coachMatches(w, role, member)[0],
    hired = (offer: StaffCandidate) => appoint(w, { ...offer, until: w.year + c.term });
  if (!member || BigInt(member.wage) === 0n) {
    if (considerPlayingCoach(w, role)) return sourceMessage('copy.staff.904f237b75', { p0: label });
    if (first)
      return sourceMessage('copy.staff.f43f389728', {
        p0: label,
        p1: hired(first).name,
        p2: first.ability,
      });
    if (!member)
      return sourceMessage('copy.staff.536ea9f157', {
        p0: label,
        p1: appoint(w, volunteer(w, role)).name,
      });
    w.staff = w.staff!.map((other) =>
      other.role === role ? { ...other, until: w.year + 1 } : other,
    );
    return undefined;
  }
  const terms = renewalTerms(w, member, c.term),
    payable =
      !c.volunteer && affordable(w, BigInt(terms.fee), BigInt(terms.wage) - BigInt(member.wage)),
    beaten =
      !!first &&
      (c.priority === 'ability'
        ? first.ability >= member.ability + COACH_RENEWAL_MARGIN
        : clearlyCheaper(first.wage, terms.wage));
  const keep = payable && (coachFits(w, role, { ...member, wage: terms.wage }) ? !beaten : !first);
  if (keep) {
    debit(w, terms.fee, true);
    w.staff = w.staff!.map((other) =>
      other.role === role ? withTerm({ ...other, wage: terms.wage, until: terms.until }) : other,
    );
    addEvent(
      w,
      'staff-renew',
      sourceMessage('copy.staff.7422c62c85', { p0: label, p1: member.name }),
      sourceMessage('copy.staff.3a81e47f89', {
        p0: member.ability,
        p1: moneyLabel(w, terms.wage),
        p2: contractSeason(terms.until),
      }),
      terms.fee,
    );
    return sourceMessage('copy.staff.2d9100b198', { p0: label, p1: member.name, p2: c.term });
  }
  if (considerPlayingCoach(w, role)) return sourceMessage('copy.staff.904f237b75', { p0: label });
  departStaff(w, member);
  w.staff = w.staff!.filter((other) => other.role !== role);
  addEvent(
    w,
    'staff-leave',
    sourceMessage('copy.staff.eb8e2e5784', { p0: label, p1: member.name }),
    `${member.since}–${w.year}`,
  );
  return first
    ? sourceMessage('copy.staff.ef012e7b72', {
        p0: label,
        p1: member.name,
        p2: hired(first).name,
        p3: first.ability,
      })
    : sourceMessage('copy.staff.1aafebc711', {
        p0: label,
        p1: member.name,
        p2: appoint(w, volunteer(w, role)).name,
      });
}
/**
 * Season boundary: contracts end, renew or are replaced. Each department delegated to the staff
 * (→STAFF-15) is judged by its criteria and never left empty; elsewhere expiring coaches leave
 * and the owner is told, and volunteers stay another season.
 */
export function seasonStaff(w: World): void {
  expirePlayingCoachProposals(w);
  if (!w.staff) return;
  developStaff(w);
  const report: string[] = [];
  for (const role of STAFF_ROLES) {
    const member = staffMember(w, role);
    if (member && member.until > w.year) continue;
    if (coachDelegated(w, role)) {
      const line = delegatedSeason(w, role, member);
      if (line) report.push(line);
      continue;
    }
    if (!member) continue;
    if (BigInt(member.wage) === 0n) {
      w.staff = w.staff.map((other) =>
        other.role === role ? { ...other, until: w.year + 1 } : other,
      );
      continue;
    }
    const label = STAFF_INFO[role].label;
    departStaff(w, member);
    w.staff = w.staff.filter((other) => other.role !== role);
    addEvent(
      w,
      'staff-leave',
      sourceMessage('copy.staff.eb8e2e5784', { p0: label, p1: member.name }),
      sourceMessage('copy.staff.4a68f7aeca', { p0: member.since, p1: w.year }),
    );
    pushInbox(w, {
      kind: 'staff-renewal',
      title: sourceMessage('copy.staff.e9ba776814', { p0: label, p1: member.name }),
      detail: sourceMessage('copy.staff.b3b9c5c3d6', { p0: label }),
      attention: true,
      ref: member.id,
    });
  }
  if (report.length)
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.staff.e498a1e744', { p0: report.length }),
      detail: `${directionLine(w, 'coaches')} · ${report.join(' · ')}`.slice(0, 400),
      attention: false,
    });
}
/**
 * A season of every paid coach's career (→STAFF-16): the young learn toward their ceiling, those
 * past 60 fade. Volunteers and coaches from older saves have no age or ceiling and stay put.
 */
function developStaff(w: World) {
  const changes: string[] = [];
  w.staff = w.staff!.map((member) => {
    if (member.born === undefined || member.potential === undefined) return member;
    const age = w.year - member.born,
      next = coachSeason(
        `${w.seed}:staff-growth:${member.id}:${w.year}`,
        member.ability,
        member.potential,
        age,
      );
    if (next.ability === member.ability && next.potential === member.potential) return member;
    if (next.ability !== member.ability)
      changes.push(
        `${STAFF_INFO[member.role].label} ${member.name} ${member.ability}→${next.ability}`,
      );
    return { ...member, ability: next.ability, potential: next.potential };
  });
  for (const member of w.staff || []) {
    const coaching = member.person && w.people?.[member.person]?.coaching;
    if (coaching) {
      coaching.ability = member.ability;
      coaching.potential = member.potential ?? coaching.potential;
    }
  }
  if (changes.length)
    addEvent(
      w,
      'staff-growth',
      sourceMessage('copy.staff.60930ed8e0', { p0: changes.length }),
      changes.join(' · ').slice(0, 400),
    );
}
/** Spring renewal day: the owner hears whose contracts end at the season's close. */
export function renewalDay(year: number) {
  return seasonDayOf(year, 4, 1);
}
/** A match this much better by OVR or potential beats an expiring manager who meets the criteria. */
export const MANAGER_RENEWAL_MARGIN = 3;
/**
 * 1 April with the manager post delegated (→STAFF-18): a manager who meets the criteria is renewed
 * for the criteria's term (the firefighter one, never past his 70th year) unless the first match
 * beats him clearly in the chosen order; one who does not meet them is let go at the close when a
 * match exists, the staff appointing then, and renewed when none does. Returns false when the club
 * cannot afford the renewal it would make, so the owner is told instead.
 */
function delegatedManagerRenewal(w: World, school: string, limit: number) {
  const m = w.manager,
    c = managerCriteriaOf(w),
    term = Math.min(c.term, limit) as ContractTerm,
    kept = managerRenewal(w, term)!,
    fits = managerFits(w, { ...m, wage: kept.wage }),
    first = managerMatches(w)[0];
  if (first && (!fits || managerBeats(c, first, m, kept.wage))) {
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.staff.b22e75686c', { p0: school, p1: m.name }),
      detail: sourceMessage('copy.staff.447ddbb17d', {
        p0: fits
          ? sourceMessage('copy.staff.e600675c8f', {
              p0: directionLine(w, 'manager'),
              p1: MANAGER_PRIORITY_INFO[c.priority],
              p2: managerLine(w, first),
              p3: m.ability,
              p4: m.potential ?? m.ability,
              p5: moneyLabel(w, kept.wage),
            })
          : sourceMessage('copy.staff.8d0a001ffb', { p0: m.name, p1: managerLine(w, first) }),
      }).slice(0, 400),
      attention: false,
      ref: m.id,
    });
    return true;
  }
  if (!affordable(w, BigInt(kept.fee), BigInt(kept.wage) - BigInt(m.wage), 'manager')) return false;
  renewManager(w, term, true);
  pushInbox(w, {
    kind: 'staff-report',
    title: sourceMessage('copy.staff.2df73a2786', { p0: school, p1: m.name }),
    detail: sourceMessage('copy.staff.7bd5fe0e53', {
      p0: fits ? sourceMessage('copy.staff.fe8353cad0') : sourceMessage('copy.staff.55a196f21e'),
      p1: term,
      p2: moneyLabel(w, kept.wage),
      p3: moneyLabel(w, kept.fee),
      p4: contractSeason(kept.until),
    }),
    attention: false,
  });
  return true;
}
/**
 * 1 April for a manager whose contract ends at the close: no contract renews itself (→STAFF-14).
 * With the manager post delegated the staff decide by the owner's criteria (→STAFF-18) and report
 * it; else, or when the club cannot afford the renewal, the owner hears that he leaves unless
 * renewed. Coaching staff (absent in older saves) play no part.
 */
export function managerRenewalReminder(w: World) {
  const m = w.manager,
    terms = managerRenewal(w);
  if (!terms) return;
  const school = m.style ? `${STYLE_INFO[m.style].label} ` : '',
    managerDelegated = isDelegated(w, 'manager');
  if (managerDelegated && delegatedManagerRenewal(w, school, terms.limit)) {
    const id = decisionId('manager', m.id, `${m.until}`);
    if (!w.decisionChoices?.includes(id)) (w.decisionChoices ||= []).push(id);
    return;
  }
  const seasons =
    terms.limit === 1
      ? sourceMessage('copy.staff.413068e3c4')
      : sourceMessage('copy.staff.3de821da4f', { p0: terms.limit });
  pushInbox(w, {
    kind: 'staff-renewal',
    title: sourceMessage('copy.staff.872f5c1c2c', { p0: school, p1: m.name }),
    detail: sourceMessage('copy.staff.b0e7fd3114', {
      p0: moneyLabel(w, terms.wage),
      p1: moneyLabel(w, terms.fee),
      p2: seasons,
      p3: managerDelegated ? sourceMessage('copy.staff.ea819e5260') : '',
    }),
    attention: true,
    ref: m.id,
  });
}
/**
 * Daily: on 1 April an expiring manager's renewal comes up; with the manager post delegated the
 * staff look for a successor to an interim every day (→STAFF-18); each department delegated to the
 * staff has its vacancy or volunteer's post filled by its criteria (→STAFF-15); for the other
 * departments the renewal season is announced on 1 April when contracts end at the close.
 */
export function dailyStaff(w: World) {
  expirePlayingCoachProposals(w);
  handoverPlayingCoaches(w);
  if (currentDay(w) === renewalDay(w.year)) managerRenewalReminder(w);
  if (w.manager.interim && isDelegated(w, 'manager')) appointDelegatedManager(w);
  if (!w.staff) return;
  for (const role of STAFF_ROLES) if (coachDelegated(w, role)) fillDelegatedPost(w, role);
  if (currentDay(w) !== renewalDay(w.year)) return;
  const expiring = w.staff.filter(
    (member) => isExpiring(w, member) && !coachDelegated(w, member.role),
  );
  if (!expiring.length) return;
  pushInbox(w, {
    kind: 'staff-renewal',
    title: sourceMessage('copy.staff.63d1276353', { p0: expiring.length }),
    detail: sourceMessage('copy.staff.5def6e5c7c', {
      p0: expiring
        .map((member) =>
          sourceMessage('copy.staff.e5885878dc', {
            p0: STAFF_INFO[member.role].label,
            p1: member.name,
            p2: member.ability,
          }),
        )
        .join(' · '),
    }).slice(0, 400),
    attention: true,
  });
}
export function isYouth(w: World, player: Player) {
  return w.year - player.born <= 21;
}
