/**
 * The script writer (→MATCH-38, MATCH-15, ARCH-5, ARCH-9; T826): a detail laid out as an order of
 * play that performs every recorded row exactly once, by its recorded player, in its recorded cell,
 * ported from the match prototype's fit/write.ts as T822 left it. The record is the fact; the writer
 * chooses only the order (greedy over the whole match: the cheapest touch by `touchCost`), the
 * minutes of the rows the record gives none, the receivers, the points inside the cells, the clock
 * and the connective beats MATCH-38 allows (link carries, heavy touches, restart deliveries no
 * recorded pass makes).
 *
 * Windows: a floating row is played only in a minute of its period in which its actor and the man
 * who wins it are on the pitch (`detail.stints`); a row whose last such minute comes is played in it,
 * as a fixed row is. A detail whose rows cannot all be placed gives problems, never a partial script.
 *
 * Platform-stable (→ARCH-9): costs are integer centimetres, ties go to the stream's order, points
 * come from `+ − × ÷`, square root, min and max; the one random stream is `${seed}:script`.
 */
import type {
  MatchScript,
  ScriptBeat,
  ScriptBeatKind,
  ScriptBeatOutcome,
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
  type Side,
} from './cells';
import { SCRIPT_CONFIG } from './config';
import {
  detailIssues,
  EV,
  EVENT_KINDS,
  FO,
  IN,
  INCIDENT_KINDS,
  R,
  SET_PIECES,
  SH,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  ST,
  type MatchDetail,
} from './detail';
import { buildTouches, dealFixed, FLOATING, firstCell, type Touch } from './touches';

const C = SCRIPT_CONFIG;
/** Centimetres of the costs the config states in metres. */
const CM = {
  fixedPull: C.fixedPull * 100,
  fixedPush: C.fixedPush * 100,
  fixedRamp: C.fixedRamp * 100,
  paceBias: C.paceBias * 100,
  setPieceWait: C.setPieceWait * 100,
  placeWeight: C.placeWeight * 100,
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
];
export const isRestart = (k: ScriptBeatKind) => RESTARTS.includes(k);
export const isPassLike = (k: ScriptBeatKind) => PASS_LIKE.includes(k);
const isLofted = (k: number) => KIND(k) === 'long' || KIND(k) === 'cross';
/** Minutes of regulation a script plays; extra time waits for T827. */
const MINUTES = 90;

interface Owed {
  kind: ScriptBeatKind;
  side: Side;
  spot: Vec;
  /** A touch that must deliver it (a direct free-kick shot after its foul). */
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

/**
 * What the writer cannot play yet: `unsupported:<kind>` for a substitution, a card without a foul,
 * an injury, a penalty, extra time or a shoot-out (T827 plays them).
 */
export function unsupported(detail: MatchDetail): string[] {
  const out = new Set<string>();
  const booked = new Set(detail.fouls.map((f) => f[FO.card]!).filter((c) => c >= 0));
  detail.incidents.forEach((x, i) => {
    const kind = INCIDENT_KINDS[x[IN.kind]!];
    if (kind === 'sub') out.add('unsupported:substitution');
    else if (kind === 'injury') out.add('unsupported:injury');
    else if (!booked.has(i)) out.add('unsupported:card');
  });
  const PENALTY = SHOT_KINDS.indexOf('penalty');
  if (detail.shots.some((s) => s[SH.kind] === PENALTY) || detail.fouls.some((f) => f[FO.penalty]))
    out.add('unsupported:penalty');
  if (detail.length !== 90) out.add('unsupported:extraTime');
  if (detail.shootout.length > 0) out.add('unsupported:shootout');
  return [...out];
}

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

/** The shape's two sides in a minute: each slot's role, present while a line holding it is on the pitch. */
function shapeSides(
  detail: MatchDetail,
  onPitch: boolean[][][],
  m: number,
): [ShapeSide, ShapeSide] {
  return ([0, 1] as const).map((side): ShapeSide => {
    const s = detail.sides[side];
    const roles: ShapeSide['roles'][number][] = [];
    const present: boolean[] = [];
    s.lines.forEach((l, line) => {
      roles[l.slot] ??= l.role as ShapeSide['roles'][number];
      present[l.slot] = (present[l.slot] ?? false) || onPitch[side]![line]![m]!;
    });
    for (let k = 0; k < roles.length; k++) present[k] ??= false;
    return { tactic: s.tactic, roles, present };
  }) as [ShapeSide, ShapeSide];
}

/**
 * The script of `detail`, or the problems that keep it from being written: the detail's own
 * (`detailIssues`), `unsupported:<kind>` and `unplaced:<row>` for a row no minute could take.
 */
export function writeScript(
  detail: MatchDetail,
  seed: string,
): { script: MatchScript } | { problems: string[] } {
  const issues = [...detailIssues(detail), ...unsupported(detail)];
  if (issues.length > 0) return { problems: issues };
  return write(detail, seed);
}

function write(
  detail: MatchDetail,
  seed: string,
): { script: MatchScript } | { problems: string[] } {
  const onPitch = pitchWindows(detail);
  const shapes = Array.from({ length: MINUTES }, (_, m) => shapeSides(detail, onPitch, m));
  const lines = detail.sides.map((s) => s.lines);
  const touches = buildTouches(detail, dealFixed(detail));
  const played = touches.map(() => false);
  const startCell = touches.map((t) => firstCell(detail, t));
  // The stream's order of the touches: ties of `touchCost` go to the earlier.
  const rng = random(`${seed}:script`);
  const order = touches.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = integer(rng, 0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  // Windows: the minutes each touch may be played in (its rows' players on the pitch, its period).
  const window = touchWindows(detail, touches).map((w) => w.slice(0, MINUTES));
  /** The last minute a floating touch may be played in; −1 for none. */
  const last = window.map((w) => w.lastIndexOf(true));
  const never = touches.flatMap((t, i) =>
    t.minute === FLOATING && last[i]! < 0 ? [`unplaced:${rowName(t)}`] : [],
  );
  if (never.length > 0) return { problems: never };

  const total = [0, 0];
  const done = [0, 0];
  const endsTotal = [0, 0];
  const endsDone = [0, 0];
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
    total[t.side]!++;
    if (ends[i]) endsTotal[t.side]!++;
  });
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

