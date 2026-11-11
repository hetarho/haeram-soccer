/**
 * The script's validator (→MATCH-38, T826), ported from the match prototype's fit/validate.ts:
 * every detail row performed exactly once and as recorded, the ball handed on from where the last
 * beat left it, connective beats only of the three forms MATCH-38 allows, and the windows: every
 * beat's men on the pitch in its minute, every row in its period. Problems are short identifier
 * strings; an empty list is a valid script.
 */
import type { MatchScript, ScriptBeat, ScriptBeatKind } from '../../../contracts/src/match-script';
import type { Vec } from '../staging/vec';
import { CENTRE, cellAt, cellsMeet, restartSpot, type Side } from './cells';
import {
  EV,
  EVENT_KINDS,
  EVENT_RESULTS,
  FO,
  SH,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  type MatchDetail,
} from './detail';
import { minuteIndex } from './touches';
import { isRestart, pitchWindows } from './write';

/** Inside its record minute: a minute is pressed into its sixty seconds (write.ts). */
const inMinute = (clock: number, m: number) => clock >= m * 60 && clock < (m + 1) * 60;
const same = (a: Vec, b: Vec) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const other = (t: Side): Side => (t === 0 ? 1 : 0);

/** The detail row a beat performs, checked field by field. */
function rowProblems(detail: MatchDetail, b: ScriptBeat): string[] {
  const out: string[] = [];
  const at = `beat:${b.index}`;
  if (b.event !== undefined) {
    const e = detail.events[b.event];
    if (e === undefined) return [`${at}:event`];
    const kind = EVENT_KINDS[e[EV.kind]!]!;
    const res = EVENT_RESULTS[e[EV.result]!]!;
    const otherLine = e[EV.other]!;
    if (b.side !== e[EV.side]) out.push(`${at}:side`);
    if (b.actor !== e[EV.actor]) out.push(`${at}:actor`);
    if (b.period !== e[EV.period]) out.push(`${at}:period`);
    const kindOk =
      kind === 'carry'
        ? b.kind === 'carry'
        : kind === 'takeOn'
          ? b.kind === 'takeOn'
          : b.kind === 'pass' || isRestart(b.kind);
    if (!kindOk) out.push(`${at}:kind`);
    const fromCell = cellAt(b.side, b.from);
    const fromOk = isRestart(b.kind) ? cellsMeet(fromCell, e[EV.from]!) : fromCell === e[EV.from];
    if (!fromOk) out.push(`${at}:from`);
    if (cellAt(b.side, b.to) !== e[EV.to]) out.push(`${at}:to`);
    const want: Record<string, ScriptBeat['outcome']> = {
      complete: 'complete',
      offside: 'offside',
      intercepted: 'intercepted',
      outTouch: 'out',
      outByline: 'out',
      cornerWon: 'out',
      looseKept: 'loose',
      looseRecovered: 'loose',
      tackled: 'tackled',
    };
    if (b.outcome !== want[res]) out.push(`${at}:result`);
    if (res === 'offside' && b.receiver !== otherLine) out.push(`${at}:offsider`);
    if ((res === 'intercepted' || res === 'tackled' || res === 'looseRecovered') && otherLine >= 0)
      if (b.opponent !== otherLine) out.push(`${at}:other`);
    if (res === 'looseRecovered' && b.opponent === undefined) out.push(`${at}:other`);
    if (res === 'looseKept' && b.opponent !== undefined) out.push(`${at}:other`);
  }
  if (b.shot !== undefined) {
    const s = detail.shots[b.shot];
    if (s === undefined) return [`${at}:shot`];
    const direct = SHOT_KINDS[s[SH.kind]!] === 'freeKick' && s[SH.source]! < 0;
    if (b.side !== s[SH.side]) out.push(`${at}:side`);
    if (b.actor !== s[SH.shooter]) out.push(`${at}:actor`);
    if (!(b.kind === 'shot' || (direct && b.kind === 'freeKick'))) out.push(`${at}:kind`);
    // A direct free kick is struck from its foul's spot; any other shot from its own cell.
    if (b.kind !== 'freeKick' && cellAt(b.side, b.from) !== s[SH.cell]) out.push(`${at}:from`);
    const outcome = { goal: 'goal', save: 'saved', block: 'blocked', miss: 'wide' }[
      SHOT_OUTCOMES[s[SH.outcome]!]!
    ];
    if (b.outcome !== outcome) out.push(`${at}:result`);
    if (b.outcome === 'saved' && b.opponent !== s[SH.keeper]) out.push(`${at}:keeper`);
    if (b.header !== (s[SH.header] === 1)) out.push(`${at}:header`);
    if (!inMinute(b.clock, minuteIndex(s[SH.minute]!))) out.push(`${at}:minute`);
  }
  if (b.foul !== undefined) {
    const f = detail.fouls[b.foul];
    if (f === undefined) return [`${at}:foul`];
    if (b.side !== f[FO.fouledSide]) out.push(`${at}:side`);
    if (b.actor !== f[FO.fouled]) out.push(`${at}:actor`);
    if (b.opponent !== f[FO.fouler]) out.push(`${at}:fouler`);
    if (b.period !== f[FO.period]) out.push(`${at}:period`);
    if (b.outcome !== 'foul' || b.kind !== 'carry') out.push(`${at}:result`);
    if (cellAt(b.side, b.from) !== f[FO.cell]) out.push(`${at}:from`);
    const card = f[FO.cardMinute]!;
    if (card >= 0 && !inMinute(b.clock, minuteIndex(card))) out.push(`${at}:minute`);
  }
  if (b.event === undefined && b.shot === undefined && b.foul === undefined) {
    const ok =
      (b.move === 'link' && b.kind === 'carry' && b.outcome === 'complete') ||
      (b.move === 'miscontrol' &&
        b.kind === 'carry' &&
        b.outcome === 'loose' &&
        b.opponent !== undefined) ||
      (b.move === 'restart' && isRestart(b.kind));
    if (!ok) out.push(`${at}:connective`);
  }
  return out;
}

