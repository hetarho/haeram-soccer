import type { Player, Role, World } from '../../contracts/src/types';
import { currentDay, seasonDayOf } from './calendar';
import {
  activePlayers,
  addEvent,
  clubOf,
  makePlayer,
  overall,
  quote,
  selectedLineup,
} from './world';
import { clamp, compareIds, integer, random } from './primitives';
import { staffEffects, staffMember } from './staff';
import { pushInbox } from './inbox';
import { recordDevelopment, roleSkills, skillAfter } from './training';
import { operatingCosts } from './finance';
import { policyEffects, policyOf } from './policy';
import { visionEffects } from './vision';
import { synergyEffects } from './synergy';

/** First-team squad limit shared with signings. */
const SQUAD_LIMIT = 26;
/** Prospects held at once; intakes stop while the academy is full. */
export const ACADEMY_LIMIT = 24;
/** Delegated staff promote from this age. */
export const PROMOTION_AGE = 17;
/** Prospects still unpromoted at this age are released by delegated staff. */
export const RELEASE_AGE = 19;
/** Academy football ends at 21; older prospects leave even when the owner decides. */
export const ACADEMY_LEAVE_AGE = 22;
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
    visionEffects(w).academyIntake
  );
}
/** Potential added to every prospect by academy investment, the club vision and synergies. */
export function academyPotentialBonus(w: World) {
  return (
    policyEffects(policyOf(w)).academyPotential +
    visionEffects(w).academyPotential +
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
  const growth =
    staffEffects(w).academyGrowth *
    (1 + w.facilities / 40) *
    policyEffects(policyOf(w)).academyGrowth *
    synergyEffects(w).academyGrowth;
  for (const player of players) {
    const gap = Math.max(0, player.potential - overall(player)),
      gain = hundredths(Math.min(0.3, gap / 150) * growth),
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
}

/**
 * Average overall of the automatic starters in each role, ignoring fatigue. Per role, because a
 * keeper's overall is his keeping alone and would otherwise always clear an outfield average.
 */
function firstTeamLevels(w: World) {
  const starters = selectedLineup(activePlayers(w), w.lineup, w.manager, w.year);
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
    if (age >= PROMOTION_AGE && (rated >= weakest || rated >= level[player.role] - 10))
      return 'ready';
    return age >= RELEASE_AGE ? 'review' : 'growing';
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
  if (!academyPlayers(w).some((prospect) => prospect.id === id))
    throw new Error('아카데미에 없는 선수입니다.');
  if (activePlayers(w).length >= SQUAD_LIMIT) throw new Error('선수단 정원은 26명입니다.');
  const player = takeProspect(w, id);
  // A first professional contract: a small wage for three seasons.
  player.wage = quote(clubOf(w).country, w.year, Math.max(10, overall(player) - 25));
  player.until = w.year + 3;
  player.status = 'active';
  player.fatigue = 0;
  w.players.push(player);
  addEvent(
    w,
    'youth-promotion',
    `${player.name} 1군 승격`,
    `${player.role} · ${w.year - player.born}세 · 능력 ${overall(player)} · 잠재력 ${Math.round(player.potential)} · 연봉 ${player.wage} · 계약 ${player.until}년`,
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
  if (!w.delegation?.academy) {
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
      `${prospectLine(w, player)} · 연봉 ${player.wage} · 계약 ${player.until}년`,
      player.id,
    );
  }
  for (const player of prospects)
    if (!promoted.has(player.id) && w.year - player.born >= RELEASE_AGE) {
      releaseYouth(w, player.id);
      staffReport(
        w,
        `유스 디렉터가 ${player.name}을(를) 내보냈어요`,
        `${prospectLine(w, player)} · ${
          ready.includes(player)
            ? affordable
              ? '1군 수준이지만 같은 포지션 자리가 없었어요.'
              : '1군 수준이지만 자금이 부족해 올리지 못했어요.'
            : `${RELEASE_AGE}세까지 1군 수준에 이르지 못했어요.`
        }`,
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
    };
  });
  return {
    players,
    /** First-team places left for promotions. */
    room: Math.max(0, SQUAD_LIMIT - activePlayers(w).length),
    capacity: ACADEMY_LIMIT,
    intakeDay: academyIntakeDay(w),
    intakeDone: w.academy?.intakeYear === w.year,
    nextIntakeSize: academyIntakeSize(w),
    delegated: !!w.delegation?.academy,
  };
}
