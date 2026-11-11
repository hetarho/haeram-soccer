/**
 * The script writer (→MATCH-38, MATCH-15, ARCH-5, ARCH-9; T826, T827): a detail laid out as an
 * order of play that performs every recorded row exactly once, by its recorded player, in its
 * recorded cell, ported from the match prototype's fit/write.ts as T822 left it. The record is the
 * fact; the writer chooses only the order (greedy over the whole match: the cheapest touch by
 * `touchCost`), the minutes of the rows the record gives none, the receivers, the points inside the
 * cells, the clock and the connective beats MATCH-38 allows (link carries, heavy touches, restart
 * deliveries no recorded pass makes).
 *
 * Windows: a floating row is played only in a minute of its period in which its actor and the man
 * who wins it are on the pitch (`detail.stints`); a row whose last such minute comes is played in it,
 * as a fixed row is. A detail whose rows cannot all be placed gives problems, never a partial script.
 *
 * Incidents (T827) are played in their record minute: a booked foul's card on the foul's beat; an
 * incident stamped at a period's first minute (a half-time substitution: 46, 91, 106) on that
 * period's kick-off; every other one of a minute and side on one `stoppage` in the record's order,
 * opened at the minute's first dead ball (a restart owed) or when a keeper has the ball, else once
 * the minute's share of touches is played (play then resumes with the man who had the ball). A man
 * is on the pitch from kick-off or his entry beat to his exit beat. A penalty is its foul in the box
 * and then a `penalty` beat; extra time's periods 3 and 4 are written like halves; the shoot-out's
 * kicks follow the last whistle in the recorded order.
 *
 * Platform-stable (→ARCH-9): costs are integer centimetres, ties go to the stream's order, points
 * come from `+ − × ÷`, square root, min and max; the one random stream is `${seed}:script`.
 */
import type {
  MatchScript,
  ScriptBeat,
  ScriptBeatKind,
  ScriptBeatOutcome,
  ScriptIncident,
  ScriptPhase,
} from '../../../contracts/src/match-script';
import { attackFrame, PITCH } from '../grid/pitch';
import { integer, random } from '../primitives';
import { nominalSpot, type ShapeSide } from '../staging/shape';
import type { Vec } from '../staging/vec';
import {
  CENTRE,
  cellAt,
  cellCentre,
  cellGap,
  cellsMeet,
  dist2,
  goalAim,
  intoCell,
  keeperHold,
  metres,
  pointAway,
  restartSpot,
  spot,
  type Side,
} from './cells';
import { SCRIPT_CONFIG } from './config';
import {
  CARD_REASONS,
  detailIssues,
  EV,
  EVENT_KINDS,
  FO,
  IN,
  INCIDENT_KINDS,
  periodOfMinute,
  R,
  SET_PIECES,
  SH,
  SHOT_OUTCOMES,
  SO,
  ST,
  type MatchDetail,
} from './detail';
import {
  buildTouches,
  dealFixed,
  FLOATING,
  firstCell,
  minuteIndex,
  PERIOD_STARTS,
  periodAt,
  type Touch,
} from './touches';

const C = SCRIPT_CONFIG;
/** Centimetres of the costs the config states in metres. */
const CM = {
  fixedPull: C.fixedPull * 100,
  fixedPush: C.fixedPush * 100,
  fixedRamp: C.fixedRamp * 100,
  paceBias: C.paceBias * 100,
  setPieceWait: C.setPieceWait * 100,
  placeWeight: C.placeWeight * 100,
  idleWinner: C.idleWinner * 100,
};
const KIND = (code: number) => EVENT_KINDS[code]!;
const other = (t: Side): Side => (t === 0 ? 1 : 0);
const PASS_LIKE: readonly ScriptBeatKind[] = [
  'kickOff',
  'pass',
  'throwIn',
  'goalKick',
  'corner',
  'freeKick',
];
const RESTARTS: readonly ScriptBeatKind[] = [
  'kickOff',
  'throwIn',
  'goalKick',
  'corner',
  'freeKick',
  'penalty',
];
export const isRestart = (k: ScriptBeatKind) => RESTARTS.includes(k);
export const isPassLike = (k: ScriptBeatKind) => PASS_LIKE.includes(k);
const isLofted = (k: number) => KIND(k) === 'long' || KIND(k) === 'cross';
/** The side that kicks off a period: side 0 the first half and extra time's first, side 1 the others. */
export const kickOffSide = (period: number): Side => (period % 2 === 1 ? 0 : 1);
/** Where `side` kicks a penalty or a shoot-out kick from. */
export const penaltySpot = (side: Side): Vec => spot(attackFrame(side, C.penaltySpot));
/** The kinds of incident that take their man off the pitch. */
const OFF_KINDS = new Set(['secondYellow', 'red', 'injury', 'sub']);

interface Owed {
  kind: ScriptBeatKind;
  side: Side;
  spot: Vec;
  /** A touch that must deliver it (a direct free-kick shot or a penalty after its foul). */
  via?: number;
}
interface Pending {
  event: number;
  actor: number;
  side: Side;
  from: Vec;
  kind: ScriptBeatKind;
  outcome: ScriptBeatOutcome;
}

const phaseOf = (side: Side, ball: Vec): ScriptPhase => {
  const x = attackFrame(side, ball)[0];
  return x < C.phaseX.progression
    ? 'buildUp'
    : x < C.phaseX.finalThird
      ? 'progression'
      : 'finalThird';
};

/** On the pitch by side, line and minute index (0 to the detail's length): its stints, minutes (from, to]. */
export function pitchWindows(detail: MatchDetail): boolean[][][] {
  const out = ([0, 1] as const).map((side) =>
    detail.sides[side].lines.map(() => Array<boolean>(detail.length).fill(false)),
  );
  for (const s of detail.stints) {
    const row = out[s[ST.side]!]?.[s[ST.line]!];
    if (!row) continue;
    for (let m = 0; m < detail.length; m++)
      if (s[ST.from]! < m + 1 && s[ST.to]! >= m + 1) row[m] = true;
  }
  return out;
}

