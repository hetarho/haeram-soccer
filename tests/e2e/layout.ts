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

/** A bounded background covers the scene; the stadium remains larger than the visits. */
export async function expectHomeSceneRatio(page: Page) {
  const artwork = page.locator('[data-home-part="scene"] [data-facility-art="stadium"]');
  const image = artwork.locator('img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
  const geometry = await artwork.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const img = node.querySelector('img')!;
    const picture = img.getBoundingClientRect();
    const stage = node.closest('[data-home-part="stage"]')!;
    const card = document.querySelector('[data-home-part="season-card"]')!.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      ratio: bounds.width / bounds.height,
      imageRatio: picture.width / picture.height,
      nativeRatio: img.naturalWidth / img.naturalHeight,
      artworkBottom: bounds.bottom,
      seasonCardBottom: card.bottom,
      stageTop: stage.getBoundingClientRect().top,
      stageHeight: stage.getBoundingClientRect().height,
      statsInside: !!stage.querySelector('[data-home-part="season-stats"]'),
    };
  });
  // Layout/transform precision can report the 156px clamp as 155.99996948242188px.
  // Round to 0.01 CSS px for both bounds, retaining real size regressions.
  const height = Math.round(geometry.height * 100) / 100;
  expect(height).toBeGreaterThanOrEqual(156);
  expect(height).toBeLessThanOrEqual(244);
  expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe('cover');
  // The season figures sit in their own card above the scene, never on it (→WEB-11).
  expect(geometry.statsInside).toBe(false);
  expect(geometry.stageTop).toBeGreaterThanOrEqual(geometry.seasonCardBottom);
  expect(geometry.stageHeight - geometry.height).toBeLessThanOrEqual(24);
  return geometry;
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

/** Possession toggles horizontally beside each team without moving the scoreboard or pitch. */
export async function expectStablePossessionLayout(page: Page) {
  const layouts = await page.getByTestId('match-score').evaluate((scoreboard) => {
    const teams = Array.from(scoreboard.querySelectorAll<HTMLElement>('[data-ui="match-team"]'));
    const cues = teams.map((team) =>
      team.querySelector<HTMLElement>('[data-ui="possession-cue"]')!,
    );
    const originals = cues.map((cue) => cue.style.visibility);
    const canvas = scoreboard.parentElement!.querySelector('canvas')!;
    const measure = () => {
      const score = scoreboard.getBoundingClientRect();
      return {
        top: score.top,
        height: score.height,
        pitchTop: canvas.getBoundingClientRect().top,
        sides: teams.map((team, index) => {
          const cue = cues[index].getBoundingClientRect();
          const identity = team
            .querySelector('[data-ui="match-team-identity"]')!
            .getBoundingClientRect();
          return {
            side: team.dataset.side,
            cueLeft: cue.left,
            cueRight: cue.right,
            identityLeft: identity.left,
            identityRight: identity.right,
            overlapsVertically: cue.top < identity.bottom && cue.bottom > identity.top,
          };
        }),
      };
    };
    try {
      return [-1, 0, 1].map((active) => {
        cues.forEach((cue, index) => {
          cue.style.visibility = active === index ? 'visible' : 'hidden';
        });
        return measure();
      });
    } finally {
      cues.forEach((cue, index) => {
        cue.style.visibility = originals[index];
      });
    }
  });
  expect(layouts[0].sides).toHaveLength(2);
  for (const layout of layouts) {
    expect(layout.height).toBe(layouts[0].height);
    expect(layout.top).toBe(layouts[0].top);
    expect(layout.pitchTop).toBe(layouts[0].pitchTop);
    for (const side of layout.sides) {
      expect(side.overlapsVertically).toBe(true);
      if (side.side === 'home') expect(side.cueLeft).toBeGreaterThanOrEqual(side.identityRight);
      else expect(side.cueRight).toBeLessThanOrEqual(side.identityLeft);
    }
  }
}
