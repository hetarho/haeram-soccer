import type { Incident, MatchRecord } from '../../../contracts/src/types';
import { countPlayerFacts, keeperLine } from '../aggregate/count';
import { deriveTeamFacts, isPassKind, ledgerIssues } from '../aggregate/ledger';
import type {
  AggregateAttributionTrace,
  AggregateLedger,
  AggregateMove,
  AggregateParticipation,
  AggregateShotCredit,
  AggregateSide,
  AggregateSideLedger,
  AggregateTraceMove,
} from '../aggregate/types';
import {
  CARD_REASONS,
  EVENT_KINDS,
  EVENT_RESULTS,
  INCIDENT_KINDS,
  SET_PIECES,
  SHOT_KINDS,
  SHOT_OUTCOMES,
  EV,
  SH,
  FO,
} from './codes';
import type { MatchDetail } from './detail';

const period = (n: number) => (n === 0 ? ('regulation' as const) : ('extra' as const));
const emptySplit = (n: number): AggregateTraceMove => ({
  attempts: Array<number>(n).fill(0),
  completed: Array<number>(n).fill(0),
  broke: Array<number>(n).fill(0),
  offside: Array<number>(n).fill(0),
  won: [],
  recovered: [],
});
const add = (row: number[], at: number) => (row[at] = (row[at] ?? 0) + 1);

