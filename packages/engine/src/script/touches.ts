// Touches of a fitted script (T820): every settled attempt, shot and foul dealt a minute, then
// gathered into players' spells on the ball. Pure functions of the settled match and the seed; the
// only randomness is `createRng(seed)`'s forks (-> ARCH-5).
import { SCRIPT_CONFIG } from './config';
import { random, integer } from '../primitives';
import { EV, EVENT_KINDS, EVENT_RESULTS, FO, SH, SHOT_KINDS } from './codes';
import type { MatchDetail as Settled } from './detail';
import type { TeamId } from './types';
import { cellDistance } from './cells';
import { touchWindow, minuteIndex } from './windows';
export { minuteIndex } from './windows';

/** One player's spell on the ball: his carries and take-ons in order, then at most one release. */
export interface Touch {
  side: TeamId;
  actor: number;
  minute: number;
  period: 0 | 1;
  from: number;
  until: number;
  /** Event ids of his carries and take-ons, in the order they are played. */
  carries: number[];
  /** The pass event, shot or foul that ends the spell; absent when a failed carry ends it or nothing does. */
  release?: { event: number } | { shot: number } | { foul: number };
  /** The touch that must come next for the same side (a shot's touch after its source pass). */
  next?: number;
}

const CARRY = EVENT_KINDS.indexOf('carry');
const TAKE_ON = EVENT_KINDS.indexOf('takeOn');
const COMPLETE = EVENT_RESULTS.indexOf('complete');
const FREE_KICK_SHOT = SHOT_KINDS.indexOf('freeKick');
export const isCarryEvent = (row: readonly number[]): boolean =>
  row[EV.kind] === CARRY || row[EV.kind] === TAKE_ON;

