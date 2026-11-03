import { expect } from 'vitest';
import { Host } from './host';
import type { Body } from './protocol';
import { canonical } from '../../../../packages/contracts/src/index';
import type { StartChoice } from '../../../../packages/contracts/src/owner';
import type { World } from '../../../../packages/contracts/src/types';
import { MATCH_MODEL_RELEASE, type MatchModelRelease } from '../../../../packages/engine/src/index';
import { generateHistory } from '../../../../packages/engine/src/history';
import { clubListings } from '../../../../packages/engine/src/listing';
import { takeOver } from '../../../../packages/engine/src/takeover';
/** The career (`careerWorld`, `simulatedWorld`) of the tests that build worlds to import. */
export const input = { country: 'ENG' as const, seed: 'worker' };
export const req = (id: string, revision: number, body: Body) => ({
  protocol: 1,
  session: 'session',
  requestId: id,
  expectedRevision: revision,
  generation: 1,
  parentGeneration: 0,
  body,
});
/**
 * The start the runtime tests play (→WEB-2): 석유 재벌 with no trait buying in 1930, when the world
 * plays no season first — the e2e `DEFAULT_START` on its own seed.
 */
export const START: StartChoice = { tier: 'oil', traits: [], decade: 1930, seed: 'worker' };
const startOf = (seed: string, choice: Partial<StartChoice>): StartChoice => ({
  ...START,
  ...choice,
  seed,
});
/**
 * A host that has started a game as a player does (→WEB-15): `generate` with `START` on `seed`
 * (and `choice`), then `take-over` of the club `clubListings` names first that the fortune pays,
 * the e2e rule. `host` is the host to start in, for a test that wires its own (a codec port, a
 * release, a progress callback). Returns the host and the take-over reply.
 */
export async function startedHost(
  seed = START.seed,
  choice: Partial<StartChoice> = {},
  host = new Host(),
) {
  const generated = await host.handle(
    req('generate', -1, { type: 'generate', choice: startOf(seed, choice) }),
  );
  if (!generated.ok) throw new Error(generated.error);
  const club = generated.start!.listings.find((listing) => listing.affordable);
  if (!club) throw new Error('the fortune pays for no club');
  const reply = await host.handle(req('take-over', -1, { type: 'take-over', clubId: club.clubId }));
  if (!reply.ok) throw new Error(reply.error);
  return { host, reply };
}
/**
 * The world `startedHost(seed, choice)` takes over in a host on `release`, built in the engine
 * without a host: the start of a world a test plays on before handing it over with `playOn`.
 */
export function startedWorld(
  seed = START.seed,
  choice: Partial<StartChoice> = {},
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
): World {
  const start = startOf(seed, choice);
  const world = generateHistory(start.seed, start.decade, () => {});
  const club = clubListings(world, start.tier).find((listing) => listing.affordable)!;
  return takeOver(world, club.clubId, start, undefined, release);
}
/**
 * Gives a host just started by `startedHost` under `release` (the host's, default the switch as it
 * stands) the world that start grows into after `played` (built once from `startedWorld`, cached),
 * as if simulated in place: same world, same receipts.
 */
export function playOn(h: Host, played: World, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  expect(canonical({ ...h.world!, receiptIds: [] })).toBe(
    canonical(startedWorld(START.seed, {}, release)),
  );
  played.receiptIds = h.world!.receiptIds;
  h.world = played;
}
