import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import type { OwnerTrait, WealthTier } from '../../contracts/src/owner';
import type { Club, Player, SeasonArchive, World } from '../../contracts/src/types';
import { takeOver, takeoverExpenses, takeoverLoan, uncoveredSlots } from './takeover';
import { clubValue, facilityStage, fromPounds, tierFortune } from './club-value';
import {
  CLUB_BOOKS,
  CLUB_TAKEOVER,
  FAN_MOOD,
  OWNER_BUSINESS,
  OWNER_DIVIDEND,
  TAKEOVER_DEBT,
} from './owner-config';
import { clubManager, managerOffers } from './managerMarket';
import { makePlayer, squad } from './world';
import { formationOf, isOwnSeason, lastOwnSeason, ownSeasons } from './player-state';
import { lineOf } from './player';
import { fanFollowing } from './fans';
import { basicStaff, staffQuote } from './staff';
import { defaultSettings } from './responsibilities';
import { presetBoard, presetById } from './presets';
import {
  assessOperatingExpenses,
  DISTRIBUTION_CONFIG,
  EXPENSE_CONFIG,
  lastSeasonTier,
  lastSeasonTurnover,
  leagueShare,
  operatingExpensesAt,
  parachutePayment,
  recentRevenue,
} from './finance';
import { commercialValue } from './sponsors';
import { clubNews } from './news';
import { clubMilestones } from './goals';
import { scaleBy, zeroMetrics } from './primitives';
import { ownerlessWorld, withBooks } from './ownerless.testkit';
import { historyWorld } from './history';
import { settleNpcBooks } from './books';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

const choice = (tier: WealthTier, traits: OwnerTrait[] = []) => ({ tier, traits });
/** The club at `place` of a division of England. */
const atPlace = (w: World, tier: number, place: number): Club => {
  return w.clubs
    .filter((c) => c.country === 'ENG' && c.tier === tier && !c.representative)
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))[place - 1]!;
};
/** An English second-tier club near the top, with cash, a debt and last season's books. */
function setup(seed = 'takeover') {
  const w = ownerlessWorld(seed);
  const club = atPlace(w, 1, 3);
  withBooks(w, club, { cash: '480000', debt: '1200000', income: '2600000', wages: '1700000' });
  return { w, club };
}

