import {
  considerPlayingCoach,
  handoverPlayingCoaches,
  expirePlayingCoachProposals,
} from './playing-coach';
import { coachingEntryReady } from './coaching-entry';
import { closeEmployment, openEmployment } from './person-careers';
import { ATTRIBUTES, type Attribute } from '../../contracts/src/player';
import { ATTRIBUTE_LABEL } from './player';
import { moraleOf } from './morale';
import type {
  CoachCriteria,
  ContractTerm,
  ManagerStyle,
  ManagerTrait,
  Player,
  Staff,
  StaffRole,
  StaffTrait,
  TrainingFocus,
  World,
} from '../../contracts/src/types';
import { footballIndex } from '../../catalogs/src/index';
import { addEvent, clubOf, ownStarters, personName, quote } from './world';
import { clamp, compareIds, integer, random, ratio } from './primitives';
import { debit } from './transactions';
import { appointDelegatedManager, contractSeason, managerRenewal, renewManager } from './ops-staff';
import { managerBeats, managerFits, managerLine, managerMatches } from './managerMarket';
import { directionLine, financeStance } from './direction';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts } from './finance';
import { currentDay, seasonDayOf } from './calendar';
import { COACH_CAREER, coachProspect, coachSeason } from './coaching';
import { STYLE_INFO } from './styles';
import {
  coachCriteriaOf,
  coachDelegated,
  MANAGER_PRIORITY_INFO,
  managerCriteriaOf,
} from './hiring';
import { isDelegated } from './responsibilities';
import { decisionId } from './stopping';

/** The 단장 beside the manager, then the coaching departments below him, in display order. */
export const STAFF_ROLES: readonly StaffRole[] = [
  'director',
  'assistant',
  'attack',
  'defense',
  'goalkeeping',
  'fitness',
  'youth',
  'scout',
];
export const STAFF_INFO: Record<StaffRole, { label: string; duty: string; traits: StaffTrait[] }> =
  {
    director: {
      label: '단장',
      duty: '이적·계약 협상과 감독 선임',
      traits: ['negotiator', 'closer'],
    },
    assistant: {
      label: '수석코치',
      duty: '훈련 방향과 미드필더 패스 성장',
      traits: ['developer', 'specialist'],
    },
    attack: { label: '공격 코치', duty: '공격 능력 성장', traits: ['specialist', 'developer'] },
    defense: { label: '수비 코치', duty: '수비 능력 성장', traits: ['specialist', 'developer'] },
    goalkeeping: { label: '골키퍼 코치', duty: '골키퍼 능력 성장', traits: ['specialist'] },
    fitness: {
      label: '피지컬 코치',
      duty: '체력 성장과 피로 회복',
      traits: ['recovery', 'specialist'],
    },
    youth: {
      label: '유스 디렉터',
      duty: '아카데미 입단 수준과 유소년 성장',
      traits: ['developer', 'spotter'],
    },
    scout: {
      label: '수석 스카우트',
      duty: '이적 시장 후보 수와 잠재력',
      traits: ['spotter'],
    },
  };