/** Each line's slot by side, line and minute index: the stint covering the minute's, else his first. */
export function slotWindows(detail: MatchDetail): number[][][] {
  const out = ([0, 1] as const).map((side) =>
    detail.sides[side].lines.map((l) => Array<number>(detail.length).fill(l.slot)),
  );
  for (const s of detail.stints) {
    const row = out[s[ST.side]!]?.[s[ST.line]!];
    if (!row) continue;
    for (let m = 0; m < detail.length; m++)
      if (s[ST.from]! < m + 1 && s[ST.to]! >= m + 1) row[m] = s[ST.slot]!;
  }
  return out;
}

/** An incident row as a beat carries it. */
export function scriptIncident(detail: MatchDetail, i: number): ScriptIncident {
  const x = detail.incidents[i]!;
  const kind = INCIDENT_KINDS[x[IN.kind]!]!;
  return {
    kind,
    side: x[IN.side] as Side,
    line: x[IN.line]!,
    ...(x[IN.other]! >= 0 && { other: x[IN.other]! }),
    ...(x[IN.reason]! >= 0 && { reason: CARD_REASONS[x[IN.reason]!]! }),
    incident: i,
  };
}

/** Who is on the pitch after `x`: a substitution's man off and `other` on, a sending-off or an injury his man off. */
export function applyIncident(present: boolean[][], x: ScriptIncident): void {
  if (!OFF_KINDS.has(x.kind)) return;
  present[x.side]![x.line] = false;
  if (x.kind === 'sub' && x.other !== undefined) present[x.side]![x.other] = true;
}

/** The lines on the pitch at kick-off: every stint from 0. */
export function startingPresence(detail: MatchDetail): boolean[][] {
  const out = detail.sides.map((s) => s.lines.map(() => false));
  for (const s of detail.stints) if (s[ST.from] === 0) out[s[ST.side]!]![s[ST.line]!] = true;
  return out;
}

/**
 * Where each incident is shown: `foul` the booked foul it rides, else `kickOff` for one stamped at a
 * period's first minute, else `stoppage`; with its minute index.
 */
export function incidentPlaces(
  detail: MatchDetail,
): { at: 'foul' | 'kickOff' | 'stoppage'; minute: number }[] {
  const booked = new Set(detail.fouls.map((f) => f[FO.card]!).filter((c) => c >= 0));
  return detail.incidents.map((x, i) => {
    const minute = minuteIndex(x[IN.minute]!, detail.length);
    return {
      at: booked.has(i)
        ? 'foul'
        : (PERIOD_STARTS as readonly number[]).includes(minute)
          ? 'kickOff'
          : 'stoppage',
      minute,
    };
  });
}

/** The men a touch's rows name, each with his side: its actor and every winner or man caught offside. */
function menOf(detail: MatchDetail, t: Touch): { side: Side; line: number }[] {
  const out: { side: Side; line: number }[] = [{ side: t.side, line: t.actor }];
  const eventMen = (id: number) => {
    const e = detail.events[id]!;
    const o = e[EV.other]!;
    if (o >= 0) out.push({ side: e[EV.result] === R.offside ? t.side : other(t.side), line: o });
  };
  t.carries.forEach(eventMen);
  const r = t.release;
  if (r !== undefined && 'event' in r) eventMen(r.event);
  if (r !== undefined && 'foul' in r)
    out.push({ side: other(t.side), line: detail.fouls[r.foul]![FO.fouler]! });
  return out;
}

/** The detail's period code (0 regulation, 1 extra time) a touch's rows are recorded in. */
function periodOf(detail: MatchDetail, t: Touch): number {
  const r = t.release;
  const id = t.carries[0] ?? (r !== undefined && 'event' in r ? r.event : -1);
  if (id >= 0) return detail.events[id]![EV.period]!;
  if (r !== undefined && 'foul' in r) return detail.fouls[r.foul]![FO.period]!;
  if (r !== undefined && 'shot' in r) return periodOfMinute(detail.shots[r.shot]![SH.minute]!);
  return 0;
}

/**
 * The minutes (0 to the detail's length) each touch may be played in: a minute of its period (1–90
 * regulation, 91–120 extra time) in which every man its rows name is on the pitch.
 */
export function touchWindows(detail: MatchDetail, touches: readonly Touch[]): boolean[][] {
  const onPitch = pitchWindows(detail);
  return touches.map((t) => {
    const men = menOf(detail, t);
    const period = periodOf(detail, t);
    return Array.from(
      { length: detail.length },
      (_, m) =>
        (m < 90 ? 0 : 1) === period && men.every((p) => onPitch[p.side]![p.line]?.[m] === true),
    );
  });
}

/** The shape's two sides in a minute: each slot's role, present while a stint holds it. */
function shapeSides(detail: MatchDetail, m: number): [ShapeSide, ShapeSide] {
  return ([0, 1] as const).map((side): ShapeSide => {
    const s = detail.sides[side];
    const roles: ShapeSide['roles'][number][] = [];
    const present: boolean[] = [];
    s.lines.forEach((l) => {
      roles[l.slot] ??= l.role as ShapeSide['roles'][number];
      present[l.slot] ??= false;
    });
    for (const st of detail.stints)
      if (st[ST.side] === side && st[ST.from]! < m + 1 && st[ST.to]! >= m + 1)
        present[st[ST.slot]!] = true;
    for (let k = 0; k < roles.length; k++) present[k] ??= false;
    return { tactic: s.tactic, roles, present };
  }) as [ShapeSide, ShapeSide];
}

/** The script of `detail`, or the problems that keep it from being written: the detail's own (`detailIssues`) and `unplaced:<row>` for a row no minute could take. */
export function writeScript(
  detail: MatchDetail,
  seed: string,
): { script: MatchScript } | { problems: string[] } {
  const issues = detailIssues(detail);
  if (issues.length > 0) return { problems: issues };
  return write(detail, seed);
}

