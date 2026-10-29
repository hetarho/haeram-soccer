/**
 * Messages between the match lab page and its workers (→LAB-4). Types only: the page imports this
 * without importing engine code (ARCH-4).
 */
import type { MatchSample } from '../../../../scripts/lib/match-parity';
import type { LabSide, LabSideIndex } from '../../../../packages/engine/src/lab/sides';
import type { MatchPlayback, Tactic, World } from '../../../../packages/contracts/src/types';
import type { RunSummary } from './summary';

export type { RunSummary };

export type { LabSide, LabSideIndex };

/** Engine value path → the number a run plays instead of the code's. */
export type Overrides = Readonly<Record<string, number>>;

/**
 * One played match of a run; side 0/1 inside `sample` are home/away as the fixture had them, and
 * `leftHome` maps them back so the summary's side 0 is always left. Shot points stay in their own
 * frame, so the sample is not flipped. Beyond a 1-match run it is trimmed to what the summary reads.
 */
export interface LabSample {
  index: number;
  leftHome: boolean;
  sample: MatchSample;
}

export interface RejectedOverride {
  path: string;
  reason: 'unknown' | 'not-a-number' | 'load-time';
}

export type LabRequest =
  | {
      type: 'run';
      runId: number;
      runSeed: string;
      sides: [LabSide, LabSide];
      overrides: Overrides;
      from: number;
      count: number;
    }
  | { type: 'probe' }
  | {
      type: 'generate';
      requestId: number;
      side: LabSideIndex;
      seed: string;
      tactic: Tactic;
      average: number;
      spread: number;
      /** Rebuild at these OVRs (a stored side); absent draws them. */
      ovrs?: number[];
    }
  | {
      type: 'setOvr';
      requestId: number;
      side: LabSide;
      /** Which side it is (its players' ids follow it). */
      sideIndex: LabSideIndex;
      index: number;
      ovr: number;
    }
  | { type: 'summarize'; runId: number; samples: LabSample[]; sides: [LabSide, LabSide] }
  /** 관전 (→LAB-9): match 0 of `seed` with its frames, under `overrides`. */
  | {
      type: 'watch';
      requestId: number;
      seed: string;
      sides: [LabSide, LabSide];
      overrides: Overrides;
    }
  /** The lab world the match view reads clubs and managers from. */
  | { type: 'world'; requestId: number };

export type LabReply =
  | { type: 'progress'; runId: number; done: number }
  | { type: 'samples'; runId: number; from: number; results: LabSample[] }
  | {
      type: 'failed';
      /** -1 for a request outside a run. */
      runId: number;
      /** The `generate`/`setOvr`/`watch`/`world` request that failed. */
      requestId?: number;
      message: string;
      rejected?: RejectedOverride[];
    }
  | { type: 'reads'; paths: string[] }
  | { type: 'side'; requestId: number; side: LabSide }
  | { type: 'summary'; runId: number; summary: RunSummary }
  | { type: 'playback'; requestId: number; playback: MatchPlayback }
  | { type: 'world'; requestId: number; world: World };
