import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { Host } from '../../apps/web/src/runtime/host';
import { canonical } from '../../packages/contracts/src/index';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import type { World } from '../../packages/contracts/src/types';
import { advanceRound, trackingBoundary } from '../../packages/engine/src/index';
import {
  ACTIVATION_FOUNDING,
  assertCompleteModel,
  modelEvidence,
  writerActivation,
} from './full-model-workload';
import { DISABLED_RELEASE, ENABLED_RELEASE } from './releases';
import { simulatedWorld } from './worlds';

/** A supported career founded before the release, three rounds in on the pre-feature model. */
const preRelease = () => simulatedWorld(ACTIVATION_FOUNDING, { rounds: 3 }, DISABLED_RELEASE);
/** The writer tab's load of `raw` under `release`, as the client sends it (→SAVE-3/23). */
async function writerLoad(raw: string, release: typeof ENABLED_RELEASE) {
  const host = new Host(undefined, { release });
  const reply = await host.handle({
    protocol: 1,
    session: 'workload',
    requestId: 'load',
    expectedRevision: -1,
    generation: 2,
    parentGeneration: 1,
    body: { type: 'inspect', raw, activate: true, upgrade: true },
  });
  expect(reply.ok, reply.error).toBe(true);
  return { host, reply };
}

describe('full-model workload (T286; →SAVE-23, HIST-17)', () => {
  it('writerActivation is what the host writer load holds and writes', async () => {
    const legacy = preRelease();
    expect(legacy.matchModel).toBeUndefined();
    const { host, reply } = await writerLoad(await encode(legacy, 1, 0), ENABLED_RELEASE);
    const predicted = writerActivation(legacy, ENABLED_RELEASE);
    expect(canonical(host.world)).toBe(canonical(predicted));
    expect(reply.upgraded).toBe(true);
    expect(canonical((await decode(reply.raw!)).world)).toBe(canonical(predicted));
    expect(predicted.revision).toBe(legacy.revision + 1);
    expect(predicted.matchModel).toMatchObject({
      coverage: 'activation',
      trackedFrom: trackingBoundary(legacy),
      activated: { revision: predicted.revision },
    });
    // A release that is off loads the career as stored, and the replica refuses it.
    const off = await writerLoad(await encode(legacy, 1, 0), DISABLED_RELEASE);
    expect(off.reply.upgraded).toBeUndefined();
    expect(canonical(off.host.world)).toBe(canonical(legacy));
    expect(() => writerActivation(legacy, DISABLED_RELEASE)).toThrow(/does not activate/);
    expect(() => writerActivation(predicted, ENABLED_RELEASE)).toThrow(/does not activate/);
  });

  it('reads complete aggregates and records from founding and from a mid-season activation', () => {
    const founded = simulatedWorld(ACTIVATION_FOUNDING, { rounds: 3 }, ENABLED_RELEASE);
    const tracked = assertCompleteModel(founded, 'founding');
    expect(tracked.model).toMatchObject({ revision: MATCH_MODEL_REVISION, coverage: 'founding' });
    expect(tracked.npcSeason!.competitions).toBeGreaterThan(0);
    expect(tracked.npcSeason!.clubRows).toBeGreaterThan(0);
    expect(tracked.npcSeason!.playerRows).toBeGreaterThan(tracked.npcSeason!.clubRows);
    expect(tracked.fullRecords).toBe(founded.ownMatches.length);
    expect(tracked.preFeatureRecords).toBe(0);

    // Activated mid-season: earlier own matches keep their pre-feature records, newer are complete.
    const legacy = preRelease();
    const activated = writerActivation(legacy, ENABLED_RELEASE);
    advanceRound(activated, undefined, false);
    const before = legacy.ownMatches.length;
    const evidence = assertCompleteModel(activated, 'activation', before);
    expect(evidence.preFeatureRecords).toBe(before);
    expect(evidence.fullRecords).toBe(activated.ownMatches.length - before);
    expect(evidence.fullRecords).toBeGreaterThan(0);
    expect(canonical(activated.ownMatches.slice(0, before))).toBe(canonical(legacy.ownMatches));

    // Each missing part is named.
    const fails = (w: World, coverage: 'founding' | 'activation', from = 0) =>
      expect(() => assertCompleteModel(w, coverage, from));
    fails(legacy, 'activation').toThrow(/no released model recorded/);
    fails(founded, 'activation').toThrow(/coverage founding/);
    fails(activated, 'activation').toThrow(/without a complete record/);
    const broken = structuredClone(founded);
    delete broken.ownMatches.at(-1)!.detail;
    fails(broken, 'founding').toThrow(/1 complete records without their counters/);
    const closed = structuredClone(founded);
    delete closed.npcSeason;
    fails(closed, 'founding').toThrow(/no open season ledger/);
    expect(modelEvidence(legacy)).toMatchObject({ model: null, npcSeason: null, fullRecords: 0 });
  });
});
