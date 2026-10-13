import { expect, test } from '@playwright/test';
import { horizontalOverflow } from './layout';

test('applies a preset at once, changes it again at once, and saves its own strategy', async ({
  page,
}) => {
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
  // One board: six area rows, each its card row beside the dials that spend on it (→ECON-25).
  // No separate dial list, no training dial (훈련 owns the focus) and no manager-style card.
  const areas: [string, string, string[]][] = [
    ['선수단', '라커룸 문화', ['선수단 투자']],
    ['영입', '스카우팅', ['영입 기조']],
    ['매각', '매각 기조', []],
    ['유소년', '유스 정책', ['유소년 투자']],
    ['수익', '수익 모델', ['마케팅']],
    ['홈·팬', '홈·팬', ['티켓 가격']],
  ];
  await expect(board.locator('[data-area]')).toHaveCount(6);
  for (const [area, slot, dials] of areas) {
    const row = board.getByRole('region', { name: area, exact: true });
    await expect(
      row.getByRole('radiogroup', { name: slot, exact: true }).getByRole('radio'),
    ).toHaveCount(5);
    await expect(row.getByRole('radiogroup')).toHaveCount(1 + dials.length);
    for (const dial of dials)
      await expect(row.getByRole('radiogroup', { name: dial, exact: true })).toBeVisible();
  }
  await expect(board.getByRole('region', { name: '운영 다이얼' })).toHaveCount(0);
  await expect(board.getByRole('radiogroup', { name: '훈련 방향' })).toHaveCount(0);
  await expect(board).not.toContainText('감독 성향');

  // A preset and a dial step make one draft; the pinned bar states what it lights and costs.
  await board.getByRole('button', { name: /동네의 자부심/ }).click();
  const draft = board.getByTestId('strategy-draft');
  await expect(draft).toContainText('적용하면');
  await expect(draft).toContainText('동네의 자부심');
  await expect(draft).toContainText('시너지 우리 동네 아이들 발동');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('적용하면 발동');
  const squad = board.getByRole('region', { name: '선수단', exact: true });
  const generous = squad.getByRole('radio', { name: '선수단 투자 후한 지원', exact: true });
  await generous.click();
  await expect(draft).toContainText('선수단 투자 표준 → 후한 지원');
  await expect(draft).toContainText('라운드마다');
  await expect(draft).toContainText('시즌 말 예상 자금');
  await expect(draft).toContainText('7건 변경');
  // A draft is not in force until 적용.
  await expect(generous).toHaveAttribute('aria-checked', 'false');
  await expect(board.getByTestId('current-strategy')).toHaveText('기본 전략');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // 적용 acts at once: the strategy and the dial are in force, and no card is locked (→ECON-22).
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(board.getByTestId('current-strategy')).toHaveText('동네의 자부심');
  await expect(generous).toHaveAttribute('aria-checked', 'true');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('발동 중');
  const youth = board.getByRole('region', { name: '유소년', exact: true });
  await expect(page.getByText(/에 변경 가능/)).toHaveCount(0);
  await expect(youth.getByRole('radio', { name: '유스 정책 성골 유스' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(youth.getByRole('radio', { name: '유스 정책 1군 직행 경로' })).toBeEnabled();
  await expect(youth.getByRole('radio', { name: '유소년 투자 집중 투자' })).toBeEnabled();

  // A second preset applies at once too, the same day; there is no reservation.
  await board.getByRole('button', { name: /트레이딩 머신/ }).click();
  await expect(page.getByRole('button', { name: '다음 시즌부터 적용' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예약 취소' })).toHaveCount(0);
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(board.getByTestId('current-strategy')).toHaveText('트레이딩 머신');
  // And back again.
  await board.getByRole('button', { name: /동네의 자부심/ }).click();
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(board.getByTestId('current-strategy')).toHaveText('동네의 자부심');

  // The strategy in force is saved to the device library under the owner's name.
  await board.getByRole('button', { name: '지금 전략 저장' }).click();
  const saving = page.getByRole('dialog', { name: '지금 전략 저장' });
  await expect(saving.getByRole('radio', { name: '유스 정책 성골 유스' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // A name is required; the last control stays reachable inside the sheet.
  await saving.getByRole('button', { name: '저장', exact: true }).click();
  await expect(saving).toBeVisible();
  await saving.getByLabel('전략 이름').fill('우리 동네 축구');
  await saving.getByRole('button', { name: '저장', exact: true }).click();
  await expect(saving).toHaveCount(0);
  const mine = board.getByRole('region', { name: '내 전략' });
  await expect(mine).toContainText('우리 동네 축구');
  await expect(mine).toContainText(
    '성골 유스 · 지역 인재 우선 · 핵심 지키기 · 회원제 운영 · 지역 밀착 · 가족 같은 클럽',
  );
  await expect(board.getByRole('button', { name: '지금 전략 저장' })).toHaveCount(0);
  await expect(draft).toHaveCount(0);

  // The composer saves a strategy of its own and puts it on the board as a draft, ready to apply
  // at once like any other.
  await board.getByRole('button', { name: '＋ 나만의 전략 만들기' }).click();
  const composer = page.getByRole('dialog', { name: '나만의 전략 만들기' });
  await expect(composer.locator('[data-slot]')).toHaveCount(6);
  for (const slot of await composer.locator('[data-slot]').all())
    await expect(slot.getByRole('radio')).toHaveCount(5);
  await composer.getByRole('radio', { name: '유스 정책 1군 직행 경로' }).click();
  await composer.getByLabel('전략 이름').fill('젊은 피');
  await composer.getByRole('button', { name: '이 전략으로 적용' }).click();
  await expect(composer).toHaveCount(0);
  await expect(mine).toContainText('젊은 피');
  await expect(draft).toContainText('젊은 피');
  await expect(draft.getByRole('button', { name: '적용', exact: true })).toBeEnabled();
  await draft.getByRole('button', { name: '되돌리기' }).click();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The library belongs to the device: it survives a reload and edits keep its ID.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(board.getByTestId('current-strategy')).toHaveText('동네의 자부심');
  await expect(generous).toHaveAttribute('aria-checked', 'true');
  await mine.getByRole('button', { name: '우리 동네 축구 편집' }).click();
  const editor = page.getByRole('dialog', { name: '전략 편집' });
  await editor.getByLabel('전략 이름').fill('동네 축구 2');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(mine.getByRole('button', { name: /동네 축구 2/ }).first()).toBeVisible();
  // Deleting a saved strategy never changes the one in force.
  await mine.getByRole('button', { name: '동네 축구 2 삭제' }).click();
  await page
    .getByRole('dialog', { name: '전략 삭제' })
    .getByRole('button', { name: '삭제' })
    .click();
  await expect(mine).not.toContainText('동네 축구 2');
  await expect(mine).toContainText('젊은 피');
  await expect(board.getByTestId('current-strategy')).toHaveText('동네의 자부심');
});
