/**
 * An own match's detail from its aggregate match and attribution trace, and the record it counts
 * back to (→MATCH-26, MATCH-27, MATCH-38; T825). `matchDetail` lays every ledger group out as one
 * row an attempt (detail.ts `expandGroup`), names who took each shot and which completion it
 * followed, splits every foul row into fouls with their card or penalty, and lists stints,
 * incidents and shoot-out kicks. `recordOf` rebuilds the ledger and each line's splits from those
 * rows alone and counts them with the ledger's and the attribution's own code, so a counter's
 * definition has one home (→MATCH-13).
 */
import { PD } from '../../../contracts/src/detail';
import type { Incident, MatchRecord, Player } from '../../../contracts/src/types';
import { cellBand } from '../grid/pitch';
import { M } from '../grid/record';
import { FORMATIONS } from '../player';
import type { AggregateMatch } from '../aggregate/engine';
import { aggregateAddedTime } from '../aggregate/finish';
import { sideCards } from '../aggregate/input';
import { deriveTeamFacts, isPassKind } from '../aggregate/ledger';
import { playedMinutes, recordLines } from '../aggregate/participation';
import {
  creditCard,
  creditMoveGroup,
  creditShot,
  creditWon,
  emptyRow,
  keeperAmong,
  type AttributionRow,
} from '../aggregate/players';
import type {
  AggregateAttributionTrace,
  AggregateFouls,
  AggregateLedger,
  AggregateParticipation,
  AggregateShot,
  AggregateSide,
  AggregateSideLedger,
  AggregateStint,
} from '../aggregate/types';
import {
  CARD_REASONS,
  EV,
  EVENT_KINDS,
  expandGroup,
  FO,
  IN,
  INCIDENT_KINDS,
  PERIODS,
  periodOfMinute,
  R,
  SET_PIECES,
  SH,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  SO,
  spread,
  ST,
  swapOffsides,
  type DetailSide,
  type MatchDetail,
} from './detail';

const SIDES = [0, 1] as const;
const periodIndex = (period: string) => (period === 'extra' ? 1 : 0);

/** What building a detail met that a caller may want to count (scripts/export-settled.ts). */
export interface DetailNotes {
  /** Revision-10 offsides moved off the record's player (detail.ts `swapOffsides`). */
  offsideFallbacks: number;
}

/**
 * Every recorded action of an aggregate match as rows. `trace` is its attribution's split, as
 * aggregate/trace.ts `traceAggregate` makes it again; `rosters` are the matchday rosters the match
 * was played with, aligned with its input's lines.
 */
