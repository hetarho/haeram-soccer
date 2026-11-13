/** Real-browser offline/Canvas/control smoke. Run against the final generated HTML. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { message } from '../../packages/contracts/src/messages';

const args = process.argv.slice(2);
const opt = (key: string) => {
  const at = args.indexOf(`--${key}`);
  return at < 0 ? undefined : args[at + 1];
};
const file = opt('page');
if (!file)
  throw new Error(
    message('naturalFootball.usage', {
      command: 'smoke.ts --page index.html [--screenshot FILE.png]',
    }),
  );
interface State {
  seconds: number;
  playing: boolean;
  speed: number;
  length: number;
  panels: { clock: string; players: number; ball: [number, number]; score: string }[];
}
interface Hook {
  seek: (seconds: number) => void;
  play: (playing: boolean) => void;
  state: () => State;
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    offline: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(
    () => !!(window as unknown as { naturalFootball?: Hook }).naturalFootball,
    {},
    { timeout: 30000 },
  );
  const state = () =>
    page.evaluate(() => (window as unknown as { naturalFootball: Hook }).naturalFootball.state());
  assert.equal(await page.locator('canvas').count(), 2);
  const initial = await state();
  assert.equal(initial.speed, 1);
  assert.equal(initial.playing, false);
  assert.deepEqual(
    initial.panels.map((p) => p.players),
    [22, 22],
  );
  assert.equal(initial.panels[0].clock, initial.panels[1].clock);
  const canvases = await page.locator('canvas').evaluateAll((nodes) =>
    nodes.map((node) => {
      const c = node as HTMLCanvasElement;
      const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      return pixels.some((v, i) => i % 4 === 0 && v > 150);
    }),
  );
  assert.deepEqual(canvases, [true, true]);
  for (const instant of [75, 21 * 60 + 1, 45 * 60, 50 * 60, initial.length - 1]) {
    const result = await page.evaluate((t) => {
      const h = (window as unknown as { naturalFootball: Hook }).naturalFootball;
      h.seek(t);
      return h.state();
    }, instant);
    assert.equal(result.panels[0].clock, result.panels[1].clock);
    const repeat = await page.evaluate((t) => {
      const h = (window as unknown as { naturalFootball: Hook }).naturalFootball;
      h.seek(0);
      h.seek(t);
      return h.state();
    }, instant);
    assert.deepEqual(result, repeat);
  }
  await page.evaluate(() =>
    (window as unknown as { naturalFootball: Hook }).naturalFootball.seek(75),
  );
  await page.keyboard.press('ArrowRight');
  assert.equal((await state()).seconds, 80);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state()).seconds, 75);
  await page.keyboard.press('Space');
  assert.equal((await state()).playing, true);
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  assert.equal((await state()).playing, false);
  assert.ok((await state()).seconds > 75);
  await page.locator('#speed').selectOption('4');
  assert.equal((await state()).speed, 4);
  await page.locator('#seek').fill('1261');
  assert.equal((await state()).seconds, 1261);
  const boxes = await page.locator('canvas').evaluateAll((nodes) =>
    nodes.map((n) => {
      const b = n.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width };
    }),
  );
  assert.equal(boxes[0].y, boxes[1].y);
  assert.ok(boxes[1].x > boxes[0].x + boxes[0].width);
  const screenshot = opt('screenshot');
  if (screenshot) {
    mkdirSync(dirname(resolve(screenshot)), { recursive: true });
    await page.screenshot({ path: resolve(screenshot), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      page: resolve(file),
      offline: true,
      panels: 2,
      players: initial.panels.map((p) => p.players),
      controls: true,
      repeatedSeek: true,
      desktopSideBySide: true,
      mobileOverflow: false,
      errors,
    }),
  );
} finally {
  await browser.close();
}
