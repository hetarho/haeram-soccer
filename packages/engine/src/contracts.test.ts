import { legacySettings } from './responsibilities';
import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { currency, footballIndex, priceIndex } from '../../catalogs/src/index';
import type {
  AgentRating,
  ManagerStyle,
  Player,
  PolicyLevel,
  UnhappyReason,
  World,
} from '../../contracts/src/types';
import {
  activePlayers,
  advanceRound,
  agentOf,
  agentPremium,
  applyClauses,
  buildEffects,
  CLAUSE_CONFIG,
  closeSeason,
  clubOf,
  contractTalks,
  createWorld,
  currentDay,
  delegated,
  divisionFor,
  endAmbition,
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
  ownLeagueClubs,
  ownStarters,
  playerValue,
  playingAbility,
  rating,
  ratio,
  recentRevenue,
  retireAtClose,
  seasonDayOf,
  seasonEndWithWage,
  settleClauses,
  settleMorale,
  staffTerm,
  suitorFor,
  TALK_RULE_DEFAULT,
  talkFor,
  talkRoundChance,
  talkRuleOf,
  talksRound,
  talkTerms,
  talkUntil,
  transferOffers,
  transferRequests,
  transferWindowDays,
  wageBill,
} from './index';
import { professionalStart } from './testing';

