import { describe, expect, it } from 'vitest';
import { buyOffer, handTo, staffAuthority, wouldJoin } from './testing';
import {
  advanceRound,
  contractSeason,
  isDelegated,
  moneyLabel,
  operate,
  ratio,
  simulateSeason,
  staffCandidates,
  transferOffers,
  yearlyStaff,
} from './index';
import { releaseFixturePlayers } from './player-fixtures.testkit';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
/** The club on the released model: owner operations, not the match model, are the subject. */
const world = () => {
  const w = careerWorld({ seed: 'ops' });
  w.settings = staffAuthority(2);
  return w;
};
describe('club decisions', () => {
  it('refuses contract answers without a talk', () => {
    const w = world();
    // This fixture delegates contracts; handing over everything adds the manager post.
    expect(isDelegated(w, 'contracts')).toBe(true);
    handTo(w, 4);
    expect(isDelegated(w, 'manager')).toBe(true);
    const before = structuredClone(w);
    const player = w.players[0].id;
    // Contract answers need a talk the player opened (→CLUB-26).
    expect(() => operate(w, { type: 'contract-offer', player, wage: '1', term: 2 })).toThrow(
      '계약 협상 중인 선수가 아닙니다.',
    );
    expect(() => operate(w, { type: 'contract-decline', player })).toThrow('협상');
    expect(w).toEqual(before);
  });
  /**
   * Another club's player on loan (his club accepting our bid at the loan fee, he our terms at the
   * 200% step: the first whose seeded answer agrees, →CLUB-53) and the local sponsor, each signed
   * once; the second signing is refused.
   */
  const loanAndSponsor = (w: ReturnType<typeof world>) => {
    w.cash = '999999999';
    const offers = transferOffers(w),
      index = offers.findIndex(
        (o, i) => !o.freeAgent && wouldJoin(w, o.player.id, (c) => buyOffer(c, i, true, 2)),
      ),
      offer = offers[index]!;
    expect(offer).toMatchObject({ freeAgent: false, available: true });
    const before = BigInt(w.cash);
    buyOffer(w, index, true, 2);
    expect(BigInt(w.cash)).toBe(before - BigInt(offer.loanFee));
    const club = offer.source.kind === 'club' ? offer.source.club : '';
    const target = { world: w.id, kind: 'club' as const, clubId: club, playerId: offer.player.id };
    expect(() => operate(w, { type: 'recruit', target })).toThrow('이미');
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    expect(() => operate(w, { type: 'sign-sponsor', slot: 'local', offer: 2 })).toThrow('남아');
    return offer;
  };
  it('settles recruitment, loans, sale and sponsorship once', () => {
    const w = world();
    const offer = loanAndSponsor(w);
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
    // The season's other rounds only lead to its close, where the loan ends: the same world,
    // played on to its final round as the season command plays it, closes live.
    const end = cachedWorld('loan-final-round', () => {
      const w = world();
      loanAndSponsor(w);
      advanceRound(w);
      advanceRound(w);
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      return w;
    });
    simulateSeason(end);
    expect(end.players.find((p) => p.id === offer.player.id)?.status).toBe('sold');
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
  /**
   * An older campaign three of its four rounds in, with the commands' revision before it started:
   * the rounds before its settling one only lead there. `busy` read and changed settings first:
   * its observation stops, not who decides, since a delegation change moves money by design (the
   * 단장 plans a delegated work's money and settings, →ECON-39/40).
   */
  const campaignEve = (busy: boolean) =>
    cachedWorld(`campaign-eve:${busy}`, () => {
      const w = world();
      if (busy) {
        const settings = staffAuthority(2);
        settings.observations = { matchEve: false, windowOpen: true };
        operate(w, { type: 'read-inbox' });
        operate(w, { type: 'settings', settings });
        operate(w, { type: 'read-inbox' });
      }
      const revision = w.revision;
      olderCampaign(w);
      for (let i = 0; i < 3; i++) advanceRound(w);
      return { revision, w };
    });
  it('settles a campaign started before', () => {
    const { w } = campaignEve(false);
    advanceRound(w);
    expect(w.campaigns).toHaveLength(0);
    expect(w.events.some((e) => e.kind === 'campaign-result')).toBe(true);
  });
  it('settles an older campaign by its round and kind, so earlier commands that keep who decides do not change its result (→ECON-40)', () => {
    const quiet = campaignEve(false),
      eager = campaignEve(true);
    expect(eager.revision).toBe(quiet.revision + 3);
    const plain = quiet.w,
      busy = eager.w;
    for (const w of [plain, busy]) advanceRound(w);
    const result = (w: ReturnType<typeof world>) =>
      w.events.find((e) => e.kind === 'campaign-result');
    expect(result(plain)).toBeDefined();
    expect(result(busy)).toEqual(result(plain));
    expect(busy.cash).toBe(plain.cash);
  });
  it('writes amounts in event texts in the app notation, never in raw minor units', () => {
    const w = world();
    w.cash = '999999999';
    releaseFixturePlayers(w);
    // A free agent signs at once, so his signing's line is the last event: the first who agrees to
    // our terms at the 200% step (→CLUB-53), signing on twice his demand.
    const recruit = (copy: typeof w, candidate: number) =>
        operate(copy, { type: 'recruit', candidate, wage: 2 }),
      free = transferOffers(w).findIndex(
        (o, i) => o.freeAgent && wouldJoin(w, o.player.id, (c) => recruit(c, i)),
      ),
      signing = transferOffers(w)[free]!;
    expect(free).toBeGreaterThanOrEqual(0);
    expect(signing).toMatchObject({ available: true, freeAgent: true, fee: '0' });
    recruit(w, free);
    const wage = (BigInt(signing.player.wage) * 2n).toString();
    expect(w.players.find((p) => p.id === signing.player.id)?.wage).toBe(wage);
    const signed = w.events.at(-1)!.detail;
    expect(signed).toContain(`연봉 ${moneyLabel(w, wage)}`);
    expect(signed).not.toContain(`연봉 ${wage}`);
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
      // At trust 0 he resigns (→STAFF-47), as at a season boundary, on this day.
      w.manager.trust = 0;
      yearlyStaff(w);
      return w.manager;
    };
    const plain = resigned(0);
    expect(plain.interim).toBe(true);
    expect(resigned(3)).toEqual(plain);
  });
});
