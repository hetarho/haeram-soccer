/**
 * An own match's detail (→MATCH-15, MATCH-26, MATCH-27, MATCH-38; T825): every action the record
 * counts, one row each, with who made it, how it ended and who won the ball — the complete, checked
 * input the script writer (T826) lays out as an order of play. Integers only (→ARCH-9): engine
 * cells (0–39, `band * 5 + lane` in the acting side's attack frame) and each side's lines in record
 * order (the starters by slot, then substitutes as they came on).
 *
 * A move group of the ledger becomes rows by a fixed rule (`expandGroup`), so the same match always
 * gives the same rows: its attempts line by line in ascending line index, each line's completed ones
 * first, the first `broke[line]` of them line-breaking; the failed ones take, in that listed order,
 * `offside` × offside, `intercepted` × intercepted, `outTouch` × outTouch, `outByline` × (outByline
 * − cornersWon), `cornerWon` × cornersWon, `looseRecovered` × recovered and `looseKept` for the rest;
 * a failed carry or take-on is `tackled`. A revision-11 trace names each offside pass's passer and
 * receiver, so those take their passer's first failed attempts before the listed order; a
 * revision-10 trace names only who was caught, in ascending line order, and a man caught on his own
 * pass swaps (`expandGroup`, then `swapOffsides`) as scripts/export-settled.ts did (T819).
 */
import type { Tactic } from '../../../contracts/src/types';
import { AGGREGATE_MOVE_KINDS } from '../aggregate/types';
import type { AggregateMove, AggregateTraceMove } from '../aggregate/types';
import { isPassKind } from '../aggregate/ledger';
import { cellBand } from '../grid/pitch';
import { COUNTER_ZONES, mirrorBand } from '../grid/record';

export const EVENT_KINDS = AGGREGATE_MOVE_KINDS;
export const SET_PIECES = ['none', 'corner', 'freeKick'] as const;
export const EVENT_RESULTS = [
  'complete',
  'offside',
  'intercepted',
  'outTouch',
  'outByline',
  'cornerWon',
  'looseKept',
  'looseRecovered',
  'tackled',
] as const;
export const SHOT_KINDS = ['open', 'corner', 'freeKick', 'penalty'] as const;
export const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
export const INCIDENT_KINDS = ['yellow', 'secondYellow', 'red', 'sub', 'injury'] as const;
export const CARD_REASONS = [
  'reckless',
  'tactical',
  'dissent',
  'dogso',
  'serious',
  'violent',
] as const;
/** 0 regulation (minutes 1–90), 1 extra time (91–120). */
export const PERIODS = ['regulation', 'extra'] as const;

/** An event's result codes by name. */
export const R = Object.fromEntries(EVENT_RESULTS.map((r, i) => [r, i])) as Record<
  (typeof EVENT_RESULTS)[number],
  number
>;

/** Column indexes of the row layouts. */
export const EV = {
  side: 0,
  group: 1,
  kind: 2,
  setPiece: 3,
  from: 4,
  to: 5,
  actor: 6,
  result: 7,
  lineBreaking: 8,
  /** The ball's winner (an opponent's line) or the man caught offside (the actor's side); −1 for none. */
  other: 9,
  period: 10,
} as const;
export const SH = {
  side: 0,
  minute: 1,
  cell: 2,
  kind: 3,
  header: 4,
  /** Hundredths of a goal, as the ledger keeps it. */
  xg: 5,
  outcome: 6,
  corner: 7,
  shooter: 8,
  passer: 9,
  /** The completed event it follows, or −1 (a penalty, a direct free kick, a solo chance). */
  source: 10,
  /** The opponent's keeper in goal in the shot's minute. */
  keeper: 11,
  /** A penalty's foul row, else −1. */
  foul: 12,
} as const;
export const FO = {
  fouledSide: 0,
  cell: 1,
  /** The fouling side's line (the other side). */
  fouler: 2,
  fouled: 3,
  cardMinute: 4,
  penalty: 5,
  period: 6,
  /** A penalty's kick (a shot row), else −1. */
  shot: 7,
  /** A booked foul's card (an incident row), else −1. */
  card: 8,
} as const;
export const IN = { minute: 0, side: 1, kind: 2, line: 3, other: 4, reason: 5, added: 6 } as const;
export const ST = { side: 0, line: 1, slot: 2, from: 3, to: 4 } as const;
export const SO = { side: 0, line: 1, scored: 2 } as const;

