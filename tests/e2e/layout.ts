import { expect, type Page } from '@playwright/test';

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
}

/**
 * The document never scrolls: every page lives in one view scroller between the HUD/clock and the
 * tab bar, and the core home and match columns may scroll inside it. Measure those containers so
 * "fits one screen" and "no horizontal overflow" keep their meaning.
 */
export async function viewGeometry(page: Page) {
  await settle(page);
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-testid="view-scroller"]')!;
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
