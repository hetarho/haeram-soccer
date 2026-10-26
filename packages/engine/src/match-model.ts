/**
 * The full match model's release switch and the exact record check both result paths share
 * (→MATCH-13, MATCH-27, SAVE-23; docs/MATCH-MODEL-CONTRACT.md).
 */
import { PD, PLAYER_DETAIL_SIZE, TD, TEAM_DETAIL_SIZE } from '../../contracts/src/detail';
import {
  carriesMatchModel,
  isMatchModelRevision,
  matchModelNumber,
  type FullMatchRecord,
} from '../../contracts/src/match-model';
import type { Incident, MatchRecord, Metrics, World } from '../../contracts/src/types';
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
import { currentDay } from './calendar';
import { M } from './grid/record';
import { eraRules } from './grid/rules';
import { openNpcSeason, trackingBoundary } from './npc-stats';
import { zeroMetrics } from './primitives';

export { MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model-release';
import type { MatchModelRelease } from './match-model-release';

/**
 * Whether `activateMatchModel` would record `release` on `w`: the release is on, the world plays
 * the current rules (4.0.0, →SAVE-19; earlier rules never activate) and either carries no model
 * data yet or records an earlier revision than the release's (→SAVE-23's later revision).
 */
export const activatesMatchModel = (w: World, release: MatchModelRelease) =>
  release.enabled &&
  w.engine === CURRENT_ENGINE_VERSION &&
  (w.matchModel
    ? matchModelNumber(w.matchModel.revision) < matchModelNumber(release.revision)
    : !carriesMatchModel(w));

/**
 * Records the full match model on `w` prospectively (→SAVE-23, HIST-17): the revision, the game
 * date and world revision it was recorded at, where its counters start (`trackingBoundary`) and the
 * coverage — `founding` for a world with no settled round and no own match, `activation` otherwise
 * — then opens the season's empty aggregates from that boundary. Settled fixtures, records, money,
 * dates and people stay as they are: nothing is replayed or backfilled, and only fixtures not yet
 * played use the model. A world on an earlier revision moves to the release's: its activation,
 * tracking boundary and coverage stay, the season's aggregates go on counting under the new
 * revision and every settled record keeps the revision that settled it. Returns whether it
 * activated; a disabled release, a world on the release's revision or later, or earlier rules
 * leave `w` untouched. Callers own the safe boundary and the revision.
 */
export function activateMatchModel(w: World, release: MatchModelRelease): boolean {
  if (!activatesMatchModel(w, release)) return false;
  if (w.matchModel) {
    w.matchModel = { ...w.matchModel, revision: release.revision };
    if (w.npcSeason) w.npcSeason.model = release.revision;
    return true;
  }
  const trackedFrom = trackingBoundary(w);
  w.matchModel = {
    revision: release.revision,
    activated: { year: w.year, day: currentDay(w), revision: w.revision },
    trackedFrom,
    coverage: w.round === 0 && w.ownMatches.length === 0 ? 'founding' : 'activation',
  };
  openNpcSeason(w, trackedFrom);
  return true;
}

const sides = [0, 1] as const;
const METRICS_SIZE = zeroMetrics().length;
/** The most xG one shot can carry, in hundredths, as the world schema bounds player xG and xA. */
const MAX_SHOT_XG = 80;
/**
 * How far a line's whole minutes may sit from his stamped interval: incident minutes are stamped
 * after the fact and added time reads as the period's last minute (grid/changes.test.ts).
 */
const MINUTE_ROUNDING = 2;
/** Stamped minutes of half-time and the extra-time intervals, where a change uses no window. */
export const INTERVAL_STAMPS: ReadonlySet<number> = new Set([46, 91, 106]);
/** Player counters named like a team counter add up to it exactly (→MATCH-27). */
const SHARED_DETAIL = (Object.keys(PD) as (keyof typeof PD)[]).filter(
  (key): key is keyof typeof PD & keyof typeof TD => key in TD,
);

/** The label is joined only on a failure: a valid record builds no strings (T286, T450's read). */
function atMost(out: string[], who: string, what: string, part: number, whole: number) {
  if (part > whole) out.push(`${who} ${what}: ${part} > ${whole}`);
}
function rowIssues(
  out: string[],
  who: string,
  what: string,
  row: Metrics | undefined,
  width: number,
) {
  if (row?.length !== width) out.push(`${who} ${what} width ${row?.length} ≠ ${width}`);
  else if (row.some((v) => !Number.isSafeInteger(v) || v < 0))
    out.push(`${who} ${what} holds ${row}`);
}

/**
 * Every way a result fails the full model's contract, empty when it holds: all full-model fields
 * and counters present at their widths, then the exact invariants — score and goals, successes
 * within attempts, shot classes within shots, player lines reconciling with their side, minutes
 * within the match, assists within each line's key passes, incidents naming participants under
 * the era's substitution and window rules and agreeing with the team and line card counters, lines and minutes following the substitution and dismissal timeline, and
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
    rowIssues(out, `side ${side}`, 'metrics', full.metrics[side], METRICS_SIZE);
    rowIssues(out, `side ${side}`, 'detail', full.detail[side], TEAM_DETAIL_SIZE);
    if (!(full.xg[side] >= 0) || !Number.isFinite(full.xg[side]))
      out.push(`side ${side} xG ${full.xg[side]}`);
  }
  for (const p of full.players) {
    rowIssues(out, p.id, 'metrics', p.metrics, METRICS_SIZE);
    rowIssues(out, p.id, 'detail', p.detail, PLAYER_DETAIL_SIZE);
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
    atMost(out, who, 'completed passes', m[M.completed]!, m[M.passes]!);
    atMost(out, who, 'goals', m[M.goals]!, m[M.onTarget]!);
    atMost(out, who, 'shots on target', m[M.onTarget]!, m[M.shots]!);
    atMost(out, who, 'assists', m[M.assists]!, t[TD.keyPasses]!);
    atMost(out, who, 'key passes', t[TD.keyPasses]!, m[M.shots]!);
    atMost(out, who, 'big chances scored', t[TD.bigChancesScored]!, t[TD.bigChances]!);
    atMost(out, who, 'big chances scored', t[TD.bigChancesScored]!, m[M.goals]!);
    atMost(out, who, 'big chances', t[TD.bigChances]!, t[TD.boxShots]!);
    atMost(out, who, 'box shots', t[TD.boxShots]!, m[M.shots]!);
    atMost(
      out,
      who,
      'final-third completions',
      t[TD.finalThirdCompleted]!,
      t[TD.finalThirdPasses]!,
    );
    atMost(out, who, 'crosses completed', t[TD.crossesCompleted]!, t[TD.crosses]!);
    atMost(out, who, 'through balls completed', t[TD.throughBallsCompleted]!, t[TD.throughBalls]!);
    atMost(out, who, 'penalties scored', t[TD.penaltiesScored]!, t[TD.penalties]!);
    atMost(out, who, 'dribbles', m[M.dribbles]!, t[TD.takeOns]!);
    atMost(out, who, 'final-third passes', t[TD.finalThirdPasses]!, m[M.passes]!);
    atMost(out, who, 'progressive passes', t[TD.progressivePasses]!, m[M.completed]!);
    atMost(out, who, 'build-up passes', t[TD.buildUpPasses]!, m[M.passes]!);
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
      atMost(out, p.id, 'completed passes', m[M.completed]!, m[M.passes]!);
      atMost(out, p.id, 'goals', m[M.goals]!, m[M.onTarget]!);
      atMost(out, p.id, 'shots on target', m[M.onTarget]!, m[M.shots]!);
      // An assist is the key pass of a goal (→MATCH-11): nobody assists more than he set up.
      atMost(out, p.id, 'assists', m[M.assists]!, d[PD.keyPasses]!);
      atMost(out, p.id, 'dribbles', m[M.dribbles]!, d[PD.takeOns]!);
      atMost(
        out,
        p.id,
        'final-third completions',
        d[PD.finalThirdCompleted]!,
        d[PD.finalThirdPasses]!,
      );
      atMost(out, p.id, 'crosses completed', d[PD.crossesCompleted]!, d[PD.crosses]!);
      atMost(
        out,
        p.id,
        'through balls completed',
        d[PD.throughBallsCompleted]!,
        d[PD.throughBalls]!,
      );
      atMost(out, p.id, 'big chances created', d[PD.bigChancesCreated]!, d[PD.keyPasses]!);
      atMost(out, p.id, 'xG', d[PD.xg]!, MAX_SHOT_XG * m[M.shots]!);
      atMost(out, p.id, 'xA', d[PD.xa]!, MAX_SHOT_XG * d[PD.keyPasses]!);
    }
    if (minutes > 11 * length) out.push(`${who} minutes ${minutes} > ${11 * length}`);
    const metricSum = (index: number) => {
      let n = 0;
      for (const p of lines) n += p.metrics[index]!;
      return n;
    };
    const detailSum = (index: number) => {
      let n = 0;
      for (const p of lines) n += p.detail[index]!;
      return n;
    };
    const team = r.metrics[side],
      detail = r.detail[side],
      opponent = r.detail[side === 0 ? 1 : 0];
    for (let index = 0; index < M.minutes; index++)
      if (metricSum(index) !== team[index])
        out.push(`${who} metric ${index}: players ${metricSum(index)}, team ${team[index]}`);
    for (const key of SHARED_DETAIL)
      if (detailSum(PD[key]) !== detail[TD[key]])
        out.push(`${who} ${key}: players ${detailSum(PD[key])}, team ${detail[TD[key]]}`);
    atMost(
      out,
      who,
      'big chances created',
      detailSum(PD.bigChancesCreated),
      detail[TD.bigChances]!,
    );
    if (detailSum(PD.foulsWon) !== opponent[TD.fouls])
      out.push(`${who} fouls won ${detailSum(PD.foulsWon)} ≠ opponent fouls ${opponent[TD.fouls]}`);
    // Player xG is each shot's rounded hundredths: within half a hundredth a shot of the side's.
    const xg = detailSum(PD.xg),
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
  const cards = new Map<string, [number, number]>();
  /** Stamped minutes of in-play substitutions per side; the intervals use no window (→MATCH-20). */
  const windows = [new Set<number>(), new Set<number>()];
  let last = 0;
  for (const x of r.incidents) {
    if (x.minute < 1 || x.minute > length) out.push(`${x.kind} at minute ${x.minute}`);
    if (x.minute < last) out.push(`incidents out of order at minute ${x.minute}`);
    last = x.minute;
    for (const id of x.kind === 'sub' ? [x.player, x.other] : [x.player])
      if (!id || !roster[x.side]!.has(id)) out.push(`${x.kind} names ${id} outside side ${x.side}`);
    const own = cards.get(x.player) ?? [0, 0];
    if (x.kind === 'yellow' || x.kind === 'secondYellow') {
      yellows[x.side]!++;
      own[0]++;
    }
    if (x.kind === 'red' || x.kind === 'secondYellow') {
      reds[x.side]!++;
      own[1]++;
    }
    cards.set(x.player, own);
    if (x.kind === 'yellow') booked.add(x.player);
    if (x.kind === 'secondYellow' && !booked.has(x.player))
      out.push(`${x.player} second yellow without a first`);
    if (x.kind === 'injury') hurt.add(x.player);
    if (x.kind === 'sub') {
      subs[x.side]!++;
      if (!INTERVAL_STAMPS.has(x.minute)) windows[x.side]!.add(x.minute);
      if (era.injuryOnly && !hurt.has(x.player)) out.push(`${x.player} replaced without an injury`);
    }
  }
  for (const p of r.players) {
    const [yellow, red] = cards.get(p.id) ?? [0, 0];
    if (p.detail[PD.yellowCards] !== yellow || p.detail[PD.redCards] !== red)
      out.push(`${p.id} cards ${p.detail[PD.yellowCards]}/${p.detail[PD.redCards]} ≠ incidents`);
  }
  for (const side of sides) {
    if (subs[side]! > era.maxSubs)
      out.push(`side ${side} made ${subs[side]} substitutions > ${era.maxSubs}`);
    if (era.windows !== undefined && windows[side]!.size > era.windows)
      out.push(`side ${side} substituted in ${windows[side]!.size} windows > ${era.windows}`);
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
