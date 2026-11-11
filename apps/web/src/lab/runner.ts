/**
 * The lab worker's engine side (→LAB-4, LAB-9): one lab world per worker, overrides applied for a
 * slice of a run or a watched match and restored after it, each run match a sample the summary reads. Only lab workers and tests
 * import this — it reaches match orchestration.
 */
import {
  withOverrides,
  probeReads,
  restoreDefaults,
} from '../../../../packages/engine/src/tunables';
import {
  createLabWorld,
  leftAtHome,
  playLabMatch,
  watchLabMatch,
  type LabWorld,
} from '../../../../packages/engine/src/lab/match';
import { refreshAttributionRoles } from '../../../../packages/engine/src/aggregate/players';
import { stageFrames } from '../../../../packages/engine/src/staging/frames';
import { ledgerDiagnostics } from '../../../../packages/engine/src/lab/diagnostics';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import {
  generateLabSide,
  labSideFromOvrs,
  labStarterAverage,
  setLabPlayerOvr,
  type LabSide,
} from '../../../../packages/engine/src/lab/sides';
import type { LabSample, Overrides, RejectedOverride } from './protocol';

let world: LabWorld | undefined;
/** The worker's lab world, built on first use. */
export const labWorld = () => (world ??= createLabWorld());

/**
 * Match `index` of a run as a sample (the trace stays behind). Unless `full` (a 1-match run, whose
 * summary lists the match itself), the record crosses the channel without its per-player rows,
 * highlights and own-match material, which the run's tables never read.
 */
export function playLabSample(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
  full = true,
): LabSample {
  const { record, match } = playLabMatch(lab, sides, runSeed, index);
  const kept = { ...record };
  delete kept.material;
  delete kept.appearance;
  if (!full) {
    kept.players = [];
    kept.highlights = [];
    delete kept.lineCounts;
  }
  return {
    index,
    leftHome: leftAtHome(index),
    sample: {
      record: kept,
      ledger: ledgerDiagnostics(match),
      incidentsTracked: true,
      condition: 'lab',
      fixture: record.id,
    },
  };
}

export type SliceOutcome =
  { ok: true; samples: LabSample[] } | { ok: false; rejected: RejectedOverride[] };

/**
 * Plays matches `from`…`from + count - 1` under `overrides`, reporting each finished match; the code's
 * values are back when it returns, also after a failure. A rejected override plays nothing.
 */
export function playSlice(
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  overrides: Overrides,
  from: number,
  count: number,
  progress: (done: number) => void = () => {},
): SliceOutcome {
  const lab = labWorld();
  const outcome = withOverrides(overrides, () => {
    const samples: LabSample[] = [];
    // A 1-match run keeps the match's details (a longer run's 1-match first slice carries them unread).
    const full = from === 0 && count === 1;
    for (let i = 0; i < count; i++) {
      samples.push(playLabSample(lab, sides, runSeed, from + i, full));
      progress(i + 1);
    }
    return samples;
  });
  return outcome.ok ? { ok: true, samples: outcome.value } : outcome;
}

export type WatchOutcome =
  { ok: true; playback: MatchPlayback } | { ok: false; rejected: RejectedOverride[] };

/**
 * 관전 (→LAB-9): match 0 of `seed` and its frames under `overrides`; the code's values are back
 * when it returns, also after a failure. A rejected override plays nothing.
 */
export function playWatch(
  sides: readonly [LabSide, LabSide],
  seed: string,
  overrides: Overrides,
): WatchOutcome {
  const lab = labWorld();
  const outcome = withOverrides(overrides, () => watchLabMatch(lab, sides, seed));
  return outcome.ok ? { ok: true, playback: outcome.value } : outcome;
}

/** The leaves a default 1-match run reads (→LAB-3: the page hides the rest by default). */
export function probeLabReads(): string[] {
  const lab = labWorld();
  const side = (i: 0 | 1, tactic: LabSide['tactic']) =>
    generateLabSide({ side: i, seed: 'probe', tactic, average: 70, spread: 5 });
  restoreDefaults();
  // Every tactic once, each side at home once.
  return [
    ...probeReads(() => {
      refreshAttributionRoles();
      const watched = watchLabMatch(lab, [side(0, 'balanced'), side(1, 'press')], 'probe');
      if (watched.script && watched.staging) {
        const frames = stageFrames(watched.script, watched.staging, watched.record, watched.squads);
        frames.next();
        frames.return(undefined);
      }
      playLabSample(lab, [side(0, 'possession'), side(1, 'counter')], 'probe', 1);
    }),
  ].sort();
}

export { generateLabSide, labSideFromOvrs, labStarterAverage, setLabPlayerOvr };
