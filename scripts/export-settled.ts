/**
 * Settled matches for the match prototype (T819, ideation/match-script-and-staging): plays the core
 * sample's fixtures on the production aggregate path (as scripts/match-parity.ts builds them, each
 * side on 4-3-3 possession or 4-4-2 counter, the two formations the prototype stages), keeps the
 * first `--count` that the prototype can stage, and writes each as one data file listing every
 * attempt with who made it and how it ended, every shot, every foul and the record's rows. The
 * format is `scripts/match-proto/core/settled.ts`'s; this script writes the same shape without
 * importing it, so the prototype stays isolated.
 *
 *   pnpm exec tsx scripts/export-settled.ts --out <dir> [--count 10] [--year <y>]
 *
 * `--year` defaults to the latest year whose era rules name no substitute, so every match is played
 * by the same 22. A candidate is skipped, with a counted reason, when it went to extra time, has a
 * substitution, injury, red card or second yellow, has a penalty (a penalty shot or a foul row with
 * penalties), names a line outside the starting eleven, or holds an offside that only its own
 * passer was caught on with nobody to take it (`offsidePasser`, below).
 *
 * Who did what comes from `attributePlayerFacts` run again with an attribution trace, its facts
 * checked equal to the match's own before the trace is trusted. A move group becomes attempts by a
 * fixed rule, so the same match always gives the same file:
 * - the group's attempts line by line in ascending line index, each line's completed ones first;
 *   the first `broke[line]` completed ones of each line are line-breaking;
 * - the failed ones, in that listed order, take the results `offside` × offside, `intercepted` ×
 *   intercepted, `outTouch` × outTouch, `outByline` × (outByline − cornersWon), `cornerWon` ×
 *   cornersWon, `looseRecovered` × recovered, then `looseKept` for the rest; a failed attempt of a
 *   carry or take-on group is `tackled`;
 * - `other`: for `intercepted` and `tackled` the opponent's lines that won the ball in ascending
 *   order, one per attempt; for `offside` this side's lines caught offside in ascending order, and
 *   when that line is the attempt's own actor it swaps with the next offside attempt's (else an
 *   earlier one's that stays valid; when the group has no other, the first failed attempt of
 *   another man in the group takes the offside and gives this one its own fate; else the first
 *   offside attempt of the same side in another group that stays valid swaps lines with it — each
 *   keeping every player's counts as the record states them; when none exists the match is
 *   skipped as `offsidePasser`, since the lowest other outfield line would move an offside off
 *   the record's player);
 *   for `looseRecovered` the opponent's lines that recovered in its high-turnover zone in
 *   ascending order while they last, else none (−1).
 * A shot's source is the lowest unused id of a completed attempt of its source group made by its
 * credited passer (a carry or take-on source: by the shooter). Fouls are one entry each: the booked
 * ones with their card's minute, then the others pairing fouled and fouler lines in ascending order.
 * Identifiers and numbers only; no name is exported (→ARCH-32).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PD, TD } from '../packages/contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Fixture, Player, Tactic } from '../packages/contracts/src/types';
import type { AggregateMatch } from '../packages/engine/src/aggregate/engine';
import { isPassKind } from '../packages/engine/src/aggregate/ledger';
import { attributePlayerFacts } from '../packages/engine/src/aggregate/players';
import { aggregateStreams } from '../packages/engine/src/aggregate/team';
import {
  AGGREGATE_MOVE_KINDS,
  type AggregateAttributionTrace,
  type AggregateMove,
  type AggregateTraceMove,
} from '../packages/engine/src/aggregate/types';
import { M } from '../packages/engine/src/grid/record';
import { eraRules } from '../packages/engine/src/grid/setup';
import { FORMATIONS } from '../packages/engine/src/player';

/** The prototype's code lists (`scripts/match-proto/core/settled.ts`), copied, not imported. */
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
const R = Object.fromEntries(EVENT_RESULTS.map((r, i) => [r, i])) as Record<
  (typeof EVENT_RESULTS)[number],
  number
