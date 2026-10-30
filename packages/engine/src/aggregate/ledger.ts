/**
 * The aggregate ledger's checks and derivations (→MATCH-13, MATCH-26, MATCH-27): every team
 * counter is read off the same grouped flows, shots and fouls under the detailed engine's
 * definitions (grid/record.ts `Tally`), and a ledger that does not hold together is refused —
 * nothing is zero-filled or clamped until it fits.
 */
import { TD, TEAM_DETAIL_SIZE } from '../../../contracts/src/detail';
import { CELL_BASELINES } from '../grid/baselines';
import { cellBand, cellLane } from '../grid/pitch';
import {
  COUNTER_ZONES,
  inBoxCell,
  isCutBack,
  M,
  mirrorBand,
  possessionShare,
} from '../grid/record';
import { zeroMetrics } from '../primitives';
import { AGGREGATE_CONFIG } from './config';
import {
  type AggregateLedger,
  type AggregateMove,
  type AggregateMoveKind,
  type AggregateSide,
  type AggregateSideFacts,
  type AggregateTeamFacts,
} from './types';

const CELLS = 40;
const BIG_CHANCE = 30;

/**
 * Whether a kind is one of `AGGREGATE_PASS_KINDS`: compared one by one, the same answer as the
 * list's `includes` for any value, without a call into it on every group (T612).
 */
export const isPassKind = (kind: AggregateMoveKind) =>
  kind === 'short' ||
  kind === 'long' ||
  kind === 'through' ||
  kind === 'cross' ||
  kind === 'cutBack';
/**
 * A kind's index in `AGGREGATE_MOVE_KINDS`, −1 for none: compared one by one, the same answer as
 * the list's `indexOf` for any value (T612).
 */
export const moveKindIndex = (kind: AggregateMoveKind): number =>
  kind === 'short'
    ? 0
    : kind === 'long'
      ? 1
      : kind === 'through'
        ? 2
        : kind === 'cross'
          ? 3
          : kind === 'cutBack'
            ? 4
            : kind === 'carry'
              ? 5
              : kind === 'takeOn'
                ? 6
                : -1;
export { inBoxCell };
export const inGoalAreaCell = (cell: number) => cellBand(cell) === 7 && cellLane(cell) === 2;
/** Every pair of cells' expected-threat gain, in thousandths, worked out once (T612). */
const XT_GAIN: readonly number[] = Array.from({ length: CELLS * CELLS }, (_, at) =>
  Math.round(
    Math.max(0, CELL_BASELINES[at % CELLS]!.xT - CELL_BASELINES[Math.floor(at / CELLS)]!.xT) * 1000,
  ),
);
/** Expected-threat gain of a completed move between two cells, in thousandths. */
export const xtGain = (from: number, to: number) => XT_GAIN[from * CELLS + to]!;
/** Where the kernel's pull-back flow (the `cutBack` kind) starts: the byline areas off centre. */
const pullBackFrom = (cell: number) => cellBand(cell) >= 6 && cellLane(cell) !== 2;
/**
 * Of a pass group's failed attempts, the loose balls its opponent recovered in open play (MATCH-13
 * high turnovers; credited to no tackle or interception): the generator draws who won each one
 * that was neither offside, intercepted nor out of play (team.ts `looseBallsWon`, T323). A carry
 * or take-on is never loose: its failures are tackles.
 */
export const looseBalls = (m: AggregateMove) => (isPassKind(m.kind) ? m.recovered : 0);
/** Kinds that always go forward; a short pass may go any way. */
const isForwardKind = (kind: AggregateMoveKind) => kind === 'long' || kind === 'through';

const sides = [0, 1] as const;
const other = (side: AggregateSide): AggregateSide => (side === 0 ? 1 : 0);
const count = (n: number) => Number.isSafeInteger(n) && n >= 0;

/**
 * Every way a ledger fails to hold together, empty when it does: integer counts, groups whose
 * outcomes stay within their attempts, kinds where MATCH-13 defines them, shots that follow a
 * completed arrival into their own cell, penalties that follow fouls in the box, corners that are
 * each delivered once and fouls at least as many as the cards shown for one.
 */