// The constants (MARKET_CONFIG) follow the career calibration (→ECON-29), so these tests hold the
// CLUB-25 targets, not the constants.
const founding = {
  country: 'ENG' as const,
  name: 'Market Wages',
  color: '#224433',
  seed: 'market-wages',
  level: 'normal' as const,
};
function world(country: 'ENG' | 'ESP' = 'ENG') {
  const w = createWorld({ ...founding, country });
  w.settings = legacySettings(2); // This suite explicitly exercises delegated contract policy.
  return w;
}
/** A midfielder rated `ability` everywhere, aged `age` in the world's year. */
function rated(w: World, ability: number, age = 26, potential = ability): Player {
  const player = structuredClone(activePlayers(w)[0]);
  for (const a of ATTRIBUTES) player.attrs[a] = ability;
  return { ...player, position: 'CM', positions: { CM: 3 }, born: w.year - age, potential };
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

  it('pays for promise when young and peaks at 30', () => {
    const w = world();
    const wage = (p: Player) => amount(marketWage(w, p, 0));
    expect(wage(rated(w, 60, 19, 85))).toBeGreaterThan(wage(rated(w, 60, 19)));
    expect(wage(rated(w, 60, 26, 85))).toBe(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 18))).toBeLessThan(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 26))).toBeLessThan(wage(rated(w, 60, MARKET_CONFIG.junior)));
    expect(wage(rated(w, 60, 34))).toBeLessThan(wage(rated(w, 60, MARKET_CONFIG.veteran)));
  });

  it('starts generated players at their market wage', () => {
    const w = world();
    for (const p of activePlayers(w)) expect(p.wage).toBe(marketWage(w, p));
    for (const offer of transferOffers(w))
      expect(offer.player.wage).toBe(marketWage(w, offer.player));
    const top = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    for (const p of npcSquad(w.seed, w.year, top)) expect(p.wage).toBe(marketWage(w, p, 0));
    const prospect = makePlayer('ENG', w.seed, 'academy:test', w.year, 45, 'CM', 17);
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

/**
 * A rich club whose first player is rated `ability`, aged `age`, in his contract's final season:
 * half its founding season played with revenue far beyond its wage bill (→CLUB-26).
 */
function talking(ability = 80, age = 26) {
  const w = world();
  w.cash = '999999999999';
  w.round = 23;
  w.income = '999999999999';
  const p = Object.assign(activePlayers(w)[0], rated(w, ability, age), {
    until: w.year + 1,
    agent: 1 as Player['agent'],
  });
  // This fixture deliberately changes a founder's identity attributes.
  Object.assign(w.people![p.id], { born: p.born, position: p.position });
  return { w, p };
}
/** 1 January, when the winter window opens and players in their final season ask to renew. */
function newYear(w: World) {
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  contractTalks(w);
}
/** Contract talks on season day `day`. */
function talksOn(w: World, day: number) {
  w.calendar = { day };
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

  it('lets a delegated club keeping everyone at 140% renew a star 짠물 declines', () => {
    const [generous, tight] = (['keepAll', 'frugal'] as const).map((option) => {
      const { w, p } = talking(80);
      // A strong agent and a slightly low 분위기 put his floor just above his market wage.
      p.agent = 5;
      w.morale = 50;
      operate(w, { type: 'direction', key: 'renewal', option });
      expect(delegated(w, 'contracts')).toBe(true);
      const before = { wage: p.wage, until: p.until, floor: talkTerms(w, p).floor };
      newYear(w);
      expect(p.talk).toBeUndefined();
      const items = talkItems(w, p.id);
      expect(items).toHaveLength(1);
      expect(items[0].attention).toBe(false);
      return { w, p, before, report: items[0] };
    });
    // In winter the staff offer the floor for the rest of this season and two more.
    expect(generous.p.wage).toBe(generous.before.floor);
    expect(generous.p.until).toBe(generous.w.year + 3);
    // The 단장 takes delegated talks and his reports name him (→STAFF-20).
    expect(generous.report.title).toMatch(/^단장이 .*받아들였어요$/);
    expect(generous.w.events.at(-1)).toMatchObject({ kind: 'contract' });
    expect(generous.w.events.at(-1)!.detail).toMatch(/^단장 합의 · /);
    // 짠물's market wage is below what he settles for.
    expect(tight.p).toMatchObject({ wage: tight.before.wage, until: tight.before.until });
    expect(tight.report.title).toMatch(/^단장이 .*거절했어요$/);
    expect(tight.report.detail).toContain('연봉 상한');
    expect(tight.w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
  });

  it('declines a raise that takes the wage bill past 65% of the last 12 months’ revenue', () => {
    /** Half a founding season played with `income` booked, so its year reads as twice that. */
    const verdict = (income: (bill: bigint, raise: bigint) => bigint) => {
      const { w, p } = talking(80);
      operate(w, { type: 'direction', key: 'renewal', option: 'keepAll' });
      const raise = BigInt(talkTerms(w, p).floor) - BigInt(p.wage),
        bill = BigInt(wageBill(w));
      w.income = income(bill, raise).toString();
      expect(recentRevenue(w)).toBe((BigInt(w.income) * 2n).toString());
      newYear(w);
      return { w, p, item: talkItems(w, p.id)[0] };
    };
    // The bill after the raise, staff included, is just within 65% of the year: signed.
    const within = verdict((bill, raise) => ((bill + raise) * 100n) / 65n / 2n + 1n);
    expect(within.item.title).toContain('받아들였어요');
    // A little less revenue and the staff decline, saying why.
    const past = verdict((bill, raise) => ((bill + raise) * 100n) / 65n / 2n - 1000n);
    expect(past.item.title).toContain('거절했어요');
    expect(past.item.detail).toContain('최근 12개월 수입');
    expect(past.item.detail).toContain('65%');
    expect(past.w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
    // Staff wages count in the bill.
    const costs = operatingCosts(past.w);
    expect(BigInt(wageBill(past.w))).toBe(
      BigInt(costs.playerWages) + BigInt(costs.managerWage) + BigInt(costs.staffWages),
    );
    // Owner capital and player trading are not revenue a wage bill rests on.
    const { w } = talking(80);
    w.income = '100000';
    const before = recentRevenue(w);
    w.events.push(
      {
        year: w.year,
        round: 3,
        kind: 'support',
        title: '',
        detail: '',
        amount: '40000',
        currency: w.currency,
      },
      {
        year: w.year,
        round: 4,
        kind: 'transfer-out',
        title: '',
        detail: '',
        amount: '20000',
        currency: w.currency,
      },
    );
    expect(BigInt(recentRevenue(w))).toBe(BigInt(before) - 120000n);
  });

  it('delegated talks follow 재계약 기조: whom the staff keep and how far they go', () => {
    /** The staff's answer to `p` at the winter opening under 재계약 기조 `option`. */
    const answer = (option: string, ability = 80, age = 26) => {
      const { w, p } = talking(ability, age);
      // A strong agent and a slightly low 분위기 put his floor just above his market wage
      // (→CLUB-30), within 표준's 110%.
      p.agent = 5;
      w.morale = 50;
      operate(w, { type: 'direction', key: 'renewal', option });
      const floor = talkTerms(w, p).floor,
        market = marketWage(w, p);
      newYear(w);
      return { w, p, floor, market, item: talkItems(w, p.id)[0] };
    };
    // 표준 is 110% of the market wage, no minimum OVR and no age limit.
    expect(talkRuleOf(createWorld(founding))).toEqual(TALK_RULE_DEFAULT);
    expect(TALK_RULE_DEFAULT).toEqual({ maxPay: 1.1, minOvr: 0 });
    expect(answer('standard').item.title).toContain('받아들였어요');
    const kept = answer('keepAll');
    expect(kept.item.title).toContain('받아들였어요');
    expect(kept.p.wage).toBe(kept.floor);
    // 짠물 pays at most his market wage: a floor above it is declined, naming the cap.
    const frugal = answer('frugal');
    expect(BigInt(frugal.floor)).toBeGreaterThan(BigInt(frugal.market));
    expect(frugal.item.title).toContain('거절했어요');
    expect(frugal.item.detail).toContain('연봉 상한(시장가의 100%');
    expect(frugal.item.detail).toContain('재계약 기조 짠물');
    // 핵심만 붙잡기 keeps a starter and lets a squad player go.
    expect(answer('coreOnly').item.title).toContain('받아들였어요');
    const squad = answer('coreOnly', 15);
    expect(squad.item.title).toContain('거절했어요');
    expect(squad.item.detail).toContain('주전이 아니라');
    // 젊은 선수 우선 lets a player of 30 or more go and keeps a younger one.
    const old = answer('youngFirst', 80, 30);
    expect(old.item.title).toContain('거절했어요');
    expect(old.item.detail).toContain('30세 미만만 붙잡기');
    expect(answer('youngFirst', 80, 29).item.title).toContain('받아들였어요');
    // A declined player turns unhappy unless the manager talks him round (→CLUB-27).
    expect(old.w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
  });

  it('signs a veteran for one season and declines a raise the cash cannot carry', () => {
    const veteran = talking(70, 33);
    newYear(veteran.w);
    expect(veteran.p.until).toBe(veteran.w.year + 2);
    // In the summer, a 33-year-old in his final season signs on until next season's close.
    const summer = talking(70, 33);
    talksOn(summer.w, transferWindowDays(summer.w.year).summerOpen);
    expect(talkItems(summer.w, summer.p.id)[0].title).toContain('받아들였어요');
    expect(summer.p.until).toBe(summer.w.year + 2);

    const broke = talking(80);
    operate(broke.w, { type: 'direction', key: 'renewal', option: 'keepAll' });
    // Twelve rounds of today's costs: short of the 13-round runway even before the raise.
    broke.w.cash = ((BigInt(operatingCosts(broke.w).annual) / 46n) * 12n).toString();
    const until = broke.p.until;
    newYear(broke.w);
    expect(broke.p.until).toBe(until);
    expect(talkItems(broke.w, broke.p.id)[0].detail).toContain('13라운드');
  });

  it('refuses an owner’s offer below the floor, stating it, and signs one at the floor', () => {
    const { w, p } = talking(80);
    operate(w, { type: 'intervention', level: 1 });
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

  it('opens talks only when a window opens: the final season at both openings', () => {
    const w = world();
    operate(w, { type: 'intervention', level: 1 });
    const [final, underpaid] = activePlayers(w);
    final.until = w.year + 1;
    underpaid.wage = ((BigInt(marketWage(w, underpaid)) * 70n) / 100n).toString();
    const { summerOpen, summerClose, winterOpen, winterClose } = transferWindowDays(w.year);
    // No other day: not the window's later days, its deadline or the days between windows.
    for (const day of [1, 30, summerClose, summerClose + 1, winterOpen - 1, winterOpen + 1])
      talksOn(w, day);
    for (const day of [winterClose, seasonDayOf(w.year, 4, 1), seasonDayOf(w.year, 5, 1)])
      talksOn(w, day);
    expect([final.talk, underpaid.talk]).toEqual([undefined, undefined]);
    expect(talkItems(w, final.id)).toEqual([]);
    // The summer window opens on the season's first day.
    talksOn(w, summerOpen);
    expect(final.talk).toMatchObject({ kind: 'renew', year: w.year, day: summerOpen });
    expect(underpaid.talk).toMatchObject({ kind: 'improve', day: summerOpen });
    expect(talkItems(w, underpaid.id)[0].title).toContain('계약 개선 협상 요청');
    // Unanswered, he asks again when the winter window opens; the improved contract does not.
    talksOn(w, winterOpen);
    expect(final.talk).toMatchObject({ kind: 'renew', day: winterOpen });
    expect(underpaid.talk).toMatchObject({ kind: 'improve', day: summerOpen });
    expect(talkItems(w, final.id).filter((item) => !item.read)).toHaveLength(1);
  });

  it('opens an improved-contract talk with at most three seasons left, once a season', () => {
    const w = world();
    operate(w, { type: 'intervention', level: 1 });
    const [three, four, fair] = activePlayers(w),
      below = (p: Player, percent: bigint) =>
        void (p.wage = ((BigInt(marketWage(w, p)) * percent) / 100n).toString());
    // 30% below his market wage, the season's three included; one with four left never asks.
    Object.assign(three, { until: w.year + 3 });
    Object.assign(four, { until: w.year + 4 });
    Object.assign(fair, { until: w.year + 2 });
    below(three, 70n);
    below(four, 70n);
    below(fair, 76n);
    talksOn(w, 0);
    expect(three.talk).toMatchObject({ kind: 'improve', year: w.year, day: 0 });
    expect(three.improveAsked).toBe(w.year);
    expect([four.talk, fair.talk]).toEqual([undefined, undefined]);
    // The owner may still answer a pending talk; only the level changes who decides.
    w.intervention = 2;
    w.settings = legacySettings(2);
    operate(w, { type: 'contract-decline', player: three.id });
    expect(w.intervention).toBe(2);
    w.intervention = 1;
    w.settings = legacySettings(1);
    expect(three.talk).toBeUndefined();
    expect(w.events.at(-1)).toMatchObject({ kind: 'contract-decline' });
    expect(w.events.at(-1)!.title).toContain('계약 개선');
    // Talked round or not (→CLUB-27), he does not ask again this season.
    delete three.unhappy;
    talksOn(w, transferWindowDays(w.year).winterOpen);
    expect(three.talk).toBeUndefined();
    expect(four.talk).toBeUndefined();
    // Next season he asks again at the summer opening, and the agreement runs from today.
    w.year++;
    talksOn(w, 0);
    expect(three.talk).toMatchObject({ kind: 'improve', year: w.year });
    const cash = w.cash,
      floor = three.talk!.floor;
    operate(w, { type: 'contract-offer', player: three.id, wage: floor, term: 4 });
    expect(three).toMatchObject({ wage: floor, until: w.year + 4 });
    expect(w.cash).toBe(cash);
    expect(w.events.at(-1)).toMatchObject({ kind: 'contract' });
    expect(w.events.at(-1)!.title).toContain('계약 개선 합의');
  });

  it('signs whole seasons in the summer and half seasons in winter, ending at a close', () => {
    const offer = (day: number, term: number) => {
      const { w, p } = talking(80);
      operate(w, { type: 'intervention', level: 1 });
      talksOn(w, day);
      const command = { type: 'contract-offer', player: p.id, wage: p.talk!.floor } as const;
      operate(w, { ...command, term: term as 0 });
      return p.until - w.year;
    };
    const { winterOpen } = transferWindowDays(world().year);
    // Summer: 1–5 seasons, this one included; 1 ends at this season's close.
    expect(offer(0, 1)).toBe(1);
    expect(offer(0, 5)).toBe(5);
    // Winter: the rest of this season and 0–4 more; 0 ends at this close, 2 two closes later.
    expect(offer(winterOpen, 0)).toBe(1);
    expect(offer(winterOpen, 2)).toBe(3);
    expect(offer(winterOpen, 4)).toBe(5);
    // Each window refuses the other's ends.
    expect(() => offer(0, 0)).toThrow('1시즌–5시즌');
    expect(() => offer(winterOpen, 5)).toThrow('½시즌–4½시즌');
    const { w } = talking(80);
    w.calendar = { day: winterOpen };
    expect(talkUntil(w, 0)).toBe(w.year + 1);
    w.calendar = { day: winterOpen - 1 };
    expect(talkUntil(w, 1)).toBe(w.year + 1);
  });

  it('declines a delegated renewal the season’s cash projection cannot carry', () => {
    /** A club at the summer opening whose season loses money, `p` in his final season. */
    const losing = () => {
      const { w, p } = talking(80);
      operate(w, { type: 'direction', key: 'renewal', option: 'keepAll' });
      w.calendar = { day: 0 };
      // A manager paid far beyond the club's income makes the season a loss.
      w.manager.wage = (BigInt(operatingCosts(w).annual) * 4n).toString();
      const floor = talkTerms(w, p).floor,
        perRound = (BigInt(operatingCosts(w).annual) + BigInt(floor) - BigInt(p.wage)) / BigInt(46),
        runway = perRound * 13n,
        // The season-end projection moves with cash one for one.
        loss = BigInt(w.cash) - BigInt(seasonEndWithWage(w, p, floor));
      expect(loss).toBeGreaterThan(0n);
      return { w, p, runway, loss };
    };
    const short = losing(),
      covered = losing();
    // Cash now covers 13 rounds either way; only the projected season end differs.
    short.w.cash = (short.runway + short.loss - 1n).toString();
    covered.w.cash = (covered.runway + covered.loss).toString();
    const until = short.p.until;
    contractTalks(short.w);
    contractTalks(covered.w);
    expect(short.p.until).toBe(until);
    const [declined] = talkItems(short.w, short.p.id);
    expect(declined.title).toContain('거절했어요');
    expect(declined.detail).toContain('시즌 말 자금 전망');
    // Accepted: the floor for two seasons past this one (a summer term of three).
    expect(covered.p.until).toBe(covered.w.year + 3);
    expect(talkItems(covered.w, covered.p.id)[0].title).toContain('받아들였어요');
  });

  it('never lets a delegated improved contract end before the running one', () => {
    /** A delegated club whose 33-year-old has three seasons left, 30% below his market wage. */
    const improving = (day: number) => {
      const { w, p } = talking(70, 33);
      operate(w, { type: 'direction', key: 'renewal', option: 'keepAll' });
      p.until = w.year + 3;
      p.wage = ((BigInt(marketWage(w, p)) * 70n) / 100n).toString();
      talksOn(w, day);
      expect(talkItems(w, p.id)[0].title).toContain('계약 개선 요구를 받아들였어요');
      return { w, p };
    };
    // A veteran's offer would end next season's close; the running contract ends later, so it
    // keeps that end: a summer term of three, a winter term of two.
    for (const day of [0, transferWindowDays(world().year).winterOpen]) {
      const { w, p } = improving(day);
      expect(p.until).toBe(w.year + 3);
      expect(staffTerm(w, { ...p, until: w.year + 1 })).toBe(day ? 1 : 2);
    }
    // Younger players sign for two seasons past this one in either window.
    const { w, p } = talking(70, 26);
    expect(staffTerm(w, p)).toBe(3);
    w.calendar = { day: transferWindowDays(w.year).winterOpen };
    expect(staffTerm(w, p)).toBe(2);
    expect(talkUntil(w, staffTerm(w, p))).toBe(w.year + 3);
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
  operate(w, { type: 'intervention', level: 1 });
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
    operate(w, { type: 'intervention', level: 1 });
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
    starter.unhappy = { reason: 'improve-declined', year: w.year, day: 0 };
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
    const { w, p } = unhappy('improve-declined');
    Object.assign(p, { transferRequest: { year: w.year, day: currentDay(w) }, stance: 'listed' });
    // An offer meets the floor he holds out for today.
    const talk = talkFor(w, p)!;
    expect(talk).toMatchObject({ kind: 'improve', floor: talkTerms(w, p).floor });
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
    operate(w, { type: 'intervention', level: 1 });
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
      Object.assign(leaving, {
        until: year,
        unhappy: { reason: 'improve-declined', year, day: 0 },
      });
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
    Object.assign(unsigned.people![nobody.id], { born: nobody.born, position: nobody.position });
    nobody.joined = unsigned.year;
    expect(suitorFor(unsigned, nobody, () => 0)).toBeUndefined();
    expireContracts(unsigned);
    expect(nobody.status).toBe('sold');
    expect(unsigned.events.at(-1)).toMatchObject({ kind: 'contract-expiry' });
    expect(unsigned.events.at(-1)!.amount).toBeUndefined();
    expect(unsigned.cash).toBe(cash);
  });
});

describe('agents and contract clauses (→CLUB-29, CLUB-30)', () => {
  it('gives every created player an agent, stronger more often for better players', () => {
    const w = world();
    const agents = (rating: number) =>
      Array.from(
        { length: 1500 },
        (_, i) =>
          makePlayer('ENG', w.seed, `agent:${rating}:${i}`, w.year, rating, 'CM', 26).agent!,
      );
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const weak = agents(30),
      even = agents(60),
      strong = agents(90);
    for (const agent of [...weak, ...even, ...strong]) expect([1, 2, 3, 4, 5]).toContain(agent);
    expect(mean(strong)).toBeGreaterThan(mean(even) + 0.5);
    expect(mean(even)).toBeGreaterThan(mean(weak) + 0.5);
    // A player rated 90 never has a 1-rated agent, one rated 30 never a 5-rated one.
    expect(strong).not.toContain(1);
    expect(weak).not.toContain(5);
    // Squads, the market, free agents and academy prospects all have one.
    for (const p of activePlayers(w)) expect(p.agent).toBeDefined();
    for (const offer of transferOffers(w)) expect(offer.player.agent).toBeDefined();
    // The same player is the same whatever else is drawn: the agent is his stream's last draw.
    const again = makePlayer('ENG', w.seed, 'agent:30:0', w.year, 30, 'CM', 26);
    expect(again.agent).toBe(weak[0]);
  });

  it('raises the demand 1% per agent level above 1', () => {
    const { w, p } = talking(80);
    const demand = (agent: AgentRating) => {
      p.agent = agent;
      return talkTerms(w, p).demand;
    };
    const market = BigInt(marketWage(w, p));
    expect(agentPremium(1)).toBe(1);
    expect(agentPremium(5)).toBeCloseTo(1.04);
    expect(demand(1)).toBe(ratio(market.toString(), 1000n, 1000n));
    expect(demand(3)).toBe(ratio(market.toString(), 1020n, 1000n));
    expect(demand(5)).toBe(ratio(market.toString(), 1040n, 1000n));
  });

  it('keeps clause shares and sizes in their ranges, leaning with the agent', () => {
    const { w, p } = talking(80);
    const sample = (agent: AgentRating) => {
      const draws = Array.from({ length: 4000 }, (_, i) =>
        settleClauses(w.seed, p, agent, w.year + (i % 40), Math.floor(i / 40)),
      );
      const rises = draws.flatMap((c) => (c.promotion ? [c.promotion] : [])),
        cuts = draws.flatMap((c) => (c.relegation ? [c.relegation] : []));
      for (const rise of rises) expect(rise).toBeGreaterThanOrEqual(10);
      for (const rise of rises) expect(rise).toBeLessThanOrEqual(60);
      for (const cut of cuts) expect(cut).toBeLessThanOrEqual(-25);
      for (const cut of cuts) expect(cut).toBeGreaterThanOrEqual(-50);
      const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
      return {
        rise: rises.length / draws.length,
        cut: cuts.length / draws.length,
        riseSize: mean(rises),
        cutSize: -mean(cuts),
      };
    };
    const levels = ([1, 2, 3, 4, 5] as const).map(sample);
    // The configured shares from a 1-rated to a 5-rated agent, within CLUB-29's 30–80% of contracts
    // for a rise and 80–40% for a cut.
    const { promotion: rise, relegation: cut } = CLAUSE_CONFIG;
    expect(levels[0].rise).toBeCloseTo(rise.share[0], 1);
    expect(levels[4].rise).toBeCloseTo(rise.share[1], 1);
    expect(levels[0].cut).toBeCloseTo(cut.share[0], 1);
    expect(levels[4].cut).toBeCloseTo(cut.share[1], 1);
    for (const value of rise.share) expect(value).toBeGreaterThanOrEqual(0.3);
    for (const value of rise.share) expect(value).toBeLessThanOrEqual(0.8);
    for (const value of cut.share) expect(value).toBeGreaterThanOrEqual(0.4);
    for (const value of cut.share) expect(value).toBeLessThanOrEqual(0.8);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].rise).toBeGreaterThan(levels[i - 1].rise);
      expect(levels[i].cut).toBeLessThan(levels[i - 1].cut);
      expect(levels[i].riseSize).toBeGreaterThan(levels[i - 1].riseSize);
      expect(levels[i].cutSize).toBeLessThan(levels[i - 1].cutSize);
    }
    // The config stays inside CLUB-29's ranges.
    const { promotion, relegation } = CLAUSE_CONFIG;
    expect(Math.min(...promotion.from, ...promotion.to)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...promotion.from, ...promotion.to)).toBeLessThanOrEqual(60);
    expect(Math.min(...relegation.from, ...relegation.to)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...relegation.from, ...relegation.to)).toBeLessThanOrEqual(50);
  });

  it('settles a talk’s clauses as he asks and signs them unrerolled', () => {
    const { w, p } = talking(80);
    operate(w, { type: 'intervention', level: 1 });
    newYear(w);
    const clauses = p.talk!.clauses!;
    expect(clauses).toEqual(
      settleClauses(w.seed, p, agentOf(w, p), w.year, seasonDayOf(w.year, 1, 1)),
    );
    expect(talkItems(w, p.id)[0].detail).toContain(`에이전트 ${agentOf(w, p)}등급`);
    w.calendar = { day: currentDay(w) + 3 };
    operate(w, { type: 'contract-offer', player: p.id, wage: p.talk!.floor, term: 2 });
    expect(p.clauses).toEqual(clauses);
  });

  it('signs clauses with a transfer, a free agent and an academy promotion, none with a loan', () => {
    const w = world();
    w.cash = '999999999999';
    w.calendar = { day: 10 };
    const offers = transferOffers(w);
    operate(w, { type: 'recruit', candidate: 0 });
    operate(w, { type: 'recruit', candidate: 1, loan: true });
    const free = w.players.find((p) => p.id === offers[0].player.id)!,
      loaned = w.players.find((p) => p.id === offers[1].player.id)!;
    expect(free.clauses).toEqual(settleClauses(w.seed, free, free.agent!, w.year, currentDay(w)));
    expect(loaned.clauses).toBeUndefined();
    const prospect = makePlayer('ENG', w.seed, 'academy:clauses', w.year, 45, 'CM', 17);
    w.academy = { players: [prospect] };
    operate(w, { type: 'promote-youth', id: prospect.id });
    const promoted = w.players.find((p) => p.id === prospect.id)!;
    expect(promoted.clauses).toEqual(
      settleClauses(w.seed, promoted, promoted.agent!, w.year, currentDay(w)),
    );
  });

  it('signs the founding squad and the close’s refills with clauses in CLUB-29’s ranges', () => {
    const inRange = (p: Player) => {
      expect(p.clauses).toBeDefined();
      const { promotion, relegation } = p.clauses!;
      if (promotion !== undefined) expect(promotion).toBeGreaterThanOrEqual(10);
      if (promotion !== undefined) expect(promotion).toBeLessThanOrEqual(60);
      if (relegation !== undefined) expect(relegation).toBeLessThanOrEqual(-25);
      if (relegation !== undefined) expect(relegation).toBeGreaterThanOrEqual(-50);
    };
    const w = world();
    // The founders sign on the founding day, each from his own stream.
    for (const p of activePlayers(w)) {
      inRange(p);
      expect(p.clauses).toEqual(settleClauses(w.seed, p, p.agent!, w.year, 0));
    }
    expect(activePlayers(w).some((p) => p.clauses!.promotion)).toBe(true);
    expect(activePlayers(w).some((p) => p.clauses!.relegation)).toBe(true);
    // A squad left short at the close is refilled with players who sign their own clauses.
    const close = professionalStart(world());
    while (close.round < 46) advanceRound(close, undefined, false);
    for (const p of activePlayers(close).slice(0, 4)) p.status = 'sold';
    const kept = new Set(activePlayers(close).map((p) => p.id));
    closeSeason(close);
    // Generated youths and academy graduates fill the places.
    const refills = activePlayers(close).filter((p) => !kept.has(p.id));
    expect(refills.length).toBeGreaterThanOrEqual(4);
    for (const p of refills) inRange(p);
    expect(refills.some((p) => Object.keys(p.clauses!).length)).toBe(true);
  });

  it('applies rises only to contracts carrying one, cuts on relegation, and reports the change', () => {
    const w = world();
    // Only the contracts below carry clauses.
    for (const p of activePlayers(w)) p.clauses = {};
    const [rise, cut, both, none, loan] = activePlayers(w);
    Object.assign(rise, { wage: '10000', clauses: { promotion: 25 } });
    Object.assign(cut, { wage: '10000', clauses: { relegation: -40 } });
    Object.assign(both, { wage: '20000', clauses: { promotion: 10, relegation: -30 } });
    Object.assign(none, { wage: '10000' });
    Object.assign(loan, { wage: '10000', loanUntil: w.year + 1, clauses: { promotion: 50 } });
    const bill = () => activePlayers(w).reduce((sum, p) => sum + BigInt(p.wage), 0n);
    const up = structuredClone(w),
      before = bill();
    applyClauses(up, 'promotion');
    const wages = (x: World) =>
      [rise, cut, both, none, loan].map((p) => x.players.find((q) => q.id === p.id)!.wage);
    expect(wages(up)).toEqual(['12500', '10000', '22000', '10000', '10000']);
    const report = up.inbox!.at(-1)!;
    expect(report).toMatchObject({ kind: 'finance', attention: false });
    expect(report.title).toContain(`+${moneyLabel(up, '4500')}`);
    expect(report.detail).toContain('2명');
    applyClauses(w, 'relegation');
    expect(wages(w)).toEqual(['10000', '6000', '14000', '10000', '10000']);
    expect(bill()).toBe(before - 10000n);
    expect(w.inbox!.at(-1)!.title).toContain(`−${moneyLabel(w, '10000')}`);
  });

  it('cuts the clause wages at the close that relegates the club', () => {
    const w = professionalStart(world());
    while (w.round < 46) advanceRound(w, undefined, false);
    // The own club finishes last of its division.
    const league = ownLeagueClubs(w).filter((c) => c.id !== w.playerClub);
    league.forEach((c, i) => (w.tables[c.id].points = 200 - i));
    w.tables[w.playerClub].points = 0;
    const tier = clubOf(w).tier,
      [cut, kept] = activePlayers(w).filter((p) => p.until > w.year + 1 && !p.retiring);
    Object.assign(cut, { wage: '10000', clauses: { relegation: -40 } });
    Object.assign(kept, { wage: '10000', clauses: { promotion: 40 } });
    closeSeason(w);
    expect(clubOf(w).tier).toBe(tier + 1);
    expect([cut.wage, kept.wage]).toEqual(['6000', '10000']);
    expect(w.inbox!.some((item) => item.title.startsWith('강등 조항'))).toBe(true);
  });
});

describe('ambition unhappiness (→CLUB-27)', () => {
  it('ambition unhappiness ends at the close', () => {
    const w = world();
    const [ambitious, declined] = activePlayers(w);
    ambitious!.unhappy = { reason: 'ambition', year: w.year, day: 30 };
    ambitious!.transferRequest = { year: w.year, day: 72 };
    ambitious!.stance = 'listed';
    declined!.unhappy = { reason: 'renewal-declined', year: w.year, day: 30 };
    endAmbition(w);
    expect(ambitious!.unhappy).toBeUndefined();
    expect(ambitious!.transferRequest).toBeUndefined();
    expect(ambitious!.stance).toBeUndefined();
    expect(w.events.at(-1)!.title).toBe(`${ambitious!.name} 언해피 해소`);
    // Only meeting his floor or a sale ends the other kind.
    expect(declined!.unhappy).toMatchObject({ reason: 'renewal-declined' });
    // The season's close runs it.
    const season = world();
    operate(season, { type: 'intervention', level: 1 });
    const p = activePlayers(season)[0]!;
    while (season.round < 46) advanceRound(season, undefined, false);
    p.unhappy = { reason: 'ambition', year: season.year, day: 30 };
    closeSeason(season);
    expect(p.unhappy).toBeUndefined();
  });
});
