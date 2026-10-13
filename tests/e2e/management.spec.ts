import { chooseOption } from './select';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { horizontalOverflow } from './layout';
test('operates a club, reads a season and exports/imports the actual save', async ({ page }) => {
  // Simulates a full season with staff, academy and market days; slow CI browsers need longer.
  test.slow();
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('ui-management');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '선수·스태프', exact: true }).click();
  await expect(page.getByRole('heading', { name: '선수·스태프', level: 2 })).toBeVisible();
  // 사람 opens on 선수; the market, the manager's office and the coaches are tabs beside it.
  const peopleTab = (name: string) =>
    page.getByRole('tablist', { name: '선수·스태프 보기' }).getByRole('tab', { name, exact: true });
  await expect(peopleTab('선수')).toHaveAttribute('aria-selected', 'true');
  await peopleTab('코치진').click();
  await expect(page.getByRole('region', { name: '코치진', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/people\?view=coaches$/);
  await peopleTab('감독').click();
  await chooseOption(page.getByRole('combobox', { name: '요청 전술', exact: true }), 'counter');
  await chooseOption(page.getByRole('combobox', { name: '요청 말투', exact: true }), 'evidence');
  await page.getByRole('button', { name: '감독에게 제안하기' }).click();
  await expect(page.locator('blockquote').getByText(/역습 요청 ·/)).toBeVisible();
  await page.getByRole('button', { name: '구단 운영', exact: true }).click();
  await page.getByRole('tab', { name: '후원', exact: true }).click();
  // A 1950 club has only the local slot open; signing it replaces the offers with the contract.
  const localSponsor = page.getByTestId('sponsor-slot-local');
  await localSponsor.getByRole('button', { name: '지역 후원 계약', exact: true }).first().click();
  await expect(localSponsor.getByTestId('sponsor-contract-local')).toBeVisible();
  await expect(page.getByRole('button', { name: '지역 후원 계약', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '캠페인', exact: true }).click();
  await page.getByRole('button', { name: '캠페인 시작', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '4라운드 남음' })).toBeVisible();
  // The market is a tab of 사람.
  await page.getByRole('button', { name: '선수·스태프', exact: true }).click();
  await peopleTab('이적시장').click();
  await expect(peopleTab('이적시장')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/people\?view=market$/);
  await page.getByRole('button', { name: '자유계약 영입', exact: true }).click();
  await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toContainText(
    '선수단 정원 19/26',
  );
  await peopleTab('선수').click();
  await expect(page.getByText('선수단 19/26', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  await page.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  // A closed season no longer interrupts: its review waits in the league's season list.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' })).toHaveCount(0);
  await page.getByRole('button', { name: '리그', exact: true }).first().click();
  await chooseOption(page.getByRole('combobox', { name: '리그 시즌', exact: true }), '1950');
  await expect(page.getByTestId('season-review')).toBeVisible();
  await expect(page.getByTestId('season-move')).toBeVisible();
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
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).click();
  await page.getByRole('tab', { name: '시즌 기록', exact: true }).click();
  await chooseOption(page.getByRole('combobox', { name: '기록 시즌', exact: true }), '1950');
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '지난 경기 상세' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await download;
  const raw = readFileSync((await file.path())!);
  expect(JSON.parse(raw.toString()).codec).toBe('gzip-cjk14');
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  await page.getByRole('button', { name: '한 라운드 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page
    .getByRole('dialog', { name: '시즌 상세와 클럽 소식' })
    .getByRole('button', { name: '창 닫기' })
    .click();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: raw });
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '기록 교체하고 가져오기' }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
});
test('browses every historical regional group and resets filters on country changes', async ({
  page,
}) => {
  await page.goto('/');
  await chooseOption(page.getByRole('combobox', { name: '창단 국가', exact: true }), 'ITA');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('historical-regional-groups');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  await page.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  // Other leagues' past tables live on the league page, never in the records room (→WEB-54).
  await page.getByRole('button', { name: '리그', exact: true }).first().click();
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
