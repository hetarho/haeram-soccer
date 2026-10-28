/**
 * The continuous-match and complete aggregate-result model's shared contracts (→MATCH-12/17/22/26/27,
 * HIST-17, SAVE-23; spec/ssot/MATCH.md): its revision, a world's activation and coverage
 * metadata, the full match record, current-season NPC aggregates and the explicit match-time
 * coordinate of observed frames. Pure data and checks: no engine imports or random draws.
 */
import { z } from 'zod';
import type {
  CareerDate,
  Fixture,
  MatchFrame,
  MatchRecord,
  Metrics,
  Position,
  World,
} from './types';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  SaveCompatibilityError,
  type CheckpointSchema,
} from './versions';

/**
 * The candidate model's revisions, oldest first; a world or record naming any other revision is
 * from a newer game. Revision 2 adds the players' freedom and tendencies (T431–T433, →SAVE-23):
 * careers on revision 1 move to it prospectively and their settled matches keep revision 1.
 * Revision 3 gives a club nobody owns its named manager's context on the own club's formula
 * (T466, →MATCH-2); careers on revisions 1 and 2 take it the same way. Revision 4 hands free kicks
 * outside shooting and crossing range to the nearest suitable player, draws a corner's numbers
 * and lets the late score set them, chooses shots from the chance in a forward ≥ midfielder ≥
 * defender order and recalibrates its scoring (T479–T482, →MATCH-16, MATCH-18); careers on
 * revisions 1–3 take it the same way. Revision 5 has the carrier take open ground ahead, recycle
 * backward or sideways only to a free receiver along a clear lane and, with room near the box, never
 * play it far back (T538, →MATCH-16); careers on revisions 1–4 take it the same way.
 */
export const MATCH_MODEL_REVISIONS = [
  'continuous-aggregate-1',
  'continuous-aggregate-2',
  'continuous-aggregate-3',
  'continuous-aggregate-4',
  'continuous-aggregate-5',
] as const;
export type MatchModelRevision = (typeof MATCH_MODEL_REVISIONS)[number];
/** The revision new careers and upgraded ones play. */
export const MATCH_MODEL_REVISION: MatchModelRevision = 'continuous-aggregate-5';
export const isMatchModelRevision = (value: unknown): value is MatchModelRevision =>
  (MATCH_MODEL_REVISIONS as readonly unknown[]).includes(value);
/** A revision's number: 1 for the first. */
export const matchModelNumber = (revision: MatchModelRevision) =>
  MATCH_MODEL_REVISIONS.indexOf(revision) + 1;

/** The first fixture day and round a set of newly available counters covers (→HIST-17). */
export interface TrackingBoundary {
  year: number;
  /** Days since August 1 of that season, as `World.calendar.day`. */
  day: number;
  round: number;
}
/**
 * A world's persisted match model (→SAVE-23). Absent means the pre-feature model: a supported older
 * career keeps every settled fact and only its future unsettled fixtures use a later model.
 */
export interface MatchModelState {
  revision: MatchModelRevision;
  /** The game date and world revision of the writer activation that recorded this model. */
  activated: CareerDate & { revision: number };
  /** Where the new counters start: a new career at its founding, an older one at activation. */
  trackedFrom: TrackingBoundary;
  coverage: 'founding' | 'activation';
}
/** The model a world's ordinary fixtures play: none before activation (the pre-feature model). */
export const activeMatchModel = (w: Pick<World, 'matchModel'>): MatchModelRevision | undefined =>
  w.matchModel?.revision;

/** Whether a world holds anything only the full model writes: its metadata, aggregates or records. */
export const carriesMatchModel = (w: Pick<World, 'matchModel' | 'npcSeason' | 'ownMatches'>) =>
  !!w.matchModel || !!w.npcSeason || w.ownMatches.some((m) => m.model !== undefined);
/**
 * The checkpoint container a world is written in (→SAVE-23): a world carrying full-model data needs
 * `FULL_MODEL_CHECKPOINT_SCHEMA`, which an older reader refuses instead of dropping its fields;
 * unactivated worlds keep the current container.
 */
