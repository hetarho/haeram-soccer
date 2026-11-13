import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event, SeasonArchive, World } from '../../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../../packages/engine/src/career.testkit';
import { SEASON_END_DAY, seasonDayOf } from '../../../../../packages/engine/src/calendar';
import {
  FAN_MOOD,
  FFP,
  OWNER_BUSINESS,
  OWNER_LIVING,
  OWNER_SETTLEMENTS,
  OWNER_TRAITS,
} from '../../../../../packages/engine/src/owner-config';
import { fanMoodInjection, fanMoodDividend } from '../../../../../packages/engine/src/fan-mood';
import { scaleBy } from '../../../../../packages/engine/src/primitives';
import { withOwner } from '../../../../../packages/engine/src/testing';
import type { ClientState } from '../../runtime/client';
import type { View } from '../../runtime/protocol';
import { officeRead } from '../../runtime/officeRead';
import { gameStore, initialClientState } from '../../runtime/store';
import korean from '../../../public/presentation/locales/ko-KR.json';
import { CashAlarm } from '../../widgets/cash-alarm';
import { ClubOverview } from '../../widgets/club-overview';
import { GameOver } from '../../pages/game-over';
import { HudCash } from './HudCash';
import { ClubBudget, OwnerSheetBody } from '../../entities/office';
import { seasonBooks } from '../../entities/player';
import {
  businessChance,
  careerOver,
  dividendOutlook,
  endCause,
  fanMovers,
  ffpRoom,
  gameOverFacts,
  injectionLimit,
  injectionMood,
  moodChange,
  injectionSteps,
  livingCost,
  nextSettlement,
  ownerLock,
  ownerStatuses,
  stakeAmount,
  stakeOutlook,
} from '../../entities/office';

const { injectionOutlook } = await import('../../entities/office/lib/ownerFigures');

