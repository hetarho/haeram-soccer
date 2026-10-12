import { describe, expect, it } from 'vitest';
import { currency, footballIndex, priceIndex } from '../../catalogs/src/index';
import type {
  ManagerStyle,
  Player,
  PolicyLevel,
  UnhappyReason,
  World,
} from '../../contracts/src/types';
import {
  activePlayers,
  buildEffects,
  clubOf,
  contractTalks,
  createWorld,
  currentDay,
  divisionFor,
  expireContracts,
  makePlayer,
  MARKET_CONFIG,
  marketValue,
  marketValueAt,
  marketWage,
  moneyLabel,
  npcSquad,
  operate,
  operatingCosts,
  overall,
  ownStarters,
  playerValue,
  playingAbility,
  rating,
  ratio,
  retireAtClose,
  seasonDayOf,
  settleMorale,
  suitorFor,
  talkFor,
  talkRoundChance,
  talksRound,
  talkTerms,
  transferOffers,
  transferRequests,
} from './index';

// The first constants (MARKET_CONFIG); T062 recalibrates them against whole careers (→ECON-29),
// so these tests hold the CLUB-25 targets, not the constants.
function world(country: 'ENG' | 'ESP' = 'ENG') {
  return createWorld({
    country,
    name: 'Market Wages',
    color: '#224433',
    seed: 'market-wages',
    difficulty: 1,
  });
}
/** A midfielder rated `ability` everywhere, aged `age` in the world's year. */
function rated(w: World, ability: number, age = 26, potential = ability): Player {
  return {
    ...structuredClone(activePlayers(w)[0]),
    role: 'MID',
    attack: ability,
    passing: ability,
    defense: ability,
    stamina: ability,
    born: w.year - age,
    potential,
  };
}
const amount = (value: string) => Number(BigInt(value));
/** Money in whole currency units, comparable across the 1971 decimalisation. */
const major = (w: World, value: string) =>
  amount(value) / currency(clubOf(w).country, w.year).units;

describe('market wages (→CLUB-25)', () => {
  it('pays a top-flight player rated 80 six to ten times one rated 60', () => {
    for (const country of ['ENG', 'ESP'] as const) {
      const w = world(country);
      const star = amount(marketWage(w, rated(w, 80), 0)),
        squad = amount(marketWage(w, rated(w, 60), 0));
      expect(star / squad).toBeGreaterThanOrEqual(6);
      expect(star / squad).toBeLessThanOrEqual(10);
    }
  });

  it('pays a second-tier squad 35–50% of a top-flight squad of the same ability', () => {
    const w = world();
    const top = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    const players = npcSquad(w.seed, w.year, top);
    const bill = (division: number) =>
      players.reduce((sum, p) => sum + amount(marketWage(w, p, division)), 0);
    const share = bill(1) / bill(0);
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.5);
    // Every division below pays less again for the same squad.
    for (let division = 1; division <= 4; division++)
      expect(bill(division)).toBeLessThanOrEqual(bill(division - 1));
  });

  it('raises the wage for one ability with the football index across eras', () => {
    const w = world();
    const wages = [1950, 1979, 1992, 2005, 2020].map((year) => {
      w.year = year;
      return { year, pounds: major(w, marketWage(w, rated(w, 70), 0)) };
    });
    for (let i = 1; i < wages.length; i++)
      expect(wages[i].pounds).toBeGreaterThan(wages[i - 1].pounds);
    const [, from, , , to] = wages;
    // Beyond prices, the wage grows exactly as the football index's real multiple.
    const real =
      to.pounds /
      from.pounds /
      (priceIndex('ENG', to.year).value / priceIndex('ENG', from.year).value);
    expect(real).toBeCloseTo(
      footballIndex('ENG', to.year).real / footballIndex('ENG', from.year).real,
      2,
    );
  });

  it('pays for promise when young and less before 21 and after 30', () => {
    const w = world();
    const wage = (p: Player) => amount(marketWage(w, p, 0));
    expect(wage(rated(w, 60, 19, 85))).toBeGreaterThan(wage(rated(w, 60, 19)));
    expect(wage(rated(w, 60, 26, 85))).toBe(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 18))).toBeLessThan(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 34))).toBeLessThan(wage(rated(w, 60, 26)));
  });

  it('starts generated players at their market wage', () => {
    const w = world();
    for (const p of activePlayers(w)) expect(p.wage).toBe(marketWage(w, p));
    for (const offer of transferOffers(w))
      expect(offer.player.wage).toBe(marketWage(w, offer.player));
    const top = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    for (const p of npcSquad(w.seed, w.year, top)) expect(p.wage).toBe(marketWage(w, p, 0));
    const prospect = makePlayer('ENG', w.seed, 'academy:test', w.year, 45, 'MID', 17);
    prospect.wage = '0';
    w.academy = { players: [prospect] };
    operate(w, { type: 'promote-youth', id: prospect.id });
    const promoted = w.players.find((p) => p.id === prospect.id)!;
    expect(promoted.wage).toBe(marketWage(w, promoted));
    expect(amount(promoted.wage)).toBeGreaterThan(0);
  });
});