export function ledgerIssues(ledger: AggregateLedger): string[] {
  const out: string[] = [];
  if (ledger.length !== 90 && ledger.length !== 120) out.push(`match length ${ledger.length}`);
  const expected = ledger.length === 120 ? ['regulation', 'extra'] : ['regulation'];
  if (ledger.periods.join() !== expected.join())
    out.push(`periods ${ledger.periods.join()} for ${ledger.length} minutes`);
  for (const side of sides) {
    const own = ledger.sides[side],
      opp = ledger.sides[other(side)];
    const who = `side ${side}`;
    if (own.held.length !== ledger.periods.length || !own.held.every((s) => s >= 0))
      out.push(`${who} possession seconds ${own.held}`);
    for (let i = 0; i < own.moves.length; i++) moveIssues(out, who, i, own.moves[i]!, ledger);
    const arrivals = own.moves.map(() => 0);
    let penalties = 0,
      directFreeKicks = 0;
    own.shots.forEach((s, i) => {
      const at = `${who} shot ${i}`;
      if (!ledger.periods.includes(s.period)) out.push(`${at} in period ${s.period}`);
      const [from, to] = s.period === 'regulation' ? [1, 90] : [91, 120];
      if (!(Number.isInteger(s.minute) && s.minute >= from && s.minute <= to))
        out.push(`${at} at minute ${s.minute} outside ${s.period}`);
      if (!(Number.isInteger(s.cell) && s.cell >= 0 && s.cell < CELLS)) out.push(`${at} cell`);
      const { min, max } = AGGREGATE_CONFIG.xg;
      if (!(Number.isInteger(s.xg) && s.xg >= min && s.xg <= max)) out.push(`${at} xG ${s.xg}`);
      if (s.xg > AGGREGATE_CONFIG.xg.outsideMax && !inBoxCell(s.cell))
        out.push(`${at} big chance outside the box`);
      if (s.corner && s.outcome !== 'block' && s.outcome !== 'save')
        out.push(`${at} wins a corner from a ${s.outcome}`);
      if (s.kind === 'penalty') {
        penalties++;
        if (s.source !== -1 || s.xg !== AGGREGATE_CONFIG.penalty.xg) out.push(`${at} penalty`);
        return;
      }
      if (s.source === -1) {
        if (s.kind === 'freeKick') directFreeKicks++;
        else out.push(`${at} ${s.kind} shot without the move it follows`);
        return;
      }
      const source = own.moves[s.source];
      if (!source) return void out.push(`${at} follows missing move ${s.source}`);
      arrivals[s.source]!++;
      if (source.to !== s.cell) out.push(`${at} in cell ${s.cell}, its move ended in ${source.to}`);
      if (source.period !== s.period) out.push(`${at} follows a move of another period`);
      const expectedKind = source.setPiece ?? 'open';
      if (s.kind !== expectedKind) out.push(`${at} ${s.kind} after a ${expectedKind} move`);
    });
    // Each completed arrival is at most one chance.
    arrivals.forEach((n, i) => {
      if (n > own.moves[i]!.completed)
        out.push(`${who} move ${i}: ${n} shots from ${own.moves[i]!.completed} arrivals`);
    });
    let awarded = 0,
      fouls = 0;
    for (const f of own.fouled) {
      if (!count(f.n) || !count(f.penalties)) out.push(`${who} fouls ${f.n}/${f.penalties}`);
      if (!(Number.isInteger(f.cell) && f.cell >= 0 && f.cell < CELLS))
        out.push(`${who} foul cell`);
      if (f.penalties !== (inBoxCell(f.cell) ? f.n : 0))
        out.push(`${who} ${f.penalties} penalties from ${f.n} fouls in cell ${f.cell}`);
      awarded += f.penalties;
      fouls += f.n;
    }
    if (penalties !== awarded) out.push(`${who} took ${penalties} of ${awarded} penalties`);
    if (fouls < opp.cardFouls)
      out.push(`side ${other(side)} fouls ${fouls} < cards for fouls ${opp.cardFouls}`);
    const { yellow, red } = own.cards;
    if (!count(yellow) || !count(red) || !count(own.cardFouls) || own.cardFouls > yellow + red)
      out.push(`${who} cards ${yellow}/${red} for ${own.cardFouls} fouls`);
    const corners = cornersOf(ledger, side);
    const delivered = sum(own.moves, (m) => (m.setPiece === 'corner' ? m.attempts : 0));
    if (delivered !== corners) out.push(`${who} delivered ${delivered} of ${corners} corners`);
    const freeKicks = freeKicksOf(ledger, side);
    const taken =
      sum(own.moves, (m) => (m.setPiece === 'freeKick' ? m.attempts : 0)) + directFreeKicks;
    if (taken > freeKicks) out.push(`${who} took ${taken} of ${freeKicks} free kicks`);
  }
  return out;
}

