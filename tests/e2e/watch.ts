import { clubhouseTab } from './competition-navigation';
import { expect, type Locator, type Page } from '@playwright/test';
import { acknowledgeEvents, configureResponsibilities, dismissMatchReport } from './events';
import { chooseOption } from './select';
import { PITCH_PAD } from '../../apps/web/src/entities/match/lib/pitchPainting';

/**
 * How long a journey waits for the page's worker to stage a watched match ahead (→MATCH-39): it
 * stages a few minutes a step from the script, so a seek or the final whistle may wait for it on a
 * slow runner (a whole match stages in about 15 s in Node on the shared host, 261112).
 */
export const STAGING_TIMEOUT_MS = 60_000;

/**
 * Waits until the timeline in 경기 상세 reaches `sample`: the staging has drawn that far, so a seek
 * there lands on it rather than on the last staged sample.
 */
export async function stagedTo(timeline: Locator, sample: number) {
  await expect
    .poll(() => timeline.getAttribute('max').then(Number), { timeout: STAGING_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(sample);
}

/** Resume a live match, or progress through real public events to the match-eve dialog. */
export async function openWatchAction(page: Page) {
  const watch = page
    .getByTestId('event-card')
    .getByRole('button', { name: '관전하기 ▶', exact: true });
  const resume = page
    .getByRole('dialog', { name: '관전 이어보기', exact: true })
    .getByRole('button', { name: '관전 이어보기', exact: true });
  const home = clubhouseTab(page);
  for (let attempt = 0; ; attempt++) {
    if (await watch.isVisible()) return watch;
    if (await resume.isVisible()) return resume;
    await dismissMatchReport(page);
    try {
      await home.click({ timeout: 2000 });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      // The clock a finished match resumed can reach the next eve after the dismissal above, and
      // its backdrop takes the click (CI Firefox 40262705063, business:266): that eve is the one
      // this journey wants, so the next pass returns its watch action.
    }
  }
  await configureResponsibilities(page, { observations: { matchEve: true } });
  // Asking for match-eve reports on an eve opens its report at once, over the controls.
  if (await watch.isVisible()) return watch;
  const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  if (await pace.isVisible()) {
    try {
      await chooseOption(pace, 'x10', { timeout: 2000 });
    } catch (error) {
      // The resumed clock can open the next eve between the visibility check and the click;
      // its modal covers the pace control, and the watch action is already the destination.
      if (await watch.isVisible()) return watch;
      if (await resume.isVisible()) return resume;
      throw error;
    }
  }
  for (let step = 0; step < 80; step++) {
    if (await resume.isVisible()) return resume;
    const pill = page.getByTestId('event-pill');
    if (await pill.isVisible()) await pill.click();
    if (await watch.isVisible()) return watch;
    await acknowledgeEvents(page);
    if (await watch.isVisible()) return watch;
    const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
    if (await next.isVisible()) await next.click();
    else {
      const play = page.getByRole('button', { name: '자동 진행 시작', exact: true });
      if (await play.isVisible()) await play.click();
    }
    await expect
      .poll(
        async () =>
          (await watch.isVisible()) ||
          (await resume.isVisible()) ||
          (await page.getByTestId('event-card').count()) > 0,
        { timeout: 20000 },
      )
      .toBe(true);
  }
  throw new Error('No match eve after eighty public progression events');
}

export async function watchNext(page: Page, { manual = false } = {}) {
  if (manual) await configureResponsibilities(page, { mode: 'manual' });
  await (await openWatchAction(page)).click();
  await page.getByTestId('match-theatre').waitFor({ state: 'visible' });
}

/**
 * The presented minute's label (`45+2`) from the theatre's meta line; the commentary line names
 * the minute of its latest notable call instead (→MATCH-24).
 */
export async function presentedMinute(scope: Page | Locator) {
  const line = await scope.locator('[data-ui="match-meta"] > span').first().innerText();
  return line.split('′')[0]!.split(' · ').at(-1)!;
}

/** The 경기 상세 dialog (→WEB-50): moments, report, scrubber and stats over the held match. */
export const matchDetails = (page: Page) =>
  page.getByRole('dialog', { name: '경기 상세', exact: true });

/** Opens 경기 상세 from the theatre; the match holds still while it is open. */
export async function openMatchDetails(page: Page) {
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  const details = matchDetails(page);
  await expect(details).toBeVisible();
  return details;
}

/** Closes 경기 상세; the match plays on only if it was playing when the dialog opened. */
export async function closeMatchDetails(page: Page) {
  const details = matchDetails(page);
  await details.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(details).toHaveCount(0);
}

/** A tapped player's sheet: his decisions over the held match (→WEB-50). */
export const playerSheet = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.getByTestId('player-inspector') });

/**
 * Taps the live pitch, held still (finished, or paused at a seek made from the result), and
 * returns the player's sheet it opens. With `at` (a place in the pitch's 0–100 units, as recorded
 * samples hold it) the tap lands on that spot, where the paused figure stands; without it, a grid
 * of points from the centre out is tapped until a sheet opens: a tap finds a figure within 18px or
 * more, so a 24px step reaches every one. Points under an overlay or off screen are skipped.
 */
export async function openPlayerSheet(page: Page, { at }: { at?: readonly [number, number] } = {}) {
  const canvas = page.getByTestId('match-theatre').locator('canvas[data-pickable]');
  await canvas.scrollIntoViewIfNeeded();
  // The drawing's own box: its client size maps the pitch, offset from the canvas's left top.
  const box = await canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.left,
      y: bounds.top,
      width: element.clientWidth,
      height: element.clientHeight,
    };
  });
  const points: [number, number][] = [];
  if (at) {
    const pad = box.width * PITCH_PAD;
    points.push([
      box.x + pad + ((box.width - pad * 2) * at[0]) / 100,
      box.y + pad + ((box.height - pad * 2) * at[1]) / 100,
    ]);
  } else {
    const step = 24;
    for (let x = box.x + step / 2; x < box.x + box.width; x += step)
      for (let y = box.y + step / 2; y < box.y + box.height; y += step) points.push([x, y]);
    const centre = [box.x + box.width / 2, box.y + box.height / 2];
    points.sort(
      (a, b) =>
        Math.hypot(a[0] - centre[0], a[1] - centre[1]) -
        Math.hypot(b[0] - centre[0], b[1] - centre[1]),
    );
  }
  for (const [x, y] of points) {
    // Checked between taps, so a sheet that opened is never closed by a tap on its backdrop. A
    // closed sheet's copy fading out for 180 ms is aria-hidden and takes no taps: it is not open.
    const state = await page.evaluate(
      ([px, py]) => {
        const sheets = document.querySelectorAll('[data-testid="player-inspector"]');
        if ([...sheets].some((sheet) => !sheet.closest('[aria-hidden="true"]'))) return 'open';
        const pitch = document.querySelector('[data-testid="match-theatre"] canvas[data-pickable]');
        return document.elementFromPoint(px, py) === pitch ? 'tap' : 'skip';
      },
      [x, y],
    );
    if (state === 'open') break;
    if (at) expect(state, `the pitch is uncovered at ${at.join(', ')}`).toBe('tap');
    if (state === 'tap') await page.mouse.click(x, y);
  }
  const sheet = playerSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}