describe('market values (→CLUB-25)', () => {
  it('values players on the wage scale: by ability, promise, age, division and index', () => {
    const w = world();
    const value = (p: Player, division = 0) => amount(playerValue(w, p, division));
    for (const p of activePlayers(w)) expect(playerValue(w, p)).toBe(marketValue(w, p));
    const ratio = value(rated(w, 80)) / value(rated(w, 60));
    expect(ratio).toBeGreaterThanOrEqual(6);
    expect(ratio).toBeLessThanOrEqual(10);
    expect(value(rated(w, 60, 19, 85))).toBeGreaterThan(value(rated(w, 60, 24, 85)));
    expect(value(rated(w, 60, 31))).toBeLessThan(value(rated(w, 60, 27)));
    expect(value(rated(w, 60, 27), 1)).toBeLessThan(value(rated(w, 60, 27)));
    const eras = [1950, 2005].map((year) => {
      w.year = year;
      return major(w, playerValue(w, rated(w, 70), 0));
    });
    expect(eras[1]).toBeGreaterThan(eras[0]);
  });

  it('asks the value of the division a candidate’s ability suits, times the fee settings', () => {
    const w = world();
    const code = clubOf(w).country;
    const offers = transferOffers(w);
    expect(offers[0]).toMatchObject({ fee: '0', loanFee: '0', freeAgent: true });
    for (const { player, fee, loanFee } of offers.slice(1)) {
      const value = marketValueAt(code, w.year, divisionFor(code, overall(player)), player);
      expect(fee).toBe(value);
      expect(amount(loanFee)).toBeCloseTo(amount(value) * MARKET_CONFIG.loan, -1);
    }
    // A stronger player suits a higher division, so his club asks more than ours would value him.
    expect(divisionFor(code, 80)).toBeLessThan(divisionFor(code, 50));
    expect(divisionFor(code, 99)).toBe(0);
    expect(divisionFor(code, 10)).toBe(clubOf(w).tier);
    operate(w, { type: 'policy', key: 'recruitment', level: 5 });
    for (const { player, fee } of transferOffers(w).slice(1)) {
      const value = marketValueAt(code, w.year, divisionFor(code, overall(player)), player);
      expect(amount(fee)).toBeCloseTo(amount(value) * 1.3, -1);
    }
  });
});

/** A rich club whose first player is rated `ability`, aged `age`, in his contract's final season. */
function talking(ability = 80, age = 26) {
  const w = world();
  w.cash = '999999999999';
  const p = Object.assign(activePlayers(w)[0], rated(w, ability, age), { until: w.year + 1 });
  return { w, p };
}
/** 1 January, when players in their final season ask to renew. */
function newYear(w: World) {
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  contractTalks(w);
}
const talkItems = (w: World, id: string) =>
  (w.inbox || []).filter((item) => item.kind === 'contract-talk' && item.ref === id);

