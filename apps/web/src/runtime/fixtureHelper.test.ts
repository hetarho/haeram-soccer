import { describe, expect, it, vi } from 'vitest';
import type { Club } from '../../../../packages/contracts/src/types';
import type { FixtureReadCopy } from '../../../../packages/engine/src/fixture-copy';
import type { RoundJobResult } from '../../../../packages/engine/src/round-jobs';
import { createFixtureHelper } from './fixtureHelper';
import { FIXTURE_HELPER_PROTOCOL, FixtureReplicaWriter, type HelperJob } from './fixtureReplica';

describe('served fixture replica', () => {
  it('keeps a private copy, invalidates only changed roster inputs and answers errors without throwing', () => {
    const source = {
      seed: 'helper',
      year: 1975,
      playerClub: 'own',
      clubs: [{ id: 'a', country: 'ENG', strength: 50, tier: 1 } as Club],
    } satisfies FixtureReadCopy;
    const writer = new FixtureReplicaWriter(),
      invalidate = vi.fn();
    const simulate = vi.fn(
      (copy: FixtureReadCopy) =>
        ({ record: { id: copy.seed }, squads: [[], []] }) as unknown as RoundJobResult,
    );
    const answer = createFixtureHelper(simulate, invalidate);
    const send = (id: number) => {
      const encoded = writer.encode(source, id);
      return {
        protocol: FIXTURE_HELPER_PROTOCOL,
        session: 's',
        id,
        worldRevision: 0,
        base: encoded.base,
        ...(encoded.base ? { patch: encoded.patch } : { copy: encoded.snapshot() }),
        jobs: [{ fixture: { id: 'f' }, keep: false }],
      } as HelperJob;
    };
    expect(answer(send(1)).results).toHaveLength(1);
    const resident = simulate.mock.calls[0]![0];
    expect(resident).not.toBe(source);
    expect(invalidate).toHaveBeenCalledTimes(1);
    Reflect.set(source.clubs[0]!, 'cohesion', 5);
    expect(answer(send(2)).results).toHaveLength(1);
    expect(simulate.mock.calls[1]![0]).toBe(resident);
    expect(invalidate).toHaveBeenCalledTimes(1);
    source.clubs[0]!.strength = 60;
    expect(answer(send(3)).results).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
    const bad = send(4);
    bad.base = 99;
    const reply = answer(bad);
    expect(reply.error).toContain('base');
    expect(reply.results).toBeUndefined();
    expect(reply.revision).toBe(0);
  });
});
