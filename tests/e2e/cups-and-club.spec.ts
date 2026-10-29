import { openPersonnel } from './personnel-navigation';
import { openClubRecords, openCups, openLeague } from './competition-navigation';
import { finishSeason } from './season-progression';
import { test, expect } from '@playwright/test';
import { chooseLevel, closeOutcome, setResponsibility } from './events';
import { chooseOption } from './select';
import { horizontalOverflow } from './layout';

async function found(page: import('@playwright/test').Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

test.describe('cups, transfer stance, coaching and club trends at 390x844', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('shows the drawn domestic cup with our tie and the road to Europe', async ({ page }) => {
    await found(page, 'cups-journey');
    await openCups(page);
    await expect(page.getByRole('combobox', { name: '컵 대회', exact: true })).toHaveAttribute(
      'data-value',
      'cup',
    );
    const cup = page.getByRole('region', { name: '잉글랜드 컵' });
    // A new amateur club enters the cup in its first round, drawn before the season starts.
    await expect(cup.getByRole('heading', { name: '1라운드' })).toBeVisible();
    await expect(cup.getByText('우리 팀')).toBeVisible();
    await expect(cup).toContainText('다음');
    await chooseOption(page.getByRole('combobox', { name: '컵 대회', exact: true }), 'ucl');
    await expect(page.getByText('1955/56 시즌에 창설돼요.', { exact: true })).toBeVisible();
    await openCups(page, true);
    await page.getByRole('tab', { name: '잉글랜드 컵', exact: true }).click();
    await expect(page.getByRole('region', { name: '컵 대회 역사' })).toContainText(
      '아직 기록된 대회가 없어요',
    );
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('switches a player transfer stance from the roster badge and sets coaching per department', async ({
    page,
  }) => {
    await found(page, 'listing-journey');
    await chooseLevel(page, 2);
    await setResponsibility(page, '스폰서 계약', 'delegated');
    await openPersonnel(page, 'players');
    const open = page.getByRole('button', { name: /이적 상태 · 협상 가능 · 바꾸기$/ });
    await expect(open.first()).toBeVisible();
    const total = await open.count();
    expect(total).toBeGreaterThan(14);
    await open.first().click();
    const sheet = page.getByRole('dialog', { name: '이적 상태' });
    await expect(sheet.getByRole('radio', { name: /협상 가능/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sheet.getByRole('radio', { name: /이적 명단 · 적극 매도/ })).toContainText(
      '첫 제안까지 평균 약',
    );
    await expect(sheet.getByRole('radio', { name: /이적 불가/ })).toContainText('150%');
    await sheet.getByRole('radio', { name: /이적 명단 · 적극 매도/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: /이적 상태 · 이적 명단 · 바꾸기$/ })).toHaveCount(
      1,
    );
    await closeOutcome(page, '선수의 이적 상태를 바꿨어요');
    await open.first().click();
    await page
      .getByRole('dialog', { name: '이적 상태' })
      .getByRole('radio', { name: /이적 불가/ })
      .click();
    await expect(page.getByRole('button', { name: /이적 상태 · 이적 불가 · 바꾸기$/ })).toHaveCount(
      1,
    );
    await expect(open).toHaveCount(total - 2);
    await closeOutcome(page, '선수의 이적 상태를 바꿨어요');
    expect(await horizontalOverflow(page)).toBe(0);

    // Below level 3 the owner hires coaches himself; 코치진 names the 코치 기조 the staff would
    // follow and each department shows whom it would hire (→STAFF-15). The coaches are a tab of 사람.
    await openPersonnel(page, 'coaches');
    await expect(page.getByTestId('coaching-mode')).toContainText('직접');
    const staff = page.getByRole('region', { name: '스태프', exact: true });
    await expect(staff.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByTestId('decision-owner-staff')).toContainText(
      '아래 방침은 이 업무를 위임할 때 사용해요.',
    );
    await expect(page.getByTestId('coach-pick-attack')).toBeHidden();
    await staff
      .locator('[data-role="attack"]')
      .getByText('담당 업무·추천 후보', { exact: true })
      .click();
    await expect(page.getByTestId('coach-pick-attack')).toBeVisible();
    await expect(page.getByTestId('coach-pick-attack')).toContainText('코치 기조로 뽑는다면');
    await page.getByText('스태프 선임 기준', { exact: true }).click();
    // The 코치 기조 line opens its area on the 방향 board, where it is chosen like any row.
    await page.getByRole('button', { name: /^코치 기조 · 표준/ }).click();
    const staffArea = page
      .getByRole('dialog', { name: '스태프 업무 기준', exact: true })
      .getByRole('region', { name: '스태프', exact: true });
    await expect(staffArea.locator('button[aria-controls^="sheet-area-body-"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await staffArea.getByRole('radio', { name: '코치 기조 최고 수준', exact: true }).click();
    const draft = page.getByTestId('strategy-draft');
    await expect(draft).toContainText('코치 기조 표준 → 최고 수준');
    await draft.getByRole('button', { name: '적용', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '스태프 업무 기준', exact: true })).toHaveCount(
      0,
    );
    await closeOutcome(page, '방향을 바꿨어요');
    await openPersonnel(page, 'players');
    await openPersonnel(page, 'coaches');
    await page.getByText('스태프 선임 기준', { exact: true }).click();
    await expect(page.getByRole('button', { name: /^코치 기조 · 최고 수준/ })).toBeVisible();
    // Level 3 hands every department to the staff at once.
    await chooseLevel(page, 3);
    await expect(page.getByTestId('coaching-mode')).toContainText('자동');
    await expect(page.getByTestId('decision-owner-staff')).toContainText('자동');
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('rates every league club and opens any club from the table', async ({ page }) => {
    await found(page, 'rivals-journey');
    await openLeague(page);
    await page.getByRole('tab', { name: '순위표', exact: true }).click();
    const table = page.getByRole('table', { name: '리그 순위표' });
    await expect(table.getByRole('columnheader', { name: 'OVR' })).toBeVisible();
    await table
      .getByRole('button', { name: /팀 정보$/ })
      .nth(1)
      .click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('클럽 Elo');
    await expect(sheet).toContainText('서포터');
    await expect(sheet).toContainText('OVR');
    await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
    // The cup opens as a list in its mass first round; the tree waits for the last 32.
    await openCups(page);
    const switcher = page.getByRole('group', { name: '대진 보기' });
    await expect(switcher.getByRole('button', { name: '라운드별' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await switcher.getByRole('button', { name: '대진표' }).click();
    await expect(page.getByText(/32강부터 대진표가 채워지고/)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('opens the team sheet of a club in our cup tie and stacks sheets over sheets', async ({
    page,
  }) => {
    await found(page, 'club-links-journey');
    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    await openCups(page);
    const tie = page
      .getByRole('region', { name: '잉글랜드 컵' })
      .getByRole('listitem')
      .filter({ hasText: '우리 팀' })
      .first();
    // Both clubs of the tie open their sheets; ours is Haeram Athletic.
    await expect(tie.getByRole('button', { name: /팀 정보$/ })).toHaveCount(2);
    const rival = tie
      .getByRole('button', { name: /팀 정보$/ })
      .filter({ hasNotText: 'Haeram Athletic' });
    const name = (await rival.textContent())!.trim();
    await expect(rival).toHaveAccessibleName(`${name} 팀 정보`);
    await rival.click();
    const sheet = page.getByRole('dialog', { name, exact: true });
    await expect(sheet).toContainText('클럽 Elo');
    await expect(sheet).toContainText('리그 순위');
    await expect(sheet).toContainText('OVR');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);

    // A club named inside another sheet opens on top of it; Escape closes only the top one.
    await nav.getByRole('button', { name: '클럽하우스', exact: true }).click();
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '클럽 소식·시즌 브리핑', exact: true })
      .click();
    const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
    const club = journal
      .getByRole('table', { name: '리그 순위표' })
      .getByRole('button', { name: /팀 정보$/ })
      .nth(1);
    const clubName = (await club.getAttribute('aria-label'))!.replace(/ 팀 정보$/, '');
    await club.click();
    const stacked = page.getByRole('dialog', { name: clubName, exact: true });
    await expect(stacked).toContainText('클럽 Elo');
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(stacked).toHaveCount(0);
    await expect(journal).toBeVisible();
    await expect(club).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('keeps the transfer market as a 사람 tab with its own address', async ({ page }) => {
    await found(page, 'market-segment-journey');
    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    await openPersonnel(page, 'players');
    const tabs = page.getByRole('tablist', { name: '감독 사무실' });
    await expect(tabs.getByRole('tab')).toHaveText(['감독', '선수 목록', '이적시장']);
    await tabs.getByRole('tab', { name: '이적시장', exact: true }).click();
    await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: '이적시장' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(nav.getByRole('button', { name: '감독 사무실', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page).toHaveURL(/\/first-team\?view=market$/);
    expect(await horizontalOverflow(page)).toBe(0);
    // The market's address reopens 사람 on the market.
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(tabs.getByRole('tab', { name: '이적시장' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await tabs.getByRole('tab', { name: '선수 목록', exact: true }).click();
    await expect(page.getByText('선수단 20/40', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/first-team\?view=players$/);
    // The older market address lands there too, replaced in the address bar.
    await page.goto('/transfers');
    await expect(tabs.getByRole('tab', { name: '이적시장' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/\/first-team\?view=market$/);
  });

  test('replays a closed season of the cup: its bracket, our road, a report and the honours', async ({
    page,
  }) => {
    // Plays a whole season; slow CI browsers need longer.
    test.slow();
    await found(page, 'cup-history-journey');
    await finishSeason(page);
    await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
    await expect(page.getByTestId('game-round')).toHaveText('0');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '시즌 진행 도구' })).toHaveCount(0);
    await openCups(page);
    await openCups(page, true);
    const history = page.getByRole('region', { name: '컵 대회 역사' });
    const picker = history.getByRole('group', { name: '컵 시즌 선택' });
    await expect(picker.getByRole('combobox', { name: '대진표 시즌' })).toHaveText(/1950\/51/);
    await expect(picker.getByRole('button', { name: '이전 컵 시즌' })).toBeDisabled();
    // The closed season's bracket opens as a tree from the last 32 to the final.
    await expect(history.getByRole('group', { name: '대진 보기' })).toBeVisible();
    const tree = history.getByRole('group', { name: '대진표', exact: true });
    await expect(tree.getByRole('heading', { name: '32강', exact: true })).toBeVisible();
    await expect(tree.getByRole('heading', { name: '결승', exact: true })).toBeVisible();
    // A new amateur club enters in the first round, before the bracket's last 32.
    const journey = history.getByRole('region', { name: '우리 클럽의 컵 여정' });
    await expect(journey).toContainText('1라운드');
    await journey
      .getByRole('button', { name: /경기 리포트$/ })
      .first()
      .click();
    const report = page.getByRole('dialog', { name: '컵 경기 리포트' });
    await expect(report.getByRole('region', { name: '경기 분석 리포트' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(report).toHaveCount(0);
    const honours = history.getByRole('table', { name: '클럽별 우승 기록' });
    await expect(honours.locator('tbody tr').first().locator('td').nth(1)).toHaveText('1');
    await expect(
      history.getByRole('button', { name: '1950/51 대진 보기', exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('charts league position, Elo and values in the records room', async ({ page }) => {
    await found(page, 'trends-journey');
    await openClubRecords(page);
    // The season table is a part of 요약; the charts show one at a time on 추이.
    await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
    await expect(page.getByRole('table', { name: '시즌별 기록' })).toBeVisible();
    await page.getByRole('tab', { name: '구단 성장', exact: true }).click();
    const metrics = page.getByRole('group', { name: '추이 지표' });
    for (const [metric, heading] of [
      ['리그 위치', '리그 위치'],
      ['Elo', '클럽 Elo'],
      ['선수단 가치', '선수단 가치'],
      ['구단 가치', '구단 가치'],
    ]) {
      await metrics.getByRole('button', { name: metric, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: /^(리그 위치|클럽 Elo|선수단 가치|구단 가치)$/ }),
      ).toHaveCount(1);
    }
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
