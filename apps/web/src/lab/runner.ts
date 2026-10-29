/**
 * The lab worker's engine side (→LAB-4): one lab world per worker, overrides applied for a slice of
 * a run and restored after it, each match a sample the summary reads. Only lab workers and tests
 * import this — it reaches grid execution.
 */
import {
  applyOverrides,
  probeReads,
  restoreDefaults,
} from '../../../../packages/engine/src/grid/tunables';
import {
  createLabWorld,
  leftAtHome,
  playLabMatch,
  type LabWorld,
} from '../../../../packages/engine/src/lab/match';
import {
  generateLabSide,
  labSideFromOvrs,
  setLabPlayerOvr,
  type LabSide,
} from '../../../../packages/engine/src/lab/sides';
import type { LabSample, Overrides, RejectedOverride } from './protocol';

let world: LabWorld | undefined;
/** The worker's lab world, built on first use. */
export const labWorld = () => (world ??= createLabWorld());

/** Match `index` of a run as a sample (the trace stays behind). */
export function playLabSample(
  lab: LabWorld,
  sides: readonly [LabSide, LabSide],
  runSeed: string,
  index: number,
): LabSample {
  const result = playLabMatch(lab, sides, runSeed, index);
  return {
    index,
    leftHome: leftAtHome(index),
    sample: {
      record: result.record,
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: 'lab',
      fixture: result.record.id,
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
  try {
    const outcome = applyOverrides(overrides);
    if (outcome.rejected.length) return { ok: false, rejected: outcome.rejected };
    const samples: LabSample[] = [];
    for (let i = 0; i < count; i++) {
      samples.push(playLabSample(lab, sides, runSeed, from + i));
      progress(i + 1);
    }
    return { ok: true, samples };
  } finally {
    restoreDefaults();
  }
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
      playLabSample(lab, [side(0, 'balanced'), side(1, 'press')], 'probe', 0);
      playLabSample(lab, [side(0, 'possession'), side(1, 'counter')], 'probe', 1);
    }),
  ].sort();
}

export { generateLabSide, labSideFromOvrs, setLabPlayerOvr };
