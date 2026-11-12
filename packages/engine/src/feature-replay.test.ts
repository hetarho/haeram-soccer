import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import { MANAGER_HISTORY_CHECKPOINT_SCHEMA } from '../../contracts/src/versions';
import type { World } from '../../contracts/src/types';
import { Host } from '../../../apps/web/src/runtime/host';
import type { Body } from '../../../apps/web/src/runtime/protocol';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import { retainedWorkload } from '../../../tests/fixtures/retained-workload';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { currentDay, advanceDays } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { ENABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { onPreviousRevision } from '../../../tests/fixtures/earlier-saves';
import { command, facts, readAndReload } from './feature-replay.testkit';
import { careerWorld } from './career.testkit';

// Each career is its own case with its own limit, in its own file so the two run side by side.
// The new one takes about 11 s and keeps the config's limit; the retained one is in
// feature-replay.retained.test.ts.
for (const retained of [false])
  it(
    `keeps identical ordered facts across daily/manual/batch paths with profile/history reads and save reloads (${retained ? 'retained' : 'new'} career)`,
    async () => {
      // The starting career is setup, built once; the replays below are the test. A new career
      // plays what new careers play once the release is on, whatever the switch.
      const seed = cachedWorld(`seed:${retained ? 'retained' : 'new'}`, () => {
        const seed = retained
          ? retainedWorkload().w
          : careerWorld({ seed: 'feature-replay' }, ENABLED_RELEASE);
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

describe("a career on the revision before today's (→SAVE-23, HIST-17)", () => {
  const founding = { country: 'ENG' as const, seed: 'feature-replay' };
  let serial = 0;
  async function send(host: Host, body: Body) {
    const reply = await host.handle({
      protocol: 1,
      session: 'activation',
      requestId: `activation-${++serial}`,
      expectedRevision: host.world?.revision ?? -1,
      generation: 1,
      parentGeneration: 0,
      body,
    });
    expect(reply.ok, reply.error).toBe(true);
    return reply;
  }
  const load = (host: Host, raw: string) =>
    send(host, { type: 'inspect', raw, activate: true, upgrade: true });
  /**
   * A supported career three rounds in, saved by the game before this one (its labels name the
   * revision before today's, →SAVE-23), then moved on by its writer and played to an own result.
   */
  let built: Promise<{ before: World; at: World; host: Host }> | undefined;
  const activated = () =>
    (built ??= (async () => {
      const before = onPreviousRevision(structuredClone(simulatedWorld(founding, { rounds: 3 })));
      const host = new Host(undefined, { release: ENABLED_RELEASE });
      await load(host, await encode(before));
      const at = structuredClone(host.world!);
      for (let n = 0; n < 3 && host.world!.ownMatches.length === before.ownMatches.length; n++)
        await send(host, { type: 'command', command: { type: 'advance', rounds: 1 } });
      return { before, at, host };
    })());

  it('reload and import preserve full aggregates and appearances', async () => {
    const { before, host } = await activated();
    const w = host.world!;
    const added = w.ownMatches.slice(before.ownMatches.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.model === MATCH_MODEL_REVISION && m.appearance)).toBe(true);
    expect(w.npcSeason!.competitions.length).toBeGreaterThan(0);
    // A reload follows the recorded model whatever the switch says, and writes nothing.
    const reloaded = new Host();
    expect((await load(reloaded, await encode(w))).upgraded).toBeUndefined();
    // An exported file imported into a writer with the switch on is not activated again.
    const exported = (await send(host, { type: 'export' })).raw!;
    // A tracked career keeps its model data in the manager-history container (→SAVE-23/24).
    expect((await decode(exported)).envelope.schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    const imported = new Host(undefined, { release: ENABLED_RELEASE });
    expect((await load(imported, exported)).upgraded).toBeUndefined();
    for (const copy of [reloaded.world!, imported.world!]) {
      expect(copy.npcSeason).toEqual(w.npcSeason);
      expect(copy.matchModel).toEqual(w.matchModel);
      expect(copy.ownMatches.map((m) => m.appearance)).toEqual(
        w.ownMatches.map((m) => m.appearance),
      );
      expect(canonical(copy)).toBe(canonical(w));
    }
  });
});
