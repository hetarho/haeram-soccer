import type { StagingWorker } from '../runtime/staging';
import type { Overrides } from './protocol';

/** A separate lab worker: no overridden module state can reach the game's workers. */
export function labStagingWorker(overrides: Overrides): StagingWorker {
  const frozen = { ...overrides };
  let worker: Worker | undefined;
  try {
    if (typeof Worker !== 'undefined')
      worker = new Worker(new URL('./stagingWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    // The same bounded timer fallback as the game, with the lab's isolated numbers.
  }
  let stop: (() => void) | undefined;
  let serial = 0;
  const port: StagingWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      stop?.();
      const id = ++serial;
      if (worker) {
        worker.postMessage('stop' in message ? message : { ...message, overrides: frozen });
      } else if (!('stop' in message)) {
        void import('./stagingProgram')
          .then(({ runLabStaging }) => {
            if (id === serial)
              stop = runLabStaging({ ...message, overrides: frozen }, (data) =>
                port.onmessage?.({ data } as MessageEvent),
              );
          })
          .catch(() => port.onerror?.({} as ErrorEvent));
      }
    },
    terminate() {
      ++serial;
      stop?.();
      worker?.terminate();
    },
  };
  if (worker) {
    worker.onmessage = (event) => port.onmessage?.(event);
    worker.onerror = (event) => port.onerror?.(event);
  }
  return port;
}
