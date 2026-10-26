import { expect, test } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';
import { leaveOffice, openOfficeArea } from './office';

test('applies a preset at once, changes it again at once, and saves its own strategy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await openOfficeArea(page, '운영 방침');
  const board = page.getByTestId('strategy-board');
  await board.getByText('구단 전체 방침 불러오기·저장', { exact: true }).click();
  // The owner reads a strategy, never a "build" (빌드업 is the football phase of play).
  await expect(board).not.toContainText(/빌드(?!업)/);
  await expect(board.getByTestId('current-strategy')).toHaveText('기본 방향');
  const presets = board.getByRole('region', { name: '추천 방향' }).getByRole('button');
  await expect(presets).toHaveCount(7);
  // One board: eight areas by the decisions they steer, each its card row beside the dials and the
  // direction rows of the same area (→ECON-25); 스태프 and 글로벌 have rows only. No separate dial
  // list, no training dial (훈련 owns the focus).
  const areas: [string, string | undefined, string[]][] = [
    ['선수단·계약', '라커룸 문화', ['선수단 투자', '재계약 기조']],
    ['영입', '스카우팅', ['영입 기조', '단장·감독 지원']],
    ['매각', '매각 기조', []],
    ['유소년', '유입 방식', ['육성 목표', '데뷔 시점', '유소년 투자']],
    ['스태프', undefined, ['선호 학파', '감독 기조', '코치 기조']],
    ['재정', '수익 모델', ['재정 기조']],
    ['지역', '지역 관계 방식', ['주변 투자', '풀뿌리 유망주 투자', '티켓 가격']],
    ['글로벌', undefined, ['해외 마케팅', '해외 스카우트망', '해외 투어']],
  ];
  await expect(board.locator('[data-area]')).toHaveCount(8);
  // Areas start folded behind headers naming the options in force (→WEB-60).
  await expect(board.getByRole('radiogroup')).toHaveCount(0);
  await expect(board.getByTestId('area-summary-scouting')).toHaveText('표준 · 균형 · 균형');
  await expect(board.getByTestId('area-summary-market')).toHaveText('표준');
  await expect(board.getByTestId('area-summary-staff')).toHaveText('상관없음 · 표준 · 표준');
  // 지역 and 글로벌 name the base their rows build; a new club has neither yet (→ECON-34).
  await expect(board.getByTestId('area-base-local')).toHaveText('지역 기반 0');
  await expect(board.getByTestId('area-base-global')).toHaveText('글로벌 인지도 0');
  await expect(board.locator('[data-testid^="area-base-"]')).toHaveCount(2);
  for (const [area, slot, rows] of areas) {
    const row = board.getByRole('region', { name: area, exact: true });
    const head = row.locator('button[aria-controls^="board-area-body-"]');
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    // A card row, a dial and a direction row are one kind of row: a radiogroup of equal options,
    // the option in force named at the right, one detail below; a card's standard reads 표준.
    const count = (slot ? 1 : 0) + rows.length;
    await expect(row.locator('[data-row]')).toHaveCount(count);
    if (slot) {
      await expect(
        row.getByRole('radiogroup', { name: slot, exact: true }).getByRole('radio'),
      ).toHaveCount(5);
      await expect(row.getByRole('radio', { name: `${slot} 표준`, exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }
    await expect(row.getByRole('radiogroup')).toHaveCount(count);
    for (const one of rows)
      await expect(row.getByRole('radiogroup', { name: one, exact: true })).toBeVisible();
    for (const one of await row.locator('[data-row]').all()) {
      await expect(one.getByRole('heading', { level: 4 })).toHaveCount(1);
      await expect(one.getByRole('radiogroup')).toHaveCount(1);
    }
  }
  // 재정 기조 is drafted like a dial and named with what it makes the staff do.
  const finance = board.getByRole('region', { name: '재정', exact: true });
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  const draftBar = board.getByTestId('strategy-draft');
  await expect(draftBar).toContainText('재정 기조 표준 → 신중');
  await expect(draftBar).toContainText('20라운드분');
  await expect(finance.locator('button[aria-controls^="board-area-body-"]')).toContainText('초안');
  // Tapping the drafted option again takes the row out of the draft.
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  await expect(draftBar).toHaveCount(0);
  await expect(board.getByRole('region', { name: '운영 다이얼' })).toHaveCount(0);
  await expect(board.getByRole('radiogroup', { name: '훈련 방향' })).toHaveCount(0);

  // A preset drafts every row it fills (→ECON-25) and a dial step joins the same draft; the
  // pinned bar states what it lights and costs.
  await board.getByRole('button', { name: /유스 순혈주의/ }).click();
  const draft = board.getByTestId('strategy-draft');
  await expect(draft).toContainText('적용하면');
  await expect(draft).toContainText('유스 순혈주의');
  await expect(draft).toContainText('시너지 우리 동네 아이들 발동');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('적용하면 발동');
  const squad = board.getByRole('region', { name: '선수단·계약', exact: true });
  const generous = squad.getByRole('radio', { name: '선수단 투자 후한 지원', exact: true });
  await generous.click();
  // The area of a drafted row stays open and says it holds a draft.
  await expect(squad.locator('button[aria-controls^="board-area-body-"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(squad.locator('button[aria-controls^="board-area-body-"]')).toContainText('초안');
  await expect(draft).toContainText('선수단 투자 표준 → 후한 지원');
  await expect(draft).toContainText('라운드마다');
  await expect(draft).toContainText('시즌 말 예상 자금');
  // Six cards, two investment rows, the ticket, three direction rows, and the dial.
  await expect(draft).toContainText('13건 변경');
  await expect(draft).toContainText('재계약 기조 표준 → 모두 붙잡기');
  // A draft is not in force until 적용.
  await expect(generous).toHaveAttribute('aria-checked', 'false');
  await expect(board.getByTestId('current-strategy')).toHaveText('기본 방향');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // 적용 acts at once: the strategy and the dial are in force, and no card is locked (→ECON-22).
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  // The extra squad investment makes this a custom direction; its youth cards and synergy
  // remain applied. The unmodified presets below retain their actual preset names.
  await expect(board.getByTestId('current-strategy')).toHaveText('맞춤 방향');
  await expect(generous).toHaveAttribute('aria-checked', 'true');
  await expect(board.getByTestId('synergy-local-heroes')).toContainText('발동 중');
  const youth = board.getByRole('region', { name: '유소년', exact: true });
  await expect(page.getByText(/에 변경 가능/)).toHaveCount(0);
  await expect(youth.getByRole('radio', { name: '유입 방식 성골 유스' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(youth.getByRole('radio', { name: '데뷔 시점 빠른 데뷔' })).toBeEnabled();
  await expect(youth.getByRole('radio', { name: '유소년 투자 집중 투자' })).toBeEnabled();

  // A second preset applies at once too, the same day; there is no reservation.
  await board.getByRole('button', { name: /트레이딩 머신/ }).click();
  await expect(page.getByRole('button', { name: '다음 시즌부터 적용' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예약 취소' })).toHaveCount(0);
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(board.getByTestId('current-strategy')).toHaveText('트레이딩 머신');
  // And back again: a preset returns every row it does not name to its default, so the squad
  // investment set by hand goes back to 표준.
  await board.getByRole('button', { name: /유스 순혈주의/ }).click();
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(board.getByTestId('current-strategy')).toHaveText('유스 순혈주의');
  await expect(generous).toHaveAttribute('aria-checked', 'false');

  // The strategy in force is saved to the device library under the owner's name.
  await board.getByRole('button', { name: '지금 방향 저장' }).click();
  const saving = page.getByRole('dialog', { name: '지금 방향 저장' });
  await expect(saving.getByRole('radio', { name: '유입 방식 성골 유스' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // A name is required; the last control stays reachable inside the sheet.
  await saving.getByRole('button', { name: '저장', exact: true }).click();
  await expect(saving).toBeVisible();
  await saving.getByLabel('방향 이름').fill('우리 동네 축구');
  await saving.getByRole('button', { name: '저장', exact: true }).click();
  await expect(saving).toHaveCount(0);
  const mine = board.getByRole('region', { name: '내 방향' });
  await expect(mine).toContainText('우리 동네 축구');
  await expect(mine).toContainText(
    '성골 유스 · 지역 인재 우선 · 핵심 지키기 · 회원제 운영 · 지역 밀착 · 가족 같은 클럽',
  );
  await expect(board.getByRole('button', { name: '지금 방향 저장' })).toHaveCount(0);
  await expect(draft).toHaveCount(0);

  // The composer saves a strategy of its own and puts it on the board as a draft, ready to apply
  // at once like any other.
  await board.getByRole('button', { name: '＋ 방향 만들기' }).click();
  const composer = page.getByRole('dialog', { name: '방향 만들기' });
  // Every area with all its rows (→WEB-61), starting from the direction in force.
  await expect(composer.locator('fieldset[data-area]')).toHaveCount(8);
  for (const slot of [
    '유입 방식',
    '스카우팅',
    '매각 기조',
    '수익 모델',
    '지역 관계 방식',
    '라커룸 문화',
  ])
    await expect(
      composer.getByRole('radiogroup', { name: slot, exact: true }).getByRole('radio'),
    ).toHaveCount(5);
  await expect(composer.getByRole('radio', { name: '재계약 기조 모두 붙잡기' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(composer.getByRole('radiogroup', { name: '재정 기조', exact: true })).toBeVisible();
  await composer.getByRole('radio', { name: '유입 방식 엘리트 선발' }).click();
  await composer.getByLabel('방향 이름').fill('젊은 피');
  await composer.getByRole('button', { name: '이 방향으로 적용' }).click();
  await expect(composer).toHaveCount(0);
  await expect(mine).toContainText('젊은 피');
  await expect(draft).toContainText('젊은 피');
  await expect(draft.getByRole('button', { name: '적용', exact: true })).toBeEnabled();
  await draft.getByRole('button', { name: '되돌리기' }).click();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The library belongs to the device: it survives a reload and edits keep its ID.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(board.getByTestId('current-strategy')).toHaveText('유스 순혈주의');
  await squad.locator('button[aria-controls^="board-area-body-"]').click();
  await expect(squad.getByRole('radio', { name: '선수단 투자 표준', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await board.getByText('구단 전체 방침 불러오기·저장', { exact: true }).click();
  await mine.getByRole('button', { name: '우리 동네 축구 편집' }).click();
  const editor = page.getByRole('dialog', { name: '방향 편집' });
  await editor.getByLabel('방향 이름').fill('동네 축구 2');
  await editor.getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(mine.getByRole('button', { name: /동네 축구 2/ }).first()).toBeVisible();
  // Deleting a saved strategy never changes the one in force.
  await mine.getByRole('button', { name: '동네 축구 2 삭제' }).click();
  await page
    .getByRole('dialog', { name: '방향 삭제' })
    .getByRole('button', { name: '삭제' })
    .click();
  await expect(mine).not.toContainText('동네 축구 2');
  await expect(mine).toContainText('젊은 피');
  await expect(board.getByTestId('current-strategy')).toHaveText('유스 순혈주의');
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`keeps draft review compact in the focused office at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    const launcher = page.getByTestId('communications-button');
    await expect(launcher).toBeVisible();
    await openOfficeArea(page, '운영 방침');
    // The focused office keeps only its bar: no notifications launcher or tab bar (→WEB-39).
    await expect(launcher).toHaveCount(0);
    const board = page.getByTestId('strategy-board');
    await board.getByText('구단 전체 방침 불러오기·저장', { exact: true }).click();
    const preset = board.getByRole('button', { name: /유스 순혈주의/ });
    await preset.click();
    const draft = page.getByTestId('strategy-draft');
    const fold = draft.getByRole('button', { name: /건 변경/ });
    const body = draft.locator('#strategy-draft-body');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toBeHidden();
    await expect(draft.getByRole('button', { name: '적용', exact: true })).toBeInViewport();
    await settle(page);
    const bounds = (await draft.boundingBox())!;
    const view = (await page.getByTestId('view-scroller').boundingBox())!;
    expect(bounds.height).toBeLessThan(viewport.height * 0.22);
    expect(view.y + view.height - bounds.y - bounds.height).toBeGreaterThanOrEqual(-1);
    expect(view.y + view.height - bounds.y - bounds.height).toBeLessThanOrEqual(2);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({
      path: test.info().outputPath(`draft-collapsed-${viewport.width}.png`),
    });

    await fold.click();
    await expect(body).toBeVisible();
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await expect(draft.getByRole('button', { name: '되돌리기', exact: true })).toBeInViewport();
    await expect(draft.getByRole('button', { name: '적용', exact: true })).toBeInViewport();
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`draft-expanded-${viewport.width}.png`) });
    await draft.getByRole('button', { name: '되돌리기', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await preset.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'false');

    await openOfficeArea(page, '시설');
    await openOfficeArea(page, '운영 방침');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    // Out of the office the launcher is back; the unapplied draft waits for the owner's return.
    await leaveOffice(page);
    await expect(launcher).toBeVisible();
    await openOfficeArea(page, '운영 방침');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await draft.getByRole('button', { name: '적용', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await expect(board.getByTestId('current-strategy')).toHaveText('유스 순혈주의');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
