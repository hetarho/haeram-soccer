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
    expect(w.events.filter((e) => e.kind === 'sponsor-payment')).toHaveLength(sponsorIncome.length);
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
});
