import { chromium, expect } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const origin = 'http://127.0.0.1:4180';
const browser = await chromium.launch();
const errors = [];
const reference = {
  pageCpuSlowdown: 4,
  network: 'Fast 4G',
  downloadMbps: 9,
  uploadMbps: 1.5,
  latencyMs: 60,
  seed: 'first-play-reference',
};
async function referencePage(viewport, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.inputSamples = [];
    document.addEventListener(
      'pointerdown',
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.inputSamples.push(performance.now() - start)),
        );
      },
      true,
    );
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: 9000000 / 8,
    uploadThroughput: 1500000 / 8,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const resources = new Map();
  cdp.on('Network.responseReceived', (event) =>
    resources.set(event.requestId, { url: event.response.url, type: event.type, bytes: 0 }),
  );
  cdp.on('Network.loadingFinished', (event) => {
    const item = resources.get(event.requestId);
    if (item) item.bytes = event.encodedDataLength;
  });
  return { context, page, resources };
}
async function create(page) {
  const start = performance.now();
  await page.goto(origin);
  await page.getByLabel('세계 생성 시드').fill(reference.seed);
  await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
  const command = performance.now();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return {
    coldLoadAndFoundMs: Math.round(performance.now() - start),
    foundingCommandMs: Math.round(performance.now() - command),
  };
}
async function fps(page) {
  return await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0,
          start = 0;
        function frame(now) {
          if (!start) start = now;
          count++;
          if (now - start >= 1200) resolve((count * 1000) / (now - start));
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }),
  );
}
const desktop = await referencePage({ width: 1440, height: 1000 });
const desktopInit = await create(desktop.page);
const firstPlayResources = Array.from(desktop.resources.values());
await desktop.page.getByRole('button', { name: '다음 경기 관전' }).click();
await expect(desktop.page.getByRole('button', { name: '결과 보기' })).toBeEnabled();
const desktopFps = await fps(desktop.page);
for (let i = 0; i < 3; i++)
  for (const name of ['감독실', '선수와 영입', '클럽 경영', '리그', '유럽 무대', '클럽 일지'])
    await desktop.page.getByRole('button', { name, exact: true }).click();
const samples = await desktop.page.evaluate(() => window.inputSamples.sort((a, b) => a - b));
if (samples.length < 10) throw new Error('Insufficient real pointer samples');
const pointerP95Ms = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
mkdirSync('.tmp/screens', { recursive: true });
await desktop.page.screenshot({ path: '.tmp/screens/release-desktop.png', fullPage: true });
await desktop.context.close();
const mobile = await referencePage({ width: 390, height: 844 }, 2);
const mobileInit = await create(mobile.page);
await mobile.page.getByRole('button', { name: '다음 경기 관전' }).click();
await expect(mobile.page.getByRole('button', { name: '결과 보기' })).toBeEnabled();
const mobileFps = await fps(mobile.page);
await mobile.page.screenshot({ path: '.tmp/screens/release-mobile.png', fullPage: true });
const overflow = await mobile.page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await mobile.context.close();
const raw = readFileSync('.tmp/release-century.haeram-save.json', 'utf8'),
  envelope = JSON.parse(raw);
const restoreContext = await browser.newContext();
await restoreContext.addInitScript(
  ({ raw, envelope }) => {
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  },
  { raw, envelope },
);
const restored = await restoreContext.newPage();
restored.on('pageerror', (error) => errors.push(error.message));
const t = performance.now();
await restored.goto(origin);
await expect(restored.getByTestId('calendar')).toContainText('시즌 2001');
await expect(restored.getByTestId('save-status')).toContainText('저장 완료');
const centuryLoadMs = performance.now() - t;
const buildFiles = readdirSync('apps/web/dist/assets')
  .filter((f) => /\.(js|css)$/.test(f))
  .map((file) => ({
    file,
    gzipBytes: gzipSync(readFileSync('apps/web/dist/assets/' + file)).length,
  }));
const buildGzipBytes = buildFiles.reduce((sum, file) => sum + file.gzipBytes, 0);
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  synthetic: true,
  reference,
  desktop: { viewport: [1440, 1000], ...desktopInit, animationFps: Math.round(desktopFps) },
  mobile: {
    viewport: [390, 844],
    deviceScaleFactor: 2,
    ...mobileInit,
    animationFps: Math.round(mobileFps),
  },
  buildGzipBytes,
  buildGzipLimit: 250 * 1024,
  buildFiles,
  firstPlayPageTargetTransfers: firstPlayResources,
  transferNote:
    'Page-target CDP transfers may omit dedicated-worker target requests; build inventory additionally counts every worker/lazy JavaScript and CSS file as a conservative upper bound.',
  centuryLoadMs: Math.round(centuryLoadMs),
  centuryRestoreReference: 'Separate unthrottled 100-season initialization measurement',
  initializationLimitMs: 5000,
  inputSamples: samples.length,
  pointerToSecondFrameP95Ms: Math.round(pointerP95Ms),
  inputLimitMs: 100,
  minimumFps: 30,
  mobileHorizontalOverflow: overflow,
  pageErrors: errors,
  passed:
    buildGzipBytes <= 250 * 1024 &&
    desktopInit.foundingCommandMs <= 5000 &&
    mobileInit.foundingCommandMs <= 5000 &&
    pointerP95Ms < 100 &&
    desktopFps >= 30 &&
    mobileFps >= 30 &&
    !overflow &&
    !errors.length,
  scope:
    'Built Netlify-policy local CSP preview. Reference pages use CDP 4x page CPU slowdown and cold Fast 4G (9/1.5 Mbps,60ms); mobile uses DPR2. Pointer-to-second-frame measures presentation latency. No universal device-speed or live-provider validation claim.',
};
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/T010-first-play.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
await browser.close();
if (!report.passed) process.exitCode = 1;
