import type {
  Player,
  TrainingCoach,
  TrainingFocus,
  TrainingOrder,
  World,
  YouthFocus,
} from '../../contracts/src/types';
import { clamp, random } from './primitives';
import { addEvent } from './world';
import { pushInbox } from './inbox';
import { autoPlayerFocus, autoTrainingAdvice, STAFF_INFO, staffMember } from './staff';
import { activeTrainingFocus, trainingFocusInfo } from './training';
import { YOUTH_FOCUS_INFO, youthAdvice } from './academy';
import { ORDER_ROUNDS, tidyOrders } from './orders';
import { activePlayers } from './world';

/** Settled rounds between two suggestions to the same coach (→STAFF-19). */
export const SUGGESTION_ROUNDS = 2;
/** Resignation chance per order forced on a coach this season, and its ceiling (→STAFF-19). */
export const STRAIN_RISK = 0.15;
export const MAX_STRAIN_RISK = 0.6;

type Focus = TrainingFocus | YouthFocus;
const TRAINING_COACHES: readonly TrainingCoach[] = ['assistant', 'youth'];
/** The call each coach's rule makes before anything else: suggesting otherwise goes against it. */
const URGENT: Record<TrainingCoach, Focus> = { assistant: 'recovery', youth: 'firstTeam' };

/** A focus's name for the coach who sets it. */
export function focusLabel(coach: TrainingCoach, focus: Focus) {
  return coach === 'assistant'
    ? trainingFocusInfo[focus as TrainingFocus].label
    : YOUTH_FOCUS_INFO[focus as YouthFocus].label;
}
/** Every focus the coach can set, in display order. */
export function coachFocuses(coach: TrainingCoach): Focus[] {
  return coach === 'assistant'
    ? (Object.keys(trainingFocusInfo) as TrainingFocus[])
    : (Object.keys(YOUTH_FOCUS_INFO) as YouthFocus[]);
}
const ruleOf = (w: World, coach: TrainingCoach) =>
  coach === 'assistant' ? autoTrainingAdvice(w) : youthAdvice(w);
/** The assistant's call for one player: his player rule, else the squad's focus (→CLUB-13). */
export function playerRule(w: World, p: Player): { focus: TrainingFocus; reason: string } {
  const own = autoPlayerFocus(w, p);
  if (own) return { focus: own, reason: `피로도 ${Math.round(p.fatigue)}라 회복부터 시켜야 해요.` };
  const squad = activeTrainingFocus(w);
  return { focus: squad, reason: `팀과 같은 ${trainingFocusInfo[squad].label}을(를) 소화해요.` };
}

/**
 * The focus in force for the first team (assistant) or the academy (youth director), who set it
 * and why (→CLUB-13, CLUB-31, STAFF-19).
 */
export function trainingCall(w: World, coach: TrainingCoach) {
  const order: TrainingOrder<Focus> | undefined = w.trainingOrders?.[coach],
    rule = ruleOf(w, coach);
  if (order)
    return {
      focus: order.focus,
      by: order.forced ? ('order' as const) : ('suggestion' as const),
      rounds: order.rounds,
      reason: order.forced
        ? `구단주 지시로 ${order.rounds}라운드 더 이어가요.`
        : `구단주 제안을 받아들여 ${order.rounds}라운드 더 이어가요.`,
      rule,
    };
  return { focus: rule.focus as Focus, by: 'rule' as const, rounds: 0, reason: rule.reason, rule };
}
/**
 * One first-team player's focus in force, who set it and why (→CLUB-11, CLUB-13, STAFF-19):
 * `squad` when he simply trains with the squad.
 */
export function playerTrainingCall(w: World, p: Player) {
  const order = w.trainingOrders?.players?.[p.id],
    rule = playerRule(w, p);
  if (order)
    return {
      focus: order.focus,
      by: order.forced ? ('order' as const) : ('suggestion' as const),
      rounds: order.rounds,
      reason: order.forced
        ? `구단주 지시로 ${order.rounds}라운드 더 이어가요.`
        : `구단주 제안을 받아들여 ${order.rounds}라운드 더 이어가요.`,
      rule,
    };
  const own = autoPlayerFocus(w, p);
  return {
    focus: rule.focus,
    by: own ? ('rule' as const) : ('squad' as const),
    rounds: 0,
    reason: rule.reason,
    rule,
  };
}
/**
 * The chance the coach takes the owner's suggestion now, stated before it is made; for a player
 * it is measured against the assistant's call for him.
 */
