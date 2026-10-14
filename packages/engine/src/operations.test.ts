import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  contractSeason,
  createWorld,
  delegated,
  moneyLabel,
  operate,
  ratio,
  simulateSeason,
  staffCandidates,
  transferOffers,
} from './index';
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Owners Athletic',
    color: '#125544',
    seed: 'ops',
    level: 'easy' as const,
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
  it('refuses contract answers without a talk and the old single sponsor', () => {
    const w = world();
    // New clubs leave contract talks to the staff (→STAFF-13); level 4 hands over the manager post.
    expect(delegated(w, 'contracts')).toBe(true);
    operate(w, { type: 'intervention', level: 4 });
    expect(delegated(w, 'manager')).toBe(true);
    const before = structuredClone(w);
    const player = w.players[0].id;
    // Contract answers need a talk the player opened (→CLUB-26).
    expect(() => operate(w, { type: 'contract-offer', player, wage: '1', term: 2 })).toThrow(
      '계약 협상 중인 선수가 아닙니다.',
    );
    expect(() => operate(w, { type: 'contract-decline', player })).toThrow('협상');
    // The single sponsor of rules before 1.16 is signed by slot now (→ECON-8).
    expect(() => operate(w, { type: 'sponsor', kind: 'stable' })).toThrow('자리별');
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
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    expect(() => operate(w, { type: 'sign-sponsor', slot: 'local', offer: 2 })).toThrow('남아');
    const paid = () =>
      w.events
        .filter((e) => e.kind === 'sponsor:local')
        .reduce((sum, e) => sum + BigInt(e.amount!), 0n);
    advanceRound(w);
    const first = paid();
    advanceRound(w);
    // Installments accrue on the slot's one ledger entry of the season.
    expect(w.events.filter((e) => e.kind === 'sponsor:local')).toHaveLength(1);
    expect(paid()).toBeGreaterThan(first);
    expect(first).toBeLessThan(BigInt(w.sponsors![0].annual));
    simulateSeason(w);
    expect(w.players.find((p) => p.id === offer.player.id)?.status).toBe('retired');
  });
  /** A campaign started before rules 1.19, as an older save holds it (→ECON-7). */
  const olderCampaign = (w: ReturnType<typeof world>) =>
    w.campaigns.push({
      id: `${w.year}:${w.round}:outreach`,
      kind: 'outreach',
      cost: '100000',
      started: w.round,
      remaining: 4,
      income: '0',
      fans: 0,
    });
  it('refuses new campaigns, settles one started before and bounds support', () => {
    const w = world();
    expect(() => operate(w, { type: 'campaign', kind: 'outreach' })).toThrow(
      '캠페인은 이제 없어요',
    );
    olderCampaign(w);
    for (let i = 0; i < 4; i++) advanceRound(w);
    expect(w.campaigns).toHaveLength(0);
    expect(w.events.some((e) => e.kind === 'campaign-result')).toBe(true);
    for (let i = 0; i < 3; i++) operate(w, { type: 'support' });
    expect(() => operate(w, { type: 'support' })).toThrow('3회');
  });
  it('settles an older campaign by its round and kind, so earlier commands do not change its result', () => {
    const plain = world(),
      busy = world();
    operate(busy, { type: 'read-inbox' });
    operate(busy, { type: 'intervention', level: 1 });
    operate(busy, { type: 'read-inbox' });
    expect(busy.revision).toBe(plain.revision + 3);
    for (const w of [plain, busy]) {
      olderCampaign(w);
      for (let i = 0; i < 4; i++) advanceRound(w);
    }
    const result = (w: ReturnType<typeof world>) =>
      w.events.find((e) => e.kind === 'campaign-result');
    expect(result(plain)).toBeDefined();
    expect(result(busy)).toEqual(result(plain));
    expect(busy.cash).toBe(plain.cash);
  });
  it('writes amounts in event texts in the app notation, never in raw minor units', () => {
    const w = world();
    w.cash = '999999999';
    const signing = transferOffers(w)[0];
    operate(w, { type: 'recruit', candidate: 0 });
    const signed = w.events.at(-1)!.detail;
    expect(signed).toContain(`연봉 ${moneyLabel(w, signing.player.wage)}`);
    expect(signed).not.toContain(`연봉 ${signing.player.wage}`);
    const coach = staffCandidates(w, 'attack')[2];
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 2 });
    expect(w.events.at(-1)!.detail).toContain(
      `연봉 ${moneyLabel(w, coach.wage)} · 계약 ${contractSeason(coach.until)} 시즌 끝까지 · 계약금 ${moneyLabel(w, coach.fee)}`,
    );
    operate(w, { type: 'release-staff', role: 'attack' });
    const left = BigInt(coach.until - w.year);
    expect(w.events.at(-1)!.detail).toContain(
      `보상금 ${moneyLabel(w, ratio(coach.wage, left, 4n))}`,
    );
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