export const STAFF_TRAIT_INFO: Record<StaffTrait, { label: string; effect: string }> = {
  developer: { label: '육성형', effect: '21세 이하 선수 성장이 빨라져요' },
  specialist: { label: '전문가', effect: '담당 능력 성장이 더 빨라져요' },
  recovery: { label: '회복 전문', effect: '라운드마다 피로를 더 많이 풀어요' },
  spotter: { label: '발굴가', effect: '잠재력 높은 선수를 찾아와요' },
  closer: { label: '속전속결', effect: '요구액보다 더 주고 빨리 끝내요' },
  negotiator: { label: '협상가', effect: '이적료를 낮추고 낮은 제안부터 흥정해요' },
};
export const MANAGER_TRAIT_INFO: Record<ManagerTrait, { label: string; effect: string }> = {
  youth: { label: '유망주 중용', effect: '자동 선발에서 21세 이하 선수를 더 자주 기용해요' },
  rotation: { label: '로테이션', effect: '지친 선수를 적극적으로 쉬게 해요' },
  stable: { label: '베스트 일레븐', effect: '피로가 있어도 주전을 꾸준히 기용해요' },
};

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
  /** Potential added to market candidates. */
  scoutPotential: number;
  /** Number of transfer market candidates. */
  scoutCandidates: number;
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
/** Ability bands of the three candidates offered per role each season. */
const CANDIDATE_ABILITY: readonly (readonly [number, number])[] = [
  [45, 65],
  [55, 78],
  [65, 90],
];
/** The attributes each coaching department grows (→STAFF-11, →PLAYER-15). */
export const DEPARTMENT_ATTRIBUTES: Partial<Record<StaffRole, readonly Attribute[]>> = {
  assistant: ['passing', 'vision'],
  attack: ['finishing', 'dribbling', 'crossing'],
  defense: ['tackling', 'positioning', 'heading'],
  goalkeeping: ['reflexes', 'handling', 'distribution'],
  fitness: ['pace', 'stamina', 'strength'],
};
/** A developer coach's pull on growth of players aged 21 or younger, multiplied across roles. */
const YOUTH_DEVELOPER: Partial<Record<StaffRole, number>> = {
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
    scoutPotential: 0,
    scoutCandidates: 8,
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
  if (role === 'scout') {
    effects.scoutPotential = member
      ? whole((member.ability - NEUTRAL_ABILITY) / 10) + (member.trait === 'spotter' ? 6 : 0)
      : -3;
    effects.scoutCandidates = member
      ? clamp(8 + whole((member.ability - NEUTRAL_ABILITY) / 15), 5, 12)
      : 6;
  }
  // The 단장 carries the transfer negotiation (→STAFF-20).
  if (role === 'director') {
    effects.feeMultiplier = member?.trait === 'negotiator' ? 0.9 : 1;
    effects.bidAcceptance = member
      ? (member.ability - NEUTRAL_ABILITY) / 250 + (member.trait === 'negotiator' ? 0.1 : 0)
      : -0.05;
  }
}

export function staffMember(w: World, role: StaffRole): Staff | undefined {
  return w.staff?.find((member) => member.role === role);
}

/** Neutral for absent staff (older saves) and for ability-50 staff without a trait. */
export function staffEffects(w: World): StaffEffects {
  const effects = neutralEffects();
  if (!w.staff) return effects;
  for (const role of STAFF_ROLES) applyDepartment(effects, role, staffMember(w, role));
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
      `${owned.map((a) => ATTRIBUTE_LABEL[a]).join('·')} 성장 ${times(effects.development[owned[0]!])}`,
    );
  if (effects.youthDevelopment !== 1)
    lines.push(`21세 이하 성장 ${times(effects.youthDevelopment)}`);
  if (role === 'fitness') lines.push(`라운드 피로 회복 ${signed(effects.recoveryBonus)}`);
  if (role === 'youth')
    lines.push(
      `입단 잠재력 ${signed(effects.academyQuality)}`,
      `아카데미 성장 ${times(effects.academyGrowth)}`,
    );
  if (role === 'scout')
    lines.push(
      `이적 후보 ${effects.scoutCandidates}명`,
      `후보 잠재력 ${signed(effects.scoutPotential)}`,
    );
  if (role === 'director') {
    lines.push(`협상 성공률 ${signed(Math.round(effects.bidAcceptance * 100))}%p`);
    if (effects.feeMultiplier !== 1) lines.push(`이적료 ${times(effects.feeMultiplier)}`);
  }
  return `${member ? '' : '공석 · '}${lines.join(' · ')}`;
}

