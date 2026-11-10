import { describe, expect, it, vi } from 'vitest';
import type {
  Line,
  PolicyLevel,
  ScoutOffer,
  Staff,
  StaffTrait,
  World,
} from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { ClubBuild } from '../../contracts/src/build';
import { activePlayers, clubOf, lineOfPlayer, overall } from './player-state';
import { clubById, ownStarters, squad } from './world';
import { associationAccessOrder } from './europe-access';
import { dailyMarket, operate, placeBid } from './index';
import { holdRows } from './testing';
import { world } from './transfers.testkit';
import {
  isForeignCandidate,
  LIST_SPREAD,
  SCOUT_CONFIG,
  SEARCH_CEILING,
  scoutReach,
  transferOffers,
} from './scout-search';
import { REFILL_SALE, unavailableAtClub } from './world-market';
import * as scoutSearch from './scout-search';
import {
  requestCandidates,
  type SigningNeed,
  signingVerdict,
  staffSignings,
  UPGRADE_MEASURE,
  upgradeNeeds,
} from './signings';
import { formationOf, slotOvr } from './player-state';
import { staffAuthority } from './testing';
import { seasonDayOf } from './calendar';

/** The chief scout at `ability` (vacant when undefined), as a hired one stands. */
function scoutAt(w: World, ability: number | undefined, trait?: StaffTrait) {
  const others = (w.staff ?? []).filter((member) => member.role !== 'scout');
  const scout = w.staff?.find((member) => member.role === 'scout');
  w.staff =
    ability === undefined || !scout
      ? others
      : [...others, { ...scout, ability, ...(trait ? { trait } : { trait: undefined }) } as Staff];
  return w;
}
const lineOfOffer = (offer: ScoutOffer): Line => lineOfPlayer(offer.player);
const perLine = (offers: readonly ScoutOffer[]) =>
  LINES.map((line) => offers.filter((offer) => lineOfOffer(offer) === line).length);
const ids = (w: World) => transferOffers(w).map((offer) => offer.player.id);

/** Each line in rank order: sporting measures, free status, stable id. */
function expectRanked(w: World, potentialFirst: (offer: ScoutOffer) => boolean) {
  const key = (offer: ScoutOffer) => {
    const first = potentialFirst(offer);
    return [
      first ? offer.player.potential : overall(offer.player),
      first ? overall(offer.player) : offer.player.potential,
      offer.freeAgent ? 1 : 0,
    ];
  };
  for (const line of LINES) {
    const listed = transferOffers(w).filter((offer) => lineOfOffer(offer) === line);
    expect(listed.length).toBeLessThanOrEqual(scoutReach(w).perLine);
    for (let i = 1; i < listed.length; i++) {
      const [a, b] = [key(listed[i - 1]!), key(listed[i]!)];
      const order = a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
      expect(order >= 0, `${line} ${i}`).toBe(true);
    }
  }
}

