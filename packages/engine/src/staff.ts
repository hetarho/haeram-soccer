import type {
  CoachingLevel,
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
import { clamp, integer, random, ratio } from './primitives';
import { debit } from './operations';
import { appointDelegatedManager, contractSeason, managerRenewal, renewManager } from './ops-staff';
import { delegatedManagerPick, MANAGER_RULE_INFO, managerRuleOf } from './managerMarket';
import { CASH_WARNING_ROUNDS } from './settlement';
import { pushInbox } from './inbox';
import { moneyLabel, operatingCosts } from './finance';
import { currentDay, seasonDayOf } from './calendar';
import { COACH_CAREER, coachProspect, coachSeason } from './coaching';
import { STYLE_INFO } from './styles';
import { coachDelegated } from './hiring';

/** Coaching departments below the manager, in display order. */
export const STAFF_ROLES: readonly StaffRole[] = [
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
      duty: '이적 시장 후보 수와 잠재력, 협상',
      traits: ['spotter', 'negotiator'],
    },
  };
export const STAFF_TRAIT_INFO: Record<StaffTrait, { label: string; effect: string }> = {
  developer: { label: '육성형', effect: '21세 이하 선수 성장이 빨라져요' },
  specialist: { label: '전문가', effect: '담당 능력 성장이 더 빨라져요' },
  recovery: { label: '회복 전문', effect: '라운드마다 피로를 더 많이 풀어요' },
  spotter: { label: '발굴가', effect: '잠재력 높은 선수를 찾아와요' },
  negotiator: { label: '협상가', effect: '이적료를 낮추고 협상 성공률을 높여요' },
};
export const MANAGER_TRAIT_INFO: Record<ManagerTrait, { label: string; effect: string }> = {
  youth: { label: '유망주 중용', effect: '자동 선발에서 21세 이하 선수를 더 자주 기용해요' },
  rotation: { label: '로테이션', effect: '지친 선수를 적극적으로 쉬게 해요' },
  stable: { label: '베스트 일레븐', effect: '피로가 있어도 주전을 꾸준히 기용해요' },
};

export type DevelopmentSkill = 'attack' | 'passing' | 'defense' | 'keeper' | 'stamina';
export interface StaffEffects {
  /** Per-skill round development multipliers. */
  development: Record<DevelopmentSkill, number>;
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
const SKILL_OF: Partial<Record<StaffRole, DevelopmentSkill>> = {
  assistant: 'passing',
  attack: 'attack',
  defense: 'defense',
  goalkeeping: 'keeper',
  fitness: 'stamina',
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
    development: { attack: 1, passing: 1, defense: 1, keeper: 1, stamina: 1 },
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
  const skill = SKILL_OF[role];
  if (skill)
    effects.development[skill] = member
      ? departmentMultiplier(member.ability) * (member.trait === 'specialist' ? 1.15 : 1)
      : VACANT_MULTIPLIER;
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
  const skill = SKILL_OF[role];
  const skillLabel: Record<DevelopmentSkill, string> = {
    attack: '공격',
    passing: '패스',
    defense: '수비',
    keeper: '골키핑',
    stamina: '체력',
  };
  if (skill) lines.push(`${skillLabel[skill]} 성장 ${times(effects.development[skill])}`);
  if (effects.youthDevelopment !== 1)
    lines.push(`21세 이하 성장 ${times(effects.youthDevelopment)}`);
  if (role === 'fitness') lines.push(`라운드 피로 회복 ${signed(effects.recoveryBonus)}`);
  if (role === 'youth')
    lines.push(
      `입단 잠재력 ${signed(effects.academyQuality)}`,
      `아카데미 성장 ${times(effects.academyGrowth)}`,
    );
  if (role === 'scout') {
    lines.push(
      `이적 후보 ${effects.scoutCandidates}명`,
      `후보 잠재력 ${signed(effects.scoutPotential)}`,
    );
    if (effects.feeMultiplier !== 1) lines.push(`이적료 ${times(effects.feeMultiplier)}`);
    if (effects.bidAcceptance)
      lines.push(`협상 성공률 ${signed(Math.round(effects.bidAcceptance * 100))}%p`);
  }
  return `${member ? '' : '공석 · '}${lines.join(' · ')}`;
}

/** Founding staff: one unpaid ability-50 coach per role, so a new club starts neutral. */
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
/** Delegated staff hire and renew coaches for two seasons (→STAFF-15). */
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
/** A coach's going wage: it follows his current ability (→STAFF-16). */
function coachWage(w: World, ability: number) {
  return staffQuote(w, (ability - 30) * 1.5);
}
/** Three seeded candidates per role and season; anyone already employed is not offered. */
export function staffCandidates(w: World, role: StaffRole): (Staff & { fee: string })[] {
  if (!STAFF_ROLES.includes(role)) return [];
  const code = clubOf(w).country,
    employed = new Set((w.staff || []).map((member) => member.id));
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
  }).filter((candidate) => !employed.has(candidate.id));
}
const roleOrder = (a: Staff, b: Staff) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role);