export function matchDetail(
  match: AggregateMatch,
  rosters: readonly [readonly Pick<Player, 'id'>[], readonly Pick<Player, 'id'>[]],
  trace: AggregateAttributionTrace,
  notes?: DetailNotes,
): MatchDetail {
  const { input, participation, facts, players } = match;
  /** Each side's record order (input lines) and each input line's place in it. */
  const order = SIDES.map((side) => recordLines(input, participation, side));
  const index = order.map((lines) => new Map(lines.map((line, i) => [line, i])));
  const rec = (side: number, line: number) => {
    if (line < 0) return -1;
    const at = index[side]!.get(line);
    if (at === undefined) throw new Error(`side ${side} line ${line} is not a named line`);
    return at;
  };
  const lineOf = (side: AggregateSide, id: string) => {
    const line = input.sides[side].lines.findIndex((l) => l.id === id);
    if (line < 0) throw new Error(`side ${side} has no line ${id}`);
    return line;
  };
  for (const side of SIDES)
    input.sides[side].lines.forEach((l, line) => {
      if (rosters[side][line]?.id !== l.id) throw new Error(`side ${side} line ${line} roster`);
    });
  const sides = SIDES.map((side): DetailSide => {
    const tactic = input.sides[side].tactic;
    const slots = FORMATIONS[tactic].slots;
    return {
      tactic,
      lines: order[side]!.map((line) => {
        const first = participation.stints[side]
          .filter((s) => s.line === line)
          .sort((a, b) => a.from - b.from)[0];
        if (!first) throw new Error(`side ${side} line ${line} never played`);
        const s = slots[first.slot]!;
        return {
          id: input.sides[side].lines[line]!.id,
          slot: first.slot,
          role: s.role,
          position: s.position,
        };
      }),
    };
  }) as [DetailSide, DetailSide];
  const stints = SIDES.flatMap((side) =>
    participation.stints[side].map((s) => [side, rec(side, s.line), s.slot, s.from, s.to]),
  );

  const events: number[][] = [];
  /** Per side and group, each completed event id by the actor's input line. */
  const completedIds: Map<number, number[]>[][] = [[], []];
  for (const side of SIDES)
    facts.ledger.sides[side].moves.forEach((move, group) => {
      const byActor = new Map<number, number[]>();
      completedIds[side][group] = byActor;
      const t = trace.moves[side][group];
      if (!t) throw new Error(`side ${side} group ${group} is not traced`);
      for (const a of expandGroup(move, t)) {
        if (a.result === R.complete)
          byActor.set(a.actor, [...(byActor.get(a.actor) ?? []), events.length]);
        const otherSide = a.result === R.offside ? side : 1 - side;
        events.push([
          side,
          group,
          EVENT_KINDS.indexOf(move.kind),
          SET_PIECES.indexOf(move.setPiece ?? 'none'),
          move.from,
          move.to,
          rec(side, a.actor),
          a.result,
          a.lineBreaking,
          rec(otherSide, a.other),
          periodIndex(move.period),
        ]);
      }
    });
  const fallbacks = swapOffsides(events);
  if (notes) notes.offsideFallbacks = fallbacks;

  const credits = new Map(players.shots.map((c) => [`${c.side}:${c.shot}`, c]));
  const offset = [0, facts.ledger.sides[0].shots.length];
  const shots: number[][] = [];
  for (const side of SIDES) {
    const opp: AggregateSide = side === 0 ? 1 : 0;
    const used = new Set<number>();
    facts.ledger.sides[side].shots.forEach((shot, i) => {
      const credit = credits.get(`${side}:${i}`);
      if (!credit) throw new Error(`side ${side} shot ${i} has no credit`);
      let source = -1;
      if (shot.source >= 0) {
        const actor = credit.passer ?? credit.shooter;
        const ids = completedIds[side][shot.source]!.get(actor) ?? [];
        source = ids.find((id) => !used.has(id)) ?? -1;
        if (source < 0) throw new Error(`side ${side} shot ${i}: no completion of its source`);
        used.add(source);
      }
      const here = participation.stints[opp]
        .filter((s) => s.from < shot.minute && s.to >= shot.minute)
        .sort((a, b) => a.line - b.line);
      shots.push([
        side,
        shot.minute,
        shot.cell,
        SHOT_KINDS.indexOf(shot.kind),
        shot.header ? 1 : 0,
        shot.xg,
        SHOT_OUTCOMES.indexOf(shot.outcome),
        shot.corner ? 1 : 0,
        rec(side, credit.shooter),
        credit.passer === undefined ? -1 : rec(side, credit.passer),
        source,
        rec(opp, keeperAmong(here)),
        -1,
      ]);
    });
  }

  // Each foul row's fouls: the booked ones with their card, then the others pairing fouled and
  // fouler lines in ascending order. A box row's fouls are penalties, taking its kicks in the order
  // of their minutes.
  const fouls: number[][] = [];
  for (const side of SIDES) {
    const opp: AggregateSide = side === 0 ? 1 : 0;
    facts.ledger.sides[side].fouled.forEach((row, i) => {
      const t = trace.fouls[side][i];
      if (!t) throw new Error(`side ${side} foul row ${i} is not traced`);
      const kicks = [...(t.penalties ?? [])].sort(
        (a, b) =>
          facts.ledger.sides[side].shots[a]!.minute - facts.ledger.sides[side].shots[b]!.minute ||
          a - b,
      );
      if (kicks.length !== row.penalties) throw new Error(`side ${side} foul row ${i} penalties`);
      const first = fouls.length;
      const period = periodIndex(row.period);
      const penalty = row.penalties > 0 ? 1 : 0;
      for (const b of t.booked)
        fouls.push([
          side,
          row.cell,
          rec(opp, b.fouler),
          rec(side, b.fouled),
          participation.incidents[b.incident]!.minute,
          penalty,
          period,
          -1,
          b.incident,
        ]);
      const fouled = spread(t.fouled),
        fouler = spread(t.fouler);
      if (fouled.length !== fouler.length || fouled.length + t.booked.length !== row.n)
        throw new Error(`side ${side} foul row ${i} does not add up`);
      fouled.forEach((line, j) =>
        fouls.push([
          side,
          row.cell,
          rec(opp, fouler[j]!),
          rec(side, line),
          -1,
          penalty,
          period,
          -1,
          -1,
        ]),
      );
      kicks.forEach((kick, j) => {
        const at = first + j;
        fouls[at]![FO.shot] = offset[side]! + kick;
        shots[offset[side]! + kick]![SH.foul] = at;
      });
    });
  }

  const incidents = participation.incidents.map((x) => [
    x.minute,
    x.side,
    INCIDENT_KINDS.indexOf(x.kind),
    rec(x.side, lineOf(x.side, x.player)),
    x.other === undefined ? -1 : rec(x.side, lineOf(x.side, x.other)),
    x.reason === undefined ? -1 : CARD_REASONS.indexOf(x.reason),
    x.added ?? -1,
  ]);
  let shootout: number[][] = [];
  if (match.shootout) {
    if (!trace.shootout) throw new Error('the shoot-out is not traced');
    shootout = trace.shootout.map((k) => [k.side, rec(k.side, k.line), k.scored ? 1 : 0]);
  }
  return {
    version: 1,
    id: input.fixture,
    length: facts.length,
    added: aggregateAddedTime(facts, participation.incidents),
    score: [facts.score[0], facts.score[1]],
    sides,
    stints,
    events,
    shots,
    fouls,
    incidents,
    shootout,
  };
}

