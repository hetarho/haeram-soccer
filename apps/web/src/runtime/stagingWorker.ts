import { runStaging } from './stagingProgram';
import type { StagingRequest } from './stagingProtocol';

let stop: (() => void) | undefined;
self.onmessage = (event: MessageEvent<StagingRequest | { stop: true }>) => {
  stop?.();
  stop =
    'stop' in event.data ? undefined : runStaging(event.data, (reply) => self.postMessage(reply));
};
