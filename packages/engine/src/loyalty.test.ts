import { describe, expect, it } from 'vitest';
import type { FreeAgent } from '../../contracts/src/types';
import { loyaltyTerm } from './loyalty';
import { foundSquads } from './persisted-squads';
import { intakeNpcYouth } from './npc-careers';
import { promoteYouth } from './academy';
import { signFreeAgentAtClose } from './free-agents';
import { joinClub, makePlayer } from './world';
import { worldMarketFixture } from './world-market.testkit';

function fixture() {
  const w = worldMarketFixture();
  w.clubs[2]!.representative = true;
  foundSquads(w);
  return w;
}

describe('club tenure and loyalty (→CLUB-53/54)', () => {
  it('weights elapsed seasons, caps the tenure part and adds the academy origin', () => {
    const p = makePlayer('ENG', 'loyalty', 'p', 1930, 60, 'CM', 20);
    joinClub(p, 'founding', 1930);
    p.personality.loyalty = 5;
    expect(loyaltyTerm(p, 1930)).toBe(0);
    expect(loyaltyTerm(p, 1932)).toBeCloseTo(0.6);
    expect(loyaltyTerm(p, 1940)).toBe(3);
    expect(loyaltyTerm(p, 1990)).toBe(3);
    p.graduate = true;
    expect(loyaltyTerm(p, 1990)).toBe(4);
    p.personality.loyalty = 1;
    expect(loyaltyTerm(p, 1990)).toBe(0);
    delete p.personality.loyalty;
    expect(loyaltyTerm(p, 1990)).toBe(2);
    const free: FreeAgent = { ...p, freeSince: 1990 };
    expect(loyaltyTerm(free, 1990)).toBe(0);
    delete p.joined;
    expect(loyaltyTerm(p, 1990)).toBe(0.5);
    expect(p.joined).toBeUndefined();
    expect(p.personality.loyalty).toBeUndefined();
  });

  it('records 1930 founding tenure for every NPC and academy origins for new intake', () => {
    const w = worldMarketFixture();
    w.year = 1930;
    w.clubs[2]!.representative = true;
    foundSquads(w);
    const c = w.clubs[1]!,
      founding = w.squads![c.id]!;
    expect(founding.every((p) => p.joined === 1930 && !p.graduate)).toBe(true);
    const old = new Set(founding.map((p) => p.id));
    intakeNpcYouth(w, c, 1931);
    const youth = w.squads![c.id]!.filter((p) => !old.has(p.id));
    expect(youth.length).toBeGreaterThan(0);
    expect(youth.every((p) => p.joined === 1931 && p.graduate)).toBe(true);
  });

  it('our actual academy promotion joins as a graduate', () => {
    const w = fixture();
    const p = makePlayer('ENG', w.seed, 'own:academy:test', w.year, 40, 'CM', 18);
    w.academy = { players: [p] };
    promoteYouth(w, p.id);
    expect(w.players.find((one) => one.id === p.id)).toMatchObject({
      joined: w.year,
      graduate: true,
    });
  });

  it('our actual free signing starts tenure again and retains a recorded own academy origin', () => {
    const w = fixture();
    const p = makePlayer('ENG', w.seed, 'own:former', w.year, 40, 'CB', 22);
    p.joined = w.year - 4;
    p.graduate = true;
    w.players.push({ ...p, status: 'sold' });
    w.clubs[0]!.country = 'ESP';
    w.year = 2001;
    p.born = w.year - 22;
    for (const row of w.players) row.born = p.born;
    while (w.players.filter((row) => row.status === 'active').length < 25)
      w.players.push({ ...w.players[1]!, id: `counted:${w.players.length}` });
    w.freeAgents = [{ ...p, freeSince: w.year }];
    const signed = signFreeAgentAtClose(w, 'DF', 99);
    expect(signed && typeof signed !== 'string').toBe(true);
    const live = w.players.find((one) => one.id === p.id)!;
    expect(live.joined).toBe(w.year);
    expect(live.graduate).toBe(true);
    expect(w.freeAgents).toEqual([]);
  });

  it('normal signings clear academy status through the shared join boundary', () => {
    const p = fixture().players[0]!;
    joinClub(p, 'academy', 1949);
    joinClub(p, 'abroad', 1950);
    expect(p.joined).toBe(1950);
    expect(p.graduate).toBeUndefined();
  });
});
