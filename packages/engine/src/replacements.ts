import { callUpFor, SQUAD_TARGET } from './squad-target';
import { activePlayers } from './player-state';
import { refillPosition } from './world';
import { POSITION_LABEL } from './player';
import type { Player, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { transferWindow, transferWindowDays } from './transfer-window';
import { lineOf } from './player';
import { isDelegated } from './responsibilities';
import { pushInbox } from './inbox';
import { compareIds } from './primitives';
export type ReplacementNeed = NonNullable<World['replacementNeeds']>[number];
export function openNeed(w: World, player: Player, day = currentDay(w)) {
  const window = transferWindow(w, day).kind;
  if (!window) return;
  const need = { line: lineOf(player.position), playerId: player.id, year: w.year, window, day };
  if (
    w.replacementNeeds?.some(
      (n) => n.playerId === player.id && n.year === w.year && n.window === window,
    )
  )
    return;
  (w.replacementNeeds ??= []).push(need);
  if (!isDelegated(w, 'recruitment'))
    pushInbox(w, {
      kind: 'staff-report',
      title: `${player.name} 이탈 · 대체 영입 필요`,
      detail: `대체 영입 필요 · ${need.line} · 영입은 구단주가 직접 결정해요.`,
      attention: false,
      ref: player.id,
    });
  return need;
}
export function openNeeds(w: World) {
  const window = transferWindow(w).kind;
  return (w.replacementNeeds ?? [])
    .filter((need) => need.year === w.year && need.window === window)
    .sort((a, b) => a.day - b.day || compareIds(a.playerId, b.playerId));
}
export function closeNeedFor(w: World, player: Player) {
  const need = openNeeds(w).find((n) => n.line === lineOf(player.position));
  if (need) w.replacementNeeds = w.replacementNeeds!.filter((n) => n !== need);
}
/** Consume only the window being judged; a later window's needs remain intact. */
export function takeWindowNeeds(w: World) {
  const days = transferWindowDays(w.year),
    day = currentDay(w);
  const window = day === days.summerClose + 1 ? 'summer' : 'winter';
  const needs = (w.replacementNeeds ?? [])
    .filter((n) => n.year === w.year && n.window === window)
    .sort((a, b) => a.day - b.day || compareIds(a.playerId, b.playerId));
  w.replacementNeeds = (w.replacementNeeds ?? []).filter((n) => !needs.includes(n));
  return needs;
}

/** Judge-day academy cover follows replacement order, then the ordinary squad deficit. */
export function windowCallUps(w: World) {
  const needs = takeWindowNeeds(w);
  const direct = !isDelegated(w, 'academy');
  const ref = `callups:${w.year}:${currentDay(w)}`;
  if (direct && w.inbox?.some((item) => item.ref === ref)) return;
  const target = direct ? structuredClone(w) : w;
  const existing = new Set(w.academy?.players.map((p) => p.id));
  const recommendations: string[] = [];
  const add = (line: import('../../contracts/src/types').Line, source: 'replacement' | 'short') => {
    const player = callUpFor(target, line, source);
    if (!player) return false;
    recommendations.push(
      existing.has(player.id)
        ? `${player.name}(${POSITION_LABEL[player.position]})`
        : `${POSITION_LABEL[player.position]} 승격 후보 없음`,
    );
    return true;
  };
  let room = true;
  for (const need of needs)
    if (!add(need.line, 'replacement')) {
      room = false;
      break;
    }
  while (room && activePlayers(target).length < SQUAD_TARGET)
    room = add(lineOf(refillPosition(target)), 'short');
  if (direct && recommendations.length)
    pushInbox(w, {
      kind: 'staff-report',
      title: '유스 디렉터 보고 · 이적시장 마감 보충 추천',
      detail: `${recommendations.join(' → ')} · 승격은 아카데미에서 직접 결정해 주세요.`.slice(
        0,
        400,
      ),
      attention: true,
      ref,
    });
}