>;
const SET_PIECES = ['none', 'corner', 'freeKick'] as const;
const SHOT_KINDS = ['open', 'corner', 'freeKick'] as const;
const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
const ATTRS = [
  'passing',
  'vision',
  'finishing',
  'dribbling',
  'pace',
  'decisions',
  'positioning',
  'tackling',
  'heading',
  'composure',
] as const;

/** The two tactics the prototype stages and the formation, style and roles it knows them by. */
const STAGED: Partial<Record<Tactic, { formation: '4-3-3' | '4-4-2'; style: Tactic }>> = {
  possession: { formation: '4-3-3', style: 'possession' },
  counter: { formation: '4-4-2', style: 'counter' },
};
const TACTIC_PAIRS: readonly (readonly [Tactic, Tactic])[] = [
  ['possession', 'possession'],
  ['possession', 'counter'],
  ['counter', 'possession'],
  ['counter', 'counter'],
];
const PROTO_ROLES = new Set([
  'keeper',
  'sweeperKeeper',
  'centreBack',
  'ballPlayingDefender',
  'fullBack',
  'overlappingFullBack',
  'invertedFullBack',
  'anchor',
  'boxToBox',
  'mezzala',
  'ballWinner',
  'wideMidfielder',
  'traditionalWinger',
  'invertedWinger',
  'falseNine',
  'poacher',
  'targetMan',
]);
const ROLE_BY_POSITION: Record<string, string> = {
  GK: 'keeper',
  CB: 'centreBack',
  LB: 'fullBack',
  RB: 'fullBack',
  DM: 'anchor',
  CM: 'boxToBox',
  LM: 'wideMidfielder',
  RM: 'wideMidfielder',
  LW: 'traditionalWinger',
  RW: 'traditionalWinger',
  ST: 'targetMan',
};
/** A production role the prototype does not know, mapped by its slot's position. */
export function protoRole(position: string, role: string): string {
  if (PROTO_ROLES.has(role)) return role;
  const mapped = ROLE_BY_POSITION[position];
  if (!mapped) throw new Error(`no prototype role for ${position} ${role}`);
  return mapped;
}

/**
 * A ledger cell (`band * 5 + lane` in the acting side's attack frame: x from its own goal line, y
 * from its left touchline, engine grid/pitch.ts) in the prototype's numbering (match-proto
 * core/pitch.ts `cellOf`: `band * 5 + lane` of the attack frame where the side attacks toward
 * x = 105 and y = 0 is its own left touchline). Both frames put band 0 at the own goal line and
 * lane 0 on the own left with the same edges, so the cell keeps its number.
 */
export function protoCell(cell: number): number {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 40) throw new Error(`cell ${cell}`);
  const band = Math.floor(cell / 5),
    lane = cell % 5;
  return band * 5 + lane;
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
  if (out.length !== move.attempts) throw new Error(`group of ${move.attempts}: ${out.length}`);
  if (failed.length !== move.attempts - move.completed) throw new Error('completions differ');
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
    let at = 0;
    for (const [result, k] of fates)
      for (let j = 0; j < k; j++) {
        const a = failed[at++];
        if (!a) throw new Error(`more fates than failed attempts in a ${move.kind} group`);
        a.result = result;
      }
  } else for (const a of failed) a.result = R.tackled;
  const won = spread(t.won);
  const winners = out.filter((a) => a.result === R.intercepted || a.result === R.tackled);
  if (won.length !== winners.length) throw new Error(`${won.length} won, ${winners.length} lost`);
  winners.forEach((a, i) => (a.other = won[i]!));
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
export function swapOffsides(events: number[][], offside: number): number {
  let fallbacks = 0;
  for (const e of events) {
    if (e[7] !== offside || e[9] !== e[6]) continue;
    const swap = events.find(
      (g) => g !== e && g[7] === offside && g[0] === e[0] && g[9] !== e[6] && g[6] !== e[9],
    );
    if (swap) [e[9], swap[9]] = [swap[9]!, e[9]!];
    else {
      e[9] = e[0]! * 11 + (e[6] === e[0]! * 11 + 1 ? 2 : 1);
      fallbacks++;
    }
  }
  return fallbacks;
}

