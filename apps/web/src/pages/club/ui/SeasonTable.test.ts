import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../../../public/presentation/locales/index.json';
import localeData from '../../../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../../../public/presentation/themes/index.json';
import standardData from '../../../../public/presentation/themes/standard.json';
import type { PreOwnerSeason } from '../../../../../../packages/contracts/src/owner';
import type { SeasonArchive, World } from '../../../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { withOwner } from '../../../../../../packages/engine/src/testing';
import type {
  PresentationController,
  PresentationSnapshot,
} from '../../../presentation/controller';
import { validateLocalePack, validateThemePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { PresentationProvider } from '../../../presentation/react';
import { validateRegistry } from '../../../presentation/registry';
import { createThemeResolver } from '../../../presentation/theme';
import { SeasonTable } from './ClubTrends';

/** The 순위/재정 view the table reads; a server render never sees the task store's later values. */
let view: 'rank' | 'finance' = 'rank';
vi.mock('../../../shared/routing/taskMemory', async (original) => ({
  ...(await original<typeof import('../../../shared/routing/taskMemory')>()),
  useTaskState: <T>(_world: string, key: string, initial: T) =>
    [key === 'record-season-view' ? (view as T) : initial, () => {}] as const,
}));

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

/** A closed season of the club's own, enough for the season list. */
function season(w: World, year: number): SeasonArchive {
  const club = w.clubs.find((c) => c.id === w.playerClub)!;
  return {
    year,
    tier: club.tier,
    group: 0,
    rank: 3,
    points: 60,
    played: 38,
    won: 18,
    drawn: 6,
    lost: 14,
    gf: 55,
    ga: 45,
    cash: w.cash,
    currency: w.currency,
    income: '1000000',
    expense: '900000',
    fans: 1000,
    rating: 50,
    manager: 'm',
    metrics: {} as SeasonArchive['metrics'],
    standings: [],
  } as unknown as SeasonArchive;
}
const before = (year: number, place: number): PreOwnerSeason => ({
  year,
  finish: { tier: 1, group: 0, place },
  runs: [],
});
function render(w: World, preOwner?: PreOwnerSeason[], shown: typeof view = 'rank') {
  view = shown;
  return renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(SeasonTable, { w, onSeason: () => {}, preOwner }),
    }),
  );
}
/** The season names and the rule as the rows show them, labels and attributes left out. */
const seasonsIn = (html: string) =>
  [...html.matchAll(/>(\d{4}\/\d{2})<|구단 인수/g)].map((match) => match[1] ?? match[0]);

describe('시즌별 기록 as one history (→WEB-54, HIST-21, OWNER-17)', () => {
  it('lists the owner’s seasons, the takeover rule, then the seasons before, under 순위 or 재정', () => {
    const w = careerWorld({ country: 'ENG', seed: 'season-table' });
    const takeover = w.year;
    withOwner(w);
    w.history.push(season(w, takeover), season(w, takeover + 1));
    w.owner!.seasonRecords = [takeover, takeover + 1].map((year) => ({
      year,
      currency: w.currency,
      fortune: '5000000',
      business: '120000',
      living: '40000',
      injected: '0',
      dividend: '30000',
      fanMood: 61.6,
    }));
    w.year = takeover + 2;
    const pre = [before(takeover - 2, 4), before(takeover - 1, 2)],
      rank = render(w, pre),
      finance = render(w, pre, 'finance');
    const name = (year: number) => `${year}/${String(year + 1).slice(2)}`;
    const ownerHeaders = ['구단주 자금', '사업', '생활비', '자금 투입', '배당', '팬 민심'],
      clubHeaders = ['리그', '승점', '컵 대회', 'Elo'];
    for (const html of [rank, finance]) {
      // One table: the current season, the owner's seasons, the rule, then the past, newest first.
      expect(html.match(/<table/g)).toHaveLength(1);
      expect(seasonsIn(html)).toEqual([
        name(takeover + 2),
        name(takeover + 1),
        name(takeover),
        '구단 인수',
        name(takeover - 1),
        name(takeover - 2),
      ]);
      expect(html).toContain(`구단 인수 · ${name(takeover)}`);
      expect(html).toContain('scope="rowgroup"');
      // The switch sits above the table with both views.
      expect(html).toContain('aria-label="시즌별 기록 항목"');
      expect(html).toContain('>순위</');
      expect(html).toContain('>재정</');
      // The past's honours sit in the note, beside the count of seasons before the owner.
      expect(html).toContain('2시즌 · 인수 전 2시즌 · 리그 우승 0회');
      // Seasons before the owner open no review: only the owned rows carry a link.
      expect(html.match(/구단 시즌 기록 보기/g)).toHaveLength(3);
    }
    // 순위: the club's columns only, the past's finish shown.
    for (const header of clubHeaders) expect(rank).toContain(`>${header}</th>`);
    for (const header of ownerHeaders) expect(rank).not.toContain(`>${header}</th>`);
    expect(rank).toContain('colSpan="6"');
    expect(rank).toContain('2부 2위');
    // 재정: the owner's record of each close, never the club's columns, nothing for the past.
    for (const header of ownerHeaders) expect(finance).toContain(`>${header}</th>`);
    for (const header of clubHeaders) expect(finance).not.toContain(`>${header}</th>`);
    expect(finance).toContain('colSpan="7"');
    expect(finance).toContain('>62</td>');
    expect(finance).not.toContain('2부 2위');
  });

  it('draws no rule for a first-season takeover and no owner columns in a founded career', () => {
    const w = careerWorld({ country: 'ENG', seed: 'season-table-first' });
    withOwner(w);
    expect(render(w, [])).not.toContain('구단 인수');
    const founded = careerWorld({ country: 'ENG', seed: 'season-table-founded' });
    delete founded.owner;
    // A founded career has no owner record to switch to, whatever the remembered view.
    const html = render(founded, [before(founded.year - 1, 1)], 'finance');
    expect(html).not.toContain('시즌별 기록 항목');
    expect(html).toContain('>승점</th>');
    expect(html).not.toContain('구단 인수');
    expect(html).not.toContain('구단주 자금');
    expect(html).not.toContain(`${founded.year - 1}/`);
  });
});