  const slotOf = (s: Side, line: number) => lines[s]![line]!.slot;
  /** Line `line` of `s`'s place for a ball at `at`, `team` in possession. */
  const spotOf = (s: Side, line: number, at: Vec = ball, team: Side = side): Vec =>
    nominalSpot(
      { sides: shapes[minute]!, ball: at, team, phase: phaseOf(team, at) },
      s,
      slotOf(s, line),
    );
  /** The lines of `team` on the pitch this minute, the keeper last. */
  const onNow = (team: Side): number[] =>
    lines[team]!.flatMap((_, line) => (onPitch[team]![line]![minute] ? [line] : []));
  const keeperOf = (team: Side): number =>
    onNow(team).find((line) => slotOf(team, line) === 0) ?? onNow(team)[0]!;
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
    const prev = beats[beats.length - 1];
    if (prev !== undefined && (prev.side !== b.side || isRestart(b.kind))) possession++;
    const beat: ScriptBeat = {
      loft: false,
      through: false,
      header: false,
      hold: 0,
      clock: 0,
      ...b,
      index: beats.length,
      possession,
      phase: isRestart(b.kind) ? 'setPiece' : phaseOf(b.side, b.from),
      period: minute < 90 ? 0 : 1,
    };
    beats.push(beat);
    minuteOf.push(minute);
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
        (after[i]! < 0 || played[after[i]!])
      );
    });
  const fixedLeft = (team?: Side) =>
    touches.some((t, i) => !played[i] && fixedNow(i) && (team === undefined || t.side === team));
  /** The touches played by the end of minute `m`: an even share of all of them. */
  const quota = (m: number) => Math.round(((m + 1) * touches.length) / MINUTES);
  const quotaMet = () => done[0]! + done[1]! >= quota(minute);
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
    const fill = Math.min(
      1,
      (done[0]! + done[1]! - minuteStart) / Math.max(1, quota(minute) - minuteStart),
    );
    if (fixedNow(i)) cost -= met ? CM.fixedPush : CM.fixedPull + Math.round(fill * CM.fixedRamp);
    // A corner's or free kick's delivery waits for its restart rather than be played in open play.
    if (setPiece[i]) cost += CM.setPieceWait;
    if (ends[i]) {
      // Ahead of the other side, or behind in spending its own possession-ending touches, a side
      // ends its possession sooner; so neither side runs out of touches, nor of ways to lose the ball.
      const share = done[team]! / total[team]!;
      const lead = share - done[other(team)]! / total[other(team)]!;
      const endsLead = endsDone[team]! / Math.max(1, endsTotal[team]!) - share;
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
  /** The holder has the ball from a recorded completed pass, his own carries since (as the count reads an assist). */
  const fed = (): boolean => {
    for (let k = beats.length - 1; k >= 0; k--) {
      const b = beats[k]!;
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
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), at);
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
      out === 'save' ? keeper : out === 'block' ? nearestBy(other(side), from) : undefined;
    const outcome: ScriptBeatOutcome =
      out === 'goal' ? 'goal' : out === 'save' ? 'saved' : out === 'block' ? 'blocked' : 'wide';
    push({
      side,
      move: kind === 'freeKick' ? 'freeKick' : 'shot',
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
    done[t.side]!++;
    if (ends[i]) endsDone[t.side]!++;
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
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), ball);
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
      });
      owed = {
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
    if (o.via !== undefined && !played[o.via] && touches[o.via]!.minute === minute) {
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
    const nextTouch = choose(side, spotCell, o.kind === 'goalKick' ? keeper : -1, undefined, true);
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

  /** A guard against a minute that never ends: no detail needs this many beats. */
  const BEAT_LIMIT = 40 * touches.length + 1000;
  const settledMinute = (): boolean => {
    for (;;) {
      if (beats.length > BEAT_LIMIT) return false;
      // The minute ends with its share of touches played and nothing it must hold left.
      if (quotaMet() && !fixedLeft()) break;
      const mine = unplayed(side);
      const theirs = unplayed(other(side));
      if (owed !== null) {
        // With nothing left in the minute the restart waits for the next one.
        if (mine.length + theirs.length === 0) break;
        deliver();
        continue;
      }
      if (pending !== null) {
        const p: Pending = pending;
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
        if (i >= 0 && touches[i]!.actor !== p.actor) {
          resolve(touches[i]!.actor);
          // He was chosen for that touch: it is the one he plays.
          intended = i;
          continue;
        }
        if (i < 0 && theirs.length === 0) break;
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
      // possession, or with that touch a goal nobody's pass made, the holder loses the ball to it.
      if (quotaMet() && fixedLeft(other(side))) {
        const waiting = theirs.filter(fixedNow);
        // A side with a fixed touch of its own plays it first, so two lone chances in one minute
        // do not hand the ball to each other for ever.
        const lone = mine.some(fixedNow) ? undefined : waiting.find((i) => unassisted(i));
        if (waiting.length > 0 && (lone !== undefined || !mine.some((i) => ends[i]))) {
          miscontrol(
            touches[lone ?? cheapest(other(side), waiting, cellAt(other(side), ball))]!.actor,
          );
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
      const endsShare = (t: Side) => endsDone[t]! / Math.max(1, endsTotal[t]!);
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

  for (minute = 0; minute < MINUTES; minute++) {
    minuteStart = done[0]! + done[1]!;
    if (minute === 0 || minute === 45) {
      pending = null;
      owed = { kind: 'kickOff', side: minute === 0 ? 0 : 1, spot: CENTRE };
      // A half starts on its minute, whether or not the minute holds a touch, and a kick-off a
      // recorded pass delivers is received in it (the prototype's could wait minutes for it).
      deliver();
      if (pending !== null) {
        const p: Pending = pending;
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
        if (i >= 0 && touches[i]!.actor !== p.actor) {
          resolve(touches[i]!.actor);
          intended = i;
        } else resolve(nearestBy(p.side, ball, [p.actor]));
      }
    }
    if (!settledMinute()) return { problems: [`stuck:minute:${minute}`] };
    // A man whose stint ends with this minute leaves nothing in it: his pass in flight is received
    // and a ball he holds is lost by a heavy touch before he goes.
    const leaving = (s: Side, line: number) =>
      line >= 0 && minute + 1 < MINUTES && !onPitch[s]![line]![minute + 1];
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
    if (minute === 44 || minute === 89) {
      // A restart owed at the whistle is still taken, and a pass in flight, its delivery's
      // included, is received before the half ends.
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
  for (let m = 0; m < MINUTES; m++) {
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

/** Nominal seconds a beat's ball travels (`speeds`); a foul has none. */
export const travel = (b: ScriptBeat): number =>
  b.outcome === 'foul'
    ? 0
    : metres(b.from, b.to) /
      (b.shot !== undefined
        ? C.speeds.shot
        : b.kind === 'carry' || b.kind === 'takeOn'
          ? C.speeds.carry
          : b.loft
            ? C.speeds.loft
            : C.speeds.ground);
/** Seconds the restart beat `b` (the `k`th of minute `m`) takes off its minute; a half's opening kick-off none. */
const deadOf = (b: ScriptBeat, k: number, m: number): number =>
  isRestart(b.kind) && !(k === 0 && b.kind === 'kickOff' && (m === 0 || m === 45))
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
