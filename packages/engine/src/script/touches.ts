/**
 * A script's touches (→MATCH-38, T826): every detail row the record counts gathered into one
 * player's spells on the ball, ported from the match prototype's fit/touches.ts (T820, T822). Only
 * shots, their sources and booked fouls keep a minute (`dealFixed`); every other row floats and is
 * played wherever the order of play reaches it. Pure functions of the detail; players are a side's
 * record lines, so a touch is named by its side and line.
 */
import { SCRIPT_CONFIG } from './config';
import { cellGap } from './cells';
import { EV, EVENT_KINDS, FO, R, SH, SHOT_KINDS, ST, type MatchDetail } from './detail';

/** One player's spell on the ball: his carries and take-ons in order, then at most one release. */
export interface Touch {
  side: 0 | 1;
  /** A line of `side`. */
  actor: number;
  /** A minute index (0–89), or `FLOATING`. */
  minute: number;
  /** Event rows of his carries and take-ons, in the order they are played. */
  carries: number[];
  /** The pass event, shot or foul that ends the spell; absent when a failed carry ends it. */
  release?: { event: number } | { shot: number } | { foul: number };
  /** The touch that must come next for the same side (a shot's touch after its source pass). */
  next?: number;
}

const CARRY = EVENT_KINDS.indexOf('carry');
const TAKE_ON = EVENT_KINDS.indexOf('takeOn');
const FREE_KICK_SHOT = SHOT_KINDS.indexOf('freeKick');
const PENALTY_SHOT = SHOT_KINDS.indexOf('penalty');
/** Centimetres a floating carry may end from the start of a release of his and still join it. */
const JOIN_CM = SCRIPT_CONFIG.carryJoin * 100;
export const isCarryEvent = (row: readonly number[]): boolean =>
  row[EV.kind] === CARRY || row[EV.kind] === TAKE_ON;

/**
 * The record's minute `m` as a minute index of a match of `length` minutes: 1–90 (added time in 45
 * and 90 or beyond) as 0–89, and with extra time 91–120 as 90–119.
 */
export const minuteIndex = (m: number, length = 90): number =>
  length === 120
    ? Math.min(Math.max(m - 1, 0), 119)
    : m > 45
      ? Math.min(Math.max(m - 1, 45), 89)
      : Math.min(Math.max(m - 1, 0), 44);

/** The first minute index of each period: the halves, then extra time's. */
export const PERIOD_STARTS = [0, 45, 90, 105] as const;
/** The period (1–4) a minute index falls in. */
export const periodAt = (m: number): 1 | 2 | 3 | 4 => (m < 45 ? 1 : m < 90 ? 2 : m < 105 ? 3 : 4);

/** Minute index of a row the record gives no minute: the writer deals it as it plays it. */
export const FLOATING = -1;

/**
 * Every event's and foul's minute index as the record fixes it: shots, their sources and booked
 * fouls keep the record's minute; every other row is `FLOATING`.
 */
export function dealFixed(detail: MatchDetail): { events: number[]; fouls: number[] } {
  const events = Array<number>(detail.events.length).fill(FLOATING);
  const fouls = Array<number>(detail.fouls.length).fill(FLOATING);
  for (const shot of detail.shots) {
    const source = shot[SH.source]!;
    if (source >= 0) events[source] = minuteIndex(shot[SH.minute]!, detail.length);
  }
  detail.fouls.forEach((f, i) => {
    if (f[FO.cardMinute]! >= 0) fouls[i] = minuteIndex(f[FO.cardMinute]!, detail.length);
  });
  // A penalty's foul is in its kick's minute (a booked one's card is, detail.ts `settlePenaltyFouls`).
  for (const shot of detail.shots)
    if (shot[SH.kind] === PENALTY_SHOT && shot[SH.foul]! >= 0)
      fouls[shot[SH.foul]!] = minuteIndex(shot[SH.minute]!, detail.length);
  return { events, fouls };
}

/** The cell a touch starts in: its first carry's `from`, else its release's; −1 with neither. */
export function firstCell(detail: MatchDetail, touch: Touch): number {
  if (touch.carries.length > 0) return detail.events[touch.carries[0]!]![EV.from]!;
  return releaseCell(detail, touch);
}

/** The cell a touch's release starts in; −1 without one. */
function releaseCell(detail: MatchDetail, touch: Touch): number {
  const r = touch.release;
  if (r === undefined) return -1;
  if ('event' in r) return detail.events[r.event]![EV.from]!;
  if ('shot' in r) return detail.shots[r.shot]![SH.cell]!;
  return detail.fouls[r.foul]![FO.cell]!;
}

