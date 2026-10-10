import { expect, test } from '@playwright/test';
import { stopOnlyFor } from './events';
import { horizontalOverflow } from './layout';

test('combines build cards from a preset, previews synergies and commits once a season', async ({
  page,
}) => {
  await stopOnlyFor(page, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영', exact: true })
    .click();
  const board = page.getByTestId('build-board');
  await expect(board).toContainText('15,625가지 조합');
  // Six slots, each a standard card plus four choices.
  await expect(board.locator('[data-slot]')).toHaveCount(6);
  for (const slot of await board.locator('[data-slot]').all())
    await expect(slot.getByRole('radio')).toHaveCount(5);

  // A preset fills its slots; the owner then changes single cards.
  await board.getByRole('button', { name: /유스 명가/ }).click();
  await expect(board.getByRole('radio', { name: '유스 정책 성골 유스' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await board.getByRole('radio', { name: '홈·팬 지역 밀착' }).click();
  await board.getByRole('radio', { name: '라커룸 문화 가족 같은 클럽' }).click();
  const summary = board.locator('[aria-live="polite"]');
  await expect(summary).toContainText('확정하면');
  await expect(summary).toContainText('맞춤 빌드');
  await expect(summary).toContainText('유스 입단 +1명');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('확정하면 발동');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await summary.getByRole('button', { name: '이 빌드로 확정' }).click();
  await expect(summary).toContainText('지금 빌드');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('발동 중');
  // A second change waits for next season.
  await board.getByRole('radio', { name: '수익 모델 상업 확장' }).click();
  await expect(
    summary.getByRole('button', { name: '빌드는 시즌마다 한 번만 바꿀 수 있어요' }),
  ).toBeDisabled();
  await summary.getByRole('button', { name: '되돌리기' }).click();
  await expect(board.getByRole('radio', { name: '수익 모델 기본' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});
