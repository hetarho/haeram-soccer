import { openPersonnel } from './personnel-navigation';
import { openClubRecords, openLeague } from './competition-navigation';
import { openOfficeLibrary } from './office';
import { marketRows, marketInfo, closeMarketPanel } from './market';
import { finishSeason, advanceOneRound } from './season-progression';
import { openCurrentClubSeason, openSeasonReview } from './record-navigation';
import { chooseOption } from './select';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { horizontalOverflow } from './layout';
import { openSaveMenu } from './save-menu';
import { leaveOffice, openOfficeArea } from './office';
test('operates a club, reads a season and exports/imports the actual save', async ({ page }) => {
  // Simulates a full season with staff, academy and market days; slow CI browsers need longer.
  test.slow();
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('ui-management');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await openPersonnel(page, 'players');
  await expect(page.getByRole('tablist', { name: '1군', exact: true })).toBeVisible();
  // First-team work starts on the roster; coaching work has its own primary hub.
  const peopleTab = (name: string) =>
    page.getByRole('tablist', { name: '1군' }).getByRole('tab', { name, exact: true });
  await expect(peopleTab('선수 목록')).toHaveAttribute('aria-selected', 'true');
  await openPersonnel(page, 'coaches');
  await expect(page.getByRole('region', { name: '스태프', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/staff\?view=coaches$/);
  await openPersonnel(page, 'manager');
  await chooseOption(page.getByRole('combobox', { name: '요청 전술', exact: true }), 'counter');
  await chooseOption(page.getByRole('combobox', { name: '요청 말투', exact: true }), 'evidence');
  await page.getByRole('button', { name: '감독에게 제안하기' }).click();
  await expect(page.locator('blockquote').getByText(/역습 요청 ·/)).toBeVisible();
  await openOfficeArea(page, '후원');
  // A 1950 club has only the local slot open; signing it replaces the offers with the contract.
  const localSponsor = page.getByTestId('sponsor-slot-local');
  await localSponsor.getByRole('button', { name: '지역 후원 계약', exact: true }).first().click();
  await expect(localSponsor.getByTestId('sponsor-contract-local')).toBeVisible();
  await expect(page.getByRole('button', { name: '지역 후원 계약', exact: true })).toHaveCount(0);
  // Campaigns are no more: the owner spends on the town or abroad through the board's rows.
  await openOfficeLibrary(page);
  const global = page.getByRole('region', { name: '글로벌', exact: true });
  await global.locator('button[aria-controls^="board-area-body-"]').click();
  await global.getByRole('radio', { name: '해외 마케팅 해외 홍보', exact: true }).click();
  const draft = page.getByTestId('strategy-draft');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(page.getByTestId('area-summary-global')).toHaveText('해외 홍보 · 없음 · 안 함');
  // The market is a first-team tab.
  await leaveOffice(page);
  await openPersonnel(page, 'players');
  await peopleTab('이적시장').click();
  await expect(peopleTab('이적시장')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/first-team\?view=market$/);
  await marketRows(page)
    .filter({ hasText: '자유계약' })
    .first()
    .getByRole('button', { name: / 상세 보기$/ })
    .click();
  await page.getByRole('button', { name: '자유계약 영입', exact: true }).click();
  await closeMarketPanel(page, '영입 후보 상세');
  await expect(await marketInfo(page)).toContainText('선수단 정원 21/40');
  await closeMarketPanel(page, '영입 정보');
  await peopleTab('선수 목록').click();
  await expect(page.getByText('선수단 21/40', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await finishSeason(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // A closed season no longer interrupts: its review waits in the league's season list.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 진행 도구' })).toHaveCount(0);
  await openLeague(page, true);
  await chooseOption(page.getByRole('combobox', { name: '리그 시즌', exact: true }), '1950');
  await openSeasonReview(page);
  await expect(page.getByTestId('season-move')).toBeVisible();
  await page.getByRole('button', { name: '← 돌아가기 · 리그', exact: true }).click();
  // The review opens first; the final table is the closed season's next tab.
  await page
    .getByRole('tablist', { name: '지난 시즌 보기' })
    .getByRole('tab', { name: '순위표', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '최종 순위표' })).toContainText('Haeram');
  // Any league's final table that season comes from the archive too.
  await chooseOption(
    page.getByRole('group', { name: '리그 선택' }).getByRole('combobox', { name: '국가' }),
    'GER',
  );
  const german = page.getByRole('region', { name: '최종 순위표' });
  await expect(german).toContainText('1950/51 · 독일 1부');
  await expect(german.locator('tbody tr')).toHaveCount(18);
  await page.getByRole('button', { name: '우리 리그로', exact: true }).click();
  await expect(page.getByRole('region', { name: '최종 순위표' })).toContainText('Haeram');
  await openClubRecords(page);
  await openCurrentClubSeason(page);
  await chooseOption(page.getByRole('combobox', { name: '기록 시즌', exact: true }), '1950');
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '지난 경기 상세' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const download = page.waitForEvent('download');
  const saveMenu = await openSaveMenu(page);
  await saveMenu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await download;
  await saveMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
  const raw = readFileSync((await file.path())!);
  expect(JSON.parse(raw.toString()).codec).toBe('gzip-cjk14');
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await advanceOneRound(page);
  await expect(page.getByTestId('game-round')).toHaveText('1');
  await (
    await openSaveMenu(page)
  )
    .locator('input[type=file]')
    .last()
    .setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: raw });
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '기록 교체하고 가져오기' }).click();
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await expect(page.getByTestId('game-round')).toHaveText('0');
});
test('browses every historical regional group and resets filters on country changes', async ({
  page,
}) => {
  await page.goto('/');
  await chooseOption(page.getByRole('combobox', { name: '창단 국가', exact: true }), 'ITA');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('historical-regional-groups');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await finishSeason(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  // Other leagues' past tables live on the league page, never in the records room (→WEB-54).
  await openLeague(page, true);
  await chooseOption(page.getByRole('combobox', { name: '리그 시즌', exact: true }), '1950');
  await page
    .getByRole('tablist', { name: '지난 시즌 보기' })
    .getByRole('tab', { name: '순위표', exact: true })
    .click();
  const picker = page.getByRole('group', { name: '리그 선택' });
  await chooseOption(picker.getByRole('combobox', { name: '디비전', exact: true }), '2');
  const standings = page.getByRole('region', { name: '최종 순위표' });
  const rows = standings.locator('tbody tr');
  const firstClubs: string[] = [];
  for (const [value, group] of [
    ['0', 'A'],
    ['1', 'B'],
    ['2', 'C'],
  ]) {
    await chooseOption(picker.getByRole('combobox', { name: '지역 그룹', exact: true }), value);
    await expect(standings).toContainText(`1950/51 · 이탈리아 3부 ${group}조 · 20팀`);
    await expect(rows).toHaveCount(20);
    firstClubs.push(await rows.first().locator('td:nth-child(2)').innerText());
  }
  expect(new Set(firstClubs).size).toBe(3);
  await chooseOption(picker.getByRole('combobox', { name: '국가', exact: true }), 'ENG');
  await expect(picker.getByRole('combobox', { name: '지역 그룹', exact: true })).toHaveCount(0);
  await expect(standings).toContainText('1950/51 · 잉글랜드 1부 · 20팀');
  await expect(rows).toHaveCount(20);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
