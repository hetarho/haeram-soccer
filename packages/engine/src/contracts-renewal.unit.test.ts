import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { message } from '../../contracts/src/messages';
import {
  answerPendingContracts,
  contractRenewalChance,
  contractTalks,
  expireContracts,
  offerContract,
  talkFor,
  talkTerms,
} from './contracts';
import { defaultSettings } from './responsibilities';
import { worldMarketFixture } from './world-market.testkit';
import { transferWindowDays } from './transfer-window';
import * as primitives from './primitives';
import { termsReport } from './transfers';

function fixture() {
  const w = worldMarketFixture();
  w.calendar = { day: 0 };
  const p = w.players[0]!;
  for (const q of w.players) q.until = w.year + 5;
  p.until = w.year + 1;
  w.settings = defaultSettings();
  w.cash = w.income = '999999999999999';
  contractTalks(w);
  expect(p.talk).toBeDefined();
  return { w, p };
}
function draw(value: number) {
  const original = primitives.random;
  return vi
    .spyOn(primitives, 'random')
    .mockImplementation((key) => (key.includes(':renew:') ? () => value : original(key)));
}
afterEach(() => vi.restoreAllMocks());

describe('owned renewals use the shared player answer (CLUB-26/54)', () => {
  it('keeps a refusing player on his saved contract, blocks this window, and reopens next window', () => {
    const { w, p } = fixture();
    const before = { wage: p.wage, until: p.until };
    const floor = p.talk!.floor;
    draw(0.999999);
    offerContract(w, p.id, floor, 2);
    expect(p).toMatchObject({
      ...before,
      status: 'active',
      renewalRefused: { year: w.year, window: 'summer', kind: 'renew' },
    });
    expect(p.talk).toBeUndefined();
    expect(p.unhappy).toBeUndefined();
    expect(talkFor(w, p)).toBeUndefined();
    expect(() => offerContract(w, p.id, floor, 2)).toThrow();
    expect(w.inbox!.at(-1)!.detail).toContain('다음 이적시장');
    const loaded = JSON.parse(JSON.stringify(w)) as typeof w;
    const live = loaded.players.find((q) => q.id === p.id)!;
    loaded.calendar!.day = transferWindowDays(w.year).winterOpen - 1;
    contractTalks(loaded);
    expect(live.talk).toBeUndefined();
    loaded.calendar!.day++;
    contractTalks(loaded);
    expect(live.talk).toMatchObject({ kind: 'renew', day: loaded.calendar!.day });
    const wage = live.talk!.floor;
    vi.restoreAllMocks();
    draw(0);
    offerContract(loaded, live.id, wage, 2);
    expect(live.wage).toBe(wage);
    expect(live.renewalRefused).toBeUndefined();
  });
  it('keeps a winter refusal through the close and permits a new approach in next summer', () => {
    const { w, p } = fixture();
    // His improved contract still runs beyond the summer; an actually expiring refuser leaves.
    p.until = w.year + 3;
    p.wage = '1';
    delete p.talk;
    w.calendar!.day = transferWindowDays(w.year).winterOpen;
    contractTalks(w);
    expect(p.talk!.kind).toBe('improve');
    draw(0.999999);
    offerContract(w, p.id, p.talk!.floor, 2);
    w.calendar!.day = transferWindowDays(w.year).winterClose + 1;
    expect(talkFor(w, p)).toBeUndefined();
    w.year++;
    w.calendar!.day = 0;
    contractTalks(w);
    expect(p.talk).toBeDefined();
  });
  it('refuses below the frozen floor without drawing, changing a talk or its terms', () => {
    const { w, p } = fixture();
    const spy = draw(0),
      before = canonical(w);
    expect(() => offerContract(w, p.id, (BigInt(p.talk!.floor) - 1n).toString(), 2)).toThrow();
    expect(canonical(w)).toBe(before);
    expect(spy.mock.calls.filter(([key]) => key.includes(':renew:'))).toEqual([]);
  });
  it('uses exactly the displayed chance for normal and delegated offers and reports the factors', () => {
    for (const value of [0, 0.999999]) {
      const { w, p } = fixture();
      const normal = structuredClone(w),
        own = normal.players.find((q) => q.id === p.id)!;
      w.settings!.responsibilities.contracts = 'delegated';
      w.direction = { renewal: 'keepAll' };
      const chance = contractRenewalChance(w, p, p.talk!);
      expect(contractRenewalChance(normal, own, own.talk!)).toEqual(chance);
      const report = termsReport(chance.chance, chance.lines);
      draw(value);
      offerContract(normal, own.id, own.talk!.floor, 2);
      answerPendingContracts(w);
      expect(!!p.renewalRefused).toBe(!!own.renewalRefused);
      expect(!!p.renewalRefused).toBe(value === 0.999999);
      expect(w.inbox!.at(-1)!.detail).toContain(report);
      for (const line of chance.lines)
        expect(w.inbox!.at(-1)!.detail).toContain(message(line.message, line.params));
      vi.restoreAllMocks();
    }
  });
  it('lets an unrenewed refuser leave free only at his serving contract expiry', () => {
    const { w, p } = fixture();
    draw(0.999999);
    offerContract(w, p.id, p.talk!.floor, 2);
    // No other real club can sign him in this isolated fixture.
    w.clubs = [w.clubs[0]!];
    expireContracts(w);
    expect(p.status).toBe('active');
    expect(w.freeAgents ?? []).toEqual([]);
    w.year++;
    expireContracts(w);
    expect(p.status).toBe('sold');
    expect(p.renewalRefused).toBeUndefined();
    expect(w.freeAgents!.find((q) => q.id === p.id)!.name).toBe(p.name);
    expect(w.events.at(-1)!.amount).toBeUndefined();
  });
  it('does not reread a saved floor when market terms later change', () => {
    const { w, p } = fixture();
    const talk = structuredClone(p.talk!);
    w.morale = 100;
    expect(talkTerms(w, p).floor).not.toBe(talk.floor);
    expect(contractRenewalChance(w, p, p.talk!)).toEqual(contractRenewalChance(w, p, talk));
    draw(0);
    offerContract(w, p.id, talk.floor, 2);
    expect(p.wage).toBe(talk.floor);
  });
});
