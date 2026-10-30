import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import {
  advanceDays,
  completeRound,
  createWorld,
  MATCH_MODEL_RELEASE,
  prepareRound,
} from '../../../../packages/engine/src/index';
import { currentDay, seasonLength } from '../../../../packages/engine/src/calendar';
import { movePerson } from '../../../../packages/engine/src/npc-continuity';
import { findClub, squad } from '../../../../packages/engine/src/world';
import { createFixtureHelper } from './fixtureHelper';
import { HelperPool, playDay, type HelperJob, type HelperPort } from './helperPool';

/** Real helper code across cloned messages; only thread scheduling is replaced by a microtask. */
function channel() {
  const answer = createFixtureHelper(),
    sent: HelperJob[] = [];
  const port: HelperPort = {
    onmessage: null,
    postMessage(job) {
      const received = structuredClone(job);
      sent.push(received);
      queueMicrotask(() => port.onmessage?.({ data: structuredClone(answer(received)) }));
    },
  };
  return { port, sent };
}
function transfer(w: World) {
  const person = Object.values(w.people ?? {}).find(
    (p) => p.playing === 'active' && p.club && p.club !== w.playerClub && p.origin,
  );
  expect(person).toBeDefined();
  const from = findClub(w, person!.club!),
    to = w.clubs.find((c) => c.id !== from.id && c.id !== w.playerClub)!;
  const player = squad(w, from).find((p) => p.id === person!.id)!;
  expect(player).toBeDefined();
  movePerson(w, player, to.id);
}

describe('incremental fixture helpers through campaign transitions', () => {
  it('matches a complete season, a retained-player transfer, reload and the next season', async () => {
    // Synthetic funding avoids bankruptcy while every club, fixture and business day is simulated.
    let reference = createWorld(
      {
        country: 'BEL',
        name: 'Replica Season',
        color: '#234567',
        seed: 'replica-season',
        level: 'easy',
      },
      MATCH_MODEL_RELEASE,
    );
    reference.cash = '99999999999';
    let helped = structuredClone(reference);
    const year = reference.year,
      maxDays = seasonLength(reference) + 15,
      ports = [channel(), channel()];
    const pool = new HelperPool(ports.map((p) => p.port));
    let days = 0;
    while (reference.year === year || currentDay(reference) < 8) {
      expect(days++).toBeLessThan(maxDays);
      for (const w of [reference, helped]) {
        // The host's explicit acknowledgement resumes an informational critical stop.
        if (w.critical) {
          delete w.critical;
          w.revision++;
        }
      }
      if (days === 29) {
        transfer(reference);
        transfer(helped);
      }
      if (days === 43) {
        reference = structuredClone(reference);
        helped = structuredClone(helped);
      }
      const before = [reference.year, currentDay(reference)];
      advanceDays(reference, 1, undefined, false);
      await playDay(pool, helped, false, { advanceDays, prepareRound, completeRound });
      expect(reference.bankrupt).toBeFalsy();
      expect([reference.year, currentDay(reference)]).not.toEqual(before);
      if (days % 7 === 0 || reference.year !== year)
        expect(canonical(helped)).toBe(canonical(reference));
    }
    expect(helped.year).toBe(year + 1);
    expect(helped.round).toBeGreaterThan(0);
    expect(canonical(helped)).toBe(canonical(reference));
    expect(pool.active).toBe(true);
    for (const p of ports) {
      expect(p.sent.filter((j) => j.copy !== undefined).length).toBeGreaterThanOrEqual(3);
      expect(p.sent.some((j) => j.patch !== undefined)).toBe(true);
      expect(new Set(p.sent.map((j) => j.session)).size).toBe(2);
    }
  });
});