export const checkpointSchemaFor = (
  w: Pick<World, 'matchModel' | 'npcSeason' | 'ownMatches'>,
): CheckpointSchema =>
  carriesMatchModel(w) ? FULL_MODEL_CHECKPOINT_SCHEMA : CURRENT_CHECKPOINT_SCHEMA;

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const day = z.number().int().min(0).max(365);
const year = z.number().int().min(1800).max(4000);
export const trackingBoundarySchema = z.strictObject({
  year,
  day,
  round: z.number().int().min(0).max(46),
});
/** Strict, so an unknown field of a newer game is refused rather than silently dropped. */
export const matchModelStateSchema = z.strictObject({
  revision: z.enum(MATCH_MODEL_REVISIONS),
  activated: z.strictObject({ year, day, revision: count }),
  trackedFrom: trackingBoundarySchema,
  coverage: z.enum(['founding', 'activation']),
});

/**
 * A result settled under the full model (→MATCH-26/27): every field older records may lack is
 * present — the model, team xG, advanced counters for both sides and every line, the incident list
 * (empty when nothing happened, so its presence says the path tracks incidents), the per-side line
 * split and added time. It refines `MatchRecord`; older records keep their actual optional fields.
 */
export type FullMatchRecord = Omit<MatchRecord, 'players'> &
  Required<Pick<MatchRecord, 'model' | 'xg' | 'detail' | 'incidents' | 'lineCounts' | 'added'>> & {
    players: { id: string; metrics: Metrics; detail: Metrics }[];
  };

/** One club's settled totals in a competition; rows follow the record's M and TD widths. */
export interface NpcClubTotals {
  club: string;
  matches: number;
  /** Summed team metrics; the minutes slot sums match lengths, possession its minutes. */
  metrics: Metrics;
  detail: Metrics;
  /** Expected goals for and against, in hundredths. */
  xg: number;
  xga: number;
}
/**
 * What a player actually contributed for one club. Appearances count lines with minutes > 0 as own
 * records do (→HIST-13): `starts` of them began the match, the rest came on as a substitute.
 */
export interface NpcContribution {
  club: string;
  appearances: number;
  starts: number;
  metrics: Metrics;
  detail: Metrics;
}
/**
 * A named participant under his stable identity (→WORLD-6/11), not a cloned `Player`. A departed or
 * retired player keeps his contributions, per club, until the season closes.
 */
export interface NpcPlayerTotals {
  id: string;
  name: string;
  position: Position;
  clubs: NpcContribution[];
}
/** One competition scope (→HIST-6): the fixture kind and its group key. */
export interface NpcCompetitionStats {
  kind: Fixture['kind'];
  groupKey: string;
  clubs: NpcClubTotals[];
  players: NpcPlayerTotals[];
}
/**
 * Current-season aggregates from settled fixtures on either path (→HIST-3/17), replacing transient
 * full records after settlement. Counting starts at `trackedFrom`; earlier fixtures stay untracked,
 * never zero.
 */
export interface NpcSeasonStats {
  year: number;
  model: MatchModelRevision;
  trackedFrom: TrackingBoundary;
  competitions: NpcCompetitionStats[];
}
/**
 * A competition scope a full-statistics read serves (→HIST-6, WEB-89). Promotion playoffs are left
 * out: they settle at the close into the ledger the next season replaces, and every country's
 * barrage shares one group key.
 */
export const FULL_STATS_KINDS = [
  'league',
  'lower',
  'cup',
  'europe',
] as const satisfies readonly Exclude<Fixture['kind'], 'playoff'>[];
export interface FullStatsScope {
  kind: (typeof FULL_STATS_KINDS)[number];
  groupKey: string;
}
/**
 * One competition of the season in progress, read on request (→WEB-89): a copy of its settled
 * aggregates (empty rows when nothing settled yet, a real zero), where counting started and how
 * many of its fixtures settled before that and stay untracked, never zero (→HIST-17).
 */
export interface FullStatsRead {
  year: number;
  trackedFrom: TrackingBoundary;
  untracked: number;
  competition: NpcCompetitionStats;
}

