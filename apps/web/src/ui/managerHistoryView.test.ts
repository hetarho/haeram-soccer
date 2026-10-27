import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MANAGER_HISTORY_FIXTURE,
  knownEarlierServiceCareer,
  managerFixtureLegacy,
  managerFixturePage,
  managerFixtureQuery,
  managerFixtureSource,
  managerFixtureTenures,
  reappointedCareer,
  replacedCupWinnerCareer,
  trophylessCareer,
  untrackedCareer,
} from '../../../../tests/fixtures/manager-history';
import { ManagerHistory } from './ManagerHistory';
import {
  MANAGER_HISTORY_COPY,
  managerHistoryListState,
  managerRowView,
  managerTenureView,
  type ManagerLegacyView,
  type ManagerTenureView,
} from './managerHistoryView';

const club = MANAGER_HISTORY_FIXTURE.club;
const tenures = (source: Parameters<typeof managerFixtureQuery>[0]) =>
  managerFixtureTenures(managerFixtureQuery(source)).map(managerTenureView);
const text = (view: ManagerTenureView) => JSON.stringify(view);
const noop = () => undefined;

describe('manager-history view labels', () => {
  it('uses explicitly marked synthetic fixtures', () => {
    expect(MANAGER_HISTORY_FIXTURE.synthetic).toBe(true);
  });

  it('shows a trophyless fully tracked tenure with its actual record and an explicit no-honour state', () => {
    const [han] = tenures(trophylessCareer());
    expect(han.name).toBe('Han Trophyless');
    expect(han.coverage).toBeUndefined();
    expect(han.honoursLine).toBe('우승·승격 없음');
    expect(han.honoursNote).toBeUndefined();
    expect(han.honours).toEqual([]);
    expect(han.finishesLine).toBe('2부 최고 6위');
    expect(han.finishes).toHaveLength(1);
    expect(han.finishes[0]).toMatchObject({
      label: '2부 최종 6위',
      season: '1950/51 · 최고 최종 순위',
    });
    expect(han.finishes[0].note).toBeUndefined();
    expect(han.finishes[0].action.season).toEqual({ year: 1950, club });
    expect(han.record).toMatchObject({
      line: '3경기 1승 1무 1패',
      rate: '승률 33% · 3경기 기준',
      scope: '모든 공식전 · 정규 90분 결과',
      known: true,
    });
    expect(han.record.note).toBeUndefined();
    expect(han.runs.map((run) => run.value)).toEqual(['1경기', '2경기']);
    expect(han.service).toBe('선임 1950-08-01');
    expect(han.tracking).toBeUndefined();
  });

  it('keeps same-name reappointments apart and leaves out a no-match interim', () => {
    const career = reappointedCareer();
    const rows = tenures(career);
    // The same-day interim never took a match: his tenure stays in the facts only (→HIST-18).
    expect(career.facts!.tenures.map((tenure) => tenure.name)).toContain('Lee Interim');
    expect(rows.map((row) => row.name)).toEqual(['Park Again', 'Park Again']);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    const [again, first] = rows;

    expect(again.badges).toEqual(['현재 감독']);
    expect(again.service).toBe('선임 1960-11-09');
    expect(again.end).toBe('현재 재임 중');
    // The shoot-out win counts as a 90-minute draw: the winning run stops, the unbeaten one is live.
    expect(again.record.line).toBe('3경기 2승 1무 0패');
    expect(again.runs).toMatchObject([
      { label: '최다 연승', value: '2경기', ongoing: false },
      { label: '최장 무패', value: '3경기 · 진행 중', ongoing: true },
    ]);

    expect(first.badges).toEqual([]);
    expect(first.service).toBe('선임 1960-08-01');
    expect(first.end).toBe('떠남 1960-11-09 · 교체');
    expect(first.record.line).toBe('2경기 2승 0무 0패');
    expect(first.runs[0]).toMatchObject({ value: '2경기', ongoing: false });
  });

  it('keeps a replaced cup winner’s title and labels the successor’s final table as a shared season', () => {
    const [yoon, cho] = tenures(replacedCupWinnerCareer());
    expect(cho.name).toBe('Cho Cup');
    expect(cho.honoursLine).toBe('컵 우승 1');
    expect(cho.honours).toHaveLength(1);
    const [cup] = cho.honours;
    expect(cup).toMatchObject({ label: 'FA컵 우승', season: '1970/71 · 컵 우승' });
    expect(cup.note).toContain('재임 중 확정');
    expect(cup.action.season).toEqual({ year: 1970, club });
    expect(cup.action.accessibleLabel).toBe('Cho Cup · FA컵 우승 · 1970/71 시즌 기록 열기');
    expect(cho.finishesLine).toBe('확정된 리그 최종 순위 없음');
    expect(cho.provisional).toEqual([]);

    expect(yoon.honoursLine).toBe('우승·승격 없음');
    expect(text(yoon)).not.toContain('FA컵');
    expect(yoon.finishes).toHaveLength(1);
    expect(yoon.finishes[0].label).toBe('1부 최종 2위');
    expect(yoon.finishes[0].note).toContain('이 감독의 시즌 전체 승무패가 아니에요');
    // His own matches only: the season's whole W-D-L is never credited to him.
    expect(yoon.record.line).toBe('2경기 0승 1무 1패');
    expect(yoon.provisional).toEqual(['1971/72 1부 현재 3위 · 진행 중이라 확정 전']);
    expect(yoon.honours.map((honour) => honour.season)).not.toContain('1971/72');
    expect(yoon.sources.map((source) => source.season.year)).toEqual([1970]);
  });

  it('keeps a known earlier service year apart from the tracking date and limits partial totals', () => {
    const page = managerFixtureQuery(knownEarlierServiceCareer());
    const [seo, legacy] = page.rows.map(managerRowView) as [ManagerTenureView, ManagerLegacyView];
    expect(seo.service).toBe('1979년부터 재임 (기록 이전)');
    expect(seo.tracking).toBe('성과 기록 1985-09-10부터');
    expect(seo.coverage).toContain('통산 전체가 아니에요');
    expect(seo.honoursLine).toBe('리그 우승 1');
    expect(seo.honoursNote).toBe('기록된 기간의 성과만 담았어요.');
    expect(seo.honours[0]).toMatchObject({ label: '3부 우승', season: '1985/86 · 리그 우승' });
    // The appointment is not recorded, so the title is not presented as a whole-season charge.
    expect(seo.honours[0].note).toBeDefined();
    expect(seo.record).toMatchObject({
      line: '1경기 1승 0무 0패',
      note: '기록된 기간의 경기만 · 통산 전체 아님',
    });
    expect(legacy).toEqual({
      kind: 'legacy',
      id: 'legacy:synthetic:event:seo-hire',
      when: '1979-08-29',
      title: 'Seo Veteran 선임',
      detail: '구단이 새 감독을 선임했어요.',
      note: '옛 기록 · 감독별 성과와 연결되지 않아요',
    });
  });

  it('never shows zeros or a no-achievement claim where attribution is unavailable', () => {
    const page = managerFixtureQuery(untrackedCareer());
    const [current, ...legacy] = page.rows.map(managerRowView);
    expect(current.kind).toBe('tenure');
    const kang = current as ManagerTenureView;
    expect(kang).toMatchObject({
      name: 'Kang Before',
      badges: ['현재 감독'],
      service: '1990년부터 재임',
      tracking: '성과 기록 시작 전',
      honoursLine: '성과 기록 없음',
      finishesLine: '최종 순위 기록 없음',
      record: { line: '경기 기록 없음', known: false },
      sources: [],
    });
    expect(kang.record.rate).toBeUndefined();
    expect(kang.runs.map((run) => run.value)).toEqual(['기록 없음', '기록 없음']);
    expect(text(kang)).not.toMatch(/0경기|우승·승격 없음/);
    expect(legacy.map((row) => row.kind)).toEqual(['legacy', 'legacy']);
  });

  it('maps source seasons, marking the season in progress', () => {
    const rows = managerFixtureTenures(managerFixtureQuery(replacedCupWinnerCareer()));
    const yoon = rows[0];
    const withCurrent = {
      ...yoon,
      summary: {
        ...yoon.summary!,
        sourceSeasons: [
          { year: 1971, club },
          { year: 1970, club },
        ],
      },
    };
    expect(managerTenureView(withCurrent).sources.map((source) => source.label)).toEqual([
      '1971/72 시즌 기록 (진행 중)',
      '1970/71 시즌 기록',
    ]);
  });
});

