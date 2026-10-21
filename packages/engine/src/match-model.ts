/**
 * The full match model's release switch and the exact record check both result paths share
 * (→MATCH-13, MATCH-27, SAVE-23; docs/MATCH-MODEL-CONTRACT.md).
 */
import { PD, PLAYER_DETAIL_SIZE, TD, TEAM_DETAIL_SIZE } from '../../contracts/src/detail';
import {
  isMatchModelRevision,
  MATCH_MODEL_REVISION,
  type FullMatchRecord,
  type MatchModelRevision,
} from '../../contracts/src/match-model';
import type { Incident, MatchRecord, Metrics } from '../../contracts/src/types';
import { M } from './grid/record';
import { eraRules } from './grid/setup';
import { zeroMetrics } from './primitives';

/**
 * The internal release switch: off until the combined accuracy, compatibility, storage and speed
 * gates pass (→MATCH-28, ARCH-31). While off no world activates the candidate; tests and
 * measurements request it explicitly, and no player control or timing ever selects it.
 */
export const MATCH_MODEL_RELEASE: {
  readonly revision: MatchModelRevision;
  readonly enabled: boolean;
} = { revision: MATCH_MODEL_REVISION, enabled: false };

const sides = [0, 1] as const;
const METRICS_SIZE = zeroMetrics().length;
/** The most xG one shot can carry, in hundredths, as the world schema bounds player xG and xA. */
const MAX_SHOT_XG = 80;
/**
 * How far a line's whole minutes may sit from his stamped interval: incident minutes are stamped
 * after the fact and added time reads as the period's last minute (grid/changes.test.ts).
 */
const MINUTE_ROUNDING = 2;
/** Player counters named like a team counter add up to it exactly (→MATCH-27). */
const SHARED_DETAIL = (Object.keys(PD) as (keyof typeof PD)[]).filter(
  (key): key is keyof typeof PD & keyof typeof TD => key in TD,
);

function atMost(out: string[], what: string, part: number, whole: number) {
  if (part > whole) out.push(`${what}: ${part} > ${whole}`);
}
function rowIssues(out: string[], what: string, row: Metrics | undefined, width: number) {
  if (row?.length !== width) out.push(`${what} width ${row?.length} ≠ ${width}`);
  else if (row.some((v) => !Number.isSafeInteger(v) || v < 0)) out.push(`${what} holds ${row}`);
}

/**
 * Every way a result fails the full model's contract, empty when it holds: all full-model fields
 * and counters present at their widths, then the exact invariants — score and goals, successes
 * within attempts, shot classes within shots, player lines reconciling with their side, minutes
 * within the match, incidents naming participants under the era's substitution rules and agreeing
 * with the card counters, lines and minutes following the substitution and dismissal timeline, and
 * the period/shoot-out shape. It checks and never repairs a record.
 */
export function validateFullMatchRecord(r: MatchRecord): string[] {
  const out: string[] = [];
  if (r.model === undefined) out.push('model revision missing');
  else if (!isMatchModelRevision(r.model)) out.push(`unknown model revision ${r.model}`);
  if (!r.xg) out.push('team xG missing');
  if (!r.detail) out.push('team advanced counters missing');
  if (!r.incidents) out.push('incident list missing');
  if (!r.lineCounts) out.push('line split missing');
  if (!r.added) out.push('added time missing');
  for (const p of r.players) if (!p.detail) out.push(`${p.id} advanced counters missing`);
  if (out.length) return out;
  const full = r as FullMatchRecord;
  for (const side of sides) {
    rowIssues(out, `side ${side} metrics`, full.metrics[side], METRICS_SIZE);
    rowIssues(out, `side ${side} detail`, full.detail[side], TEAM_DETAIL_SIZE);
    if (!(full.xg[side] >= 0) || !Number.isFinite(full.xg[side]))
      out.push(`side ${side} xG ${full.xg[side]}`);
  }
  for (const p of full.players) {
    rowIssues(out, `${p.id} metrics`, p.metrics, METRICS_SIZE);
    rowIssues(out, `${p.id} detail`, p.detail, PLAYER_DETAIL_SIZE);
  }
  if (full.lineCounts[0] + full.lineCounts[1] !== full.players.length)
    out.push(`line split ${full.lineCounts} ≠ ${full.players.length} lines`);
  if (out.length) return out;
  return [
    ...resultIssues(full),
    ...participationIssues(full),
    ...incidentIssues(full),
    ...timelineIssues(full),
  ];
}

