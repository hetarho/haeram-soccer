import { simulateRoundJob, type FixtureReadCopy } from '../../../../packages/engine/src/round-jobs';
import type { World } from '../../../../packages/contracts/src/types';
import { invalidateNpcSquads } from '../../../../packages/engine/src/world';
import type { HelperJob, HelperReply } from './helperPool';
import { FIXTURE_HELPER_PROTOCOL, FixtureReplicaReader } from './fixtureReplica';
/** Plays one share of a round's other fixtures from its read copy; a failure is answered, never thrown. */
export function createFixtureHelper(
  simulate: typeof simulateRoundJob = simulateRoundJob,
  invalidate: (copy: FixtureReadCopy) => void = (copy) => invalidateNpcSquads(copy as World),
) {
  const reader = new FixtureReplicaReader();
  return (job: HelperJob): HelperReply => {
    const envelope = {
      protocol: FIXTURE_HELPER_PROTOCOL,
      session: job?.session,
      id: job?.id,
      worldRevision: job?.worldRevision,
    };
    try {
      const { copy, rosterChanged } = reader.apply(job);
      if (rosterChanged) invalidate(copy);
      return {
        ...envelope,
        revision: reader.revision,
        results: job.jobs.map((roundJob) => simulate(copy, roundJob)),
      };
    } catch (error) {
      reader.clear();
      return { ...envelope, revision: 0, error: String(error).slice(0, 1600) };
    }
  };
}
/** Compatibility for a single initial snapshot; incremental channels use their own factory. */
export function answer(job: HelperJob): HelperReply {
  return createFixtureHelper()(job);
}
/** The helper's end of its channel to the engine worker (a MessagePort in the browser). */
interface EnginePort {
  onmessage: ((event: { data: HelperJob }) => void) | null;
  postMessage(reply: HelperReply): void;
}
/** Answers the engine worker's shares on its port, one at a time. */
export function serve(port: EnginePort) {
  const answer = createFixtureHelper();
  port.onmessage = ({ data }) => port.postMessage(answer(data));
}
// As a module worker the client sends the port to the engine worker first; imported elsewhere
// (tests, the Node bench) nothing listens.
if ('WorkerGlobalScope' in globalThis)
  self.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'port') serve(event.data.port);
  };
