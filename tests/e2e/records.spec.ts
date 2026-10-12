import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';

/** Founds a club and closes its first season, which leaves one archived season to read. */
async function closeFirstSeason(page: Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
  await journal.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  await page.keyboard.press('Escape');
  await expect(journal).toHaveCount(0);
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
}

for (const [label, viewport] of [
  ['390x844', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const)
  test.describe(`records room at ${label}`, () => {
    test.use({ viewport });

    test('reads the records room in five tabs with Elo context, chart bubbles and player sheets', async ({
      page,
    }) => {
      // A whole season is played first; slow CI browsers need the longer budget.
      test.slow();
      await closeFirstSeason(page, 'records-room-journey');
      const tabs = page.getByRole('tablist', { name: '기록실 보기' });
      const tab = (name: string) => tabs.getByRole('tab', { name, exact: true });
      await expect(tabs.getByRole('tab')).toHaveText(['요약', '추이', '선수', '시즌 기록', '감독']);
      await expect(tab('요약')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history$/);

      // 요약: the trophy cabinet first, then where our Elo stands among every club.
      const cabinet = page.getByRole('list', { name: '트로피 진열장' });
      await expect(cabinet).toContainText('승격');
      await expect(cabinet).toContainText('최고 성적');
      await expect(cabinet).toContainText('(1950/51)');
      const elo = page.getByRole('region', { name: '클럽 Elo 위치' });
      await expect(elo).toContainText('세계 최고');
      await expect(elo).toContainText('세계 최저');
      await expect(elo).toContainText('우리 리그 최고');
      await expect(elo).toContainText(/전체 순위\s*\d+위/);
      const clubs = elo.getByRole('button', { name: / 팀 정보$/ });
      await expect(clubs).toHaveCount(4);
      const best = (await clubs.first().getAttribute('aria-label'))!.replace(/ 팀 정보$/, '');
      await clubs.first().click();
      await expect(page.getByRole('dialog', { name: best, exact: true })).toContainText('클럽 Elo');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('region', { name: '우리 클럽 기록집' })).toContainText(
        '완료한 1개 시즌',
      );
      await expect(page.getByRole('table', { name: '시즌별 기록' })).toContainText('1950/51');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      // A season's row opens that season in 시즌 기록.
      await page.getByRole('button', { name: '1950/51 시즌 기록 보기', exact: true }).click();
      await expect(tab('시즌 기록')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toHaveAttribute(
        'data-value',
        '1950',
      );
      await tab('요약').click();

      // The arrow keys move between the tabs, and the tab goes into the address.
      await tab('요약').focus();
      await page.keyboard.press('ArrowRight');
      await expect(tab('추이')).toBeFocused();
      await expect(tab('추이')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history\?view=trends$/);

      // 추이: the keyboard steps through the seasons; End reads the latest in the bubble.
      const position = page.getByRole('slider', { name: '피라미드 전체 순위' });
      const plot = position.locator('xpath=..');
      await position.focus();
      await page.keyboard.press('End');
      await expect(plot.getByTestId('chart-bubble')).toHaveText(
        /^1950\/51 · 아마추어 리그 \d+위 · 승점 \d+ · 피라미드 \d+위/,
      );
      await expect(position).toHaveAttribute(
        'aria-valuetext',
        (await plot.getByTestId('chart-bubble').innerText()).trim(),
      );
      await expect(position).toHaveAttribute('aria-valuenow', '0');
      await page.keyboard.press('Escape');
      await expect(plot.getByTestId('chart-bubble')).toHaveCount(0);

      // A tap anywhere on the plot picks the nearest season and the same tap closes it again.
      const eloChart = page.getByRole('slider', { name: '시즌 말 Elo' });
      const bubble = eloChart.locator('xpath=..').getByTestId('chart-bubble');
      // Centred, so the floating news button and the tab bar stay clear of the plot.
      await eloChart.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await settle(page);
      const box = (await eloChart.boundingBox())!;
      const tap = () =>
        eloChart.dispatchEvent('pointerdown', {
          pointerType: 'touch',
          isPrimary: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        });
      await tap();
      await expect(bubble).toHaveText(
        /^1950\/51 · Elo \d+ · 전체 \d+위 · 리그 \d+–\d+ · 세계 \d+–\d+$/,
      );
      const inside = (await bubble.boundingBox())!,
        frame = (await eloChart.locator('xpath=..').boundingBox())!;
      expect(inside.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(inside.x + inside.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(inside.y).toBeGreaterThanOrEqual(frame.y - 1);
      expect(inside.y + inside.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      await tap();
      await expect(bubble).toHaveCount(0);
      // A mouse previews the season it rests on and lets go when it leaves; a click pins the
      // bubble, and a click on the same season puts it away even while the mouse stays there.
      const middle = box.y + box.height / 2,
        above = box.y - 40;
      await page.mouse.move(box.x + 12, middle);
      await expect(bubble).toContainText('1950/51 · Elo');
      await page.mouse.move(box.x + box.width / 2, above);
      await expect(bubble).toHaveCount(0);
      await page.mouse.click(box.x + 12, middle);
      await page.mouse.move(box.x + box.width / 2, above);
      await expect(bubble).toContainText('1950/51 · Elo');
      await page.mouse.click(box.x + 16, middle);
      await expect(bubble).toHaveCount(0);
      await page.mouse.move(box.x + 20, middle);
      await expect(bubble).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // 선수: the all-time boards scroll in their own frame; a name opens the player's sheet.
      await tab('선수').click();
      const apps = page.getByRole('table', { name: '역대 최다 출전' });
      await expect(apps.getByRole('row')).toHaveCount(11);
      const link = apps.getByRole('button', { name: / 선수 기록$/ }).first();
      const name = (await link.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
      await link.click();
      const sheet = page.getByRole('dialog', { name, exact: true });
      const career = sheet.getByRole('region', { name: '우리 클럽 통산' });
      await expect(career).toContainText(/출전 \d+경기 · \d+골 · \d+도움/);
      await expect(career).toContainText('클럽 역대 출전');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // 시즌 기록 holds one season at a time; End jumps to 감독, which reads the archive too.
      await tab('시즌 기록').click();
      await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '경기의 페이지' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await tab('시즌 기록').focus();
      await page.keyboard.press('End');
      await expect(tab('감독')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history\?view=managers$/);
      await expect(page.getByRole('heading', { name: '감독들이 남긴 계절' })).toBeVisible();
      await expect(page.getByText(/ · 현재$/)).toBeVisible();

      // The address keeps the tab: a fresh page on it opens 감독 first and still reads the
      // archive (CI WebKit stalls on reloads of the records room, so as with the record book the
      // old page closes and a new one opens).
      await expect(page.getByTestId('save-status')).toContainText('저장 완료');
      const context = page.context();
      await page.close();
      const fresh = await context.newPage();
      await fresh.goto('/history?view=managers');
      const freshTabs = fresh.getByRole('tablist', { name: '기록실 보기' });
      await expect(freshTabs.getByRole('tab', { name: '감독' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(fresh.getByText(/ · 현재$/)).toBeVisible();
      await expect(fresh.getByText('감독 기록을 펼치는 중…')).toHaveCount(0);
      await freshTabs.getByRole('tab', { name: '요약' }).click();
      await expect(fresh).toHaveURL(/\/history$/);
      expect(await horizontalOverflow(fresh)).toBeLessThanOrEqual(0);
    });
  });
