import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { SEASON_END_DAY, seasonDayOf } from '../../../../packages/engine/src/calendar';
import {
  FAN_MOOD,
  FFP,
  OWNER_BUSINESS,
  OWNER_TRAITS,
} from '../../../../packages/engine/src/owner-config';
import { ratio } from '../../../../packages/engine/src/primitives';
import { withOwner } from '../../../../packages/engine/src/testing';
import type { ClientState } from '../runtime/client';
import type { View } from '../runtime/protocol';
import { gameStore, initialClientState } from '../runtime/store';
import korean from '../../public/presentation/locales/ko-KR.json';
import { CashAlarm } from './CashAlarm';
import { GameOver } from './GameOver';
import { HudCash } from './HudCash';
import { OwnerSheetBody } from './OwnerSheet.tsx';
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
  injectionSteps,
  livingCost,
  nextSettlement,
  ownerLock,
  ownerStatuses,
  stakeAmount,
  stakeOutlook,
} from './ownerSheet';

vi.mock('../presentation/react', async (original) => ({
  ...(await original<typeof import('../presentation/react')>()),
  useLocale: () => ({
    t: (id: string, values: Record<string, string> = {}) =>
      String(korean.messages[id as keyof typeof korean.messages] ?? id).replace(
        /\{(\w+)\}/g,
        (_, key: string) => values[key] ?? '',
      ),
  }),
}));
vi.mock('../runtime/store', async (original) => ({
  ...(await original<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(gameStore.getState()),
}));
vi.mock('./Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement('section', null, children),
}));

/** A founded career (no owner), as every career before the takeover switch. */
function founded(country: 'ENG' | 'ESP' = 'ENG') {
  return createWorld({
    country,
    name: 'Owner Town',
    color: '#224466',
    seed: `owner-ui-${country}`,
    level: 'normal',
  });
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

describe('the business stake (→OWNER-7/8)', () => {
  it('states the chance, the amount at stake and the next settlement', () => {
    const w = owned();
    const owner = w.owner!;
    expect(businessChance(owner)).toBe(OWNER_BUSINESS.chance);
    owner.traits = ['businessman'];
    expect(businessChance(owner)).toBe(OWNER_TRAITS.businessman.success);
    expect(stakeAmount('1000', 25)).toBe('250');
    // A fortune at zero or below is never staked.
    expect(stakeAmount('0', 50)).toBe('0');
    expect(stakeAmount('-500', 50)).toBe('0');
    // Living costs in the takeover season are the rate of the starting fortune exactly.
    const living = livingCost(w);
    expect(living).toBe(ratio(owner.takeover.fortune, 1n, 100n));
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
  it('dates the next settlement: 1 November, 1 February, 1 May, then the close', () => {
    const w = owned();
    w.calendar = { day: 0 };
    expect(nextSettlement(w)).toMatchObject({
      day: seasonDayOf(w.year, 11, 1),
      date: `${w.year}년 11월 1일`,
      close: false,
    });
    // A settlement day the clock already reads has settled.
    w.calendar = { day: seasonDayOf(w.year, 11, 1) };
    expect(nextSettlement(w).date).toBe(`${w.year + 1}년 2월 1일`);
    w.calendar = { day: seasonDayOf(w.year, 5, 1) };
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

describe('the 배당 dial (→OWNER-11)', () => {
  it('takes its share of a positive result, never more than the cash above zero', () => {
    const w = owned();
    w.income = '1000';
    w.expense = '600';
    w.cash = '5000';
    expect(dividendOutlook(w, 50)).toMatchObject({ result: '400', amount: '200' });
    expect(dividendOutlook(w, 50).mood).toBeCloseTo(-20);
    w.cash = '100';
    expect(dividendOutlook(w, 100).amount).toBe('100');
    w.owner!.traits = ['fansFriend'];
    expect(dividendOutlook(w, 100).mood).toBeCloseTo(-10 * FAN_MOOD.friendly);
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
    expect(plain).not.toContain('hud-fortune');
    show(owned());
    const markup = renderToStaticMarkup(createElement(HudCash));
    expect(markup).toContain('data-testid="hud-cash"');
    expect(markup).toContain('data-testid="hud-fortune"');
    expect(markup).toContain('구단주 자금');
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
    for (const heading of ['사업 투자', '자금 투입', '배당', '팬 민심'])
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
    expect(club.line).toContain('적자를 8라운드 동안');
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
