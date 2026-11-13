import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { FreeAgent, Position } from '../../contracts/src/types';
import { npcBooksFixture } from './npc-books.testkit';
import {
  capFreeAgents,
  closeFreeAgents,
  FREE_AGENT_CONFIG,
  joinFreeAgents,
  joinAtClose,
  npcContractTerm,
  refreshFreeAgents,
  takeFreeAgent,
} from './free-agents';
import { foundSquads } from './persisted-squads';
import { intakeNpcYouth, renewNpcContracts } from './npc-careers';
import {
  clubPlayers,
  invalidateNpcSquad,
  makePlayer,
  NPC_SQUAD,
  startingSquad,
  stature,
} from './world';
import { marketWageAt } from './market-prices';
import { npcWageBill } from './books';
import { lineOf } from './player';

function agent(id: string, ability = 50, position: Position = 'CB'): FreeAgent {
  const p = makePlayer('ESP', 'free-unit', id, 1950, ability, position, 24);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  return { ...p, freeSince: 1951 };
}

describe('NPC contracts and need-based free agents on isolated squads', () => {
  it('starts a persisted world with no fabricated free agents', () => {
    const { w } = npcBooksFixture();
    expect(w.freeAgents ?? []).toEqual([]);
  });

  it('renews an expiring starter at next season division wage, preserving a running contract', () => {
    const { w, c, players } = npcBooksFixture();
    const starter = startingSquad(w, c)[0]!;
    const running = players.find((p) => p !== starter)!;
    const old = { wage: running.wage, until: running.until };
    starter.until = w.year;
    starter.wage = '1';
    c.tier = 1;
    renewNpcContracts(w, c);
    expect(starter.wage).toBe(marketWageAt(c.country, 1951, 1, starter));
    expect(starter.until).toBe(1951 + npcContractTerm(1951 - starter.born) - 1);
    expect(running).toMatchObject(old);
    expect(w.freeAgents ?? []).toEqual([]);
  });

  it('releases an unnecessary expiry, while preserving identity and attributes', () => {
    const { w, c, players } = npcBooksFixture();
    const xi = new Set(startingSquad(w, c).map((p) => p.id));
    const p = players.find(
      (p) =>
        !xi.has(p.id) &&
        players.filter((q) => lineOf(q.position) === lineOf(p.position)).length > 6,
    )!;
    p.until = w.year;
    const before = structuredClone(p);
    renewNpcContracts(w, c);
    expect(clubPlayers(w, c).some((q) => q.id === p.id)).toBe(false);
    expect(w.freeAgents!.find((q) => q.id === p.id)).toMatchObject({
      id: p.id,
      name: before.name,
      born: before.born,
      attrs: before.attrs,
      personality: before.personality,
      potential: before.potential,
      freeSince: 1951,
    });
    expect(w.people![p.id]!.playing).toBe('released');
  });

  it('renews line cover even outside the best XI', () => {
    const { w, c, players } = npcBooksFixture();
    const xi = new Set(startingSquad(w, c).map((p) => p.id));
    const keeper = players.find((p) => p.position === 'GK' && !xi.has(p.id))!;
    w.squads![c.id] = players.filter((p) => p.position !== 'GK' || p === keeper || xi.has(p.id));
    keeper.until = w.year;
    renewNpcContracts(w, c);
    expect(keeper.until).toBeGreaterThan(w.year);
    expect(w.freeAgents ?? []).toEqual([]);
  });

  it('refuses renewals above the limit and permits a contract exactly at it', () => {
    const { w, c } = npcBooksFixture();
    const p = startingSquad(w, c)[0]!;
    p.until = w.year;
    const wage = marketWageAt(c.country, 1951, c.tier, p);
    const budget = npcWageBill(w, c) - BigInt(p.wage) + BigInt(wage);
    c.books = { seasons: [], cash: '0', debt: '0', openingIncome: (budget - 1n).toString() };
    const allowed = structuredClone(w);
    allowed.clubs[1]!.books!.openingIncome = budget.toString();
    renewNpcContracts(w, c);
    expect(w.freeAgents!.some((q) => q.id === p.id)).toBe(true);
    const other = allowed.clubs[1]!;
    renewNpcContracts(allowed, other);
    expect(clubPlayers(allowed, other).find((q) => q.id === p.id)!.wage).toBe(wage);
    expect(allowed.freeAgents ?? []).toEqual([]);
  });

  it('signs the ablest affordable missing line, keeps unique affiliation and records its move', () => {
    const { w, c } = npcBooksFixture();
    w.squads![c.id] = clubPlayers(w, c).filter((p) => p.position !== 'GK');
    while (w.squads![c.id]!.length < NPC_SQUAD.size) {
      const i = w.squads![c.id]!.length;
      w.squads![c.id]!.push(makePlayer('ESP', w.seed, `cover:${i}`, w.year, 40, 'CM', 24));
    }
    invalidateNpcSquad(w, c.id);
    const weak = agent('weak', 40, 'GK'),
      strong = agent('strong', 70, 'GK');
    w.freeAgents = [weak, strong, agent('wrong-line', 90, 'ST')];
    refreshFreeAgents(w);
    const signed = clubPlayers(w, c).filter((p) => ['weak', 'strong'].includes(p.id));
    expect(signed).toHaveLength(2);
    expect(w.people!['strong']!.employment[0]).toMatchObject({ role: 'player', club: c.id });
    expect(w.people!['weak']!.employment[0]).toMatchObject({ role: 'player', club: c.id });
    expect(w.freeAgents!.map((p) => p.id)).toContain('wrong-line');
    expect(signed[0]!.wage).toBe(marketWageAt(c.country, w.year, c.tier, signed[0]!));
    expect(signed.every((p) => !('freeSince' in p))).toBe(true);
  });

  it('skips an unaffordable star for the ablest affordable player', () => {
    const { w, c, players } = npcBooksFixture();
    const keeper = players.find((p) => p.position === 'GK')!;
    w.squads![c.id] = players.filter((p) => p.position !== 'GK' || p === keeper);
    invalidateNpcSquad(w, c.id);
    const cheap = agent('cheap', 30, 'GK'),
      dear = agent('dear', 90, 'GK');
    const wage = marketWageAt(c.country, w.year, c.tier, cheap);
    c.books = {
      seasons: [],
      cash: '0',
      debt: '0',
      openingIncome: (npcWageBill(w, c) + BigInt(wage)).toString(),
    };
    w.freeAgents = [dear, cheap];
    refreshFreeAgents(w);
    expect(clubPlayers(w, c).some((p) => p.id === cheap.id)).toBe(true);
    expect(w.freeAgents!.map((p) => p.id)).toEqual([dear.id]);
    expect(npcWageBill(w, c)).toBe(BigInt(c.books.openingIncome!));
  });

  it('does not sign beyond standing size when every line has cover', () => {
    const { w, c } = npcBooksFixture();
    w.freeAgents = [agent('unneeded', 99)];
    const before = clubPlayers(w, c).map((p) => p.id);
    refreshFreeAgents(w);
    expect(clubPlayers(w, c).map((p) => p.id)).toEqual(before);
    expect(w.freeAgents).toHaveLength(1);
  });

  it('gives the higher-stature club the contested keeper regardless of club array order', () => {
    const { w, c } = npcBooksFixture();
    const rival = { ...c, id: 'ENG:0:0:0', country: 'ENG', levels: undefined };
    c.id = 'ENG:3:0:0';
    w.clubs = [w.clubs[0]!, c, rival];
    delete w.squads;
    foundSquads(w);
    const ranked = [c, rival].sort((a, b) => stature(w.seed, b.id) - stature(w.seed, a.id));
    expect(stature(w.seed, ranked[0]!.id)).toBeGreaterThan(stature(w.seed, ranked[1]!.id));
    w.clubs = [w.clubs[0]!, ranked[1]!, ranked[0]!];
    for (const club of [c, rival])
      w.squads![club.id] = clubPlayers(w, club).filter((p) => p.position !== 'GK');
    w.freeAgents = [agent('contested', 50, 'GK')];
    refreshFreeAgents(w);
    expect(w.people!['contested']!.club).toBe(ranked[0]!.id);
  });

  it('breaks equal stature by the higher offered wage, and respects a full registration list', () => {
    const { w, c } = npcBooksFixture(2005);
    const rival = { ...c, id: 'other', tier: 1, levels: undefined };
    w.clubs = [w.clubs[0]!, rival, c];
    delete w.squads;
    foundSquads(w);
    for (const club of [c, rival])
      w.squads![club.id] = clubPlayers(w, club).filter((p) => p.position !== 'GK');
    expect(stature(w.seed, c.id)).toBe(stature(w.seed, rival.id));
    const p = { ...agent('wage-tie', 50, 'GK'), born: 1980, freeSince: 2005 };
    expect(BigInt(marketWageAt(c.country, w.year, c.tier, p))).toBeGreaterThan(
      BigInt(marketWageAt(rival.country, w.year, rival.tier, p)),
    );
    w.freeAgents = [p];
    refreshFreeAgents(w);
    expect(w.people![p.id]!.club).toBe(c.id);
    const full = clubPlayers(w, rival);
    while (full.length < 40)
      full.push(makePlayer('ESP', w.seed, `full:${full.length}`, 2005, 50, 'CM', 30));
    w.freeAgents = [{ ...p, id: 'over-limit' }];
    // The other club already has both keepers; only the capped squad needs this one.
    w.squads![c.id]!.push(makePlayer('ESP', w.seed, 'second-keeper', 2005, 40, 'GK', 25));
    refreshFreeAgents(w);
    expect(w.freeAgents!.map((p) => p.id)).toEqual(['over-limit']);
    expect(w.squads![rival.id]).toHaveLength(40);
  });

  it('ages an own release without growth, while an NPC release keeps its settled attributes', () => {
    const { w } = npcBooksFixture();
    const p = agent('ageing', 60);
    p.born = w.year - 30;
    const before = structuredClone(p.attrs);
    joinAtClose(w, p);
    const aged = w.freeAgents![0]!;
    expect(aged.attrs.pace).toBeLessThan(before.pace);
    for (const a of ATTRIBUTES) expect(aged.attrs[a]).toBeLessThanOrEqual(before[a]);
    const npc = { ...p, id: 'already-aged', attrs: { ...before } };
    joinFreeAgents(w, npc, w.year + 1);
    expect(w.freeAgents!.find((q) => q.id === npc.id)!.attrs).toEqual(before);
  });

  it('applies the pool cap only after signings, retiring surplus newcomers', () => {
    const { w, c } = npcBooksFixture();
    w.squads![c.id] = clubPlayers(w, c).filter((p) => p.position !== 'GK');
    w.freeAgents = Array.from({ length: FREE_AGENT_CONFIG.cap }, (_, i) => agent(`held:${i}`, 70));
    const keeper = agent('weak-keeper', 25, 'GK');
    joinFreeAgents(w, keeper, w.year + 1);
    joinFreeAgents(w, agent('surplus', 20), w.year + 1);
    expect(w.freeAgents).toHaveLength(FREE_AGENT_CONFIG.cap + 2);
    refreshFreeAgents(w);
    capFreeAgents(w);
    expect(clubPlayers(w, c).some((p) => p.id === keeper.id)).toBe(true);
    expect(w.freeAgents).toHaveLength(FREE_AGENT_CONFIG.cap);
    expect(w.people!['surplus']!.playing).toBe('retired');
  });

  it('retires a player unsigned for a whole season, and leaves no duplicate after taking one', () => {
    const { w } = npcBooksFixture();
    joinFreeAgents(w, agent('old'), w.year);
    joinFreeAgents(w, agent('new'), w.year + 1);
    closeFreeAgents(w, w.year);
    expect(w.people!['old']!.playing).toBe('retired');
    expect(w.freeAgents!.map((p) => p.id)).toEqual(['new']);
    expect(takeFreeAgent(w, 'new')!.id).toBe('new');
    expect(w.freeAgents).toEqual([]);
    expect(takeFreeAgent(w, 'new')).toBeUndefined();
  });

  it('never subjects youth intake to the signing wage limit', () => {
    const { w, c } = npcBooksFixture();
    w.squads![c.id] = [];
    c.books = { seasons: [], cash: '0', debt: '0', openingIncome: '0' };
    intakeNpcYouth(w, c);
    expect(clubPlayers(w, c).length).toBeGreaterThanOrEqual(NPC_SQUAD.size);
    expect(npcWageBill(w, c)).toBeGreaterThan(0n);
  });

  it.each([18, 24, 28, 31, 34])(
    'signs age %i for 1–5 seasons with an age-shortened term',
    (age) => {
      expect(npcContractTerm(age)).toBe(5 - [18, 24, 28, 31, 34].indexOf(age));
    },
  );
});
