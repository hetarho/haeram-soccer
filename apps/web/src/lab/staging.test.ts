import { afterEach, expect, it, vi } from 'vitest';
import type { StagingRequest } from '../runtime/stagingProtocol';
import { labStagingWorker } from './staging';

afterEach(() => vi.unstubAllGlobals());
it('uses the lab worker entry and freezes its values for replay and resumed batches', () => {
  const postMessage = vi.fn(),
    terminate = vi.fn(),
    made = vi.fn();
  vi.stubGlobal(
    'Worker',
    class {
      onmessage = null;
      onerror = null;
      postMessage = postMessage;
      terminate = terminate;
      constructor(url: URL) {
        made(url.pathname);
      }
    },
  );
  const overrides = { 'STAGING_CONFIG.stage.kickGap': 12 };
  const worker = labStagingWorker(overrides);
  overrides['STAGING_CONFIG.stage.kickGap'] = 5;
  worker.postMessage({ id: 1, from: 0 } as StagingRequest);
  worker.postMessage({ id: 2, from: 2 } as StagingRequest);
  expect(made).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/lab\/stagingWorker.ts$/));
  expect(postMessage.mock.calls).toEqual([
    [{ id: 1, from: 0, overrides: { 'STAGING_CONFIG.stage.kickGap': 12 } }],
    [{ id: 2, from: 2, overrides: { 'STAGING_CONFIG.stage.kickGap': 12 } }],
  ]);
  worker.postMessage({ stop: true });
  expect(postMessage).toHaveBeenLastCalledWith({ stop: true });
  worker.terminate();
  expect(terminate).toHaveBeenCalledOnce();
});
