import { chooseOption } from './select';
import { finishSeason } from './season-progression';
import { managerHistoryList, openCurrentClubSeason } from './record-navigation';
import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';

/** Founds a club and closes its first season, which leaves one archived season to read. */
async function closeFirstSeason(page: Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await finishSeason(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await page.keyboard.press('Escape');
  // The tab bar (or the desktop sidebar) reaches every tab; the HUD menu lists only the rest.
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
}

for (const [label, viewport] of [
  ['390x844', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const)
  test.describe(`records room at ${label}`, () => {
    test.use({ viewport });

    test('refreshes manager history during automatic play without flashing progress or cancel', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByText('고급 설정', { exact: true }).click();
      await page.getByLabel('세계 생성 시드').fill('live-tabs-quiet');
      await page.getByRole('button', { name: '클럽 창단' }).click();
      await page.getByRole('button', { name: '클럽 기록실', exact: true }).first().click();
      await page.evaluate(() => {
        const probe = { flashes: 0 };
        (window as typeof window & { archiveProbe?: typeof probe }).archiveProbe = probe;
        new MutationObserver((events) => {
          for (const event of events)
            for (const node of event.addedNodes)
              if (
                node instanceof Element &&
                (node.matches('[aria-label="세계 처리 진행"]') ||
                  node.querySelector('[aria-label="세계 처리 진행"]'))
              )
                probe.flashes++;
        }).observe(document.getElementById('root')!, { childList: true, subtree: true });
      });
      await page.getByRole('tab', { name: '감독 이력', exact: true }).click();
      await expect(page.getByText('감독 기록을 펼치는 중…')).toHaveCount(0);
      await expect(page.getByText(/ · 현재$/)).toBeVisible();
      // The founding manager's tenure, tracked from the founding with no match yet (→WEB-92).
      const tenures = managerHistoryList(page).getByRole('article');
      await expect(tenures).toHaveCount(1);
      await expect(tenures.first()).toContainText('현재 감독');
      await expect(tenures.first()).toContainText('지휘한 공식전 없음');
      await chooseOption(page.getByRole('combobox', { name: '자동 진행 배속', exact: true }), 'x1');
      await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
      await expect(page.getByTestId('game-date')).toHaveText('1950년 8월 4일', {
        timeout: 10000,
      });
      await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
      await expect(page.getByText('감독 기록을 펼치는 중…')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '진행 중단', exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { archiveProbe: { flashes: number } }).archiveProbe.flashes,
        ),
      ).toBe(0);
    });

    test('reads the records room in six tabs with Elo context, chart bubbles and player sheets', async ({
      page,
    }) => {
      // A whole season is played first; slow CI browsers need the longer budget.
      test.slow();
      await closeFirstSeason(page, 'records-room-journey');
      const tabs = page.getByRole('tablist', { name: '기록실 보기' });
      const tab = (name: string) => tabs.getByRole('tab', { name, exact: true });
      await expect(tabs.getByRole('tab')).toHaveText([
        '시즌별 기록',
        '구단 성장',
        '명예·최고기록',
        '선수 통산',
        '이적 기록',
        '감독 이력',
      ]);
      await expect(tab('시즌별 기록')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history$/);

      // 요약: one part at a time, the trophy cabinet first, then where our Elo stands among every
      // club, the season table and the other records.
      await tab('명예·최고기록').click();
      const parts = page.getByRole('group', { name: '명예·최고기록 보기' });
      const part = (name: string) => parts.getByRole('button', { name, exact: true });
      await expect(parts.getByRole('button')).toHaveText(['트로피', '기타 기록']);
      await expect(part('트로피')).toHaveAttribute('aria-pressed', 'true');
      const cabinet = page.getByRole('list', { name: '트로피 진열장' });
      await expect(cabinet).toContainText('승격');
      await expect(cabinet).toContainText('최고 성적');
      await expect(cabinet).toContainText('(1950/51)');
      await expect(cabinet.locator('[data-ui="trophy"] img')).toHaveCount(
        await cabinet.getByRole('listitem').count(),
      );
      await expect(cabinet.locator('svg')).toHaveCount(0);
      await tab('구단 성장').click();
      await page
        .getByRole('group', { name: '추이 지표' })
        .getByRole('button', { name: 'Elo', exact: true })
        .click();
      await expect(cabinet).toHaveCount(0);
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

      // 기타 기록: match records over every own match, then the record book.
      await tab('명예·최고기록').click();
      await part('기타 기록').click();
      const matches = page.getByRole('region', { name: '경기 기록' });
      await expect(matches.getByRole('article', { name: '최다 골차 승리' })).toContainText(
        /\d+–\d+/,
      );
      await expect(matches.getByRole('article', { name: '최장 무패' })).toContainText(/\d+경기/);
      await expect(matches).toContainText(/공식전 \d+경기|정규 90분/);
      await expect(page.getByRole('region', { name: '우리 클럽 기록집' })).toContainText(
        '완료한 1개 시즌',
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // 시즌별 기록: a season's row opens that season on the league page, on its final table.
      await tab('시즌별 기록').click();
      const seasons = page.getByRole('table', { name: '시즌별 기록' });
      await expect(seasons).toContainText('1950/51');
      const currentSeason = seasons.locator('tr[aria-current="true"]');
      await expect(currentSeason).not.toContainText('진행 중');
      await expect(currentSeason.locator('td').first()).toHaveCSS('box-shadow', /inset/);
      await settle(page);
      for (const season of await seasons.locator('tbody tr').all()) {
        expect(await season.evaluate((element) => element.getBoundingClientRect().height)).toBe(44);
      }
      const row = page.getByRole('button', { name: '1950/51 구단 시즌 기록 보기', exact: true });
      // Centred, so the floating news button and the tab bar stay clear of the row.
      await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await row.click();
      await expect(page).toHaveURL(/\/history\?season=1950/);
      // The season is a sub-screen: the records tabs give way to its navigator bar (→WEB-54).
      await expect(page.getByRole('tablist', { name: '기록실 보기' })).toHaveCount(0);
      const navigator = page.getByRole('navigation', { name: '시즌 기록 이동', exact: true });
      await expect(navigator.getByRole('heading')).toHaveText('1950/51 · 구단 시즌 기록');
      const back = navigator.getByRole('button', { name: '← 시즌별 기록', exact: true });
      const links = [
        page.getByRole('button', { name: '이 시즌 리그 순위표', exact: true }),
        page.getByRole('button', { name: '이 시즌 컵 대회 기록', exact: true }),
      ];
      const backBounds = (await back.boundingBox())!;
      const buttonBounds = await Promise.all(links.map((button) => button.boundingBox()));
      expect(backBounds.height).toBeGreaterThanOrEqual(44);
      expect(buttonBounds.every((box) => box && box.height >= 44)).toBe(true);
      expect(buttonBounds.every((box) => box!.y === buttonBounds[0]!.y)).toBe(true);
      expect(backBounds.y).toBeLessThan(buttonBounds[0]!.y);
      for (const button of [back, ...links]) {
        expect(await button.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
          '0px',
        );
      }
      await page.getByRole('button', { name: '이 시즌 리그 순위표', exact: true }).click();
      await expect(page).toHaveURL(/\/leagues\?.*season=1950&tab=table/);
      await expect(
        page.getByRole('tablist', { name: '지난 시즌 보기' }).getByRole('tab', { name: '순위표' }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('region', { name: '최종 순위표' })).toContainText('1950/51');
      await expect(page.getByRole('region', { name: '최종 순위표' })).toContainText('Haeram');
      await page.getByRole('button', { name: '← 돌아가기 · 클럽 시즌 기록', exact: true }).click();
      await expect(navigator).toBeVisible();
      await back.click();
      await expect(tab('시즌별 기록')).toHaveAttribute('aria-selected', 'true');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // The arrow keys move between the tabs, and the tab goes into the address.
      await tab('시즌별 기록').focus();
      await page.keyboard.press('ArrowRight');
      await expect(tab('구단 성장')).toBeFocused();
      await expect(tab('구단 성장')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history\?view=trends$/);

      // Growth: one chart at a time, the league position first; the keyboard steps through the
      // seasons and End reads the latest in the bubble.
      const metrics = page.getByRole('group', { name: '추이 지표' });
      await expect(metrics.getByRole('button')).toHaveText([
        '리그 위치',
        'Elo',
        '선수단 가치',
        '구단 가치',
        '서포터',
        '자금',
      ]);
      await metrics.getByRole('button', { name: '리그 위치', exact: true }).click();
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
      await metrics.getByRole('button', { name: 'Elo', exact: true }).click();
      await expect(metrics.getByRole('button', { name: 'Elo', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(position).toHaveCount(0);
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

      // The season table lives on 요약 now, not under the charts.
      await expect(page.getByRole('table', { name: '시즌별 기록' })).toHaveCount(0);

      // 선수: one all-time board at a time; a name opens the player's sheet.
      await tab('선수 통산').click();
      const boards = page.getByRole('group', { name: '통산 기록 종류' });
      await expect(boards.getByRole('button')).toHaveText(['출전', '득점', '도움', '선방']);
      const apps = page.getByRole('table', { name: '역대 최다 출전' });
      await expect(apps.getByRole('row')).toHaveCount(11);
      // 더 보기 adds the next ten places while the board has more players (→WEB-54).
      const more = page.getByRole('button', { name: /^더 보기 · 11–\d+위$/ });
      await expect(more).toBeVisible();
      const label = (await more.innerText()).match(/11–(\d+)위/)!;
      await more.click();
      await expect(apps.getByRole('row')).toHaveCount(Number(label[1]) + 1);
      const link = apps.getByRole('button', { name: / 선수 기록$/ }).first();
      const name = (await link.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
      await link.click();
      const sheet = page.getByRole('dialog', { name, exact: true });
      const career = sheet.getByRole('region', { name: '우리 클럽 통산' });
      await expect(career).toContainText(/출전 \d+경기 · \d+골 · \d+도움/);
      await expect(career).toContainText('클럽 역대 출전');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await boards.getByRole('button', { name: '득점', exact: true }).click();
      await expect(page.getByRole('table', { name: '역대 최다 득점' })).toBeVisible();
      await expect(apps).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // 이적 기록: 영입 and 매각 fee boards over every season or one, in today's money; a club
      // without a fee transfer says so (→WEB-54, HIST-20).
      await tab('이적 기록').click();
      await expect(page).toHaveURL(/\/history\?view=transfers$/);
      const transferBoards = page.getByRole('group', { name: '이적 기록 종류' });
      await expect(transferBoards.getByRole('button')).toHaveText(['영입', '매각']);
      await expect(transferBoards.getByRole('button', { name: '영입' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const transferSeason = page.getByRole('combobox', { name: '이적 기록 시즌', exact: true });
      await expect(transferSeason).toHaveAttribute('data-value', 'all');
      const signings = page.getByRole('table', { name: '역대 최고 이적료 영입' });
      const empty = page.getByText('기록된 이적료 거래가 없어요.');
      await expect(signings.or(empty)).toBeVisible();
      if (await signings.isVisible()) {
        const rows = await signings.getByRole('row').count();
        expect(rows).toBeGreaterThan(1);
        expect(rows).toBeLessThanOrEqual(11);
      }
      await transferBoards.getByRole('button', { name: '매각' }).click();
      await expect(
        page.getByRole('table', { name: '역대 최고 이적료 매각' }).or(empty),
      ).toBeVisible();
      await expect(signings).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // 시즌 기록 holds one season of ours at a time: the arrows step through the seasons and the
      // segments show its overview, matches and decisions, never other clubs' tables.
      await openCurrentClubSeason(page);
      const season = page.getByRole('combobox', { name: '기록 시즌', exact: true });
      await expect(season).toHaveAttribute('data-value', '1951');
      await page.getByRole('button', { name: '이전 기록 시즌', exact: true }).click();
      await expect(season).toHaveAttribute('data-value', '1950');
      await expect(
        page.getByRole('button', { name: '이전 기록 시즌', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('region', { name: '선택 시즌 분석' })).toContainText(
        '1950/51 · 모든 대회',
      );
      const seasonParts = page.getByRole('group', { name: '시즌 기록 보기' });
      await seasonParts.getByRole('button', { name: '경기', exact: true }).click();
      await expect(page.getByRole('heading', { name: '경기의 페이지' })).toBeVisible();
      await expect(page.getByRole('button', { name: '경기 기록 보기' }).first()).toBeVisible();
      await seasonParts.getByRole('button', { name: '결정', exact: true }).click();
      await expect(page.getByRole('heading', { name: '그해의 결정들' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '그해의 각국 리그' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '클럽대항전 우승과 순위' })).toHaveCount(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      // The season is a sub-screen; its navigator bar leads back to the tabs (→WEB-54).
      await page.getByRole('button', { name: '← 시즌별 기록', exact: true }).click();
      await tab('시즌별 기록').focus();
      await page.keyboard.press('End');
      await expect(tab('감독 이력')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/\/history\?view=managers$/);
      await expect(page.getByRole('heading', { name: '감독들이 남긴 계절' })).toBeVisible();
      await expect(page.getByText(/ · 현재$/)).toBeVisible();
      // The closed season's tenures above it: the one in charge now on top, with a record.
      const tenures = managerHistoryList(page).getByRole('article');
      await expect(tenures.first()).toContainText('현재 감독');
      await expect(managerHistoryList(page)).toContainText(/\d+경기 \d+승 \d+무 \d+패/);

      // The address keeps the tab: a fresh page on it opens 감독 first and still reads the
      // archive (CI WebKit stalls on reloads of the records room, so as with the record book the
      // old page closes and a new one opens).
      await expect(page.getByTestId('save-status')).toContainText('저장 완료');
      const context = page.context();
      await page.close();
      const fresh = await context.newPage();
      await fresh.goto('/history?view=managers');
      const freshTabs = fresh.getByRole('tablist', { name: '기록실 보기' });
      await expect(freshTabs.getByRole('tab', { name: '감독 이력' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(fresh.getByText(/ · 현재$/)).toBeVisible();
      await expect(fresh.getByText('감독 기록을 펼치는 중…')).toHaveCount(0);
      await freshTabs.getByRole('tab', { name: '시즌별 기록' }).click();
      await expect(fresh).toHaveURL(/\/history$/);
      expect(await horizontalOverflow(fresh)).toBeLessThanOrEqual(0);
    });
  });