describe('takeover (→ECON-38, CLUB-1, OWNER-4)', () => {
  it('makes the club as it stands the owner’s, its squad his players at the club’s 조직력', () => {
    const { w, club } = setup();
    club.cohesion = 0.62;
    const fielded = squad(w, club).map((p) => p.id);
    takeOver(w, club.id, choice('industrial'), undefined, DISABLED_RELEASE);
    expect(w.playerClub).toBe(club.id);
    const ids = w.players.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(fielded));
    expect(w.players.length).toBeGreaterThanOrEqual(CLUB_TAKEOVER.squad);
    expect(w.players.filter((p) => lineOf(p.position) === 'GK').length).toBeGreaterThanOrEqual(
      CLUB_TAKEOVER.goalkeepers,
    );
    expect(uncoveredSlots(w.players, formationOf(w.tactic))).toEqual([]);
    for (const p of w.players) {
      expect(p).toMatchObject({ status: 'active', fatigue: 0, adaptation: 0.62, joined: w.year });
      expect(p.clauses).toBeDefined();
      expect(w.people?.[p.id]?.club).toBe(club.id);
    }
    // The generated places are at the club's level, in its division's money.
    for (const p of w.players.filter((q) => !fielded.includes(q.id)))
      expect(p.id.startsWith(`${club.id}:takeover:`)).toBe(true);
    expect(club.cohesion).toBeUndefined();
    expect(club.books).toBeUndefined();
  });

  it('keeps the manager with his school, style and level; a new club’s staff and settings', () => {
    const { w, club } = setup();
    const identity = structuredClone(club.identity);
    const stage = facilityStage(w, club);
    takeOver(w, club.id, choice('industrial'), undefined, DISABLED_RELEASE);
    const manager = clubManager(w, club);
    expect(w.manager).toEqual(manager);
    expect(w.manager.style).toBeDefined();
    expect(w.tactic).toBe(manager.philosophy);
    expect(w.staff).toEqual(basicStaff(w));
    expect(w.academy).toEqual({ players: [] });
    expect(w.settings).toEqual(defaultSettings());
    expect(w.bids).toEqual([]);
    expect(w.inbox).toEqual([]);
    expect({
      stadium: w.stadium,
      trainingGround: w.trainingGround,
      academyFacility: w.academyFacility,
    }).toEqual(stage);
    expect(club.fans).toBe(fanFollowing(club.reputation));
    expect(club.identity).toEqual(identity);
    expect(w.managerHistory?.club).toBe(club.id);
    expect(w.shortlist).toBeDefined();
  });

  it('opens the manager market with the season’s candidates when the world kept none (→STAFF-17)', () => {
    const { w, club } = setup();
    // The world before the takeover keeps every club's managers and no free agent.
    w.managerMarket = {
      year: w.year,
      round: 0,
      free: [],
      clubs: { [club.id]: [0, 1946] },
      serial: 2,
    };
    takeOver(w, club.id, choice('industrial'), undefined, DISABLED_RELEASE);
    const offered = managerOffers(w).map(({ fee: _fee, ...manager }) => (void _fee, manager));
    expect(offered.length).toBeGreaterThanOrEqual(4);
    expect(w.managerMarket).toEqual({
      year: w.year,
      round: 0,
      free: offered,
      clubs: { [club.id]: [0, 1946] },
      serial: 2,
    });
    expect(w.manager.since).toBe(1946);
  });

  it('puts the direction chosen at the takeover in force', () => {
    const { w, club } = setup();
    takeOver(w, club.id, choice('industrial'), 'youth-academy', DISABLED_RELEASE);
    const board = presetBoard(presetById('youth-academy')!);
    expect(w.build).toEqual(board.build);
    expect(w.ticket).toBe(board.ticket);
    expect(w.events.map((e) => e.kind)).toEqual(['takeover', 'build']);
  });

  it('keeps the cash, turns the debt into the loan and pays the price from the fortune', () => {
    const { w, club } = setup();
    const price = clubValue(w, club),
      fortune = fromPounds('ENG', w.year, tierFortune(w, 'industrial'));
    takeOver(
      w,
      club.id,
      choice('industrial', ['businessman', 'fansFriend']),
      undefined,
      DISABLED_RELEASE,
    );
    expect(w.cash).toBe('480000');
    expect(w.operatingExpenses).toBe(takeoverExpenses(w, club, '2600000'));
    expect(w.loan).toEqual(takeoverLoan('1200000'));
    expect(w.loan).toMatchObject({ balance: '1200000', seasonsLeft: TAKEOVER_DEBT.seasons });
    // Equal installments repay the debt with its interest: their value today is the debt.
    const present = Array.from(
      { length: TAKEOVER_DEBT.seasons },
      (_, k) => Number(w.loan!.installment) / (1 + TAKEOVER_DEBT.rate) ** (k + 1),
    ).reduce((a, b) => a + b, 0);
    expect(Math.abs(present - 1200000)).toBeLessThan(5);
    expect(w.owner).toEqual({
      tier: 'industrial',
      traits: ['businessman', 'fansFriend'],
      fortune: (BigInt(fortune) - BigInt(price)).toString(),
      stake: OWNER_BUSINESS.stake.start,
      dividendShare: OWNER_DIVIDEND.start,
      fanMood: FAN_MOOD.start,
      ffpInjections: [],
      takeover: {
        year: w.year,
        clubId: club.id,
        price,
        debt: '1200000',
        fortune,
        currency: w.currency,
        // Its last income before the takeover, the first season's turnover (→OWNER-12).
        lastIncome: '2600000',
      },
      seasonRecords: [],
    });
    // The takeover is the owner's era's first history entry (→HIST-5).
    expect(w.events[0]).toMatchObject({ kind: 'takeover', year: w.year, round: 0, amount: price });
    expect(() => validateWorld(structuredClone(w))).not.toThrow();
  });

  it('starts a 1930 takeover with the club’s half-season opening cash', () => {
    const w = historyWorld('takeover-opening', DISABLED_RELEASE);
    const club = atPlace(w, 1, 3);
    const cash = club.books!.cash;
    const copy = structuredClone(w);
    const closed = settleNpcBooks(
      copy,
      copy.clubs.find((c) => c.id === club.id)!,
    ).seasons[0]!;
    expect(cash).toBe(scaleBy(closed.income, CLUB_BOOKS.opening, 1000n));
    expect(BigInt(cash)).toBeGreaterThan(0n);
    takeOver(w, club.id, choice('oil'), undefined, DISABLED_RELEASE);
    expect(w.cash).toBe(cash);
    expect(w.loan).toBeUndefined();
  });

  it('takes no loan over a club without debt, and no cash over one without books', () => {
    const w = ownerlessWorld('takeover-clean');
    const club = atPlace(w, 2, 1);
    takeOver(w, club.id, choice('midsize'), undefined, DISABLED_RELEASE);
    expect(w.cash).toBe('0');
    expect(w.loan).toBeUndefined();
    expect(w.owner?.takeover.debt).toBe('0');
  });

  it('lets 석유 재벌 buy the dearest club, the match model recording from the takeover', () => {
    const w = ownerlessWorld('takeover-oil');
    const giant = atPlace(w, 0, 1);
    takeOver(w, giant.id, choice('oil'), 'commercial');
    expect(BigInt(w.owner!.fortune)).toBeGreaterThan(0n);
    expect(w.matchModel?.coverage).toBe('founding');
    expect(w.managerHistory?.coverage).toBe('founding');
    expect(() => validateWorld(structuredClone(w))).not.toThrow();
  });

  it('dates the career from the takeover, a model the world ran before it included (→OWNER-4, SAVE-23)', () => {
    const w = ownerlessWorld('takeover-dated');
    const club = atPlace(w, 1, 4);
    // The world before kept the model since 1930 and archived its seasons (→WORLD-13).
    w.matchModel = {
      ...w.matchModel!,
      activated: { year: 1930, day: 0, revision: 0 },
      trackedFrom: { year: 1930, day: 1, round: 1 },
      coverage: 'founding',
    };
    w.history = [1948, 1949].map((year) => worldArchive(w, year, (c) => c.tier, club.id));
    takeOver(w, club.id, choice('oil'));
    expect(w.matchModel).toMatchObject({
      activated: { year: w.year, day: 0, revision: w.revision },
      trackedFrom: { year: w.year, day: 1, round: 1 },
      coverage: 'founding',
    });
    // The manager taken over is tracked from the takeover as at a founding, archives or not.
    expect(w.managerHistory).toMatchObject({ club: club.id, coverage: 'founding' });
    expect(w.managerHistory!.trackedFrom).toMatchObject({ year: w.year, day: 0 });
    expect(() => validateWorld(structuredClone(w))).not.toThrow();
  });

  it('prices other clubs’ managers in the owner’s money once he owns a club, read before or not', () => {
    const w = ownerlessWorld('takeover-wages');
    const foreign = w.clubs.find((c) => c.country === 'ESP' && c.tier === 0 && !c.representative)!;
    // Read while nobody owns a club: his wage is in his club's money (→WORLD-13).
    const before = clubManager(w, foreign);
    expect(before.wage).toBe(staffQuote(w, 120 + before.ability, 'ESP'));
    takeOver(w, atPlace(w, 1, 2).id, choice('oil'), undefined, DISABLED_RELEASE);
    const after = clubManager(w, foreign);
    expect(after.id).toBe(before.id);
    expect(after.wage).toBe(staffQuote(w, 120 + after.ability));
    expect(after.wage).not.toBe(before.wage);
  });

  it('names the career by its season, club and start, so slots tell games of one seed apart', () => {
    const ids = (['industrial', 'oil'] as const).flatMap((tier) =>
      [atPlace, atPlace].map((_, place) => {
        const w = ownerlessWorld('takeover-ids');
        return takeOver(w, atPlace(w, 1, place + 2).id, choice(tier), undefined, DISABLED_RELEASE)
          .id;
      }),
    );
    expect(new Set(ids).size).toBe(4);
    const again = ownerlessWorld('takeover-ids');
    expect(
      takeOver(again, atPlace(again, 1, 2).id, choice('industrial'), undefined, DISABLED_RELEASE)
        .id,
    ).toBe(ids[0]);
  });

  it('refuses what a takeover cannot be', () => {
    const { w: poor } = setup();
    expect(() => takeOver(poor, atPlace(poor, 0, 1).id, choice('selfmade'))).toThrow(
      '구단주 자금으로는 이 구단을 살 수 없어요.',
    );
    expect(poor.playerClub).toBe('');
    const { w } = setup();
    // A continental representative of another association is no club to buy (→WORLD-1).
    const representative = w.clubs.find((c) => c.representative)!;
    expect(() => takeOver(w, representative.id, choice('oil'))).toThrow(
      '인수할 수 없는 구단입니다.',
    );
    expect(() => takeOver(w, 'ENG:nowhere', choice('oil'))).toThrow('인수할 수 없는 구단입니다.');
    const club = atPlace(w, 1, 3);
    expect(() => takeOver(w, club.id, choice('oil', ['talisman', 'talisman']))).toThrow(
      '구단주 특성을 확인하세요.',
    );
    expect(() =>
      takeOver(w, club.id, {
        tier: 'oil',
        traits: ['businessman', 'talisman', 'negotiator', 'fansFriend', 'networker', 'marketer'],
      }),
    ).toThrow('구단주 특성을 확인하세요.');
    expect(() => takeOver(w, club.id, choice('oil'), 'no-such-direction')).toThrow(
      '구단 방향을 확인하세요.',
    );
    w.calendar = { day: 3 };
    expect(() => takeOver(w, club.id, choice('oil'))).toThrow(
      '구단 인수는 시즌 첫날에만 할 수 있어요.',
    );
    w.calendar = { day: 0 };
    takeOver(w, club.id, choice('oil'), undefined, DISABLED_RELEASE);
    expect(() => takeOver(w, atPlace(w, 1, 4).id, choice('oil'))).toThrow(
      '이미 주인이 있는 세계입니다.',
    );
  });
});