/**
 * Hires a candidate for `term` seasons at the wage he asks now, fixed for the term; without a term
 * he signs for the length he was offered with.
 */
export function hireStaff(w: World, role: StaffRole, candidate: number, term?: ContractTerm): void {
  checkTerm(term);
  const offer = Number.isInteger(candidate) ? staffCandidates(w, role)[candidate] : undefined;
  if (!offer) throw new Error('유효하지 않은 스태프 후보입니다.');
  // Older saves without staff start from the neutral volunteers.
  const staff = w.staff || basicStaff(w),
    current = staff.find((member) => member.role === role),
    owed = releaseCost(w, current),
    total = (BigInt(offer.fee) + BigInt(owed)).toString();
  debit(w, total);
  const { fee, ...offered } = offer;
  const member = withTerm(term ? { ...offered, until: w.year + term } : offered, term);
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
export function releaseStaff(w: World, role: StaffRole): void {
  const staff = w.staff || basicStaff(w),
    member = staff.find((other) => other.role === role);
  if (!member) throw new Error('이미 비어 있는 자리입니다.');
  const owed = releaseCost(w, member);
  if (owed !== '0') debit(w, owed);
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
/** The assistant's reasoning, for showing why the staff chose this week's focus. */
export function autoTrainingAdvice(w: World): { focus: TrainingFocus; reason: string } {
  const starters = ownStarters(w);
  if (!starters.length)
    return { focus: 'balanced', reason: '선발 명단이 비어 균형 훈련을 유지해요.' };
  const fatigue = starters.reduce((sum, player) => sum + player.fatigue, 0) / starters.length,
    tired = `선발 평균 피로 ${Math.round(fatigue)}`;
  if (fatigue >= AUTO_RECOVERY_FATIGUE)
    return { focus: 'recovery', reason: `${tired} · 회복이 먼저예요.` };
  if (staffMember(w, 'assistant')?.trait === 'developer')
    return { focus: 'youth', reason: `${tired} · 육성형 수석코치가 유망주 성장에 집중해요.` };
  const young = starters.filter((player) => isYouth(w, player)).length;
  if (young >= 3)
    return { focus: 'youth', reason: `${tired} · 21세 이하 선발 ${young}명의 성장에 집중해요.` };
  return { focus: 'balanced', reason: `${tired} · 성장과 회복을 함께 챙겨요.` };
}
/** The assistant's choice when training is delegated. */
export function autoTrainingFocus(w: World): TrainingFocus {
  return autoTrainingAdvice(w).focus;
}
/**
 * Coaching investment (→STAFF-15), one dial per department: the owner only says how much quality
 * to buy; delegated staff hire and renew to it. Level 1 keeps unpaid ability-50 volunteers, 2
 * hires the mid-market candidate (55–78), 3 the best available (65–90).
 */
export const COACHING_INFO: Record<CoachingLevel, { label: string; summary: string }> = {
  1: { label: '절약', summary: '무급 자원봉사 코치 · 능력 50' },
  2: { label: '균형', summary: '시장 중간 수준 코치 · 도달 수준 55–78' },
  3: { label: '최고', summary: '구할 수 있는 최고 코치 · 도달 수준 65–90' },
};
export function coachingLevel(w: World, role: StaffRole): CoachingLevel {
  return w.coaching?.[role] ?? 2;
}
/**
 * Sets one department's investment. With hiring delegated the staff act at once where nobody is
 * paid yet (a vacancy or a volunteer) and the budget allows; a contracted coach is reviewed at
 * the end of his contract.
 */
export function setCoaching(w: World, role: StaffRole, level: CoachingLevel) {
  if (!STAFF_ROLES.includes(role)) throw new Error('코치진 부서를 확인하세요.');
  if (![1, 2, 3].includes(level)) throw new Error('코치진 투자 단계를 확인하세요.');
  if (coachingLevel(w, role) === level) return;
  const rest = { ...w.coaching };
  delete rest[role];
  w.coaching = level === 2 ? rest : { ...rest, [role]: level };
  if (!Object.keys(w.coaching).length) delete w.coaching;
  addEvent(
    w,
    'coaching',
    `${STAFF_INFO[role].label} 투자 · ${COACHING_INFO[level].label}`,
    COACHING_INFO[level].summary,
  );
  if (!coachDelegated(w, role) || !w.staff) return;
  const member = staffMember(w, role);
  if (member && BigInt(member.wage) > 0n) return;
  const hire = plannedHire(w, role);
  if (hire) appoint(w, hire);
}
/** An unpaid ability-50 coach the staff can always find, so no department stays empty. */
function volunteer(w: World, role: StaffRole): Staff {
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
/** Cash left after `spend` still covers the cash-warning runway with `wage` added to the costs. */
export function affordable(w: World, spend: bigint, wage: bigint) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / 46n;
  return BigInt(w.cash) - spend >= perRound * BigInt(CASH_WARNING_ROUNDS);
}
/**
 * The candidate the coaching level asks for, falling back to cheaper bands the club can afford;
 * the staff sign him for two seasons.
 */
function plannedHire(w: World, role: StaffRole, replacing?: Staff) {
  const level = coachingLevel(w, role);
  if (level === 1) return undefined;
  const offers = staffCandidates(w, role);
  const band = (i: number) => offers.find((offer) => offer.id.endsWith(`:${i}`));
  const order = level === 3 ? [2, 1, 0] : [1, 0];
  const freed = replacing ? BigInt(replacing.wage) : 0n;
  for (const i of order) {
    const offer = band(i);
    if (offer && affordable(w, BigInt(offer.fee), BigInt(offer.wage) - freed))
      return { ...offer, until: w.year + DELEGATED_TERM };
  }
  return undefined;
}
/**
 * What a coach asks to stay `term` more seasons after his contract ends (two when absent, as
 * delegated staff renew): the going rate for his ability this season, fixed for the term, and a
 * 10% signing fee. At the season boundary his contract ended with the season just closed.
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
 * Season boundary: contracts end, renew or are replaced. In each department delegated to the
 * staff (→STAFF-15) the club renews coaches at the level the owner asked for and replaces the
 * rest, so no such department is left empty; elsewhere expiring coaches leave and the owner is
 * told.
 */
export function seasonStaff(w: World): void {
  if (!w.staff) return;
  developStaff(w);
  const report: string[] = [];
  for (const role of STAFF_ROLES) {
    const delegated = coachDelegated(w, role);
    const member = staffMember(w, role);
    const expired = member && member.until <= w.year;
    if (member && !expired) continue;
    const label = STAFF_INFO[role].label,
      tier = `${label}(${COACHING_INFO[coachingLevel(w, role)].label})`;
    if (member && BigInt(member.wage) === 0n) {
      const hire = delegated ? plannedHire(w, role) : undefined;
      if (hire) report.push(`${tier} ${appoint(w, hire).name} 선임(능력 ${hire.ability})`);
      else
        w.staff = w.staff.map((other) =>
          other.role === role ? { ...other, until: w.year + 1 } : other,
        );
      continue;
    }
    if (member) {
      const target = delegated ? plannedHire(w, role, member) : undefined;
      const terms = renewalTerms(w, member);
      const keep =
        delegated &&
        coachingLevel(w, role) > 1 &&
        member.ability >= (target?.ability ?? NEUTRAL_ABILITY) - 3 &&
        affordable(w, BigInt(terms.fee), BigInt(terms.wage) - BigInt(member.wage));
      if (keep) {
        debit(w, terms.fee, true);
        w.staff = w.staff.map((other) =>
          other.role === role
            ? withTerm({ ...other, wage: terms.wage, until: terms.until })
            : other,
        );
        addEvent(
          w,
          'staff-renew',
          `${label} ${member.name} 재계약`,
          `능력 ${member.ability} · 계약 ${contractSeason(terms.until)} 시즌 끝까지 · 스태프 위임`,
          terms.fee,
        );
        report.push(`${tier} ${member.name} 재계약`);
        continue;
      }
      w.staff = w.staff.filter((other) => other.role !== role);
      addEvent(
        w,
        'staff-leave',
        `${label} ${member.name} 계약 만료`,
        `${member.since}–${w.year}${delegated ? '' : ' · 새 코치를 선임할 때까지 공석입니다.'}`,
      );
      if (!delegated) {
        pushInbox(w, {
          kind: 'staff-renewal',
          title: `${label} ${member.name} 계약 만료 · 공석`,
          detail: `${label} 자리가 비었습니다. 공석인 부서는 기본 코치보다 효과가 낮아요. 코치진에서 새 코치를 선임하거나 코치 선임을 스태프에게 맡기세요.`,
          attention: true,
          ref: member.id,
        });
        continue;
      }
      const hire = target || volunteer(w, role);
      appoint(w, hire);
      report.push(`${tier} ${member.name} 계약 만료 → ${hire.name} 선임(능력 ${hire.ability})`);
      continue;
    }
    if (delegated) {
      const hire = plannedHire(w, role) || volunteer(w, role);
      appoint(w, hire);
      report.push(`${tier} ${hire.name} 선임(능력 ${hire.ability})`);
    }
  }
  if (report.length)
    pushInbox(w, {
      kind: 'staff-report',
      title: `코치진 정비 · ${report.length}건`,
      detail: `부서별 코치진 투자 기준 · ${report.join(' · ')}`.slice(0, 400),
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
/** A free agent the rule picks must be this much better by OVR to replace an expiring manager. */
export const MANAGER_RENEWAL_MARGIN = 3;
/**
 * 1 April for a manager whose contract ends at the close: no contract renews itself (→STAFF-14).
 * With the manager post delegated (→STAFF-18) the staff let him go when the owner's rule finds an
 * affordable free agent 3+ OVR better, who replaces him at the close; otherwise they renew him for
 * two seasons (the firefighter one) when the club can afford it. Either way they report it; else
 * the owner hears that he leaves unless renewed. Coaching staff (absent in older saves) play no
 * part.
 */
function managerRenewalReminder(w: World) {
  const m = w.manager,
    terms = managerRenewal(w);
  if (!terms) return;
  const school = m.style ? `${STYLE_INFO[m.style].label} ` : '',
    delegated = !!w.delegation?.manager,
    term = Math.min(DELEGATED_TERM, terms.limit) as ContractTerm,
    kept = managerRenewal(w, term)!;
  const rival = delegated ? delegatedManagerPick(w, m.style) : undefined;
  if (rival && rival.ability >= m.ability + MANAGER_RENEWAL_MARGIN) {
    pushInbox(w, {
      kind: 'staff-report',
      title: `${school}${m.name} 감독과 재계약하지 않아요`,
      detail: `스태프가 ${MANAGER_RULE_INFO[managerRuleOf(w)].label} 기준으로 OVR ${rival.ability}의 ${STYLE_INFO[rival.style].label} ${rival.name} 감독(지금 OVR ${m.ability})을 찾았어요 · 시즌이 끝나면 떠나고 스태프가 그때 형편에 맞는 감독을 선임해요`,
      attention: false,
      ref: m.id,
    });
    return;
  }
  if (delegated && affordable(w, BigInt(kept.fee), BigInt(kept.wage) - BigInt(m.wage))) {
    renewManager(w, term, true);
    pushInbox(w, {
      kind: 'staff-report',
      title: `${school}${m.name} 감독 재계약`,
      detail: `스태프가 ${term}시즌 더 계약했어요 · 연봉 ${moneyLabel(w, kept.wage)} · 계약금 ${moneyLabel(w, kept.fee)} · ${contractSeason(kept.until)} 시즌 끝까지`,
      attention: false,
    });
    return;
  }
  const seasons = terms.limit === 1 ? '1시즌' : `1–${terms.limit}시즌`;
  pushInbox(w, {
    kind: 'staff-renewal',
    title: `${school}${m.name} 감독 계약이 이번 시즌 끝에 끝나요`,
    detail: `재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요 (연봉 ${moneyLabel(w, terms.wage)} · 계약금 ${moneyLabel(w, terms.fee)} · ${seasons})${delegated ? ' · 자금 여력이 부족해 스태프가 재계약하지 않았어요' : ''}`,
    attention: true,
    ref: m.id,
  });
}
/**
 * Daily: on 1 April an expiring manager's renewal comes up; with the manager post delegated the
 * staff replace an interim as soon as the club can afford a free agent (→STAFF-18); the staff
 * fill an empty department delegated to them at once; for the other departments the renewal
 * season is announced on 1 April when contracts end at the close.
 */
export function dailyStaff(w: World) {
  if (currentDay(w) === renewalDay(w.year)) managerRenewalReminder(w);
  if (w.manager.interim && w.delegation?.manager) appointDelegatedManager(w);
  if (!w.staff) return;
  for (const role of STAFF_ROLES)
    if (coachDelegated(w, role) && !staffMember(w, role))
      appoint(w, plannedHire(w, role) || volunteer(w, role));
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