const issue = (out: string[], who: string, i: number, text: string) =>
  out.push(`${who} move ${i}${text}`);
/**
 * A move group's issues, each labelled `<side> move <i>`. The label is built only for an issue:
 * every group of every fixture passes through here (T285).
 */
function moveIssues(
  out: string[],
  who: string,
  i: number,
  m: AggregateMove,
  ledger: AggregateLedger,
) {
  if (moveKindIndex(m.kind) < 0) issue(out, who, i, ' kind');
  if (!ledger.periods.includes(m.period)) issue(out, who, i, ` in period ${m.period}`);
  if (!(Number.isInteger(m.from) && m.from >= 0 && m.from < CELLS))
    issue(out, who, i, ` cell ${m.from}`);
  if (!(Number.isInteger(m.to) && m.to >= 0 && m.to < CELLS)) issue(out, who, i, ` cell ${m.to}`);
  if (!(
    count(m.attempts) &&
    count(m.completed) &&
    count(m.lineBreaking) &&
    count(m.offside) &&
    count(m.intercepted) &&
    count(m.outTouch) &&
    count(m.outByline) &&
    count(m.cornersWon) &&
    count(m.recovered)
  )) {
    const counts = [
      m.attempts,
      m.completed,
      m.lineBreaking,
      m.offside,
      m.intercepted,
      m.outTouch,
      m.outByline,
      m.cornersWon,
      m.recovered,
    ];
    return void issue(out, who, i, ` counts ${counts}`);
  }
  if (m.completed > m.attempts) issue(out, who, i, `: ${m.completed} completed of ${m.attempts}`);
  const failed = m.attempts - m.completed;
  const pass = isPassKind(m.kind);
  const fates = m.offside + m.intercepted + m.outTouch + m.outByline;
  if (pass && fates + m.recovered > failed)
    issue(out, who, i, `: ${fates + m.recovered} failed outcomes of ${failed} failed`);
  if (!pass && fates + m.lineBreaking + m.cornersWon + m.recovered > 0)
    issue(out, who, i, ': pass outcomes');
  if (m.cornersWon > m.outByline) issue(out, who, i, `: ${m.cornersWon} corners of ${m.outByline}`);
  const fromBand = cellBand(m.from),
    toBand = cellBand(m.to);
  // A line-breaking pass (MATCH-13) is a completed pass of any kind played beyond an opponent
  // line, so it ends upfield of where it started; only a pass played forward can be offside.
  const upfield = pass && toBand > fromBand;
  const ahead = (isForwardKind(m.kind) || m.kind === 'short') && toBand > fromBand;
  if (m.lineBreaking > m.completed || (m.lineBreaking && !upfield))
    issue(out, who, i, `: ${m.lineBreaking} line-breaking ${m.kind} of ${m.completed}`);
  if (m.offside && !ahead) issue(out, who, i, `: offside ${m.kind} not played forward`);
  if (isForwardKind(m.kind) && toBand <= fromBand) issue(out, who, i, `: ${m.kind} not forward`);
  if (m.kind === 'cross' && !inBoxCell(m.to)) issue(out, who, i, ': cross outside the box');
  // The kernel's pull-back flow (team.ts): from the byline areas into the box, never upfield.
  // MATCH-13's cut-back counter reads the cells instead (`isCutBack`), whatever the kind.
  if (m.kind === 'cutBack' && !(pullBackFrom(m.from) && inBoxCell(m.to) && toBand <= fromBand))
    issue(out, who, i, `: cut-back ${m.from}→${m.to}`);
  if (m.setPiece && m.kind !== 'cross')
    issue(out, who, i, `: ${m.setPiece} delivered as ${m.kind}`);
  if ((m.kind === 'carry' || m.kind === 'takeOn') && toBand < fromBand)
    issue(out, who, i, `: ${m.kind} backwards`);
}

function sum<T>(items: readonly T[], value: (item: T) => number) {
  let n = 0;
  for (const item of items) n += value(item);
  return n;
}
/** Corners a side won: deflected blocks and saves, and byline outs of its passes. */
function cornersOf(ledger: AggregateLedger, side: AggregateSide) {
  const own = ledger.sides[side];
  return own.shots.filter((s) => s.corner).length + sum(own.moves, (m) => m.cornersWon);
}
/** Free kicks a side takes: the opponent's fouls outside its box and its offsides. */
function freeKicksOf(ledger: AggregateLedger, side: AggregateSide) {
  const own = ledger.sides[side],
    opp = ledger.sides[other(side)];
  return sum(own.fouled, (f) => f.n - f.penalties) + sum(opp.moves, (m) => m.offside);
}

