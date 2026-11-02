import { openMatchDetails, watchNext } from './watch';
import { expect, test } from '@playwright/test';
import { nextOwnFixture, npcTactic, tacticLabel } from '../../packages/engine/src/index';
import { generateHistory } from '../../packages/engine/src/history';
import { FORMATIONS } from '../../packages/engine/src/player';
import { takeOver } from '../../packages/engine/src/takeover';
import { settle } from './layout';
import { DEFAULT_START, startCareer } from './start';

test("reports the manager's tactic and the opponent's before an actual seeded match", async ({
  page,
}) => {
  // Reads the report, then watches and analyses a whole match; slow CI browsers need longer.
  test.slow();
  const seed = 'tactical-build-disclosure';
  await page.goto('/');
  const name = await startCareer(page, { seed });
  // The engine takes the same club over from the same choices (→WORLD-13).
  const history = generateHistory(seed, DEFAULT_START.decade);
  const reference = takeOver(history, history.clubs.find((club) => club.name === name)!.id, {
    tier: DEFAULT_START.tier,
    traits: [],
  });
  const next = nextOwnFixture(reference)!;
  const opponent = reference.clubs.find(
    (club) => club.id === (next.home === reference.playerClub ? next.away : next.home),
  )!;
  const opponentTactic = npcTactic(opponent);
  const applied = tacticLabel[reference.tactic];

  await page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트' }).click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  await expect(dialog).toBeVisible();
  // The report's right column is the opponent: its name and the shape it plays.
  const rival = dialog.getByRole('region', { name: '상대 팀', exact: true });
  await expect(rival.getByText(opponent.name, { exact: true })).toBeVisible();
  await expect(rival).toContainText(tacticLabel[opponentTactic]);
  // The manager reports his own tactic and XI; the owner has no tactic to choose (→STAFF-22).
  await expect(dialog.getByRole('region', { name: '감독 보고', exact: true })).toContainText(
    `${FORMATIONS[reference.tactic].name} ${applied}로 나가겠습니다. 선발은 능력과 피로를 보고`,
  );
  await expect(dialog.getByRole('region', { name: '우리 팀', exact: true })).toContainText(applied);
  await expect(dialog.getByRole('region', { name: '감독의 선발', exact: true })).toContainText(
    applied,
  );
  await expect(dialog.getByRole('region', { name: '경기 전술 준비' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '의견 전달', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1930');
  await expect(page.getByTestId('game-round')).toHaveText('0');
  await dialog.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await watchNext(page);
  const match = page.getByTestId('match-theatre');
  await expect(match.getByText(opponent.name, { exact: true })).toBeVisible();
  const matchup =
    next.home === reference.playerClub
      ? `${applied} vs ${tacticLabel[opponentTactic]}`
      : `${tacticLabel[opponentTactic]} vs ${applied}`;
  await expect(match.getByText(matchup, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(match.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
  const details = await openMatchDetails(page);
  const stats = details.locator('[class*="matchStats"]');
  await expect(stats.getByText('점유율', { exact: true })).toBeVisible();
  await expect(stats.getByText('기대 득점 (xG)', { exact: true })).toBeVisible();
  await expect(stats.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await expect(stats.getByText('패스 성공', { exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps the report's sticky confirmation reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page, { seed: `preparation-${viewport.width}` });
    const opener = page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('region', { name: '유니폼', exact: true })).toBeVisible();
    const close = dialog.getByRole('button', { name: '확인하고 홈으로', exact: true });
    await settle(page);
    const footerRect = await close.boundingBox();
    expect(footerRect).not.toBeNull();
    expect(footerRect!.height).toBeGreaterThanOrEqual(44);
    expect(footerRect!.y).toBeGreaterThanOrEqual(0);
    expect(footerRect!.y + footerRect!.height).toBeLessThanOrEqual(viewport.height);
    // Reading to the end of the report keeps the confirmation where it was.
    const body = dialog.locator('[class*="modalBody"]');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await settle(page);
    const afterScroll = await close.boundingBox();
    expect(afterScroll!.y).toBe(footerRect!.y);
    expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(viewport.height);
    await close.click();
    await expect(opener).toBeFocused();
    await page.reload();
    await opener.click();
    await expect(dialog.getByRole('region', { name: '감독 보고', exact: true })).toContainText(
      '선발은 능력과 피로를 보고 제가 고르겠습니다.',
    );
  });
}
