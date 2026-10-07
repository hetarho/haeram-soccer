import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('operates a club, reads a season and exports/imports the actual save', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세계 생성 시드').fill('ui-management');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByRole('button', { name: '감독실', exact: true }).click();
  await page.getByLabel('요청 전술').selectOption('counter');
  await page.getByLabel('요청 말투').selectOption('evidence');
  await page.getByRole('button', { name: '감독에게 제안하기' }).click();
  await expect(page.getByText(/역습 요청 ·/).first()).toBeVisible();
  await page.getByRole('button', { name: '클럽 경영', exact: true }).click();
  await page.getByRole('button', { name: '후원 계약', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '후원 계약', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '캠페인 시작', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '4라운드 남음' })).toBeVisible();
  await page.getByRole('button', { name: '선수와 영입', exact: true }).click();
  await page.getByRole('button', { name: '이적 시장', exact: true }).click();
  await page.getByRole('button', { name: '선수 영입', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '우리 선수단 · 19/26' })).toBeVisible();
  await page.getByRole('button', { name: '클럽 일지', exact: true }).click();
  await page.getByRole('button', { name: '시즌 마무리' }).click();
  await expect(page.getByTestId('calendar')).toHaveText('시즌 1902 · 라운드 0');
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.getByRole('button', { name: '역사 보관함', exact: true }).click();
  await page.getByLabel('기록 시즌').selectOption('1901');
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '지난 경기 상세' })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기' }).click();
  await expect(page.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await download;
  const raw = readFileSync((await file.path())!);
  expect(JSON.parse(raw.toString()).codec).toBe('gzip-base64');
  await page.getByRole('button', { name: '클럽 일지', exact: true }).click();
  await page.getByRole('button', { name: '다음 라운드', exact: true }).click();
  await expect(page.getByTestId('calendar')).toContainText('라운드 1');
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: raw });
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '기록 교체하고 가져오기' }).click();
  await expect(page.getByTestId('calendar')).toHaveText('시즌 1902 · 라운드 0');
});
