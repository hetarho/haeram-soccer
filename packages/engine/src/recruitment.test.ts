import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  activePlayers,
  clubOf,
  createWorld,
  lineupPreset,
  lineupSummary,
  makePlayer,
  nextOwnFixture,
  npcTactic,
  operate,
  operatingCost,
  recruitmentPreview,
  recruitmentRoleNeed,
  simulateMatch,
  startingSquad,
  tacticalProfile,
  transferOffers,
} from './index';

function world(strong = false) {
  const w = createWorld({
    country: 'ENG',
    name: 'Scouting United',
    color: '#224433',
    seed: 'recruitment-preview',
    difficulty: 2,
  });
  w.cash = '999999999999';
  w.tactic = 'possession';
  for (const player of w.players) {
    player.attack =
      player.passing =
      player.defense =
      player.keeper =
      player.stamina =
        strong ? 95 : 25;
    player.fatigue = 0;
  }
  return w;
}

describe('recruitment build and budget previews', () => {
  it('matches real automatic starters, match actors and the exact post-recruitment ledger', () => {
    const w = world(),
      offer = transferOffers(w)[2],
      before = canonical(w),
      preview = recruitmentPreview(w, offer);
    expect(canonical(w)).toBe(before);
    expect(preview.manual).toBe(false);
    expect(preview.willStart).toBe(true);
    expect(preview.strengthDelta).toBeGreaterThan(0);
    expect(preview.fitDelta).toBeGreaterThan(0);
    operate(w, { type: 'recruit', candidate: 2 });
    const starters = startingSquad(w, clubOf(w)),
      fixture = nextOwnFixture(w)!,
      opponent = w.clubs.find(
        (club) => club.id === (fixture.home === w.playerClub ? fixture.away : fixture.home),
      )!;
    expect(lineupSummary(starters).strength).toBe(preview.afterStrength);
    expect(tacticalProfile(starters, w.tactic, npcTactic(opponent)).fit).toBe(preview.afterFit);
    const match = simulateMatch(w, fixture, false, true);
    expect(
      match.record.players.some(
        (player) => player.id === offer.player.id && player.metrics[10] === 90,
      ),
    ).toBe(true);
    expect(w.cash).toBe(preview.cashAfter);
    expect(operatingCost(w)).toBe(preview.annualAfter);
    expect(w.players.find((player) => player.id === offer.player.id)?.wage).toBe(preview.wage);
    expect(w.expense).toBe(preview.fee);
  });

  it('previews optional weakest-role replacement while actual recruitment leaves manual XI intact', () => {
    const w = world(),
      ids = lineupPreset(w, 'strongest');
    operate(w, { type: 'lineup', ids });
    const weak = w.players.find((player) => player.id === ids[6])!;
    weak.attack = weak.passing = weak.defense = weak.stamina = 10;
    weak.fatigue = 80;
    const offer = transferOffers(w)[2],
      before = canonical(w),
      preview = recruitmentPreview(w, offer);
    expect(preview.manual).toBe(true);
    expect(preview.willStart).toBe(false);
    expect(preview.reason).toContain('수동');
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'recruit', candidate: 2 });
    expect(w.lineup).toEqual(ids);
    expect(startingSquad(w, clubOf(w)).map((player) => player.id)).toEqual(ids);
    expect(operatingCost(w)).toBe(preview.annualAfter);
    const optional = [...ids];
    optional[6] = offer.player.id;
    operate(w, { type: 'lineup', ids: optional });
    expect(lineupSummary(startingSquad(w, clubOf(w))).strength).toBe(preview.afterStrength);
  });

  it('discloses wages for a free bench transfer even with zero cash', () => {
    const w = world(true),
      offer = transferOffers(w)[0],
      annual = operatingCost(w);
    w.cash = '0';
    const preview = recruitmentPreview(w, offer);
    expect(offer.fee).toBe('0');
    expect(preview.affordable).toBe(true);
    expect(preview.eligible).toBe(true);
    expect(preview.willStart).toBe(false);
    expect(preview.afterStrength).toBe(preview.beforeStrength);
    expect(preview.cashAfter).toBe('0');
    expect(preview.runwayRounds).toBe(0);
    expect(BigInt(preview.annualAfter)).toBeGreaterThan(BigInt(annual));
    operate(w, { type: 'recruit', candidate: 0 });
    expect(w.cash).toBe('0');
    expect(operatingCost(w)).toBe(preview.annualAfter);
    expect(w.players.find((player) => player.id === offer.player.id)?.wage).toBe(offer.player.wage);
  });

  it('uses actual loan cost and full wages and retains the signed identity after reload', async () => {
    const w = world(),
      offer = transferOffers(w)[3],
      preview = recruitmentPreview(w, offer, true);
    expect(preview.fee).toBe(offer.loanFee);
    expect(preview.wage).toBe(offer.player.wage);
    operate(w, { type: 'recruit', candidate: 3, loan: true });
    expect(w.cash).toBe(preview.cashAfter);
    expect(operatingCost(w)).toBe(preview.annualAfter);
    expect(w.players.find((player) => player.id === offer.player.id)?.loanUntil).toBe(w.year + 1);
    const restored = (await decode(await encode(w, 1, 0))).world;
    const owned = transferOffers(restored)[3];
    expect(owned.player.id).toBe(offer.player.id);
    expect(owned.available).toBe(false);
    expect(recruitmentPreview(restored, owned, true).eligible).toBe(false);
    expect(recruitmentPreview(restored, owned, true)).toEqual(
      recruitmentPreview(w, transferOffers(w)[3], true),
    );
  });

  it('treats negative cash as unaffordable even for free players and rejects paid shortages', () => {
    const w = world(),
      offers = transferOffers(w);
    w.cash = '-1';
    expect(recruitmentPreview(w, offers[0]).affordable).toBe(false);
    expect(recruitmentPreview(w, offers[0]).runwayRounds).toBe(0);
    const before = canonical(w);
    expect(() => operate(w, { type: 'recruit', candidate: 0 })).toThrow('부족');
    expect(canonical(w)).toBe(before);
    w.cash = '0';
    expect(recruitmentPreview(w, offers[2]).affordable).toBe(false);
    expect(recruitmentPreview(w, offers[2]).reason).toContain('부족');
  });

  it('disables full or already signed squads without changing the world', () => {
    const w = world(),
      offer = transferOffers(w)[2];
    for (let index = 0; index < 8; index++)
      w.players.push(makePlayer('ENG', w.seed, `full-roster:${index}`, w.year, 40, 'DEF'));
    expect(activePlayers(w)).toHaveLength(26);
    const before = canonical(w),
      full = recruitmentPreview(w, offer);
    expect(full.eligible).toBe(false);
    expect(full.reason).toContain('26');
    expect(() => operate(w, { type: 'recruit', candidate: 2 })).toThrow('26');
    expect(canonical(w)).toBe(before);
    const signed = world();
    operate(signed, { type: 'recruit', candidate: 2 });
    const stale = recruitmentPreview(signed, offer);
    expect(stale.eligible).toBe(false);
    expect(stale.reason).toContain('계약');
    expect(stale.willStart).toBe(false);
  });

  it('bounds exact fixed-cost runway without projecting any future income', () => {
    const w = world(),
      offer = transferOffers(w)[2],
      annual = BigInt(recruitmentPreview(w, offer).annualAfter);
    w.cash = (BigInt(offer.fee) + annual * 3n).toString();
    expect(recruitmentPreview(w, offer).runwayRounds).toBe(138);
    w.cash = (BigInt(offer.fee) + annual * 3n - 1n).toString();
    expect(recruitmentPreview(w, offer).runwayRounds).toBe(137);
    w.cash = '10000000000000000000000000000000000000';
    const preview = recruitmentPreview(w, offer);
    expect(preview.runwayRounds).toBe(999);
    operate(w, { type: 'recruit', candidate: 2 });
    expect(w.cash).toBe(preview.cashAfter);
  });

  it('keeps seeded identities and candidate indices stable during pure role-need previews', () => {
    const w = world(true);
    for (const player of w.players.filter((player) => player.role === 'GK')) player.keeper = 10;
    const before = canonical(w),
      offers = transferOffers(w),
      original = canonical(offers);
    expect(recruitmentRoleNeed(w)).toBe('GK');
    const mids = offers
      .map((offer, candidate) => ({ offer, candidate }))
      .filter(({ offer }) => offer.player.role === 'MID')
      .sort(
        (a, b) => b.offer.player.potential - a.offer.player.potential || a.candidate - b.candidate,
      );
    for (const { offer, candidate } of mids) {
      recruitmentPreview(w, offer);
      expect(transferOffers(w)[candidate].player.id).toBe(offer.player.id);
    }
    expect(canonical(offers)).toBe(original);
    expect(canonical(w)).toBe(before);
  });
});
