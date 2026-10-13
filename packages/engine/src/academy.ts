import type { Player, Role, World, YouthFocus } from '../../contracts/src/types';
import { currentDay, seasonDayOf } from './calendar';
import { activePlayers, addEvent, clubOf, makePlayer, overall, ownStarters } from './world';
import { clamp, compareIds, integer, random } from './primitives';
import { marketWage, signingClauses } from './contracts';
import { staffEffects, staffMember } from './staff';
import { pushInbox } from './inbox';
import { recordDevelopment, roleSkills, skillAfter } from './training';
import { moneyLabel, operatingCosts } from './finance';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { delegated } from './intervention';
import { countDownOrder } from './orders';

/** First-team squad limit shared with signings. */
const SQUAD_LIMIT = 26;
/** Prospects held at once; intakes stop while the academy is full. */
export const ACADEMY_LIMIT = 24;
/**
 * The youngest age a prospect signs his first professional contract (→CLUB-16): 17 in England,
 * 16 elsewhere.
 */
export function promotionAge(w: World) {
  return clubOf(w).country === 'ENG' ? 17 : 16;
}
/** From this age delegated staff release a prospect whose potential is below the first team. */
export const RELEASE_AGE = 19;
/** Academy football ends with U-21: a prospect leaves at the close of the season he turns 21. */
export const ACADEMY_LEAVE_AGE = 21;
/** The academy's age groups by age in the season, younger ones growing faster (→CLUB-16). */
export const AGE_GROUPS = [
  { key: 'u17', label: 'U-17', ages: '15–16세', growth: 1.2 },
  { key: 'u19', label: 'U-19', ages: '17–18세', growth: 1 },
  { key: 'u21', label: 'U-21', ages: '19–20세', growth: 0.8 },
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number]['key'];
export function ageGroupOf(w: Pick<World, 'year'>, player: Player): AgeGroup {
  const age = w.year - player.born;
  return age <= 16 ? 'u17' : age <= 18 ? 'u19' : 'u21';
}
/** The youth director's training focuses and what each does to each age group (→CLUB-31). */
export const YOUTH_FOCUS_INFO: Record<
  YouthFocus,
  { label: string; description: string; growth: Record<AgeGroup, number> }
> = {
  balanced: {
    label: '균형',
    description: '모든 연령대를 고르게',
    growth: { u17: 1, u19: 1, u21: 1 },
  },
  fundamentals: {
    label: '기본기 집중',
    description: 'U-17의 기본기를 먼저 · 위 연령대는 조금 덜',
    growth: { u17: 1.3, u19: 0.9, u21: 0.9 },
  },
  firstTeam: {
    label: '1군 준비',
    description: 'U-19·U-21을 1군 수준으로 · U-17은 조금 덜',
    growth: { u17: 0.9, u19: 1.15, u21: 1.25 },
  },
};
/** A prospect this close to being ready makes the director prepare the older groups. */
export const FIRST_TEAM_GAP = 5;
const INTAKE_ROLES: readonly Role[] = ['DEF', 'MID', 'FWD', 'GK'];
const hundredths = (value: number) => Math.round(value * 100) / 100;

export type AcademyReadiness = 'ready' | 'growing' | 'review';
export const ACADEMY_READINESS_LABEL: Record<AcademyReadiness, string> = {
  ready: '1군 준비 완료',
  growing: '성장 중',
  review: '방출 검토',
};
export interface AcademyProspect {
  player: Player;
  overall: number;
  potential: number;
  age: number;
  readiness: AcademyReadiness;
  label: string;
  group: AgeGroup;
}