/** The record the rows count back to: team and player rows in the record's own layout. */
export function recordOf(
  detail: MatchDetail,
): Pick<
  MatchRecord,
  'score' | 'metrics' | 'detail' | 'players' | 'xg' | 'incidents' | 'regulation' | 'shootout'
> {
  const periods = detail.length === 120 ? PERIODS.slice() : PERIODS.slice(0, 1);
  const incidents: Incident[] = detail.incidents.map((x) => {
    const side = x[IN.side] as AggregateSide;
    const ids = detail.sides[side].lines;
    return {
      minute: x[IN.minute]!,
      side,
      kind: INCIDENT_KINDS[x[IN.kind]!]!,
      player: ids[x[IN.line]!]!.id,
      ...(x[IN.other]! >= 0 && { other: ids[x[IN.other]!]!.id }),
      ...(x[IN.reason]! >= 0 && { reason: CARD_REASONS[x[IN.reason]!]! }),
      ...(x[IN.added]! >= 0 && { added: x[IN.added]! }),
    };
  });
  const participation: AggregateParticipation = {
    length: detail.length,
    stints: SIDES.map((side) =>
      detail.stints
        .filter((s) => s[ST.side] === side)
        .map((s): AggregateStint => ({
          line: s[ST.line]!,
          slot: s[ST.slot]!,
          from: s[ST.from]!,
          to: s[ST.to]!,
        })),
    ) as [AggregateStint[], AggregateStint[]],
    incidents,
  };
  const rows = SIDES.map((side) => detail.sides[side].lines.map(emptyRow));
  const row = (side: number, line: number): AttributionRow => {
    const r = rows[side]![line];
    if (!r) throw new Error(`side ${side} line ${line} is not a named line`);
    return r;
  };

  // The ledger's groups and each line's split of them, from the rows.
  const ledger: AggregateLedger = {
    length: detail.length,
    periods,
    sides: SIDES.map((side): AggregateSideLedger => {
      const cards = sideCards(participation, side, 0, detail.length);
      return {
        moves: [],
        shots: [],
        fouled: [],
        held: periods.map(() => 0),
        cards: { yellow: cards.yellow, red: cards.red },
        cardFouls: cards.fouls,
      };
    }) as [AggregateSideLedger, AggregateSideLedger],
  };
  /** Per side, each detail group's index among the rebuilt moves and its lines' counts. */
  const groups = SIDES.map(() => new Map<number, { move: number; lines: number[][] }>());
  detail.events.forEach((e) => {
    const side = e[EV.side] as AggregateSide;
    const own = ledger.sides[side];
    let g = groups[side]!.get(e[EV.group]!);
    if (!g) {
      const kind = EVENT_KINDS[e[EV.kind]!]!;
      const setPiece = SET_PIECES[e[EV.setPiece]!]!;
      own.moves.push({
        period: PERIODS[e[EV.period]!]!,
        from: e[EV.from]!,
        to: e[EV.to]!,
        kind,
        ...(setPiece !== 'none' && { setPiece }),
        attempts: 0,
        completed: 0,
        lineBreaking: 0,
        offside: 0,
        intercepted: 0,
        outTouch: 0,
        outByline: 0,
        cornersWon: 0,
        recovered: 0,
      });
      g = { move: own.moves.length - 1, lines: [] };
      groups[side]!.set(e[EV.group]!, g);
    }
    const move = own.moves[g.move]!;
    const actor = e[EV.actor]!;
    const counts = (g.lines[actor] ??= [0, 0, 0]);
    counts[0]!++;
    move.attempts++;
    const result = e[EV.result]!,
      other = e[EV.other]!;
    if (result === R.complete) {
      move.completed++;
      counts[1]!++;
    }
    if (e[EV.lineBreaking] === 1) {
      move.lineBreaking++;
      counts[2]!++;
    }
    const pass = isPassKind(move.kind);
    if (result === R.offside) {
      move.offside++;
      if (other >= 0) row(side, other).detail[PD.offsides]!++;
    } else if (result === R.intercepted || result === R.tackled) {
      if (result === R.intercepted) move.intercepted++;
      creditWon(row(1 - side, other), pass, cellBand(pass ? move.to : move.from), 1);
    } else if (result === R.outTouch) move.outTouch++;
    else if (result === R.outByline) move.outByline++;
    else if (result === R.cornerWon) {
      move.outByline++;
      move.cornersWon++;
    } else if (result === R.looseRecovered) {
      move.recovered++;
      // A loose ball won in the winner's high-turnover zone names him (players.ts, T327).
      if (other >= 0) row(1 - side, other).detail[PD.highTurnovers]!++;
    }
  });
  for (const side of SIDES)
    for (const g of groups[side]!.values())
      g.lines.forEach((c, line) => {
        if (c)
          creditMoveGroup(row(side, line), ledger.sides[side].moves[g.move]!, c[0]!, c[1]!, c[2]!);
      });

  for (const s of detail.shots) {
    const side = s[SH.side] as AggregateSide;
    const source = s[SH.source]!;
    const shot: AggregateShot = {
      period: PERIODS[periodOfMinute(s[SH.minute]!)]!,
      minute: s[SH.minute]!,
      cell: s[SH.cell]!,
      source: source < 0 ? -1 : groups[side]!.get(detail.events[source]![EV.group]!)!.move,
      kind: SHOT_KINDS[s[SH.kind]!]!,
      header: s[SH.header] === 1,
      xg: s[SH.xg]!,
      outcome: SHOT_OUTCOMES[s[SH.outcome]!]!,
      corner: s[SH.corner] === 1,
    };
    ledger.sides[side].shots.push(shot);
    const passer = s[SH.passer]!;
    creditShot(
      shot,
      row(side, s[SH.shooter]!),
      passer >= 0 ? row(side, passer) : undefined,
      row(1 - side, s[SH.keeper]!),
    );
  }
  const rowsOfFouls = SIDES.map(() => new Map<string, AggregateFouls>());
  for (const f of detail.fouls) {
    const side = f[FO.fouledSide] as AggregateSide;
    const period = PERIODS[f[FO.period]!]!;
    const key = `${period}:${f[FO.cell]}`;
    let entry = rowsOfFouls[side]!.get(key);
    if (!entry) {
      entry = { period, cell: f[FO.cell]!, n: 0, penalties: 0 };
      rowsOfFouls[side]!.set(key, entry);
      ledger.sides[side].fouled.push(entry);
    }
    entry.n++;
    if (f[FO.penalty] === 1) entry.penalties++;
    row(1 - side, f[FO.fouler]!).detail[PD.fouls]!++;
    row(side, f[FO.fouled]!).detail[PD.foulsWon]!++;
  }
  for (const x of detail.incidents)
    creditCard(row(x[IN.side]!, x[IN.line]!), INCIDENT_KINDS[x[IN.kind]!]!);

  const facts = deriveTeamFacts(ledger);
  const players = SIDES.flatMap((side) => {
    const minutes = playedMinutes(participation, side);
    return detail.sides[side].lines.map((l, line) => {
      const r = rows[side]![line]!;
      r.metrics[M.minutes] = minutes.get(line) ?? 0;
      return { id: l.id, metrics: r.metrics, detail: r.detail };
    });
  });
  const kicks = [0, 0];
  for (const k of detail.shootout) if (k[SO.scored] === 1) kicks[k[SO.side]!]!++;
  return {
    score: { home: facts.score[0], away: facts.score[1] },
    metrics: [facts.sides[0].metrics, facts.sides[1].metrics],
    detail: [facts.sides[0].detail, facts.sides[1].detail],
    players,
    xg: [facts.sides[0].xg / 100, facts.sides[1].xg / 100],
    incidents,
    ...(facts.regulation && {
      regulation: { home: facts.regulation[0], away: facts.regulation[1] },
    }),
    ...(detail.shootout.length > 0 && { shootout: { home: kicks[0]!, away: kicks[1]! } }),
  };
}