/** One named line of a side: his stable ID and the slot he started in or came on in, with its role and position. */
export interface DetailLine {
  id: string;
  slot: number;
  role: string;
  position: string;
}
export interface DetailSide {
  tactic: Tactic;
  lines: DetailLine[];
}
export interface MatchDetail {
  version: 1;
  id: string;
  length: 90 | 120;
  /** Added minutes of each period played. */
  added: number[];
  score: [number, number];
  sides: [DetailSide, DetailSide];
  /** [side, line, slot, fromMinute, toMinute]: on the pitch for minutes (from, to]. */
  stints: number[][];
  /** One row an attempt (`EV`). */
  events: number[][];
  /** One row a shot (`SH`), side 0's then side 1's, each in the ledger's order. */
  shots: number[][];
  /** One row a foul (`FO`). */
  fouls: number[][];
  /** [minute, side, kind, line, otherLine or −1, reason or −1, added or −1] in the record's time order (`IN`). */
  incidents: number[][];
  /** [side, line, scored 0|1] in kicking order; empty without a shoot-out. */
  shootout: number[][];
}

/** One attempt of a group, in the side's line indexes (`other` −1 when none). */
export interface Attempt {
  actor: number;
  result: number;
  lineBreaking: 0 | 1;
  other: number;
}
type GroupCounts = Pick<
  AggregateMove,
  | 'kind'
  | 'attempts'
  | 'completed'
  | 'lineBreaking'
  | 'offside'
  | 'intercepted'
  | 'outTouch'
  | 'outByline'
  | 'cornersWon'
  | 'recovered'
>;
/** Line indexes repeated by their counts, ascending. */
export const spread = (counts: readonly number[]) =>
  counts.flatMap((k, line) => Array<number>(k).fill(line));

/**
 * A move group's attempts by the header's rule. `outfield` lists the side's outfield lines, for a
 * revision-10 offside whose only caught line is the passer's own; without it such an attempt keeps
 * its own line for the caller to swap across groups (`swapOffsides`).
 */
export function expandGroup(
  move: GroupCounts,
  t: AggregateTraceMove,
  outfield?: readonly number[],
): Attempt[] {
  const out: Attempt[] = [];
  const failed: Attempt[] = [];
  t.attempts.forEach((k, actor) => {
    const done = t.completed[actor] ?? 0,
      broke = t.broke[actor] ?? 0;
    for (let j = 0; j < done; j++)
      out.push({ actor, result: R.complete, lineBreaking: j < broke ? 1 : 0, other: -1 });
    for (let j = done; j < k; j++) {
      const a: Attempt = { actor, result: R.looseKept, lineBreaking: 0, other: -1 };
      out.push(a);
      failed.push(a);
    }
  });
  if (out.length !== move.attempts) throw new Error(`group of ${move.attempts}: ${out.length}`);
  if (failed.length !== move.attempts - move.completed) throw new Error('completions differ');
  const pairs = t.offsidePairs;
  if (isPassKind(move.kind)) {
    let rest = failed;
    if (pairs) {
      if (pairs.length !== move.offside) throw new Error('offside pairs differ');
      const taken = new Set<Attempt>();
      for (const [passer, receiver] of pairs) {
        const a = failed.find((b) => b.actor === passer && !taken.has(b));
        if (!a) throw new Error(`offside by line ${passer} without a failed attempt of his`);
        a.result = R.offside;
        a.other = receiver;
        taken.add(a);
      }
      rest = failed.filter((a) => !taken.has(a));
    }
    const fates: [number, number][] = [
      [R.offside, pairs ? 0 : move.offside],
      [R.intercepted, move.intercepted],
      [R.outTouch, move.outTouch],
      [R.outByline, move.outByline - move.cornersWon],
      [R.cornerWon, move.cornersWon],
      [R.looseRecovered, move.recovered],
    ];
    let at = 0;
    for (const [result, k] of fates)
      for (let j = 0; j < k; j++) {
        const a = rest[at++];
        if (!a) throw new Error(`more fates than failed attempts in a ${move.kind} group`);
        a.result = result;
      }
  } else for (const a of failed) a.result = R.tackled;
  const won = spread(t.won);
  const winners = out.filter((a) => a.result === R.intercepted || a.result === R.tackled);
  if (won.length !== winners.length) throw new Error(`${won.length} won, ${winners.length} lost`);
  winners.forEach((a, i) => (a.other = won[i]!));
  if (!pairs) caughtOffside(out, failed, t, outfield);
  const recovered = spread(t.recovered);
  out
    .filter((a) => a.result === R.looseRecovered)
    .forEach((a, i) => (a.other = recovered[i] ?? -1));
  return out;
}