/** Youth intake day, as in professional academies' spring intake. */
export function academyIntakeDay(w: World) {
  return seasonDayOf(w.year, 3, 15);
}
/** Prospects that arrive at the next intake: 3, +1 with a strong youth director, +1 with facilities. */
export function academyIntakeSize(w: World) {
  const director = staffMember(w, 'youth');
  return (
    3 +
    (director && director.ability >= 70 ? 1 : 0) +
    (w.facilities >= 4 ? 1 : 0) +
    policyEffects(policyOf(w)).academyIntake +
    buildEffects(w).academyIntake
  );
}
/** Potential added to every prospect by academy investment, the club build and synergies. */
export function academyPotentialBonus(w: World) {
  return (
    policyEffects(policyOf(w)).academyPotential +
    buildEffects(w).academyPotential +
    synergyEffects(w).academyPotential
  );
}
/** Potential a prospect needs to be called a golden prospect. */
export const GOLDEN_POTENTIAL = 80;
/**
 * The exact chance that the next intake brings at least one prospect of golden potential,
 * from the same uniform draws the intake uses (→CLUB-16).
 */
export function academyIntakeOutlook(w: World) {
  const size = academyIntakeSize(w),
    quality = staffEffects(w).academyQuality,
    bonus = academyPotentialBonus(w),
    lift = Math.min(4, Math.floor(w.facilities / 2)) + Math.round(quality / 4);
  let hits = 0,
    cases = 0;
  for (let first = 25; first <= 36; first++)
    for (let second = 22; second <= 48; second++) {
      const base = clamp(first + lift, 20, 45);
      cases++;
      if (clamp(base + second + quality + bonus, 40, 99) >= GOLDEN_POTENTIAL) hits++;
    }
  const each = hits / cases;
  return { size, each, golden: 1 - (1 - each) ** size };
}
/** Runs once per season on the intake day. */
export function runAcademyIntake(w: World): void {
  if (currentDay(w) < academyIntakeDay(w) || w.academy?.intakeYear === w.year) return;
  // Older saves gain an academy on their first intake.
  const academy = (w.academy ||= { players: [] });
  academy.intakeYear = w.year;
  const count = Math.min(academyIntakeSize(w), Math.max(0, ACADEMY_LIMIT - academy.players.length));
  if (!count) {
    addEvent(w, 'youth-intake', '유스 입단 보류', `아카데미 정원 ${ACADEMY_LIMIT}명이 찼습니다.`);
    return;
  }
  const code = clubOf(w).country,
    quality = staffEffects(w).academyQuality,
    bonus = academyPotentialBonus(w),
    prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    const r = random(`${w.seed}:academy-intake:${w.year}:${i}`);
    const role = INTAKE_ROLES[(w.year + i) % INTAKE_ROLES.length],
      age = integer(r, 15, 16),
      base = clamp(
        integer(r, 25, 36) + Math.min(4, Math.floor(w.facilities / 2)) + Math.round(quality / 4),
        20,
        45,
      );
    const player = makePlayer(
      code,
      w.seed,
      `${w.playerClub}:academy:${w.year}:${i}`,
      w.year,
      base,
      role,
      age,
    );
    player.potential = Math.max(
      overall(player),
      clamp(base + integer(r, 22, 48) + quality + bonus, 40, 99),
    );
    // Academy prospects are unpaid until promoted.
    player.wage = '0';
    prospects.push(player);
  }
  academy.players.push(...prospects);
  const best = [...prospects].sort(
    (a, b) => b.potential - a.potential || overall(b) - overall(a) || compareIds(a.id, b.id),
  )[0];
  const headline = `${best.name} · ${best.role} ${w.year - best.born}세 · 능력 ${overall(best)} · 잠재력 ${Math.round(best.potential)}`;
  addEvent(w, 'youth-intake', `유스 아카데미 입단 ${count}명`, `가장 기대되는 유망주 ${headline}`);
  pushInbox(w, {
    kind: 'youth-intake',
    title: `유스 아카데미에 ${count}명이 입단했어요`,
    detail: `가장 기대되는 유망주: ${headline}`,
    attention: true,
    ref: best.id,
  });
}
/** Settled with each domestic round, alongside first-team training. */
export function developAcademy(w: World): void {
  const players = w.academy?.players;
  if (!players?.length) return;
  const growth = academyGrowth(w),
    focus = YOUTH_FOCUS_INFO[youthFocus(w)];
  for (const player of players) {
    const group = ageGroupOf(w, player),
      gap = Math.max(0, player.potential - overall(player)),
      gain = hundredths(
        Math.min(0.3, gap / 150) *
          growth *
          AGE_GROUPS.find((one) => one.key === group)!.growth *
          focus.growth[group],
      ),
      skills = roleSkills[player.role];
    if (gain <= 0) continue;
    let actual = 0;
    for (const skill of skills) {
      const next = skillAfter(player, skill, gain);
      actual += next - player[skill];
      player[skill] = next;
    }
    recordDevelopment(player, actual / skills.length);
  }
  countDownOrder(w, 'youth');
}
/** The academy's growth factor before age group and focus: staff, facilities, investment, synergies. */
export function academyGrowth(w: World) {
  return (
    staffEffects(w).academyGrowth *
    (1 + w.facilities / 40) *
    policyEffects(policyOf(w)).academyGrowth *
    synergyEffects(w).academyGrowth
  );
}
/** The OVR a prospect still lacks to be ready by the staff's measure; 0 once he is. */
function readyGapOf(w: World) {
  const active = activePlayers(w),
    level = firstTeamLevels(w);
  return (player: Player) => {
    const peers = active.filter((other) => other.role === player.role).map(overall),
      weakest = peers.length ? Math.min(...peers) : 0;
    return Math.max(0, Math.min(weakest, level[player.role] - 10) - overall(player));
  };
}
/** The youth director's rule (→CLUB-31), with his reason in words. */
export function youthAdvice(w: World): { focus: YouthFocus; reason: string } {
  const prospects = academyPlayers(w),
    gap = readyGapOf(w);
  const near = prospects
    .filter((player) => ageGroupOf(w, player) !== 'u17')
    .map((player) => ({ player, gap: gap(player) }))
    .filter((entry) => entry.gap <= FIRST_TEAM_GAP)
    .sort((a, b) => a.gap - b.gap || compareIds(a.player.id, b.player.id))[0];
  if (near)
    return {
      focus: 'firstTeam',
      reason: near.gap
        ? `${near.player.name}이(가) 1군까지 OVR ${Math.ceil(near.gap)} 남았어요.`
        : `${near.player.name}이(가) 1군 수준이에요.`,
    };
  const young = prospects.filter((player) => ageGroupOf(w, player) === 'u17').length;
  if (young > prospects.length - young)
    return { focus: 'fundamentals', reason: `U-17이 ${young}명으로 가장 많아 기본기부터 다져요.` };
  return { focus: 'balanced', reason: '연령대를 고르게 키워요.' };
}
/** The academy's focus this round: the owner's order or accepted suggestion, else the rule. */
export function youthFocus(w: World): YouthFocus {
  return w.trainingOrders?.youth?.focus ?? youthAdvice(w).focus;
}