describe('the chief scout reach (CLUB-51)', () => {
  it('reads home reach and per-line count from his ability: vacant/<60, 60–79, 80+', () => {
    for (const [ability, home, count] of [
      [undefined, 'adjacent', 2],
      [59, 'adjacent', 2],
      [60, 'country', 3],
      [79, 'country', 3],
      [80, 'country', 4],
      [99, 'country', 4],
    ] as const)
      expect(scoutReach(scoutAt(world(), ability)), String(ability)).toMatchObject({
        home,
        perLine: count,
      });
  });

  it('searches our league and the divisions above and below, or our whole country', () => {
    const own = clubOf(world());
    const clubs = (w: World) =>
      transferOffers(w).flatMap((offer) =>
        offer.source.kind === 'club' ? [clubById(w, offer.source.club)!] : [],
      );
    const near = clubs(scoutAt(world(), 50));
    expect(near.length).toBeGreaterThan(0);
    for (const club of near) {
      expect(club.country).toBe(own.country);
      expect(Math.abs(club.tier - own.tier) <= 1).toBe(true);
      if (club.tier === own.tier) expect(club.group).toBe(own.group);
    }
    const wide = scoutAt(world(), 85);
    expect(scoutReach(wide).home).toBe('country');
    for (const club of clubs(wide)) expect(club.country).toBe(own.country);
    // The whole country reaches the top flight, out of a lowest-division club's adjacent reach.
    expect(clubs(wide).some((club) => Math.abs(club.tier - own.tier) > 1)).toBe(true);
  });

  it('adds 0/1/2/4/7 top flights abroad, strongest first, keeping 0/1/1/2/2 places per line', () => {
    const w = scoutAt(world(), 85);
    const others = associationAccessOrder(w).filter((code) => code !== clubOf(w).country);
    for (const level of [1, 2, 3, 4, 5] as const) {
      holdRows(w, { policy: { globalScouting: level } });
      const reach = scoutReach(w);
      expect(reach.abroad).toEqual(others.slice(0, SCOUT_CONFIG.abroadCountries[level - 1]));
      expect(reach.abroadPlaces).toBe(SCOUT_CONFIG.abroadPlaces[level - 1]);
      const offers = transferOffers(w);
      for (const offer of offers) {
        if (offer.source.kind !== 'club') continue;
        const club = clubById(w, offer.source.club)!;
        if (club.country === clubOf(w).country) continue;
        // Abroad only the top flight of a searched country.
        expect(club.tier).toBe(0);
        expect(reach.abroad).toContain(club.country);
        expect(offer.foreign).toBe(true);
      }
      // Each line keeps its places abroad for the ablest found there.
      for (const line of LINES)
        expect(
          offers.filter((offer) => lineOfOffer(offer) === line && offer.foreign).length,
        ).toBeGreaterThanOrEqual(reach.abroadPlaces);
    }
    expect(SCOUT_CONFIG.abroadCountries).toEqual([0, 1, 2, 4, 7]);
    expect(SCOUT_CONFIG.abroadPlaces).toEqual([0, 1, 1, 2, 2]);
  });

  it('turns the cards into search effects, never into ability or potential', () => {
    const base = () => holdRows(scoutAt(world(), 70), { policy: { globalScouting: 3 } });
    const reach = (build: ClubBuild, recruitment: PolicyLevel = 3) =>
      scoutReach(holdRows(base(), { build, policy: { recruitment } }));
    const plain = reach({});
    expect(plain).toMatchObject({ perLine: 3, ability: [40, 85], potentialFirst: 'none' });
    expect(plain.abroad).toHaveLength(2);
    expect(reach({ youth: 'homegrown' }).perLine).toBe(2);
    expect(reach({ scouting: 'data' })).toMatchObject({
      perLine: 4,
      ability: [38, 83],
      potentialFirst: 'all',
    });
    expect(reach({ scouting: 'proven' }).ability).toEqual([44, 89]);
    const network = reach({ scouting: 'network' }, 1);
    expect(network).toMatchObject({ perLine: 4, potentialFirst: 'none' });
    expect(network.abroad).toHaveLength(3);
    const local = reach({ scouting: 'local' });
    expect(local).toMatchObject({ perLine: 2, abroad: [], abroadPlaces: 0 });
    expect(reach({ revenue: 'frugal' }).ability).toEqual([38, 83]);
    expect(reach({ culture: 'stars' }).ability).toEqual([42, 87]);
    // However the cards cut it, he lists at least one per line.
    const cut = holdRows(scoutAt(world(), undefined), {
      build: { youth: 'homegrown', scouting: 'local' },
    });
    expect(scoutReach(cut).perLine).toBe(SCOUT_CONFIG.minPerLine);
    // Every found player is the world's own, unchanged: OVR and potential as his club has him.
    const w = holdRows(base(), { build: { scouting: 'data' } });
    for (const offer of transferOffers(w))
      if (offer.source.kind === 'club') {
        const held = squad(w, clubById(w, offer.source.club)!).find(
          (p) => p.id === offer.player.id,
        )!;
        expect(offer.player.potential).toBe(held.potential);
        expect(overall(offer.player)).toBe(overall(held));
      }
  });

  it('filters by 영입 기조 bands and lists the reach count per line', () => {
    for (const recruitment of [1, 3, 5] as const) {
      const w = holdRows(scoutAt(world(), 85), { policy: { recruitment, globalScouting: 5 } });
      const reach = scoutReach(w),
        offers = transferOffers(w);
      // A first season's derived squads place keepers at 24 and 35 and forwards at 22–23 and
      // 32–34, so the youngest and oldest searches find fewer there: he lists only whom the
      // world holds (→CLUB-50), never more than the reach's count.
      const counts = perLine(offers);
      for (const count of counts) expect(count).toBeLessThanOrEqual(reach.perLine);
      if (recruitment === 3) expect(counts).toEqual(LINES.map(() => reach.perLine));
      else expect(counts.slice(1, 3)).toEqual([reach.perLine, reach.perLine]);
      for (const offer of offers) {
        const age = w.year - offer.player.born;
        expect(age).toBeGreaterThanOrEqual(reach.age[0]);
        expect(age).toBeLessThanOrEqual(reach.age[1]);
        expect(overall(offer.player)).toBeGreaterThanOrEqual(reach.ability[0]);
        expect(overall(offer.player)).toBeLessThanOrEqual(reach.ability[1]);
      }
    }
  });
});