/** Where beat `b` must start and who must play it after `p`, or the restart it must be. */
function handOn(p: ScriptBeat, b: ScriptBeat): string[] {
  const at = `beat:${b.index}`;
  const out: string[] = [];
  const restart = (kind: ScriptBeatKind, side: Side, spot: Vec) => {
    if (b.kind !== kind || b.side !== side) out.push(`${at}:restart`);
    else if (!same(b.from, spot)) out.push(`${at}:spot`);
  };
  const live = (from: Vec, actor: number | undefined, side: Side) => {
    if (!same(b.from, from)) out.push(`${at}:jump`);
    if (b.side !== side || (actor !== undefined && b.actor !== actor)) out.push(`${at}:holder`);
  };
  switch (p.outcome) {
    case 'complete':
      return (
        live(p.to, p.kind === 'carry' || p.kind === 'takeOn' ? p.actor : p.receiver, p.side),
        out
      );
    case 'loose':
      return (
        p.opponent !== undefined
          ? live(p.to, p.opponent, other(p.side))
          : live(p.to, p.receiver, p.side),
        out
      );
    case 'intercepted':
      return (live(p.to, p.opponent, other(p.side)), out);
    case 'tackled':
      return (live(p.from, p.opponent, other(p.side)), out);
    case 'foul':
      return (restart('freeKick', p.side, restartSpot('freeKick', p.side, p.from)), out);
    case 'offside':
      return (
        restart('freeKick', other(p.side), restartSpot('freeKick', other(p.side), p.to)),
        out
      );
    case 'out':
      if (b.kind === 'corner') restart('corner', p.side, restartSpot('corner', p.side, p.to));
      else if (b.kind === 'throwIn' || b.kind === 'goalKick')
        restart(b.kind, other(p.side), restartSpot(b.kind, other(p.side), p.to));
      else out.push(`${at}:restart`);
      return out;
    case 'goal':
      return (restart('kickOff', other(p.side), CENTRE), out);
    case 'wide':
      if (b.kind === 'corner') restart('corner', p.side, restartSpot('corner', p.side, p.from));
      else restart('goalKick', other(p.side), restartSpot('goalKick', other(p.side), p.from));
      return out;
    case 'saved':
    case 'blocked':
      if (b.kind === 'corner') restart('corner', p.side, restartSpot('corner', p.side, p.from));
      else live(p.to, p.opponent, other(p.side));
      return out;
  }
}

/** The men a beat names, each with his side: all of them must be on the pitch in its minute. */
const menOf = (b: ScriptBeat): [Side, number][] => {
  const out: [Side, number][] = [[b.side, b.actor]];
  if (b.receiver !== undefined) out.push([b.side, b.receiver]);
  if (b.opponent !== undefined) out.push([other(b.side), b.opponent]);
  return out;
};

/** Problems of a script against its detail; empty = valid. */
export function validateScript(detail: MatchDetail, script: MatchScript): string[] {
  const problems: string[] = [];
  const seen = {
    event: Array<number>(detail.events.length).fill(0),
    shot: Array<number>(detail.shots.length).fill(0),
    foul: Array<number>(detail.fouls.length).fill(0),
  };
  const onPitch = pitchWindows(detail);
  const beats = script.beats;
  beats.forEach((b, i) => {
    if (b.event !== undefined && b.event < seen.event.length) seen.event[b.event]!++;
    if (b.shot !== undefined && b.shot < seen.shot.length) seen.shot[b.shot]!++;
    if (b.foul !== undefined && b.foul < seen.foul.length) seen.foul[b.foul]!++;
    problems.push(...rowProblems(detail, b));
    const m = Math.floor(b.clock / 60);
    for (const [side, line] of menOf(b))
      if (onPitch[side]?.[line]?.[m] !== true) problems.push(`beat:${i}:window`);
    const p = beats[i - 1];
    if (p !== undefined && b.clock < p.clock) problems.push(`beat:${i}:clock`);
    // Each half opens with a kick-off from the centre: side 0's, then side 1's at 2700.
    const half = p === undefined ? 0 : p.clock < 2700 && b.clock >= 2700 ? 1 : -1;
    if (half >= 0) {
      if (b.kind !== 'kickOff' || b.side !== half || !same(b.from, CENTRE))
        problems.push(`beat:${i}:half`);
      return;
    }
    problems.push(...handOn(p!, b));
  });
  for (const [what, counts] of Object.entries(seen))
    counts.forEach((n, id) => {
      if (n !== 1) problems.push(`${what}:${id}:${n === 0 ? 'missing' : 'twice'}`);
    });
  return problems;
}