/** A candidate the export finds it cannot stage after all, with its counted reason. */
export class SkipMatch extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** The latest year whose era rules name no substitute, so the same 22 play throughout. */
export function noSubstituteYear(from = 2030): number {
  for (let year = from; year > 1900; year--) if (eraRules(year).named === 0) return year;
  throw new Error('every year names substitutes');
}

/** Why a candidate cannot be staged, or undefined when it can. */
export function skipReason(match: AggregateMatch): string | undefined {
  const { facts, participation, players } = match;
  if (facts.length !== 90 || facts.ledger.periods.includes('extra')) return 'extraTime';
  for (const x of participation.incidents)
    if (x.kind === 'sub' || x.kind === 'injury' || x.kind === 'red' || x.kind === 'secondYellow')
      return `incident:${x.kind}`;
  for (const side of facts.ledger.sides)
    if (side.shots.some((s) => s.kind === 'penalty') || side.fouled.some((f) => f.penalties > 0))
      return 'penalty';
  if (players.sides.some((lines) => lines.some((l) => l.line >= 11))) return 'bench';
  return undefined;
}

const PLAYER_ROW: readonly (readonly ['M' | 'PD', number])[] = [
  ['M', M.goals],
  ['M', M.assists],
  ['M', M.shots],
  ['M', M.onTarget],
  ['M', M.passes],
  ['M', M.completed],
  ['M', M.tackles],
  ['M', M.interceptions],
  ['PD', PD.takeOns],
  ['PD', PD.offsides],
  ['PD', PD.fouls],
  ['PD', PD.foulsWon],
  ['PD', PD.yellowCards],
  ['M', M.saves],
];
const TEAM_ROW: readonly (readonly ['M' | 'TD', number])[] = [
  ['M', M.goals],
  ['M', M.shots],
  ['M', M.onTarget],
  ['M', M.passes],
  ['M', M.completed],
  ['TD', TD.corners],
  ['TD', TD.offsides],
  ['TD', TD.throwIns],
  ['TD', TD.goalKicks],
  ['TD', TD.freeKicks],
  ['TD', TD.fouls],
];