describe('ranking (CLUB-33, ECON-16)', () => {
  it('keeps a materially better paid player before weak free players at the per-line cap', () => {
    const w = scoutAt(world(), 85);
    w.freeAgents = [];
    const paid = transferOffers(w).find((offer) => !offer.freeAgent)!;
    const weak = { ...structuredClone(paid.player), id: 'ranking:free', freeSince: w.year };
    for (const attribute of ATTRIBUTES) weak.attrs[attribute] = 40;
    weak.potential = 40;
    w.freeAgents = [weak];
    const listed = transferOffers(w).filter((offer) => lineOfOffer(offer) === lineOfOffer(paid));
    expect(listed[0]!.player.id).toBe(paid.player.id);
    expect(listed.some((offer) => offer.player.id === weak.id)).toBe(false);
  });

  it('prefers free status only for equal sporting quality, then stable id', () => {
    const w = scoutAt(world(), 85);
    w.freeAgents = [];
    const paid = transferOffers(w)[0]!;
    const free = ['ranking:z', 'ranking:a'].map((id) => ({
      ...structuredClone(paid.player),
      id,
      freeSince: w.year,
    }));
    w.freeAgents = free;
    const relevant = transferOffers(w).filter((offer) =>
      [paid.player.id, ...free.map((p) => p.id)].includes(offer.player.id),
    );
    expect(relevant.map((offer) => offer.player.id)).toEqual([
      'ranking:a',
      'ranking:z',
      paid.player.id,
    ]);
    const before = ids(w);
    w.freeAgents = [...free].reverse();
    expect(ids(w)).toEqual(before);
  });

  it('ranks director candidates by quality and falls back when the better fee is unaffordable', () => {
    const w = scoutAt(world(), 85);
    w.settings = staffAuthority(4);
    w.round = 23;
    w.income = '999999999999';
    w.cash = '999999999999';
    w.calendar = { day: seasonDayOf(w.year, 1, 1) };
    delete w.shortlist;
    w.freeAgents = [];
    const paid = transferOffers(w).find((offer) => offer.player.position === 'GK')!;
    const freePlayer = {
      ...structuredClone(paid.player),
      id: 'ranking:affordable',
      freeSince: w.year,
    };
    for (const attribute of ATTRIBUTES) freePlayer.attrs[attribute] = 45;
    freePlayer.potential = 45;
    freePlayer.wage = '1';
    w.freeAgents = [freePlayer];
    const free: ScoutOffer = {
      ...paid,
      player: freePlayer,
      freeAgent: true,
      fee: '0',
      loanFee: '0',
      source: { kind: 'free' },
    };
    const dear: ScoutOffer = { ...paid, fee: '999999999999999' };
    // This isolates director ordering from the scout's independent cap and ranking.
    const search = vi.spyOn(scoutSearch, 'transferOffers').mockReturnValue([free, dear]);
    try {
      expect(
        requestCandidates(w, { kind: 'short', line: 'GK' }).map(({ offer }) => offer.player.id),
      ).toEqual([dear.player.id, free.player.id]);
      const keep = activePlayers(w).filter((player) => player.position === 'GK')[0]!;
      for (const player of activePlayers(w))
        if (player.position === 'GK' && player.id !== keep.id) player.status = 'sold';
      const cash = w.cash;
      expect(signingVerdict(w, dear.player, dear.fee).ok).toBe(false);
      expect(signingVerdict(w, free.player, free.fee).ok).toBe(true);
      staffSignings(w);
      expect(w.players.find((player) => player.id === free.player.id)?.status).toBe('active');
      expect(w.cash).toBe(cash);
      expect(w.bids?.find((bid) => bid.playerId === free.player.id)).toMatchObject({
        status: 'completed',
        fee: '0',
      });
    } finally {
      search.mockRestore();
    }
  });

  it('ranks ability and potential before free status at the balanced level', () => {
    const w = scoutAt(world(), 85);
    expect(scoutReach(w).potentialFirst).toBe('none');
    expectRanked(w, () => false);
  });

  it('ranks potential first for levels 1–2 and 데이터 스카우팅, never under 광역 네트워크', () => {
    const youth = holdRows(scoutAt(world(), 85), { policy: { recruitment: 1 } });
    expect(scoutReach(youth).potentialFirst).toBe('all');
    expectRanked(youth, () => true);
    const data = holdRows(scoutAt(world(), 85), { build: { scouting: 'data' } });
    expect(scoutReach(data).potentialFirst).toBe('all');
    expectRanked(data, () => true);
    const network = holdRows(scoutAt(world(), 85, 'spotter'), {
      build: { scouting: 'network' },
      policy: { recruitment: 2 },
    });
    expect(scoutReach(network).potentialFirst).toBe('none');
    expectRanked(network, () => false);
  });

  it('lets the spotter rank players aged 23 or under by potential first', () => {
    const w = scoutAt(world(), 85, 'spotter');
    expect(scoutReach(w).potentialFirst).toBe('young');
    expectRanked(w, (offer) => w.year - offer.player.born <= SCOUT_CONFIG.youngAge);
  });
});

