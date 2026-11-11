// The fitted script's validator (T820): every settled row performed exactly once and as recorded,
// the ball handed on from where the last beat left it, and connective beats only of the three
// allowed forms. Problems are short identifier strings; an empty list is a valid script.
import { CENTRE, cellAt, restartSpot, PITCH } from './cells';
import { EV, EVENT_KINDS, EVENT_RESULTS, FO, SH, SHOT_KINDS, SHOT_OUTCOMES } from './codes';
import type { MatchDetail as Settled } from './detail';
import type { Beat, BeatKind, Script, TeamId, Vec } from './types';
import { isRestartKind as isRestart, isPassLike } from './types';
import { dealFixed, minuteIndex } from './touches';
import { present, periodOf } from './windows';

/** Inside its record minute: a fitted minute is pressed into its sixty seconds (write.ts). */
const inMinute = (clock: number, m: number) => clock >= m * 60 && clock < (m + 1) * 60;

const same = (a: Vec, b: Vec) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const other = (t: TeamId): TeamId => (t === 0 ? 1 : 0);

/** The settled row a beat performs, checked field by field. */
function rowProblems(settled: Settled, b: Beat): string[] {
  const out: string[] = [];
  const at = `beat:${b.index}`;
  if (b.event !== undefined) {
    const e = settled.events[b.event];
    if (e === undefined) return [`${at}:event`];
    const kind = EVENT_KINDS[e[EV.kind]!]!;
    const res = EVENT_RESULTS[e[EV.result]!]!;
    const otherId = e[EV.other]!;
    if (b.side !== e[EV.side]) out.push(`${at}:side`);
    if (b.actor !== e[EV.actor]) out.push(`${at}:actor`);
    if (b.lineBreaking !== undefined && b.lineBreaking !== (e[EV.lineBreaking] === 1))
      out.push(`${at}:lineBreaking`);
    if (e[EV.lineBreaking] === 1 && !b.lineBreaking) out.push(`${at}:lineBreaking`);
    if (b.creditedOpponent !== e[EV.other]! >= 0) out.push(`${at}:credit`);
    if ((b.setPiece ?? 'none') !== ['none', 'corner', 'freeKick'][e[EV.setPiece]!])
      out.push(`${at}:setPiece`);
    if (b.move !== kind) out.push(`${at}:move`);
    if (b.outcome === 'out' && b.outKind !== res) out.push(`${at}:outKind`);
    const kindOk =
      kind === 'carry'
        ? b.kind === 'carry'
        : kind === 'takeOn'
          ? b.kind === 'takeOn'
          : b.kind === 'pass' || isRestart(b.kind);
    if (!kindOk) out.push(`${at}:kind`);
    const fromCell = cellAt(b.side, b.from);
    const fromOk = fromCell === e[EV.from];
    if (!fromOk) out.push(`${at}:from`);
    if (cellAt(b.side, b.to) !== e[EV.to]) out.push(`${at}:to`);
    const want: Record<string, Beat['outcome']> = {
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
    if (res === 'offside' && b.receiver !== otherId) out.push(`${at}:offsider`);
    if ((res === 'intercepted' || res === 'tackled' || res === 'looseRecovered') && otherId >= 0)
      if (b.opponent !== otherId) out.push(`${at}:other`);
    if (res === 'looseRecovered' && b.opponent === undefined) out.push(`${at}:other`);
    if (res === 'looseKept' && b.opponent !== undefined) out.push(`${at}:other`);
  }
  if (b.shot !== undefined) {
    const s = settled.shots[b.shot];
    if (s === undefined) return [`${at}:shot`];
    const direct = SHOT_KINDS[s[SH.kind]!] === 'freeKick' && s[SH.source]! < 0;
    if (b.side !== s[SH.side]) out.push(`${at}:side`);
    if (b.actor !== s[SH.shooter]) out.push(`${at}:actor`);
    if (
      b.xg !== s[SH.xg] ||
      b.shotKind !== SHOT_KINDS[s[SH.kind]!] ||
      b.source !== s[SH.source] ||
      b.corner !== (s[SH.corner] === 1) ||
      b.keeper !== s[SH.keeper] ||
      b.keyPass !== (s[SH.passer]! < 0 ? -1 : s[SH.source]!)
    )
      out.push(`${at}:qualifier`);
    if (!(b.kind === 'shot' || (direct && b.kind === 'freeKick'))) out.push(`${at}:kind`);
    // A direct free kick is struck from its foul's spot; any other shot from its own cell.
    if (cellAt(b.side, b.from) !== s[SH.cell]) out.push(`${at}:from`);
    const outcome = { goal: 'goal', save: 'saved', block: 'blocked', miss: 'wide' }[
      SHOT_OUTCOMES[s[SH.outcome]!]!
    ];
    if (b.outcome !== outcome) out.push(`${at}:result`);
    if (b.outcome === 'saved' && b.opponent !== s[SH.keeper]) out.push(`${at}:keeper`);
    if (b.header !== (s[SH.header] === 1)) out.push(`${at}:header`);
    const m = minuteIndex(s[SH.minute]!);
    if (!inMinute(b.clock!, m)) out.push(`${at}:minute`);
  }
  if (b.foul !== undefined) {
    const f = settled.fouls[b.foul];
    if (f === undefined) return [`${at}:foul`];
    if (b.side !== f[FO.fouledSide]) out.push(`${at}:side`);
    if (b.actor !== f[FO.fouled]) out.push(`${at}:actor`);
    if (b.opponent !== f[FO.fouler]) out.push(`${at}:fouler`);
    if (b.outcome !== 'foul' || b.kind !== 'carry') out.push(`${at}:result`);
    if (cellAt(b.side, b.from) !== f[FO.cell]) out.push(`${at}:from`);
    const card = f[FO.cardMinute]!;
    if (card >= 0) {
      const m = minuteIndex(card);
      if (!inMinute(b.clock!, m)) out.push(`${at}:minute`);
    }
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
function handOn(p: Beat, b: Beat): string[] {
  const at = `beat:${b.index}`;
  const out: string[] = [];
  const restart = (kind: BeatKind, side: TeamId, spot: Vec) => {
    if (b.kind !== kind || b.side !== side) out.push(`${at}:restart`);
    else if (
      !same(b.from, spot) &&
      !(
        kind === 'corner' &&
        [0.5, 67.5].some((y) =>
          same(b.from, restartSpot('corner', side, side === 0 ? [105, y] : [0, 68 - y])),
        )
      )
    )
      out.push(`${at}:spot`);
  };
  const live = (from: Vec, actor: number | undefined, side: TeamId = p.side) => {
    if (b.side !== side) out.push(`${at}:possession`);
    if (!same(b.from, from)) out.push(`${at}:jump`);
    if (actor !== undefined && b.actor !== actor) out.push(`${at}:holder`);
  };
  switch (p.outcome) {
    case 'complete':
      return (live(p.to, p.kind === 'carry' || p.kind === 'takeOn' ? p.actor : p.receiver), out);
    case 'loose':
      return (
        live(p.to, p.opponent ?? p.receiver, p.opponent === undefined ? p.side : other(p.side)),
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
      if (p.outKind === 'cornerWon') restart('corner', p.side, restartSpot('corner', p.side, p.to));
      else if (p.outKind === 'outTouch' || p.outKind === 'outByline') {
        const kind = p.outKind === 'outTouch' ? 'throwIn' : 'goalKick';
        restart(kind, other(p.side), restartSpot(kind, other(p.side), p.to));
      } else out.push(`${at}:restart`);
      return out;
    case 'goal':
      return (restart('kickOff', other(p.side), CENTRE), out);
    case 'wide':
      if (p.corner) restart('corner', p.side, restartSpot('corner', p.side, p.from));
      else restart('goalKick', other(p.side), restartSpot('goalKick', other(p.side), p.from));
      return out;
    case 'saved':
    case 'blocked':
      if (p.corner) restart('corner', p.side, restartSpot('corner', p.side, p.from));
      else live(p.to, p.opponent, other(p.side));
      return out;
  }
}

/** Problems of a fitted script against its settled match; empty = valid. */
export function validateScript(settled: Settled, script: Script): string[] {
  const problems: string[] = [];
  if (script.version !== 1 || script.bound !== true || typeof script.seed !== 'string')
    problems.push('script:header');
  const seen = {
    event: Array<number>(settled.events.length).fill(0),
    shot: Array<number>(settled.shots.length).fill(0),
    foul: Array<number>(settled.fouls.length).fill(0),
  };
  const beats = script.beats;
  const fixed = dealFixed(settled);
  beats.forEach((b, i) => {
    if (b.event !== undefined && b.event < seen.event.length) seen.event[b.event]!++;
    if (b.shot !== undefined && b.shot < seen.shot.length) seen.shot[b.shot]!++;
    if (b.foul !== undefined && b.foul < seen.foul.length) seen.foul[b.foul]!++;
    if (
      ![0, 1].includes(b.side) ||
      ![...b.from, ...b.to, b.hold, b.clock].every(Number.isFinite) ||
      b.hold < 0 ||
      ![b.from, b.to].every(([x, y]) => x >= 0 && x <= PITCH.length && y >= 0 && y <= PITCH.width)
    ) {
      problems.push(`beat:${i}:bounds`);
      return;
    }
    problems.push(...rowProblems(settled, b));
    if (
      isPassLike(b.kind) &&
      (b.outcome === 'complete' || (b.outcome === 'loose' && b.opponent === undefined)) &&
      b.receiver === undefined
    )
      problems.push(`beat:${i}:receiver`);
    if (
      b.event !== undefined &&
      fixed.events[b.event]! >= 0 &&
      !inMinute(b.clock, fixed.events[b.event]!)
    )
      problems.push(`beat:${i}:minute`);
    if (b.receiver === b.actor && b.receiver !== undefined) problems.push(`beat:${i}:selfPass`);
    if (b.index !== i) problems.push(`beat:${i}:index`);
    if (b.period !== periodOf(Math.floor(b.clock / 60))) problems.push(`beat:${i}:period`);
    const minute = Math.floor(b.clock / 60);
    if (
      !present(settled, b.side, b.actor, minute) ||
      (b.receiver !== undefined && !present(settled, b.side, b.receiver, minute)) ||
      (b.opponent !== undefined && !present(settled, other(b.side), b.opponent, minute))
    )
      problems.push(`beat:${i}:stint`);
    if (b.event !== undefined && b.period !== settled.events[b.event]?.[EV.period])
      problems.push(`beat:${i}:period`);
    if (b.foul !== undefined && b.period !== settled.fouls[b.foul]?.[FO.period])
      problems.push(`beat:${i}:period`);
    if (!Number.isFinite(b.clock) || b.clock < 0 || b.clock >= settled.length * 60)
      problems.push(`beat:${i}:clock`);
    const p = beats[i - 1];
    if (p !== undefined && b.clock! < p.clock!) problems.push(`beat:${i}:clock`);
    // Each half opens with a kick-off from the centre: home's, then away's at 2700.
    const halfOf = (clock: number) => (clock < 2700 ? 0 : clock < 5400 ? 1 : clock < 6300 ? 2 : 3);
    const half = p === undefined ? 0 : halfOf(p.clock) !== halfOf(b.clock) ? halfOf(b.clock) : -1;
    if (half >= 0) {
      if (
        b.kind !== 'kickOff' ||
        b.side !== half % 2 ||
        !same(b.from, CENTRE) ||
        b.clock !== [0, 2700, 5400, 6300][half]
      )
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