/** Founding staff: one unpaid ability-50 member per post, the 단장 too, so a new club starts neutral. */
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
/** A price-indexed amount carried onto the football index of the club's country (→ECON-26). */
export function footballScaled(w: World, amount: string) {
  const real = footballIndex(clubOf(w).country, w.year).real;
  return ratio(amount, BigInt(Math.round(real * 1_000_000)), 1_000_000n);
}
/** What a manager or coach asks this season: the price quote on the football index (→ECON-26). */
export function staffQuote(w: World, units: number) {
  return footballScaled(w, quote(clubOf(w).country, w.year, units));
}
/** Seasons a manager or coach may sign for when the owner chooses (→STAFF-11, →STAFF-14). */
export const CONTRACT_TERMS: readonly ContractTerm[] = [1, 2, 3, 4, 5];
/** The seasons a renewal signs for when nobody chose a term, and where the owner's choice starts. */
export const DELEGATED_TERM: ContractTerm = 2;
export function checkTerm(term: ContractTerm | undefined) {
  if (term !== undefined && !CONTRACT_TERMS.includes(term))
    throw new Error('계약 기간은 1–5시즌이어야 합니다.');
}
/** The owner's chosen term stays with the contract; one signed without a choice has none. */
export function withTerm<T extends { term?: ContractTerm }>(person: T, term?: ContractTerm): T {
  const { term: _previous, ...rest } = person;
  void _previous;
  return (term === undefined ? rest : { ...rest, term }) as T;
}
/** Seasons left on a contract, this one included: a deal ending at this season's close has one. */
export function seasonsLeft(w: World, until: number) {
  return Math.max(0, until - w.year);
}
/**
 * Releasing or replacing a paid coach or manager pays 25% of his annual wage for each season left
 * on his contract (→STAFF-11); volunteers leave freely.
 */
export function releaseCost(w: World, person: Pick<Staff, 'wage' | 'until'> | undefined) {
  if (!person || BigInt(person.wage) <= 0n) return '0';
  return ratio(person.wage, BigInt(seasonsLeft(w, person.until)), 4n);
}
/**
 * A coach's going wage: it follows his current ability (→STAFF-16). A coach wage cap names this
 * wage for an ability of 50–90 (→STAFF-15).
 */
export function coachWage(w: World, ability: number) {
  return staffQuote(w, Math.max(0, (ability - 30) * 1.5));
}
type StaffCandidate = Staff & { fee: string };
/** The season's draws per club and department; delegated staff look at them every day. */
const candidateCache = new Map<string, readonly StaffCandidate[]>();
/** Three seeded candidates per role and season; anyone already employed is not offered. */
export function staffCandidates(w: World, role: StaffRole): StaffCandidate[] {
  if (!STAFF_ROLES.includes(role)) return [];
  const code = clubOf(w).country,
    employed = new Set((w.staff || []).map((member) => member.id)),
    key = `${w.seed}|${w.playerClub}|${code}|${w.year}|${role}`;
  let drawn = candidateCache.get(key);
  if (!drawn) {
    drawn = drawCandidates(w, role, code);
    if (candidateCache.size > 512) candidateCache.clear();
    candidateCache.set(key, drawn);
  }
  const retained: StaffCandidate[] = Object.values(w.people || {})
    .filter((person) => coachingEntryReady(person) && person.coaching?.role === role)
    .sort((a, b) => compareIds(a.id, b.id))
    .map((person) => {
      const coaching = person.coaching!;
      const wage = coachWage(w, coaching.ability);
      return {
        id: person.id,
        person: person.id,
        name: person.name,
        born: person.born,
        role,
        ability: coaching.ability,
        potential: coaching.potential,
        wage,
        since: w.year,
        until: w.year + 3,
        fee: ratio(wage, 1n, 4n),
      };
    });
  return [
    ...drawn
      .filter((candidate) => !employed.has(candidate.id))
      .map((candidate) => ({ ...candidate })),
    ...retained,
  ];
}
function drawCandidates(w: World, role: StaffRole, code: string): StaffCandidate[] {
  return CANDIDATE_ABILITY.map(([min, max], i) => {
    const r = random(`${w.seed}:staff-market:${w.year}:${role}:${i}`);
    const name = personName(code, r),
      peak = integer(r, min, max),
      traits = STAFF_INFO[role].traits,
      // The modest first candidate may have no specialty.
      pick = integer(r, i === 0 ? -1 : 0, traits.length - 1),
      until = w.year + integer(r, 2, 3),
      // A young coach is cheaper now and grows toward the band's level (→STAFF-16).
      career = coachProspect(
        `${w.seed}:staff-age:${w.year}:${role}:${i}`,
        peak,
        COACH_CAREER.ages,
        COACH_CAREER.prime,
      ),
      ability = career.ability,
      wage = coachWage(w, ability);
    return {
      id: `${w.playerClub}:staff:${role}:${w.year}:${i}`,
      role,
      name,
      ability,
      ...(pick >= 0 ? { trait: traits[pick] } : {}),
      wage,
      since: w.year,
      until,
      born: w.year - career.age,
      potential: career.potential,
      fee: ratio(wage, 1n, 4n),
    };
  });
}
const roleOrder = (a: Staff, b: Staff) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role);

