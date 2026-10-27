import { simulateRoundJob, type FixtureReadCopy } from '../../../../packages/engine/src/round-jobs';
import type { HelperJob, HelperReply } from './helperPool';
/** Plays one share of a round's other fixtures from its read copy; a failure is answered, never thrown. */
export function answer(job: HelperJob): HelperReply {
  try {
    const copy = JSON.parse(job.copy) as FixtureReadCopy;
    return { id: job.id, results: job.jobs.map((roundJob) => simulateRoundJob(copy, roundJob)) };
  } catch (error) {
    return { id: job.id, error: String(error).slice(0, 1600) };
  }
}
/** The helper's end of its channel to the engine worker (a MessagePort in the browser). */
interface EnginePort {
  onmessage: ((event: { data: HelperJob }) => void) | null;
  postMessage(reply: HelperReply): void;
}
/** Answers the engine worker's shares on its port, one at a time. */
export function serve(port: EnginePort) {
  port.onmessage = ({ data }) => port.postMessage(answer(data));
}
// As a module worker the client sends the port to the engine worker first; imported elsewhere
// (tests, the Node bench) nothing listens.
if ('WorkerGlobalScope' in globalThis)
  self.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'port') serve(event.data.port);
  };
