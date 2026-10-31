import { openPersonnel } from './personnel-navigation';
import { openClubhouse } from './competition-navigation';
import { marketRows, closeMarketPanel } from './market';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { proposeOnReport } from './events';

/**
 * How far a dialog's content runs past its own width: any block that shows its overflow (a
 * visually hidden label clips its own, a scroll area scrolls).
 */
const sideways = (dialog: Locator) =>
  dialog.evaluate((element) =>
    Math.max(
      0,
      ...[element, ...element.querySelectorAll('*')]
        .filter((node) => {
          const style = getComputedStyle(node);
          // An inline box has no client width of its own to overflow.
          return node === element || (style.overflowX === 'visible' && style.display !== 'inline');
        })
        .map((node) => node.scrollWidth - node.clientWidth),
    ),
  );
async function people(page: Page) {
  await openPersonnel(page, 'players');
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`reads players as football media would at ${viewport.width}x${viewport.height} (→WEB-59, CLUB-10, CLUB-14)`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();

    // The roster: each card shows adaptation; a name opens the sheet with the full profile.
    await people(page);
    const roster = page.locator('[class*="rosterCards"]');
    await expect(roster.getByTestId('roster-adaptation').first()).toHaveText(/^\d\.\d\d$/);
    const link = roster.getByRole('button', { name: / 선수 기록$/ }).first();
    const name = (await link.getAttribute('aria-label'))!.replace(/ 선수 기록$/, '');
    await link.click();
    const sheet = page.getByRole('dialog', { name, exact: true });
    const profile = sheet.getByRole('region', { name: '선수 프로필' });
    await expect(profile.getByTestId('profile-attributes')).toContainText('위치선정');
    await expect(profile.getByTestId('profile-attributes')).toContainText('공중볼 처리');
    // The mental group: 판단력 and 침착성 (→PLAYER-2).
    await expect(profile.getByTestId('profile-attributes')).toContainText('판단력');
    await expect(profile.getByTestId('profile-attributes')).toContainText('침착성');
    await expect(profile.getByRole('img', { name: /^포지션 [A-Z]+ 최상/ })).toBeVisible();
    await expect(profile.getByTestId('profile-effective')).toContainText('실효 OVR');
    await expect(profile.getByTestId('profile-adaptation')).toHaveText(/적응도 \d\.\d\d · ×[\d.]+/);
    // His own personality is exact.
    await expect(profile.getByTestId('profile-personality')).not.toContainText('~');
    // Cards and bans, and the season heat map, before a match is played (→WEB-59, HIST-16).
    await expect(sheet.getByTestId('player-discipline')).toContainText(
      '이번 시즌 경고 0 · 퇴장 0 · 통산 경고 0 · 퇴장 0',
    );
    await expect(sheet.getByTestId('player-discipline')).toContainText('출장 정지 없음');
    await expect(sheet.getByTestId('player-heat')).toContainText('터치 위치가 기록된 경기');
    expect(await sideways(sheet)).toBeLessThanOrEqual(1);
    await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();

    // A position filter lists everyone who plays it at 준수 or better.
    const settings = page.getByRole('button', { name: /^선수 보기 설정/ });
    await settings.click();
    const view = page.getByRole('dialog', { name: '선수 보기 설정' });
    await view
      .getByRole('radiogroup', { name: '포지션' })
      .getByRole('radio', { name: 'CB' })
      .click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('roster-view-summary')).toHaveText('CB');
    await expect(roster.getByRole('article').first()).toBeVisible();

    // A market candidate: positions with levels, the scout's verdict, his 실효 OVR at the slot he
    // would take on arrival and settled, and the scout's range on his personality under 능력·성향.
    await openPersonnel(page, 'market');
    await marketRows(page)
      .first()
      .getByRole('button', { name: / 상세 보기$/ })
      .click();
    const card = page.getByRole('dialog', { name: '영입 후보 상세' }).getByRole('article');
    await expect(card.getByTestId('candidate-positions')).toHaveText(/[A-Z]+ 최상/);
    await expect(card.getByTestId('scout-verdict')).toContainText(/^[A-E]스카우트 판정/);
    await expect(card.getByTestId('candidate-slot')).toHaveText(/합류 \d+ → 적응 후 \d+/);
    await card.getByText('능력·성향', { exact: true }).click();
    const scouted = card.getByRole('region', { name: '선수 프로필' });
    await expect(scouted.getByTestId('profile-personality')).toContainText('~');
    await expect(scouted).toContainText('수석 스카우트가 본 범위');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await closeMarketPanel(page, '영입 후보 상세');
    // The lineup tab draws the formation: each slot its position, role, player and 실효 OVR.
    await openClubhouse(page);
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '상세 리포트', exact: true })
      .click();
    const preparation = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
    await expect(preparation).toBeVisible();
    await proposeOnReport(preparation);
    await preparation.getByRole('tab', { name: '선발 선택', exact: true }).click();
    const pitch = preparation.getByRole('group', { name: /선발 배치$/ });
    await expect(pitch).toBeVisible();
    await expect(pitch.getByTestId('formation-slot-0')).toContainText('GK');
    await expect(pitch.getByTestId('formation-slot-0')).toContainText(/실효 \d+/);
    await expect(pitch.locator('[data-testid^="formation-slot-"]')).toHaveCount(11);
    // The owner's lineup editor; the report's compact pitches above let wide slots overhang.
    expect(
      await sideways(preparation.getByRole('region', { name: '구단주 제안', exact: true })),
    ).toBeLessThanOrEqual(1);
  });
}
