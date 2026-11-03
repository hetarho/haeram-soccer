import { expect, test } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/founding';
import { initializeReadModels, refreshReadModels } from '../../packages/engine/src/read-models';
import { importResponsibilityCareer } from './responsibility-fixtures';

// Synthetic transfer facts exercise stored paging, without simulating decades in a browser.
test('reads stored older news by page and category after saving and reloading', async ({
  page,
}) => {
  const w = createWorld({
    country: 'ENG',
    name: 'News Archive',
    color: '#223344',
    seed: 'news-journal',
    level: 'easy',
  });
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
  const first = await sheet.getByTestId('news-item').first().innerText();
  await sheet.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByTestId('communications-button').click();
  await page.getByRole('tab', { name: /^뉴스/ }).click();
  await expect(page.getByTestId('news-item')).toHaveCount(50);
  // Read markers may change; the stored title and detail remain.
  await expect(page.getByTestId('news-item').first()).toContainText(first.replace('NEW', ''));
});