/**
 * Average overall of the automatic starters in each role, ignoring fatigue. Per role, because a
 * keeper's overall is his keeping alone and would otherwise always clear an outfield average.
 */
function firstTeamLevels(w: World) {
  const starters = ownStarters(w);
  const all = starters.reduce((sum, player) => sum + overall(player), 0) / (starters.length || 1);
  const level = {} as Record<Role, number>;
  for (const role of INTAKE_ROLES) {
    const inRole = starters.filter((player) => player.role === role);
    level[role] = inRole.length
      ? inRole.reduce((sum, player) => sum + overall(player), 0) / inRole.length
      : all;
  }
  return level;
}
/** Ready when the prospect matches the weakest first-teamer in the role or its starters minus 10. */
function readinessOf(w: World) {
  const active = activePlayers(w),
    level = firstTeamLevels(w);
  return (player: Player): AcademyReadiness => {
    const age = w.year - player.born,
      rated = overall(player),
      peers = active.filter((other) => other.role === player.role).map(overall),
      weakest = peers.length ? Math.min(...peers) : 0;
    if (age >= promotionAge(w) && (rated >= weakest || rated >= level[player.role] - 10))
      return 'ready';
    return age >= RELEASE_AGE && player.potential < weakest ? 'review' : 'growing';
  };
}
/** Delegated staff keep a balanced squad: no promotion into an already full role. */
export const ROLE_LIMIT: Record<Role, number> = { GK: 3, DEF: 8, MID: 8, FWD: 7 };
const roleRoom = (w: World, role: Role) =>
  activePlayers(w).filter((player) => player.role === role).length < ROLE_LIMIT[role];
