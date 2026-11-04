import { describe, it, expect } from 'vitest';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import { canonical } from '../../../../packages/contracts/src/index';
import type { Club, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { careerDate, openEmployment } from '../../../../packages/engine/src/person-careers';
import { clubStaffMember } from '../../../../packages/engine/src/club-staff';
import { hireStaff, staffCandidates } from '../../../../packages/engine/src/staff';
import { zeroMetrics } from '../../../../packages/engine/src/primitives';
import { seasonAfter, seasonFrom } from '../../../../packages/engine/src/wartime';
import { personCareer } from './personCareer';
import { Host } from './host';
import { requestSchema } from './protocol';
import { req, startedHost } from './host.testkit';
const world = () => careerWorld({ country: 'ENG', seed: 'career-read' });
const request = (id: string, person: string) => ({
  protocol: 1,
  session: 'read-career',
  requestId: id,
  expectedRevision: -1,
  generation: 1,
  parentGeneration: 0,
  body: { type: 'person-career', person },
});
/**
 * A season archive holding `club`'s division only: `club` on `points`, its division mates on 10–30
 * points each, so it finishes first on 99 and last on 0.
 */
function archive(w: World, year: number, club: Club, points: number): SeasonArchive {
  const index = (c: Club) => w.clubs.indexOf(c),
    mates = w.clubs.filter(
      (c) =>
        c.country === club.country &&
        c.tier === club.tier &&
        c.group === club.group &&
        c !== club &&
        !c.representative,
    );
  return {
    year,
    tier: 0,
    group: 0,
    rank: 0,
    points: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    cash: '0',
    currency: w.currency,
    income: '0',
    expense: '0',
    fans: 0,
    rating: 0,
    manager: '',
    metrics: zeroMetrics(),
    standings: [
      [index(club), club.tier, club.group, points, points ? 50 : 0, points ? 10 : 60],
      ...mates.map((c, i) => [index(c), c.tier, c.group, 10 + (i % 20), 20, 20]),
    ],
    champions: [],
    europe: [],
  };
}
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
  it('reads a moved coach’s tenures with each season’s archived finish, none past the archive (→STAFF-50)', async () => {
    const h = new Host();
    h.world = world();
    const w = h.world;
    w.cash = '999999999';
    // An ablest holder of a club who has held his post since before the archive's first season.
    const offer = staffCandidates(w, 'attack').find(
      (o) =>
        o.source === 'club' &&
        clubStaffMember(
          w,
          w.clubs.find((c) => c.id === o.club)!,
          'attack',
        ).since < 1947,
    )!;
    const club = w.clubs.find((c) => c.id === offer.club)!,
      since = clubStaffMember(w, club, 'attack').since;
    // A derived holder has no record until he moves.
    expect(personCareer(w, offer.id)).toBeUndefined();
    expect((await h.handle(request('derived', offer.id))).ok).toBe(false);
    // The archive keeps 1947/48 (first) and 1948/49 (last); 1949/50 has no row of his club.
    w.history = [
      archive(w, 1947, club, 99),
      archive(w, 1948, club, 0),
      { ...archive(w, 1949, club, 50), standings: [] },
    ];
    w.calendar = { day: 3 };
    hireStaff(w, 'attack', 0, 2, offer.id);
    const before = canonical(w),
      detail = personCareer(w, offer.id)!;
    expect(canonical(w)).toBe(before);
    const mates = archive(w, 1948, club, 0).standings.length;
    // Every season he held the post: none before the archive (nor the war's), the archived
    // finishes, none for a season the archive holds no row of his club in, and this one playing.
    const held: number[] = [];
    for (let year = seasonFrom(since); year <= w.year; year = seasonAfter(year)) held.push(year);
    expect(detail.tenures).toHaveLength(2);
    expect(detail.tenures[0]).toMatchObject({ job: 0, role: 'attack', club: club.id });
    expect(detail.tenures[0]!.seasons.map((season) => season.year)).toEqual(held);
    const byYear = new Map(detail.tenures[0]!.seasons.map((season) => [season.year, season]));
    for (const year of held.filter((year) => year < 1947))
      expect(byYear.get(year)).toEqual({ year });
    expect(byYear.get(1947)).toEqual({
      year: 1947,
      finish: { tier: club.tier, group: club.group, place: 1 },
    });
    expect(byYear.get(1948)).toEqual({
      year: 1948,
      finish: { tier: club.tier, group: club.group, place: mates },
    });
    expect(byYear.get(1949)).toEqual({ year: 1949 });
    expect(byYear.get(w.year)).toEqual({ year: w.year, current: true });
    // With us since this season's day 3.
    expect(detail.person.employment[1]).toEqual({
      role: 'attack',
      club: w.playerClub,
      from: careerDate(w),
    });
    expect(detail.tenures[1]).toEqual({
      job: 1,
      role: 'attack',
      club: w.playerClub,
      seasons: [{ year: w.year, current: true }],
    });
    // Nothing is stored: the same read again, from the worker as from here.
    const reply = await h.handle(request('moved', offer.id));
    expect(reply.personCareer!.tenures).toEqual(detail.tenures);
    expect(canonical(w)).toBe(before);
  });
  it('uses canonical details while ordinary views omit the registry and answers ahead of queued mutation', async () => {
    const { host: h, reply: started } = await startedHost('read-project');
    expect(started.view!.world.people).toBeUndefined();
    const w = h.world!,
      id = w.players.find((p) => w.people?.[p.id])!.id;
    const pending = h.handle(
      req('step', w.revision, { type: 'command', command: { type: 'advance-days', days: 3 } }),
    );
    const reply = await h.handle(req('while-running', -1, { type: 'person-career', person: id }));
    expect(reply.personCareer!.person.id).toBe(id);
    expect(w.receiptIds).not.toContain('while-running');
    await pending;
  });
});
