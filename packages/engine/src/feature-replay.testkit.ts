import { expect } from 'vitest';
import type { World } from '../../contracts/src/types';
import { worldFacts } from '../../../apps/web/src/adapters/worldRows';
import type { Host } from '../../../apps/web/src/runtime/host';
import type { Body } from '../../../apps/web/src/runtime/protocol';
import { installWorld } from '../../../apps/web/src/runtime/host.testkit';

let serial = 0;
async function send(host: Host, body: Body) {
  const reply = await host.handle({
    protocol: 1,
    session: 'feature-replay',
    requestId: `request-${++serial}`,
    expectedRevision: host.world?.revision ?? -1,
    body,
  });
  expect(reply.ok, reply.error).toBe(true);
  return reply;
}
export const command = (host: Host, command: Extract<Body, { type: 'command' }>['command']) =>
  send(host, { type: 'command', command });
export function facts(world: World): Record<string, unknown> {
  const copy = JSON.parse(worldFacts(world)) as World;
  copy.revision = 0;
  // Command acknowledgements differ with batching; every canonical gameplay fact must match.
  copy.receiptIds = [];
  copy.settings!.mode = 'automatic';
  return { ...copy };
}

export function expectReplayFacts(world: World, expected: Record<string, unknown>) {
  const actual = facts(world);
  // The snapshot's fields are already canonical, so compare just the values of all present keys.
  const differences = Object.keys({ ...actual, ...expected }).filter(
    (key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]),
  );
  expect(differences, 'Complete canonical gameplay equality, differing top-level fields').toEqual(
    [],
  );
}

const gameId = 'game';

async function reopen(host: Host) {
  const reply = await send(host, { type: 'open-game', gameId });
  expect(reply.opened?.found).toBe(true);
}

/** Starts a replay from the same checkpoint in each writer. */
export async function openWorld(host: Host, world: World) {
  await installWorld(host, world, gameId);
  await reopen(host);
}
export async function readAndReload(host: Host) {
  const before = worldFacts(host.world!);
  const person = host.world!.players[0].id;
  await send(host, { type: 'person-career', person });
  await send(host, { type: 'recruitment-history' });
  expect(worldFacts(host.world!)).toBe(before);
  // Reopen the committed database so rows moved out of memory survive subsequent saves.
  await send(host, { type: 'save' });
  await send(host, { type: 'close-game' });
  await reopen(host);
  expect(worldFacts(host.world!)).toBe(before);
}
