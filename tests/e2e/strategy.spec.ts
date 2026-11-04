import { expect, test } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { openDirectionInForce } from './office';
import { startCareer } from './start';
import { importLegacyDirection } from './legacy-direction';

test('reads the direction taken over with, every row named and none editable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // A saved preset remains effective after new takeovers stop offering the choice.
  await importLegacyDirection(page, 'local-pride');
  await openDirectionInForce(page);
  const areas = page.getByTestId('direction-areas');
  // The owner reads a direction, never a "build" (빌드업 is the football phase of play).
  await expect(areas).not.toContainText(/빌드(?!업)/);
  await expect(areas.getByRole('heading', { level: 3 })).toHaveText('구단 방향 · 유스 순혈주의');
  // 재정·투자 reads the areas whose investment and staff rows spend money (→WEB-14, WEB-110): each
  // card, dial, the ticket price and staff row named with the option the club holds.
  const rows: [string, [string, string][]][] = [
    [
      '재정',
      [
        ['수익 모델', '회원제 운영'],
        ['재정 기조', '신중'],
        ['선수단 투자', '표준'],
        ['재계약 기조', '모두 붙잡기'],
      ],
    ],
    [
      '지역',
      [
        ['지역 관계 방식', '지역 밀착'],
        ['주변 투자', '지역 상권 투자'],
        ['풀뿌리 유망주 투자', '지역 리그 후원'],
        ['티켓 가격', '저렴'],
      ],
    ],
    [
      '글로벌',
      [
        ['해외 마케팅', '입소문'],
        ['해외 스카우트망', '없음'],
        ['해외 투어', '안 함'],
      ],
    ],
    [
      '유소년',
      [
        ['유입 방식', '성골 유스'],
        ['육성 목표', '1군 공급'],
        ['데뷔 시점', '표준'],
        ['유소년 투자', '기본 운영'],
      ],
    ],
  ];
  for (const [name, lines] of rows) {
    const area = areas.getByRole('region', { name, exact: true });
    await expect(area.locator('[data-row]')).toHaveCount(lines.length);
    for (const [label, value] of lines)
      await expect(area.locator('[data-row]').filter({ hasText: label })).toContainText(value);
  }
  // 지역 and 글로벌 name the base their rows build; the takeover starts the owner's club with
  // neither (→ECON-34).
  await expect(areas.getByRole('region', { name: '지역', exact: true })).toContainText(
    '지역 기반 0',
  );
  await expect(areas.getByRole('region', { name: '글로벌', exact: true })).toContainText(
    '글로벌 인지도 0',
  );
  // Nothing edits the direction in a career: no control, draft, saved direction or composer.
  await expect(areas.getByRole('button')).toHaveCount(0);
  await expect(areas.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByText('구단 전체 방향·저장 설정')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /방향 만들기|지금 방향 저장/ })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 1280, height: 800 },
]) {
  test(`keeps the direction in force readable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page);
    await openDirectionInForce(page);
    const areas = page.getByTestId('direction-areas');
    await expect(areas.getByRole('heading', { level: 3 })).toHaveText('구단 방향 · 기본 방향');
    await expect(areas.locator('[data-area]')).toHaveCount(4);
    await expect(areas.locator('[data-row="ticket"]')).toContainText('보통');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
