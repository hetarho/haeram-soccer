import { describe, expect, it } from 'vitest';
import {
  createWorld,
  contractTalks,
  activePlayers,
  pushInbox,
  readInbox,
  seasonDayOf,
} from './index';
import { pendingDecisions, stoppingReasons } from './stopping';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { renewalDay } from './staff';
import type { InboxKind } from '../../contracts/src/types';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Stops',
    color: '#224466',
    seed: 'stopping',
    level: 'normal',
  });
const note = (w: ReturnType<typeof world>, kind: InboxKind, ref?: string) =>
  pushInbox(w, { kind, title: kind, detail: 'report', attention: true, ref });
describe('shared domain-owned stopping policy', () => {
  for (const kind of [
    'staff-report',
    'unhappy',
    'transfer-request',
    'youth-intake',
    'cup',
    'match',
    'finance',
    'contract-talk',
    'incoming-bid',
  ] as const)
    it(`does not turn a ${kind} report into business authority`, () => {
      const w = world();
      note(w, kind);
      expect(stoppingReasons(w)).toEqual([]);
    });
  it('keeps actual player talks after reading and inbox eviction, excludes resolved/delegated talks', () => {
    const w = world();
    w.calendar = { day: seasonDayOf(w.year, 1, 1) };
    const p = activePlayers(w)[0];
    p.until = w.year + 1;
    contractTalks(w);
    expect(pendingDecisions(w).some((i) => i.ref === p.id)).toBe(true);
    readInbox(w);
    for (let i = 0; i < 250; i++) note(w, 'staff-report');
    expect(w.inbox?.some((i) => i.ref === p.id)).toBe(false);
    expect(pendingDecisions(w).some((i) => i.ref === p.id)).toBe(true);
    w.settings!.responsibilities.contracts = 'delegated';
    expect(pendingDecisions(w)).toEqual([]);
    w.settings!.responsibilities.contracts = 'direct';
    delete p.talk;
    expect(pendingDecisions(w).some((i) => i.ref === p.id)).toBe(false);
  });
  it('distinguishes manager renewal from a coach renewal with the same inbox kind', () => {
    const w = world();
    w.calendar = { day: renewalDay(w.year) };
    w.manager.until = w.year + 1;
    const member = w.staff![0];
    member.until = w.year + 1;
    member.wage = '100';
    note(w, 'staff-renewal', w.manager.id);
    note(w, 'staff-renewal', member.id);
    readInbox(w);
    expect(
      pendingDecisions(w)
        .filter((i) => i.kind === 'staff-renewal')
        .map((i) => i.ref),
    ).toEqual([w.manager.id]);
    w.settings!.responsibilities.manager = 'delegated';
    w.settings!.responsibilities.staff = 'direct';
    expect(
      pendingDecisions(w)
        .filter((i) => i.kind === 'staff-renewal')
        .map((i) => i.ref),
    ).toEqual([member.id]);
  });
  it('queries actual bid direction and status independently and groups same-date work', () => {
    const w = world(),
      p = activePlayers(w)[0];
    w.bids = [
      {
        id: 'sale',
        direction: 'in',
        playerId: p.id,
        fee: '10',
        year: w.year,
        day: 0,
        due: 5,
        status: 'pending',
      },
      {
        id: 'buy',
        direction: 'out',
        playerId: 'other',
        fee: '10',
        year: w.year,
        day: 0,
        due: 5,
        status: 'countered',
      },
      {
        id: 'done',
        direction: 'out',
        playerId: 'done',
        fee: '10',
        year: w.year,
        day: 0,
        due: 5,
        status: 'completed',
      },
    ];
    expect(pendingDecisions(w).map((i) => i.ref)).toEqual(['sale', 'buy']);
    expect(pendingDecisions(w).every((i) => i.year === w.year && i.day === 0)).toBe(true);
    w.settings!.responsibilities.sales = 'delegated';
    expect(pendingDecisions(w).map((i) => i.ref)).toEqual(['buy']);
  });
  it('observations are independent of every business responsibility', () => {
    const w = world();
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
    w.calendar = { day: 6 };
    expect(stoppingReasons(w).map((i) => i.kind)).toEqual(['match']);
    w.settings!.observations.matchEve = false;
    expect(stoppingReasons(w)).toEqual([]);
    note(w, 'window-open');
    expect(stoppingReasons(w)).toEqual([]);
    w.settings!.observations.windowOpen = true;
    expect(stoppingReasons(w).map((i) => i.kind)).toEqual(['window-open']);
    w.calendar.day++;
    expect(stoppingReasons(w)).toEqual([]);
  });
  it('retains an actual academy recommendation after the ordinary report disappears', () => {
    const w = world(),
      p = structuredClone(activePlayers(w)[0]);
    w.academy = { players: [p] };
    w.settings!.responsibilities.academy = 'direct';
    w.academyReviews = [{ id: p.id, year: w.year, kind: 'promote' }];
    w.inbox = [];
    expect(pendingDecisions(w).map((i) => i.ref)).toEqual([p.id]);
    w.academy!.players = [];
    expect(pendingDecisions(w)).toEqual([]);
  });
});
