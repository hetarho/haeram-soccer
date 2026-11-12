import { expect, test } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { expectCompressedPreparation } from './preparation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { CORNER_RULE, sceneCareer, type Who } from './set-piece-scene';
import {
  closeMatchDetails,
  openMatchDetails,
  openPlayerSheet,
  presentedMinute,
  STAGING_TIMEOUT_MS,
  watchNext,
} from './watch';

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
])
  test(`shows both sides through a corner on ${viewport.name}`, async ({ page }) => {
    // The reference scene is settled and staged in Node and the page's in the browser's own
    // engine: the script reads only the portable math, so every browser stages the same match.
    // Staging the reference takes seconds before the page opens.
    test.slow();
    await page.setViewportSize(viewport);
    const { scene, career } = sceneCareer();
    // MATCH-18 at the kick: the staging's rest defence, outlets and goal-side marking.
    expect(scene.back).toBeGreaterThanOrEqual(CORNER_RULE.back[0]);
    expect(scene.back).toBeLessThanOrEqual(CORNER_RULE.back[1]);
    expect(scene.up).toBeGreaterThanOrEqual(CORNER_RULE.up[0]);
    expect(scene.up).toBeLessThanOrEqual(CORNER_RULE.up[1]);
    expect(scene.inBox).toBeGreaterThan(0);
    expect(scene.unmarked).toEqual([]);
    const people = [scene.runner, scene.marker, scene.rest, scene.outlet, scene.keeper];
    expect(people.every((who) => who && who.index >= 0)).toBe(true);
    await importResponsibilityCareer(page, career);
    await watchNext(page);
    const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
    await expect(canvas).toBeVisible();
    // The result holds the match still, so a seek in 경기 상세 keeps its place once it closes.
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    const details = await openMatchDetails(page);
    const timeline = details.getByRole('slider', { name: '경기 시간', exact: true });
    // The page stages the reference's match ahead in its own worker (→MATCH-39): once staged, the
    // same samples.
    await expect(timeline).toHaveAttribute('max', String(scene.samples - 1), {
      timeout: STAGING_TIMEOUT_MS,
    });
    await timeline.fill(String(scene.shot.index));
    await expect(timeline).toHaveValue(String(scene.shot.index));
    await closeMatchDetails(page);
    await expect.poll(() => presentedMinute(page)).toBe(scene.shot.label);
    // Each tapped figure opens his sheet, which says what he is doing from his staged state.
    for (const who of people as Who[]) {
      const sheet = await openPlayerSheet(page, { at: scene.place(scene.shot, who) });
      await expect(sheet).toHaveAccessibleName(new RegExp(`^${who.index + 1}\\. `));
      await expect(sheet.getByTestId('player-inspector').locator('p > b')).toHaveText(
        scene.state(scene.shot, who),
      );
      await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
      await expect(sheet).toHaveCount(0);
    }
    await expect(canvas).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // Played from just before the ball went dead, the walk-in to this kick is drawn as its rush
    // and still beat at 1x with the players still travelling (→WEB-32, MATCH-12).
    if (viewport.name === 'phone')
      await expectCompressedPreparation(page, scene.playback, scene.preparation);
  });
