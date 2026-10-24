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
import { createWorld, currentDay, advanceDays, fixtureDay, fullStatsRead } from './index';
import { cachedWorld, ENABLED_RELEASE, simulatedWorld } from '../../../tests/fixtures/worlds';
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

describe('prospective full-model activation (→SAVE-23, HIST-17)', () => {
  const founding = {
    country: 'ENG' as const,
    name: 'Feature Replay',
    color: '#224466',
    seed: 'feature-replay',
    level: 'easy' as const,
  };
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
  /** A supported career three rounds in, activated by its writer, then played to an own result. */
  let built: Promise<{ before: World; at: World; host: Host }> | undefined;
  const activated = () =>
    (built ??= (async () => {
      const before = simulatedWorld(founding, { rounds: 3 });
      const host = new Host(undefined, { release: ENABLED_RELEASE });
      await load(host, await encode(before));
      const at = structuredClone(host.world!);
      for (let n = 0; n < 3 && host.world!.ownMatches.length === before.ownMatches.length; n++)
        await send(host, { type: 'command', command: { type: 'advance', rounds: 1 } });
      return { before, at, host };
    })());

  it('never backfills old statistics', async () => {
    const { before, at, host } = await activated();
    const own = before.fixtures.find(
      (f) => f.home === before.playerClub || f.away === before.playerClub,
    )!;
    const scope = { kind: own.kind as 'league' | 'lower', groupKey: own.groupKey };
    const played = (w: World) =>
      w.fixtures.filter((f) => f.kind === own.kind && f.groupKey === own.groupKey && f.score);
    const earlier = played(before);
    expect(earlier.length).toBeGreaterThan(0);
    // At activation the ledger starts empty at the boundary; earlier fixtures are untracked, not 0.
    expect(fullStatsRead(at, scope)).toEqual({
      year: at.year,
      trackedFrom: at.matchModel!.trackedFrom,
      untracked: earlier.length,
      competition: { ...scope, clubs: [], players: [] },
    });
    // The settled past stays as it was: own records, tables and history.
    expect(at.matchModel!.coverage).toBe('activation');
    expect(canonical(at.ownMatches)).toBe(canonical(before.ownMatches));
    expect(canonical(at.tables)).toBe(canonical(before.tables));
    expect(canonical(at.history)).toBe(canonical(before.history));
    // Played on, only the fixtures from the boundary count.
    const w = host.world!;
    const later = played(w).filter((f) => fixtureDay(f) >= at.matchModel!.trackedFrom.day);
    expect(later.length).toBeGreaterThan(0);
    const read = fullStatsRead(w, scope)!;
    expect(read.untracked).toBe(earlier.length);
    expect(read.competition.clubs.reduce((n, club) => n + club.matches, 0)).toBe(2 * later.length);
    expect(canonical(w.ownMatches.slice(0, before.ownMatches.length))).toBe(
      canonical(before.ownMatches),
    );
  });

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
