import { expect, type Page } from '@playwright/test';

/** The club/cash HUD stays separate from the season information row below it. */
export const gameHud = (page: Page) =>
  page.locator('header').filter({ has: page.getByTestId('hud-cash') });

/**
 * Page switches, sheets and cards animate in. Wait for every finite animation to land before
 * measuring geometry, so a sliding panel is not mistaken for a layout overflow.
 */
export async function settle(page: Page) {
  // Interface motion lasts at most ~300ms. The wait is bounded because headless Firefox can leave
  // an idle hover transition 'running' at time 0 indefinitely.
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return animation.playState !== 'running' || !timing || timing.endTime === Infinity;
        }),
      undefined,
      { timeout: 2000 },
    )
    .catch(() => undefined);
  // WebKit keeps a finished animation's last frame in layout until the next rendering update: a
  // dialog's entrance read 43.994 px for 44 px choices at 1380 px (CI 40961086172). Two frames
  // let the settled style apply; the bound keeps a page without frames from waiting forever.
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    )
    .catch(() => undefined);
}

/**
 * The document never scrolls: every page lives in one view scroller between the HUD/clock and the
 * tab bar, and the core home and match columns may scroll inside it. Measure those containers so
 * "fits one screen" and "no horizontal overflow" keep their meaning.
 */
export async function viewGeometry(page: Page) {
  await settle(page);
  return page.evaluate(() => {
    // A standalone page (the constants map) has no game shell: the document is its scroller.
    const scroller =
      document.querySelector<HTMLElement>('[data-testid="view-scroller"]') ??
      (document.scrollingElement as HTMLElement);
    const vertical = [scroller, ...scroller.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        element.getClientRects().length &&
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
    );
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      documentScroll: scrollY,
      width: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      scroll: scroller.scrollTop,
      overflow: Math.max(
        0,
        ...vertical.map((element) => element.scrollHeight - element.clientHeight),
      ),
    };
  });
}

/** Content wider than the view is clipped, not scrollable, so check the scroller as well. */
export async function horizontalOverflow(page: Page) {
  const geometry = await viewGeometry(page);
  return Math.max(
    geometry.documentWidth - geometry.viewportWidth,
    geometry.width - geometry.clientWidth,
  );
}

/**
 * Home keeps the document still and never overflows sideways, but its column may scroll
 * vertically inside the view region when the club's stage needs the room (WEB-10).
 */
export async function expectHomeBounds(page: Page) {
  const geometry = await viewGeometry(page);
  const measured = JSON.stringify(geometry);
  expect(geometry.documentHeight, measured).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.documentScroll, measured).toBe(0);
  expect(geometry.scroll, measured).toBe(0);
  expect(geometry.documentWidth, measured).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.width, measured).toBeLessThanOrEqual(geometry.clientWidth);
}

/** Seven whole standings rows must fit before the fixed transport at the default phone size. */
export async function expectCompactStandings(page: Page) {
  await settle(page);
  const metrics = await page
    .getByRole('table', { name: '리그 순위표', exact: true })
    .evaluate((table) => {
      const viewport = document
        .querySelector('[data-testid="view-scroller"]')!
        .getBoundingClientRect();
      const wrap = table.parentElement!;
      const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
        row.getBoundingClientRect(),
      );
      const selected = document.querySelector('[aria-label="리그 보기"] [aria-selected="true"]')!;
      const style = getComputedStyle(selected);
      return {
        visibleRows: rows.filter((row) => row.top >= viewport.top && row.bottom <= viewport.bottom)
          .length,
        rowHeights: rows.map((row) => row.height),
        overflow: wrap.scrollWidth > wrap.clientWidth,
        tabBorder: parseFloat(style.borderTopWidth),
        tabBackground: style.backgroundImage,
        tabFrame: style.borderImageSource,
      };
    });
  expect(metrics.visibleRows).toBeGreaterThanOrEqual(7);
  expect(metrics.rowHeights.every((height) => height <= 48)).toBe(true);
  expect(metrics.overflow).toBe(true);
  expect(metrics.tabBorder).toBe(0);
  expect(metrics.tabBackground).toBe('none');
  expect(metrics.tabFrame).toBe('none');
}

/** The current view fits one screen: nothing scrolls vertically or horizontally. */
export async function expectViewFits(page: Page) {
  const geometry = await viewGeometry(page);
  const measured = JSON.stringify(geometry);
  expect(geometry.documentHeight, measured).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.documentScroll, measured).toBe(0);
  expect(geometry.overflow, measured).toBeLessThanOrEqual(2);
  expect(geometry.scroll, measured).toBe(0);
  expect(geometry.documentWidth, measured).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.width, measured).toBeLessThanOrEqual(geometry.clientWidth);
}

/**
 * The side on the ball fills the whole scoreboard in its shirt (→WEB-95): once a side has had the
 * ball both halves wear one colour, and recolouring the board never moves it or the pitch.
 */
export async function expectBallSideScoreboard(page: Page) {
  // WebKit once read the away half partway through its recolour after finding nothing moving
  // (pixel at 1280, CI 43288257211: rgb(168, 175, 188), between its navy and white, beside a white
  // home half), so a reading caught inside a recolour is taken again; the halves must still come
  // to one colour, and the board must still hold still when recoloured.
  await expect(async () => readBallSideScoreboard(page)).toPass({ timeout: 10_000 });
}

async function readBallSideScoreboard(page: Page) {
  const board = await page.getByTestId('match-score').evaluate(async (scoreboard) => {
    const canvas = scoreboard.parentElement!.querySelector('canvas')!;
    // Read a still board and pitch: WebKit resamples a page's entrance still sliding them in when
    // the recolour restyles, so the two reads below differed by 0.05 px at 1280 px; and each half
    // eases to the side on the ball over 240 ms, so a read inside that recolour finds the halves
    // still apart (chromium at 360 and 1280: one half still white).
    const moving = () =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return (
          !!target &&
          (target.contains(scoreboard) || target.contains(canvas) || scoreboard.contains(target)) &&
          animation.playState === 'running' &&
          animation.effect!.getComputedTiming().endTime !== Infinity
        );
      });
    // The ball may change side again while one recolour ends: read in the same turn that finds
    // nothing moving, so no restyle comes between the check and the read.
    for (let wait = 0, running = moving(); running.length && wait < 50; running = moving(), wait++)
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    const behind = (side: string) =>
      getComputedStyle(scoreboard.querySelector(`:scope > [data-side="${side}"]`)!).backgroundColor;
    const measure = () => {
      const score = scoreboard.getBoundingClientRect();
      return {
        top: score.top,
        height: score.height,
        pitchTop: canvas.getBoundingClientRect().top,
      };
    };
    const style = scoreboard.style;
    const keys = ['--home-kit', '--home-ink', '--away-kit', '--away-ink'];
    const original = keys.map((key) => style.getPropertyValue(key));
    const names = [behind('home'), behind('away')];
    const before = measure();
    try {
      // The other side winning the ball: every colour of the board changes at once.
      keys.forEach((key, i) => style.setProperty(key, i % 2 ? '#ffffff' : '#000000'));
      return { side: scoreboard.dataset.ballSide, names, before, recoloured: measure() };
    } finally {
      keys.forEach((key, i) => style.setProperty(key, original[i]!));
    }
  });
  expect(board.recoloured).toEqual(board.before);
  if (board.side !== undefined) expect(board.names[0]).toBe(board.names[1]);
}
