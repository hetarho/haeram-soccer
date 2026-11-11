import type { Player } from '../../../contracts/src/types';
import { aggregateAddedTime, keeperLine } from '../aggregate/count';
import type { AggregateMatch } from '../aggregate/engine';
import type { AggregateAttributionTrace, AggregateSide } from '../aggregate/types';
import { FORMATIONS } from '../player';
import {
  EVENT_KINDS,
  EVENT_RESULTS,
  SET_PIECES,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  INCIDENT_KINDS,
  CARD_REASONS,
} from './codes';
import type { MatchDetail, DetailSide } from './detail';
import { expandGroup, swapOffsides } from './expand';
import { invalidDetail } from './failure';

export type { MatchDetail, DetailSide } from './detail';
export { recordOf, detailIssues } from './recount';

/** A settled ledger expanded without another draw. Every reference uses record-order lines. */
export function matchDetail(
  match: AggregateMatch,
  rosters: readonly [readonly Player[], readonly Player[]],
  trace: AggregateAttributionTrace,
): MatchDetail {
  const { input, participation, facts, players } = match;
  const lineMaps = players.sides.map((lines) => new Map(lines.map((l, i) => [l.line, i])));
  const index = (side: number, line: number) => {
    if (line < 0) return -1;
    const found = lineMaps[side]!.get(line);
    if (found === undefined) throw invalidDetail(`line:${side}/${line}`);
    return found;
  };
  const sideRows = ([0, 1] as const).map((side): DetailSide => ({
    tactic: input.sides[side].tactic,
    lines: players.sides[side].map(({ line }) => {
      const id = input.sides[side].lines[line]!.id;
      if (!rosters[side].some((p) => p.id === id)) throw invalidDetail(`roster:${id}`);
      const stint = participation.stints[side].find((s) => s.line === line)!;
      const slot = FORMATIONS[input.sides[side].tactic].slots[stint.slot]!;
      return {
        id,
        slot: stint.slot,
        role: match.plan.sides[side].shape.roles[stint.slot]!,
        position: slot.position,
      };
    }),
  })) as [DetailSide, DetailSide];
  const events: number[][] = [],
    shots: number[][] = [],
    fouls: number[][] = [];
  const completed: Map<number, number[]>[][] = [[], []];
  for (const side of [0, 1] as const) {
    facts.ledger.sides[side].moves.forEach((move, group) => {
      const byActor = new Map<number, number[]>();
      completed[side][group] = byActor;
      for (const a of expandGroup(move, trace.moves[side][group]!)) {
        if (a.result === 0) byActor.set(a.actor, [...(byActor.get(a.actor) ?? []), events.length]);
        events.push([
          side,
          group,
          EVENT_KINDS.indexOf(move.kind),
          SET_PIECES.indexOf(move.setPiece ?? 'none'),
          move.from,
          move.to,
          index(side, a.actor),
          a.result,
          a.lineBreaking,
          index(a.result === EVENT_RESULTS.indexOf('offside') ? side : 1 - side, a.other),
          move.period === 'extra' ? 1 : 0,
        ]);
      }
    });
  }
  // Revision 11 pairs offsides at attribution. Earlier traces need the legacy cross-group swap;
  // an unpairable old offside retains its recorded line, never fabricates another player's count.
  if (!match.plan.placed) swapOffsides(events, EVENT_RESULTS.indexOf('offside'), false);
  const shotIds: number[][] = [[], []];
  for (const side of [0, 1] as const) {
    const used = new Set<number>();
    facts.ledger.sides[side].shots.forEach((shot, i) => {
      const credit = players.shots.find((c) => c.side === side && c.shot === i);
      if (!credit) throw invalidDetail(`shot-credit:${side}/${i}`);
      let source = -1;
      if (shot.source >= 0) {
        const ids = completed[side][shot.source]?.get(credit.passer ?? credit.shooter) ?? [];
        source = ids.find((id) => !used.has(id)) ?? -1;
        if (source < 0) throw invalidDetail(`shot-source:${side}/${i}`);
        used.add(source);
      }
      const foe: AggregateSide = side === 0 ? 1 : 0;
      shotIds[side][i] = shots.length;
      shots.push([
        side,
        shot.minute,
        shot.cell,
        SHOT_KINDS.indexOf(shot.kind),
        shot.header ? 1 : 0,
        shot.xg,
        SHOT_OUTCOMES.indexOf(shot.outcome),
        shot.corner ? 1 : 0,
        index(side, credit.shooter),
        credit.passer === undefined ? -1 : index(side, credit.passer),
        source,
        index(foe, keeperLine(participation, foe, shot.minute)),
      ]);
    });
  }
  const foulIds: number[][][] = [[], []];
  const spread = (counts: readonly number[]) =>
    counts.flatMap((n, line) => Array<number>(n).fill(line));
  for (const side of [0, 1] as const) {
    facts.ledger.sides[side].fouled.forEach((f, i) => {
      const split = trace.fouls[side][i]!;
      const ids: number[] = [];
      foulIds[side][i] = ids;
      const push = (fouler: number, fouled: number, minute: number) => {
        ids.push(fouls.length);
        fouls.push([
          side,
          f.cell,
          index(1 - side, fouler),
          index(side, fouled),
          minute,
          ids.length <= f.penalties ? 1 : 0,
          f.period === 'extra' ? 1 : 0,
        ]);
      };
      for (const b of split.booked)
        push(b.fouler, b.fouled, participation.incidents[b.incident]!.minute);
      const fouled = spread(split.fouled),
        fouler = spread(split.fouler);
      if (fouled.length !== fouler.length || fouled.length + split.booked.length !== f.n)
        throw invalidDetail(`fouls:${side}/${i}`);
      if (split.pairs) {
        if (split.pairs.length !== fouled.length) throw invalidDetail(`foul-pairs:${side}/${i}`);
        for (const pair of split.pairs) push(pair.other, pair.actor, -1);
      } else fouled.forEach((line, j) => push(fouler[j]!, line, -1));
    });
  }
  const incidents = participation.incidents.map((x, i) => {
    const line = trace.incidents?.[i];
    const ofId = (id: string) => input.sides[x.side].lines.findIndex((l) => l.id === id);
    return [
      x.minute,
      x.side,
      INCIDENT_KINDS.indexOf(x.kind),
      index(x.side, line?.line ?? ofId(x.player)),
      x.other === undefined ? -1 : index(x.side, line?.other ?? ofId(x.other)),
      x.reason === undefined ? -1 : CARD_REASONS.indexOf(x.reason),
    ];
  });
  if (match.shootout && !trace.shootout?.length) throw invalidDetail('shootout-trace');
  return {
    version: 1,
    id: input.fixture,
    length: facts.length,
    added: aggregateAddedTime(facts, participation.incidents),
    score: [...facts.score],
    sides: sideRows,
    stints: participation.stints.flatMap((stints, side) =>
      stints.map((s) => [side, index(side, s.line), s.slot, s.from, s.to]),
    ),
    events,
    shots,
    fouls,
    incidents,
    shootout: (trace.shootout ?? []).map((k) => [k.side, index(k.side, k.line), k.scored]),
    penalties: (trace.penalties ?? []).map((p) => [
      foulIds[p.side][p.group]![p.foul]!,
      shotIds[p.side][p.shot]!,
    ]),
  };
}
