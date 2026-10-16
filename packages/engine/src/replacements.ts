import type { Player, World } from '../../contracts/src/types';
import { currentDay } from './calendar';
import { transferWindow, transferWindowDays } from './transfers';
import { lineOf } from './player';
import { isDelegated } from './responsibilities';
import { pushInbox } from './inbox';
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
    .sort((a, b) => a.day - b.day || a.playerId.localeCompare(b.playerId));
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
    .sort((a, b) => a.day - b.day || a.playerId.localeCompare(b.playerId));
  w.replacementNeeds = (w.replacementNeeds ?? []).filter((n) => !needs.includes(n));
  return needs;
}