export function suggestionChance(w: World, coach: TrainingCoach, focus: Focus, player?: Player) {
  const rule = player ? playerRule(w, player).focus : ruleOf(w, coach).focus,
    ability = staffMember(w, coach)?.ability ?? 50;
  let chance = 0.55;
  if (focus === rule) chance += 0.3;
  else if (rule === URGENT[coach]) chance -= 0.25;
  chance -= (ability - 50) / 200;
  return Math.round(clamp(chance, 0.1, 0.95) * 100) / 100;
}
/** Settled rounds before the coach hears another suggestion; 0 when he can now. */
export function suggestionWait(w: World, coach: TrainingCoach) {
  const asked = staffMember(w, coach)?.asked;
  if (!asked || asked.year !== w.year) return 0;
  return Math.max(0, asked.round + SUGGESTION_ROUNDS - w.round);
}
/** Settled rounds before the owner can suggest a focus for this player again; 0 when he can now. */
export function playerSuggestionWait(w: World, playerId: string) {
  const asked = w.trainingOrders?.asked?.[playerId];
  if (!asked || asked.year !== w.year) return 0;
  return Math.max(0, asked.round + SUGGESTION_ROUNDS - w.round);
}
/** Orders forced on the coach this season. */
export function strainOf(w: World, coach: TrainingCoach) {
  const strain = staffMember(w, coach)?.strain;
  return strain && strain.year === w.year ? strain.count : 0;
}
const paid = (w: World, coach: TrainingCoach) => {
  const member = staffMember(w, coach);
  return !!member && BigInt(member.wage) > 0n;
};
/** The chance the coach resigns after one more forced order; a volunteer never does. */
export function forceRisk(w: World, coach: TrainingCoach) {
  if (!paid(w, coach)) return 0;
  return Math.min(MAX_STRAIN_RISK, Math.round(STRAIN_RISK * (strainOf(w, coach) + 1) * 100) / 100);
}
const percent = (chance: number) => `${Math.round(chance * 100)}%`;

/** A first-team player the assistant can set a focus for, or why not (→CLUB-11). */
function trainee(w: World, coach: TrainingCoach, playerId: string) {
  if (coach !== 'assistant') throw new Error('선수 개별 훈련은 수석코치가 정해요.');
  const p = activePlayers(w).find((one) => one.id === playerId);
  if (!p) throw new Error('1군 선수를 확인하세요.');
  return p;
}

/**
 * The owner suggests a focus to a coach, or forces it (→STAFF-19), for his whole group or, with
 * the assistant, for one first-team player (→CLUB-11). An accepted or forced focus holds the
 * next settled rounds; every forced one strains the coach, who may resign.
 */
export function orderTraining(
  w: World,
  coach: TrainingCoach,
  focus: Focus,
  force = false,
  playerId?: string,
) {
  if (!TRAINING_COACHES.includes(coach)) throw new Error('훈련을 맡은 코치를 확인하세요.');
  if (!coachFocuses(coach).includes(focus)) throw new Error('훈련 방향을 확인하세요.');
  const member = staffMember(w, coach);
  if (!member) throw new Error(`${STAFF_INFO[coach].label} 자리가 비어 있어요.`);
  const player = playerId === undefined ? undefined : trainee(w, coach, playerId);
  const name = `${STAFF_INFO[coach].label} ${member.name}`,
    label = focusLabel(coach, focus),
    whom = player ? `${player.name} ` : '',
    orders = (w.trainingOrders ||= {});
  const hold = (order: TrainingOrder<Focus>) => {
    if (player) (orders.players ||= {})[player.id] = order as TrainingOrder<TrainingFocus>;
    else (orders as Record<TrainingCoach, TrainingOrder<Focus>>)[coach] = order;
  };
  if (!force) {
    const wait = player ? playerSuggestionWait(w, player.id) : suggestionWait(w, coach);
    if (wait > 0)
      throw new Error(`${name}에게 ${whom}훈련은 ${wait}라운드 뒤에 다시 제안할 수 있어요.`);
    const chance = suggestionChance(w, coach, focus, player),
      rule = player ? playerRule(w, player) : ruleOf(w, coach);
    if (player) (orders.asked ||= {})[player.id] = { year: w.year, round: w.round };
    else member.asked = { year: w.year, round: w.round };
    const stream = `${w.seed}:coach-suggest:${coach}:${w.year}:${w.round}${player ? `:${player.id}` : ''}`;
    if (random(stream)() < chance) {
      hold({ focus, rounds: ORDER_ROUNDS });
      addEvent(
        w,
        'training-focus',
        `${name}, ${whom}${label} 제안 수락`,
        `다음 ${ORDER_ROUNDS}라운드 동안 ${whom}${label}로 훈련해요 · 수락 확률 ${percent(chance)}`,
      );
    } else {
      tidyOrders(w);
      addEvent(
        w,
        'training-focus',
        `${name}, ${whom}${label} 제안 거절`,
        `지금은 ${focusLabel(coach, rule.focus)}이(가) 맞다고 봐요 · ${rule.reason} · 수락 확률 ${percent(chance)}`,
      );
    }
    return;
  }
  const risk = forceRisk(w, coach);
  hold({ focus, rounds: ORDER_ROUNDS, forced: true });
  const count = strainOf(w, coach) + 1;
  if (paid(w, coach)) member.strain = { year: w.year, count };
  addEvent(
    w,
    'training-focus',
    `${name}에게 ${whom}${label} 강행`,
    `다음 ${ORDER_ROUNDS}라운드 동안 ${whom}${label}로 훈련해요 · 사임 확률 ${percent(risk)}`,
  );
  if (risk <= 0 || random(`${w.seed}:coach-force:${coach}:${w.year}:${w.round}:${count}`)() >= risk)
    return;
  w.staff = (w.staff || []).filter((other) => other.role !== coach);
  const detail = `구단주의 훈련 지시가 이번 시즌 ${count}번째였어요 · 보상금 없음 · 새 코치를 선임할 때까지 공석입니다.`;
  addEvent(w, 'staff-release', `${name} 사임`, detail);
  pushInbox(w, {
    kind: 'staff-renewal',
    title: `${name}이(가) 사임했어요`,
    detail,
    attention: true,
    ref: member.id,
  });
}