const prospectLine = (w: World, player: Player) =>
  `${player.name}(${player.role} ${w.year - player.born}세 ${overall(player)})`;
function listed(w: World, players: Player[], limit = 4) {
  const shown = players.slice(0, limit).map((player) => prospectLine(w, player));
  return players.length > limit
    ? `${shown.join(', ')} 외 ${players.length - limit}명`
    : shown.join(', ');
}
const byStrength = (a: Player, b: Player) =>
  overall(b) - overall(a) || b.potential - a.potential || compareIds(a.id, b.id);

function takeProspect(w: World, id: string) {
  const player = w.academy?.players.find((prospect) => prospect.id === id);
  if (!w.academy || !player) throw new Error('아카데미에 없는 선수입니다.');
  w.academy.players = w.academy.players.filter((prospect) => prospect !== player);
  return player;
}

export function promoteYouth(w: World, id: string): void {
  const prospect = academyPlayers(w).find((one) => one.id === id);
  if (!prospect) throw new Error('아카데미에 없는 선수입니다.');
  if (w.year - prospect.born < promotionAge(w))
    throw new Error(`첫 프로 계약은 ${promotionAge(w)}세부터 맺을 수 있어요.`);
  if (activePlayers(w).length >= SQUAD_LIMIT) throw new Error('선수단 정원은 26명입니다.');
  const player = takeProspect(w, id);
  // A first professional contract for three seasons, at his market wage (→CLUB-25), with its own
  // clauses (→CLUB-29).
  player.wage = marketWage(w, player);
  player.until = w.year + 3;
  player.clauses = signingClauses(w, player);
  player.status = 'active';
  player.fatigue = 0;
  w.players.push(player);
  addEvent(
    w,
    'youth-promotion',
    `${player.name} 1군 승격`,
    `${player.role} · ${w.year - player.born}세 · 능력 ${overall(player)} · 잠재력 ${Math.round(player.potential)} · 연봉 ${moneyLabel(w, player.wage)} · 계약 ${player.until}년`,
  );
}
export function releaseYouth(w: World, id: string): void {
  const player = takeProspect(w, id);
  addEvent(
    w,
    'youth-release',
    `${player.name} 아카데미 방출`,
    `${player.role} · ${w.year - player.born}세 · 능력 ${overall(player)} · 잠재력 ${Math.round(player.potential)}`,
  );
}
function staffReport(w: World, title: string, detail: string, ref?: string) {
  pushInbox(w, {
    kind: 'staff-report',
    title,
    detail: detail.slice(0, 400),
    attention: false,
    ...(ref ? { ref } : {}),
  });
}
/** Season boundary: academy ages, and delegated staff promote or release prospects. */
export function seasonAcademy(w: World): void {
  if (!w.academy?.players.length) return;
  // Academy football ends at 21 whoever decides; this also bounds the academy.
  for (const player of w.academy.players.filter(
    (prospect) => w.year - prospect.born >= ACADEMY_LEAVE_AGE,
  )) {
    releaseYouth(w, player.id);
    staffReport(
      w,
      `${player.name} 아카데미 졸업`,
      `${prospectLine(w, player)} · 유스 연령을 넘겨 팀을 떠났어요.`,
      player.id,
    );
  }
  const readiness = readinessOf(w),
    prospects = [...w.academy.players].sort(byStrength),
    ready = prospects.filter((player) => readiness(player) === 'ready'),
    review = prospects.filter((player) => readiness(player) === 'review');
  if (!delegated(w, 'academy')) {
    if (!ready.length && !review.length) return;
    const lines = [
      ...(ready.length ? [`1군 준비 완료: ${listed(w, ready)}`] : []),
      ...(review.length ? [`방출 검토: ${listed(w, review)}`] : []),
    ];
    pushInbox(w, {
      kind: 'staff-report',
      title: `유스 디렉터 보고: 승격 추천 ${ready.length}명 · 방출 검토 ${review.length}명`,
      detail: `${lines.join(' / ')} · 결정은 아카데미에서 직접 내려 주세요.`.slice(0, 400),
      attention: true,
    });
    return;
  }
  const promoted = new Set<string>();
  // Every promotion adds a first-team wage, so the director waits while cash is under a year of costs.
  const affordable = BigInt(w.cash) >= BigInt(operatingCosts(w).annual);
  if (!affordable && ready.length)
    staffReport(
      w,
      `유스 디렉터가 승격 ${ready.length}명을 미뤘어요`,
      `운영자금이 연간 운영비보다 적어 1군 급여를 늘리지 않았어요. 자금이 회복되면 다음 시즌에 다시 검토해요. 직접 올리려면 아카데미에서 승격하세요.`,
    );
  for (const player of affordable ? ready : []) {
    if (activePlayers(w).length >= SQUAD_LIMIT) break;
    if (!roleRoom(w, player.role)) continue;
    promoteYouth(w, player.id);
    promoted.add(player.id);
    staffReport(
      w,
      `유스 디렉터가 ${player.name}을(를) 1군에 올렸어요`,
      `${prospectLine(w, player)} · 연봉 ${moneyLabel(w, player.wage)} · 계약 ${player.until}년`,
      player.id,
    );
  }
  for (const player of affordable ? ready : [])
    if (!promoted.has(player.id))
      staffReport(
        w,
        `유스 디렉터가 ${player.name}을(를) 아카데미에 남겼어요`,
        `${prospectLine(w, player)} · 1군 수준이지만 같은 포지션이나 선수단에 자리가 없어 자리가 날 때까지 기다려요.`,
        player.id,
      );
  for (const player of review)
    if (!promoted.has(player.id)) {
      releaseYouth(w, player.id);
      staffReport(
        w,
        `유스 디렉터가 ${player.name}을(를) 내보냈어요`,
        `${prospectLine(w, player)} · ${RELEASE_AGE}세에 잠재력 ${Math.round(player.potential)}로 같은 포지션 1군 최하위에 못 미쳐요.`,
        player.id,
      );
    }
}
export function academyPlayers(w: World): Player[] {
  return w.academy?.players || [];
}
/** Read model for the academy view; never changes the world. */
export function academySummary(w: World) {
  const readiness = readinessOf(w);
  const players: AcademyProspect[] = [...academyPlayers(w)].sort(byStrength).map((player) => {
    const state = readiness(player);
    return {
      player,
      overall: overall(player),
      potential: Math.round(player.potential),
      age: w.year - player.born,
      readiness: state,
      label: ACADEMY_READINESS_LABEL[state],
      group: ageGroupOf(w, player),
    };
  });
  const base = academyGrowth(w),
    focus = youthFocus(w);
  return {
    players,
    /**
     * Each age group with its prospects and growth factor this round: the academy's factor × the
     * group's × the youth focus's (→CLUB-16, CLUB-31).
     */
    groups: AGE_GROUPS.map((group) => ({
      ...group,
      factor:
        Math.round(base * group.growth * YOUTH_FOCUS_INFO[focus].growth[group.key] * 100) / 100,
      players: players.filter((prospect) => prospect.group === group.key),
    })),
    focus,
    promotionAge: promotionAge(w),
    /** First-team places left for promotions. */
    room: Math.max(0, SQUAD_LIMIT - activePlayers(w).length),
    capacity: ACADEMY_LIMIT,
    intakeDay: academyIntakeDay(w),
    intakeDone: w.academy?.intakeYear === w.year,
    nextIntakeSize: academyIntakeSize(w),
    delegated: delegated(w, 'academy'),
  };
}
