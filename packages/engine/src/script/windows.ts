import type { MatchDetail } from './detail';
import { EV, EVENT_RESULTS, FO, SH } from './codes';
import type { TeamId } from './types';

export const periodOf = (minute: number): 0 | 1 => (minute >= 90 ? 1 : 0);
/** A recorded minute names the preceding minute's interval; period edges stay on their side. */
export const minuteIndex = (m: number, half?: 0 | 1): number =>
  half === 0
    ? Math.min(Math.max(m - 1, 0), 44)
    : half === 1
      ? Math.min(Math.max(m - 1, 45), 89)
      : Math.min(Math.max(m - 1, 0), 119);
export const present = (d: MatchDetail, side: TeamId, line: number, minute: number) =>
  d.stints.some((s) => s[0] === side && s[1] === line && s[3]! <= minute && s[4]! > minute);

export type Release = { event: number } | { shot: number } | { foul: number };
/** Intersection of every participant's stint and the row's period. A line never returns. */
export function touchWindow(d: MatchDetail, carries: number[], release?: Release) {
  const events = [...carries, ...(release && 'event' in release ? [release.event] : [])];
  const shot = release && 'shot' in release ? d.shots[release.shot] : undefined;
  const foul = release && 'foul' in release ? d.fouls[release.foul] : undefined;
  const period = (
    shot
      ? shot[SH.minute]! > 90
        ? 1
        : 0
      : foul
        ? foul[FO.period]!
        : d.events[events[0]!]![EV.period]!
  ) as 0 | 1;
  let from = period === 0 ? 0 : 90,
    until = period === 0 ? 90 : 120;
  const span = (side: number, line: number) => {
    const stints = d.stints.filter((s) => s[0] === side && s[1] === line);
    // Moving to another slot splits a continuous spell; it never takes the man off the pitch.
    return [Math.min(...stints.map((s) => s[3]!)), Math.max(...stints.map((s) => s[4]!))];
  };
  const add = (side: number, line: number) => {
    const [start, end] = span(side, line);
    from = Math.max(from, start!);
    until = Math.min(until, end!);
  };
  for (const id of events) {
    const e = d.events[id]!,
      side = e[EV.side]!;
    add(side, e[EV.actor]!);
    if (e[EV.period] !== period) until = -1;
    if (e[EV.other]! >= 0)
      add(EVENT_RESULTS[e[EV.result]!] === 'offside' ? side : 1 - side, e[EV.other]!);
  }
  if (shot) {
    add(shot[SH.side]!, shot[SH.shooter]!);
    add(1 - shot[SH.side]!, shot[SH.keeper]!);
    if (shot[SH.passer]! >= 0) add(shot[SH.side]!, shot[SH.passer]!);
  }
  if (foul) {
    add(foul[FO.fouledSide]!, foul[FO.fouled]!);
    const side = 1 - foul[FO.fouledSide]!;
    const line = foul[FO.fouler]!;
    // A sending-off foul is the departing man's last act at that minute's boundary.
    const [start, end] = span(side, line);
    from = Math.max(from, start!);
    until = Math.min(until, end! + (foul[FO.cardMinute] === end! + 1 ? 1 : 0));
  }
  return { period, from, until };
}
