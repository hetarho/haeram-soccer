import { expect, test } from '@playwright/test';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { initializeReadModels, refreshReadModels } from '../../packages/engine/src/read-models';
import { importResponsibilityCareer } from './responsibility-fixtures';

// Synthetic transfer facts exercise stored paging, without simulating decades in a browser.
test('reads stored older news by page and category after saving and reloading', async ({
  page,
}) => {
  const w = careerWorld({ country: 'ENG', seed: 'news-journal' });
  w.settings!.mode = 'manual';
  initializeReadModels(w);
  for (let n = 1; n <= 80; n++)
    w.events.push({
      year: w.year,
      round: n % 46,
      kind: 'transfer-in',
      title: `기록선수 ${n}`,
      detail: '합성 이적 기록',
    });
  refreshReadModels(w);
  await importResponsibilityCareer(page, w);
  await expect(page.getByTestId('communications-button')).toHaveAttribute(
    'aria-label',
    /새 소식 80개/,
  );
  await page.getByTestId('communications-button').click();
  const sheet = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await sheet.getByRole('tab', { name: /^뉴스/ }).click();
  await expect(sheet.getByTestId('news-item')).toHaveCount(50);
  await sheet.getByRole('button', { name: '이전 소식 더 보기' }).click();
  await expect(sheet.getByTestId('news-item')).toHaveCount(80);
  await expect(sheet.getByRole('button', { name: '이전 소식 더 보기' })).toHaveCount(0);
  await sheet.getByRole('button', { name: '이적', exact: true }).click();
  await expect(sheet.getByTestId('news-item')).toHaveCount(50);
  await sheet.getByRole('button', { name: '이전 소식 더 보기' }).click();
  await expect(sheet.getByTestId('news-item')).toHaveCount(80);
  const first = sheet.getByTestId('news-item').first();
  const title = await first.locator('strong').innerText();
  const detail = await first.locator('small').innerText();
  await sheet.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByTestId('communications-button').click();
  await page.getByRole('tab', { name: /^뉴스/ }).click();
  await expect(page.getByTestId('news-item')).toHaveCount(50);
  const reloaded = page.getByTestId('news-item').first();
  await expect(reloaded.locator('strong')).toHaveText(title);
  await expect(reloaded.locator('small')).toHaveText(detail);
  await expect(reloaded.locator('em')).toHaveCount(0);
});