describe('contract talks (→CLUB-26)', () => {
  it('sets the floor at demand × (1 − goodwill) for each source of goodwill', () => {
    const { w, p } = talking(80);
    /** Goodwill after `setup`, checking the demand and floor it gives. */
    const goodwill = (setup: (w: World, p: Player) => void) => {
      const copy = structuredClone(w),
        player = copy.players.find((x) => x.id === p.id)!;
      setup(copy, player);
      const terms = talkTerms(copy, player),
        wage = BigInt(Math.round(buildEffects(copy).wage * 1000));
      expect(terms.demand).toBe(ratio(marketWage(copy, player), wage, 1000n));
      expect(terms.floor).toBe(
        ratio(terms.demand, BigInt(Math.round((100 - terms.goodwill.percent) * 100)), 10000n),
      );
      return terms.goodwill.percent;
    };
    const support = (level: PolicyLevel) => (w: World) =>
      operate(w, { type: 'policy', key: 'support', level });
    const build = (cards: World['build']) => (w: World) => void (w.build = cards);
    // The default squad investment (3) gives +5 at the starting morale of 60.
    expect(goodwill(() => {})).toBe(5);
    expect(([1, 2, 3, 4, 5] as const).map((level) => goodwill(support(level)))).toEqual([
      -5, 0, 5, 10, 15,
    ]);
    expect(goodwill(build({ culture: 'family' }))).toBe(10);
    expect(goodwill(build({ culture: 'stars' }))).toBe(15);
    // 스타 대우 is goodwill only for players rated 70 or more.
    expect(
      goodwill((w, p) => {
        w.build = { culture: 'stars' };
        Object.assign(p, rated(w, 69));
      }),
    ).toBe(5);
    expect(goodwill(build({ culture: 'meritocracy' }))).toBe(0);
    expect(goodwill(build({ revenue: 'frugal' }))).toBe(0);
    expect(goodwill((w) => void (w.morale = 80))).toBe(10);
    expect(goodwill((w) => void (w.morale = 42))).toBe(0.5);
    // Within −10 to +30%.
    expect(
      goodwill((w) => {
        support(5)(w);
        w.build = { culture: 'stars' };
        w.morale = 100;
      }),
    ).toBe(30);
    expect(
      goodwill((w) => {
        support(1)(w);
        w.build = { culture: 'meritocracy', revenue: 'frugal' };
        w.morale = 0;
      }),
    ).toBe(-10);
    // The demand carries the build's player-wage effects.
    const stars = structuredClone(w);
    stars.build = { culture: 'stars' };
    expect(amount(talkTerms(stars, p).demand)).toBeCloseTo(amount(marketWage(w, p)) * 1.1, -1);
  });

  it('lets a delegated club at squad investment 5 renew a star a level-1 club declines', () => {
    const [generous, tight] = ([5, 1] as const).map((level) => {
      const { w, p } = talking(80);
      operate(w, { type: 'policy', key: 'support', level });
      expect(w.delegation?.contracts).toBe(true);
      const before = { wage: p.wage, until: p.until, floor: talkTerms(w, p).floor };
      newYear(w);
      expect(p.talk).toBeUndefined();
      const items = talkItems(w, p.id);
      expect(items).toHaveLength(1);
      expect(items[0].attention).toBe(false);
      return { w, p, before, report: items[0] };
    });
    // The staff offer the floor for two seasons beyond this one.
    expect(generous.p.wage).toBe(generous.before.floor);
    expect(generous.p.until).toBe(generous.w.year + 3);
    expect(generous.report.title).toContain('받아들였어요');
    expect(generous.w.events.at(-1)).toMatchObject({ kind: 'contract' });
    // A level-1 ceiling (×0.9 of the market wage) is below what he settles for.
    expect(tight.p).toMatchObject({ wage: tight.before.wage, until: tight.before.until });
    expect(tight.report.title).toContain('거절했어요');
    expect(tight.report.detail).toContain('연봉 상한');
    expect(tight.w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
  });

  it('signs a veteran for one season and declines a raise the cash cannot carry', () => {
    const veteran = talking(70, 33);
    newYear(veteran.w);
    expect(veteran.p.until).toBe(veteran.w.year + 2);

    const broke = talking(80);
    operate(broke.w, { type: 'policy', key: 'support', level: 5 });
    // Twelve rounds of today's costs: short of the 13-round runway even before the raise.
    broke.w.cash = ((BigInt(operatingCosts(broke.w).annual) / 46n) * 12n).toString();
    const until = broke.p.until;
    newYear(broke.w);
    expect(broke.p.until).toBe(until);
    expect(talkItems(broke.w, broke.p.id)[0].detail).toContain('13라운드');
  });

  it('refuses an owner’s offer below the floor, stating it, and signs one at the floor', () => {
    const { w, p } = talking(80);
    operate(w, { type: 'delegate', key: 'contracts', value: false });
    newYear(w);
    const talk = p.talk!;
    expect(talk).toMatchObject({ kind: 'renew', year: w.year, day: seasonDayOf(w.year, 1, 1) });
    const [item] = talkItems(w, p.id);
    expect(item.attention).toBe(true);
    const before = structuredClone(w),
      low = (BigInt(talk.floor) - 1n).toString();
    expect(() => operate(w, { type: 'contract-offer', player: p.id, wage: low, term: 3 })).toThrow(
      moneyLabel(w, talk.floor),
    );
    expect(w).toEqual(before);
    operate(w, { type: 'contract-offer', player: p.id, wage: talk.floor, term: 3 });
    expect(p).toMatchObject({ wage: talk.floor, until: w.year + 4 });
    expect(p.talk).toBeUndefined();
    expect(talkItems(w, p.id)[0].read).toBe(true);
    expect(w.events.at(-1)).toMatchObject({ kind: 'contract' });
    // Nothing is left to answer.
    expect(() => operate(w, { type: 'contract-decline', player: p.id })).toThrow('협상');
  });

  it('opens a raise talk for a player paid 25% below his market wage, once a season', () => {
    const w = world();
    operate(w, { type: 'delegate', key: 'contracts', value: false });
    const p = activePlayers(w)[0],
      market = BigInt(marketWage(w, p));
    p.wage = ((market * 76n) / 100n).toString();
    contractTalks(w);
    expect(p.talk).toBeUndefined();
    p.wage = ((market * 75n) / 100n).toString();
    contractTalks(w);
    expect(p.talk).toMatchObject({ kind: 'raise' });
    expect(p.raiseAsked).toBe(w.year);
    expect(talkItems(w, p.id)).toHaveLength(1);
    // The owner's answer takes talks back from the staff.
    w.delegation = { ...w.delegation, contracts: true };
    operate(w, { type: 'contract-decline', player: p.id });
    expect(w.delegation.contracts).toBe(false);
    expect(p.talk).toBeUndefined();
    expect(w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
    contractTalks(w);
    expect(p.talk).toBeUndefined();
    // Talked round or not (→CLUB-27), a player who is not unhappy asks again next season.
    delete p.unhappy;
    w.year++;
    contractTalks(w);
    expect(p.talk).toMatchObject({ kind: 'raise', year: w.year });
  });

  it('pays agreed wages as signed whatever the build', () => {
    const w = world(),
      bill = operatingCosts(w).playerWages;
    expect(bill).toBe(
      activePlayers(w)
        .reduce((sum, p) => sum + BigInt(p.wage), 0n)
        .toString(),
    );
    w.build = { revenue: 'frugal', culture: 'stars' };
    expect(operatingCosts(w).playerWages).toBe(bill);
  });
});

/** A club on 1 January whose owner answers talks, with `p` unhappy since that day. */
function unhappy(reason: UnhappyReason = 'renewal-declined') {
  const { w, p } = talking(80);
  operate(w, { type: 'delegate', key: 'contracts', value: false });
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  p.unhappy = { reason, year: w.year, day: currentDay(w) };
  return { w, p };
}

describe('unhappy players and expiring contracts (→CLUB-27, CLUB-28)', () => {
  it('lets a motivator talk a player round more often over 2,000 seeded talks', () => {
    const { w, p } = talking(80);
    Object.assign(w.manager, { trust: 50, flexibility: 50 });
    const rate = (style?: ManagerStyle) => {
      w.manager.style = style;
      let kept = 0;
      for (let i = 0; i < 2000; i++) {
        const talk = { kind: 'renew', demand: '1', floor: '1', year: w.year + (i % 5) } as const;
        if (talksRound(w, p, { ...talk, day: Math.floor(i / 5) })) kept++;
      }
      return kept / 2000;
    };
    // 15%, and 45% more for a motivator (동기부여형).
    expect(rate()).toBeCloseTo(0.15, 1);
    expect(rate('motivator')).toBeCloseTo(0.6, 1);
    expect(rate('motivator')).toBeGreaterThan(rate() + 0.35);
    // (trust − 50)/200 + (flexibility − 50)/400, within 5–85%.
    Object.assign(w.manager, { style: undefined, trust: 70, flexibility: 90 });
    expect(talkRoundChance(w)).toBeCloseTo(0.15 + 0.1 + 0.1);
    Object.assign(w.manager, { style: 'motivator', trust: 100, flexibility: 100 });
    expect(talkRoundChance(w)).toBe(0.85);
    Object.assign(w.manager, { style: undefined, trust: 0, flexibility: 0 });
    expect(talkRoundChance(w)).toBe(0.05);
  });

  it('turns a declined player unhappy unless the manager talks him round, each an inbox item', () => {
    const { w } = talking(80);
    operate(w, { type: 'delegate', key: 'contracts', value: false });
    for (const p of activePlayers(w)) p.until = w.year + 1;
    newYear(w);
    const players = activePlayers(w),
      kept = players.find((p) => talksRound(w, p, p.talk!))!,
      lost = players.find((p) => !talksRound(w, p, p.talk!))!;
    operate(w, { type: 'contract-decline', player: kept.id });
    expect(kept.unhappy).toBeUndefined();
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'contract-talk', ref: kept.id });
    expect(w.inbox!.at(-1)!.read).toBeFalsy();
    expect(w.events.at(-1)!.detail).toContain('마음을 돌렸어요');
    operate(w, { type: 'contract-decline', player: lost.id });
    expect(lost.unhappy).toEqual({
      reason: 'renewal-declined',
      year: w.year,
      day: seasonDayOf(w.year, 1, 1),
    });
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'unhappy', ref: lost.id, attention: true });
    expect(w.events.at(-1)!.detail).toContain('언해피');
  });

  it('plays an unhappy starter 3 below his ability and costs squad morale each settled round', () => {
    const w = world();
    // The owner's saved XI keeps him in the side.
    w.lineup = ownStarters(w).map((p) => p.id);
    w.morale = 60;
    const [starter, other] = ownStarters(w),
      bench = activePlayers(w).find((p) => !w.lineup!.includes(p.id))!,
      strength = rating(w, clubOf(w)),
      attributes = { ...starter };
    starter.unhappy = { reason: 'raise-declined', year: w.year, day: 0 };
    expect(playingAbility(starter)).toBe(overall(starter) - 3);
    expect(starter).toEqual({ ...attributes, unhappy: starter.unhappy });
    expect(ownStarters(w)).toContain(starter);
    const morale = (setup: (copy: World) => void) => {
      const copy = structuredClone(w);
      setup(copy);
      settleMorale(copy);
      return copy.morale!;
    };
    const calm = morale((copy) => copy.players.forEach((p) => delete p.unhappy));
    expect(morale(() => {})).toBe(calm - 1);
    expect(
      morale((copy) => {
        copy.players.find((p) => p.id === other.id)!.unhappy = starter.unhappy;
      }),
    ).toBe(calm - 2);
    // A bench player who does not start costs nothing.
    expect(
      morale((copy) => {
        copy.players.forEach((p) => delete p.unhappy);
        copy.players.find((p) => p.id === bench.id)!.unhappy = starter.unhappy;
      }),
    ).toBe(calm);
    // A whole unhappy XI plays 3 below its strength.
    for (const p of activePlayers(w)) p.unhappy = starter.unhappy;
    expect(rating(w, clubOf(w))).toBe(strength - 3);
  });

  it('hands in a transfer request after six weeks: listed, never untouchable, no renewal talk', () => {
    const { w, p } = unhappy();
    const day = currentDay(w);
    // He refuses to renew: no talk on 1 January though his contract is in its final season.
    contractTalks(w);
    expect(p.talk).toBeUndefined();
    w.calendar = { day: day + 41 };
    transferRequests(w);
    expect(p.transferRequest).toBeUndefined();
    w.calendar = { day: day + 42 };
    transferRequests(w);
    expect(p.transferRequest).toEqual({ year: w.year, day: day + 42 });
    expect(p.stance).toBe('listed');
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'transfer-request', ref: p.id, attention: true });
    expect(w.events.at(-1)).toMatchObject({ kind: 'transfer-request' });
    expect(() => operate(w, { type: 'transfer-stance', id: p.id, stance: 'untouchable' })).toThrow(
      '이적 불가',
    );
    operate(w, { type: 'transfer-stance', id: p.id, stance: 'open' });
    expect(p.stance).toBeUndefined();
    // Six weeks count across the summer: unhappy late in one season, he asks early in the next.
    const late = unhappy();
    late.p.unhappy!.day = seasonDayOf(late.w.year, 6, 1);
    late.w.year++;
    late.w.calendar = { day: 0 };
    transferRequests(late.w);
    expect(late.p.transferRequest).toEqual({ year: late.w.year, day: 0 });
  });

  it('ends the unhappiness when his floor is met later or when he is sold', () => {
    const { w, p } = unhappy('raise-declined');
    Object.assign(p, { transferRequest: { year: w.year, day: currentDay(w) }, stance: 'listed' });
    // An offer meets the floor he holds out for today.
    const talk = talkFor(w, p)!;
    expect(talk).toMatchObject({ kind: 'raise', floor: talkTerms(w, p).floor });
    const before = structuredClone(w),
      low = (BigInt(talk.floor) - 1n).toString();
    expect(() => operate(w, { type: 'contract-offer', player: p.id, wage: low, term: 2 })).toThrow(
      moneyLabel(w, talk.floor),
    );
    expect(w).toEqual(before);
    operate(w, { type: 'contract-offer', player: p.id, wage: talk.floor, term: 2 });
    expect(p).toMatchObject({ wage: talk.floor, until: w.year + 3 });
    expect(p.unhappy).toBeUndefined();
    expect(p.transferRequest).toBeUndefined();
    expect(p.stance).toBeUndefined();
    expect(w.events.at(-1)!.detail).toContain('이적 요청 철회');
    expect(() => operate(w, { type: 'contract-decline', player: p.id })).toThrow('협상');

    const sale = unhappy();
    const buyer = sale.w.clubs.find((c) => c.id !== sale.w.playerClub)!;
    sale.w.bids = [
      {
        id: 'in:unhappy',
        direction: 'in',
        playerId: sale.p.id,
        club: buyer.id,
        fee: '1000',
        year: sale.w.year,
        day: currentDay(sale.w),
        due: currentDay(sale.w) + 5,
        status: 'pending',
      },
    ];
    operate(sale.w, { type: 'respond-bid', id: 'in:unhappy', accept: true });
    expect(sale.p).toMatchObject({ status: 'sold' });
    expect(sale.p.unhappy).toBeUndefined();
  });

  it('closes a retiring player’s talk on his announcement and his request when he retires', () => {
    const { w, p } = talking(70, 36);
    operate(w, { type: 'delegate', key: 'contracts', value: false });
    newYear(w);
    expect(p.talk).toBeDefined();
    p.retiring = w.year;
    contractTalks(w);
    expect(p.talk).toBeUndefined();
    expect(talkItems(w, p.id).every((item) => item.read)).toBe(true);
    // An unhappy player who retires at the close leaves his request behind, its item settled.
    const later = unhappy();
    later.w.calendar = { day: currentDay(later.w) + 42 };
    transferRequests(later.w);
    expect(later.w.inbox!.at(-1)).toMatchObject({ kind: 'transfer-request', ref: later.p.id });
    expect(later.w.inbox!.at(-1)!.read).toBeFalsy();
    later.p.retiring = later.w.year;
    retireAtClose(later.w);
    expect(later.p.status).toBe('retired');
    expect([later.p.unhappy, later.p.transferRequest]).toEqual([undefined, undefined]);
    expect(later.w.inbox!.filter((item) => item.ref === later.p.id && !item.read)).toEqual([]);
  });

  it('brings compensation for an expiring 1990 contract, none for a 2000 one or nobody’s signing (→CLUB-28)', () => {
    /** The close of the season before `year`, once the books of `year` are open. */
    const close = (year: number) => {
      const w = world();
      w.year = year;
      for (const p of activePlayers(w)) p.until = year + 2;
      const [leaving, staying, loaned] = activePlayers(w);
      Object.assign(leaving, { until: year, unhappy: { reason: 'raise-declined', year, day: 0 } });
      staying.until = year + 1;
      Object.assign(loaned, { until: year, loanUntil: year });
      const cash = BigInt(w.cash),
        value = marketValue(w, leaving, clubOf(w).tier);
      expireContracts(w);
      expect(leaving.status).toBe('sold');
      expect(leaving.unhappy).toBeUndefined();
      expect([staying.status, loaned.status]).toEqual(['active', 'active']);
      return { w, cash, value, event: w.events.at(-1)! };
    };
    const before = close(1990),
      paid = ratio(before.value, 50n, 100n);
    expect(before.event).toMatchObject({ kind: 'free-transfer-compensation', amount: paid });
    expect(BigInt(before.w.cash)).toBe(before.cash + BigInt(paid));
    const bosman = close(2000);
    expect(bosman.event.kind).toBe('contract-expiry');
    expect(bosman.event.amount).toBeUndefined();
    expect(BigInt(bosman.w.cash)).toBe(bosman.cash);
    // The club he joins pays: in 1990 one no club signs brings nothing.
    const unsigned = world();
    unsigned.year = 1990;
    for (const p of activePlayers(unsigned)) p.until = 1992;
    const nobody = Object.assign(activePlayers(unsigned)[0], rated(unsigned, 1), { until: 1990 }),
      cash = unsigned.cash;
    expect(suitorFor(unsigned, nobody, () => 0)).toBeUndefined();
    expireContracts(unsigned);
    expect(nobody.status).toBe('sold');
    expect(unsigned.events.at(-1)).toMatchObject({ kind: 'contract-expiry' });
    expect(unsigned.events.at(-1)!.amount).toBeUndefined();
    expect(unsigned.cash).toBe(cash);
  });
});
