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
 * checked equal to the match's own before the trace is trusted. The rows are the engine's detail of
 * the match (packages/engine/src/script/build.ts `matchDetail`, T825, whose header states the fixed
 * rule a move group becomes attempts by), mapped to the prototype's player indexes and cells
 * (`protoRows`), so the same match always gives the same file. A match whose revision-10 offside
 * could only move off the record's player is skipped as `offsidePasser`.
 * Identifiers and numbers only; no name is exported (→ARCH-32).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PD, TD } from '../packages/contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type { Fixture, Player, Tactic } from '../packages/contracts/src/types';
import type { AggregateMatch } from '../packages/engine/src/aggregate/engine';
import { attributePlayerFacts } from '../packages/engine/src/aggregate/players';
import { aggregateStreams } from '../packages/engine/src/aggregate/team';
import type { AggregateAttributionTrace } from '../packages/engine/src/aggregate/types';
import { M } from '../packages/engine/src/grid/record';
import { eraRules } from '../packages/engine/src/grid/setup';
import { FORMATIONS } from '../packages/engine/src/player';
import { matchDetail, type DetailNotes } from '../packages/engine/src/script/build';
import {
  EV,
  FO,
  IN,
  INCIDENT_KINDS,
  SH,
  type MatchDetail,
} from '../packages/engine/src/script/detail';

/**
 * The prototype's code lists (`scripts/match-proto/core/settled.ts`), copied, not imported; the
 * engine's detail numbers its rows by the same lists (its shot kinds add `penalty` last, which the
 * prototype never receives).
 */
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
export const SET_PIECES = ['none', 'corner', 'freeKick'] as const;
export const SHOT_KINDS = ['open', 'corner', 'freeKick'] as const;
export const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
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

/**
 * A detail's event, shot, foul and card rows in the file's shape: each line as the prototype's
 * player index (`side * 11 + slot`), cells by `protoCell`, the event's period, the shot's foul and
 * the foul's penalty, kick, period and card columns dropped, and yellow cards as `[minute, side,
 * player]`. Every match exported fields its starters alone, so a line's slot is his only one.
 */
export function protoRows(detail: MatchDetail) {
  const player = (side: number, line: number) =>
    line < 0 ? -1 : side * 11 + detail.sides[side as 0 | 1].lines[line]!.slot;
  const events = detail.events.map((e) => {
    const otherSide =
      e[EV.result] === EVENT_RESULTS.indexOf('offside') ? e[EV.side]! : 1 - e[EV.side]!;
    return [
      e[EV.side]!,
      e[EV.group]!,
      e[EV.kind]!,
      e[EV.setPiece]!,
      protoCell(e[EV.from]!),
      protoCell(e[EV.to]!),
      player(e[EV.side]!, e[EV.actor]!),
      e[EV.result]!,
      e[EV.lineBreaking]!,
      player(otherSide, e[EV.other]!),
    ];
  });
  const shots = detail.shots.map((s) => {
    if (s[SH.kind]! >= SHOT_KINDS.length) throw new Error(`shot kind ${s[SH.kind]}`);
    return [
      s[SH.side]!,
      s[SH.minute]!,
      protoCell(s[SH.cell]!),
      s[SH.kind]!,
      s[SH.header]!,
      s[SH.xg]!,
      s[SH.outcome]!,
      s[SH.corner]!,
      player(s[SH.side]!, s[SH.shooter]!),
      player(s[SH.side]!, s[SH.passer]!),
      s[SH.source]!,
      player(1 - s[SH.side]!, s[SH.keeper]!),
    ];
  });
  const fouls = detail.fouls.map((f) => [
    f[FO.fouledSide]!,
    protoCell(f[FO.cell]!),
    player(1 - f[FO.fouledSide]!, f[FO.fouler]!),
    player(f[FO.fouledSide]!, f[FO.fouled]!),
    f[FO.cardMinute]!,
  ]);
  const cards = detail.incidents
    .filter((x) => x[IN.kind] === INCIDENT_KINDS.indexOf('yellow'))
    .map((x) => [x[IN.minute]!, x[IN.side]!, player(x[IN.side]!, x[IN.line]!)]);
  return { events, shots, fouls, cards };
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
  // The rows are the engine's detail of the match (script/build.ts `matchDetail`, T825). An offside
  // only its own passer was caught on, with no other man to take it in its group or side, would
  // move an offside off the record's player: such a match is not exported.
  const notes: DetailNotes = { offsideFallbacks: 0 };
  const detail = matchDetail(match, rosters, trace, notes);
  if (notes.offsideFallbacks > 0) throw new SkipMatch('offsidePasser');
  const { events, shots, fouls, cards } = protoRows(detail);
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

/** One exported match: its file, the text written and what it was built from. */
export interface SettledExport {
  id: string;
  f: Fixture;
  match: AggregateMatch;
  rosters: [Player[], Player[]];
  file: ReturnType<typeof settledFile>;
  text: string;
}

/**
 * The first `count` candidates the prototype can stage, in the export's fixed order, with each
 * skipped candidate's reason counted.
 */
export async function settledExports(count: number, year = noSubstituteYear()) {
  // Heavy measurement modules only when exporting, so the unit tests load the pure functions alone.
  const { aggregateRun, conditionedMatch } = await import('./match-parity');
  const { coreFixturePairs } = await import('./grid-bands');
  const pairs = coreFixturePairs();
  const skipped = new Map<string, number>();
  const kept: SettledExport[] = [];
  for (let i = 0; kept.length < count; i++) {
    if (i >= 400) throw new Error(`only ${kept.length} of ${count} kept after 400 candidates`);
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
    const id = `s${String(kept.length + 1).padStart(2, '0')}`;
    let file: ReturnType<typeof settledFile>;
    try {
      file = settledFile(id, w.seed, f, match, rosters, sample.record.added ?? []);
    } catch (error) {
      if (!(error instanceof SkipMatch)) throw error;
      skipped.set(error.reason, (skipped.get(error.reason) ?? 0) + 1);
      continue;
    }
    kept.push({ id, f, match, rosters, file, text: JSON.stringify(file) + '\n' });
  }
  return { kept, skipped };
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
  const { kept, skipped } = await settledExports(count, year);
  mkdirSync(out, { recursive: true });
  for (const { id, f, file, text } of kept) {
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
