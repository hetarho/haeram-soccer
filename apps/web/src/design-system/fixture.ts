import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
/** Node/Vite SSR only. No browser storage, persisted games or live client workers. */
import { preparedWorld } from '../../../../tests/fixtures/prepared-world';
import { Host } from '../runtime/host';
import { requestSchema, type Request } from '../runtime/protocol';
import { archivePlayback } from '../entities/match';

const READS = new Set([
  'archive',
  'full-stats',
  'league-fixtures',
  'manager-history',
  'club-records',
  'person-career',
  'head-to-head',
  'club-profile',
  'player-profile',
  'recruitment-history',
  'mediation-preview',
  'world-market',
  'world-market-detail',
]);
let serial = 0;
const host = new Host();
const request = (body: Request['body']) => ({
  protocol: 1,
  session: 'design-system',
  requestId: `preview-${++serial}`,
  expectedRevision: host.world?.revision ?? -1,
  generation: 1,
  parentGeneration: 0,
  body,
});
const ready = (async () => {
  const world = preparedWorld('manager-journey');
  world.id = 'design-system-sample';
  world.critical = undefined;
  world.settings = { ...world.settings!, mode: 'manual' };
  host.world = world;
  const reply = await host.handle(
    request({ type: 'command', command: { type: 'settings', settings: world.settings } }),
  );
  if (!reply.ok || !reply.view)
    throw new Error(reply.error ?? sourceMessage('copy.fixture.a74e657053'));
  const record = world.ownMatches.at(-1)!;
  return { view: reply.view, playback: archivePlayback(record) };
})();

export const sampleData = () => ready;
export async function sampleRead(body: unknown) {
  await ready;
  const parsed = requestSchema.parse(request(body as Request['body']));
  if (!READS.has(parsed.body.type)) throw new Error(sourceMessage('copy.fixture.4c05fb7499'));
  return host.handle(parsed);
}
