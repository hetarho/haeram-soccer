import { invalidDetail } from '../script/failure';
import type { MatchScript, ScriptSide, StagingSide } from '../../../contracts/src/match-script';
import { STAGING_CONFIG } from './config';
import { stageFixture, stageScript } from './input';
import { createStage, performance } from './perform';
import type { BallMode, Frame, Phase, StageEvent as InternalEvent, Vec } from './types';
import type { StageState } from './world';

export interface StagingId {
  side: ScriptSide;
  line: number;
}
export interface StageFrame extends Omit<Frame, 'owner' | 'p' | 'present' | 'slots'> {
  owner: StagingId | null;
  /** Positions in record line order; identity never depends on a shirt number or current slot. */
  p: { player: StagingId; at: Vec; slot: number }[];
}
export interface StageEvent extends Omit<InternalEvent, 'actor' | 'other'> {
  actor: StagingId | null;
  other?: StagingId;
}
export type { BallMode, Phase };

/** Private resumable state, never persisted in a career. */
export interface Staging {
  readonly state: StageState;
  readonly program: Generator<void, void>;
  done: boolean;
  eventCursor: number;
}
const identity = (state: StageState, index: number): StagingId | null => {
  const p = state.fixture.players[index];
  return p ? { side: p.team, line: p.line } : null;
};

export function createStaging(
  script: MatchScript,
  sides: readonly [StagingSide, StagingSide],
): Staging {
  const state = createStage(stageScript(script, stageFixture(sides)));
  const program = performance(state);
  const done = program.next().done === true;
  return { state, program, done, eventCursor: 0 };
}

/** Perform through `untilSeconds` of staged time. A non-tick boundary stops at the preceding tick.
 * Returned chunks include each frame/event once, including the initial frame on the first call. */
export function advance(
  staging: Staging,
  untilSeconds: number,
): { frames: StageFrame[]; events: StageEvent[]; done: boolean } {
  if (Number.isNaN(untilSeconds) || untilSeconds < 0) throw invalidDetail('staging:input');
  const { state, program } = staging;
  while (
    !staging.done &&
    Math.round((state.tickCount + 1) * STAGING_CONFIG.tick * 1000) / 1000 <= untilSeconds
  ) {
    staging.done = program.next().done === true;
  }
  const frames = state.frames.map((f): StageFrame => {
    const { present, slots, ...rest } = f;
    return {
      ...rest,
      owner: identity(state, f.owner),
      p: state.fixture.players
        .filter((p) => !present || present.includes(p.index))
        .map((p) => ({
          player: identity(state, p.index)!,
          at: [f.p[p.index * 2], f.p[p.index * 2 + 1]],
          slot: slots?.[p.index] ?? p.slot,
        })),
    };
  });
  const events = state.events.slice(staging.eventCursor).map((e): StageEvent => {
    const { actor, other, ...rest } = e;
    return {
      ...rest,
      actor: identity(state, actor),
      ...(other === undefined ? {} : { other: identity(state, other)! }),
    };
  });
  staging.eventCursor = state.events.length;
  state.frames = [];
  return { frames, events, done: staging.done };
}
