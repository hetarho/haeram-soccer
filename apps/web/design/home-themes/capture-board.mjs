import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { concepts } from './art-directions.mjs';

const origin = process.env.THEME_STUDY_ORIGIN || 'http://localhost:19500';
const directory = fileURLToPath(new URL('./captures/', import.meta.url));
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 2100, height: 1800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/design/home-themes/?board=1`);
  await page.evaluate(() => document.fonts.ready);
  const images = await page.locator('.study-card img').evaluateAll(async (items) => {
    await Promise.all(items.map((image) => image.decode()));
    return items.map((image) => ({
      src: image.getAttribute('src'),
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
  });
  if (images.length !== concepts.length || images.some((image) => !image.width || !image.height)) {
    throw new Error('Missing concept image');
  }
  await page.locator('.overview').screenshot({ path: `${directory}/art-overview.png` });
  for (const width of [1380, 390]) {
    await page.setViewportSize({ width, height: 920 });
    await page.goto(`${origin}/design/home-themes/`);
    await page.evaluate(() => document.fonts.ready);
    for (const concept of concepts) {
      await page.locator(`[data-theme="${concept.id}"]`).click();
      await page.locator('#home-preview').evaluate((image) => image.decode());
      const displayed = await page.locator('#home-preview').getAttribute('src');
      if (!displayed.endsWith(concept.image)) throw new Error(`Selection failed: ${concept.id}`);
    }
    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    );
    results.push({ width, selections: concepts.length, horizontalOverflow: overflow });
    if (overflow) throw new Error(`Viewer overflow: ${width}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ images, results, errors }, null, 2));
  await writeFile(
    `${directory}/art-checks.json`,
    `${JSON.stringify({ images, results, errors }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
