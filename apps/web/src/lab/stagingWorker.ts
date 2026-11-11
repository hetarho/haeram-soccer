import { runLabStaging, type LabStagingRequest } from './stagingProgram';

let stop: (() => void) | undefined;
self.onmessage = (event: MessageEvent<LabStagingRequest | { stop: true }>) => {
  stop?.();
  stop =
    'stop' in event.data
      ? undefined
      : runLabStaging(event.data, (reply) => self.postMessage(reply));
};