/**
 * A revision-10 group's men caught offside, in ascending line order over its offside attempts; one
 * caught on his own pass swaps with the next offside attempt's (else an earlier one's that stays
 * valid); with no other in the group, another man's failed attempt of the group takes the offside
 * and gives this one its own fate; else, given `outfield`, the lowest other outfield line.
 */
function caughtOffside(
  out: Attempt[],
  failed: Attempt[],
  t: AggregateTraceMove,
  outfield: readonly number[] | undefined,
) {
  const caught = spread(t.offside);
  const offside = out.filter((a) => a.result === R.offside);
  if (caught.length !== offside.length) throw new Error('offside lines differ');
  offside.forEach((a, i) => (a.other = caught[i]!));
  offside.forEach((a, i) => {
    if (a.other !== a.actor) return;
    const next = offside[i + 1];
    if (next) {
      [a.other, next.other] = [next.other, a.other];
      return;
    }
    const earlier = offside
      .slice(0, i)
      .find((b) => b.other !== a.actor && a.other !== b.actor && b.actor !== a.actor);
    if (earlier) {
      [a.other, earlier.other] = [earlier.other, a.other];
      return;
    }
    // A failed attempt of another man in the group takes the offside, with its own fate and
    // `other` passing to this one: every man's attempts, completions and offsides stay as drawn.
    const instead = failed.find((b) => b.result !== R.offside && b.actor !== a.actor);
    if (instead) {
      [a.result, instead.result] = [instead.result, a.result];
      [a.other, instead.other] = [instead.other, a.other];
    } else if (outfield) a.other = outfield.find((line) => line !== a.actor) ?? -1;
  });
}

/**
 * Event rows (`EV`) of a revision-10 trace whose offside man is still the passer swap with the first
 * offside row of the same side that stays valid, else take the side's line 1 (2 when the passer is
 * 1), which moves an offside off the record's player. Returns how many took that fallback.
 */
export function swapOffsides(events: number[][]): number {
  let fallbacks = 0;
  for (const e of events) {
    if (e[EV.result] !== R.offside || e[EV.other] !== e[EV.actor]) continue;
    const swap = events.find(
      (g) =>
        g !== e &&
        g[EV.result] === R.offside &&
        g[EV.side] === e[EV.side] &&
        g[EV.other] !== e[EV.actor] &&
        g[EV.actor] !== e[EV.other],
    );
    if (swap) [e[EV.other], swap[EV.other]] = [swap[EV.other]!, e[EV.other]!];
    else {
      e[EV.other] = e[EV.actor] === 1 ? 2 : 1;
      fallbacks++;
    }
  }
  return fallbacks;
}

/** Whether `side`'s `line` is on the pitch in record minute `minute` (the stretch `(minute − 1, minute]`). */
const onIn = (detail: MatchDetail, side: number, line: number, minute: number) =>
  detail.stints.some(
    (s) =>
      s[ST.side] === side && s[ST.line] === line && s[ST.from]! < minute && s[ST.to]! >= minute,
  );

/**
 * A penalty is its foul and the kick at once (T827), so its foul's two men are on the pitch in the
 * kick's minute and a booked one's card is shown in it. A penalty foul that is not trades its
 * fouler, fouled man and card with an unbooked foul of the same side and period in a row without a
 * penalty, the first in the detail's order whose two men are on the pitch in the kick's minute:
 * every man keeps his fouls, fouls won and card, every cell its fouls and penalties, the card its
 * minute; only which of the side's fouls stood in the box changes, which the record does not
 * state. Returns how many could find no such foul (they stay, and `detailIssues` names them).
 */
