import { describe, expect, it } from 'vitest';
import {
  activeMatchModel,
  assertMatchModelFormat,
  checkpointSchemaFor,
  frameTimeIssues,
  MATCH_MODEL_REVISION,
  matchModelStateSchema,
  type MatchModelState,
} from './match-model';
import type { MatchFrame, World } from './types';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  CURRENT_ENGINE_VERSION,
  envelopeEngine,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  isCheckpointSchema,
  isEarlierEngine,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
  PLAIN_WORLD_CHECKPOINT_SCHEMA,
  isSaveCompatibilityError,
  LEGACY_ENGINE_VERSIONS,
  SaveCompatibilityError,
} from './versions';

const state: MatchModelState = {
  revision: MATCH_MODEL_REVISION,
  activated: { year: 1962, day: 40, revision: 812 },
  trackedFrom: { year: 1962, day: 41, round: 6 },
  coverage: 'activation',
};
/** An older own record as the rules-4.0.0 line stores it: no model, line split or incidents. */
const oldRecord = { id: 'f:1', year: 1961, round: 3, score: { home: 1, away: 0 } };

describe('match-model metadata (→SAVE-23)', () => {
  it('accepts missing metadata on supported careers', () => {
    const career = { engine: CURRENT_ENGINE_VERSION, ownMatches: [oldRecord] };
    expect(() => assertMatchModelFormat(career)).not.toThrow();
    expect(activeMatchModel(career as Pick<World, 'matchModel'>)).toBeUndefined();
    // A supported career, with or without the model, is never resettable legacy data.
    for (const supported of [CURRENT_ENGINE_VERSION]) {
      expect(LEGACY_ENGINE_VERSIONS).not.toContain(supported);
      expect(isEarlierEngine(supported)).toBe(false);
    }
    const activated = {
      ...career,
      matchModel: state,
      npcSeason: { model: MATCH_MODEL_REVISION },
      ownMatches: [oldRecord, { ...oldRecord, id: 'f:2', model: MATCH_MODEL_REVISION }],
    };
    expect(() => assertMatchModelFormat(activated)).not.toThrow();
    expect(activeMatchModel(activated)).toBe(MATCH_MODEL_REVISION);
    expect(matchModelStateSchema.parse(state)).toEqual(state);
    for (const value of [null, [], 'world', {}])
      expect(() => assertMatchModelFormat(value)).not.toThrow();
  });

  it('rejects unknown model revisions', () => {
    const future = 'continuous-aggregate-11';
    const rejects = (value: unknown) => {
      let error: unknown;
      try {
        assertMatchModelFormat(value);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SaveCompatibilityError);
      expect(isSaveCompatibilityError(error)).toBe(true);
    };
    rejects({ matchModel: { ...state, revision: future } });
    rejects({ npcSeason: { model: future } });
    rejects({ ownMatches: [oldRecord, { ...oldRecord, model: future }] });
    expect(matchModelStateSchema.safeParse({ ...state, revision: future }).success).toBe(false);
    expect(matchModelStateSchema.safeParse({ ...state, extra: 1 }).success).toBe(false);
    // The plain-world container follows the packed ones; every earlier number is still recognised
    // (so it fails as compatibility, not corruption) and the one after is a future one, whose
    // header is no evidence of earlier rules.
    expect(PLAIN_WORLD_CHECKPOINT_SCHEMA).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1);
    for (const known of [
      1,
      CURRENT_CHECKPOINT_SCHEMA,
      FULL_MODEL_CHECKPOINT_SCHEMA,
      MANAGER_HISTORY_CHECKPOINT_SCHEMA,
      PLAIN_WORLD_CHECKPOINT_SCHEMA,
    ])
      expect(isCheckpointSchema(known)).toBe(true);
    expect(isCheckpointSchema(PLAIN_WORLD_CHECKPOINT_SCHEMA + 1)).toBe(false);
    expect(
      envelopeEngine(
        `{"schema":${FULL_MODEL_CHECKPOINT_SCHEMA},"engine":"${CURRENT_ENGINE_VERSION}"}`,
      ),
    ).toBe(CURRENT_ENGINE_VERSION);
    expect(envelopeEngine(`{"schema":${PLAIN_WORLD_CHECKPOINT_SCHEMA + 1},"engine":"3.0.0"}`)).toBe(
      undefined,
    );
  });

  it('writes every world in the plain-world container', () => {
    expect(checkpointSchemaFor()).toBe(PLAIN_WORLD_CHECKPOINT_SCHEMA);
  });
});

describe('the match-time coordinate (→MATCH-12)', () => {
  const frame = (
    minute: number,
    period: MatchFrame['period'],
    extra: Partial<MatchFrame> = {},
  ): MatchFrame => ({
    minute,
    score: { home: 0, away: 0 },
    metrics: [[], []],
    ball: [0, 0],
    side: 0,
    player: 0,
    action: '',
    period,
    label: String(minute),
    pace: 1,
    onPitch: [[], []],
    ...extra,
  });
  const track = (n: number) => Array.from({ length: n }, (): [number, number, number] => [0, 0, 0]);

  it('validates aligned monotonic path timestamps', () => {
    const timed = [
      frame(1, 1, { startSeconds: 0, ballTrack: track(3), ballTimes: [0, 2.5, 60] }),
      frame(2, 1, { startSeconds: 60, ballTrack: track(2), ballTimes: [61, 70] }),
      // The second half may start after a gap; no path runs across it.
      frame(46, 2, { startSeconds: 2880, ballTrack: track(1), ballTimes: [2880] }),
    ];
    expect(frameTimeIssues(timed)).toEqual([]);
    // Legacy frames keep their equal-interval decoding.
    expect(frameTimeIssues([frame(1, 1, { ballTrack: track(3) })])).toEqual([]);

    const broken = (frames: MatchFrame[]) => expect(frameTimeIssues(frames)).not.toEqual([]);
    broken([frame(1, 1, { startSeconds: 0, ballTrack: track(3), ballTimes: [0, 1] })]);
    broken([frame(1, 1, { startSeconds: 0, ballTrack: track(2), ballTimes: [5, 5] })]);
    broken([frame(1, 1, { startSeconds: 0, ballTrack: track(2), ballTimes: [5, 3] })]);
    broken([frame(1, 1, { startSeconds: 0, ballTrack: track(1), ballTimes: [61] })]);
    broken([frame(1, 1, { startSeconds: 0 }), frame(2, 1, { startSeconds: 61 })]);
    broken([frame(46, 2, { startSeconds: 2880 }), frame(45, 1, { startSeconds: 2940 })]);
    broken([frame(1, 1, { startSeconds: 0 }), frame(2, 1)]);
    broken([frame(1, 1, { ballTrack: track(1), ballTimes: [0] })]);
    const sample = (elapsedSeconds: number) => ({
      elapsedSeconds,
      ball: [0, 0] as [number, number],
      players: [[], []] as MatchFrame['players'] & object,
    });
    broken([frame(1, 1, { startSeconds: 0, motion: [sample(10), sample(5)] })]);
    broken([frame(1, 1, { startSeconds: 0, motion: [sample(75)] })]);
  });
});
