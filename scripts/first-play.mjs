import { chromium, expect } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const origin = process.env.BENCHMARK_ORIGIN || 'http://127.0.0.1:4180';
function fingerprint(paths) {
  const hash = createHash('sha256');
  for (const file of paths.sort()) hash.update(file).update('\0').update(readFileSync(file));
  return { algorithm: 'sha256', sha256: hash.digest('hex'), files: paths.length };
}
function sourceFingerprint() {
  return fingerprint(
    execFileSync(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        'apps/web/src',
        'apps/web/index.html',
        'apps/web/public',
        'packages',
        'scripts',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'apps/web/vite.config.ts',
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean),
  );
}
const source = sourceFingerprint();
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const gitDirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
function outputPaths(root = 'apps/web/dist') {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? outputPaths(root + '/' + entry.name)
        : entry.isFile()
          ? [root + '/' + entry.name]
          : [],
    )
    .sort();
}
const buildPaths = outputPaths();
const assetPaths = buildPaths.filter((file) => /\.(js|css)$/.test(file));
const build = fingerprint(buildPaths);
const requestTimeoutMs = 5000,
  requestConcurrency = 4;
async function verifyServedFile(file) {
  const expected = readFileSync(file),
    expectedHash = createHash('sha256').update(expected).digest('hex'),
    relative = file.slice('apps/web/dist/'.length),
    url = new URL(relative === 'index.html' ? '/' : '/' + relative, origin).href;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(requestTimeoutMs),
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (response.status !== 200 || !response.body)
    throw new Error(`Served build mismatch: ${url} returned HTTP ${response.status}`);
  const reader = response.body.getReader(),
    hash = createHash('sha256');
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > expected.length) {
      await reader.cancel();
      throw new Error(`Served build mismatch: ${url} exceeds the local file's byte length`);
    }
    hash.update(value);
  }
  const sha256 = hash.digest('hex');
  if (bytes !== expected.length || sha256 !== expectedHash)
    throw new Error(`Served build mismatch: ${url} differs from the local production build`);
  return { file: relative, url, bytes, sha256 };
}
const servedFiles = [await verifyServedFile('apps/web/dist/index.html')];
for (let offset = 0; offset < assetPaths.length; offset += requestConcurrency) {
  const results = await Promise.allSettled(
    assetPaths.slice(offset, offset + requestConcurrency).map(verifyServedFile),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Served build verification failed before performance measurement',
    );
  for (const result of results) if (result.status === 'fulfilled') servedFiles.push(result.value);
}
const storageReport = JSON.parse(readFileSync('docs/benchmarks/T010-storage.json', 'utf8'));
if (!storageReport.passed || storageReport.sourceFingerprint?.sha256 !== source.sha256)
  throw new Error(
    'Run the storage benchmark against this working tree before browser verification',
  );
