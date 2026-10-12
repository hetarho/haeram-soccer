import { expect, test } from '@playwright/test';
import { stopOnlyFor } from './events';
import { horizontalOverflow } from './layout';

test('picks a preset strategy, saves its own strategy on the device and commits once a season', async ({
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
  await expect(page.getByRole('tab', { name: '운영 전략' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const board = page.getByTestId('strategy-board');
  // The owner reads a strategy, never a "build" (빌드업 is the football phase of play).
  await expect(board).not.toContainText(/빌드(?!업)/);
  await expect(board.getByTestId('current-strategy')).toHaveText('기본 전략');
  const presets = board.getByRole('region', { name: '추천 전략' }).getByRole('button');
  await expect(presets).toHaveCount(5);
  // Dials sit in their own section, grouped by area.
  const dials = board.getByRole('region', { name: '운영 다이얼' });
  for (const name of ['선수단 투자', '훈련 방향', '영입 기조', '유소년 투자', '마케팅'])
    await expect(dials.getByRole('radiogroup', { name })).toBeVisible();

  // A preset opens a draft that states what it lights before it counts.
  await board.getByRole('button', { name: /동네의 자부심/ }).click();
  const draft = board.getByTestId('strategy-draft');
  await expect(draft).toContainText('확정하면');
  await expect(draft).toContainText('동네의 자부심');
  await expect(draft).toContainText('시너지 우리 동네 아이들 발동');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('확정하면 발동');
  await draft.getByRole('button', { name: '되돌리기' }).click();
  await expect(draft).toHaveCount(0);

  // The owner composes and names a strategy of their own.
  await board.getByRole('button', { name: '＋ 나만의 전략 만들기' }).click();
  const composer = page.getByRole('dialog', { name: '나만의 전략 만들기' });
  await expect(composer.locator('[data-slot]')).toHaveCount(6);
  for (const slot of await composer.locator('[data-slot]').all())
    await expect(slot.getByRole('radio')).toHaveCount(5);
  await composer.getByRole('radio', { name: '유스 정책 성골 유스' }).click();
  await composer.getByRole('radio', { name: '홈·팬 지역 밀착' }).click();
  await composer.getByRole('radio', { name: '라커룸 문화 가족 같은 클럽' }).click();
  await expect(composer).toContainText('시너지 우리 동네 아이들');
  // A name is required; the last control stays reachable inside the sheet.
  await composer.getByRole('button', { name: '저장' }).click();
  await expect(composer).toBeVisible();
  await composer.getByLabel('전략 이름').fill('우리 동네 축구');
  await composer.getByRole('button', { name: '저장' }).click();
  await expect(composer).toHaveCount(0);
  const mine = board.getByRole('region', { name: '내 전략' });
  await expect(mine).toContainText('우리 동네 축구');
  await expect(mine).toContainText('성골 유스 · 지역 밀착 · 가족 같은 클럽');
  await expect(draft).toContainText('우리 동네 축구');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await draft.getByRole('button', { name: '이 전략으로 확정' }).click();
  await expect(board.getByTestId('current-strategy')).toHaveText('우리 동네 축구');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('발동 중');
  // A second change waits for next season.
  await board.getByRole('button', { name: /트레이딩 머신/ }).click();
  await expect(
    draft.getByRole('button', { name: '운영 전략은 시즌마다 한 번만 바꿀 수 있어요' }),
  ).toBeDisabled();
  await draft.getByRole('button', { name: '되돌리기' }).click();

  // The library belongs to the device: it survives a reload and edits keep its ID.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(board.getByTestId('current-strategy')).toHaveText('우리 동네 축구');
  await mine.getByRole('button', { name: '우리 동네 축구 편집' }).click();
  const editor = page.getByRole('dialog', { name: '전략 편집' });
  await editor.getByLabel('전략 이름').fill('동네 축구 2');
  await editor.getByRole('button', { name: '저장' }).click();
  await expect(mine.getByRole('button', { name: /동네 축구 2/ }).first()).toBeVisible();
  // A saved strategy with the same cards names the one in force; once deleted, the history does.
  await expect(board.getByTestId('current-strategy')).toHaveText('동네 축구 2');
  await mine.getByRole('button', { name: '동네 축구 2 삭제' }).click();
  await page
    .getByRole('dialog', { name: '전략 삭제' })
    .getByRole('button', { name: '삭제' })
    .click();
  await expect(mine).toContainText('아직 저장한 전략이 없어요');
  await expect(board.getByTestId('current-strategy')).toHaveText('우리 동네 축구');
});