describe('the first season’s operating expenses (→ECON-30)', () => {
  it('runs on last season’s turnover, never below the division, and at it after a relegation', () => {
    const w = ownerlessWorld('takeover-expenses');
    const club = atPlace(w, 1, 2);
    const floor = operatingExpensesAt('ENG', w.year, 1);
    expect(takeoverExpenses(w, club)).toBe(floor);
    expect(takeoverExpenses(w, club, '1')).toBe(floor);
    const turnover = (BigInt(floor) * 10n).toString();
    expect(takeoverExpenses(w, club, turnover)).toBe(
      scaleBy(turnover, EXPENSE_CONFIG.share, 10000n),
    );
    // The world's archive of last season has the club in the top flight: it came down.
    w.history = [
      {
        year: w.year - 1,
        standings: [[w.clubs.indexOf(club), 0, 0, 20, 30, 70]],
      } as unknown as SeasonArchive,
    ];
    expect(takeoverExpenses(w, club, turnover)).toBe(floor);
  });
});

describe('formation cover (→CLUB-1)', () => {
  it('pairs players with slots so a versatile player covers the slot only he can', () => {
    const player = (id: string, positions: Player['positions']) => ({
      ...makePlayer('ENG', 'cover', id, 1950, 60, 'CB'),
      positions,
    });
    const slot = (position: string) =>
      formationOf('possession').find((s) => s.position === position)!;
    const slots = [slot('CB'), slot('LB')];
    const both = player('both', { CB: 3, LB: 2 }),
      centre = player('centre', { CB: 3 }),
      winger = player('winger', { LW: 3, LB: 1 });
    // In slot order the versatile player would take the centre; paired, he takes the flank.
    expect(uncoveredSlots([both, centre], slots)).toEqual([]);
    expect(uncoveredSlots([both, winger], slots)).toEqual([slots[1]]);
  });
});

