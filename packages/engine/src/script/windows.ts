import type { MatchDetail } from './detail';
import { EV, EVENT_RESULTS, FO, SH, IN, INCIDENT_KINDS, SHOT_KINDS } from './codes';
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
  const add = (side: number, line: number) => {
    const stint = d.stints.find((s) => s[0] === side && s[1] === line);
    from = Math.max(from, stint?.[3] ?? Infinity);
    until = Math.min(until, stint?.[4] ?? -Infinity);
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
    add(1 - foul[FO.fouledSide]!, foul[FO.fouler]!);
  }
  return { period, from, until };
}

/** T827 supplies scene beats; the public writer refuses these until then. */
export function unsupportedProblems(d: MatchDetail): string[] {
  const problems = new Set<string>();
  for (const row of d.incidents) {
    const kind = INCIDENT_KINDS[row[IN.kind]!];
    if (kind === 'sub') problems.add('unsupported:substitution');
    else if (kind === 'injury') problems.add('unsupported:injury');
    else if (kind === 'red' || kind === 'secondYellow') problems.add('unsupported:dismissal');
    else if (
      kind === 'yellow' &&
      !d.fouls.some(
        (f) =>
          f[FO.cardMinute] === row[IN.minute] &&
          1 - f[FO.fouledSide]! === row[IN.side] &&
          f[FO.fouler] === row[IN.line],
      )
    )
      problems.add('unsupported:card');
  }
  if (
    d.penalties.length ||
    d.fouls.some((f) => f[FO.penalty] === 1) ||
    d.shots.some((s) => SHOT_KINDS[s[SH.kind]!] === 'penalty')
  )
    problems.add('unsupported:penalty');
  if (
    d.length === 120 ||
    d.events.some((e) => e[EV.period] === 1) ||
    d.fouls.some((f) => f[FO.period] === 1) ||
    d.shots.some((s) => s[SH.minute]! > 90)
  )
    problems.add('unsupported:extraTime');
  if (d.shootout.length) problems.add('unsupported:shootout');
  return [...problems];
}