function write(
  detail: MatchDetail,
  seed: string,
): { script: MatchScript } | { problems: string[] } {
  const LENGTH = detail.length;
  const onPitch = pitchWindows(detail);
  const slots = slotWindows(detail);
  const shapes = Array.from({ length: LENGTH }, (_, m) => shapeSides(detail, m));
  const lines = detail.sides.map((s) => s.lines);
  const touches = buildTouches(detail, dealFixed(detail));
  const played = touches.map(() => false);
  const startCell = touches.map((t) => firstCell(detail, t));
  const touchMen = touches.map((t) => menOf(detail, t));
  const codeOf = touches.map((t) => periodOf(detail, t));
  // The stream's order of the touches: ties of `touchCost` go to the earlier.
  const rng = random(`${seed}:script`);
  const order = touches.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = integer(rng, 0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  // Windows: the minutes each touch may be played in (its rows' players on the pitch, its period).
  const window = touchWindows(detail, touches);
  /** The last minute a floating touch may be played in; −1 for none. */
  const last = window.map((w) => w.lastIndexOf(true));
  const never = touches.flatMap((t, i) =>
    t.minute === FLOATING && last[i]! < 0 ? [`unplaced:${rowName(t)}`] : [],
  );
  if (never.length > 0) return { problems: never };

  // Incidents: who is on the pitch, and the stoppages each minute owes.
  const present = startingPresence(detail);
  const places = incidentPlaces(detail);
  /** Stoppage groups by minute index: the incidents of one side, in the record's order. */
  const stops: number[][][] = Array.from({ length: LENGTH }, () => []);
  places.forEach((p, i) => {
    if (p.at !== 'stoppage') return;
    const side = detail.incidents[i]![IN.side]!;
    const group = stops[p.minute]!.find((g) => detail.incidents[g[0]!]![IN.side] === side);
    if (group) group.push(i);
    else stops[p.minute]!.push([i]);
  });
  /** Incidents riding each period's kick-off, by minute index. */
  const riding = new Map<number, number[]>();
  places.forEach((p, i) => {
    if (p.at === 'kickOff') riding.set(p.minute, [...(riding.get(p.minute) ?? []), i]);
  });
  /** Incidents to show on the next beat written (a kick-off's). */
  let carrying: ScriptIncident[] | null = null;

  /** Touches by period code (0 regulation, 1 extra time) and side. */
  const total = [
    [0, 0],
    [0, 0],
  ];
  const done = [
    [0, 0],
    [0, 0],
  ];
  const endsTotal = [
    [0, 0],
    [0, 0],
  ];
  const endsDone = [
    [0, 0],
    [0, 0],
  ];
  /** Whether touch `i` ends its side's possession when played (a failed release, a shot, a lost carry). */
  const ends = touches.map((t) => {
    const r = t.release;
    if (r === undefined) {
      const lastCarry = t.carries[t.carries.length - 1];
      return lastCarry !== undefined && detail.events[lastCarry]![EV.result] !== R.complete;
    }
    // A shot that wins a corner and a pass out for a corner keep the ball for the side.
    if ('shot' in r) return detail.shots[r.shot]![SH.corner] !== 1;
    if ('foul' in r) return false;
    const res = detail.events[r.event]![EV.result]!;
    return res !== R.complete && res !== R.looseKept && res !== R.cornerWon;
  });
  touches.forEach((t, i) => {
    total[codeOf[i]!]![t.side]!++;
    if (ends[i]) endsTotal[codeOf[i]!]![t.side]!++;
  });
  const regulationTouches = total[0]![0]! + total[0]![1]!;
  const extraTouches = total[1]![0]! + total[1]![1]!;
  /** The line of the other side a touch's record names as winning the ball from it, or −1. */
  const winnerOf = touches.map((t) => {
    const r = t.release;
    const id =
      r !== undefined && 'event' in r ? r.event : r === undefined ? (t.carries.at(-1) ?? -1) : -1;
    if (id < 0) return -1;
    const e = detail.events[id]!;
    const res = e[EV.result]!;
    return res === R.intercepted || res === R.tackled || res === R.looseRecovered
      ? e[EV.other]!
      : -1;
  });
  /** Unplayed touches by side and line. */
  const touchesLeft = lines.map((l) => l.map(() => 0));
  for (const t of touches) touchesLeft[t.side]![t.actor]!++;
  /** Whether touch `i` releases a pass the record flags as a corner's or free kick's delivery. */
  const setPiece = touches.map(
    (t) =>
      t.release !== undefined &&
      'event' in t.release &&
      SET_PIECES[detail.events[t.release.event]![EV.setPiece]!] !== 'none',
  );
  const beats: ScriptBeat[] = [];
  const minuteOf: number[] = [];
  let possession = 0;
  /** The last beat written that is not a stoppage. */
  let live: ScriptBeat | undefined;
  let side: Side = 0;
  let ball: Vec = CENTRE;
  let holder = -1;
  let owed: Owed | null = null;
  let pending: Pending | null = null;
  let nextOwed = -1;
  /** The touch a pass's receiver was chosen for. */
  let intended = -1;
  let minute = 0;
  /** Touches played before the minute being written. */
  let minuteStart = 0;
  const doneAll = () => done[0]![0]! + done[0]![1]! + done[1]![0]! + done[1]![1]!;
  const code = () => (minute < 90 ? 0 : 1);

  const slotOf = (s: Side, line: number) => slots[s]![line]![Math.min(minute, LENGTH - 1)]!;
  /** Line `line` of `s`'s place for a ball at `at`, `team` in possession. */
  const spotOf = (s: Side, line: number, at: Vec = ball, team: Side = side): Vec =>
    nominalSpot(
      { sides: shapes[Math.min(minute, LENGTH - 1)]!, ball: at, team, phase: phaseOf(team, at) },
      s,
      slotOf(s, line),
    );
  /** The lines of `team` on the pitch now (this minute's stints, and in by the beats so far), the keeper last. */
  const onNow = (team: Side): number[] =>
    lines[team]!.flatMap((_, line) =>
      onPitch[team]![line]![Math.min(minute, LENGTH - 1)] && present[team]![line] ? [line] : [],
    );
  const keeperOf = (team: Side): number => {
    const now = onNow(team);
    return now.find((line) => slotOf(team, line) === 0) ?? now[0] ?? 0;
  };
  const nearestBy = (team: Side, at: Vec, exclude: number[] = [], keeper = false): number => {
    let best = -1;
    let bestD = Infinity;
    for (const line of onNow(team)) {
      if (exclude.includes(line) || (slotOf(team, line) === 0 && !keeper)) continue;
      const d = dist2(spotOf(team, line, at), at);
      if (d < bestD) [best, bestD] = [line, d];
    }
    return best >= 0 ? best : keeperOf(team);
  };
  const push = (
    b: Pick<ScriptBeat, 'side' | 'move' | 'kind' | 'actor' | 'from' | 'to' | 'outcome'> &
      Partial<ScriptBeat>,
  ): ScriptBeat => {
    const stoppage = b.kind === 'stoppage';
    if (!stoppage && live !== undefined && (live.side !== b.side || isRestart(b.kind)))
      possession++;
    const beat: ScriptBeat = {
      loft: false,
      through: false,
      header: false,
      hold: 0,
      clock: 0,
      ...b,
      index: beats.length,
      possession,
      phase: isRestart(b.kind) || stoppage ? 'setPiece' : phaseOf(b.side, b.from),
      period: periodAt(minute),
    };
    if (carrying !== null) {
      beat.incidents = [...(beat.incidents ?? []), ...carrying];
      carrying = null;
    }
    beats.push(beat);
    minuteOf.push(minute);
    if (!stoppage) live = beat;
    // A booked foul's card is shown as it is played, and a sending-off takes its man off.
    if (b.incidents) for (const x of b.incidents) applyIncident(present, x);
    return beat;
  };

  /** A link carry by the holder to a point in `cell` of his side, when the ball is not there. */
  const linkTo = (cell: number) => {
    if (cellAt(side, ball) === cell) return;
    const to = intoCell(side, cell, spotOf(side, holder));
    push({ side, move: 'link', kind: 'carry', actor: holder, from: ball, to, outcome: 'complete' });
    ball = to;
  };
  /** The holder's heavy touch: the ball runs to `to` of the other side. */
  const miscontrol = (to: number) => {
    const at = spotOf(other(side), to, ball, other(side));
    push({
      side,
      move: 'miscontrol',
      kind: 'carry',
      actor: holder,
      opponent: to,
      from: ball,
      to: at,
      outcome: 'loose',
    });
    side = other(side);
    holder = to;
    ball = at;
    pending = null;
  };
  // A touch that must follow another (a shot after its source pass) waits until that one is played.
  const after = touches.map(() => -1);
  touches.forEach((t, i) => {
    if (t.next !== undefined) after[t.next] = i;
  });
  /** Whether every man touch `i` names is on the pitch now. */
  const menHere = (i: number) => touchMen[i]!.every((p) => present[p.side]![p.line] === true);
  /** Touch `i` must be played in this minute: fixed to it, or a floating one whose window closes in it. */
  const fixedNow = (i: number) =>
    touches[i]!.minute === minute || (touches[i]!.minute === FLOATING && last[i] === minute);
  /** Touches `team` may play now, in the stream's order: this minute's fixed ones and every floating one in its window. */
  const unplayed = (team: Side) =>
    order.filter((i) => {
      const t = touches[i]!;
      return (
        !played[i] &&
        t.side === team &&
        (t.minute === minute || (t.minute === FLOATING && window[i]![minute] === true)) &&
        (after[i]! < 0 || played[after[i]!]) &&
        menHere(i)
      );
    });
  const fixedLeft = (team?: Side) =>
    touches.some((t, i) => !played[i] && fixedNow(i) && (team === undefined || t.side === team));
  /** The touches played by the end of minute `m`: an even share of each period's. */
  const quota = (m: number) =>
    m < 90
      ? Math.round(((m + 1) * regulationTouches) / Math.min(90, LENGTH))
      : regulationTouches + Math.round(((m - 89) * extraTouches) / (LENGTH - 90));
  const quotaMet = () => doneAll() >= quota(minute);
  /**
   * The price in centimetres of `team` playing touch `i` with the ball in `cell`: the distance to
   * where it starts, less `fixedPull` for a touch this minute must hold; a touch ending the
   * possession is cheaper by up to `paceBias` the further `team` is ahead of the other side in its
   * share of touches played (dearer when behind), and by `fixedPush` once the minute's share is met
   * while the other side still has a fixed touch in it.
   */
  const touchCost = (team: Side, i: number, cell: number): number => {
    let cost = cellGap(startCell[i]!, cell);
    const met = quotaMet();
    // The pull grows as the minute fills, so its fixed touches come before its share runs out.
    const fill = Math.min(1, (doneAll() - minuteStart) / Math.max(1, quota(minute) - minuteStart));
    if (fixedNow(i)) cost -= met ? CM.fixedPush : CM.fixedPull + Math.round(fill * CM.fixedRamp);
    // A corner's or free kick's delivery waits for its restart rather than be played in open play.
    if (setPiece[i]) cost += CM.setPieceWait;
    // A row whose recorded winner has no touch left hands him a ball he must lose at once.
    const w = winnerOf[i]!;
    if (w >= 0 && touchesLeft[other(team)]![w]! === 0) cost += CM.idleWinner;
    if (ends[i]) {
      // Ahead of the other side, or behind in spending its own possession-ending touches, a side
      // ends its possession sooner; so neither side runs out of touches, nor of ways to lose the ball.
      const p = code();
      const share = done[p]![team]! / Math.max(1, total[p]![team]!);
      const lead = share - done[p]![other(team)]! / Math.max(1, total[p]![other(team)]!);
      const endsLead = endsDone[p]![team]! / Math.max(1, endsTotal[p]![team]!) - share;
      cost -= Math.round(Math.min(Math.max((lead - endsLead) / C.paceSlack, -1), 1) * CM.paceBias);
      if (met && fixedLeft(other(team))) cost -= CM.fixedPush;
    }
    return cost;
  };
  /**
   * A touch whose release is a shot the record credits to no passer: a chance its shooter made
   * alone, which no completed pass to him may come straight before, since the record would count
   * that pass a key pass (→MATCH-11; the prototype held it for goals only).
   */
  const unassisted = (i: number): boolean => {
    const r = touches[i]!.release;
    if (r === undefined || !('shot' in r)) return false;
    return detail.shots[r.shot]![SH.passer]! < 0;
  };
  /**
   * Who of `team` wins a ball the record names no winner for (a loose ball, a block): the nearest
   * man with a touch still to play this minute, so he does not lose it at once; else the nearest.
   */
  const winnerFor = (team: Side, at: Vec): number => {
    const busy = new Set(unplayed(team).map((i) => touches[i]!.actor));
    const idle = onNow(team).filter((line) => !busy.has(line));
    const best = nearestBy(team, at, idle);
    return busy.has(best) ? best : nearestBy(team, at);
  };
  /** The holder has the ball from a recorded completed pass, his own carries since (as the count reads an assist). */
  const fed = (): boolean => {
    for (let k = beats.length - 1; k >= 0; k--) {
      const b = beats[k]!;
      if (b.kind === 'stoppage') continue;
      if (b.side !== side) return false;
      if (b.actor === holder && (b.kind === 'carry' || b.kind === 'takeOn')) continue;
      return (
        b.event !== undefined &&
        isPassLike(b.kind) &&
        b.outcome === 'complete' &&
        b.receiver === holder
      );
    }
    return false;
  };
  const cheapest = (
    team: Side,
    pool: readonly number[],
    cell: number,
    place?: ReadonlyMap<number, number>,
  ): number => {
    let best = -1;
    let bestCost = Infinity;
    for (const i of pool) {
      const cost = touchCost(team, i, cell) + (place?.get(touches[i]!.actor) ?? 0);
      if (cost < bestCost) [best, bestCost] = [i, cost];
    }
    return best;
  };
  /**
   * The touch `team` plays next with the ball in `cell`, skipping `skip`'s while another is left.
   * For a pass landing at `at`, a touch also costs `placeWeight` times the metres from its player's
   * place to `at`: the man the pass is played to stands near it.
   */
  const choose = (team: Side, cell: number, skip = -1, at?: Vec, toPass = skip >= 0): number => {
    const all = unplayed(team);
    if (nextOwed >= 0 && all.includes(nextOwed)) return nextOwed;
    // A pass's receiver is not chosen for a chance its shooter made alone.
    const fresh = all.filter((i) => !(toPass && unassisted(i)));
    const left = fresh.length > 0 ? fresh : all;
    const open = left.filter((i) => touches[i]!.actor !== skip);
    const pool = open.length > 0 ? open : left;
    let place: Map<number, number> | undefined;
    if (at !== undefined && CM.placeWeight > 0) {
      place = new Map();
      for (const line of onNow(team))
        place.set(line, Math.round(CM.placeWeight * metres(spotOf(team, line, at, team), at)));
    }
    return cheapest(team, pool, cell, place);
  };

  /** Writes a pending pass to `receiver`, who then has the ball in its `to` cell. */
  const resolve = (receiver: number) => {
    const p = pending!;
    pending = null;
    const e = detail.events[p.event]!;
    const to = pointAway(
      p.side,
      e[EV.to]!,
      spotOf(p.side, receiver, p.from, p.side),
      p.from,
      C.minPass,
    );
    push({
      side: p.side,
      move: KIND(e[EV.kind]!),
      kind: p.kind,
      actor: p.actor,
      receiver,
      from: p.from,
      to,
      outcome: p.outcome,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      ...(KIND(e[EV.kind]!) === 'cutBack' && { reason: 'cutBack' as const }),
      event: p.event,
    });
    side = p.side;
    holder = receiver;
    ball = to;
  };

  /** Plays a pass event from the ball's point, `kind` the restart it delivers or `pass`. */
  const playPass = (id: number, kind: ScriptBeatKind) => {
    const e = detail.events[id]!;
    const actor = e[EV.actor]!;
    const res = e[EV.result]!;
    const toCell = e[EV.to]!;
    const base = {
      side,
      move: KIND(e[EV.kind]!),
      kind,
      actor,
      from: ball,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      ...(KIND(e[EV.kind]!) === 'cutBack' && { reason: 'cutBack' as const }),
      event: id,
    };
    if (res === R.complete || res === R.looseKept) {
      pending = {
        event: id,
        actor,
        side,
        from: ball,
        kind,
        outcome: res === R.complete ? 'complete' : 'loose',
      };
      ball = intoCell(side, toCell, cellCentre(side, toCell));
      holder = -1;
      return;
    }
    const to = intoCell(side, toCell, spotOf(side, actor));
    if (res === R.intercepted || res === R.looseRecovered || res === R.tackled) {
      const at = res === R.tackled ? ball : to;
      const by = e[EV.other]! >= 0 ? e[EV.other]! : winnerFor(other(side), at);
      push({
        ...base,
        to,
        opponent: by,
        outcome: res === R.intercepted ? 'intercepted' : res === R.tackled ? 'tackled' : 'loose',
      });
      side = other(side);
      holder = by;
      ball = at;
      return;
    }
    if (res === R.offside) {
      push({ ...base, to, receiver: e[EV.other]!, through: true, outcome: 'offside' });
      owed = {
        kind: 'freeKick',
        side: other(side),
        spot: restartSpot('freeKick', other(side), to),
      };
    } else {
      push({ ...base, to, outcome: 'out' });
      owed =
        res === R.outTouch
          ? { kind: 'throwIn', side: other(side), spot: restartSpot('throwIn', other(side), to) }
          : res === R.outByline
            ? {
                kind: 'goalKick',
                side: other(side),
                spot: restartSpot('goalKick', other(side), to),
              }
            : { kind: 'corner', side, spot: restartSpot('corner', side, to) };
    }
    holder = -1;
  };

  const playShot = (id: number, kind: ScriptBeatKind) => {
    const s = detail.shots[id]!;
    const out = SHOT_OUTCOMES[s[SH.outcome]!]!;
    const keeper = s[SH.keeper]!;
    const shooter = s[SH.shooter]!;
    const from = ball;
    const to =
      out === 'save'
        ? keeperHold(other(side))
        : out === 'block'
          ? from
          : goalAim(
              side,
              out === 'miss'
                ? (attackFrame(side, from)[1] < PITCH.width / 2 ? -1 : 1) * C.missWide
                : 0,
            );
    const opponent =
      out === 'save' ? keeper : out === 'block' ? winnerFor(other(side), from) : undefined;
    const outcome: ScriptBeatOutcome =
      out === 'goal' ? 'goal' : out === 'save' ? 'saved' : out === 'block' ? 'blocked' : 'wide';
    push({
      side,
      move: kind === 'freeKick' ? 'freeKick' : kind === 'penalty' ? 'penalty' : 'shot',
      kind,
      actor: shooter,
      ...(opponent !== undefined && { opponent }),
      from,
      to,
      outcome,
      header: s[SH.header] === 1,
      shot: id,
    });
    const corner = s[SH.corner] === 1;
    if (out === 'goal')
      owed = {
        kind: 'kickOff',
        side: other(side),
        spot: restartSpot('kickOff', other(side), from),
      };
    else if (corner) owed = { kind: 'corner', side, spot: restartSpot('corner', side, from) };
    else if (out === 'miss')
      owed = {
        kind: 'goalKick',
        side: other(side),
        spot: restartSpot('goalKick', other(side), from),
      };
    else {
      side = other(side);
      holder = opponent!;
      ball = to;
      return;
    }
    holder = -1;
  };

  /** Plays touch `i` by its actor, who has the ball. */
  const playTouch = (i: number, delivering?: Owed) => {
    played[i] = true;
    const t = touches[i]!;
    touchesLeft[t.side]![t.actor]!--;
    done[codeOf[i]!]![t.side]!++;
    if (ends[i]) endsDone[codeOf[i]!]![t.side]!++;
    nextOwed = t.next ?? -1;
    for (const c of t.carries) {
      const e = detail.events[c]!;
      linkTo(e[EV.from]!);
      const to = intoCell(side, e[EV.to]!, spotOf(side, holder));
      const takeOn = KIND(e[EV.kind]!) === 'takeOn';
      if (e[EV.result] === R.complete) {
        push({
          side,
          move: KIND(e[EV.kind]!),
          kind: takeOn ? 'takeOn' : 'carry',
          actor: holder,
          ...(takeOn && { opponent: nearestBy(other(side), ball) }),
          from: ball,
          to,
          outcome: 'complete',
          event: c,
        });
        ball = to;
        continue;
      }
      const by = e[EV.other]! >= 0 ? e[EV.other]! : winnerFor(other(side), ball);
      push({
        side,
        move: KIND(e[EV.kind]!),
        kind: takeOn ? 'takeOn' : 'carry',
        actor: holder,
        opponent: by,
        from: ball,
        to,
        outcome: 'tackled',
        event: c,
      });
      side = other(side);
      holder = by;
      return;
    }
    const r = t.release;
    if (r === undefined) return;
    if ('event' in r) {
      if (delivering === undefined) linkTo(detail.events[r.event]![EV.from]!);
      playPass(r.event, delivering?.kind ?? 'pass');
    } else if ('shot' in r) {
      if (delivering === undefined) linkTo(detail.shots[r.shot]![SH.cell]!);
      playShot(r.shot, delivering?.kind ?? 'shot');
    } else {
      const f = detail.fouls[r.foul]!;
      linkTo(f[FO.cell]!);
      const card = f[FO.card]!;
      push({
        side,
        move: 'foul',
        kind: 'carry',
        actor: holder,
        opponent: f[FO.fouler]!,
        from: ball,
        to: ball,
        outcome: 'foul',
        foul: r.foul,
        ...(card >= 0 && { incidents: [scriptIncident(detail, card)] }),
      });
      owed =
        f[FO.penalty] === 1
          ? { kind: 'penalty', side, spot: penaltySpot(side), via: t.next! }
          : {
              kind: 'freeKick',
              side,
              spot: restartSpot('freeKick', side, ball),
              ...(t.next !== undefined && { via: t.next }),
            };
      nextOwed = -1;
      holder = -1;
    }
  };

  /** Delivers the owed restart: by a recorded pass from its spot when one is left, else connectively. */
  const deliver = () => {
    const o = owed!;
    owed = null;
    side = o.side;
    ball = o.spot;
    if (
      o.via !== undefined &&
      !played[o.via] &&
      (o.kind === 'penalty' || touches[o.via]!.minute === minute)
    ) {
      holder = touches[o.via]!.actor;
      playTouch(o.via, o);
      return;
    }
    const spotCell = cellAt(side, ball);
    const want = o.kind === 'corner' ? 'corner' : o.kind === 'freeKick' ? 'freeKick' : 'none';
    let best = -1;
    let bestScore = Infinity;
    for (const i of unplayed(side)) {
      const t = touches[i]!;
      if (t.carries.length > 0 || t.release === undefined || !('event' in t.release)) continue;
      const e = detail.events[t.release.event]!;
      if (!cellsMeet(e[EV.from]!, spotCell)) continue;
      const score =
        (SET_PIECES[e[EV.setPiece]!] === want ? 0 : 10_000_000) + cellGap(e[EV.from]!, spotCell);
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    if (best >= 0) {
      holder = touches[best]!.actor;
      playTouch(best, o);
      return;
    }
    // A goal kick is the keeper's, so the touch it is delivered to is another man's.
    const keeper = keeperOf(side);
    // A connective delivery is no recorded pass, so it is nobody's key pass.
    const nextTouch = choose(side, spotCell, o.kind === 'goalKick' ? keeper : -1, undefined, false);
    const taker =
      o.kind === 'goalKick'
        ? keeper
        : nearestBy(side, ball, nextTouch >= 0 ? [touches[nextTouch]!.actor] : []);
    const receiver =
      nextTouch >= 0 && touches[nextTouch]!.actor !== taker
        ? touches[nextTouch]!.actor
        : nearestBy(side, ball, [taker]);
    const cell =
      nextTouch >= 0
        ? firstCell(detail, touches[nextTouch]!)
        : cellAt(side, spotOf(side, receiver));
    const to = pointAway(side, cell, spotOf(side, receiver), ball, C.minPass);
    push({
      side,
      move: 'restart',
      kind: o.kind,
      actor: taker,
      receiver,
      from: ball,
      to,
      outcome: 'complete',
    });
    holder = receiver;
    ball = to;
  };

  /** The stoppage groups of this minute still to be written. */
  let stopsDone = 0;
  const stopsLeft = () => stops[minute]!.length - stopsDone;
  /** The men the next stoppage takes off the pitch. */
  const leaversOf = (group: readonly number[]) =>
    group.flatMap((i) => {
      const x = scriptIncident(detail, i);
      return OFF_KINDS.has(x.kind) ? [{ side: x.side, line: x.line }] : [];
    });
  /**
   * Whether the next stoppage may be opened now: no pass in flight, the ball dead or with a man who
   * stays on, and no touch this minute holds still to be played by a man it takes off.
   */
  const canStop = (group: readonly number[]): boolean => {
    // Nor between a pass and the shot it sets up.
    if (pending !== null || nextOwed >= 0) return false;
    const leavers = leaversOf(group);
    const leaves = (s: Side, line: number) => leavers.some((l) => l.side === s && l.line === line);
    if (owed === null && (holder < 0 || leaves(side, holder))) return false;
    return !touches.some(
      (_, i) => !played[i] && fixedNow(i) && touchMen[i]!.some((p) => leaves(p.side, p.line)),
    );
  };
  /** Opens the next stoppage: its incidents shown, its men off and on; the ball stays where it is. */
  const openStoppage = () => {
    const group = stops[minute]![stopsDone++]!;
    const incidents = group.map((i) => scriptIncident(detail, i));
    const at = owed !== null ? owed.spot : ball;
    push({
      side: incidents[0]!.side,
      move: 'stoppage',
      kind: 'stoppage',
      actor: incidents[0]!.line,
      from: at,
      to: at,
      outcome: 'complete',
      incidents,
    });
  };
  const keeperHolds = () =>
    owed === null && pending === null && holder >= 0 && slotOf(side, holder) === 0;

  /** Beats written before the minute being written. */
  let minuteBeats = 0;
  /** Whether a beat from `from` on plays a recorded row. */
  const recordedSince = (from: number) => {
    for (let k = from; k < beats.length; k++) {
      const b = beats[k]!;
      if (b.event !== undefined || b.shot !== undefined || b.foul !== undefined) return true;
    }
    return false;
  };
  /** A guard against a minute that never ends: no detail needs this many beats. */
  const BEAT_LIMIT = 40 * touches.length + 1000;
  const settledMinute = (): boolean => {
    for (;;) {
      if (beats.length > BEAT_LIMIT) return false;
      const mine = unplayed(side);
      const theirs = unplayed(other(side));
      // A stoppage the minute owes: at a dead ball or a keeper's ball, else once the minute has
      // played its share, or nothing else can be played (a touch waits for a man it brings on).
      if (stopsLeft() > 0 && pending === null) {
        const group = stops[minute]![stopsDone]!;
        const forced =
          quotaMet() ||
          mine.length + theirs.length === 0 ||
          touches.some((_, i) => !played[i] && fixedNow(i) && !menHere(i));
        if (canStop(group) && (owed !== null || keeperHolds() || forced)) {
          openStoppage();
          continue;
        }
        const holderLeaves = leaversOf(group).some((l) => l.side === side && l.line === holder);
        if (forced && owed === null && holderLeaves && mine.length + theirs.length === 0) {
          // The man on the ball leaves at the stoppage: he loses it first.
          miscontrol(nearestBy(other(side), ball));
          continue;
        }
      }
      // The minute ends with its share of touches played, nothing it must hold left and a recorded
      // row played in it: a minute after one that ran past its share, or whose only touch was a
      // restart a recorded pass delivered and still in flight, would otherwise stand empty.
      if (quotaMet() && !fixedLeft() && recordedSince(minuteBeats) && stopsLeft() === 0) break;
      if (owed !== null) {
        // With nothing left in the minute the restart waits for the next one.
        if (mine.length + theirs.length === 0 && stopsLeft() === 0) break;
        deliver();
        continue;
      }
      if (pending !== null) {
        const p: Pending = pending;
        // A completed pass is not played to a chance its shooter made alone; a pass kept loose is.
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball, p.outcome === 'complete');
        if (i >= 0 && touches[i]!.actor !== p.actor) {
          resolve(touches[i]!.actor);
          // He was chosen for that touch: it is the one he plays.
          intended = i;
          continue;
        }
        if (i < 0 && theirs.length === 0 && stopsLeft() === 0) break;
        // Nobody else of his side is left: a nominal receiver loses it.
        resolve(nearestBy(p.side, ball, [p.actor]));
        continue;
      }
      if (mine.length + theirs.length === 0) break;
      if (mine.length === 0) {
        miscontrol(touches[choose(other(side), cellAt(other(side), ball))]!.actor);
        continue;
      }
      // The minute waits only on the other side's fixed touch: with no touch left that ends this
      // possession, the holder loses the ball to it. A chance made alone is not handed the ball by
      // a heavy touch, as the prototype did for goals: the possessions would pay it back with
      // another (measured on the ten: 249 heavy touches handing it to every lone chance, 188 to
      // those the holder's side could spare, 176 to none); its shooter gets the ball as any man
      // does, never straight off a completed pass (`fed`).
      // A side with a touch of its own the minute must hold plays it first, so two sides that both
      // wait never hand the ball to each other for ever (a minute where men leave, T827).
      if (quotaMet() && fixedLeft(other(side))) {
        const waiting = theirs.filter(fixedNow);
        if (waiting.length > 0 && !mine.some((i) => ends[i] || fixedNow(i))) {
          miscontrol(touches[cheapest(other(side), waiting, cellAt(other(side), ball))]!.actor);
          continue;
        }
      }
      // The holder plays on with a touch of his own; another man's touch needs the ball first.
      const here = cellAt(side, ball);
      const own = mine.filter((i) => touches[i]!.actor === holder);
      const pickOwn =
        nextOwed >= 0 && mine.includes(nextOwed)
          ? nextOwed
          : own.includes(intended)
            ? intended
            : own.length > 0
              ? cheapest(side, own, here)
              : choose(side, here);
      intended = -1;
      // Possessions alternate, so a side that has fewer possession-ending rows than the other must
      // lose the ball connectively that many times: it does so where it is spending its ending
      // rows faster than the other side spends its own, never on a touch the minute must hold.
      const p = code();
      const endsShare = (t: Side) => endsDone[p]![t]! / Math.max(1, endsTotal[p]![t]!);
      const spread =
        ends[pickOwn] &&
        !fixedNow(pickOwn) &&
        touches[pickOwn]!.actor === holder &&
        endsShare(side) - endsShare(other(side)) > C.endsSlack &&
        theirs.length > 0;
      // A goal the record credits to nobody's pass is not scored straight off a pass to the scorer.
      if (spread || touches[pickOwn]!.actor !== holder || (unassisted(pickOwn) && fed())) {
        const them =
          theirs.length > 0
            ? touches[choose(other(side), cellAt(other(side), ball))]!.actor
            : nearestBy(other(side), ball);
        miscontrol(them);
        continue;
      }
      playTouch(pickOwn);
    }
    return true;
  };

  const periodEnds = (m: number) =>
    m === LENGTH - 1 || (PERIOD_STARTS as readonly number[]).includes(m + 1);
  for (minute = 0; minute < LENGTH; minute++) {
    minuteStart = doneAll();
    minuteBeats = beats.length;
    stopsDone = 0;
    if ((PERIOD_STARTS as readonly number[]).includes(minute)) {
      pending = null;
      // A half-time substitution comes on before the kick-off and is shown on it.
      const ride = (riding.get(minute) ?? []).map((i) => scriptIncident(detail, i));
      for (const x of ride) applyIncident(present, x);
      if (ride.length > 0) carrying = ride;
      owed = { kind: 'kickOff', side: kickOffSide(periodAt(minute)), spot: CENTRE };
      // A period starts on its minute, whether or not the minute holds a touch.
      deliver();
    }
    if (!settledMinute()) return { problems: [`stuck:minute:${minute}`] };
    if (stopsLeft() > 0)
      return {
        problems: stops[minute]!.slice(stopsDone).flatMap((g) =>
          g.map((i) => `stuck:incident:${i}`),
        ),
      };
    // A man whose stint ends with this minute leaves nothing in it: his pass in flight is received
    // and a ball he holds is lost by a heavy touch before he goes.
    const leaving = (s: Side, line: number) =>
      line >= 0 && minute + 1 < LENGTH && !onPitch[s]![line]![minute + 1];
    if (pending !== null && leaving((pending as Pending).side, (pending as Pending).actor)) {
      const p: Pending = pending;
      const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
      if (i >= 0 && touches[i]!.actor !== p.actor && !leaving(p.side, touches[i]!.actor)) {
        resolve(touches[i]!.actor);
        intended = i;
      } else resolve(nearestBy(p.side, ball, [p.actor]));
    }
    if (pending === null && owed === null && leaving(side, holder))
      miscontrol(nearestBy(other(side), ball));
    if (periodEnds(minute)) {
      // A restart owed at the whistle is still taken, and a pass in flight, its delivery's
      // included, is received before the period ends.
      const o = owed as Owed | null;
      if (o !== null && o.kind !== 'kickOff') deliver();
      if (pending !== null)
        resolve(nearestBy((pending as Pending).side, ball, [(pending as Pending).actor]));
      owed = null;
      nextOwed = -1;
    }
  }
  const left = touches.flatMap((t, i) => (played[i] ? [] : [`unplaced:${rowName(t)}`]));
  if (left.length > 0) return { problems: left };

  // A minute whose beats need more than its sixty seconds is pressed into them, every part alike,
  // so each beat keeps its record minute; `minuteTimes` gives what each minute needed.
  for (let m = 0; m < LENGTH; m++) {
    const list = beats.filter((_, i) => minuteOf[i] === m);
    if (list.length === 0) continue;
    const { holds, need } = minuteTimes(list, m);
    const press = need > 60 ? 60 / need : 1;
    let t = m * 60;
    for (const [k, b] of list.entries()) {
      t += deadOf(b, k, m) * press;
      b.hold = Math.floor(holds[k]! * press * 100) / 100;
      b.clock = Math.floor(t * 100) / 100;
      t += (holds[k]! + travel(b)) * press;
    }
  }

  // The shoot-out after the last whistle: its kicks in the recorded order, each against the keeper
  // in goal at the end; a kick not scored is saved or wide by the stream (the record holds neither).
  minute = LENGTH - 1;
  detail.shootout.forEach((k, j) => {
    const s = k[SO.side] as Side;
    const from = penaltySpot(s);
    const scored = k[SO.scored] === 1;
    const saved = !scored && rng() < C.shootout.saved;
    const keeper = keeperOf(other(s));
    possession++;
    beats.push({
      index: beats.length,
      possession,
      side: s,
      phase: 'setPiece',
      move: 'shootoutKick',
      kind: 'shootoutKick',
      actor: k[SO.line]!,
      ...(saved && { opponent: keeper }),
      from,
      to: scored ? goalAim(s, 0) : saved ? keeperHold(other(s)) : goalAim(s, C.missWide * 2),
      loft: false,
      through: false,
      header: false,
      outcome: scored ? 'goal' : saved ? 'saved' : 'wide',
      hold: 0,
      kick: j,
      clock: LENGTH * 60 + C.shootout.gap * (j + 1),
      period: 5,
    });
  });
  return { script: { version: 1, seed, beats, bound: true } };
}

/** A touch named by its first row, for problems. */
function rowName(t: Touch): string {
  const r = t.release;
  if (t.carries.length > 0) return `event:${t.carries[0]}`;
  if (r === undefined) return 'touch';
  if ('event' in r) return `event:${r.event}`;
  if ('shot' in r) return `shot:${r.shot}`;
  return `foul:${r.foul}`;
}

/** Nominal seconds a beat's ball travels (`speeds`); a foul and a stoppage have none. */
export const travel = (b: ScriptBeat): number =>
  b.outcome === 'foul' || b.kind === 'stoppage'
    ? 0
    : metres(b.from, b.to) /
      (b.shot !== undefined || b.kind === 'shootoutKick'
        ? C.speeds.shot
        : b.kind === 'carry' || b.kind === 'takeOn'
          ? C.speeds.carry
          : b.loft
            ? C.speeds.loft
            : C.speeds.ground);
/** Seconds the restart or stoppage `b` (the `k`th of minute `m`) takes off its minute; a period's opening kick-off none. */
const deadOf = (b: ScriptBeat, k: number, m: number): number =>
  (isRestart(b.kind) || b.kind === 'stoppage') &&
  !(k === 0 && b.kind === 'kickOff' && (PERIOD_STARTS as readonly number[]).includes(m))
    ? C.dead[b.kind as keyof typeof C.dead]
    : 0;
/**
 * A minute's clock before pressing: its sixty seconds less its restarts' dead time shared equally
 * between its beats as hold plus travel, each hold within `hold`, and the seconds that needs.
 */
export function minuteTimes(
  list: readonly ScriptBeat[],
  m: number,
): { holds: number[]; need: number } {
  const dead = list.reduce((s, b, k) => s + deadOf(b, k, m), 0);
  const share = (60 - dead) / list.length;
  const holds = list.map((b) => Math.min(Math.max(share - travel(b), C.hold[0]), C.hold[1]));
  const need = list.reduce((s, b, k) => s + deadOf(b, k, m) + holds[k]! + travel(b), 0);
  return { holds, need };
}
