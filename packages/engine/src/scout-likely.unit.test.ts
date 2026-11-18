import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { canonical } from '../../contracts/src/index';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { basicStaff } from './staff';
import { SCOUT_LIST, transferOffers, reachOffers } from './scout-search';
import {
  termsChance,
  termsContext,
  resolvedTermsContext,
  termsSearchContext,
} from './personal-terms';
import { requestCandidates } from './signings';
import { clubPlayer } from './world-market';
import { worldMarketPage } from './world-market';

function fixture(tier = 2) {
  const w = worldMarketFixture();
  const [own, top, second] = w.clubs;
  own!.tier = tier;
  own!.reputation = tier === 0 ? 99 : 20;
  top!.country = second!.country = 'ENG';
  top!.reputation = 90;
  second!.tier = 1;
  second!.reputation = 25;
  w.squads = {};
  w.staff = basicStaff(w).map((s) =>
    s.role === 'scout' ? { ...s, ability: 85, trait: undefined } : s,
  );
  const stars = marketCandidate(w, top!, 'CM', 25);
  const willing = marketCandidate(w, second!, 'CM', 25);
  for (const [p, level] of [
    [stars, 75],
    [willing, 70],
  ] as const) {
    for (const a of ATTRIBUTES) p.attrs[a] = level;
    p.potential = level;
    p.personality.ambition = 5;
  }
  const chance = (id: string, clubId: string) =>
    termsChance(termsContext(w, { playerId: id, clubId, step: 1 })!).chance;
  return { w, stars, willing, chance, top: top!, second: second! };
}

describe('likely takers in the chief scout list (→CLUB-51)', () => {
  it('lists a willing second-tier player before a stronger top-flight player who would refuse', () => {
    const { w, stars, willing, chance, top, second } = fixture();
    expect(chance(stars.id, top.id)).toBeLessThan(SCOUT_LIST.likelyChance);
    expect(chance(willing.id, second.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    const before = canonical(w);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([willing.id, stars.id]);
    expect(canonical(w)).toBe(before);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([willing.id, stars.id]);
  });

  it('retains the sporting order for a top-flight club when both players would come', () => {
    const { w, stars, willing, chance, top, second } = fixture(0);
    expect(chance(stars.id, top.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    expect(chance(willing.id, second.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([stars.id, willing.id]);
  });

  it('keeps the owner’s world-market search unfiltered and ordered by its requested measure', () => {
    const { w, stars, willing } = fixture();
    transferOffers(w);
    const page = worldMarketPage(w, {
      world: w.id,
      line: 'MF',
      sort: 'ovr',
      direction: 'desc',
      page: 0,
      pageSize: 50,
    });
    expect(page.items.filter((o) => !o.own).map((o) => o.player.id)).toEqual([
      stars.id,
      willing.id,
    ]);
  });
  it('keeps director request bands and sporting ranks after the reach uses willingness', () => {
    const { w, stars, willing } = fixture();
    expect(reachOffers(w).map((o) => o.player.id)).toEqual([willing.id, stars.id]);
    const request = { kind: 'short' as const, line: 'MF' as const };
    expect(requestCandidates(w, request).map(({ offer }) => offer.player.id)).toEqual([
      stars.id,
      willing.id,
    ]);
    expect(requestCandidates(w, { ...request, pick: willing.id })[0]!.offer.player.id).toBe(
      willing.id,
    );
  });

  it('shares exact demand contexts for club and free players, independently of an owner wage step', () => {
    const { w } = fixture();
    marketCandidate(w, undefined, 'CM');
    const context = termsSearchContext(w);
    for (const offer of reachOffers(w)) {
      const source = offer.source;
      const club = source?.kind === 'club' ? w.clubs.find((c) => c.id === source.club) : undefined;
      const player = club
        ? clubPlayer(w, club, offer.player.id)!
        : w.freeAgents!.find((p) => p.id === offer.player.id)!;
      const terms = { playerId: player.id, clubId: club?.id, step: 1 };
      expect(resolvedTermsContext(w, { player, club, offer, step: 1 }, context)).toEqual(
        termsContext(w, terms),
      );
      expect(termsContext(w, { ...terms, step: 2 })!.offer).toBe(
        (BigInt(offer.player.wage) * 2n).toString(),
      );
    }
  });

  it('refreshes both caches for same-revision reputation, tactic, XI and Europe changes', () => {
    const { w, stars } = fixture();
    const changes = [
      () => {
        w.clubs[0]!.reputation = 99;
      },
      () => {
        w.clubs[1]!.reputation = 20;
      },
      () => {
        w.tactic = 'press';
      },
      () => {
        w.players[0]!.attrs.reflexes = 10;
      },
      () => {
        w.europe.push({
          key: 'ucl',
          name: 'European Cup',
          clubs: [w.playerClub],
          fixtures: [],
          field: 1,
          format: 'knockout',
          games: 1,
          stage: 'final',
          standings: {},
        });
      },
    ];
    for (const change of changes) {
      const listed = transferOffers(w),
        reached = reachOffers(w),
        revision = w.revision;
      expect(transferOffers(w)).toBe(listed);
      expect(reachOffers(w)).toBe(reached);
      change();
      expect(w.revision).toBe(revision);
      expect(transferOffers(w)).not.toBe(listed);
      expect(reachOffers(w)).not.toBe(reached);
      const fresh = structuredClone(w);
      expect(transferOffers(w)).toEqual(transferOffers(fresh));
      expect(reachOffers(w)).toEqual(reachOffers(fresh));
    }
    expect(transferOffers(w)[0]!.player.id).toBe(stars.id);
  });
});
