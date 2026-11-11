/** Lab-only overrides wrap each bounded staging step, including cancellation and failures. */
import type { MatchFrame } from '../../../../packages/contracts/src/types';
import { stageFrames } from '../../../../packages/engine/src/staging/frames';
import { applyOverrides, restoreDefaults } from '../../../../packages/engine/src/tunables';
import { runStaging } from '../runtime/stagingProgram';
import type { StagingReply, StagingRequest } from '../runtime/stagingProtocol';
import type { Overrides } from './protocol';

export type LabStagingRequest = StagingRequest & { overrides: Overrides };

export function labFrames(overrides: Overrides): typeof stageFrames {
  const picture = Object.fromEntries(
    Object.entries(overrides).filter(([path]) => path.startsWith('STAGING_CONFIG.')),
  );
  return function* (...args) {
    const frames = stageFrames(...args);
    try {
      for (;;) {
        let next: IteratorResult<MatchFrame>;
        try {
          const outcome = applyOverrides(picture);
          if (outcome.rejected.length) throw new Error(outcome.rejected[0]!.path);
          next = frames.next();
        } finally {
          restoreDefaults();
        }
        if (next.done) return;
        yield next.value;
      }
    } finally {
      frames.return(undefined);
    }
  };
}

export const runLabStaging = (request: LabStagingRequest, send: (r: StagingReply) => void) =>
  runStaging(request, send, labFrames(request.overrides));
