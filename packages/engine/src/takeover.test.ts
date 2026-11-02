import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import type { OwnerTrait, WealthTier } from '../../contracts/src/owner';
import type { Club, Player, SeasonArchive, World } from '../../contracts/src/types';
import { takeOver, takeoverExpenses, takeoverLoan, uncoveredSlots } from './takeover';
import { clubValue, divisionPlaces, facilityStage, fromPounds, tierFortune } from './club-value';
import {
  CLUB_TAKEOVER,
  FAN_MOOD,
  OWNER_BUSINESS,
  OWNER_DIVIDEND,
  TAKEOVER_DEBT,
} from './owner-config';
import { clubManager } from './managerMarket';
import { makePlayer, squad } from './world';
import { formationOf } from './player-state';
import { lineOf } from './player';
import { fanFollowing } from './fans';
import { basicStaff } from './staff';
import { defaultSettings } from './responsibilities';
import { presetBoard, presetById } from './presets';
import { EXPENSE_CONFIG, operatingExpensesAt } from './finance';
import { scaleBy } from './primitives';
import { ownerlessWorld, withBooks } from './ownerless.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

const choice = (tier: WealthTier, traits: OwnerTrait[] = []) => ({ tier, traits });
/** The club at `place` of a division of England. */
const atPlace = (w: World, tier: number, place: number): Club => {
  const places = divisionPlaces(w);
  return w.clubs.find(
    (c) =>
      c.country === 'ENG' && c.tier === tier && !c.representative && places.get(c.id) === place,
  )!;
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
    expect(w.lower).toBe(false);
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
      },
      seasonRecords: [],
    });
    // The takeover is the owner's era's first history entry (→HIST-5).
    expect(w.events[0]).toMatchObject({ kind: 'takeover', year: w.year, round: 0, amount: price });
    expect(() => validateWorld(structuredClone(w))).not.toThrow();
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

  it('refuses what a takeover cannot be', () => {
    const { w: poor } = setup();
    expect(() => takeOver(poor, atPlace(poor, 0, 1).id, choice('selfmade'))).toThrow(
      '구단주 자금으로는 이 구단을 살 수 없어요.',
    );
    expect(poor.playerClub).toBe('');
    const { w } = setup();
    const amateur = w.clubs.find((c) => c.representative)!;
    expect(() => takeOver(w, amateur.id, choice('oil'))).toThrow('인수할 수 없는 구단입니다.');
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
