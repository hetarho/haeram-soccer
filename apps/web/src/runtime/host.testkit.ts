import { expect } from 'vitest';
import type { Host } from './host';
import type { Body } from './protocol';
import { canonical } from '../../../../packages/contracts/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
export const input = {
  country: 'ENG' as const,
  name: 'Worker Athletic',
  color: '#223344',
  seed: 'worker',
  level: 'normal' as const,
};
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
 * Gives a host that has just founded `input` the world that founding grows into after `played`
 * (built once from the same founding, cached), as if simulated in place: same world, same receipts.
 */
export function playOn(h: Host, played: World) {
  expect(canonical({ ...h.world!, receiptIds: [] })).toBe(canonical(simulatedWorld(input)));
  played.receiptIds = h.world!.receiptIds;
  h.world = played;
}
