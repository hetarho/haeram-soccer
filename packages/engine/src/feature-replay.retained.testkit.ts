import type { Host } from '../../../apps/web/src/runtime/host';
import { gameHost } from '../../../apps/web/src/runtime/host.testkit';
import { retainedReplaySeed } from '../../../tests/fixtures/replay-seed';
import { currentDay } from './index';
import {
  command,
  expectReplayFacts,
  facts,
  openWorld,
  readAndReload,
} from './feature-replay.testkit';

export type RetainedReplayPath = 'daily' | 'batch';

/** The retained replay's per-case limit; each path runs in its own file, side by side. */
export const RETAINED_REPLAY_TIMEOUT = 480000;

/**
 * Replays the retained career's first four manual events through one other writer and requires
 * identical ordered facts at every event, with profile/history reads and save reloads on both.
 * The daily and batch writers each compare against their own manual reference, so the two paths
 * run in separate workers instead of one case carrying all three careers.
 */
export async function replayRetainedEvents(path: RetainedReplayPath) {
  // The starting career is setup, built once (and warmed outside this timer, T771); the
  // replays below are the test. The retained career keeps a playing coach and a former
  // player's second career, on the released model, while feature-replay.test replays a new
  // career.
  const seed = retainedReplaySeed();
  seed.settings!.mode = 'manual';
  seed.settings!.observations = { matchEve: true, windowOpen: false };
  const manual = gameHost(),
    replay = gameHost();
  for (const host of [manual, replay]) await openWorld(host, seed);
  if (path === 'batch') replay.world!.settings!.mode = 'automatic';
  for (let stop = 0; stop < 4; stop++) {
    await command(manual, { type: 'next-event' });
    const target = { year: manual.world!.year, day: currentDay(manual.world!) };
    const behind = (host: Host) =>
      host.world!.year < target.year || currentDay(host.world!) < target.day;
    let guard = 0;
    while (behind(replay)) {
      if (++guard > 400)
        throw Error(
          `${path === 'daily' ? 'Daily' : 'Batch'} replay failed to reach the observed event`,
        );
      if (path === 'daily') {
        await command(replay, { type: 'advance-days', days: 1, stop: [] });
        if (guard % 7 === 0) await readAndReload(replay);
      } else {
        const days =
          replay.world!.year === target.year
            ? Math.min(20, target.day - currentDay(replay.world!))
            : 20;
        await command(replay, { type: 'advance-days', days, stop: ['match'] });
        await readAndReload(replay);
      }
    }
    expectReplayFacts(replay.world!, facts(manual.world!));
    await readAndReload(manual);
  }
}
