import { createElement, type ReactElement, type ReactNode } from 'react';
import { TakeoverConfirm } from './ClubListing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../public/presentation/locales/index.json';
import localeData from '../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../public/presentation/themes/index.json';
import standardData from '../../public/presentation/themes/standard.json';
import {
  OWNER_TRAIT_IDS,
  OWNER_TRAIT_LIMIT,
  TAKEOVER_DECADES,
  WEALTH_TIER_IDS,
  type ClubListing,
} from '../../../../packages/contracts/src/owner';
import {
  FFP,
  OWNER_BUSINESS,
  OWNER_TIERS,
  OWNER_TRAITS,
} from '../../../../packages/engine/src/owner-config';
import type { PresentationController, PresentationSnapshot } from '../presentation/controller';
import { validateLocalePack, validateThemePack } from '../presentation/contracts';
import { createLoadedLocale } from '../presentation/locale';
import { PresentationProvider } from '../presentation/react';
import { validateRegistry } from '../presentation/registry';
import { createThemeResolver } from '../presentation/theme';
import { DecadeStep, GenerationProgress, StartFlow, TraitStep } from './StartFlow';
import {
  canAfford,
  DECADE_LINES,
  defaultFilter,
  filterListings,
  fortuneAfter,
  generationShare,
  listingCountries,
  listingDivisions,
  seasonsBefore,
  takeoverYear,
  tierNote,
  TRAIT_DIFFICULTY,
  TRAIT_EFFECTS,
  toggleTrait,
  traitDifficulty,
} from './startChoices';

