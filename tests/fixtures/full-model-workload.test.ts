import { initializeReadModels } from '../../packages/engine/src/read-models';
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import { Host } from '../../apps/web/src/runtime/host';
import { canonical } from '../../packages/contracts/src/index';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import type { World } from '../../packages/contracts/src/types';
import {
  ACTIVATION_CAREER,
  assertCompleteModel,
  modelEvidence,
  writerActivation,
} from './full-model-workload';
import { onPreviousRevision, withoutMatchModel } from './earlier-saves';
import { ENABLED_RELEASE } from './releases';
import { simulatedWorld } from './worlds';

/**
 * A supported career three rounds in, saved by a game whose released revision was 10: the labels it
 * recorded are the only difference from today's (→SAVE-23); nothing replays them.
 */
const onRevision10 = () => {
  const world = onPreviousRevision(
    structuredClone(simulatedWorld(ACTIVATION_CAREER, { rounds: 3 })),
  );
  initializeReadModels(world);
  return world;
};
/** The writer tab's load of `raw` under `release`, as the client sends it (→SAVE-3/23). */
async function writerLoad(raw: string) {
  const host = new Host(undefined, { release: ENABLED_RELEASE });
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
    const legacy = onRevision10();
    const { host, reply } = await writerLoad(await encode(legacy, 1, 0));
    const predicted = writerActivation(legacy, ENABLED_RELEASE);
    expect(canonical(host.world)).toBe(canonical(predicted));
    expect(reply.upgraded).toBe(true);
    expect(canonical((await decode(reply.raw!)).world)).toBe(canonical(predicted));
    expect(predicted.revision).toBe(legacy.revision + 1);
    // Only the revision moves: its activation, tracking boundary and coverage stay.
    expect(predicted.matchModel).toEqual({
      ...legacy.matchModel!,
      revision: MATCH_MODEL_REVISION,
    });
    expect(canonical(predicted.ownMatches)).toBe(canonical(legacy.ownMatches));
    expect(() => writerActivation(predicted, ENABLED_RELEASE)).toThrow(/does not activate/);
  });

  it('reads complete aggregates and records from the takeover', () => {
    const founded = simulatedWorld(ACTIVATION_CAREER, { rounds: 3 });
    const tracked = assertCompleteModel(founded, 'founding');
    expect(tracked.model).toMatchObject({ revision: MATCH_MODEL_REVISION, coverage: 'founding' });
    expect(tracked.npcSeason!.competitions).toBeGreaterThan(0);
    expect(tracked.npcSeason!.clubRows).toBeGreaterThan(0);
    expect(tracked.npcSeason!.playerRows).toBeGreaterThan(tracked.npcSeason!.clubRows);
    expect(tracked.fullRecords).toBe(founded.ownMatches.length);
    expect(tracked.preFeatureRecords).toBe(0);

    // Each missing part is named.
    const fails = (w: World, coverage: 'founding' | 'activation', from = 0) =>
      expect(() => assertCompleteModel(w, coverage, from));
    const unmodelled = withoutMatchModel(structuredClone(founded));
    fails(unmodelled, 'founding').toThrow(/no released model recorded/);
    fails(founded, 'activation').toThrow(/coverage founding/);
    const broken = structuredClone(founded);
    delete broken.ownMatches.at(-1)!.detail;
    fails(broken, 'founding').toThrow(/1 complete records without their counters/);
    const closed = structuredClone(founded);
    delete closed.npcSeason;
    fails(closed, 'founding').toThrow(/no open season ledger/);
    expect(modelEvidence(unmodelled)).toMatchObject({
      model: null,
      npcSeason: null,
      fullRecords: 0,
    });
  });
});
