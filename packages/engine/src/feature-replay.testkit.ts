import { expect } from 'vitest';
import { canonical, type World } from '../../contracts/src/index';
import { Host } from '../../../apps/web/src/runtime/host';
import type { Body } from '../../../apps/web/src/runtime/protocol';
import { loadWorld } from '../../../apps/web/src/runtime/host.testkit';

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
export function facts(world: World) {
  const copy = structuredClone(world);
  copy.revision = 0;
  // Command acknowledgements differ with batching; every canonical gameplay fact must match.
  copy.receiptIds = [];
  copy.settings!.mode = 'automatic';
  return canonical(copy);
}
export async function readAndReload(host: Host) {
  const before = canonical(host.world!);
  const person = host.world!.players[0].id;
  await send(host, { type: 'person-career', person });
  await send(host, { type: 'recruitment-history' });
  expect(canonical(host.world!)).toBe(before);
  expect((await loadWorld(host, `reload-${++serial}`, host.world!)).ok).toBe(true);
  expect(canonical(host.world!)).toBe(before);
}