/** Throws before settlement when `validateFullMatchRecord` finds anything (→MATCH-27). */
export function assertFullMatchRecord(r: MatchRecord): asserts r is FullMatchRecord {
  const issues = validateFullMatchRecord(r);
  if (issues.length) throw new Error(`경기 기록 불일치 ${r.id}: ${issues.slice(0, 5).join('; ')}`);
}

const linesOf = (r: FullMatchRecord, side: 0 | 1) =>
  side === 0 ? r.players.slice(0, r.lineCounts[0]) : r.players.slice(r.lineCounts[0]);
const lengthOf = (r: MatchRecord) => (r.regulation ? 120 : 90);

function resultIssues(r: FullMatchRecord) {
  const out: string[] = [];
  const goals = [r.score.home, r.score.away];
  if (r.shootout) {
    if (!r.regulation) out.push('shoot-out without extra time');
    if (r.shootout.home === r.shootout.away) out.push('level shoot-out');
  }
  if (r.regulation && (r.regulation.home > r.score.home || r.regulation.away > r.score.away))
    out.push('regulation score above the final score');
  if (r.added.length !== (r.regulation ? 4 : 2)) out.push(`${r.added.length} added-time periods`);
  for (const side of sides) {
    const m = r.metrics[side],
      t = r.detail[side],
      who = `side ${side}`;
    if (m[M.goals] !== goals[side]) out.push(`${who} goals ${m[M.goals]} ≠ score ${goals[side]}`);
    if (m[M.minutes] !== lengthOf(r)) out.push(`${who} match length ${m[M.minutes]}`);
    atMost(out, `${who} completed passes`, m[M.completed]!, m[M.passes]!);
    atMost(out, `${who} goals`, m[M.goals]!, m[M.onTarget]!);
    atMost(out, `${who} shots on target`, m[M.onTarget]!, m[M.shots]!);
    atMost(out, `${who} assists`, m[M.assists]!, t[TD.keyPasses]!);
    atMost(out, `${who} key passes`, t[TD.keyPasses]!, m[M.shots]!);
    atMost(out, `${who} big chances scored`, t[TD.bigChancesScored]!, t[TD.bigChances]!);
    atMost(out, `${who} big chances scored`, t[TD.bigChancesScored]!, m[M.goals]!);
    atMost(out, `${who} big chances`, t[TD.bigChances]!, t[TD.boxShots]!);
    atMost(out, `${who} box shots`, t[TD.boxShots]!, m[M.shots]!);
    atMost(
      out,
      `${who} final-third completions`,
      t[TD.finalThirdCompleted]!,
      t[TD.finalThirdPasses]!,
    );
    atMost(out, `${who} crosses completed`, t[TD.crossesCompleted]!, t[TD.crosses]!);
    atMost(
      out,
      `${who} through balls completed`,
      t[TD.throughBallsCompleted]!,
      t[TD.throughBalls]!,
    );
    atMost(out, `${who} penalties scored`, t[TD.penaltiesScored]!, t[TD.penalties]!);
    atMost(out, `${who} dribbles`, m[M.dribbles]!, t[TD.takeOns]!);
    atMost(out, `${who} final-third passes`, t[TD.finalThirdPasses]!, m[M.passes]!);
    atMost(out, `${who} progressive passes`, t[TD.progressivePasses]!, m[M.completed]!);
    atMost(out, `${who} build-up passes`, t[TD.buildUpPasses]!, m[M.passes]!);
    if (m[M.shots] === 0 && r.xg[side] !== 0) out.push(`${who} xG without shots`);
  }
  return out;
}