export function settlePenaltyFouls(detail: MatchDetail): number {
  let left = 0;
  const on = (side: number, line: number, minute: number) => onIn(detail, side, line, minute);
  for (const f of detail.fouls) {
    const shot = f[FO.shot]!;
    if (f[FO.penalty] !== 1 || shot < 0) continue;
    const minute = detail.shots[shot]![SH.minute]!;
    const side = f[FO.fouledSide]!;
    const card = f[FO.cardMinute]!;
    if (
      card >= 0
        ? card === minute
        : on(side, f[FO.fouled]!, minute) && on(1 - side, f[FO.fouler]!, minute)
    )
      continue;
    const g = detail.fouls.find(
      (x) =>
        x !== f &&
        x[FO.fouledSide] === side &&
        x[FO.period] === f[FO.period] &&
        x[FO.penalty] === 0 &&
        x[FO.cardMinute]! < 0 &&
        on(side, x[FO.fouled]!, minute) &&
        on(1 - side, x[FO.fouler]!, minute),
    );
    if (!g) {
      left++;
      continue;
    }
    for (const k of [FO.fouler, FO.fouled, FO.cardMinute, FO.card]) [f[k], g[k]] = [g[k]!, f[k]!];
  }
  return left;
}

/**
 * Every row is played while all its men are on the pitch (→MATCH-38), so each row's actor and the
 * man it names (who won the ball, who was caught offside, who fouled) are on it together at some
 * minute of its period (T827). `expandGroup` pairs a group's failed attempts with its winners in
 * line order, and a foul row its fouled and fouling men, without the minutes; a pair that never
 * met trades: first its named man with another row of the group with the same result, else its
 * result and named man with another failed row of the group; a foul its fouler with another
 * unbooked, non-penalty foul of the same side and period, its own cell's first. Every man keeps
 * his attempts, completions, balls won, offsides, fouls and fouls won, every group and cell its
 * results; only who lost the ball to whom changes, which the record does not state. Returns how
 * many pairs found no such trade (`detailIssues` names them).
 */