describe('manager-history list state', () => {
  const long = () =>
    managerFixtureSource({
      personnelEvents: Array.from({ length: 21 }, (_, index) =>
        managerFixtureLegacy(`event-${index}`, 1900 + index, 1, `Event ${index}`, ''),
      ),
    });

  it('distinguishes loading, a retryable error and genuinely empty records', () => {
    expect(managerHistoryListState({ loading: true })).toEqual({
      kind: 'loading',
      message: MANAGER_HISTORY_COPY.loading,
    });
    expect(managerHistoryListState({ error: '' })).toEqual({
      kind: 'error',
      message: MANAGER_HISTORY_COPY.error,
      retry: MANAGER_HISTORY_COPY.retry,
    });
    expect(managerHistoryListState({ error: 'worker stopped' })).toMatchObject({
      kind: 'error',
      message: 'worker stopped',
    });
    expect(managerHistoryListState({ page: managerFixtureQuery(managerFixtureSource()) })).toEqual({
      kind: 'empty',
      message: MANAGER_HISTORY_COPY.empty,
    });
  });

  it('offers the query cursor, then keeps loaded rows while loading or retrying the next page', () => {
    const page = Object.freeze(managerFixtureQuery(long()));
    expect(page.nextCursor).not.toBeNull();
    const ready = managerHistoryListState({ page });
    expect(ready.kind).toBe('ready');
    if (ready.kind !== 'ready') return;
    expect(ready.rows).toHaveLength(page.pageSize);
    expect(ready.footer).toEqual({
      kind: 'more',
      cursor: page.nextCursor,
      label: MANAGER_HISTORY_COPY.more,
      shown: `${page.pageSize} / 21건`,
    });
    expect(managerHistoryListState({ page, loading: true })).toMatchObject({
      kind: 'ready',
      footer: { kind: 'loading-more' },
    });
    expect(managerHistoryListState({ page, error: '' })).toMatchObject({
      kind: 'ready',
      footer: { kind: 'retry-more', message: MANAGER_HISTORY_COPY.moreError },
    });
    const last = managerFixtureQuery(long(), page.nextCursor!);
    expect(
      managerHistoryListState({
        page: managerFixturePage([...page.rows, ...last.rows], { total: 21 }),
      }),
    ).toMatchObject({ kind: 'ready', footer: { kind: 'end', shown: '21 / 21건' } });
  });

  it('renders controlled inspection with semantic controls and source actions', () => {
    const page = managerFixtureQuery(replacedCupWinnerCareer());
    const [yoon, cho] = page.rows;
    const markup = renderToStaticMarkup(
      createElement(ManagerHistory, {
        page,
        inspected: cho.id,
        onInspect: noop,
        onOpenSeason: noop,
        onLoadMore: noop,
        onRetry: noop,
      }),
    );
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(markup).toContain(`data-manager-row="${yoon.id}"`);
    expect(markup).toContain('aria-label="Cho Cup · FA컵 우승 · 1970/71 시즌 기록 열기"');
    expect(markup).not.toContain('Yoon Closer · 1부 최종 2위');
    expect(markup).toContain('<h3');
    expect(markup).not.toMatch(/<a\s/);
  });
});