/** What an observed player is doing and why (→MATCH-17); observation only, never archived. */
export const INTENTION_KINDS = [
  'support',
  'receive',
  'run',
  'press',
  'mark',
  'cover',
  'recover',
  'carry',
  'restart',
  'exit',
  /** Standing in the lane from the carrier to a receiver between the lines or in a half-space (→MATCH-32). */
  'screen',
] as const;
/** Highest first: an intention yields only to a higher one or a reasoned event. */
export const INTENTION_PRIORITIES = ['exit', 'restart', 'danger', 'committed', 'tactical'] as const;
export const INTENTION_ENDS = ['achieved', 'infeasible', 'displaced', 'expired'] as const;
export interface IntentionObservation {
  kind: (typeof INTENTION_KINDS)[number];
  priority: (typeof INTENTION_PRIORITIES)[number];
  /** Target in the frame's pitch units. */
  target: [number, number];
  /** The teammate it serves (overlap, receiver) or the opponent it tracks, by player ID. */
  teammate?: string;
  opponent?: string;
  /** Elapsed match seconds it started and expires at. */
  since: number;
  until: number;
  /** Why it ended at or before this sample; absent while it holds. */
  ended?: (typeof INTENTION_ENDS)[number];
}

/** Candidate frames set this pace: the match clock ignores situation weights (→WEB-32). */
export const NEUTRAL_FRAME_PACE = 1;

/**
 * Time-coordinate failures of a playback's frames (→MATCH-12): with explicit times every frame has
 * them, a minute starts where its predecessor in the period ended, ball knots align with the track
 * and strictly increase within the minute, and motion samples stay in order inside it. Legacy frames
 * without explicit times are left to the equal-interval decoding.
 */
export function frameTimeIssues(frames: readonly MatchFrame[]): string[] {
  const out: string[] = [];
  const explicit = frames.filter((f) => f.startSeconds !== undefined).length;
  if (explicit === 0) {
    if (frames.some((f) => f.ballTimes)) out.push('ball times without a frame start');
    return out;
  }
  if (explicit !== frames.length) return ['explicit times on some frames only'];
  frames.forEach((f, i) => {
    const start = f.startSeconds!,
      end = start + 60,
      at = `minute ${f.label}`;
    if (!Number.isFinite(start) || start < 0) out.push(`${at} start ${start}`);
    const before = frames[i - 1];
    if (before) {
      if (before.period > f.period) out.push(`${at} period ${f.period} after ${before.period}`);
      // A period boundary may open a gap; within a period the minutes follow without one.
      const expected = before.startSeconds! + 60;
      if (before.period === f.period ? start !== expected : start < expected)
        out.push(`${at} starts at ${start}, not ${expected}`);
    }
    if (f.ballTimes) {
      if (!f.ballTrack || f.ballTrack.length !== f.ballTimes.length)
        out.push(`${at} ball times not aligned with the track`);
      let last = -Infinity;
      for (const t of f.ballTimes) {
        if (!(t >= start && t <= end)) out.push(`${at} ball time ${t} outside ${start}–${end}`);
        if (!(t > last)) out.push(`${at} ball time ${t} not after ${last}`);
        last = t;
      }
    }
    let previous = -Infinity;
    for (const sample of f.motion ?? []) {
      const t = sample.elapsedSeconds;
      if (!(t >= start && t <= end)) out.push(`${at} motion time ${t} outside ${start}–${end}`);
      if (t < previous) out.push(`${at} motion time ${t} before ${previous}`);
      previous = t;
    }
  });
  return out;
}

/** World.ownMatches limit of the world schema; larger inputs are not scanned. */
const MAX_RECORDS = 100000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A revision string this version does not know comes from a newer game (→SAVE-11, SAVE-23). */
function assertRevision(value: unknown) {
  if (typeof value === 'string' && !isMatchModelRevision(value))
    throw new SaveCompatibilityError(
      '이 저장은 더 새로운 경기 모델로 기록되었습니다. 원본 파일을 내보내 보관하세요.',
    );
}
/**
 * Bounded preflight over a World-shaped value: a future `matchModel`, NPC season or own-record model
 * revision throws SaveCompatibilityError before ordinary validation can call it corruption. Missing
 * metadata is the pre-feature model and passes; the value is neither validated nor changed.
 */
export function assertMatchModelFormat(value: unknown): void {
  if (!record(value)) return;
  const { matchModel, npcSeason, ownMatches } = value;
  if (record(matchModel)) assertRevision(matchModel.revision);
  if (record(npcSeason)) assertRevision(npcSeason.model);
  if (!Array.isArray(ownMatches)) return;
  if (ownMatches.length > MAX_RECORDS)
    throw new Error('저장 데이터의 크기가 허용 범위를 넘습니다.');
  for (const match of ownMatches) if (record(match)) assertRevision(match.model);
}
