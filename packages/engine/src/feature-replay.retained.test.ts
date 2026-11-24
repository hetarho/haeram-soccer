import { it } from 'vitest';
import { RETAINED_REPLAY_TIMEOUT, replayRetainedEvents } from './feature-replay.retained.testkit';

// Each career and replay path is its own case with its own limit, in its own file so they run
// side by side. The retained career is built over three and a half seasons and then crosses a
// season close. Under the whole batch, one case replaying daily and batch together reached
// 489-500 s against 480 s (fs24, 261124), so the batch path runs in
// feature-replay.retained-batch.test.ts with its own manual reference.
it(
  'keeps identical ordered facts across daily/manual paths with profile/history reads and save reloads (retained career)',
  () => replayRetainedEvents('daily'),
  RETAINED_REPLAY_TIMEOUT,
);
