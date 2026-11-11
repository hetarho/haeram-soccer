import { afterEach, expect, it, vi } from 'vitest';
import { STAGING_CONFIG } from '../../../../packages/engine/src/staging/config';
import { tunableLeaves, tunableDefault } from '../../../../packages/engine/src/tunables';
import type { StagingReply } from '../runtime/stagingProtocol';
import { labFrames, runLabStaging, type LabStagingRequest } from './stagingProgram';

const fake = vi.hoisted(() => ({ fail: false }));
vi.mock('../../../../packages/engine/src/staging/frames', () => ({
  stageFrames: function* () {
    for (let minute = 0; minute < 4; minute++) {
      if (fake.fail) throw new Error('synthetic failure');
      yield { minute, gap: STAGING_CONFIG.stage.kickGap };
    }
  },
}));
afterEach(() => {
  fake.fail = false;
  vi.useRealTimers();
});
const restored = () =>
  expect(tunableLeaves().every((l) => l.value === tunableDefault(l.path))).toBe(true);

it('keeps staging overrides across bounded batches and restores defaults between every yield', async () => {
  vi.useFakeTimers();
  const replies: StagingReply[] = [];
  runLabStaging(
    {
      id: 1,
      from: 0,
      overrides: { 'STAGING_CONFIG.stage.kickGap': 12, 'AGGREGATE_CONFIG.shots.scale': 0 },
    } as unknown as LabStagingRequest,
    (reply) => {
      restored();
      replies.push(reply);
    },
  );
  await vi.runAllTimersAsync();
  const frames = replies.flatMap((r) => ('frames' in r ? r.frames : []));
  expect(frames).toEqual([0, 1, 2, 3].map((minute) => ({ minute, gap: 12 })));
  expect(replies.at(-1)).toEqual({ id: 1, done: true });
  restored();
});

it('cancellation and a failed step cannot leave an override installed', () => {
  const frames = labFrames({ 'STAGING_CONFIG.stage.kickGap': 12 })(
    ...([] as unknown as Parameters<ReturnType<typeof labFrames>>),
  );
  frames.next();
  restored();
  frames.return(undefined);
  restored();
  fake.fail = true;
  const failed = labFrames({ 'STAGING_CONFIG.stage.kickGap': 13 })(
    ...([] as unknown as Parameters<ReturnType<typeof labFrames>>),
  );
  expect(() => failed.next()).toThrow('synthetic failure');
  restored();
});
