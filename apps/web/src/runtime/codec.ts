import { isSaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { checkpoint } from '../adapters/persistence';
import type { CodecJob, CodecResult } from './protocol';
/** Builds and validates one checkpoint; a failure is answered, never thrown, and nothing is written. */
export async function build(job: CodecJob): Promise<CodecResult> {
  try {
    const { raw, envelope } = await checkpoint(job.world, job.generation, job.parentGeneration);
    return { id: job.id, ok: true, revision: job.world.revision, raw, envelope };
  } catch (error) {
    return {
      id: job.id,
      ok: false,
      error: String(error).slice(0, 1600),
      errorCode: isSaveCompatibilityError(error) ? error.code : undefined,
    };
  }
}
/**
 * Takes the engine worker's snapshots from its port one at a time and answers the client; an answer
 * that cannot be delivered is left to the client's watchdog rather than stalling later jobs.
 */
export function serve(port: MessagePort, answer: (result: CodecResult) => void) {
  let queue = Promise.resolve();
  port.onmessage = (event: MessageEvent<CodecJob>) => {
    queue = queue.then(async () => answer(await build(event.data))).catch(() => {});
  };
}
// As a module worker the client sends the port first; imported elsewhere (tests) nothing listens.
if ('WorkerGlobalScope' in globalThis)
  self.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'port') serve(event.data.port, (result) => self.postMessage(result));
  };
