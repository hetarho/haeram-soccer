import type {
  CoachingLevel,
  ManagerTrait,
  Player,
  Staff,
  StaffRole,
  StaffTrait,
  TrainingFocus,
  World,
} from '../../contracts/src/types';
import { addEvent, clubOf, ownStarters, personName, quote } from './world';
import { clamp, integer, random, ratio } from './primitives';
import { CASH_WARNING_ROUNDS, debit } from './operations';
import { pushInbox } from './inbox';
import { operatingCosts } from './finance';
import { currentDay, seasonDayOf } from './calendar';

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

/** A hire candidate's selection habit, drawn from its own stream so other attributes stay put. */
export function managerTrait(w: World, index: number): ManagerTrait | undefined {
  return MANAGER_TRAITS[
    integer(random(`${w.seed}:manager-trait:${w.year}:${index}`), 0, MANAGER_TRAITS.length)
  ];
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
/** Three seeded candidates per role and season; anyone already employed is not offered. */
export function staffCandidates(w: World, role: StaffRole): (Staff & { fee: string })[] {
  if (!STAFF_ROLES.includes(role)) return [];
  const code = clubOf(w).country,
    employed = new Set((w.staff || []).map((member) => member.id));
  return CANDIDATE_ABILITY.map(([min, max], i) => {
    const r = random(`${w.seed}:staff-market:${w.year}:${role}:${i}`);
    const name = personName(code, r),
      ability = integer(r, min, max),
      traits = STAFF_INFO[role].traits,
      // The modest first candidate may have no specialty.
      pick = integer(r, i === 0 ? -1 : 0, traits.length - 1),
      until = w.year + integer(r, 2, 3),
      wage = quote(code, w.year, (ability - 30) * 1.5);
    return {
      id: `${w.playerClub}:staff:${role}:${w.year}:${i}`,
      role,
      name,
      ability,
      ...(pick >= 0 ? { trait: traits[pick] } : {}),
      wage,
      since: w.year,
      until,
      fee: ratio(wage, 1n, 4n),
    };
  }).filter((candidate) => !employed.has(candidate.id));
}
/** A paid coach leaving early is owed a quarter of the annual wage; volunteers leave freely. */
function compensation(member: Staff | undefined) {
  return member && BigInt(member.wage) > 0n ? ratio(member.wage, 1n, 4n) : '0';
}
const roleOrder = (a: Staff, b: Staff) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role);