/**
 * One side's team rows read off the ledger under MATCH-13's definitions; the minutes slot holds
 * the match length. Possession needs both sides' passes (`deriveTeamFacts`).
 */
function sideCounters(ledger: AggregateLedger, side: AggregateSide): AggregateSideFacts {
  const own = ledger.sides[side],
    opp = ledger.sides[other(side)];
  const m = zeroMetrics(),
    t = Array<number>(TEAM_DETAIL_SIZE).fill(0);
  let xg = 0;
  for (const move of own.moves) {
    const fromBand = cellBand(move.from),
      toBand = cellBand(move.to),
      done = move.completed;
    if (isPassKind(move.kind)) {
      m[M.passes] += move.attempts;
      m[M.completed] += done;
      if (fromBand >= COUNTER_ZONES.finalThird) {
        t[TD.finalThirdPasses] += move.attempts;
        t[TD.finalThirdCompleted] += done;
      } else t[TD.buildUpPasses] += move.attempts;
      if (toBand > fromBand) t[TD.progressivePasses] += done;
      t[TD.lineBreakingPasses] += move.lineBreaking;
      t[TD.offsides] += move.offside;
      if (move.kind === 'cross') {
        t[TD.crosses] += move.attempts;
        t[TD.crossesCompleted] += done;
      }
      if (move.kind === 'through') {
        t[TD.throughBalls] += move.attempts;
        t[TD.throughBallsCompleted] += done;
      }
      if (isCutBack(move.from, move.to)) t[TD.cutBacks] += done;
    } else {
      if (toBand > fromBand) t[TD.progressiveCarries] += done;
      if (move.kind === 'takeOn') {
        t[TD.takeOns] += move.attempts;
        m[M.dribbles] += done;
      }
    }
    if (inBoxCell(move.to) && !inBoxCell(move.from)) t[TD.boxEntries] += done;
    if (toBand === COUNTER_ZONES.finalThird && fromBand < COUNTER_ZONES.finalThird)
      t[TD.frontOfBoxEntries] += done;
    t[TD.xtAdded] += done * xtGain(move.from, move.to);
  }
  // What this side did against the opponent's moves, read in this side's frame (MATCH-13's
  // zones): tackles on its carries and take-ons and challenges lost to its won take-ons where they
  // started; interceptions of its passes and the loose balls this side recovered where they were
  // played to. Every ball won in open play starts a sequence (high turnovers); tackles,
  // interceptions and challenges are defensive actions of PPDA, as are fouls (below).
  for (const move of opp.moves) {
    const pass = isPassKind(move.kind);
    const tackled = pass ? 0 : move.attempts - move.completed;
    const challenged = move.kind === 'takeOn' ? move.completed : 0;
    const at = mirrorBand(cellBand(pass ? move.to : move.from));
    m[M.tackles] += tackled;
    m[M.interceptions] += move.intercepted;
    if (at >= COUNTER_ZONES.highTurnover)
      t[TD.highTurnovers] += tackled + move.intercepted + looseBalls(move);
    if (at >= COUNTER_ZONES.press) t[TD.pressActions] += tackled + move.intercepted + challenged;
    if (pass) {
      t[TD.throwIns] += move.outTouch;
      t[TD.goalKicks] += move.outByline - move.cornersWon;
    }
  }
  for (const shot of own.shots) {
    m[M.shots]++;
    xg += shot.xg;
    if (shot.outcome === 'goal' || shot.outcome === 'save') m[M.onTarget]++;
    const keyPass = shot.source >= 0 && isPassKind(own.moves[shot.source]!.kind);
    if (keyPass) t[TD.keyPasses]++;
    if (shot.outcome === 'goal') {
      m[M.goals]++;
      if (keyPass) m[M.assists]++;
    }
    if (inBoxCell(shot.cell)) t[TD.boxShots]++;
    if (shot.xg >= BIG_CHANCE) {
      t[TD.bigChances]++;
      if (shot.outcome === 'goal') t[TD.bigChancesScored]++;
    }
    if (shot.kind === 'penalty' && shot.outcome === 'goal') t[TD.penaltiesScored]++;
  }
  for (const shot of opp.shots) {
    if (shot.outcome === 'save') m[M.saves]++;
    if (shot.outcome === 'miss') t[TD.goalKicks]++;
  }
  // Fouls this side committed, placed where the opponent was fouled (its frame).
  for (const f of opp.fouled) {
    t[TD.fouls] += f.n;
    if (mirrorBand(cellBand(f.cell)) >= COUNTER_ZONES.press) t[TD.pressActions] += f.n;
  }
  t[TD.yellowCards] = own.cards.yellow;
  t[TD.redCards] = own.cards.red;
  t[TD.corners] = cornersOf(ledger, side);
  t[TD.freeKicks] = freeKicksOf(ledger, side);
  t[TD.penalties] = sum(own.fouled, (f) => f.penalties);
  m[M.minutes] = ledger.length;
  return { metrics: m, detail: t, xg };
}

