/** Presentation leaf only: neither the engine host nor the world is imported here. */
import { stageFrames } from '../../../../packages/engine/src/staging/frames';
import { STAGING_BATCH_MINUTES, type StagingReply, type StagingRequest } from './stagingProtocol';

/** The worker and timer fallback run the same bounded program and yield between messages. */
export function runStaging(request: StagingRequest, send: (reply: StagingReply) => void) {
  const frames = stageFrames(request.script, request.staging, request.record, request.squads);
  let from = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    if (stopped) return;
    try {
      const batch = [];
      for (let n = 0; n < STAGING_BATCH_MINUTES; n++) {
        const frame = frames.next();
        if (frame.done) {
          if (batch.length) send({ id: request.id, from: from - batch.length, frames: batch });
          send({ id: request.id, done: true });
          return;
        }
        if (from++ >= request.from) batch.push(frame.value);
      }
      if (batch.length) send({ id: request.id, from: from - batch.length, frames: batch });
      timer = setTimeout(next, 0);
    } catch {
      send({ id: request.id, error: true });
    }
  };
  timer = setTimeout(next, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
    frames.return(undefined);
  };
}