function rowsOf(d: MatchDetail) {
  const emptySide = (): AggregateSideLedger => ({
    moves: [],
    shots: [],
    fouled: [],
    held: d.length === 120 ? [0, 0] : [0],
    cards: { yellow: 0, red: 0 },
    cardFouls: 0,
  });
  const ledger: AggregateLedger = {
    length: d.length,
    periods: d.length === 120 ? ['regulation', 'extra'] : ['regulation'],
    sides: [emptySide(), emptySide()],
  };
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const incidents: Incident[] = d.incidents.map((x) => ({
    minute: x[0]!,
    side: x[1] as AggregateSide,
    kind: INCIDENT_KINDS[x[2]!]!,
    player: d.sides[x[1]!]!.lines[x[3]!]!.id,
    ...(x[4]! >= 0 && { other: d.sides[x[1]!]!.lines[x[4]!]!.id }),
    ...(x[5]! >= 0 && { reason: CARD_REASONS[x[5]!]! }),
  }));
  const stints = (side: number) =>
    d.stints
      .filter((s) => s[0] === side)
      .map((s) => ({ line: s[1]!, slot: s[2]!, from: s[3]!, to: s[4]! }));
  const participation: AggregateParticipation = {
    length: d.length,
    incidents,
    stints: [stints(0), stints(1)],
  };
  const groupIndexes = [new Map<number, number>(), new Map<number, number>()];
  d.events.forEach((e) => {
    const side = e[EV.side] as AggregateSide;
    const own = ledger.sides[side];
    let i = groupIndexes[side]!.get(e[EV.group]!);
    if (i === undefined) {
      i = own.moves.length;
      groupIndexes[side]!.set(e[EV.group]!, i);
      own.moves.push({
        period: period(e[EV.period]!),
        kind: EVENT_KINDS[e[EV.kind]!]!,
        from: e[EV.from]!,
        to: e[EV.to]!,
        attempts: 0,
        completed: 0,
        lineBreaking: 0,
        offside: 0,
        intercepted: 0,
        outTouch: 0,
        outByline: 0,
        cornersWon: 0,
        recovered: 0,
        ...(e[EV.setPiece]
          ? { setPiece: SET_PIECES[e[EV.setPiece]!] as AggregateMove['setPiece'] }
          : {}),
      });
      trace.moves[side].push(emptySplit(d.sides[side].lines.length));
    }
    const move = own.moves[i]!,
      split = trace.moves[side][i]!;
    move.attempts++;
    const actor = e[EV.actor]!,
      result = EVENT_RESULTS[e[EV.result]!]!,
      winner = e[EV.other]!;
    add(split.attempts, actor);
    if (result === 'complete') {
      move.completed++;
      add(split.completed, actor);
    }
    if (e[EV.lineBreaking]) {
      move.lineBreaking++;
      add(split.broke, actor);
    }
    if (result === 'offside') {
      move.offside++;
      add(split.offside, winner);
    }
    if (result === 'intercepted') {
      move.intercepted++;
      add(split.won, winner);
    }
    if (result === 'tackled') add(split.won, winner);
    if (result === 'outTouch') move.outTouch++;
    if (result === 'outByline' || result === 'cornerWon') move.outByline++;
    if (result === 'cornerWon') move.cornersWon++;
    if (result === 'looseRecovered') {
      move.recovered++;
      if (winner >= 0) add(split.recovered, winner);
    }
  });
  const credits: (AggregateShotCredit & { keeper: number })[] = [];
  d.shots.forEach((s) => {
    const side = s[SH.side] as AggregateSide,
      own = ledger.sides[side];
    const event = s[SH.source]! < 0 ? undefined : d.events[s[SH.source]!]!;
    const shot = own.shots.length;
    own.shots.push({
      period: s[SH.minute]! > 90 ? 'extra' : 'regulation',
      minute: s[SH.minute]!,
      cell: s[SH.cell]!,
      kind: SHOT_KINDS[s[SH.kind]!]!,
      header: s[SH.header] === 1,
      xg: s[SH.xg]!,
      outcome: SHOT_OUTCOMES[s[SH.outcome]!]!,
      corner: s[SH.corner] === 1,
      source: event ? groupIndexes[side]!.get(event[EV.group]!)! : -1,
    });
    credits.push({
      side,
      shot,
      minute: s[SH.minute]!,
      shooter: s[SH.shooter]!,
      keeper: s[SH.keeper]!,
      ...(s[SH.passer]! >= 0 && { passer: s[SH.passer]! }),
    });
  });
  for (const side of [0, 1] as const) {
    for (const f of d.fouls.filter((f) => f[FO.fouledSide] === side)) {
      ledger.sides[side].fouled.push({
        period: period(f[FO.period]!),
        cell: f[FO.cell]!,
        n: 1,
        penalties: f[FO.penalty]!,
      });
      // Counting does not need to pair the card again: each row contains exactly one foul.
      const fouled: number[] = [],
        fouler: number[] = [];
      add(fouled, f[FO.fouled]!);
      add(fouler, f[FO.fouler]!);
      trace.fouls[side].push({ booked: [], fouled, fouler });
    }
    for (const x of incidents.filter((x) => x.side === side)) {
      if (x.kind === 'yellow' || x.kind === 'secondYellow') ledger.sides[side].cards.yellow++;
      if (x.kind === 'red' || x.kind === 'secondYellow') ledger.sides[side].cards.red++;
      if (x.kind !== 'sub' && x.kind !== 'injury' && x.reason !== 'dissent')
        ledger.sides[side].cardFouls++;
    }
  }
  return { ledger, participation, trace, credits };
}

/** The record's own layouts, counted from the detail through the original ledger/credit definitions. */
export function recordOf(
  d: MatchDetail,
): Pick<
  MatchRecord,
  'score' | 'metrics' | 'detail' | 'players' | 'xg' | 'incidents' | 'regulation' | 'shootout'
