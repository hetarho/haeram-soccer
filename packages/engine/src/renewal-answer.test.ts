import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { canonical } from '../../contracts/src/index';
import { validateWorld } from '../../contracts/src/schema';
import {
  renewalAnswer,
  renewalChance,
  renewalContext,
  type RenewalContext,
} from './renewal-answer';
import { higherReputationBid, pruneRenewalBids, recordRenewalBid } from './renewal-bids';
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { joinClub, startingSquad, divisionLevel } from './world';
import { restoreLoanStint } from './npc-continuity';
import { renewNpcContracts, NPC_RENEWAL_FLOW } from './npc-careers';
import { transferWindowDays } from './transfer-window';
import { random } from './primitives';
import * as primitives from './primitives';

const context: RenewalContext = {
  floor: '100',
  offer: '100',
  divisionsAbove: 0,
  ambition: 3,
  age: 25,
  higherBid: false,
  starts: true,
  loyalty: 0,
  distress: false,
};
function fixture() {
  const w = worldMarketFixture();
  w.clubs[2]!.representative = true;
  foundSquads(w);
  const c = w.clubs[1]!;
  c.books = { seasons: [], cash: '99999999999999', debt: '0' };
  const players = w.squads![c.id]!;
  for (const p of players) {
    p.until = w.year + 3;
    p.potential = 0;
    p.born = w.year - 25;
  }
  return { w, c, players, p: startingSquad(w, c)[0]! };
}
afterEach(() => {
  vi.restoreAllMocks();
  delete NPC_RENEWAL_FLOW.observe;
});

describe('shared renewal answer (CLUB-54)', () => {
  it.each([
    [{ offer: '200' }, 'wage', 1.5 * Math.log(2)],
    [{ offer: '300' }, 'wage', 1.5 * Math.log(2.5)],
    [{ divisionsAbove: 2, ambition: 5 }, 'division', -3.6],
    [{ divisionsAbove: 2, ambition: 5, age: 31 }, 'division', -1.8],
    [{ higherBid: true }, 'higherBid', -0.6],
    [{ higherBid: true, age: 31 }, 'higherBid', -0.3],
    [{ starts: false }, 'playingTime', -0.9],
    [{ age: 30 }, 'age', 0.5],
    [{ age: 32 }, 'age', 0.5],
    [{ age: 33 }, 'age', 1],
    [{ loyalty: 2 }, 'loyalty', 2],
    [{ distress: true }, 'distress', -0.5],
  ] as const)('reads factor %s', (patch, factor, expected) => {
    const read = renewalChance({ ...context, ...patch });
    expect(read.lines.find((line) => line.factor === factor)?.delta).toBeCloseTo(expected);
    expect(read.chance).toBeCloseTo(1 / (1 + Math.exp(-read.logOdds)));
  });
  it('refuses below floor and uses only the player/season/real-window draw, even after a JSON reload', () => {
    const { w, p } = fixture();
    w.calendar = { day: transferWindowDays(w.year).winterClose + 1 };
    const before = canonical(w);
    const read = renewalAnswer(w, p, context);
    expect(read.accept).toBe(random(`${w.seed}:renew:${p.id}:${w.year}:winter`)() < read.chance);
    expect(renewalAnswer(JSON.parse(JSON.stringify(w)), p, context)).toEqual(read);
    expect(renewalAnswer(w, p, { ...context, offer: '99' }).accept).toBe(false);
    expect(canonical(w)).toBe(before);
  });
  it('reads the actual player, ability tier, current XI, personal loyalty and distress', () => {
    const { w, c, p } = fixture();
    c.tier = 2;
    p.joined = w.year - 10;
    p.graduate = true;
    p.personality.loyalty = 5;
    c.books!.distress = { stage: 1 };
    for (const a of ATTRIBUTES) p.attrs[a] = 85;
    const read = renewalContext(w, c, p, '100');
    expect(read.starts).toBe(true);
    expect(read.loyalty).toBe(4);
    expect(read.distress).toBe(true);
    expect(read.divisionsAbove).toBeGreaterThan(0);
  });
});

