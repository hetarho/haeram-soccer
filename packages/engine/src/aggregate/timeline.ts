/** Shared participation constraints, before attribution and again at script placement (MATCH-27). */
import { message } from '../../../contracts/src/messages';

export interface PlayingSpan {
  from: number;
  to: number;
}

/** Slot changes join one continuous spell. A substituted player never returns. */
export function playingSpan(stints: readonly PlayingSpan[]): PlayingSpan {
  // Pairwise `Math.min`/`Math.max` give the spread forms' values, empty and NaN included, without
  // their mapped arrays (T983).
  let from = Infinity,
    to = -Infinity;
  for (const s of stints) {
    from = Math.min(from, s.from);
    to = Math.max(to, s.to);
  }
  return { from, to };
}

export function commonSpan(...spans: readonly PlayingSpan[]): PlayingSpan {
  let from = -Infinity,
    to = Infinity;
  for (const s of spans) {
    from = Math.max(from, s.from);
    to = Math.min(to, s.to);
  }
  return { from, to };
}

/**
 * Maximum matching of existing integer marginals. Only an unmatched credit is conditioned on
 * the actor's common playing time; feasible draws keep every player's count and consume no RNG.
 * The recipient's original weight is restricted by the fraction of his spell shared with the
 * actor, rather than giving a one-minute overlap the weight of a whole match.
 */
export function pairParticipants(
  actors: readonly number[],
  recipients: readonly number[],
  actorSpans: readonly PlayingSpan[],
  recipientSpans: readonly PlayingSpan[],
  weights: readonly number[],
  choose: (weights: readonly number[]) => number,
): { actor: number; other: number }[] {
  // Each line repeated `counts[line]` times in line order, pushed rather than built per line (T986).
  const spread = (counts: readonly number[]) => {
    const out: number[] = [];
    for (let line = 0; line < counts.length; line++)
      for (let k = counts[line]!; k > 0; k--) out.push(line);
    return out;
  };
  const left = spread(actors),
    right = spread(recipients);
  const fail = (p0: string): never => {
    throw new Error(message('copy.participation.830f33bf6d', { p0 }));
  };
  if (left.length !== right.length) fail('unequal pair counts');
  const overlap = (a: number, b: number) => {
    const span = commonSpan(actorSpans[a]!, recipientSpans[b]!);
    return Math.max(0, span.to - span.from);
  };
  const owner = right.map(() => -1);
  const augment = (at: number, seen: Set<number>): boolean => {
    for (let i = 0; i < right.length; i++) {
      if (seen.has(i) || !overlap(left[at]!, right[i]!)) continue;
      seen.add(i);
      if (owner[i] === -1 || augment(owner[i]!, seen)) {
        owner[i] = at;
        return true;
      }
    }
    return false;
  };
  left.forEach((_, at) => augment(at, new Set()));
  const paired = left.map(() => -1);
  owner.forEach((at, i) => {
    if (at >= 0) paired[at] = right[i]!;
  });
  return left.map((actor, at) => {
    let other = paired[at]!;
    if (other < 0) {
      const conditional = weights.map((w, line) => {
        const span = recipientSpans[line]!;
        return (w * overlap(actor, line)) / Math.max(1, span.to - span.from);
      });
      other = choose(conditional);
      if (other < 0) {
        // A role may have no positive weight among the players sharing this spell.
        other = choose(recipientSpans.map((_, line) => overlap(actor, line)));
      }
      if (other < 0) fail('no common playing time');
    }
    return { actor, other };
  });
}
