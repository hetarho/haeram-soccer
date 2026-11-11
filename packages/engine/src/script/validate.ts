/**
 * The script's validator (→MATCH-38, T826, T827), ported from the match prototype's
 * fit/validate.ts: every detail row and incident performed exactly once and as recorded, the ball
 * handed on from where the last beat left it, connective beats only of the forms MATCH-38 allows
 * (and stoppages that carry incidents), and the windows: every beat's men on the pitch in its minute
 * and between their entry and exit beats, every row in its period, every incident in its minute, no
 * side fielding more men than its record allows, the shoot-out's kicks in the recorded order.
 * Problems are short identifier strings; an empty list is a valid script.
 */
import type { MatchScript, ScriptBeat, ScriptBeatKind } from '../../../contracts/src/match-script';
import type { Vec } from '../staging/vec';
import { CENTRE, cellAt, cellsMeet, restartSpot, type Side } from './cells';
import {
  CARD_REASONS,
  EV,
  EVENT_KINDS,
  EVENT_RESULTS,
  FO,
  IN,
  INCIDENT_KINDS,
  SH,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  SO,
  ST,
  type MatchDetail,
} from './detail';
import { minuteIndex, PERIOD_STARTS } from './touches';
import {
  applyIncident,
  incidentPlaces,
  isRestart,
  kickOffSide,
  penaltySpot,
  pitchWindows,
  startingPresence,
} from './write';

/** Inside its record minute: a minute is pressed into its sixty seconds (write.ts). */
const inMinute = (clock: number, m: number) => clock >= m * 60 && clock < (m + 1) * 60;
const same = (a: Vec, b: Vec) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const other = (t: Side): Side => (t === 0 ? 1 : 0);
/** The detail's period code (0 regulation, 1 extra time) of a beat's period. */
const codeOf = (b: ScriptBeat) => (b.period <= 2 ? 0 : 1);

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
    if (codeOf(b) !== e[EV.period]) out.push(`${at}:period`);
    const kindOk =
      kind === 'carry'
        ? b.kind === 'carry'
        : kind === 'takeOn'
          ? b.kind === 'takeOn'
          : b.kind === 'pass' || (isRestart(b.kind) && b.kind !== 'penalty');
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
    const kind = SHOT_KINDS[s[SH.kind]!];
    const direct = kind === 'freeKick' && s[SH.source]! < 0;
    if (b.side !== s[SH.side]) out.push(`${at}:side`);
    if (b.actor !== s[SH.shooter]) out.push(`${at}:actor`);
    const kindOk =
      kind === 'penalty'
        ? b.kind === 'penalty'
        : b.kind === 'shot' || (direct && b.kind === 'freeKick');
    if (!kindOk) out.push(`${at}:kind`);
    // A direct free kick is struck from its foul's spot, a penalty from the spot; any other shot from its own cell.
    if (b.kind === 'penalty') {
      if (!same(b.from, penaltySpot(b.side))) out.push(`${at}:from`);
    } else if (b.kind !== 'freeKick' && cellAt(b.side, b.from) !== s[SH.cell])
      out.push(`${at}:from`);
    const outcome = { goal: 'goal', save: 'saved', block: 'blocked', miss: 'wide' }[
      SHOT_OUTCOMES[s[SH.outcome]!]!
    ];
    if (b.outcome !== outcome) out.push(`${at}:result`);
    if (b.outcome === 'saved' && b.opponent !== s[SH.keeper]) out.push(`${at}:keeper`);
    if (b.header !== (s[SH.header] === 1)) out.push(`${at}:header`);
    if (!inMinute(b.clock, minuteIndex(s[SH.minute]!, detail.length))) out.push(`${at}:minute`);
  }
  if (b.foul !== undefined) {
    const f = detail.fouls[b.foul];
    if (f === undefined) return [`${at}:foul`];
    if (b.side !== f[FO.fouledSide]) out.push(`${at}:side`);
    if (b.actor !== f[FO.fouled]) out.push(`${at}:actor`);
    if (b.opponent !== f[FO.fouler]) out.push(`${at}:fouler`);
    if (codeOf(b) !== f[FO.period]) out.push(`${at}:period`);
    if (b.outcome !== 'foul' || b.kind !== 'carry') out.push(`${at}:result`);
    if (cellAt(b.side, b.from) !== f[FO.cell]) out.push(`${at}:from`);
    const card = f[FO.cardMinute]!;
    if (card >= 0 && !inMinute(b.clock, minuteIndex(card, detail.length))) out.push(`${at}:minute`);
    // A booked foul shows its card on its own beat.
    if (f[FO.card]! >= 0 && !b.incidents?.some((x) => x.incident === f[FO.card]))
      out.push(`${at}:card`);
  }
  if (b.event === undefined && b.shot === undefined && b.foul === undefined) {
    const ok =
      (b.move === 'link' && b.kind === 'carry' && b.outcome === 'complete') ||
      (b.move === 'miscontrol' &&
        b.kind === 'carry' &&
        b.outcome === 'loose' &&
        b.opponent !== undefined) ||
      (b.move === 'restart' && isRestart(b.kind) && b.kind !== 'penalty') ||
      (b.move === 'stoppage' &&
        b.kind === 'stoppage' &&
        (b.incidents?.length ?? 0) > 0 &&
        same(b.from, b.to)) ||
      (b.kind === 'shootoutKick' && b.kick !== undefined);
    if (!ok) out.push(`${at}:connective`);
  }
  return out;
}