const browser = await chromium.launch();
try {
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
      window.pitchFrames = [];
      const fillRect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        if (
          args[0] === 0 &&
          args[1] === 0 &&
          this.canvas.getAttribute('aria-label') === '22명의 선수와 공으로 표현하는 경기'
        )
          window.pitchFrames.push(performance.now());
        return fillRect.apply(this, args);
      };
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
    await page.getByText('고급 설정', { exact: true }).click();
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
          const start = performance.now(),
            frames = window.pitchFrames.length;
          setTimeout(
            () =>
              resolve(((window.pitchFrames.length - frames) * 1000) / (performance.now() - start)),
            1500,
          );
        }),
    );
  }
  const desktop = await referencePage({ width: 1440, height: 1000 });
  const desktopInit = await create(desktop.page);
  await desktop.page.getByRole('button', { name: '다음 경기 관전' }).click();
  await expect(desktop.page.getByRole('button', { name: '결과 보기' })).toBeEnabled();
  const desktopFps = await fps(desktop.page);
  const firstPlayResources = Array.from(desktop.resources.values());
  await desktop.page.evaluate(() => {
    window.inputSamples = [];
  });
  // Thirty navigations make the p95 the second-slowest sample, so one shared-runner stall
  // cannot decide the gate on its own.
  for (let i = 0; i < 5; i++)
    for (const name of ['스태프', '선수단', '구단 운영', '리그', '유럽 무대', '역사 보관함'])
      await desktop.page.getByRole('button', { name, exact: true }).click();
  await desktop.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
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
  const mobileFirstPlayResources = Array.from(mobile.resources.values());
  await mobile.page.evaluate(() => {
    window.inputSamples = [];
  });
  for (let i = 0; i < 6; i++) {
    await mobile.page.getByRole('button', { name: '일시정지', exact: true }).click();
    await mobile.page.getByRole('button', { name: '재생', exact: true }).click();
  }
  await mobile.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const mobileSamples = await mobile.page.evaluate(() => window.inputSamples.sort((a, b) => a - b));
  if (mobileSamples.length < 10) throw new Error('Insufficient real mobile pointer samples');
  const mobilePointerP95Ms =
    mobileSamples[Math.min(mobileSamples.length - 1, Math.floor(mobileSamples.length * 0.95))];
  await mobile.page.screenshot({ path: '.tmp/screens/release-mobile.png', fullPage: true });
  const overflow = await mobile.page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  await mobile.context.close();
  const raw = readFileSync('.tmp/release-century.haeram-save.json', 'utf8'),
    envelope = JSON.parse(raw);
  const centuryCheckpointSha256 = createHash('sha256').update(raw).digest('hex');
  if (centuryCheckpointSha256 !== storageReport.centuryCheckpointSha256)
    throw new Error('Century checkpoint differs from the verified storage artifact');
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
  await expect(restored.getByTestId('calendar')).toContainText('2001/02');
  await expect(restored.getByTestId('save-status')).toContainText('저장 완료');
  const centuryLoadMs = performance.now() - t;
  await restoreContext.close();
  const buildFiles = assetPaths.map((path) => ({
    file: path.slice('apps/web/dist/assets/'.length),
    gzipBytes: gzipSync(readFileSync(path)).length,
  }));
  const buildGzipBytes = buildFiles.reduce((sum, file) => sum + file.gzipBytes, 0);
  const entryPaths = Array.from(
    readFileSync('apps/web/dist/index.html', 'utf8').matchAll(
      /(?:src|href)="([^"?#]+\.(?:js|css))"/g,
    ),
    (match) => 'apps/web/dist' + match[1],
  );
  if (
    !entryPaths.some((path) => path.endsWith('.js')) ||
    !entryPaths.some((path) => path.endsWith('.css'))
  )
    throw new Error('Built entry must declare JavaScript and CSS');
  const entryFiles = entryPaths.map((path) => ({
    file: path.slice('apps/web/dist/'.length),
    gzipBytes: gzipSync(readFileSync(path)).length,
  }));
  const entryGzipBytes = entryFiles.reduce((sum, file) => sum + file.gzipBytes, 0);
  if (
    sourceFingerprint().sha256 !== source.sha256 ||
    fingerprint(outputPaths()).sha256 !== build.sha256
  )
    throw new Error(
      'Source or build changed during browser verification; rerun after edits settle',
    );
  const report = {
    date: new Date().toISOString(),
    browser: await browser.version(),
    playwright: JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8'))
      .version,
    node: process.version,
    gitHead,
    gitDirty,
    currentHeadVerified: !gitDirty,
    verifiedSource: gitDirty ? 'uncommitted working tree' : 'committed HEAD',
    sourceFingerprint: source,
    buildFingerprint: build,
    servedBuildVerification: {
      origin,
      requestTimeoutMs,
      requestConcurrency,
      files: servedFiles,
      passed: true,
    },
    synthetic: true,
    reference,
    desktop: { viewport: [1440, 1000], ...desktopInit, animationFps: Math.round(desktopFps) },
    mobile: {
      viewport: [390, 844],
      deviceScaleFactor: 2,
      ...mobileInit,
      animationFps: Math.round(mobileFps),
      inputSamples: mobileSamples.length,
      pointerToSecondFrameP95Ms: Math.round(mobilePointerP95Ms),
    },
    entryGzipBytes,
    entryGzipLimit: 250 * 1024,
    entryFiles,
    buildGzipBytes,
    // ARCH-28 budgets the initial entry; the full inventory, worker engine included, is reported.
    buildGzipLimit: null,
    buildFiles,
    firstPlayPageTargetTransfers: firstPlayResources,
    mobileFirstPlayPageTargetTransfers: mobileFirstPlayResources,
    firstPlayPageTargetTransferBytes: firstPlayResources.reduce(
      (sum, resource) => sum + resource.bytes,
      0,
    ),
    mobileFirstPlayPageTargetTransferBytes: mobileFirstPlayResources.reduce(
      (sum, resource) => sum + resource.bytes,
      0,
    ),
    transferNote:
      'Page-target CDP transfers may omit dedicated-worker target requests; build inventory additionally counts every worker/lazy JavaScript and CSS file as a conservative upper bound.',
    centuryLoadMs: Math.round(centuryLoadMs),
    centuryCheckpointSha256,
    centuryRestoreReference: 'Separate unthrottled 100-season initialization measurement',
    initializationLimitMs: 5000,
    inputSamples: samples.length,
    pointerToSecondFrameP95Ms: Math.round(pointerP95Ms),
    inputLimitMs: 100,
    minimumFps: 30,
    mobileHorizontalOverflow: overflow,
    pageErrors: errors,
    passed:
      entryGzipBytes <= 250 * 1024 &&
      centuryLoadMs <= 5000 &&
      desktopInit.foundingCommandMs <= 5000 &&
      mobileInit.foundingCommandMs <= 5000 &&
      pointerP95Ms < 100 &&
      mobilePointerP95Ms < 100 &&
      desktopFps >= 30 &&
      mobileFps >= 30 &&
      !overflow &&
      !errors.length,
    scope:
      'Built Netlify-policy local CSP preview. Reference pages use CDP 4x page CPU slowdown and cold Fast 4G (9/1.5 Mbps,60ms); mobile uses DPR2. FPS counts actual pitch background paints during playback. Pointer-to-second-frame measures presentation latency for post-founding navigation/replay controls. Entry JavaScript/CSS is budgeted; the conservative all-asset compressed inventory, including the lazy engine worker, is reported separately; page-target transfers may omit worker targets. No universal device-speed or live-provider validation claim.',
  };
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync('docs/benchmarks/T010-first-play.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