export function settlePairs(detail: MatchDetail, keep?: () => string): number {
  const windows = detail.sides.map((s, side) =>
    s.lines.map((_, line) =>
      Array.from({ length: detail.length }, (_, m) => onIn(detail, side, line, m + 1)),
    ),
  );
  const meet = (sa: number, a: number, sb: number, b: number, period: number) => {
    const [from, to] = PERIOD_MINUTES[period] ?? [0, 0];
    for (let m = from; m < Math.min(to, detail.length); m++)
      if (windows[sa]?.[a]?.[m] && windows[sb]?.[b]?.[m]) return true;
    return false;
  };
  let left = 0;
  const eventOk = (e: number[]) => {
    const o = e[EV.other]!;
    if (o < 0) return true;
    const offside = e[EV.result] === R.offside;
    if (offside && o === e[EV.actor]) return false;
    const side = e[EV.side]!;
    return meet(side, e[EV.actor]!, offside ? side : 1 - side, o, e[EV.period]!);
  };
  const groups = new Map<string, number[][]>();
  for (const e of detail.events) {
    const key = `${e[EV.side]}:${e[EV.group]}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const trade = (r: number[], s: number[], keys: number[], ok: (x: number[]) => boolean) => {
    for (const k of keys) [r[k], s[k]] = [s[k]!, r[k]!];
    if (ok(r) && ok(s)) return true;
    for (const k of keys) [r[k], s[k]] = [s[k]!, r[k]!];
    return false;
  };
  /**
   * The last resort: `r`'s result and named man traded with any other failed row of its side,
   * period and kind of play whose men then meet, kept only when the record (`keep`) stays the same.
   */
  const tradeKept = (r: number[]) => {
    const pass = isPassKind(EVENT_KINDS[r[EV.kind]!]!);
    const was = keep!();
    const keys = [EV.other, EV.result];
    for (const s of detail.events) {
      if (
        s === r ||
        s[EV.side] !== r[EV.side] ||
        s[EV.period] !== r[EV.period] ||
        s[EV.result] === R.complete ||
        isPassKind(EVENT_KINDS[s[EV.kind]!]!) !== pass ||
        !trade(r, s, keys, eventOk)
      )
        continue;
      let kept = false;
      try {
        kept = keep!() === was;
      } catch {
        // A trade the ledger refuses (an offside on a ball not played forward) is no trade.
      }
      if (kept) return true;
      for (const k of keys) [r[k], s[k]] = [s[k]!, r[k]!];
    }
    return false;
  };
  /** Three rows' named men moved round, `r`'s to `s`, `s`'s to `t` and `t`'s to `r`, when all three then meet. */
  const rotate = (r: number[], pool: number[][]) => {
    for (const s of pool)
      for (const t of pool) {
        if (s === t) continue;
        const [a, b, c] = [r[EV.other]!, s[EV.other]!, t[EV.other]!];
        [r[EV.other], s[EV.other], t[EV.other]] = [b, c, a];
        if (eventOk(r) && eventOk(s) && eventOk(t)) return true;
        [r[EV.other], s[EV.other], t[EV.other]] = [a, b, c];
      }
    return false;
  };
  /** What a row's named man is credited with: its result, and for a ball won whether it is a high turnover (players.ts `creditWon`). */
  const credit = (e: number[]) => {
    const pass = isPassKind(EVENT_KINDS[e[EV.kind]!]!);
    const high =
      e[EV.result] === R.offside || e[EV.result] === R.looseRecovered
        ? -1
        : mirrorBand(cellBand(e[pass ? EV.to : EV.from]!)) >= COUNTER_ZONES.highTurnover;
    return `${e[EV.side]}:${e[EV.period]}:${e[EV.result]}:${pass}:${high}`;
  };
  for (const rows of groups.values())
    for (const r of rows) {
      if (eventOk(r)) continue;
      const same = (s: number[]) => s !== r && s[EV.other]! >= 0 && credit(s) === credit(r);
      const fixed =
        rows.some((s) => same(s) && trade(r, s, [EV.other], eventOk)) ||
        rows.some(
          (s) =>
            s !== r && s[EV.result] !== R.complete && trade(r, s, [EV.result, EV.other], eventOk),
        ) ||
        detail.events.some((s) => same(s) && trade(r, s, [EV.other], eventOk)) ||
        rotate(r, detail.events.filter(same)) ||
        (keep !== undefined && tradeKept(r));
      if (!fixed) left++;
    }
  const foulOk = (f: number[]) =>
    f[FO.cardMinute]! >= 0 ||
    meet(f[FO.fouledSide]!, f[FO.fouled]!, 1 - f[FO.fouledSide]!, f[FO.fouler]!, f[FO.period]!);
  const free = (f: number[]) => f[FO.cardMinute]! < 0 && f[FO.penalty] === 0;
  for (const f of detail.fouls) {
    if (foulOk(f) || !free(f)) continue;
    const peers = detail.fouls.filter(
      (g) =>
        g !== f &&
        free(g) &&
        g[FO.fouledSide] === f[FO.fouledSide] &&
        g[FO.period] === f[FO.period],
    );
    const ordered = [
      ...peers.filter((g) => g[FO.cell] === f[FO.cell]),
      ...peers.filter((g) => g[FO.cell] !== f[FO.cell]),
    ];
    if (!ordered.some((g) => trade(f, g, [FO.fouler], foulOk))) left++;
  }
  return left;
}

const PERIOD_MINUTES = [
  [0, 90],
  [90, 120],
] as const;
/** The period (0 regulation, 1 extra) a shot or card minute falls in. */
export const periodOfMinute = (minute: number) => (minute > 90 ? 1 : 0);
const isCard = (kind: number) =>
  kind === INCIDENT_KINDS.indexOf('yellow') ||
  kind === INCIDENT_KINDS.indexOf('secondYellow') ||
  kind === INCIDENT_KINDS.indexOf('red');

/**
 * A detail's structural problems, empty when it holds: a row outside its actor's stint's period, an
 * unknown line, a source that is not a completed attempt of its passer (or shooter, after a carry),
 * a penalty and its foul that do not point at each other, a booked foul without its card.
 */
export function detailIssues(detail: MatchDetail): string[] {
  const out: string[] = [];
  const sizes = detail.sides.map((s) => s.lines.length);
  const known = (side: number, line: number, at: string) => {
    if (side !== 0 && side !== 1) return void out.push(`${at}: side ${side}`);
    if (!(Number.isInteger(line) && line >= 0 && line < sizes[side]!))
      out.push(`${at}: unknown line ${line} of side ${side}`);
  };
  const stints = (side: number, line: number) =>
    detail.stints.filter((s) => s[ST.side] === side && s[ST.line] === line);
  const inPeriod = (side: number, line: number, period: number, at: string) => {
    known(side, line, at);
    const [a, b] = PERIOD_MINUTES[period] ?? [0, 0];
    if (!stints(side, line).some((s) => s[ST.from]! < b && s[ST.to]! > a))
      out.push(`${at}: side ${side} line ${line} is not on the pitch in period ${period}`);
  };
  const inMinute = (side: number, line: number, minute: number, at: string) => {
    known(side, line, at);
    if (!stints(side, line).some((s) => s[ST.from]! < minute && s[ST.to]! >= minute))
      out.push(`${at}: side ${side} line ${line} is not on the pitch in minute ${minute}`);
  };
  detail.stints.forEach((s, i) => known(s[ST.side]!, s[ST.line]!, `stint ${i}`));
  detail.events.forEach((e, i) => {
    const at = `event ${i}`,
      side = e[EV.side]!,
      period = e[EV.period]!;
    if (period >= (detail.length === 120 ? 2 : 1)) out.push(`${at}: period ${period}`);
    inPeriod(side, e[EV.actor]!, period, at);
    const other = e[EV.other]!;
    if (other >= 0) {
      const result = e[EV.result]!;
      if (result === R.offside && other === e[EV.actor])
        out.push(`${at}: caught offside on his own pass`);
      inPeriod(result === R.offside ? side : 1 - side, other, period, at);
    }
  });
  const sources = new Set<number>();
  detail.shots.forEach((s, i) => {
    const at = `shot ${i}`,
      side = s[SH.side]!,
      minute = s[SH.minute]!;
    inMinute(side, s[SH.shooter]!, minute, at);
    const passer = s[SH.passer]!;
    if (passer >= 0) inMinute(side, passer, minute, at);
    inMinute(1 - side, s[SH.keeper]!, minute, at);
    const source = s[SH.source]!;
    if (source >= 0) {
      const e = detail.events[source];
      const actor = passer >= 0 ? passer : s[SH.shooter];
      if (
        !e ||
        e[EV.side] !== side ||
        e[EV.result] !== R.complete ||
        e[EV.actor] !== actor ||
        e[EV.period] !== periodOfMinute(minute)
      )
        out.push(`${at}: source ${source} is not a completed attempt of its passer`);
      if (sources.has(source)) out.push(`${at}: source ${source} used twice`);
      sources.add(source);
    }
    const penalty = s[SH.kind] === SHOT_KINDS.indexOf('penalty');
    const foul = s[SH.foul]!;
    if (penalty) {
      const f = detail.fouls[foul];
      if (!f || f[FO.penalty] !== 1 || f[FO.shot] !== i || f[FO.fouledSide] !== side)
        out.push(`${at}: penalty without its foul`);
    } else if (foul !== -1) out.push(`${at}: foul ${foul} on a ${s[SH.kind]} shot`);
  });
  detail.fouls.forEach((f, i) => {
    const at = `foul ${i}`,
      side = f[FO.fouledSide]!,
      period = f[FO.period]!;
    inPeriod(side, f[FO.fouled]!, period, at);
    inPeriod(1 - side, f[FO.fouler]!, period, at);
    const shot = f[FO.shot]!;
    if (f[FO.penalty] === 1) {
      if (detail.shots[shot]?.[SH.foul] !== i) out.push(`${at}: penalty without its kick`);
    } else if (shot !== -1) out.push(`${at}: kick ${shot} without a penalty`);
    const minute = f[FO.cardMinute]!,
      card = f[FO.card]!;
    if (minute >= 0 && f[FO.penalty] === 1 && shot >= 0) {
      const kick = detail.shots[shot]?.[SH.minute];
      if (kick !== minute) out.push(`${at}: booked at ${minute}, its kick at ${kick}`);
    }
    if (minute >= 0) {
      const x = detail.incidents[card];
      if (
        !x ||
        !isCard(x[IN.kind]!) ||
        x[IN.side] !== 1 - side ||
        x[IN.line] !== f[FO.fouler] ||
        x[IN.minute] !== minute
      )
        out.push(`${at}: booked at ${minute} without its card`);
    } else if (card !== -1) out.push(`${at}: card ${card} without its minute`);
  });
  detail.incidents.forEach((x, i) => {
    known(x[IN.side]!, x[IN.line]!, `incident ${i}`);
    if (x[IN.other]! >= 0) known(x[IN.side]!, x[IN.other]!, `incident ${i}`);
  });
  detail.shootout.forEach((k, i) => inMinute(k[SO.side]!, k[SO.line]!, detail.length, `kick ${i}`));
  return out;
}
