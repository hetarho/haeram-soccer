import { watchNext } from './watch';
import { delegateSales } from './events';
import { chooseOption } from './select';
import { expect, test } from '@playwright/test';
import { horizontalOverflow } from './layout';

test.use({ viewport: { width: 390, height: 844 } });

test('opens an own match material from its report and from the fixture notebook', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  await watchNext(page);
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  const report = page.getByRole('region', { name: '경기 분석 리포트', exact: true });
  await expect(report).toBeVisible();
  const date = await page.getByTestId('game-date').innerText();

  // From the final analysis (→WEB-84): four tabs on the 1.9:1 pitch, the shot map first.
  await report.getByRole('button', { name: '경기 자료', exact: true }).click();
  const material = report.getByRole('region', { name: '경기 자료', exact: true });
  const tabs = material.getByRole('tablist', { name: '경기 자료 보기' }).getByRole('tab');
  await expect(tabs).toHaveText(['슛 지도', '히트맵', '패스 연결망', '전술 해설']);
  expect(await material.getByTestId('shot-dot').count()).toBeGreaterThan(0);
  const pitch = material.getByTestId('material-pitch');
  const box = (await pitch.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1.9, 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // A tap names the cell under it.
  await tabs.nth(1).click();
  await expect(material.getByRole('combobox', { name: '히트맵 대상' })).toBeVisible();
  await material
    .getByTestId('material-pitch')
    .click({ position: { x: box.width * 0.5, y: box.height * 0.2 } });
  await expect(material.locator('figcaption')).toContainText('왼쪽 측면');
  await chooseOption(material.getByRole('combobox', { name: '히트맵 대상' }), 'opponent');
  await expect(material).toContainText('상대 팀 · 터치');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await tabs.nth(2).click();
  await expect(material).toContainText('선 굵기 = 두 선수 사이 성공 패스');
  await tabs.nth(3).click();
  await expect(material).toContainText('세트피스');
  await expect(material.getByRole('table')).toContainText('되찾기');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // From a completed row of the own fixture notebook.
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '리그', exact: true })
    .click();
  await page.getByRole('tab', { name: '일정·결과', exact: true }).click();
  await page
    .getByRole('group', { name: '일정·결과 보기' })
    .getByRole('button', { name: '우리 경기', exact: true })
    .click();
  await page.getByText('우리 팀 일정 노트', { exact: true }).click();
  const notebook = page.getByRole('region', { name: '우리 팀 일정 노트', exact: true });
  await chooseOption(
    notebook.getByRole('combobox', { name: '일정 진행 상태', exact: true }),
    'completed',
  );
  await notebook.getByRole('button', { name: '경기 자료', exact: true }).first().click();
  const sheet = page.getByRole('dialog', { name: '일정 경기 자료' });
  await expect(sheet.getByRole('tab')).toHaveCount(4);
  expect(await sheet.getByTestId('shot-dot').count()).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
  // Reading the material changes nothing in the world.
  await expect(page.getByTestId('game-date')).toHaveText(date);
});