/**
 * The touches of both sides. `minutes` is changed where a carry is moved to find its player's
 * release and where a foul is moved to deliver a direct free-kick shot.
 */
export function buildTouches(
  detail: MatchDetail,
  minutes: { events: number[]; fouls: number[] },
): Touch[] {
  const touches: Touch[] = [];
  const passTouch = new Map<number, number>();
  const carryOwned = new Set<number>();
  // Releases: passes, shots, fouls.
  detail.events.forEach((e, id) => {
    if (isCarryEvent(e)) return;
    passTouch.set(id, touches.length);
    touches.push({
      side: e[EV.side] as 0 | 1,
      actor: e[EV.actor]!,
      minute: minutes.events[id]!,
      carries: [],
      release: { event: id },
    });
  });
  const shotTouch: number[] = [];
  detail.shots.forEach((s, id) => {
    const source = s[SH.source]!;
    const touch: Touch = {
      side: s[SH.side] as 0 | 1,
      actor: s[SH.shooter]!,
      minute: minuteIndex(s[SH.minute]!, detail.length),
      carries: [],
      release: { shot: id },
    };
    // A shot off its own carry may still have a passer: his last completed pass of that group
    // before the carry comes just before the shooter's touch, as the source pass of any shot does.
    let feed = source >= 0 && passTouch.has(source) ? source : -1;
    if (source >= 0 && isCarryEvent(detail.events[source]!)) {
      touch.carries.push(source);
      carryOwned.add(source);
      const c = detail.events[source]!;
      for (let j = source - 1; j >= 0 && s[SH.passer]! >= 0; j--) {
        const e = detail.events[j]!;
        if (e[EV.side] !== c[EV.side] || e[EV.group] !== c[EV.group]) break;
        const t = passTouch.get(j);
        if (t === undefined || e[EV.actor] !== s[SH.passer] || e[EV.result] !== R.complete)
          continue;
        if (touches[t]!.next !== undefined) break;
        feed = j;
        minutes.events[j] = touch.minute;
        touches[t]!.minute = touch.minute;
        break;
      }
    }
    shotTouch[id] = touches.length;
    touches.push(touch);
    if (feed >= 0) touches[passTouch.get(feed)!]!.next = shotTouch[id];
  });
  const foulTouch: number[] = [];
  detail.fouls.forEach((f, id) => {
    foulTouch[id] = touches.length;
    touches.push({
      side: f[FO.fouledSide] as 0 | 1,
      actor: f[FO.fouled]!,
      minute: minutes.fouls[id]!,
      carries: [],
      release: { foul: id },
    });
  });
  // A direct free-kick shot is the delivery of a foul of its side: in its minute, else moved to it.
  const used = new Set<number>();
  const direct = new Set<number>();
  // A penalty is the kick its foul names, in the kick's minute (`dealFixed`).
  detail.shots.forEach((s, id) => {
    const foul = s[SH.foul]!;
    if (s[SH.kind] !== PENALTY_SHOT || foul < 0) return;
    direct.add(shotTouch[id]!);
    used.add(foul);
    touches[foulTouch[foul]!]!.next = shotTouch[id];
  });
  detail.shots.forEach((s, id) => {
    // Direct: a free-kick shot without a source (a free kick's header has its delivery as source).
    if (s[SH.kind] !== FREE_KICK_SHOT || s[SH.source]! >= 0) return;
    direct.add(shotTouch[id]!);
    const side = s[SH.side]!;
    const minute = minuteIndex(s[SH.minute]!, detail.length);
    const free = detail.fouls.flatMap((f, i) =>
      f[FO.fouledSide] === side && !used.has(i) && f[FO.penalty] !== 1 ? [i] : [],
    );
    const near = (list: number[]) =>
      list.reduce<number>(
        (best, i) =>
          best < 0 ||
          cellGap(detail.fouls[i]![FO.cell]!, s[SH.cell]!) <
            cellGap(detail.fouls[best]![FO.cell]!, s[SH.cell]!)
            ? i
            : best,
        -1,
      );
    let foul = near(free.filter((i) => minutes.fouls[i] === minute));
    // A booked foul keeps its card's minute, so only an unbooked one is moved, and only one whose
    // two men are on the pitch in the shot's minute (T827).
    const here = (side: number, line: number) =>
      detail.stints.some(
        (st) =>
          st[ST.side] === side &&
          st[ST.line] === line &&
          st[ST.from]! <= minute &&
          st[ST.to]! > minute,
      );
    if (foul < 0)
      foul = near(
        free.filter(
          (i) =>
            detail.fouls[i]![FO.cardMinute]! < 0 &&
            here(side, detail.fouls[i]![FO.fouled]!) &&
            here(1 - side, detail.fouls[i]![FO.fouler]!),
        ),
      );
    if (foul < 0) return;
    used.add(foul);
    minutes.fouls[foul] = minute;
    touches[foulTouch[foul]!]!.minute = minute;
    touches[foulTouch[foul]!]!.next = shotTouch[id];
  });
  // Completed carries join their player's touch; failed ones end a touch of their own.
  const window = SCRIPT_CONFIG.carryWindow;
  detail.events.forEach((e, id) => {
    if (!isCarryEvent(e) || carryOwned.has(id)) return;
    const actor = e[EV.actor]!;
    const side = e[EV.side] as 0 | 1;
    // A carry joins a release of his in its own period only (regulation or extra time).
    const mine = (t: Touch, i: number) =>
      t.side === side &&
      t.actor === actor &&
      t.release !== undefined &&
      !direct.has(i) &&
      releasePeriod(detail, t) === e[EV.period];
    if (e[EV.result] !== R.complete) {
      touches.push({ side, actor, minute: minutes.events[id]!, carries: [id] });
      return;
    }
    const own = (minute: number) =>
      touches.flatMap((t, i) => (mine(t, i) && t.minute === minute ? [i] : []));
    const pick = (list: number[]) =>
      list.reduce<number>((best, i) => {
        if (best < 0) return i;
        const d = (t: number) => cellGap(releaseOrFirst(detail, touches[t]!), e[EV.to]!);
        return d(i) < d(best) ? i : best;
      }, -1);
    const minute = minutes.events[id]!;
    if (minute === FLOATING) {
      // A carry with no minute of its own runs into whichever release of his it meets best: the
      // touch whose start is nearest where the carry ends, a floating touch before a fixed one at
      // the same distance (half a centimetre dearer).
      let best = -1;
      let bestCost = Infinity;
      touches.forEach((t, i) => {
        if (!mine(t, i)) return;
        const cost = cellGap(firstCell(detail, t), e[EV.to]!) * 2 + (t.minute === FLOATING ? 0 : 1);
        if (cost < bestCost) [best, bestCost] = [i, cost];
      });
      // Too far from every release of his, it is a touch of its own the writer plays where it starts.
      if (best < 0 || bestCost > JOIN_CM * 2 + 1)
        touches.push({ side, actor, minute, carries: [id] });
      else {
        touches[best]!.carries.unshift(id);
        minutes.events[id] = touches[best]!.minute;
      }
      return;
    }
    let found = pick(own(minute));
    for (let k = 1; found < 0 && k <= window; k++) {
      for (const m of [minute - k, minute + k]) {
        if (found >= 0 || m < 0 || m >= detail.length || periodAt(m) !== periodAt(minute)) continue;
        found = pick(own(m));
        if (found >= 0) minutes.events[id] = m;
      }
    }
    if (found < 0) {
      touches.push({ side, actor, minute, carries: [id] });
      return;
    }
    touches[found]!.carries.push(id);
  });
  // A touch's carries run into its release: the last ends nearest the release's cell, each before
  // it ends nearest where the next starts.
  for (const t of touches) {
    if (t.carries.length < 2 || t.release === undefined) continue;
    let target = releaseCell(detail, t);
    const left = [...t.carries].sort((a, b) => a - b);
    const chain: number[] = [];
    while (left.length > 0) {
      let best = 0;
      left.forEach((id, k) => {
        const d = cellGap(detail.events[id]![EV.to]!, target);
        if (d < cellGap(detail.events[left[best]!]![EV.to]!, target)) best = k;
      });
      const id = left.splice(best, 1)[0]!;
      chain.unshift(id);
      target = detail.events[id]![EV.from]!;
    }
    t.carries = chain;
  }
  return touches;
}

/** The detail's period code (0 regulation, 1 extra time) of a touch's release. */
function releasePeriod(detail: MatchDetail, touch: Touch): number {
  const r = touch.release;
  if (r === undefined) return -1;
  if ('event' in r) return detail.events[r.event]![EV.period]!;
  if ('shot' in r) return detail.shots[r.shot]![SH.minute]! > 90 ? 1 : 0;
  return detail.fouls[r.foul]![FO.period]!;
}

/** The cell a touch's release starts in, its first cell when it has none. */
const releaseOrFirst = (detail: MatchDetail, touch: Touch): number => {
  const cell = releaseCell(detail, touch);
  return cell >= 0 ? cell : firstCell(detail, touch);
};