describe('found players (CLUB-50)', () => {
  it('lists only players a club squad or the free-agent pool holds, each with his source', () => {
    for (const w of [
      world(),
      holdRows(scoutAt(world(), 90), { policy: { recruitment: 1, globalScouting: 5 } }),
    ]) {
      const owned = new Set(activePlayers(w).map((p) => p.id));
      const offers = transferOffers(w);
      expect(offers.length).toBeGreaterThan(0);
      for (const offer of offers) {
        expect(offer.player.id.startsWith('market:')).toBe(false);
        expect(owned.has(offer.player.id)).toBe(false);
        if (offer.source.kind === 'club') {
          const club = clubById(w, offer.source.club)!;
          expect(squad(w, club).some((p) => p.id === offer.player.id)).toBe(true);
          expect(offer.freeAgent).toBe(false);
          expect(BigInt(offer.fee)).toBeGreaterThan(0n);
          expect(offer.foreign).toBe(isForeignCandidate(w, offer.player.id, club.id));
        } else {
          expect(w.freeAgents?.some((p) => p.id === offer.player.id)).toBe(true);
          expect(offer).toMatchObject({ freeAgent: true, fee: '0', loanFee: '0' });
        }
      }
    }
  });

  it('finds the same players after switching a setting away and back, deterministically', () => {
    const w = scoutAt(world(), 70),
      before = structuredClone(transferOffers(w));
    expect(transferOffers(scoutAt(world(), 70))).toEqual(before);
    for (const rows of [
      { policy: { recruitment: 1 as const } },
      { policy: { globalScouting: 5 as const } },
      { build: { scouting: 'data' as const } },
    ]) {
      holdRows(w, rows);
      expect(ids(w)).not.toEqual(before.map((offer) => offer.player.id));
      holdRows(w, { policy: { recruitment: 3, globalScouting: 1 }, build: {} });
      expect(transferOffers(w)).toEqual(before);
    }
    scoutAt(w, 85);
    expect(ids(w)).not.toEqual(before.map((offer) => offer.player.id));
    scoutAt(w, 70);
    expect(transferOffers(w)).toEqual(before);
  });

  it('keeps one list per world state and reads it again for free', () => {
    const w = world();
    const first = transferOffers(w);
    expect(transferOffers(w)).toBe(first);
    w.revision++;
    const again = transferOffers(w);
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });

  it('signs a free agent out of the pool at once and never loans or bids for him', () => {
    const w = world();
    const index = transferOffers(w).findIndex((offer) => offer.freeAgent);
    const offer = transferOffers(w)[index]!;
    expect(() => placeBid(w, index, '1')).toThrow('자유계약');
    expect(() => operate(w, { type: 'recruit', candidate: index, loan: true })).toThrow('임대');
    const cash = w.cash;
    operate(w, { type: 'recruit', candidate: index });
    expect(w.cash).toBe(cash);
    expect(w.freeAgents?.some((p) => p.id === offer.player.id)).toBe(false);
    expect(activePlayers(w).filter((p) => p.id === offer.player.id)).toHaveLength(1);
    expect(ids(w)).not.toContain(offer.player.id);
  });

  it('bids for another club’s player at his club and lapses a bid on a generated one', () => {
    const w = world();
    const index = transferOffers(w).findIndex((offer) => !offer.freeAgent);
    const offer = transferOffers(w)[index]!;
    // A club's player joins through a bid at his asking fee, never instantly (→CLUB-4).
    operate(w, { type: 'recruit', candidate: index });
    expect(w.bids?.at(-1)).toMatchObject({
      playerId: offer.player.id,
      club: offer.source.kind === 'club' ? offer.source.club : '',
      fee: offer.fee,
      status: 'pending',
    });
    expect(activePlayers(w).some((p) => p.id === offer.player.id)).toBe(false);
    // An older save's generated candidate no longer exists: the bid lapses, nothing paid.
    const ghost = { ...structuredClone(offer.player), id: `market:${w.year}:abc1234:3` };
    w.bids = [
      {
        id: 'out:ghost',
        direction: 'out',
        playerId: ghost.id,
        fee: '1000',
        offer: { player: ghost, fee: '900', loanFee: '90' },
        year: w.year,
        day: 0,
        due: 3,
        status: 'countered',
        counterFee: '1000',
      },
    ];
    const cash = w.cash;
    // The day's market settles open bids (→CLUB-18).
    dailyMarket(w);
    expect(w.bids[0]).toMatchObject({ id: 'out:ghost', status: 'expired' });
    expect(w.cash).toBe(cash);
    expect(w.inbox?.filter((item) => item.ref === 'out:ghost')).toHaveLength(1);
    expect(activePlayers(w).some((p) => p.id === ghost.id)).toBe(false);
  });
});