/**
 * Hires a candidate for `term` seasons at the wage he asks now, fixed for the term; without a term
 * he signs for the length he was offered with.
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
  if (!offer) throw new Error('유효하지 않은 스태프 후보입니다.');
  // Older saves without staff start from the neutral volunteers.
  const staff = w.staff || basicStaff(w),
    current = staff.find((member) => member.role === role),
    owed = releaseCost(w, current),
    total = (BigInt(offer.fee) + BigInt(owed)).toString();
  debit(w, total);
  const { fee, ...offered } = offer;
  const member = withTerm(term ? { ...offered, until: w.year + term } : offered, term);
  departStaff(w, current);
  if (member.person) openEmployment(w, member.person, member.role, w.playerClub);
  w.staff = [...staff.filter((other) => other.role !== role), member].sort(roleOrder);
  addEvent(
    w,
    'staff-hire',
    `${STAFF_INFO[role].label} ${member.name} 선임`,
    [
      `능력 ${member.ability}`,
      member.trait ? STAFF_TRAIT_INFO[member.trait].label : '특기 없음',
      `연봉 ${moneyLabel(w, member.wage)}`,
      `계약 ${contractSeason(member.until)} 시즌 끝까지`,
      `계약금 ${moneyLabel(w, fee)}`,
      ...(owed !== '0' ? [`${current!.name} 보상금 ${moneyLabel(w, owed)}`] : []),
    ].join(' · '),
    total,
  );
}
function departStaff(w: World, member?: Staff) {
  if (!member?.person) return;
  const person = w.people?.[member.person];
  if (person?.coaching) {
    person.coaching.ability = member.ability;
    person.coaching.potential = member.potential ?? person.coaching.potential;
  }
  closeEmployment(w, member.person, member.role);
}
export function releaseStaff(w: World, role: StaffRole, mandatory = false): void {
  const staff = w.staff || basicStaff(w),
    member = staff.find((other) => other.role === role);
  if (!member) throw new Error('이미 비어 있는 자리입니다.');
  const owed = releaseCost(w, member);
  if (owed !== '0') debit(w, owed, mandatory);
  departStaff(w, member);
  w.staff = staff.filter((other) => other.role !== role);
  addEvent(
    w,
    'staff-release',
    `${STAFF_INFO[role].label} ${member.name} 계약 해지`,
    owed !== '0'
      ? `잔여 계약 ${seasonsLeft(w, member.until)}시즌 보상금 ${moneyLabel(w, owed)} · 새 코치를 선임할 때까지 공석입니다.`
      : '무보수 코치 · 보상금 없음 · 새 코치를 선임할 때까지 공석입니다.',
    owed !== '0' ? owed : undefined,
  );
}
/** Starting XI average fatigue that makes the assistant call a recovery week. */
export const AUTO_RECOVERY_FATIGUE = 30;
/** Below this starters' fatigue, with morale at least AUTO_HARD_MORALE, he may call 하드 (→CLUB-13). */
export const AUTO_HARD_FATIGUE = 15;
export const AUTO_HARD_MORALE = 50;
/** The assistant's reasoning, for showing why the staff chose this week's focus. */
export function autoTrainingAdvice(w: World): { focus: TrainingFocus; reason: string } {
  const starters = ownStarters(w);
  if (!starters.length)
    return { focus: 'balanced', reason: '선발 명단이 비어 균형 훈련을 유지해요.' };
  const fatigue = starters.reduce((sum, player) => sum + player.fatigue, 0) / starters.length,
    tired = `선발 평균 피로 ${Math.round(fatigue)}`;
  if (fatigue >= AUTO_RECOVERY_FATIGUE)
    return { focus: 'recovery', reason: `${tired} · 회복이 먼저예요.` };
  // 하드 트레이닝 only on fresh legs and a squad in good spirits (→CLUB-13).
  const fresh = fatigue < AUTO_HARD_FATIGUE && moraleOf(w) >= AUTO_HARD_MORALE;
  if (fresh && staffMember(w, 'assistant')?.trait === 'developer')
    return { focus: 'hard', reason: `${tired} · 육성형 수석코치가 하드 트레이닝으로 끌어올려요.` };
  // 데뷔 시점 빠른 데뷔 calls for hard work from two young starters (→CLUB-13, CLUB-32).
  const young = starters.filter((player) => isYouth(w, player)).length;
  if (fresh && young >= (w.direction?.debut === 'early' ? 2 : 3))
    return {
      focus: 'hard',
      reason: `${tired} · 21세 이하 선발 ${young}명을 하드 트레이닝으로 키워요.`,
    };
  return { focus: 'balanced', reason: `${tired} · 성장과 회복을 함께 챙겨요.` };
}
/** A player's fatigue at which the assistant rests him whatever the squad does (→CLUB-13). */
export const AUTO_PLAYER_RECOVERY = 40;
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
/** Cash left after `spend` still keeps 재정 기조's runway with `wage` added to the costs (→ECON-33). */
export function affordable(w: World, spend: bigint, wage: bigint) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / 46n;
  return BigInt(w.cash) - spend >= perRound * BigInt(financeStance(w).runway);
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
    [`능력 ${c.minAbility} 이상인 후보가 없어요`, (coach) => coach.ability >= c.minAbility],
    ...(trait
      ? [
          [
            `${STAFF_TRAIT_INFO[trait].label} 특성의 후보가 없어요`,
            (coach) => coach.trait === trait,
          ] satisfies CoachCheck,
        ]
      : []),
    ...(cap === undefined
      ? []
      : [
          [
            `연봉 상한(능력 ${c.maxWageOvr} 코치 시세) 안의 후보가 없어요`,
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
/**
 * The season's candidates (→STAFF-11) who meet 코치 기조 and whom the club can afford in place of
 * `replacing` (cash after his fee still keeps 재정 기조's runway with his wage instead of the
 * replaced one), in the option's order: the ablest or the cheapest first, ties to the lower
 * candidate (→STAFF-15).
 */
export function coachMatches(w: World, role: StaffRole, replacing?: Staff) {
  const c = coachCriteriaOf(w),
    checks = coachChecks(w, role, c),
    freed = replacing ? BigInt(replacing.wage) : 0n;
  return staffCandidates(w, role)
    .filter(
      (offer) =>
        checks.every(([, fits]) => fits(offer)) &&
        affordable(w, BigInt(offer.fee), BigInt(offer.wage) - freed),
    )
    .sort(c.priority === 'ability' ? (a, b) => b.ability - a.ability : byWage);
}
/** Why no candidate matches: the first criterion nobody meets, or that nobody is affordable. */
function noCoachReason(w: World, role: StaffRole) {
  let pool = staffCandidates(w, role);
  if (!pool.length) return '이번 시즌 후보가 없어요';
  for (const [why, fits] of coachChecks(w, role, coachCriteriaOf(w))) {
    pool = pool.filter(fits);
    if (!pool.length) return why;
  }
  return '자금 여력에 맞는 후보가 없어요';
}
const VOLUNTEER_HOLDS = '자원봉사 코치가 자리를 지켜요';
/**
 * Whom 코치 기조 would hire today in a department, or why nobody, for its card (→STAFF-15). A coach
 * under contract stays until it ends; the line says so.
 */
export function coachPickPreview(
  w: World,
  role: StaffRole,
): { pick?: Staff & { fee: string }; reason: string } {
  const c = coachCriteriaOf(w),
    member = staffMember(w, role),
    contracted = !!member && BigInt(member.wage) > 0n,
    later = contracted ? ' · 계약 중인 코치는 계약이 끝날 때 코치 기조로 다시 판단해요' : '';
  if (c.volunteer)
    return { reason: `코치 기조 자원봉사 · 무급 코치(능력 50)가 자리를 맡아요${later}` };
  const pick = coachMatches(w, role, member)[0];
  if (!pick)
    return {
      reason: `코치 기조에 맞는 코치가 없어요 · ${noCoachReason(w, role)}${contracted ? later : ` · ${VOLUNTEER_HOLDS}`}`,
    };
  return {
    pick,
    reason:
      [
        `${pick.name} · 능력 ${pick.ability}`,
        pick.trait ? STAFF_TRAIT_INFO[pick.trait].label : '특기 없음',
        `연봉 ${moneyLabel(w, pick.wage)}`,
        `계약금 ${moneyLabel(w, pick.fee)}`,
        `${c.term}시즌 계약`,
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
    title: `${label}: 코치 기조에 맞는 코치가 없어요`,
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
/** A paid coach whose contract ends at this season's close. */
export function isExpiring(w: World, member: Staff) {
  return BigInt(member.wage) > 0n && member.until <= w.year + 1;
}
export function renewStaff(w: World, role: StaffRole, term?: ContractTerm) {
  checkTerm(term);
  const member = staffMember(w, role);
  if (!member || !isExpiring(w, member)) throw new Error('재계약할 수 있는 코치가 아닙니다.');
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
    `${STAFF_INFO[role].label} ${member.name} 재계약`,
    `능력 ${member.ability} · 연봉 ${moneyLabel(w, terms.wage)} · 계약 ${contractSeason(terms.until)} 시즌 끝까지 · 계약금 ${moneyLabel(w, terms.fee)}`,
    terms.fee,
  );
}
/** Puts `member` in charge of `role`, paying his signing fee. */
function appoint(w: World, member: Staff & { fee?: string }) {
  const { fee, ...staff } = member;
  if (fee && BigInt(fee) > 0n) debit(w, fee, true);
  departStaff(w, staffMember(w, staff.role));
  if (staff.person) openEmployment(w, staff.person, staff.role, w.playerClub);
  w.staff = [...(w.staff || []).filter((other) => other.role !== staff.role), staff].sort(
    roleOrder,
  );
  addEvent(
    w,
    'staff-hire',
    `${STAFF_INFO[staff.role].label} ${staff.name} 선임`,
    [
      `능력 ${staff.ability}`,
      staff.trait ? STAFF_TRAIT_INFO[staff.trait].label : '특기 없음',
      BigInt(staff.wage) > 0n ? `연봉 ${moneyLabel(w, staff.wage)}` : '무급 자원봉사',
      `계약 ${contractSeason(staff.until)} 시즌 끝까지`,
      '스태프 위임 선임',
    ].join(' · '),
    fee && BigInt(fee) > 0n ? fee : undefined,
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
    hired = (offer: Staff & { fee: string }) => appoint(w, { ...offer, until: w.year + c.term });
  if (!member || BigInt(member.wage) === 0n) {
    if (considerPlayingCoach(w, role)) return `${label} 플레잉 코치 계약 검토`;
    if (first) return `${label} ${hired(first).name} 선임(능력 ${first.ability})`;
    if (!member) return `${label} 자원봉사 ${appoint(w, volunteer(w, role)).name}`;
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
      `${label} ${member.name} 재계약`,
      `능력 ${member.ability} · 연봉 ${moneyLabel(w, terms.wage)} · 계약 ${contractSeason(terms.until)} 시즌 끝까지 · 스태프 위임`,
      terms.fee,
    );
    return `${label} ${member.name} 재계약(${c.term}시즌)`;
  }
  if (considerPlayingCoach(w, role)) return `${label} 플레잉 코치 계약 검토`;
  departStaff(w, member);
  w.staff = w.staff!.filter((other) => other.role !== role);
  addEvent(w, 'staff-leave', `${label} ${member.name} 계약 만료`, `${member.since}–${w.year}`);
  return first
    ? `${label} ${member.name} 계약 만료 → ${hired(first).name} 선임(능력 ${first.ability})`
    : `${label} ${member.name} 계약 만료 → 자원봉사 ${appoint(w, volunteer(w, role)).name}`;
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
      `${label} ${member.name} 계약 만료`,
      `${member.since}–${w.year} · 새 코치를 선임할 때까지 공석입니다.`,
    );
    pushInbox(w, {
      kind: 'staff-renewal',
      title: `${label} ${member.name} 계약 만료 · 공석`,
      detail: `${label} 자리가 비었습니다. 공석인 부서는 기본 코치보다 효과가 낮아요. 코치진에서 새 코치를 선임하거나 코치 선임을 스태프에게 맡기세요.`,
      attention: true,
      ref: member.id,
    });
  }
  if (report.length)
    pushInbox(w, {
      kind: 'staff-report',
      title: `코치진 정비 · ${report.length}건`,
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
      `코치진 성장 · ${changes.length}명`,
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
      title: `${school}${m.name} 감독과 재계약하지 않아요`,
      detail: `${
        fits
          ? `단장이 ${directionLine(w, 'manager')}(${MANAGER_PRIORITY_INFO[c.priority]})으로 더 나은 ${managerLine(w, first)} 감독을 찾았어요 (지금 OVR ${m.ability}/${m.potential ?? m.ability} · 재계약 연봉 ${moneyLabel(w, kept.wage)})`
          : `${m.name} 감독은 선호 학파·감독 기조에 맞지 않고, 맞는 ${managerLine(w, first)} 감독이 있어요`
      } · 시즌이 끝나면 떠나고 단장이 그때 감독 기조에 맞는 감독을 선임해요`.slice(0, 400),
      attention: false,
      ref: m.id,
    });
    return true;
  }
  if (!affordable(w, BigInt(kept.fee), BigInt(kept.wage) - BigInt(m.wage))) return false;
  renewManager(w, term, true);
  pushInbox(w, {
    kind: 'staff-report',
    title: `${school}${m.name} 감독 재계약`,
    detail: `${fits ? '선호 학파와 감독 기조에 맞아' : '감독 기조에 맞는 감독이 없어'} 단장이 ${term}시즌 더 계약했어요 · 연봉 ${moneyLabel(w, kept.wage)} · 계약금 ${moneyLabel(w, kept.fee)} · ${contractSeason(kept.until)} 시즌 끝까지`,
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
  const seasons = terms.limit === 1 ? '1시즌' : `1–${terms.limit}시즌`;
  pushInbox(w, {
    kind: 'staff-renewal',
    title: `${school}${m.name} 감독 계약이 이번 시즌 끝에 끝나요`,
    detail: `재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요 (연봉 ${moneyLabel(w, terms.wage)} · 계약금 ${moneyLabel(w, terms.fee)} · ${seasons})${managerDelegated ? ' · 자금 여력이 부족해 단장이 재계약하지 않았어요' : ''}`,
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
    title: `코치 재계약 시즌이 돌아왔어요 · ${expiring.length}명`,
    detail: `${expiring
      .map((member) => `${STAFF_INFO[member.role].label} ${member.name}(능력 ${member.ability})`)
      .join(
        ' · ',
      )}의 계약이 이번 시즌 끝에 끝나요. 재계약하지 않으면 떠나요. 코치진에서 재계약하거나 코치 선임을 스태프에게 맡기세요.`.slice(
      0,
      400,
    ),
    attention: true,
  });
}
export function isYouth(w: World, player: Player) {
  return w.year - player.born <= 21;
}