/** One settled match in the prototype's file shape (`Settled`, version 1). */
export function settledFile(
  id: string,
  seed: string,
  f: Fixture,
  match: AggregateMatch,
  rosters: readonly [readonly Player[], readonly Player[]],
  added: readonly number[],
) {
  const { input, plan, participation, facts } = match;
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const again = attributePlayerFacts(
    input,
    plan,
    participation,
    facts,
    aggregateStreams(seed, match.retry === 0 ? f.id : `${f.id}:retry${match.retry}`),
    trace,
  );
  if (!isDeepStrictEqual(again, match.players)) throw new Error(`${f.id}: trace run differs`);
  // Each starter's slot, from the stints (no substitute plays, so one stint each).
  const slotOf = ([0, 1] as const).map((side) => {
    const bySlot = new Map<number, number>();
    for (const s of participation.stints[side]) bySlot.set(s.line, s.slot);
    return bySlot;
  });
  const index = (side: number, line: number) => {
    if (line < 0) return -1;
    const slot = slotOf[side]!.get(line);
    if (slot === undefined) throw new Error(`side ${side} line ${line} has no slot`);
    return side * 11 + slot;
  };
  const lineOfId = (side: 0 | 1, id: string) => {
    const line = input.sides[side].lines.findIndex((l) => l.id === id);
    if (line < 0) throw new Error(`no line for ${id}`);
    return line;
  };
  const events: number[][] = [];
  /** Per side and group, each completed event id by the actor's line. */
  const completedIds: Map<number, number[]>[][] = [[], []];
  for (const side of [0, 1] as const) {
    const ledger = facts.ledger.sides[side];
    ledger.moves.forEach((move, group) => {
      const byActor = new Map<number, number[]>();
      completedIds[side][group] = byActor;
      for (const a of expandGroup(move, trace.moves[side][group]!)) {
        if (a.result === R.complete)
          byActor.set(a.actor, [...(byActor.get(a.actor) ?? []), events.length]);
        const otherSide = a.result === R.offside ? side : 1 - side;
        events.push([
          side,
          group,
          AGGREGATE_MOVE_KINDS.indexOf(move.kind),
          SET_PIECES.indexOf(move.setPiece ?? 'none'),
          protoCell(move.from),
          protoCell(move.to),
          index(side, a.actor),
          a.result,
          a.lineBreaking,
          index(otherSide, a.other),
        ]);
      }
    });
  }
  // An offside only its own passer was caught on, with no other man to take it in its group or
  // side, would move an offside off the record's player: such a match is not exported.
  if (swapOffsides(events, R.offside) > 0) throw new SkipMatch('offsidePasser');
  const shots: number[][] = [];
  for (const side of [0, 1] as const) {
    const ledger = facts.ledger.sides[side];
    const used = new Set<number>();
    ledger.shots.forEach((shot, i) => {
      const credit = match.players.shots.find((c) => c.side === side && c.shot === i);
      if (!credit) throw new Error(`side ${side} shot ${i} has no credit`);
      let source = -1;
      if (shot.source >= 0) {
        const actor = credit.passer ?? credit.shooter;
        const ids = completedIds[side][shot.source]!.get(actor) ?? [];
        source = ids.find((id) => !used.has(id)) ?? -1;
        if (source < 0) throw new Error(`side ${side} shot ${i}: no completion of its source`);
        used.add(source);
      }
      const kind = SHOT_KINDS.indexOf(shot.kind as (typeof SHOT_KINDS)[number]);
      if (kind < 0) throw new Error(`shot kind ${shot.kind}`);
      shots.push([
        side,
        shot.minute,
        protoCell(shot.cell),
        kind,
        shot.header ? 1 : 0,
        shot.xg,
        SHOT_OUTCOMES.indexOf(shot.outcome),
        shot.corner ? 1 : 0,
        index(side, credit.shooter),
        credit.passer === undefined ? -1 : index(side, credit.passer),
        source,
        (1 - side) * 11,
      ]);
    });
  }
  const fouls: number[][] = [];
  for (const side of [0, 1] as const) {
    facts.ledger.sides[side].fouled.forEach((row, i) => {
      const t = trace.fouls[side][i]!;
      for (const b of t.booked)
        fouls.push([
          side,
          protoCell(row.cell),
          index(1 - side, b.fouler),
          index(side, b.fouled),
          participation.incidents[b.incident]!.minute,
        ]);
      const fouled = spread(t.fouled),
        fouler = spread(t.fouler);
      if (fouled.length !== fouler.length || fouled.length + t.booked.length !== row.n)
        throw new Error(`side ${side} foul row ${i} does not add up`);
      fouled.forEach((line, j) =>
        fouls.push([side, protoCell(row.cell), index(1 - side, fouler[j]!), index(side, line), -1]),
      );
    });
  }
  const cards = participation.incidents
    .filter((x) => x.kind === 'yellow')
    .map((x) => [x.minute, x.side, index(x.side, lineOfId(x.side, x.player))]);
  const players: number[][] = Array.from({ length: 22 }, () => Array<number>(14).fill(0));
  for (const side of [0, 1] as const)
    for (const l of match.players.sides[side])
      players[index(side, l.line)] = PLAYER_ROW.map(([row, at]) =>
        row === 'M' ? l.metrics[at]! : l.detail[at]!,
      );
  const team = ([0, 1] as const).map((side) =>
    TEAM_ROW.map(([row, at]) =>
      row === 'M' ? facts.sides[side].metrics[at]! : facts.sides[side].detail[at]!,
    ),
  ) as [number[], number[]];
  const sides = ([0, 1] as const).map((side) => {
    const tactic = input.sides[side].tactic;
    const staged = STAGED[tactic];
    if (!staged) throw new Error(`tactic ${tactic} is not staged`);
    const slots = FORMATIONS[tactic].slots;
    const bySlot = [...slotOf[side].entries()].sort((a, b) => a[1] - b[1]);
    if (bySlot.length !== 11) throw new Error(`side ${side} fields ${bySlot.length}`);
    return {
      formation: staged.formation,
      style: staged.style,
      players: bySlot.map(([line, slot]) => {
        const id = input.sides[side].lines[line]!.id;
        const player = rosters[side].find((p) => p.id === id);
        if (!player) throw new Error(`no player ${id}`);
        const s = slots[slot]!;
        return {
          position: s.position,
          role: protoRole(s.position, s.role),
          number: slot + 1,
          attrs: ATTRS.map((key) => Math.round(player.attrs[key])),
        };
      }),
    };
  });
  return {
    version: 1,
    id,
    source: {
      seed,
      fixture: f.id,
      year: f.year,
      revision: Number(/(\d+)$/.exec(MATCH_MODEL_REVISION)?.[1] ?? NaN),
    },
    sides,
    score: [...facts.score],
    added: [added[0] ?? 0, added[1] ?? 0],
    events,
    shots,
    fouls,
    cards,
    record: { team, players },
  };
}