describe('the ceiling above our eleven (ECON-16, T809)', () => {
  /**
   * Our club with every player rated `ovr` at every attribute and 최상 at every slot of its
   * formation, so the XI the manager picks averages exactly `ovr` at its slots.
   */
  function elevenAt(w: World, ovr: number) {
    const slots = formationOf(w.tactic);
    for (const p of activePlayers(w)) {
      for (const attribute of ATTRIBUTES) p.attrs[attribute] = ovr;
      for (const slot of slots) p.positions[slot.position] = 3;
      p.potential = Math.max(p.potential, ovr);
    }
    return w;
  }
  const xiMean = (w: World) => {
    const slots = formationOf(w.tactic),
      xi = ownStarters(w);
    return xi.reduce((sum, p, i) => sum + slotOvr(p, slots[i]!), 0) / xi.length;
  };
  /** Free agents of ours rated `ovr` at every attribute, potential 99 so each leads his ability. */
  function freeAgentsAt(w: World, ...ovrs: number[]) {
    const model = transferOffers(w).find((offer) => offer.source.kind === 'club')!.player;
    w.freeAgents = ovrs.map((ovr) => {
      const p = { ...structuredClone(model), id: `ceiling:${ovr}`, freeSince: w.year };
      for (const attribute of ATTRIBUTES) p.attrs[attribute] = ovr;
      p.potential = 99;
      return p;
    });
    return w;
  }
  const listed = (w: World) => transferOffers(w).map((offer) => overall(offer.player));
  /** The reach on the level's own ceiling, as released before ECON r54. */
  const fixedReach = (w: World) => {
    SEARCH_CEILING.inForce = 'fixed';
    try {
      return scoutReach(w);
    } finally {
      SEARCH_CEILING.inForce = 'xi';
    }
  };

  it('lists players up to 93 and none above for an XI averaging 88 at 표준', () => {
    expect(SEARCH_CEILING.inForce).toBe('xi');
    const w = freeAgentsAt(elevenAt(scoutAt(world(), 85), 88), 93, 94);
    expect(xiMean(w)).toBe(88);
    expect(scoutReach(w).ability).toEqual([40, 93]);
    expect(Math.max(...listed(w))).toBe(93);
    expect(ids(w)).toContain('ceiling:93');
    expect(ids(w)).not.toContain('ceiling:94');
    // The level's own ceiling, as released, would have listed none above 85.
    expect(fixedReach(w).ability).toEqual([40, 85]);
    try {
      SEARCH_CEILING.inForce = 'fixed';
      expect(Math.max(...listed(w))).toBeLessThanOrEqual(85);
    } finally {
      SEARCH_CEILING.inForce = 'xi';
    }
  });

  it('keeps the level’s own ceiling, 85 at 표준, for an XI averaging 70', () => {
    const w = freeAgentsAt(elevenAt(scoutAt(world(), 85), 70), 85, 86);
    expect(xiMean(w)).toBe(70);
    expect(scoutReach(w).ability).toEqual([40, 85]);
    expect(Math.max(...listed(w))).toBe(85);
    expect(ids(w)).toContain('ceiling:85');
    expect(ids(w)).not.toContain('ceiling:86');
  });

  it('lifts the ceiling at every level and leaves its floor, ages and ranking as the level sets them', () => {
    const tops = { 70: [75, 75, 85, 88, 92], 88: [93, 93, 93, 93, 93] } as const;
    for (const ovr of [70, 88] as const) {
      const w = elevenAt(scoutAt(world(), 85), ovr);
      for (const recruitment of [1, 2, 3, 4, 5] as const) {
        holdRows(w, { policy: { recruitment } });
        const reach = scoutReach(w),
          fixed = fixedReach(w);
        // ECON-16's bands: the level's own ceiling, or our XI + 5 when that is higher.
        expect(reach.ability, `${ovr} ${recruitment}`).toEqual([
          fixed.ability[0],
          tops[ovr][recruitment - 1],
        ]);
        expect(fixed.ability[1]).toBe([65, 75, 85, 88, 92][recruitment - 1]);
        expect(reach.age).toEqual(fixed.age);
        expect(reach.potentialFirst).toBe(fixed.potentialFirst);
        expectRanked(w, () => reach.potentialFirst === 'all');
      }
    }
  });

  it('finds the same players after switching the dial away and back (CLUB-14)', () => {
    const w = elevenAt(scoutAt(world(), 85), 88),
      before = structuredClone(transferOffers(w));
    expect(Math.max(...before.map((offer) => overall(offer.player)))).toBeGreaterThan(85);
    holdRows(w, { policy: { recruitment: 1 } });
    expect(ids(w)).not.toEqual(before.map((offer) => offer.player.id));
    holdRows(w, { policy: { recruitment: 3 } });
    expect(transferOffers(w)).toEqual(before);
  });
});