export function hireStaff(w: World, role: StaffRole, candidate: number): void {
  const offer = Number.isInteger(candidate) ? staffCandidates(w, role)[candidate] : undefined;
  if (!offer) throw new Error('유효하지 않은 스태프 후보입니다.');
  // Older saves without staff start from the neutral volunteers.
  const staff = w.staff || basicStaff(w),
    current = staff.find((member) => member.role === role),
    owed = compensation(current),
    total = (BigInt(offer.fee) + BigInt(owed)).toString();
  debit(w, total);
  const { fee, ...member } = offer;
  w.staff = [...staff.filter((other) => other.role !== role), member].sort(roleOrder);
  addEvent(
    w,
    'staff-hire',
    `${STAFF_INFO[role].label} ${member.name} 선임`,
    [
      `능력 ${member.ability}`,
      member.trait ? STAFF_TRAIT_INFO[member.trait].label : '특기 없음',
      `연봉 ${member.wage}`,
      `계약 ${member.until}년까지`,
      `계약금 ${fee}`,
      ...(owed !== '0' ? [`${current!.name} 보상금 ${owed}`] : []),
    ].join(' · '),
    total,
  );
}
export function releaseStaff(w: World, role: StaffRole): void {
  const staff = w.staff || basicStaff(w),
    member = staff.find((other) => other.role === role);
  if (!member) throw new Error('이미 비어 있는 자리입니다.');
  const owed = compensation(member);
  if (owed !== '0') debit(w, owed);
  w.staff = staff.filter((other) => other.role !== role);
  addEvent(
    w,
    'staff-release',
    `${STAFF_INFO[role].label} ${member.name} 계약 해지`,
    owed !== '0'
      ? `잔여 계약 보상금 ${owed} · 새 코치를 선임할 때까지 공석입니다.`
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
  2: { label: '균형', summary: '시장 중간 수준 코치 · 능력 55–78' },
  3: { label: '최고', summary: '구할 수 있는 최고 코치 · 능력 65–90' },
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
  if (!w.delegation?.staff || !w.staff) return;
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
function affordable(w: World, spend: bigint, wage: bigint) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / 46n;
  return BigInt(w.cash) - spend >= perRound * BigInt(CASH_WARNING_ROUNDS);
}
/** The candidate the coaching level asks for, falling back to cheaper bands the club can afford. */
function plannedHire(w: World, role: StaffRole, replacing?: Staff) {
  const level = coachingLevel(w, role);
  if (level === 1) return undefined;
  const offers = staffCandidates(w, role);
  const band = (i: number) => offers.find((offer) => offer.id.endsWith(`:${i}`));
  const order = level === 3 ? [2, 1, 0] : [1, 0];
  const freed = replacing ? BigInt(replacing.wage) : 0n;
  for (const i of order) {
    const offer = band(i);
    if (offer && affordable(w, BigInt(offer.fee), BigInt(offer.wage) - freed)) return offer;
  }
  return undefined;
}
/** Wage a coach asks to stay: the going rate for his ability this season. */
export function renewalTerms(w: World, member: Staff) {
  const wage = quote(clubOf(w).country, w.year, (member.ability - 30) * 1.5);
  return { wage, fee: ratio(wage, 1n, 10n), until: Math.max(member.until, w.year + 1) + 2 };
}
/** A paid coach whose contract ends at this season's close. */
export function isExpiring(w: World, member: Staff) {
  return BigInt(member.wage) > 0n && member.until <= w.year + 1;
}
export function renewStaff(w: World, role: StaffRole) {
  const member = staffMember(w, role);
  if (!member || !isExpiring(w, member)) throw new Error('재계약할 수 있는 코치가 아닙니다.');
  const terms = renewalTerms(w, member);
  debit(w, terms.fee);
  w.staff = w.staff!.map((other) =>
    other.role === role ? { ...other, wage: terms.wage, until: terms.until } : other,
  );
  addEvent(
    w,
    'staff-renew',
    `${STAFF_INFO[role].label} ${member.name} 재계약`,
    `능력 ${member.ability} · 연봉 ${terms.wage} · 계약 ${terms.until}년까지 · 계약금 ${terms.fee}`,
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
      BigInt(staff.wage) > 0n ? `연봉 ${staff.wage}` : '무급 자원봉사',
      `계약 ${staff.until}년까지`,
      '스태프 위임 선임',
    ].join(' · '),
    fee && BigInt(fee) > 0n ? fee : undefined,
  );
  return staff;
}
/**
 * Season boundary: contracts end, renew or are replaced. With staff delegated (→STAFF-15) the
 * club renews coaches at the level the owner asked for and replaces the rest, so no department is
 * left empty; otherwise expiring coaches leave and the owner is told.
 */
export function seasonStaff(w: World): void {
  if (!w.staff) return;
  const delegated = !!w.delegation?.staff;
  const report: string[] = [];
  for (const role of STAFF_ROLES) {
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
          other.role === role ? { ...other, wage: terms.wage, until: terms.until } : other,
        );
        addEvent(
          w,
          'staff-renew',
          `${label} ${member.name} 재계약`,
          `능력 ${member.ability} · 계약 ${terms.until}년까지 · 스태프 위임`,
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
/** Spring renewal day: the owner hears which coaches' contracts end at the season's close. */
export function renewalDay(year: number) {
  return seasonDayOf(year, 4, 1);
}
/**
 * Daily: delegated staff fill an empty department at once; otherwise the renewal season is
 * announced on 1 April when contracts end at the close.
 */
export function dailyStaff(w: World) {
  if (!w.staff) return;
  if (w.delegation?.staff) {
    for (const role of STAFF_ROLES)
      if (!staffMember(w, role)) appoint(w, plannedHire(w, role) || volunteer(w, role));
    return;
  }
  if (currentDay(w) !== renewalDay(w.year)) return;
  const expiring = w.staff.filter((member) => isExpiring(w, member));
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