async function main(args: readonly string[]) {
  const arg = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const out = arg('--out');
  if (!out) throw new Error('usage: export-settled.ts --out <dir> [--count 10] [--year <y>]');
  const count = Number(arg('--count') ?? 10),
    year = Number(arg('--year') ?? noSubstituteYear());
  // Heavy measurement modules only for the CLI, so the unit tests load the pure functions alone.
  const { aggregateRun, conditionedMatch } = await import('./match-parity');
  const { coreFixturePairs } = await import('./grid-bands');
  const pairs = coreFixturePairs();
  const skipped = new Map<string, number>();
  mkdirSync(out, { recursive: true });
  let kept = 0;
  for (let i = 0; kept < count; i++) {
    if (i >= 400) throw new Error(`only ${kept} of ${count} kept after 400 candidates`);
    const { w, home, away } = pairs[i % pairs.length]!;
    const tactics = TACTIC_PAIRS[i % 4]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      year,
      round: 1,
      kind: 'league',
      id: `settled:${i}`,
      home: home.id,
      away: away.id,
    };
    const { match, sample } = aggregateRun(w, f, 'settled', undefined, { tactics });
    const reason = skipReason(match);
    if (reason) {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      continue;
    }
    const { rosters } = conditionedMatch(w, f, { tactics });
    const id = `s${String(kept + 1).padStart(2, '0')}`;
    let file: ReturnType<typeof settledFile>;
    try {
      file = settledFile(id, w.seed, f, match, rosters, sample.record.added ?? []);
    } catch (error) {
      if (!(error instanceof SkipMatch)) throw error;
      skipped.set(error.reason, (skipped.get(error.reason) ?? 0) + 1);
      continue;
    }
    kept++;
    const text = JSON.stringify(file) + '\n';
    writeFileSync(join(out, `${id}.json`), text);
    console.log(
      [
        id,
        f.id,
        file.score.join('-'),
        file.events.length,
        file.shots.length,
        file.fouls.length,
        Buffer.byteLength(text),
      ].join(' '),
    );
  }
  console.log(
    `year ${year}; skipped ${[...skipped].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
  );
}

if (process.argv[1]?.endsWith('scripts/export-settled.ts')) await main(process.argv.slice(2));