describe("T784's seller candidates (measurement settings off in play)", () => {
  const clubsOf = (offers: readonly ScoutOffer[]) =>
    offers.flatMap((offer) => (offer.source.kind === 'club' ? [offer.source.club] : []));

  it('LIST_SPREAD lists a club once per line (`line`) or once per list (`list`) before twice', () => {
    expect(LIST_SPREAD.inForce).toBe('none');
    const w = scoutAt(world(), 85),
      plain = transferOffers(w);
    try {
      for (const shape of ['line', 'list'] as const) {
        LIST_SPREAD.inForce = shape;
        const offers = transferOffers(w);
        // The same count per line, each club once where the reach holds enough clubs.
        expect(perLine(offers)).toEqual(perLine(plain));
        if (shape === 'line')
          for (const line of LINES) {
            const listed = clubsOf(offers.filter((offer) => lineOfOffer(offer) === line));
            expect(new Set(listed).size, line).toBe(listed.length);
          }
        else expect(new Set(clubsOf(offers)).size).toBe(clubsOf(offers).length);
      }
    } finally {
      LIST_SPREAD.inForce = 'none';
    }
    // Off, the list is the released one.
    expect(ids(w)).toEqual(plain.map((offer) => offer.player.id));
  });

  it('SEARCH_CEILING `open` lifts the ability ceiling, the floor and ages as they were (T785)', () => {
    expect(SEARCH_CEILING.inForce).toBe('xi');
    const w = scoutAt(world(), 85),
      plain = scoutReach(w),
      offers = transferOffers(w);
    try {
      SEARCH_CEILING.inForce = 'open';
      const open = scoutReach(w);
      expect(open.ability).toEqual([plain.ability[0], 99]);
      expect(open.age).toEqual(plain.age);
      // The list per line is as long, and its ablest player is at least as able.
      const lifted = transferOffers(w);
      expect(perLine(lifted)).toEqual(perLine(offers));
      for (const line of LINES) {
        const best = (list: readonly ScoutOffer[]) =>
          Math.max(0, ...list.filter((o) => lineOfOffer(o) === line).map((o) => overall(o.player)));
        expect(best(lifted), line).toBeGreaterThanOrEqual(best(offers));
      }
    } finally {
      SEARCH_CEILING.inForce = 'xi';
    }
    expect(ids(w)).toEqual(offers.map((offer) => offer.player.id));
  });

  it("REFILL_SALE `kept`: a club does not sell the player filling a departure's place", () => {
    expect(REFILL_SALE.inForce).toBe('sold');
    const w = world(),
      listed = transferOffers(w).find((offer) => offer.source.kind === 'club')!,
      refill = {
        ...listed.player,
        id: `${listed.source.kind === 'club' ? listed.source.club : ''}:vacancy:0:${w.year}`,
      };
    expect(unavailableAtClub(w, refill)).toBe(false);
    try {
      REFILL_SALE.inForce = 'kept';
      expect(unavailableAtClub(w, refill)).toBe(true);
      expect(unavailableAtClub(w, listed.player)).toBe(false);
    } finally {
      REFILL_SALE.inForce = 'sold';
    }
  });

  it('UPGRADE_MEASURE measures a slot by its starter; `signed` counts who joined this window', () => {
    expect(UPGRADE_MEASURE.inForce).toBe('starter');
    const w = world(),
      slots = formationOf(w.tactic),
      needs = upgradeNeeds(w, 2) as Extract<SigningNeed, { kind: 'upgrade' }>[];
    // The weakest slot a listed player beats there, and that player.
    const [weakest, fit] = needs
      .map((need) => {
        const p = transferOffers(w)
          .map((offer) => offer.player)
          .find(
            (one) =>
              (one.positions[need.position] ?? 0) >= 2 &&
              slotOvr(one, slots[need.slot]!) > need.level,
          );
        return [need, p] as const;
      })
      .find(([, p]) => p)!;
    // He joined in this window and does not start yet (still settling in, →PLAYER-11).
    const joined = [{ ...fit!, id: 'scout-search:joined' }];
    expect(upgradeNeeds(w, 2, joined)).toEqual(needs);
    try {
      UPGRADE_MEASURE.inForce = 'signed';
      const counted = upgradeNeeds(w, 2, joined) as typeof needs;
      const changed = counted.filter(
        (need) => need.level !== needs.find((one) => one.slot === need.slot)!.level,
      );
      // He counts once, at the weakest slot he plays; every other slot keeps its starter's measure.
      expect(changed).toHaveLength(1);
      expect(changed[0]!.level).toBe(slotOvr(fit!, slots[changed[0]!.slot]!));
      expect(
        needs.indexOf(needs.find((one) => one.slot === changed[0]!.slot)!),
      ).toBeLessThanOrEqual(needs.indexOf(weakest));
    } finally {
      UPGRADE_MEASURE.inForce = 'starter';
    }
  });
});