const snapshot: PresentationSnapshot = {
  locale: createLoadedLocale(
    validateRegistry(localeRegistryData, 'locale'),
    validateLocalePack(localeData),
  ),
  theme: createThemeResolver(validateThemePack(standardData), {
    url: '/presentation/themes/standard.json',
  }),
  localeRegistry: validateRegistry(localeRegistryData, 'locale'),
  themeRegistry: validateRegistry(themeRegistryData, 'theme'),
  pending: false,
  sessionOnly: false,
};
const controller: PresentationController = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  initialize: vi.fn(),
  select: vi.fn(),
  retry: vi.fn(),
  registerNeed: () => () => {},
  dispose: vi.fn(),
};
vi.mock('./Dialog', () => ({
  Dialog: ({ children, actions }: { children: ReactNode; actions: ReactNode }) =>
    createElement('section', null, children, actions),
}));
const markup = (children: ReactElement) =>
  renderToStaticMarkup(createElement(PresentationProvider, { controller, children }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** A listing with pound amounts in whole pounds of 1950 (240 pence each). */
const listing = (
  clubId: string,
  over: Partial<ClubListing> & { pounds?: number } = {},
): ClubListing => {
  const { pounds = 100_000, ...rest } = over;
  const pence = String(BigInt(pounds) * 240n);
  return {
    clubId,
    name: clubId,
    country: 'ENG',
    division: 0,
    currency: 'GBP-LSD',
    price: pence,
    pricePounds: pence,
    cash: '0',
    debt: '0',
    lastIncome: '0',
    lastWages: '0',
    strength: 60,
    affordable: false,
    ...rest,
  };
};
const pence = (pounds: number) => String(BigInt(pounds) * 240n);

describe('start flow rules', () => {
  it('takes the 1940s over at the 1946 restart and counts the seasons played before', () => {
    expect(TAKEOVER_DECADES.map(takeoverYear)).toEqual([
      1930, 1946, 1950, 1960, 1970, 1980, 1990, 2000,
    ]);
    expect(seasonsBefore(1930)).toBe(0);
    // 1930/31–1938/39, then 1946/47–1949/50: the war seasons are never played (→WORLD-14).
    expect(seasonsBefore(1950)).toBe(13);
    expect(seasonsBefore(1946)).toBe(9);
    expect(seasonsBefore(2000)).toBe(63);
  });
  it('reads the generation share from the season reached', () => {
    expect(generationShare(1930, 1930)).toBe(1);
    expect(generationShare(1930, 1950)).toBe(0);
    expect(generationShare(1938, 1950)).toBeCloseTo(8 / 13);
    expect(generationShare(1946, 1950)).toBeCloseTo(9 / 13);
    expect(generationShare(1950, 1950)).toBe(1);
    expect(generationShare(1990, 1950)).toBe(1);
    expect(generationShare(1930, 1940)).toBe(0);
    expect(generationShare(1946, 1940)).toBe(1);
  });
  it('picks traits up to the limit in their own order and drops them again', () => {
    expect(toggleTrait([], 'marketer')).toEqual(['marketer']);
    expect(toggleTrait(['marketer'], 'businessman')).toEqual(['businessman', 'marketer']);
    expect(toggleTrait(['businessman', 'marketer'], 'businessman')).toEqual(['marketer']);
    const full = OWNER_TRAIT_IDS.slice(0, OWNER_TRAIT_LIMIT);
    const other = OWNER_TRAIT_IDS.find((id) => !full.includes(id))!;
    expect(toggleTrait(full, other)).toEqual(full);
    expect(toggleTrait(full, full[0])).toHaveLength(OWNER_TRAIT_LIMIT - 1);
  });
  it('reads the trait count as difficulty from 하드 to 이지 (→OWNER-2)', () => {
    expect(traitDifficulty(0)).toEqual({ count: 0, step: 0, label: '하드' });
    expect(traitDifficulty(OWNER_TRAIT_LIMIT)).toEqual({
      count: OWNER_TRAIT_LIMIT,
      step: TRAIT_DIFFICULTY.length - 1,
      label: '이지',
    });
    const steps = Array.from({ length: OWNER_TRAIT_LIMIT + 1 }, (_, count) =>
      traitDifficulty(count),
    );
    expect(new Set(steps.map((item) => item.label)).size).toBe(OWNER_TRAIT_LIMIT + 1);
    steps.slice(1).forEach((item, index) => expect(item.step).toBeGreaterThan(steps[index].step));
    expect(traitDifficulty(-2).label).toBe('하드');
    expect(traitDifficulty(OWNER_TRAIT_LIMIT + 3).label).toBe('이지');
  });
  it('states each trait with the numbers of owner-config', () => {
    expect(TRAIT_EFFECTS.businessman).toBe(
      `사업 성공 확률 ${OWNER_BUSINESS.chance * 100}% → ${OWNER_TRAITS.businessman.success * 100}%`,
    );
    expect(TRAIT_EFFECTS.talisman).toContain(`+${OWNER_TRAITS.talisman.strength}`);
    expect(TRAIT_EFFECTS.negotiator).toBe('연봉 요구·이적료 −10%');
    expect(TRAIT_EFFECTS.fansFriend).toBe('팬 민심 하락 폭 −30%');
    expect(TRAIT_EFFECTS.marketer).toBe('스폰서 제안 +15%');
    expect(TRAIT_EFFECTS.politician).toBe('운영비 −10%');
    expect(tierNote('oil')).toContain(`중앙값의 ${OWNER_TIERS.oil.multiple}배`);
    expect(tierNote('oil')).toContain('한도가 없어요');
    expect(tierNote('midsize')).toContain(
      `그 값의 ${Math.round((OWNER_TIERS.midsize.multiple - 1) * 100)}%가 남아요`,
    );
    expect(DECADE_LINES[2000]).toContain(String(FFP.start));
    expect(DECADE_LINES[1940]).toContain('1946');
    expect(Object.keys(DECADE_LINES).map(Number)).toEqual([...TAKEOVER_DECADES]);
  });
  it('decides affordability on the pound price against the fortune', () => {
    const club = listing('a', { pounds: 500, affordable: false });
    expect(canAfford(club, pence(500))).toBe(true);
    expect(canAfford(club, pence(499))).toBe(false);
    expect(canAfford(club)).toBe(false);
    expect(canAfford({ ...club, affordable: true })).toBe(true);
    expect(fortuneAfter(club, pence(800))).toBe(BigInt(pence(300)));
    expect(fortuneAfter(club, pence(200))).toBe(-BigInt(pence(300)));
  });
  it('filters by country, division and affordability, strongest or cheapest first', () => {
    const clubs = [
      listing('eng-top', { pounds: 900, strength: 80 }),
      listing('eng-mid', { pounds: 300, strength: 70 }),
      listing('eng-two', { pounds: 200, division: 1, strength: 66 }),
      listing('esp-top', {
        pounds: 250,
        country: 'ESP',
        currency: 'ESP',
        price: '9000000',
        strength: 75,
      }),
      listing('esp-three', { pounds: 50, country: 'ESP', division: 2, strength: 50 }),
    ];
    expect(listingCountries(clubs)).toEqual(['ENG', 'ESP']);
    expect(listingDivisions(clubs, 'ESP')).toEqual([0, 2]);
    expect(listingDivisions(clubs, 'all')).toEqual([0, 1, 2]);
    const all = { country: 'all', division: 'all', affordable: false, sort: 'strength' } as const;
    expect(filterListings(clubs, all).map((club) => club.clubId)).toEqual([
      'eng-top',
      'esp-top',
      'eng-mid',
      'eng-two',
      'esp-three',
    ]);
    expect(filterListings(clubs, { ...all, sort: 'price' }).map((club) => club.clubId)).toEqual([
      'esp-three',
      'eng-two',
      'esp-top',
      'eng-mid',
      'eng-top',
    ]);
    expect(
      filterListings(clubs, { ...all, country: 'ENG', division: 0 }).map((club) => club.clubId),
    ).toEqual(['eng-top', 'eng-mid']);
    expect(
      filterListings(clubs, { ...all, affordable: true }, pence(260)).map((club) => club.clubId),
    ).toEqual(['esp-top', 'eng-two', 'esp-three']);
  });
  it('opens on the highest division of the first country holding an affordable club', () => {
    const clubs = [
      listing('eng-top', { pounds: 900 }),
      listing('eng-three', { pounds: 100, division: 2 }),
      listing('eng-two', { pounds: 200, division: 1 }),
    ];
    expect(defaultFilter(clubs, pence(250))).toEqual({
      country: 'ENG',
      division: 1,
      affordable: false,
      sort: 'strength',
    });
    expect(defaultFilter(clubs, pence(10))).toMatchObject({ country: 'ENG', division: 0 });
    expect(defaultFilter([], pence(10))).toMatchObject({ country: 'all', division: 'all' });
  });
});

describe('start flow screens', () => {
  const props = { onGenerate: () => {}, onTakeOver: () => {} };
  it('opens on the six tiers, 석유 재벌 first, with the slot it fills', () => {
    const html = markup(createElement(StartFlow, { ...props, slot: 1, onBack: () => {} }));
    const tiers = [...html.matchAll(/aria-pressed="(true|false)"[^>]*><b>([^<]+)<\/b>/g)];
    expect(tiers.map((match) => match[2])).toEqual(
      WEALTH_TIER_IDS.map((id) => OWNER_TIERS[id].label),
    );
    expect(tiers[0][2]).toBe('석유 재벌');
    // The reference start (중견 사업가) opens selected.
    expect(tiers.find((match) => match[1] === 'true')?.[2]).toBe(OWNER_TIERS.midsize.label);
    expect(text(html)).toContain('슬롯 2');
    expect(text(html)).toContain('게임 슬롯');
    expect(text(html)).toContain('다음 →');
    expect(text(html)).toContain(`×${OWNER_TIERS.oil.multiple}`);
  });
  it('shows eight traits and the count as difficulty, closing the rest at the limit', () => {
    const none = markup(createElement(TraitStep, { traits: [], onChange: () => {} }));
    expect(none.match(/aria-pressed=/g)).toHaveLength(OWNER_TRAIT_IDS.length);
    expect(text(none)).toContain('난이도 하드');
    expect(text(none)).toContain(`특성 0/${OWNER_TRAIT_LIMIT}`);
    const full = markup(
      createElement(TraitStep, {
        traits: OWNER_TRAIT_IDS.slice(0, OWNER_TRAIT_LIMIT),
        onChange: () => {},
      }),
    );
    expect(text(full)).toContain('난이도 이지');
    expect(full.match(/disabled=""/g)).toHaveLength(OWNER_TRAIT_IDS.length - OWNER_TRAIT_LIMIT);
  });
  it('lists every decade with its line and keeps the seed an advanced setting', () => {
    const html = markup(
      createElement(DecadeStep, {
        decade: 1940,
        seed: 'seed-1',
        onDecade: () => {},
        onSeed: () => {},
      }),
    );
    for (const decade of TAKEOVER_DECADES) expect(text(html)).toContain(`${decade}년대`);
    expect(text(html)).toContain(DECADE_LINES[1940]);
    expect(text(html)).toContain('1946/47 시즌 인수');
    expect(html).toMatch(/<details[^>]*><summary>고급 설정<\/summary>/);
    expect(html).toContain('value="seed-1"');
  });
  it('shows 세계를 생성중… with the season reached and the war gap', () => {
    const html = markup(
      createElement(GenerationProgress, {
        choice: { tier: 'oil', traits: ['talisman'], decade: 1960, seed: 's' },
        season: 1947,
      }),
    );
    expect(text(html)).toContain('세계를 생성중…');
    expect(text(html)).toContain('1947/48 시즌');
    expect(text(html)).toContain('1939/40–1945/46 시즌은 전쟁으로 열리지 않아요');
    expect(html).toContain(`value="${Math.round(generationShare(1947, 1960) * 100)}"`);
    expect(text(html)).toContain(OWNER_TIERS.oil.label);
  });
  it('confirms a takeover with price and books but no direction choice', () => {
    const html = markup(
      createElement(TakeoverConfirm, {
        listing: listing('Rovers', { cash: '480000', debt: '1200000' }),
        fortune: '999999999',
        year: 1950,
        busy: false,
        blocked: false,
        onBack: () => {},
        onConfirm: () => {},
      }),
    );
    expect(text(html)).toContain('인수 확정');
    expect(text(html)).toContain('구단 현금');
    expect(text(html)).toContain('부채');
    expect(text(html)).not.toContain('구단 방향');
    expect(html).not.toContain('combobox');
  });
  it('lists the clubs with price, books, strength and affordability once they arrive', () => {
    const clubs = [
      listing('Rovers', { pounds: 400, strength: 71, cash: pence(20_000), debt: pence(5_000) }),
      listing('United', { pounds: 4_000, strength: 79 }),
    ];
    const html = markup(
      createElement(StartFlow, {
        ...props,
        initial: { decade: 1950 },
        listings: clubs,
        fortune: pence(1_000),
      }),
    );
    const page = text(html);
    expect(page).toContain('인수할 구단');
    expect(page).toContain('구단주 자금');
    expect(page).toContain('1950/51 시즌 · 2개 구단');
    for (const label of ['전력', '현금', '부채', '지난 수입', '인건비'])
      expect(page).toContain(label);
    expect(html).toMatch(/aria-label="Rovers[^"]*인수 가능"/);
    expect(html).toMatch(/aria-label="United[^"]*자금 부족"/);
    // The strongest club comes first.
    expect(html.indexOf('aria-label="United')).toBeLessThan(html.indexOf('aria-label="Rovers'));
  });
});
