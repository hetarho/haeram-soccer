import { expect, test } from '@playwright/test';
import { openClubRecords, openCups, openLeague, resumeLeague } from './competition-navigation';
import { chooseOption } from './select';

test('competition hubs preserve selectors, legacy addresses, browser history and reloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단 →', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByRole('button', { name: '잉글랜드 컵 현재 대회 보기', exact: true }).click();
  await expect(page).toHaveURL(/season\?competition=cup.*cup=cup/);
  await expect(page.getByRole('region', { name: '잉글랜드 컵', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await openLeague(page);
  const leagueTab = await page.getByRole('tab', { name: '리그', exact: true }).boundingBox();
  const countrySelect = await page
    .getByRole('combobox', { name: '국가', exact: true })
    .boundingBox();
  expect(Math.abs(leagueTab!.y - countrySelect!.y)).toBeLessThanOrEqual(2);
  await chooseOption(page.getByRole('combobox', { name: '국가', exact: true }), 'GER');
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  await expect(page).toHaveURL(/competition=league.*view=players.*league=GER\.0\.0/);
  const leagueAddress = page.url();
  const home = page
    .getByRole('navigation', { name: '모바일 게임 메뉴', exact: true })
    .getByRole('button', { name: '클럽하우스', exact: true });
  await home.click();
  await expect(page).toHaveURL(/\/journal$/);
  await resumeLeague(page);
  await expect(page).toHaveURL(leagueAddress);
  await expect(page.getByRole('combobox', { name: '국가', exact: true })).toHaveAttribute(
    'data-value',
    'GER',
  );
  await expect(page.getByRole('tab', { name: '선수 기록', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await openCups(page);
  await chooseOption(page.getByRole('combobox', { name: '국내 컵 국가', exact: true }), 'POR');
  await expect(page.getByRole('region', { name: '포르투갈 컵', exact: true })).toBeVisible();
  const cupAddress = page.url();
  await openLeague(page);
  await expect(page).toHaveURL(leagueAddress);
  await page.goBack();
  await expect(page).toHaveURL(cupAddress);
  await expect(page.getByRole('combobox', { name: '국내 컵 국가', exact: true })).toHaveAttribute(
    'data-value',
    'POR',
  );
  await page.goForward();
  await expect(page).toHaveURL(leagueAddress);
  // A separate fresh current-league entry deliberately selects our competition.
  await home.click();
  await expect(page).toHaveURL(/\/journal$/);
  await openLeague(page);
  await expect(page.getByRole('combobox', { name: '국가', exact: true })).toHaveAttribute(
    'data-value',
    'ENG',
  );
  await expect(page).not.toHaveURL(leagueAddress);
  await openClubRecords(page);
  await expect(page.getByRole('table', { name: '시즌별 기록', exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/leagues?season=1940&league=GER.0.0&view=players&detail=trend');
  await expect(page).toHaveURL(
    /history\?section=league.*season=1940.*league=GER\.0\.0.*view=players.*detail=trend/,
  );
  await expect(page.getByText('선택한 시즌의 기록이 없어요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '이전 리그 기록', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.getByText('선택한 시즌의 기록이 없어요.', { exact: true })).toBeVisible();
  // A legacy explicit current year belongs to Season and keeps its competition and lens.
  await page.goto('/leagues?season=1950&league=GER.0.0&view=teams');
  await expect(page).toHaveURL(/season\?competition=league.*league=GER\.0\.0.*view=teams/);
  await expect(page.getByRole('tab', { name: '팀 기록', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goto('/europe?competition=cup&period=history&season=1940&country=GER');
  await expect(page).toHaveURL(/history\?section=cup.*season=1940.*country=GER.*cup=cup/);
  await expect(page.getByRole('tab', { name: '독일 컵', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: '국내 컵 국가', exact: true })).toHaveAttribute(
    'data-value',
    'GER',
  );
  await expect(page.getByRole('region', { name: '컵 대회 역사', exact: true })).toContainText(
    '아직 기록된 대회가 없어요.',
  );
  await expect(
    page
      .getByRole('navigation', { name: '모바일 게임 메뉴', exact: true })
      .getByRole('button', { name: '클럽하우스', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});
