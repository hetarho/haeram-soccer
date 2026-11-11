import type { MatchFrame, MatchPlayback } from '../../../../packages/contracts/src/types';

/** Match minutes per message/task, never a batch of world computation (ARCH-6). */
export const STAGING_BATCH_MINUTES = 2;
export type StagingRequest = Pick<MatchPlayback, 'record' | 'squads'> & {
  id: number;
  script: NonNullable<MatchPlayback['script']>;
  staging: NonNullable<MatchPlayback['staging']>;
  /** A resumed worker replays deterministically up to the frames already delivered. */
  from: number;
};
export type StagingReply =
  | { id: number; from: number; frames: MatchFrame[] }
  | { id: number; done: true }
  | { id: number; error: true };
