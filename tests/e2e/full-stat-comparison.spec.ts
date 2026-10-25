import { expect, test, type Page } from '@playwright/test';
import type { World } from '../../packages/contracts/src/types';
import { advanceRound, createWorld } from '../../packages/engine/src/index';
import { DISABLED_RELEASE, withCandidateModel } from '../fixtures/worlds';
import { horizontalOverflow } from './layout';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption, selectOptions } from './select';

/**
 * Complete statistics in the existing league lenses and the player comparison (→WEB-89, HIST-17).
 * Marked synthetic careers founded before the full model's release, `before` rounds on the
 * pre-feature model, then on the released model (`withCandidateModel`: the activation the writer
 * applies) from that boundary — from the first day when `before` is 0 — every result real football.
 */
function career(seed: string, before: number, after: number): World {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Synthetic Full Stats',
      color: '#2a4d6a',
      seed,
      level: 'normal',
    },
    DISABLED_RELEASE,
  );
  for (let n = 0; n < before; n++) advanceRound(w, undefined, false);
  withCandidateModel(w);
  for (let n = 0; n < after; n++) advanceRound(w, undefined, false);
  return w;
}
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const nav = (page: Page) =>
  page.getByRole('navigation', {
    name: page.viewportSize()!.width < 760 ? '모바일 게임 메뉴' : '게임 메뉴',
    exact: true,
  });
async function openLeagueTab(page: Page, tab: '팀 기록' | '선수 기록') {
  await nav(page).getByRole('button', { name: '리그', exact: true }).click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

for (const viewport of VIEWPORTS)
  test(`compares current full statistics of every club in the same units on ${viewport.name}`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize(viewport);
    await importResponsibilityCareer(page, career('full-stat-comparison', 0, 2));

    // Every club's totals, ours highlighted, tracked from the season's first day.
    await openLeagueTab(page, '팀 기록');
    const teams = page.getByRole('region', { name: '팀 세부 기록', exact: true });
    await expect(teams.getByTestId('full-stats-coverage')).toContainText('시즌 전체 기록');
    const table = teams.getByRole('table', { name: '팀 세부 기록표' });
    await expect(table).toBeVisible();
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(2);
    await teams
      .getByRole('group', { name: '팀 세부 기록 정렬' })
      .getByRole('button', { name: '득점', exact: true })
      .click();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Leading players of every club, no missing or estimate badge for generated counters.
    await openLeagueTab(page, '선수 기록');
    const players = page.getByRole('region', { name: '선수 세부 기록', exact: true });
    await expect(players.getByTestId('full-stats-coverage')).toContainText('시즌 전체 기록');
    await players
      .getByRole('group', { name: '선수 세부 기록 지표' })
      .getByRole('button', { name: 'xG', exact: true })
      .click();
    const leaders = players.getByRole('table', { name: 'xG 순위표' });
    const top = leaders.locator('tbody tr').first();
    await expect(top).toBeVisible();
    // Every per-90 rate shows the minutes it divides, phones included (→HIST-6).
    await expect(top.locator('td').last()).toContainText(/\d+\.\d{2} · \d+분/);
    await expect(top.locator('td').last()).toBeVisible();
    await expect(players).not.toContainText('추정');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Another league's leaders come from the lens; only the round-by-round race is ours alone.
    const country = page.getByRole('combobox', { name: '국가', exact: true });
    await chooseOption(country, 'FRA');
    await expect(players.getByTestId('full-stats-coverage')).toContainText('시즌 전체 기록');
    await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toHaveCount(0);
    await page
      .getByRole('group', { name: '선수 기록 보기' })
      .getByRole('button', { name: '득점왕 추이', exact: true })
      .click();
    await expect(page.getByRole('region', { name: '선택 리그 기록 안내' })).toContainText(
      '라운드별 득점왕 기록',
    );
    await page.getByRole('button', { name: '우리 리그 기록 보기', exact: true }).click();
    await expect(country).toHaveAttribute('data-value', 'ENG');

    // Our player against another club's, from the same statistics.
    await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
    const opener = page.getByRole('button', { name: '우리 선수 비교', exact: true });
    await opener.click();
    // One dialog whose title follows its scope, so the locator survives the rename.
    const sheet = page.getByRole('dialog', { name: /^(우리|리그) 선수 비교$/ });
    await expect(sheet).toHaveAccessibleName('우리 선수 비교');
    await chooseOption(
      sheet.getByRole('combobox', { name: '비교 지표 범위', exact: true }),
      'league',
    );
    await expect(sheet).toHaveAccessibleName('리그 선수 비교');
    await expect(sheet.getByTestId('full-stats-coverage')).toContainText('시즌 전체 기록');
    const b = sheet.getByRole('combobox', { name: '비교 선수 B', exact: true });
    const options = await selectOptions(b);
    expect(options.some((option) => !option.label.includes('우리 선수'))).toBe(true);
    const result = sheet.getByRole('region', { name: '두 선수 비교 결과' });
    for (const label of ['출전', '실제 출전', '골 /90분', 'xG /90분'])
      await expect(result).toContainText(label);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await sheet.getByRole('button', { name: '비교 마치기', exact: true }).click();
    await expect(opener).toBeFocused();
  });

test('names a partial season start and sample through reload and import', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  // One round on the earlier model, then the candidate model from the next day.
  await importResponsibilityCareer(page, career('full-stat-partial', 1, 1));
  const coverage = async () => {
    await openLeagueTab(page, '선수 기록');
    const line = page
      .getByRole('region', { name: '선수 세부 기록', exact: true })
      .getByTestId('full-stats-coverage');
    await expect(line).toContainText('부터 기록');
    await expect(line).toContainText('경기는 기록 없음');
    await expect(line).not.toContainText('시즌 전체 기록');
    return line.innerText();
  };
  const imported = await coverage();
  expect(imported).toMatch(/리그 \d+경기 · 그 전 \d+경기는 기록 없음/);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  // A reload restores the page it left; the ledger comes back from the saved checkpoint.
  await expect(nav(page).getByRole('button', { name: '리그', exact: true })).toBeVisible();
  expect(await coverage()).toBe(imported);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
