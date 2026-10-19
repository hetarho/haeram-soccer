import { expect, it } from 'vitest';
import { canonical, type World } from '../../contracts/src/index';
import { Host } from '../../../apps/web/src/runtime/host';
import type { Body } from '../../../apps/web/src/runtime/protocol';
import { encode } from '../../../apps/web/src/adapters/persistence';
import { retainedWorkload } from '../../../tests/fixtures/retained-workload';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { createWorld, currentDay, advanceDays } from './index';

let serial = 0;
async function send(host: Host, body: Body) {
  const reply = await host.handle({
    protocol: 1,
    session: 'feature-replay',
    requestId: `request-${++serial}`,
    expectedRevision: host.world?.revision ?? -1,
    generation: 1,
    parentGeneration: 0,
    body,
  });
  expect(reply.ok, reply.error).toBe(true);
  return reply;
}
const command = (host: Host, command: Extract<Body, { type: 'command' }>['command']) =>
  send(host, { type: 'command', command });
function facts(world: World) {
  const copy = structuredClone(world);
  copy.revision = 0;
  // Command acknowledgements differ with batching; every canonical gameplay fact must match.
  copy.receiptIds = [];
  copy.settings!.mode = 'automatic';
  return canonical(copy);
}
async function readAndReload(host: Host) {
  const before = canonical(host.world!);
  const person = host.world!.players[0].id;
  await send(host, { type: 'person-career', person });
  await send(host, { type: 'recruitment-history' });
  expect(canonical(host.world!)).toBe(before);
  await send(host, { type: 'inspect', raw: await encode(host.world!), activate: true });
  expect(canonical(host.world!)).toBe(before);
}
// Each career is its own case with its own limit. The new one takes about 11 s and keeps the
// config's limit; the retained one is built over three and a half seasons and then crosses a
// season close, which with the own league on the grid engine (T218) takes about 130 s here and
// about twice that in CI's parallel suite (both careers together ran 282 s there), until T224
// cuts the grid's cost.
for (const retained of [false, true])
  it(
    `keeps identical ordered facts across daily/manual/batch paths with profile/history reads and save reloads (${retained ? 'retained' : 'new'} career)`,
    async () => {
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
