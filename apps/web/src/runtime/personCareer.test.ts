import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { canonical } from '../../../../packages/contracts/src/index';
import { openEmployment } from '../../../../packages/engine/src/person-careers';
import { personCareer } from './personCareer';
import { Host } from './host';
import { requestSchema } from './protocol';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Career Reads',
    color: '#224466',
    seed: 'career-read',
    level: 'normal',
  });
const request = (id: string, person: string) => ({
  protocol: 1,
  session: 'read-career',
  requestId: id,
  expectedRevision: -1,
  generation: 1,
  parentGeneration: 0,
  body: { type: 'person-career', person },
});
describe('on-demand retained person career', () => {
  it('validates bounded person IDs and refuses unknown people', async () => {
    for (const id of ['', 'x'.repeat(101)])
      expect(requestSchema.safeParse(request('bad', id)).success).toBe(false);
    const h = new Host();
    h.world = world();
    const before = canonical(h.world);
    expect((await h.handle(request('unknown', 'not-a-person'))).ok).toBe(false);
    expect(canonical(h.world)).toBe(before);
  });
  it('reads retained full facts without publishing a view, revision or receipt and returns an isolated DTO', async () => {
    const h = new Host();
    h.world = world();
    const w = h.world,
      p = w.players[0],
      person = w.people![p.id];
    openEmployment(w, p.id, 'assistant', w.playerClub, { year: w.year, day: 0 });
    w.calendar = { day: 1 };
    const before = canonical(w),
      reply = await h.handle(request('own', p.id));
    expect(reply.ok).toBe(true);
    expect(reply.view).toBeUndefined();
    expect(reply.personCareer).toMatchObject({
      person: { id: p.id, born: p.born },
      service: { days: 1 },
      overlap: true,
      ownPlayingTotals: p.career,
    });
    expect(canonical(w)).toBe(before);
    reply.personCareer!.person.name = 'Changed copy';
    expect(person.name).toBe(p.name);
    const npc = Object.values(w.people!).find((p) => !p.formerOwn)!;
    expect(personCareer(w, npc.id)!.ownPlayingTotals).toBeUndefined();
  });
  it('uses canonical details while ordinary views omit the registry and answers ahead of queued mutation', async () => {
    const h = new Host();
    const input = {
      country: 'ENG' as const,
      name: 'Canonical career',
      color: '#224466',
      seed: 'read-project',
      level: 'normal' as const,
    };
    const found = await h.handle({
      ...request('found', 'unused'),
      body: { type: 'found', input },
      expectedRevision: -1,
    });
    expect(found.view!.world.people).toBeUndefined();
    const w = h.world!,
      id = w.players[0].id;
    const pending = h.handle({
      ...request('step', 'unused'),
      body: { type: 'command', command: { type: 'advance-days', days: 3 } },
      expectedRevision: w.revision,
    });
    const reply = await h.handle(request('while-running', id));
    expect(reply.personCareer!.person.id).toBe(id);
    expect(w.receiptIds).not.toContain('while-running');
    await pending;
  });
});