function participationIssues(r: FullMatchRecord) {
  const out: string[] = [];
  const length = lengthOf(r);
  const ids = r.players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) out.push('a player has two lines');
  for (const side of sides) {
    const lines = linesOf(r, side),
      who = `side ${side}`;
    let minutes = 0;
    for (const p of lines) {
      const m = p.metrics,
        d = p.detail;
      minutes += m[M.minutes]!;
      if (m[M.minutes]! < 1 || m[M.minutes]! > length) out.push(`${p.id} minutes ${m[M.minutes]}`);
      atMost(out, `${p.id} completed passes`, m[M.completed]!, m[M.passes]!);
      atMost(out, `${p.id} goals`, m[M.goals]!, m[M.onTarget]!);
      atMost(out, `${p.id} shots on target`, m[M.onTarget]!, m[M.shots]!);
      atMost(out, `${p.id} dribbles`, m[M.dribbles]!, d[PD.takeOns]!);
      atMost(
        out,
        `${p.id} final-third completions`,
        d[PD.finalThirdCompleted]!,
        d[PD.finalThirdPasses]!,
      );
      atMost(out, `${p.id} crosses completed`, d[PD.crossesCompleted]!, d[PD.crosses]!);
      atMost(
        out,
        `${p.id} through balls completed`,
        d[PD.throughBallsCompleted]!,
        d[PD.throughBalls]!,
      );
      atMost(out, `${p.id} big chances created`, d[PD.bigChancesCreated]!, d[PD.keyPasses]!);
      atMost(out, `${p.id} xG`, d[PD.xg]!, MAX_SHOT_XG * m[M.shots]!);
      atMost(out, `${p.id} xA`, d[PD.xa]!, MAX_SHOT_XG * d[PD.keyPasses]!);
    }
    if (minutes > 11 * length) out.push(`${who} minutes ${minutes} > ${11 * length}`);
    const sum = (row: (p: FullMatchRecord['players'][number]) => Metrics, index: number) =>
      lines.reduce((n, p) => n + row(p)[index]!, 0);
    const team = r.metrics[side],
      detail = r.detail[side],
      opponent = r.detail[side === 0 ? 1 : 0];
    for (let index = 0; index < M.minutes; index++)
      if (sum((p) => p.metrics, index) !== team[index])
        out.push(
          `${who} metric ${index}: players ${sum((p) => p.metrics, index)}, team ${team[index]}`,
        );
    for (const key of SHARED_DETAIL)
      if (sum((p) => p.detail, PD[key]) !== detail[TD[key]])
        out.push(
          `${who} ${key}: players ${sum((p) => p.detail, PD[key])}, team ${detail[TD[key]]}`,
        );
    atMost(
      out,
      `${who} big chances created`,
      sum((p) => p.detail, PD.bigChancesCreated),
      detail[TD.bigChances]!,
    );
    if (sum((p) => p.detail, PD.foulsWon) !== opponent[TD.fouls])
      out.push(
        `${who} fouls won ${sum((p) => p.detail, PD.foulsWon)} ≠ opponent fouls ${opponent[TD.fouls]}`,
      );
    // Player xG is each shot's rounded hundredths: within half a hundredth a shot of the side's.
    const xg = sum((p) => p.detail, PD.xg),
      expected = Math.round(r.xg[side] * 100);
    if (Math.abs(xg - expected) > 0.5 + 0.5 * team[M.shots]!)
      out.push(`${who} player xG ${xg} against team ${expected}`);
  }
  return out;
}

