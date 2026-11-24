import { it } from 'vitest';
import { RETAINED_REPLAY_TIMEOUT, replayRetainedEvents } from './feature-replay.retained.testkit';

// The batch half of the retained replay; feature-replay.retained.test.ts holds the daily half.
it(
  'keeps identical ordered facts across batch/manual paths with profile/history reads and save reloads (retained career)',
  () => replayRetainedEvents('batch'),
  RETAINED_REPLAY_TIMEOUT,
);