vi.mock('../../presentation/react', async (original) => ({
  ...(await original<typeof import('../../presentation/react')>()),
  useLocale: () => ({
    t: (id: string, values: Record<string, string> = {}) =>
      String(korean.messages[id as keyof typeof korean.messages] ?? id).replace(
        /\{(\w+)\}/g,
        (_, key: string) => values[key] ?? '',
      ),
  }),
}));
vi.mock('../../runtime/store', async (original) => ({
  ...(await original<typeof import('../../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('../../shared/ui/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));

/** A career without owner state, as a hand-built world holds it (T670's no-owner cases). */
function founded(country: 'ENG' | 'ESP' = 'ENG') {
  const w = careerWorld({ country, seed: `owner-ui-${country}` });
  delete w.owner;
  return w;
}
/** A career with a taken-over club's owner, the shape a takeover leaves (T653 `withOwner`). */
function owned(country: 'ENG' | 'ESP' = 'ENG') {
  const w = founded(country);
  withOwner(w);
  return w;
}
const own = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;
/** A closed last season in today's money, enough for the turnover and game-over reads. */
function closed(w: World, archive: Partial<SeasonArchive>) {
  w.history.push({
    year: w.year - 1,
    tier: own(w).tier,
    group: 0,
    rank: 5,
    points: 50,
    played: 38,
    won: 14,
    drawn: 8,
    lost: 16,
    gf: 50,
    ga: 50,
    cash: w.cash,
    currency: w.currency,
    income: '1000000',
    expense: '900000',
    fans: 1000,
    rating: 50,
    manager: 'm',
    metrics: {} as SeasonArchive['metrics'],
    standings: [],
    champions: [],
    europe: [],
    ...archive,
  });
}
function show(w: World, state: Partial<ClientState> = {}) {
  gameStore.setState({
    ...initialClientState,
    busy: false,
    processing: false,
    readonly: false,
    clockRunning: false,
    view: { world: w } as View,
    ...state,
  });
}
afterEach(() => gameStore.setState({ ...initialClientState }));

/** Minimal synthetic money state for previews, without constructing or progressing a world. */
function financialWorld() {
  return {
    year: 1970,
    round: 0,
    playerClub: 'synthetic',
    clubs: [{ id: 'synthetic', country: 'ENG', tier: 0 }],
    currency: 'GBP-LSD',
    income: '1000',
    expense: '600',
    cash: '5000',
    events: [],
    history: [],
    owner: { traits: [], takeover: { year: 1970 }, fortune: '10000', fanMood: FAN_MOOD.start },
  } as unknown as World;
}
function financialEntry(w: World, kind: string, amount: string, year = w.year): Event {
  return {
    year,
    round: 0,
    kind,
    title: 'Synthetic entry',
    detail: '',
    amount,
    currency: w.currency,
  };
}

describe('the business stake (→OWNER-7/8)', () => {
  it('states the chance, the amount at stake and the next settlement', () => {
    const w = owned();
    const owner = w.owner!;
    expect(businessChance(owner)).toBe(OWNER_BUSINESS.chance);
    owner.traits = ['businessman'];
    expect(businessChance(owner)).toBe(OWNER_TRAITS.businessman.success);
    // 5% of the quarter staked.
    expect(stakeAmount('100000', 25)).toBe('1250');
    // A fortune at zero or below is never staked.
    expect(stakeAmount('0', 50)).toBe('0');
    expect(stakeAmount('-500', 50)).toBe('0');
    // Living costs in the takeover season are an eleventh of the season's rate of the starting
    // fortune, give or take the minor unit carried between settlements.
    const living = livingCost(w),
      season = BigInt(scaleBy(owner.takeover.fortune, OWNER_LIVING.season, 10000n)),
      share = season / BigInt(OWNER_SETTLEMENTS);
    expect([share, share + 1n]).toContain(BigInt(living));
    const outlook = stakeOutlook(w, 40);
    expect(outlook.amount).toBe(stakeAmount(owner.fortune, 40));
    expect(BigInt(outlook.win)).toBe(
      BigInt(owner.fortune) + BigInt(outlook.amount) - BigInt(living),
    );
    expect(BigInt(outlook.lose)).toBe(
      BigInt(owner.fortune) - BigInt(outlook.amount) - BigInt(living),
    );
    expect(outlook.staked).toBe(true);
  });
  it('dates the next settlement: the next month’s 1st from September to June, then the close', () => {
    const w = owned();
    w.calendar = { day: 0 };
    expect(nextSettlement(w)).toMatchObject({
      day: seasonDayOf(w.year, 9, 1),
      date: `${w.year}년 9월 1일`,
      close: false,
    });
    // A settlement day the clock already reads has settled.
    w.calendar = { day: seasonDayOf(w.year, 12, 1) };
    expect(nextSettlement(w).date).toBe(`${w.year + 1}년 1월 1일`);
    w.calendar = { day: seasonDayOf(w.year, 6, 1) };
    expect(nextSettlement(w)).toMatchObject({ day: SEASON_END_DAY + 1, close: true });
  });
  it('grows living costs with prices after the takeover season', () => {
    const w = owned();
    const first = livingCost(w);
    w.year += 10;
    expect(BigInt(livingCost(w))).toBeGreaterThan(BigInt(first));
  });
});

describe('자금 투입 within FFP (→OWNER-9/10)', () => {
  it('applies FFP only from 2011/12 in the top flight', () => {
    const w = owned('ESP');
    w.year = 2010;
    own(w).tier = 0;
    expect(ffpRoom(w)).toBeUndefined();
    w.year = 2015;
    own(w).tier = 1;
    expect(ffpRoom(w)).toBeUndefined();
    own(w).tier = 0;
    w.owner!.ffpInjections = [
      { season: 2012, amount: '500000000' },
      { season: 2013, amount: '400000000' },
      { season: 2015, amount: '600000000' },
    ];
    // €30m from 2015/16 in a euro club's cents, less the window 2013/14–2015/16.
    expect(ffpRoom(w)).toEqual({
      euros: FFP.caps.at(-1)!.euros,
      cap: '3000000000',
      used: '1000000000',
      left: '2000000000',
      from: 2013,
    });
    w.year = 2012;
    expect(ffpRoom(w)!.cap).toBe('4500000000');
  });
  it('converts the cap into pounds at the game rate', () => {
    const w = owned('ENG');
    w.year = 2015;
    own(w).tier = 0;
    const cap = BigInt(ffpRoom(w)!.cap);
    // €30m at the game's own euro rate for 2015/16 (about €1.5 per £, ECON-35's levels carried
    // by each country's prices): about £20m, in pence.
    expect(cap).toBeGreaterThan(1_700_000_000n);
    expect(cap).toBeLessThan(2_600_000_000n);
  });
  it('limits an injection to the fortune above zero and the FFP room, in four steps', () => {
    const w = owned('ESP');
    w.owner!.fortune = '1000';
    expect(injectionLimit(w).max).toBe('1000');
    expect(injectionSteps(w)).toEqual(['250', '500', '750', '1000']);
    w.year = 2015;
    own(w).tier = 0;
    w.owner!.fortune = '9000000000';
    w.owner!.ffpInjections = [{ season: 2014, amount: '2800000000' }];
    expect(injectionLimit(w).max).toBe('200000000');
    w.owner!.ffpInjections = [{ season: 2014, amount: '3000000000' }];
    expect(injectionSteps(w)).toEqual([]);
    w.owner!.ffpInjections = [];
    w.owner!.fortune = '-10';
    expect(injectionSteps(w)).toEqual([]);
  });
  it('raises 팬 민심 by 1 per 1% of last season’s turnover, at most 10', () => {
    const w = owned();
    expect(injectionMood(w, '1000')).toBeUndefined();
    w.year += 1;
    closed(w, { income: '1000000' });
    expect(injectionMood(w, '50000')).toBeCloseTo(5);
    expect(injectionMood(w, '500000')).toBe(FAN_MOOD.injection.max);
  });
});

describe('owner previews on canonical turnover', () => {
  it('excludes prior owner capital, sales and compensation from the injection base', () => {
    const w = financialWorld();
    w.year++;
    closed(w, { income: '1000000' });
    w.events = [
      financialEntry(w, 'owner-injection', '300000', 1970),
      financialEntry(w, 'transfer-out', '150000', 1970),
      financialEntry(w, 'free-transfer-compensation', '50000', 1970),
    ];
    expect(injectionMood(w, '25000')).toBe(5);
    w.owner!.traits = ['fansFriend'];
    expect(injectionMood(w, '25000')).toBe(5);
  });

  it('converts the prior injection base and retains takeover and unavailable fallbacks', () => {
    const w = financialWorld();
    expect(injectionMood(w, '100')).toBeUndefined();
    w.owner!.takeover.lastIncome = '10000';
    expect(injectionMood(w, '100')).toBe(1);
    w.owner!.takeover.lastIncome = '0';
    expect(injectionMood(w, '100')).toBeUndefined();
    w.year = 1971;
    closed(w, { income: '24000' });
    w.currency = 'GBP';
    expect(injectionMood(w, '100')).toBe(1);
    w.history[0].income = '0';
    expect(injectionMood(w, '100')).toBeUndefined();
    w.history = [];
    expect(injectionMood(w, '100')).toBeUndefined();
  });

  it('bases dividend mood on turnover without changing profit, cash cap or friendly drops', () => {
    const w = financialWorld();
    w.income = '2500';
    w.events = [
      financialEntry(w, 'owner-injection', '500'),
      financialEntry(w, 'transfer-out', '600'),
      financialEntry(w, 'free-transfer-compensation', '400'),
    ];
    expect(dividendOutlook(w, 50)).toEqual({ result: '1400', amount: '700', mood: -35 });
    w.cash = '200';
    expect(dividendOutlook(w, 50)).toEqual({ result: '1400', amount: '200', mood: -10 });
    w.owner!.traits = ['fansFriend'];
    expect(dividendOutlook(w, 50)).toEqual({ result: '1400', amount: '200', mood: -7 });
  });

  it('uses the settlement fallback of 100 percent for a dividend without positive turnover', () => {
    const w = financialWorld();
    w.income = '1000';
    w.events = [financialEntry(w, 'transfer-out', '1000')];
    expect(dividendOutlook(w, 50)).toEqual({ result: '400', amount: '200', mood: -50 });
    w.owner!.traits = ['fansFriend'];
    expect(dividendOutlook(w, 50).mood).toBe(-35);
    expect(dividendOutlook(w, 0).mood).toBe(0);
    w.cash = '0';
    expect(dividendOutlook(w, 50)).toMatchObject({ amount: '0', mood: 0 });
  });
});

describe('the season books the money sheet leads with', () => {
  it('counts an injection as the owner’s money, not the club’s income or profit', () => {
    const w = owned();
    w.income = '1500';
    w.expense = '600';
    w.cash = '5000';
    w.events.push({
      year: w.year,
      round: w.round,
      kind: 'owner-injection',
      title: '구단주 자금 투입',
      detail: '',
      amount: '500',
      currency: w.currency,
    });
    expect(seasonBooks(w)).toEqual({ income: '1000', expense: '600', result: '400' });
    expect(dividendOutlook(w, 50)).toMatchObject({ result: '400', amount: '200' });
  });
  it("shows the club's result and runway in 구단 예산, and 팬 민심 only in the team overview", () => {
    const w = owned();
    w.income = '1000';
    w.expense = '1600';
    gameStore.setState({ view: { world: w, office: officeRead(w) } as View });
    const budget = renderToStaticMarkup(createElement(ClubBudget, { w }));
    expect(budget).not.toContain('<details');
    expect(budget).toContain('data-testid="season-result"');
    expect(budget).toContain('적자');
    expect(budget.indexOf('season-result')).toBeLessThan(budget.indexOf('지금 현금'));
    // The owner's sheet is his own money; the club's books live in 구단 예산.
    const sheet = renderToStaticMarkup(
      createElement(OwnerSheetBody, {
        w,
        sending: false,
        message: '',
        onCommand: async () => true,
      }),
    );
    expect(sheet).not.toContain('season-result');
    expect(sheet).toContain('내 돈이 오가는 곳');
    expect(sheet).not.toContain('owner-fan-mood');
    gameStore.setState({ view: { world: w, office: officeRead(w) } as View });
    const overview = renderToStaticMarkup(createElement(ClubOverview, { w }));
    expect(overview).toContain('data-testid="owner-fan-mood"');
    expect(overview.indexOf('owner-fan-mood')).toBeLessThan(overview.indexOf('선수단 구성'));
    const fresh = founded();
    gameStore.setState({ view: { world: fresh, office: officeRead(fresh) } as View });
    expect(renderToStaticMarkup(createElement(ClubOverview, { w: fresh }))).not.toContain(
      'owner-fan-mood',
    );
  });
});

describe('the 배당 dial (→OWNER-11)', () => {
  it('takes its share of a positive result, never more than the cash above zero', () => {
    const w = owned();
    w.income = '1000';
    w.expense = '600';
    w.cash = '5000';
    expect(dividendOutlook(w, 50)).toMatchObject({ result: '400', amount: '200' });
    expect(dividendOutlook(w, 50).mood).toBeCloseTo(20 * FAN_MOOD.dividend.perPercent);
    w.cash = '100';
    expect(dividendOutlook(w, 100).amount).toBe('100');
    w.owner!.traits = ['fansFriend'];
    expect(dividendOutlook(w, 100).mood).toBeCloseTo(
      10 * FAN_MOOD.dividend.perPercent * FAN_MOOD.friendly,
    );
    w.expense = '2000';
    expect(dividendOutlook(w, 100)).toMatchObject({ amount: '0', mood: 0 });
  });
});

describe('팬 민심 and the crises (→OWNER-12–15, WEB-56)', () => {
  it('names what moved it: the latest league result, the drift and the last close', () => {
    const w = owned();
    w.owner!.fanMood = 40;
    w.owner!.seasonRecords = [
      {
        year: w.year - 1,
        currency: w.currency,
        fortune: '0',
        business: '0',
        living: '0',
        injected: '0',
        dividend: '300',
        fanMood: 45,
      },
    ];
    const movers = fanMovers(w);
    expect(movers[0]).toMatchObject({ change: (60 - 40) * FAN_MOOD.drift, direction: 'up' });
    expect(movers.map((mover) => mover.label).join(' / ')).toContain('배당');
    expect(movers.at(-1)).toMatchObject({ change: -5, direction: 'down' });
  });
  it('shows 구단주 파산 위기 and 퇴진 압박 as statuses with what remains', () => {
    const w = owned();
    expect(ownerStatuses(w)).toEqual([]);
    expect(ownerStatuses(founded())).toEqual([]);
    w.owner!.ownerCrisis = { since: { year: w.year, day: 92 } };
    w.owner!.fortune = '-100000';
    w.owner!.fanCrisis = { rounds: 3 };
    w.owner!.fanMood = 12;
    const [owner, fans] = ownerStatuses(w);
    expect(owner.title).toBe('구단주 파산 위기');
    expect(owner.detail).toContain('시즌 마감');
    expect(fans.title).toBe('퇴진 압박');
    expect(fans.detail).toContain(`${FAN_MOOD.rounds - 3}라운드 더`);
    w.ended = 'fans';
    expect(ownerStatuses(w)).toEqual([]);
  });
  it('renders the statuses beside the cash band, never as a dialog', () => {
    const w = owned();
    w.owner!.fanCrisis = { rounds: 2 };
    show(w);
    const markup = renderToStaticMarkup(createElement(CashAlarm));
    expect(markup).toContain('data-testid="fans-crisis"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('role="dialog"');
    // A founded career's cash band stays exactly as it was.
    const plain = founded();
    plain.cash = '-1';
    show(plain);
    const band = renderToStaticMarkup(createElement(CashAlarm));
    expect(band).toContain('<b>파산 위기</b>');
    expect(band).not.toContain('crisis');
  });
});

describe('the HUD and the 구단주 sheet (→WEB-114, WEB-97)', () => {
  it('shows the fortune beside the cash only when the career has an owner', () => {
    show(founded());
    const plain = renderToStaticMarkup(createElement(HudCash));
    expect(plain).toContain('data-testid="hud-cash"');
    expect(plain).not.toContain('사업자금');
    show(owned());
    const markup = renderToStaticMarkup(createElement(HudCash));
    expect(markup).toContain('data-testid="hud-cash"');
    expect(markup).toContain('사업자금');
  });
  it('locks the controls while the clock runs and keeps the drafts open', () => {
    const w = owned();
    show(w, { clockRunning: true });
    const lock = ownerLock(gameStore.getState(), true);
    expect(lock).toBe('달력 진행과 처리가 모두 멈춘 뒤 정할 수 있어요.');
    const markup = renderToStaticMarkup(
      createElement(OwnerSheetBody, {
        w,
        lock,
        sending: false,
        message: '',
        onCommand: async () => true,
      }),
    );
    for (const heading of ['내 돈이 오가는 곳', '시즌별 내 자산', '사업 투자', '자금 투입', '배당'])
      expect(markup).toContain(heading);
    expect(markup).toContain('data-testid="owner-lock"');
    const primaries = [...markup.matchAll(/<button([^>]*data-ui="primary"[^>]*)>/g)];
    expect(primaries.length).toBe(3);
    expect(primaries.every(([, attributes]) => attributes.includes('disabled=""'))).toBe(true);
    // The slider is a draft: it previews while the clock runs.
    expect(/<input[^>]*type="range"[^>]*>/.exec(markup)![0]).not.toContain('disabled');
    show(w);
    expect(ownerLock(gameStore.getState(), true)).toBeUndefined();
    expect(ownerLock(gameStore.getState(), false)).toBe('이 화면에서는 볼 수만 있어요.');
    show(w, { readonly: true });
    expect(ownerLock(gameStore.getState(), true)).toBe('읽기 전용 탭에서는 정할 수 없어요.');
  });
});

describe('the game-over page (→WEB-56, OWNER-16)', () => {
  it('names its cause from `ended`, or the club’s bankruptcy in an older career', () => {
    const w = founded();
    expect(careerOver(w)).toBe(false);
    expect(endCause(w)).toBeUndefined();
    w.bankrupt = { year: w.year, round: 10, day: 70 };
    w.insolvent = 8;
    expect(endCause(w)).toBe('club');
    const club = gameOverFacts(w);
    expect(club.title).toBe(`${own(w).name} 파산`);
    expect(club.line).toContain('부채가 연간 고정지출 1년분을 넘어');
    expect(club.club).toBeUndefined();
    w.ended = 'club';
    expect(endCause(w)).toBe('club');
  });
  it('counts the career from the takeover and names the owner’s end', () => {
    const w = owned();
    w.year += 2;
    closed(w, { year: w.year - 2, tier: 0, rank: 3, fans: 900 });
    closed(w, { year: w.year - 1, tier: 0, rank: 1, fans: 2500 });
    w.owner!.takeover.year = w.year - 1;
    w.owner!.fortune = '-5000';
    w.ended = 'owner';
    expect(careerOver(w)).toBe(true);
    const facts = gameOverFacts(w);
    expect(facts).toMatchObject({
      cause: 'owner',
      title: '구단주 파산',
      club: own(w).name,
      season: w.year - 1,
      seasons: 1,
      best: '1부 1위',
    });
    w.ended = 'fans';
    const fans = gameOverFacts(w);
    expect(fans.title).toBe('구단주 퇴진');
    expect(fans.season).toBe(w.year);
    expect(fans.line).toContain(`${FAN_MOOD.rounds}라운드`);
    const markup = renderToStaticMarkup(
      createElement(GameOver, { w, onExport() {}, onNew() {}, onSlots() {} }),
    );
    expect(markup).toContain('data-cause="fans"');
    expect(markup).toContain('구단주 퇴진');
    for (const action of ['기록 내보내기', '이 슬롯에서 새 게임']) expect(markup).toContain(action);
  });
});

describe('capital mood previews versus actual existing hooks', () => {
  it.each([60, 99, 100])(
    'shows the bounded injection delta at mood %s without touching money',
    (before) => {
      const w = financialWorld();
      w.owner!.fanMood = before;
      w.owner!.takeover.lastIncome = '100000';
      const snapshot = structuredClone(w),
        preview = injectionOutlook(w, '10000');
      expect(w).toEqual(snapshot);
      expect(preview).toMatchObject({ cash: '15000', fortune: '0' });
      fanMoodInjection(w, 10000n);
      expect(preview.mood).toBe(w.owner!.fanMood - before);
      expect(preview.mood).toBe(before === 60 ? 10 : before === 99 ? 1 : 0);
      expect(w.cash).toBe(snapshot.cash);
      expect(w.owner!.fortune).toBe(snapshot.owner!.fortune);
      expect(w.events).toHaveLength(1);
    },
  );
  it.each([false, true])(
    'matches truncated percentages, stored hundredths and the existing display with friendly=%s',
    (friendly) => {
      const w = financialWorld();
      w.owner!.traits = friendly ? ['fansFriend'] : [];
      w.income = '3330000';
      w.expense = '3320000';
      w.cash = '10000';
      const before = w.owner!.fanMood,
        snapshot = structuredClone(w),
        preview = dividendOutlook(w, 100);
      expect(preview.amount).toBe('10000');
      expect(w).toEqual(snapshot);
      fanMoodDividend(w, BigInt(preview.amount));
      expect(preview.mood).toBe(w.owner!.fanMood - before);
      expect(w.owner!.fanMood).toBe(friendly ? 59.9 : 59.85);
      expect(moodChange(preview.mood)).toBe('−0.1');
      expect(w.events[0]!.detail).toContain('−0.1');
      expect(w.cash).toBe(snapshot.cash);
      expect(w.owner!.fortune).toBe(snapshot.owner!.fortune);
    },
  );
  it('matches the lower bound, capped cash and zero dividend without creating a zero hook event', () => {
    const w = financialWorld();
    w.owner!.fanMood = 1;
    w.income = '1000';
    w.expense = '0';
    w.cash = '200';
    const preview = dividendOutlook(w, 100);
    expect(preview.amount).toBe('200');
    fanMoodDividend(w, BigInt(preview.amount));
    expect(preview.mood).toBe(-1);
    expect(w.owner!.fanMood).toBe(0);
    w.cash = '0';
    const snapshot = structuredClone(w),
      zero = dividendOutlook(w, 100);
    fanMoodDividend(w, BigInt(zero.amount));
    expect(zero).toMatchObject({ amount: '0', mood: 0 });
    expect(w).toEqual(snapshot);
  });
  it('keeps unknown injection disclosure and the zero-turnover dividend fallback', () => {
    const w = financialWorld();
    expect(injectionMood(w, '10')).toBeUndefined();
    fanMoodInjection(w, 10n);
    expect(w.owner!.fanMood).toBe(70);
    w.owner!.fanMood = 60;
    w.income = '1000';
    w.events = [financialEntry(w, 'transfer-out', '1000')];
    const preview = dividendOutlook(w, 100);
    fanMoodDividend(w, BigInt(preview.amount));
    expect(preview.mood).toBe(-50);
    expect(w.owner!.fanMood).toBe(10);
  });
});

it('retains the existing IEEE display difference at the same dividend ratio and a different starting mood', () => {
  const w = financialWorld();
  w.owner!.fanMood = 1;
  w.income = '3330000';
  w.expense = '3320000';
  w.cash = '10000';
  const preview = dividendOutlook(w, 100);
  fanMoodDividend(w, BigInt(preview.amount));
  expect(w.owner!.fanMood).toBe(0.85);
  expect(preview.mood).toBe(w.owner!.fanMood - 1);
  expect(preview.mood).toBe(-0.15000000000000002);
  expect(moodChange(preview.mood)).toBe('−0.2');
  expect(moodChange(-0.15)).toBe('−0.1'); // preserve the display formatter's existing pre-rounding
  expect(w.events[0]!.detail).toContain('−0.2');
});
