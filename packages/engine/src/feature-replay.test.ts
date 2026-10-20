import { expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { Host } from '../../../apps/web/src/runtime/host';
import { retainedWorkload } from '../../../tests/fixtures/retained-workload';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { createWorld, currentDay, advanceDays } from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { command, facts, readAndReload } from './feature-replay.testkit';

// Each career is its own case with its own limit, in its own file so the two run side by side.
// The new one takes about 11 s and keeps the config's limit; the retained one is in
// feature-replay.retained.test.ts.
for (const retained of [false])
  it(
    `keeps identical ordered facts across daily/manual/batch paths with profile/history reads and save reloads (${retained ? 'retained' : 'new'} career)`,
    async () => {
      // The starting career is setup, built once; the replays below are the test.
      const seed = cachedWorld(`seed:${retained ? 'retained' : 'new'}`, () => {
        const seed = retained
          ? retainedWorkload().w
          : createWorld({
              country: 'ENG',
              name: 'Feature Replay',
              color: '#224466',
              seed: 'feature-replay',
              level: 'easy',
            });
        for (const key of RESPONSIBILITY_KEYS) seed.settings!.responsibilities[key] = 'delegated';
        // Cross the next seasonal boundary in the retained case, keeping its outstanding promise.
        if (retained) advanceDays(seed, 322 - currentDay(seed), undefined, false);
        return seed;
      });
      seed.settings!.mode = 'manual';
      seed.settings!.observations = { matchEve: true, windowOpen: false };
      const manual = new Host(),
        daily = new Host(),
        batch = new Host();
      for (const host of [manual, daily, batch]) host.world = structuredClone(seed);
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
        for (const host of [daily, batch]) {
          const actual = JSON.parse(facts(host.world!)),
            expected = JSON.parse(facts(manual.world!));
          const differences = Object.keys({ ...actual, ...expected }).filter(
            (key) => canonical(actual[key]) !== canonical(expected[key]),
          );
          expect(
            differences,
            'Complete canonical gameplay equality, differing top-level fields',
          ).toEqual([]);
        }
        await readAndReload(manual);
      }
    },
    retained ? 480000 : undefined,
  );
