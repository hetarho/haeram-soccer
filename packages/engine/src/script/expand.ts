import { isPassKind } from '../aggregate/ledger';
import type { AggregateMove, AggregateTraceMove } from '../aggregate/types';
import { EVENT_RESULTS } from './codes';
import { invalidDetail } from './failure';

const R = Object.fromEntries(EVENT_RESULTS.map((r, i) => [r, i])) as Record<
  (typeof EVENT_RESULTS)[number],
  number
>;

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
const spread = (counts: readonly number[]) =>
  counts.flatMap((k, line) => Array<number>(k).fill(line));

/**
 * A move group's attempts by the header's rule. `outfield` lists this side's outfield lines, for an
 * offside group whose only caught line is the passer's own; without it such an attempt keeps its
 * own line for the caller to swap across groups (`swapOffsides`).
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
  if (out.length !== move.attempts) throw invalidDetail(`attempts:${move.attempts}/${out.length}`);
  if (failed.length !== move.attempts - move.completed) throw invalidDetail('completions');
  const pass = isPassKind(move.kind);
  if (pass) {
    const fates: [number, number][] = [
      [R.offside, move.offside],
      [R.intercepted, move.intercepted],
      [R.outTouch, move.outTouch],
      [R.outByline, move.outByline - move.cornersWon],
      [R.cornerWon, move.cornersWon],
      [R.looseRecovered, move.recovered],
    ];
    const paired = new Set<Attempt>();
    if (t.offsidePairs) {
      if (t.offsidePairs.length !== move.offside) throw invalidDetail('offside-pairs');
      for (const pair of t.offsidePairs) {
        const a = failed.find((a) => a.actor === pair.actor && !paired.has(a));
        if (!a || pair.actor === pair.receiver) throw invalidDetail('offside-pair');
        a.result = R.offside;
        a.other = pair.receiver;
        paired.add(a);
      }
    }
    const remaining = failed.filter((a) => !paired.has(a));
    let at = 0;
    for (const [result, k] of fates)
      for (let j = 0; j < (t.offsidePairs && result === R.offside ? 0 : k); j++) {
        const a = remaining[at++];
        if (!a) throw invalidDetail(`results:${move.kind}`);
        a.result = result;
      }
  } else for (const a of failed) a.result = R.tackled;
  const won = spread(t.won);
  const winners = out.filter((a) => a.result === R.intercepted || a.result === R.tackled);
  if (won.length !== winners.length) throw invalidDetail(`wins:${won.length}/${winners.length}`);
  winners.forEach((a, i) => (a.other = won[i]!));
  const caught = spread(t.offside);
  const offside = out.filter((a) => a.result === R.offside);
  if (caught.length !== offside.length) throw invalidDetail('offside-lines');
  if (!t.offsidePairs) offside.forEach((a, i) => (a.other = caught[i]!));
  if (!t.offsidePairs)
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
  const recovered = spread(t.recovered);
  out
    .filter((a) => a.result === R.looseRecovered)
    .forEach((a, i) => (a.other = recovered[i] ?? -1));
  return out;
}

/**
 * Event rows (`[side, group, kind, setPiece, from, to, actor, result, lineBreaking, other]`) whose
 * offside man is still the passer swap with the first offside row of the same side that stays
 * valid, else take the side's lowest other outfield player (slot 1, or 2 when the passer is 1).
 */
export function swapOffsides(events: number[][], offside: number, fallback = true): number {
  let fallbacks = 0;
  for (const e of events) {
    if (e[7] !== offside || e[9] !== e[6]) continue;
    const swap = events.find(
      (g) => g !== e && g[7] === offside && g[0] === e[0] && g[9] !== e[6] && g[6] !== e[9],
    );
    if (swap) [e[9], swap[9]] = [swap[9]!, e[9]!];
    else {
      if (fallback) e[9] = e[0]! * 11 + (e[6] === e[0]! * 11 + 1 ? 2 : 1);
      fallbacks++;
    }
  }
  return fallbacks;
}