describe('bounded actual bid facts', () => {
  it('keeps this and the preceding window across a year turn, comparing current club reputation', () => {
    const { w, c, p } = fixture();
    const buyer = w.clubs[0]!;
    buyer.reputation = 80;
    recordRenewalBid(w, p, c, buyer);
    expect(higherReputationBid(w, p, c)).toBe(true);
    c.reputation = 90;
    expect(higherReputationBid(w, p, c)).toBe(false);
    c.reputation = 40;
    w.calendar = { day: transferWindowDays(w.year).winterOpen };
    recordRenewalBid(w, p, c, buyer);
    expect(p.renewalBids).toHaveLength(2);
    w.year++;
    w.calendar.day = 0;
    pruneRenewalBids(w, p, c);
    expect(p.renewalBids).toHaveLength(1);
    expect(p.renewalBids![0]!.window).toBe('winter');
    expect(higherReputationBid(w, p, c)).toBe(true);
    // The optional schema fact survives serialization without inventing anything for legacy saves.
    const saved = JSON.parse(JSON.stringify(w));
    saved.catalogHash = 'a'.repeat(64);
    delete saved.people;
    for (let i = 0; i < 7; i++)
      saved.clubs.push({ ...w.clubs[2], id: `dummy-${i}`, representative: true });
    // Validate with the real schema; synthetic catalog metadata does not require a catalog.
    expect(validateWorld(saved).squads![c.id]!.find((q) => q.id === p.id)!.renewalBids).toEqual(
      p.renewalBids,
    );
    w.calendar.day = transferWindowDays(w.year).winterOpen;
    pruneRenewalBids(w, p, c);
    expect(p.renewalBids).toBeUndefined();
    expect(higherReputationBid(w, p, c)).toBe(false);
  });
  it('drops abandoned signing and loan stints, and recovers legacy own bids only for the current stint', () => {
    const { w, c, p } = fixture();
    const buyer = w.clubs[0]!;
    buyer.reputation = 80;
    recordRenewalBid(w, p, c, buyer);
    joinClub(p, 'domestic', w.year);
    expect(p.renewalBids).toBeUndefined();
    w.bids = [
      {
        id: 'legacy',
        playerId: p.id,
        club: c.id,
        direction: 'out',
        fee: '1',
        year: w.year,
        day: 1,
        due: 2,
        status: 'rejected',
      },
    ];
    expect(higherReputationBid(w, p, c)).toBe(true);
    w.playerRecords = {
      [p.id]: { moves: [{ year: w.year, day: 2, from: buyer.id, to: c.id, fee: '0' }] },
    };
    expect(higherReputationBid(w, p, c)).toBe(false);
    recordRenewalBid(w, p, c, buyer);
    restoreLoanStint(w, p, c.id);
    expect(p.renewalBids).toBeUndefined();
  });
});

describe('NPC close renewal offers', () => {
  it('offers a 32-year-old starter one season and does not touch an unexpired contract', () => {
    const { w, c, p } = fixture();
    p.until = w.year;
    p.born = w.year + 1 - 32;
    const original = primitives.random;
    vi.spyOn(primitives, 'random').mockImplementation((key) =>
      key.includes(':renew:') ? () => 0 : original(key),
    );
    const events: unknown[] = [];
    NPC_RENEWAL_FLOW.observe = (e) => {
      expect(Object.isFrozen(e)).toBe(true);
      events.push(e);
    };
    const running = w.squads![c.id]!.find((q) => q.id !== p.id)!;
    const wage = running.wage,
      until = running.until;
    renewNpcContracts(w, c);
    expect(p.until).toBe(w.year + 1);
    expect(running).toMatchObject({ wage, until });
    expect(events).toEqual([
      { club: c.id, kind: 'offered' },
      { club: c.id, kind: 'accepted' },
    ]);
  });
  it('offers a young prospect five above the division and releases uncovered surplus', () => {
    const { w, c, players } = fixture();
    const prospect = players[players.length - 1]!;
    const surplus = { ...structuredClone(prospect), id: 'surplus' };
    prospect.born = w.year + 1 - 22;
    prospect.potential = divisionLevel(c.tier) + 5;
    prospect.until = w.year;
    surplus.potential = 0;
    surplus.until = w.year;
    w.squads![c.id]!.push(surplus);
    const original = primitives.random;
    vi.spyOn(primitives, 'random').mockImplementation((key) =>
      key.includes(':renew:') ? () => 0 : original(key),
    );
    renewNpcContracts(w, c);
    expect(prospect.until).toBe(w.year + 3);
    expect(w.freeAgents?.some((p) => p.id === surplus.id)).toBe(true);
    expect(w.freeAgents?.some((p) => p.id === prospect.id)).toBe(false);
  });
  it('keeps a running contract and releases a refusing player only at its actual expiry', () => {
    const { w, c, p } = fixture();
    p.until = w.year + 1;
    const original = primitives.random;
    vi.spyOn(primitives, 'random').mockImplementation((key) =>
      key.includes(':renew:') ? () => 0.999999 : original(key),
    );
    const events: string[] = [];
    NPC_RENEWAL_FLOW.observe = (e) => events.push(e.kind);
    renewNpcContracts(w, c);
    expect(events).toEqual([]);
    expect(w.squads![c.id]).toContain(p);
    renewNpcContracts(w, c, w.year + 2);
    expect(events).toEqual(['offered', 'refused']);
    expect(w.squads![c.id]!.some((q) => q.id === p.id)).toBe(false);
    expect(w.freeAgents?.some((q) => q.id === p.id)).toBe(true);
  });
});