/**
 * A season the world archived before the takeover (→HIST-2, WORLD-13): every league club's row
 * [club, division, group, points, gf, ga] at `divisionOf`, the champions, and every own-club field
 * empty, as the world's close writes it.
 */
function worldArchive(
  w: World,
  year: number,
  divisionOf: (club: Club) => number,
  cup: string,
): SeasonArchive {
  const league = w.clubs.filter((c) => !c.representative && !c.id.startsWith('euro:'));
  return {
    year,
    tier: 0,
    group: 0,
    rank: 0,
    points: 0,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    cash: '0',
    currency: w.currency,
    income: '0',
    expense: '0',
    fans: 0,
    rating: 0,
    manager: '',
    metrics: zeroMetrics(),
    standings: league.map((c) => [w.clubs.indexOf(c), divisionOf(c), c.group, c.strength, 40, 40]),
    champions: [{ country: 'ENG', club: atPlace(w, 0, 1).id, cup }],
    europe: [],
  };
}

describe('the world’s seasons before the takeover (→HIST-2, WORLD-13)', () => {
  /** An English second-tier club taken over with `seasons` of the world archived before it. */
  function takenOver(seed: string, cameDown: boolean) {
    const w = ownerlessWorld(seed);
    const club = atPlace(w, 1, 5);
    const division = (c: Club) => (c === club && cameDown ? 0 : c.tier);
    w.history = [1947, 1948, 1949].map((year) => worldArchive(w, year, division, club.id));
    takeOver(w, club.id, choice('oil'), undefined, DISABLED_RELEASE);
    return { w, club };
  }

  it('tells the club’s own seasons from the world’s', () => {
    const { w } = takenOver('own-seasons', false);
    expect(w.history.map((season) => isOwnSeason(w, season))).toEqual([false, false, false]);
    expect(ownSeasons(w)).toEqual([]);
    expect(lastOwnSeason(w)).toBeUndefined();
    const own = { ...w.history.at(-1)!, year: w.year };
    w.history.push(own);
    expect(ownSeasons(w)).toEqual([own]);
    expect(lastOwnSeason(w)).toBe(own);
    // A founded career's seasons are all its own; a world nobody owns has none.
    const founded = { ...w, owner: undefined };
    expect(ownSeasons(founded)).toBe(founded.history);
    expect(ownSeasons({ ...founded, playerClub: '' })).toEqual([]);
  });

  it('pays a parachute only for a relegation the world’s standings show (→ECON-28)', () => {
    const { w, club } = takenOver('own-parachute', false);
    // The archive's own-club division is empty (0): read as the club's, it would pay one.
    expect(lastSeasonTier(w)).toBe(club.tier);
    expect(parachutePayment(w)).toBe('0');
    expect(BigInt(parachutePayment({ ...w, owner: undefined }))).toBeGreaterThan(0n);
    const relegated = takenOver('own-parachute', true).w;
    expect(lastSeasonTier(relegated)).toBe(0);
    expect(parachutePayment(relegated)).toBe(
      scaleBy(
        (BigInt(leagueShare(relegated, 0)) - BigInt(leagueShare(relegated))).toString(),
        DISTRIBUTION_CONFIG.parachute,
        1000n,
      ),
    );
  });

  it('keeps no turnover, finish, honours or milestones of the world’s season (→ECON-30, ECON-8)', () => {
    const { w, club } = takenOver('own-reads', false);
    expect(lastSeasonTurnover(w)).toBeUndefined();
    expect(recentRevenue(w)).toBe('0');
    expect(assessOperatingExpenses(w)).toBe(operatingExpensesAt('ENG', w.year, club.tier));
    // The finish factor stays neutral: the value is the one without any archive.
    const value = commercialValue(w);
    expect(commercialValue({ ...w, history: [] })).toBe(value);
    // The world's archive names the club as last season's cup winner: no honour of the owner's.
    expect(w.history.at(-1)!.champions[0]!.cup).toBe(club.id);
    expect(clubNews(w).filter((item) => item.id.includes(':honour:'))).toEqual([]);
    expect(
      clubNews({ ...w, owner: undefined }).filter((item) => item.id.includes(':honour:')).length,
    ).toBeGreaterThan(0);
    const season = clubMilestones(w).goals.find((goal) => goal.id === 'season')!;
    expect(season.current).toBe(0);
  });
});