/** Where beat `b` must start and who must play it after `p` (stoppages passed over), or the restart it must be. */
function handOn(detail: MatchDetail, p: ScriptBeat, b: ScriptBeat): string[] {
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
    case 'foul': {
      const penalty = p.foul !== undefined && detail.fouls[p.foul]?.[FO.penalty] === 1;
      if (penalty) restart('penalty', p.side, penaltySpot(p.side));
      else restart('freeKick', p.side, restartSpot('freeKick', p.side, p.from));
      return out;
    }
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

/** The men a beat names, each with his side: all of them must be on the pitch when it is played. */
const menOf = (b: ScriptBeat): [Side, number][] => {
  const out: [Side, number][] = [[b.side, b.actor]];
  if (b.receiver !== undefined) out.push([b.side, b.receiver]);
  if (b.opponent !== undefined) out.push([other(b.side), b.opponent]);
  return out;
};

/** The incident a beat shows, checked against its row: the record's kind, side, men and reason. */
function incidentProblems(detail: MatchDetail, b: ScriptBeat): string[] {
  const out: string[] = [];
  for (const x of b.incidents ?? []) {
    const row = detail.incidents[x.incident];
    const at = `beat:${b.index}:incident:${x.incident}`;
    if (row === undefined) {
      out.push(at);
      continue;
    }
    const reason = row[IN.reason]! >= 0 ? CARD_REASONS[row[IN.reason]!] : undefined;
    const otherLine = row[IN.other]! >= 0 ? row[IN.other] : undefined;
    if (
      x.kind !== INCIDENT_KINDS[row[IN.kind]!] ||
      x.side !== row[IN.side] ||
      x.line !== row[IN.line] ||
      x.other !== otherLine ||
      x.reason !== reason
    )
      out.push(`${at}:row`);
    if (!inMinute(b.clock, minuteIndex(row[IN.minute]!, detail.length))) out.push(`${at}:minute`);
  }
  return out;
}

/** Problems of a script against its detail; empty = valid. */
export function validateScript(detail: MatchDetail, script: MatchScript): string[] {
  const problems: string[] = [];
  const seen = {
    event: Array<number>(detail.events.length).fill(0),
    shot: Array<number>(detail.shots.length).fill(0),
    foul: Array<number>(detail.fouls.length).fill(0),
    incident: Array<number>(detail.incidents.length).fill(0),
  };
  const length = detail.length;
  const onPitch = pitchWindows(detail);
  /** Each man's window and the minute his exit incident is in: he may play in it until he goes. */
  const extended = onPitch.map((side) => side.map((row) => [...row]));
  for (const s of detail.stints) {
    const to = s[ST.to]!;
    const row = extended[s[ST.side]!]?.[s[ST.line]!];
    if (row && to < length) row[to] = true;
  }
  const present = startingPresence(detail);
  const places = incidentPlaces(detail);
  const beats = script.beats;
  const play = beats.filter((b) => b.kind !== 'shootoutKick');
  const kicks = beats.filter((b) => b.kind === 'shootoutKick');
  const boundaries = PERIOD_STARTS.filter((m) => m < length).map((m) => m * 60);
  /** The beat before the current one that is not a stoppage. */
  let prev: ScriptBeat | undefined;
  const check = (b: ScriptBeat, m: number) => {
    for (const [side, line] of menOf(b)) {
      if (present[side]?.[line] !== true) problems.push(`beat:${b.index}:off`);
      if (extended[side]?.[line]?.[m] !== true) problems.push(`beat:${b.index}:window`);
    }
  };
  play.forEach((b, i) => {
    if (b.event !== undefined && b.event < seen.event.length) seen.event[b.event]!++;
    if (b.shot !== undefined && b.shot < seen.shot.length) seen.shot[b.shot]!++;
    if (b.foul !== undefined && b.foul < seen.foul.length) seen.foul[b.foul]!++;
    problems.push(...rowProblems(detail, b));
    problems.push(...incidentProblems(detail, b));
    const m = Math.floor(b.clock / 60);
    if (m >= length) problems.push(`beat:${b.index}:clock`);
    const p = play[i - 1];
    if (p !== undefined && b.clock < p.clock) problems.push(`beat:${b.index}:clock`);
    // Each period opens with a kick-off from the centre: side 0's, then side 1's, and so on.
    const k = boundaries.findIndex(
      (t) => (p === undefined ? t === 0 : p.clock < t) && b.clock >= t,
    );
    // Its incidents (a half-time substitution) come before it; any other beat's after it.
    const opening = k >= 0;
    if (opening) for (const x of b.incidents ?? []) applyIncident(present, x);
    check(b, Math.min(m, length - 1));
    if (!opening) for (const x of b.incidents ?? []) applyIncident(present, x);
    for (const x of b.incidents ?? []) {
      if (x.incident < seen.incident.length) seen.incident[x.incident]!++;
      const place = places[x.incident];
      const where =
        place?.at === 'foul'
          ? b.foul !== undefined
          : place?.at === 'kickOff'
            ? opening
            : b.kind === 'stoppage';
      if (!where) problems.push(`beat:${b.index}:incident:${x.incident}:place`);
    }
    if (opening) {
      if (b.kind !== 'kickOff' || b.side !== kickOffSide(k + 1) || !same(b.from, CENTRE))
        problems.push(`beat:${b.index}:half`);
    } else if (b.kind !== 'stoppage' && prev !== undefined)
      problems.push(...handOn(detail, prev, b));
    if (b.kind !== 'stoppage') prev = b;
    // The men on the pitch at a minute's end are the men its stints hold: none more, none other.
    const next = play[i + 1];
    if (next === undefined || Math.floor(next.clock / 60) !== m) {
      const at = Math.min(m, length - 1);
      ([0, 1] as const).forEach((side) => {
        const have = present[side]!.filter(Boolean).length;
        const allowed = onPitch[side]!.filter((row) => row[at]).length;
        if (have > allowed) problems.push(`minute:${at}:side:${side}:men`);
        else if (present[side]!.some((on, line) => on !== onPitch[side]![line]![at]))
          problems.push(`minute:${at}:side:${side}:lineup`);
      });
    }
  });
  // The shoot-out after the last whistle: every kick once, in the recorded order, as recorded.
  const lastClock = play.at(-1)?.clock ?? 0;
  kicks.forEach((b, j) => {
    const k = detail.shootout[j];
    const at = `beat:${b.index}`;
    if (k === undefined || b.kick !== j) {
      problems.push(`shootout:${j}:order`);
      return;
    }
    if (b.side !== k[SO.side] || b.actor !== k[SO.line]) problems.push(`${at}:kicker`);
    const scored = k[SO.scored] === 1;
    if (scored ? b.outcome !== 'goal' : b.outcome !== 'saved' && b.outcome !== 'wide')
      problems.push(`${at}:result`);
    if (b.period !== 5 || b.clock < length * 60 || b.clock < lastClock)
      problems.push(`${at}:clock`);
    if (!same(b.from, penaltySpot(b.side))) problems.push(`${at}:from`);
    check(b, length - 1);
  });
  if (
    kicks.length > 0 &&
    beats.findIndex((b) => b.kind === 'shootoutKick') !== beats.length - kicks.length
  )
    problems.push('shootout:order');
  for (let j = kicks.length; j < detail.shootout.length; j++)
    problems.push(`shootout:${j}:missing`);
  for (const [what, counts] of Object.entries(seen))
    counts.forEach((n, id) => {
      if (n !== 1) problems.push(`${what}:${id}:${n === 0 ? 'missing' : 'twice'}`);
    });
  return problems;
}
