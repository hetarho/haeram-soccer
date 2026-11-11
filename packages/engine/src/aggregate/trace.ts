/**
 * What an aggregate match split, made again with a trace (T825, →MATCH-38): the attribution and,
 * for a tie decided by one, the shoot-out are run once more on the fixture's own streams with a
 * trace attached, and the run is checked to give the match's own players and shoot-out score
 * before the trace is trusted. Settled matches never call it; an own match's detail does.
 */
import type { AggregateMatch } from './engine';
import { aggregateShootout } from './finish';
import { attributePlayerFacts } from './players';
import { aggregateStreams } from './team';
import type { AggregateAttributionTrace } from './types';

/** Plain data built the same way compares by its JSON text. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The streams a settled match drew on: its fixture's own, or the retry that settled it. */
export const matchStreams = (match: Pick<AggregateMatch, 'input' | 'retry'>) =>
  aggregateStreams(
    match.input.seed,
    match.retry === 0 ? match.input.fixture : `${match.input.fixture}:retry${match.retry}`,
  );

export function traceAggregate(match: AggregateMatch): AggregateAttributionTrace {
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const streams = matchStreams(match);
  const players = attributePlayerFacts(
    match.input,
    match.plan,
    match.participation,
    match.facts,
    streams,
    trace,
  );
  if (!same(players, match.players))
    throw new Error(`${match.input.fixture}: the traced attribution differs`);
  if (match.shootout) {
    trace.shootout = [];
    const score = aggregateShootout(
      match.input,
      match.participation,
      matchStreams(match),
      trace.shootout,
    );
    if (!same(score, match.shootout))
      throw new Error(`${match.input.fixture}: the traced shoot-out differs`);
  }
  return trace;
}