> {
  const { ledger, participation, trace, credits } = rowsOf(d);
  const facts = deriveTeamFacts(ledger);
  const players = countPlayerFacts(ledger, participation, trace, credits, [
    d.sides[0].lines,
    d.sides[1].lines,
  ]);
  const shootout = { home: 0, away: 0 };
  for (const k of d.shootout) shootout[k[0] === 0 ? 'home' : 'away'] += k[2]!;
  return {
    score: { home: facts.score[0], away: facts.score[1] },
    metrics: [facts.sides[0].metrics, facts.sides[1].metrics],
    detail: [facts.sides[0].detail, facts.sides[1].detail],
    players: players.sides.flatMap((lines, side) =>
      lines.map((l) => ({
        id: d.sides[side]!.lines[l.line]!.id,
        metrics: l.metrics,
        detail: l.detail,
      })),
    ),
    xg: [facts.sides[0].xg / 100, facts.sides[1].xg / 100],
    incidents: [...participation.incidents],
    ...(facts.regulation && {
      regulation: { home: facts.regulation[0], away: facts.regulation[1] },
    }),
    ...(d.shootout.length > 0 && { shootout }),
  };
}

/** Structural checks, including every referenced line's recorded period and fixed-minute presence. */
export function detailIssues(d: MatchDetail): string[] {
  const out: string[] = [];
  const problem = (at: string, what: string) => out.push(`${at}: ${what}`);
  const sideOk = (s: number) => s === 0 || s === 1;
  const lineOk = (s: number, l: number) =>
    sideOk(s) && Number.isInteger(l) && l >= 0 && l < d.sides[s]!.lines.length;
  const inPeriod = (s: number, l: number, p: number) =>
    d.stints.some(
      (t) => t[0] === s && t[1] === l && t[3]! < (p === 0 ? 90 : 120) && t[4]! > (p === 0 ? 0 : 90),
    );
  const present = (s: number, l: number, m: number) =>
    d.stints.some((t) => t[0] === s && t[1] === l && t[3]! < m && t[4]! >= m);
  const line = (at: string, s: number, l: number, p: number, m?: number) => {
    if (!lineOk(s, l)) problem(at, `unknown line ${s}/${l}`);
    else if (!inPeriod(s, l, p) || (m !== undefined && !present(s, l, m)))
      problem(at, `line ${s}/${l} outside stint`);
  };
  const cell = (n: number) => Number.isInteger(n) && n >= 0 && n < 40;
  const code = (n: number, list: readonly unknown[]) =>
    Number.isInteger(n) && n >= 0 && n < list.length;
  const rows: [string, number[][], number][] = [
    ['stint', d.stints, 5],
    ['event', d.events, 11],
    ['shot', d.shots, 12],
    ['foul', d.fouls, 7],
    ['incident', d.incidents, 6],
    ['shootout', d.shootout, 3],
    ['penalty', d.penalties, 2],
  ];
  for (const [kind, list, width] of rows)
    list.forEach((r, i) => {
      if (r.length !== width || !r.every(Number.isSafeInteger))
        problem(`${kind} ${i}`, 'invalid integer row');
    });
  if (out.length) return out;
  if (d.version !== 1 || (d.length !== 90 && d.length !== 120))
    problem('detail', 'version or length');
  if (
    d.added.length !== (d.length === 120 ? 4 : 2) ||
    ![...d.added, ...d.score].every((n) => Number.isSafeInteger(n) && n >= 0)
  )
    problem('detail', 'invalid added time or score');
  for (const [i, s] of d.stints.entries()) {
    if (
      !lineOk(s[0]!, s[1]!) ||
      s[2]! < 0 ||
      s[2]! >= 11 ||
      s[3]! < 0 ||
      s[4]! > d.length ||
      s[3]! >= s[4]!
    )
      problem(`stint ${i}`, 'invalid bounds or line');
  }
  const groups = new Map<string, string>();
  d.events.forEach((e, i) => {
    const at = `event ${i}`,
      s = e[EV.side]!,
      p = e[EV.period]!;
    if (
      !code(e[EV.kind]!, EVENT_KINDS) ||
      !code(e[EV.setPiece]!, SET_PIECES) ||
      !code(e[EV.result]!, EVENT_RESULTS) ||
      !cell(e[EV.from]!) ||
      !cell(e[EV.to]!) ||
      (p !== 0 && p !== 1) ||
      (p === 1 && d.length !== 120) ||
      e[EV.group]! < 0 ||
      ![0, 1].includes(e[EV.lineBreaking]!)
    )
      problem(at, 'invalid codes, cells or group');
    line(at, s, e[EV.actor]!, p);
    const result = EVENT_RESULTS[e[EV.result]!];
    if (e[EV.other]! >= 0) line(at, result === 'offside' ? s : 1 - s, e[EV.other]!, p);
    else if (result === 'offside' || result === 'intercepted' || result === 'tackled')
      problem(at, 'missing receiver or winner');
    if (e[EV.lineBreaking] && result !== 'complete') problem(at, 'line break on failed move');
    const key = `${s}/${e[EV.group]}`,
      value = [e[EV.kind], e[EV.setPiece], e[EV.from], e[EV.to], p].join();
    if (groups.has(key) && groups.get(key) !== value) problem(at, 'inconsistent group');
    groups.set(key, value);
  });
  const sources = new Set<number>();
  d.shots.forEach((s, i) => {
    const at = `shot ${i}`,
      side = s[SH.side]!,
      minute = s[SH.minute]!,
      p = minute > 90 ? 1 : 0;
    if (
      !code(s[SH.kind]!, SHOT_KINDS) ||
      !code(s[SH.outcome]!, SHOT_OUTCOMES) ||
      !cell(s[SH.cell]!) ||
      minute < 1 ||
      minute > d.length ||
      ![0, 1].includes(s[SH.header]!) ||
      ![0, 1].includes(s[SH.corner]!)
    )
      problem(at, 'invalid shot');
    line(at, side, s[SH.shooter]!, p, minute);
    line(at, 1 - side, s[SH.keeper]!, p, minute);
    if (s[SH.passer]! >= 0) line(at, side, s[SH.passer]!, p, minute);
    if (s[SH.source]! >= 0) {
      const e = d.events[s[SH.source]!];
      if (
        !e ||
        e[EV.side] !== side ||
        e[EV.result] !== 0 ||
        e[EV.actor] !== (s[SH.passer]! >= 0 ? s[SH.passer] : s[SH.shooter]) ||
        e[EV.period] !== p ||
        e[EV.to] !== s[SH.cell] ||
        sources.has(s[SH.source]!)
      )
        problem(at, 'invalid completed source');
      if (e) {
        const pass = isPassKind(EVENT_KINDS[e[EV.kind]!]!);
        if (pass !== s[SH.passer]! >= 0 || (pass && s[SH.shooter] === s[SH.passer]))
          problem(at, 'invalid key passer');
      }
      sources.add(s[SH.source]!);
    } else if (s[SH.passer]! >= 0) problem(at, 'passer without source');
  });
  const cards = d.incidents
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x[2]! <= 2 && x[5] !== CARD_REASONS.indexOf('dissent'));
  const usedCards = new Set<number>();
  d.fouls.forEach((f, i) => {
    const at = `foul ${i}`,
      side = f[FO.fouledSide]!,
      p = f[FO.period]!,
      minute = f[FO.cardMinute]!;
    if (!cell(f[FO.cell]!) || ![0, 1].includes(f[FO.penalty]!) || ![0, 1].includes(p))
      problem(at, 'invalid foul');
    line(at, side, f[FO.fouled]!, p, minute >= 0 ? minute : undefined);
    if (minute < 0 || present(1 - side, f[FO.fouler]!, minute))
      line(at, 1 - side, f[FO.fouler]!, p);
    else if (
      !d.stints.some((t) => t[0] === 1 - side && t[1] === f[FO.fouler] && t[4] === minute - 1)
    )
      problem(at, 'fouler outside stint');
    if (minute >= 0) {
      const card = cards.find(
        ({ x, i }) =>
          !usedCards.has(i) && x[0] === minute && x[1] === 1 - side && x[3] === f[FO.fouler],
      );
      if (!card) problem(at, 'booked foul without card');
      else usedCards.add(card.i);
    }
  });
  for (const c of cards)
    if (!usedCards.has(c.i)) problem(`incident ${c.i}`, 'card without booked foul');
  let last = 0;
  d.incidents.forEach((x, i) => {
    const at = `incident ${i}`,
      m = x[0]!,
      s = x[1]!;
    if (
      m < last ||
      m < 1 ||
      m > d.length ||
      !code(x[2]!, INCIDENT_KINDS) ||
      (x[5] !== -1 && !code(x[5]!, CARD_REASONS))
    )
      problem(at, 'invalid timeline or code');
    last = m;
    // Departing players leave at minute-1; they are still the subject of that stamped incident.
    const atBoundary = (l: number) =>
      d.stints.some((t) => t[0] === s && t[1] === l && t[3]! <= m - 1 && t[4]! >= m - 1);
    const replacingInjury =
      x[2] === INCIDENT_KINDS.indexOf('sub') &&
      d.incidents.some(
        (y) =>
          y[1] === s && y[2] === INCIDENT_KINDS.indexOf('injury') && y[3] === x[3] && y[0]! <= m,
      );
    if (!lineOk(s, x[3]!)) problem(at, 'unknown incident line');
    else if (!atBoundary(x[3]!) && !replacingInjury) problem(at, 'incident outside stint');
    if (x[4] !== -1) {
      if (!lineOk(s, x[4]!)) problem(at, 'unknown substitute');
      else if (!atBoundary(x[4]!)) problem(at, 'substitute outside stint');
    }
  });
  const penaltyFouls = new Set<number>(),
    penaltyShots = new Set<number>();
  d.penalties.forEach(([f, s], i) => {
    const foul = d.fouls[f!],
      shot = d.shots[s!];
    if (
      !foul ||
      !shot ||
      foul[FO.penalty] !== 1 ||
      shot[SH.kind] !== SHOT_KINDS.indexOf('penalty') ||
      foul[FO.fouledSide] !== shot[SH.side] ||
      foul[FO.period] !== (shot[SH.minute]! > 90 ? 1 : 0) ||
      (foul[FO.cardMinute]! >= 0 && foul[FO.cardMinute] !== shot[SH.minute]) ||
      penaltyFouls.has(f!) ||
      penaltyShots.has(s!)
    )
      problem(`penalty ${i}`, 'invalid foul/shot link');
    penaltyFouls.add(f!);
    penaltyShots.add(s!);
  });
  d.fouls.forEach((f, i) => {
    if (f[FO.penalty] && !penaltyFouls.has(i)) problem(`foul ${i}`, 'missing penalty kick');
  });
  d.shots.forEach((s, i) => {
    if (s[SH.kind] === SHOT_KINDS.indexOf('penalty') && !penaltyShots.has(i))
      problem(`shot ${i}`, 'missing penalty foul');
  });
  d.shootout.forEach((k, i) => {
    line(`shootout ${i}`, k[0]!, k[1]!, 1, d.length);
    if (d.length !== 120 || ![0, 1].includes(k[2]!) || k[0] !== i % 2)
      problem(`shootout ${i}`, 'invalid kick order or outcome');
  });
  if (!out.length) {
    try {
      const { ledger, participation } = rowsOf(d);
      d.shots.forEach((s, i) => {
        if (s[SH.keeper] !== keeperLine(participation, s[SH.side] === 0 ? 1 : 0, s[SH.minute]!))
          problem(`shot ${i}`, 'keeper does not hold the slot');
      });
      out.push(...ledgerIssues(ledger));
      const r = recordOf(d);
      if (r.score.home !== d.score[0] || r.score.away !== d.score[1])
        problem('score', 'does not count back');
    } catch (error) {
      problem('detail', error instanceof Error ? error.message : String(error));
    }
  }
  return out;
}
