import { it } from 'vitest';
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

// Each career is its own case with its own limit, in its own file so the two run side by side.
// The retained one is built over three and a half seasons and then crosses a season close,
// which with the own league on the grid engine (T218) takes about 130 s here and about twice
// that in CI's parallel suite (both careers together ran 282 s there), until T224 cuts the
// grid's cost.
for (const retained of [true])
  it(
    `keeps identical ordered facts across daily/manual/batch paths with profile/history reads and save reloads (${retained ? 'retained' : 'new'} career)`,
    async () => {
      // The starting career is setup, built once (and warmed outside this timer, T771); the
      // replays below are the test. The retained career keeps a playing coach and a former
      // player's second career, on the released model, while feature-replay.test replays a new
      // career.
      const seed = retainedReplaySeed();
      seed.settings!.mode = 'manual';
      seed.settings!.observations = { matchEve: true, windowOpen: false };
      const manual = gameHost(),
        daily = gameHost(),
        batch = gameHost();
      for (const host of [manual, daily, batch]) await openWorld(host, seed);
      batch.world!.settings!.mode = 'automatic';
      for (let stop = 0; stop < 4; stop++) {
        await command(manual, { type: 'next-event' });
        const target = { year: manual.world!.year, day: currentDay(manual.world!) };
        const behind = (host: Host) =>
          host.world!.year < target.year || currentDay(host.world!) < target.day;
        let guard = 0;
        while (behind(daily)) {
          if (++guard > 400) throw Error('Daily replay failed to reach the observed event');
          await command(daily, { type: 'advance-days', days: 1, stop: [] });
          if (guard % 7 === 0) await readAndReload(daily);
        }
        guard = 0;
        while (behind(batch)) {
          if (++guard > 400) throw Error('Batch replay failed to reach the observed event');
          const days =
            batch.world!.year === target.year
              ? Math.min(20, target.day - currentDay(batch.world!))
              : 20;
          await command(batch, { type: 'advance-days', days, stop: ['match'] });
          await readAndReload(batch);
        }
        const expected = facts(manual.world!);
        for (const host of [daily, batch]) expectReplayFacts(host.world!, expected);
        await readAndReload(manual);
      }
    },
    retained ? 480000 : undefined,
  );
