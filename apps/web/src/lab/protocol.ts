/**
 * Messages between the match lab page and its workers (→LAB-4). Types only: the page imports this
 * without importing engine code (ARCH-4).
 */
import type { MatchSample } from '../../../../scripts/lib/match-parity';
import type { LabSide, LabSideIndex } from '../../../../packages/engine/src/lab/sides';
import type { Tactic } from '../../../../packages/contracts/src/types';
import type { RunSummary } from './summary';

export type { RunSummary };

export type { LabSide, LabSideIndex };

/** Engine value path → the number a run plays instead of the code's. */
export type Overrides = Readonly<Record<string, number>>;

/** One played match of a run; side 0/1 inside `sample` are home/away as the fixture had them. */
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
      side: LabSideIndex;
      lab: LabSide;
      index: number;
      ovr: number;
    }
  | { type: 'summarize'; runId: number; samples: LabSample[]; sides: [LabSide, LabSide] };

export type LabReply =
  | { type: 'progress'; runId: number; done: number }
  | { type: 'samples'; runId: number; from: number; results: LabSample[] }
  | { type: 'failed'; runId: number; message: string; rejected?: RejectedOverride[] }
  | { type: 'reads'; paths: string[] }
  | { type: 'side'; requestId: number; side: LabSide }
  | { type: 'summary'; runId: number; summary: RunSummary };