/** Throws the ledger's issues instead of deriving counters from facts that do not hold together. */
export function assertLedger(ledger: AggregateLedger): void {
  const issues = ledgerIssues(ledger);
  if (issues.length) throw new Error(`집계 원장 불일치: ${issues.slice(0, 5).join('; ')}`);
}

/** Both sides' team facts, the score and the regulation score, from one checked ledger. */
export function deriveTeamFacts(ledger: AggregateLedger): AggregateTeamFacts {
  assertLedger(ledger);
  const goals = (side: AggregateSide, period?: string) =>
    ledger.sides[side].shots.filter(
      (s) => s.outcome === 'goal' && (period === undefined || s.period === period),
    ).length;
  const sides: AggregateTeamFacts['sides'] = [sideCounters(ledger, 0), sideCounters(ledger, 1)];
  // MATCH-3: possession is each side's share of both sides' attempted passes, out of 90 as on the
  // grid.
  const home = possessionShare(sides[0].metrics[M.passes]!, sides[1].metrics[M.passes]!);
  sides[0].metrics[M.possession] = home;
  sides[1].metrics[M.possession] = 90 - home;
  return {
    length: ledger.length,
    score: [goals(0), goals(1)],
    ...(ledger.length === 120 && {
      regulation: [goals(0, 'regulation'), goals(1, 'regulation')] as [number, number],
    }),
    sides,
    ledger,
  };
}

/**
 * Team facts that do not match their ledger or break MATCH-13/27's orderings: a counter changed
 * after derivation, a score that is not the goals or a success above its attempts.
 */
export function teamFactsIssues(facts: AggregateTeamFacts): string[] {
  const out = ledgerIssues(facts.ledger);
  if (out.length) return out;
  const derived = deriveTeamFacts(facts.ledger);
  if (facts.length !== derived.length) out.push(`length ${facts.length} ≠ ${derived.length}`);
  if (facts.score.join() !== derived.score.join()) out.push(`score ${facts.score}`);
  if (facts.regulation?.join() !== derived.regulation?.join())
    out.push(`regulation score ${facts.regulation}`);
  for (const side of sides) {
    const f = facts.sides[side],
      d = derived.sides[side],
      who = `side ${side}`;
    f.metrics.forEach((v, i) => {
      if (v !== d.metrics[i]) out.push(`${who} metric ${i}: ${v} ≠ ledger ${d.metrics[i]}`);
    });
    if (f.metrics.length !== d.metrics.length) out.push(`${who} metrics width`);
    f.detail.forEach((v, i) => {
      if (v !== d.detail[i]) out.push(`${who} detail ${i}: ${v} ≠ ledger ${d.detail[i]}`);
    });
    if (f.detail.length !== TEAM_DETAIL_SIZE) out.push(`${who} detail width`);
    if (f.xg !== d.xg) out.push(`${who} xG ${f.xg} ≠ ledger ${d.xg}`);
    const m = f.metrics,
      t = f.detail;
    const atMost = (what: string, part: number, whole: number) => {
      if (part > whole) out.push(`${who} ${what}: ${part} > ${whole}`);
    };
    atMost('completed passes', m[M.completed]!, m[M.passes]!);
    atMost('goals', m[M.goals]!, m[M.onTarget]!);
    atMost('on target', m[M.onTarget]!, m[M.shots]!);
    atMost('assists', m[M.assists]!, t[TD.keyPasses]!);
    atMost('key passes', t[TD.keyPasses]!, m[M.shots]!);
    atMost('big chances scored', t[TD.bigChancesScored]!, t[TD.bigChances]!);
    atMost('big chances', t[TD.bigChances]!, t[TD.boxShots]!);
    atMost('box shots', t[TD.boxShots]!, m[M.shots]!);
    atMost('dribbles', m[M.dribbles]!, t[TD.takeOns]!);
    atMost('penalties scored', t[TD.penaltiesScored]!, t[TD.penalties]!);
  }
  return out;
}