function incidentIssues(r: FullMatchRecord) {
  const out: string[] = [];
  const length = lengthOf(r),
    era = eraRules(r.year);
  const roster = sides.map((side) => new Set(linesOf(r, side).map((p) => p.id)));
  const booked = new Set<string>(),
    hurt = new Set<string>();
  const subs = [0, 0],
    yellows = [0, 0],
    reds = [0, 0];
  let last = 0;
  for (const x of r.incidents) {
    if (x.minute < 1 || x.minute > length) out.push(`${x.kind} at minute ${x.minute}`);
    if (x.minute < last) out.push(`incidents out of order at minute ${x.minute}`);
    last = x.minute;
    for (const id of x.kind === 'sub' ? [x.player, x.other] : [x.player])
      if (!id || !roster[x.side]!.has(id)) out.push(`${x.kind} names ${id} outside side ${x.side}`);
    if (x.kind === 'yellow' || x.kind === 'secondYellow') yellows[x.side]!++;
    if (x.kind === 'red' || x.kind === 'secondYellow') reds[x.side]!++;
    if (x.kind === 'yellow') booked.add(x.player);
    if (x.kind === 'secondYellow' && !booked.has(x.player))
      out.push(`${x.player} second yellow without a first`);
    if (x.kind === 'injury') hurt.add(x.player);
    if (x.kind === 'sub') {
      subs[x.side]!++;
      if (era.injuryOnly && !hurt.has(x.player)) out.push(`${x.player} replaced without an injury`);
    }
  }
  for (const side of sides) {
    if (subs[side]! > era.maxSubs)
      out.push(`side ${side} made ${subs[side]} substitutions > ${era.maxSubs}`);
    if (r.detail[side][TD.yellowCards] !== yellows[side])
      out.push(`side ${side} yellow cards disagree with incidents`);
    if (r.detail[side][TD.redCards] !== reds[side])
      out.push(`side ${side} red cards disagree with incidents`);
  }
  return out;
}

/**
 * Participation shares the incident timeline (→MATCH-20, MATCH-27): a side's lines are its eleven
 * starters, then each substitute in the order he came on; every incident names a player on the
 * pitch at that moment (an injured player who left may still be replaced), a substitute enters
 * once and never a starter, and each line's minutes run from his entry to his exit — a minute
 * before the stamp of his substitution, sending-off or injury — within `MINUTE_ROUNDING`.
 */
function timelineIssues(r: FullMatchRecord) {
  const out: string[] = [];
  const length = lengthOf(r);
  for (const side of sides) {
    const lines = linesOf(r, side),
      own = r.incidents.filter((x) => x.side === side),
      who = `side ${side}`;
    const incoming = own.filter((x) => x.kind === 'sub').map((x) => x.other);
    if (lines.length !== 11 + incoming.length)
      out.push(`${who} has ${lines.length} lines for ${incoming.length} substitutions`);
    const entered = lines.slice(11).map((p) => p.id);
    if (entered.join('\n') !== incoming.join('\n'))
      out.push(`${who} substitutes ${entered.join(' ')} ≠ incoming ${incoming.join(' ')}`);
    const starters = new Set(lines.slice(0, 11).map((p) => p.id));
    const on = new Set(starters),
      came = new Set<string>(),
      injuredOff = new Set<string>();
    for (const x of own) {
      if (x.kind === 'sub') {
        if (!on.has(x.player) && !injuredOff.has(x.player))
          out.push(`${x.player} replaced at ${x.minute} while off the pitch`);
        if (!x.other || starters.has(x.other) || came.has(x.other))
          out.push(`${x.other} comes on at ${x.minute} as a starter or a second time`);
        on.delete(x.player);
        injuredOff.delete(x.player);
        if (x.other) {
          on.add(x.other);
          came.add(x.other);
        }
      } else if (!on.has(x.player))
        out.push(`${x.kind} at ${x.minute} names ${x.player} off the pitch`);
      else if (x.kind !== 'yellow') {
        on.delete(x.player);
        if (x.kind === 'injury') injuredOff.add(x.player);
      }
    }
    const stamp = (x: Incident | undefined, fallback: number) => (x ? x.minute - 1 : fallback);
    for (const p of lines) {
      const entry = stamp(
        own.find((x) => x.kind === 'sub' && x.other === p.id),
        0,
      );
      const exit = stamp(
        own.find((x) => x.kind !== 'yellow' && x.player === p.id),
        length,
      );
      if (Math.abs(p.metrics[M.minutes]! - (exit - entry)) > MINUTE_ROUNDING)
        out.push(`${p.id} minutes ${p.metrics[M.minutes]} for ${entry}′–${exit}′ on the pitch`);
    }
  }
  return out;
}