function shuffled(ids: number[], seed: string, label: string): number[] {
  const rng = random(`${seed}:script:${label}`);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = integer(rng, 0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Every event's and foul's minute index: shots, their sources and booked fouls keep the record's minute; the rest are dealt evenly. */
export function dealMinutes(settled: Settled, seed: string): { events: number[]; fouls: number[] } {
  const events = Array<number>(settled.events.length).fill(-1);
  const fouls = Array<number>(settled.fouls.length).fill(-1);
  for (const shot of settled.shots) {
    const source = shot[SH.source]!;
    if (source >= 0) events[source] = minuteIndex(shot[SH.minute]!);
  }
  settled.fouls.forEach((f, i) => {
    if (f[FO.cardMinute]! >= 0) fouls[i] = minuteIndex(f[FO.cardMinute]!);
  });
  for (const side of [0, 1] as const) {
    const rest = settled.events.flatMap((e, i) =>
      e[EV.side] === side && events[i] < 0 ? [i] : [],
    );
    shuffled(rest, seed, `deal:${side}`).forEach(
      (id, k, all) => (events[id] = Math.floor((k * 90) / all.length)),
    );
    const open = settled.fouls.flatMap((f, i) =>
      f[FO.fouledSide] === side && fouls[i] < 0 ? [i] : [],
    );
    shuffled(open, seed, `fouls:${side}`).forEach(
      (id, k, all) => (fouls[id] = Math.floor((k * 90) / all.length)),
    );
  }
  return { events, fouls };
}

/** Minute index of a row the record gives no minute: the writer deals it as it plays it (T822). */
export const FLOATING = -1;

/**
 * Every event's and foul's minute index as the record fixes it: shots, their sources and booked
 * fouls keep the record's minute; every other row is `FLOATING`, played in whichever minute the
 * writer reaches it (T822: dealt by the order of play, not by a shuffle).
 */
export function dealFixed(settled: Settled): { events: number[]; fouls: number[] } {
  const events = Array<number>(settled.events.length).fill(FLOATING);
  const fouls = Array<number>(settled.fouls.length).fill(FLOATING);
  for (const shot of settled.shots) {
    const source = shot[SH.source]!;
    if (source >= 0) events[source] = minuteIndex(shot[SH.minute]!);
  }
  settled.fouls.forEach((f, i) => {
    if (f[FO.cardMinute]! >= 0) fouls[i] = minuteIndex(f[FO.cardMinute]!);
  });
  return { events, fouls };
}

/** The cell a touch starts in: its first carry's `from`, else its release's. */
export function firstCell(settled: Settled, touch: Touch): number {
  if (touch.carries.length > 0) return settled.events[touch.carries[0]!]![EV.from]!;
  const r = touch.release;
  if (r === undefined) return -1;
  if ('event' in r) return settled.events[r.event]![EV.from]!;
  if ('shot' in r) return settled.shots[r.shot]![SH.cell]!;
  return settled.fouls[r.foul]![FO.cell]!;
}

/** The cell a touch's release starts in (its first cell when it has none). */
const releaseCell = (settled: Settled, touch: Touch): number =>
  firstCell(settled, { ...touch, carries: [] }) >= 0
    ? firstCell(settled, { ...touch, carries: [] })
    : firstCell(settled, touch);

/**
 * The touches of both sides. `minutes` is changed where a carry is moved to find its player's
 * release and where a foul is moved to deliver a direct free-kick shot.
 */
export function buildTouches(
  settled: Settled,
  minutes: { events: number[]; fouls: number[] },
  reserved: ReadonlySet<number> = new Set(),
): Touch[] {
  const touches: Touch[] = [];
  const passTouch = new Map<number, number>();
  const carryOwned = new Set<number>();
  // Releases: passes, shots, fouls.
  settled.events.forEach((e, id) => {
    if (isCarryEvent(e)) return;
    passTouch.set(id, touches.length);
    touches.push({
      side: e[EV.side] as TeamId,
      actor: e[EV.actor]!,
      minute: minutes.events[id]!,
      ...touchWindow(settled, [], { event: id }),
      carries: [],
      release: { event: id },
    });
  });
  const shotTouch: number[] = [];
  settled.shots.forEach((s, id) => {
    const source = s[SH.source]!;
    const touch: Touch = {
      side: s[SH.side] as TeamId,
      actor: s[SH.shooter]!,
      minute: minuteIndex(s[SH.minute]!),
      ...touchWindow(
        settled,
        source >= 0 && isCarryEvent(settled.events[source]!) ? [source] : [],
        { shot: id },
      ),
      carries: [],
      release: { shot: id },
    };
    const feed = source >= 0 && passTouch.has(source) ? source : -1;
    if (source >= 0 && isCarryEvent(settled.events[source]!)) {
      touch.carries.push(source);
      carryOwned.add(source);
    }
    shotTouch[id] = touches.length;
    touches.push(touch);
    if (feed >= 0) touches[passTouch.get(feed)!]!.next = shotTouch[id];
  });
  const foulTouch: number[] = [];
  settled.fouls.forEach((f, id) => {
    foulTouch[id] = touches.length;
    touches.push({
      side: f[FO.fouledSide] as TeamId,
      actor: f[FO.fouled]!,
      minute: minutes.fouls[id]!,
      ...touchWindow(settled, [], { foul: id }),
      carries: [],
      release: { foul: id },
    });
  });
  // A penalty's kick is the delivery of its explicitly linked foul, in the shot's minute.
  const used = new Set<number>();
  const direct = new Set<number>();
  for (const [foul, shot] of settled.penalties) {
    const minute = minuteIndex(settled.shots[shot!]![SH.minute]!);
    used.add(foul!);
    direct.add(shotTouch[shot!]!);
    minutes.fouls[foul!] = minute;
    touches[foulTouch[foul!]!]!.minute = minute;
    touches[foulTouch[foul!]!]!.next = shotTouch[shot!];
  }
  // A direct free-kick shot is the delivery of a foul of its side: in its minute, else moved to it.
  settled.shots.forEach((s, id) => {
    // Direct: a free-kick shot without a source (a free kick's header has its delivery as source).
    if (s[SH.kind] !== FREE_KICK_SHOT || s[SH.source]! >= 0) return;
    direct.add(shotTouch[id]!);
    const side = s[SH.side]!;
    const minute = minuteIndex(s[SH.minute]!);
    const free = settled.fouls.flatMap((f, i) =>
      f[FO.fouledSide] === side &&
      !f[FO.penalty] &&
      !used.has(i) &&
      f[FO.period] === (s[SH.minute]! > 90 ? 1 : 0) &&
      f[FO.cell] === s[SH.cell] &&
      touches[foulTouch[i]!]!.from <= minute &&
      touches[foulTouch[i]!]!.until > minute
        ? [i]
        : [],
    );
    const near = (list: number[]) =>
      list.reduce<number>(
        (best, i) =>
          best < 0 ||
          cellDistance(settled.fouls[i]![FO.cell]!, s[SH.cell]!) <
            cellDistance(settled.fouls[best]![FO.cell]!, s[SH.cell]!)
            ? i
            : best,
        -1,
      );
    let foul = near(free.filter((i) => minutes.fouls[i] === minute));
    // A booked foul keeps its card's minute, so only an unbooked one is moved.
    if (foul < 0) foul = near(free.filter((i) => settled.fouls[i]![FO.cardMinute]! < 0));
    if (foul < 0 || settled.fouls[foul]![FO.cell] !== s[SH.cell]) return;
    used.add(foul);
    minutes.fouls[foul] = minute;
    touches[foulTouch[foul]!]!.minute = minute;
    touches[foulTouch[foul]!]!.next = shotTouch[id];
  });
  // Completed carries join their player's touch; failed ones end a touch of their own.
  const window = SCRIPT_CONFIG.carryWindow;
  settled.events.forEach((e, id) => {
    if (!isCarryEvent(e) || carryOwned.has(id)) return;
    const windowOfRow = touchWindow(settled, [id]);
    const compatible = (t: Touch) =>
      t.period === windowOfRow.period &&
      Math.max(t.from, windowOfRow.from) < Math.min(t.until, windowOfRow.until) &&
      (t.minute === FLOATING || (t.minute >= windowOfRow.from && t.minute < windowOfRow.until));
    const actor = e[EV.actor]!;
    const side = e[EV.side] as TeamId;
    if (e[EV.result] !== COMPLETE) {
      touches.push({
        side,
        actor,
        minute: minutes.events[id]!,
        ...touchWindow(settled, [id]),
        carries: [id],
      });
      return;
    }
    // A direct free kick's touch is its restart's delivery, struck from the spot: no carry joins it.
    const own = (minute: number) =>
      touches.flatMap((t, i) =>
        t.side === side &&
        t.actor === actor &&
        t.minute === minute &&
        compatible(t) &&
        t.release !== undefined &&
        !direct.has(i)
          ? [i]
          : [],
      );
    const pick = (list: number[]) =>
      list.reduce<number>((best, i) => {
        if (best < 0) return i;
        const d = (t: number) => cellDistance(releaseCell(settled, touches[t]!), e[EV.to]!);
        return d(i) < d(best) ? i : best;
      }, -1);
    const minute = minutes.events[id]!;
    if (minute === FLOATING) {
      // A carry with no minute of its own runs into whichever release of his it meets best: the
      // touch whose start (its first carry's `from`, else its release's cell) is nearest where
      // the carry ends, a floating touch before a fixed one at the same distance.
      let best = -1;
      let bestCost = Infinity;
      touches.forEach((t, i) => {
        if (
          t.side !== side ||
          t.actor !== actor ||
          t.release === undefined ||
          direct.has(i) ||
          !compatible(t) ||
          ('event' in t.release && reserved.has(t.release.event))
        )
          return;
        const cost =
          cellDistance(firstCell(settled, t), e[EV.to]!) + (t.minute === FLOATING ? 0 : 50);
        if (cost < bestCost) [best, bestCost] = [i, cost];
      });
      // Too far from every release of his, it is a touch of its own the writer plays where it starts.
      if (best < 0 || bestCost > SCRIPT_CONFIG.carryJoin * 100 + 50)
        touches.push({ side, actor, minute, ...touchWindow(settled, [id]), carries: [id] });
      else {
        touches[best]!.carries.unshift(id);
        Object.assign(
          touches[best]!,
          touchWindow(settled, touches[best]!.carries, touches[best]!.release),
        );
        minutes.events[id] = touches[best]!.minute;
      }
      return;
    }
    let found = pick(own(minute));
    for (let k = 1; found < 0 && k <= window; k++) {
      for (const m of [minute - k, minute + k]) {
        if (found >= 0 || m < 0 || m > 89 || m < 45 !== minute < 45) continue;
        found = pick(own(m));
        if (found >= 0) minutes.events[id] = m;
      }
    }
    if (found < 0) {
      touches.push({ side, actor, minute, ...touchWindow(settled, [id]), carries: [id] });
      return;
    }
    touches[found]!.carries.push(id);
    Object.assign(
      touches[found]!,
      touchWindow(settled, touches[found]!.carries, touches[found]!.release),
    );
  });
  // A touch's carries run into its release: the last ends nearest the release's cell, each before
  // it ends nearest where the next starts.
  for (const t of touches) {
    if (t.carries.length < 2 || t.release === undefined) continue;
    let target = releaseCell(settled, { ...t, carries: [] });
    const left = [...t.carries].sort((a, b) => a - b);
    const chain: number[] = [];
    while (left.length > 0) {
      let best = 0;
      left.forEach((id, k) => {
        const d = cellDistance(settled.events[id]![EV.to]!, target);
        if (d < cellDistance(settled.events[left[best]!]![EV.to]!, target)) best = k;
      });
      const id = left.splice(best, 1)[0]!;
      chain.unshift(id);
      target = settled.events[id]![EV.from]!;
    }
    t.carries = chain;
  }
  return touches;
}
