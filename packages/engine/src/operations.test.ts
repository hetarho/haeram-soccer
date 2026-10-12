import { describe, expect, it } from 'vitest';
import { createWorld, operate, advanceRound, transferOffers, simulateSeason } from './index';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Owners Athletic',
    color: '#125544',
    seed: 'ops',
    difficulty: 2,
  });
describe('club decisions', () => {
  it('refuses or conditions incompatible requests without applying them and resigns under proud conflict', () => {
    const w = world();
    w.manager.flexibility = 0;
    w.manager.trust = 30;
    w.manager.pride = 90;
    w.manager.philosophy = 'balanced';
    w.tactic = 'balanced';
    operate(w, { type: 'tactics', tactic: 'press', tone: 'respect' });
    expect(w.tactic).toBe('balanced');
    operate(w, { type: 'tactics', tactic: 'press', tone: 'demand' });
    expect(w.manager.interim).toBe(true);
    expect(w.critical).toContain('감독');
  });
  it('accepts flexible requests and blocks identical trust farming', () => {
    const w = world();
    w.manager.flexibility = 100;
    w.manager.trust = 100;
    w.manager.pride = 0;
    operate(w, { type: 'tactics', tactic: 'press', tone: 'evidence' });
    expect(w.tactic).toBe('press');
    expect(() => operate(w, { type: 'tactics', tactic: 'press', tone: 'evidence' })).toThrow(
      '동일',
    );
  });
  it('refuses rules 1.16 commands and chosen terms until their rules land', () => {
    const w = world();
    // New clubs leave contract talks to the staff (→STAFF-13); the new posts can be delegated.
    expect(w.delegation).toMatchObject({ contracts: true });
    operate(w, { type: 'delegate', key: 'manager', value: true });
    expect(w.delegation?.manager).toBe(true);
    const before = structuredClone(w);
    const player = w.players[0].id;
    expect(() => operate(w, { type: 'contract-offer', player, wage: '1', term: 2 })).toThrow(
      'contract-offer 명령은 아직 지원하지 않습니다.',
    );
    expect(() => operate(w, { type: 'contract-decline', player })).toThrow('아직');
    expect(() => operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 })).toThrow('아직');
    expect(() => operate(w, { type: 'manager-rule', rule: 'best' })).toThrow('아직');
    expect(() => operate(w, { type: 'renew-manager', term: 2 })).toThrow('계약 기간');
    expect(() => operate(w, { type: 'hire-staff', role: 'attack', candidate: 0, term: 3 })).toThrow(
      '계약 기간',
    );
    expect(w).toEqual(before);
  });
  it('pays conditional support before switching tactic', () => {
    const w = world();
    w.manager.pending = 'counter';
    w.cash = '0';
    expect(() => operate(w, { type: 'accept-condition' })).toThrow('부족');
    expect(w.manager.pending).toBe('counter');
    operate(w, { type: 'support' });
    const before = BigInt(w.cash);
    operate(w, { type: 'accept-condition' });
    expect(w.tactic).toBe('counter');
    expect(BigInt(w.cash)).toBeLessThan(before);
  });
  it('settles recruitment, loans, sale and sponsorship once', () => {
    const w = world();
    w.cash = '999999999';
    const offer = transferOffers(w)[2];
    const before = BigInt(w.cash);
    operate(w, { type: 'recruit', candidate: 2, loan: true });
    expect(BigInt(w.cash)).toBe(before - BigInt(offer.loanFee));
    expect(() => operate(w, { type: 'recruit', candidate: 2 })).toThrow('이미');
    operate(w, { type: 'sponsor', kind: 'stable' });
    expect(() => operate(w, { type: 'sponsor', kind: 'indexed' })).toThrow('기존');
    advanceRound(w);
    const sponsorIncome = w.events.filter((e) => e.kind === 'sponsor-payment');
    advanceRound(w);
    expect(w.events.filter((e) => e.kind === 'sponsor-payment')).toHaveLength(
      sponsorIncome.length + 1,
    );
    expect(BigInt(sponsorIncome[0].amount!)).toBeLessThan(BigInt(w.sponsor!.annual));
    simulateSeason(w);
    expect(w.players.find((p) => p.id === offer.player.id)?.status).toBe('retired');
  });
  it('resolves campaigns with measured effects and bounds support', () => {
    const w = world();
    operate(w, { type: 'campaign', kind: 'outreach' });
    expect(() => operate(w, { type: 'campaign', kind: 'outreach' })).toThrow('진행');
    for (let i = 0; i < 4; i++) advanceRound(w);
    expect(w.campaigns).toHaveLength(0);
    expect(w.events.some((e) => e.kind === 'campaign-result')).toBe(true);
    for (let i = 0; i < 3; i++) operate(w, { type: 'support' });
    expect(() => operate(w, { type: 'support' })).toThrow('3회');
  });
  it('names a campaign by its round and kind, so earlier commands do not change its result', () => {
    const plain = world(),
      busy = world();
    operate(busy, { type: 'read-inbox' });
    operate(busy, { type: 'delegate', key: 'academy', value: true });
    operate(busy, { type: 'read-inbox' });
    expect(busy.revision).toBe(plain.revision + 3);
    for (const w of [plain, busy]) {
      operate(w, { type: 'campaign', kind: 'outreach' });
      expect(w.campaigns[0].id).toBe(`${w.year}:${w.round}:outreach`);
      for (let i = 0; i < 4; i++) advanceRound(w);
    }
    const result = (w: ReturnType<typeof world>) =>
      w.events.find((e) => e.kind === 'campaign-result');
    expect(result(plain)).toBeDefined();
    expect(result(busy)).toEqual(result(plain));
    expect(busy.cash).toBe(plain.cash);
  });
  it('draws a caretaker by the day and the departures so far, not by earlier commands', () => {
    const resigned = (reads: number) => {
      const w = world();
      for (let i = 0; i < reads; i++) operate(w, { type: 'read-inbox' });
      w.manager.trust = 20;
      w.manager.pride = 90;
      operate(w, { type: 'tactics', tactic: 'press', tone: 'demand' });
      return w.manager;
    };
    const plain = resigned(0);
    expect(plain.interim).toBe(true);
    expect(resigned(3)).toEqual(plain);
  });
});
