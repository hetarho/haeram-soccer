import { chromium, expect } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const origin = process.env.BENCHMARK_ORIGIN || 'http://127.0.0.1:4180';
/** ARCH-28: the initial entry's JavaScript and CSS, compressed. */
const ENTRY_GZIP_LIMIT = 250 * 1024;
/**
 * The entry as it stands without the full model's release, already over ARCH-28's budget (T286):
 * the production build of the release source with `MATCH_MODEL_RELEASE` off (e4de4490, T286 with
 * T437–T450 merged). It was 283,083 bytes at 74cddf3, 283,098 after T283 and 300,192 (972,162 raw)
 * at f1400a8b; the work merged since (T286 at f5fc5c09, T437–T450) adds 445 raw bytes and the
 * record check 4. The release adds no entry code (the same source with the switch on builds the
 * same 972,611 entry bytes; only the lazy chunks' hashed names differ), so the release run fails
 * on an entry above this, while the excess up to it is reported against the budget with its
 * follow-up instead of being counted as the release's failure.
 */
const ENTRY_BEFORE_RELEASE = {
  gzipBytes: 300_378,
  rawBytes: 972_611,
  source:
    'e4de4490 production build, MATCH_MODEL_RELEASE off (T286; f1400a8b: 300,192 gzip, 972,162 raw)',
  followUp:
    'a first-play entry task: move eager screens and shared schema/settlement modules out of the entry until it is at most 256,000 gzip bytes (→ARCH-28)',
};
/** Hashed chunk names inside the entry compress a few bytes differently from build to build. */
const ENTRY_NAME_SLACK_BYTES = 64;
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
        'patches',
        'tests/fixtures/retained-workload.ts',
        'tests/fixtures/identity-workload.ts',
        'tests/fixtures/full-model-workload.ts',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
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
const storageReport = JSON.parse(readFileSync('artifacts/benchmarks/T010-storage.json', 'utf8'));
if (!storageReport.passed || storageReport.sourceFingerprint?.sha256 !== source.sha256)
  throw new Error(
    'Run the storage benchmark against this working tree before browser verification',
  );
// The identity feature evidence the storage benchmark wrote for this same source (T255).
const identityReport = JSON.parse(
  readFileSync('artifacts/benchmarks/club-identity-final.json', 'utf8'),
);
if (!identityReport.storagePassed || identityReport.sourceFingerprint?.sha256 !== source.sha256)
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
      // The ground is painted once into a cached surface and drawn whole each frame since the
      // themed pitch materials (341b83cf): that draw at the origin is the frame's background paint.
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (
          args.length >= 5 &&
          args[1] === 0 &&
          args[2] === 0 &&
          this.canvas.getAttribute('aria-label') === '22명의 선수와 공으로 표현하는 경기'
        )
          window.pitchFrames.push(performance.now());
        return drawImage.apply(this, args);
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
  /**
   * The founded club's next fixture in its home shirt, whose founding draft is striped (KIT-14):
   * chosen through preparation's real match-kit selector, so the observed pitch paints a recorded
   * patterned shirt rather than the plain pair automatic selection gives the reference fixture.
   */
  async function wearHomeShirt(page) {
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '전술·선발 준비', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    const kit = dialog.getByTestId('fixture-kit');
    await kit.getByTestId('fixture-kit-summary').click();
    await kit.getByRole('radio', { name: '우리 홈 유니폼', exact: true }).click();
    await kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }).click();
    // The command waits for queued work; give the throttled page more than the default 5 s.
    await expect(kit.getByTestId('fixture-kit-message')).toContainText('홈 유니폼으로 정했어요.', {
      timeout: 15000,
    });
    await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const outcome = page.getByTestId('action-outcome');
    await outcome.getByRole('button', { name: '확인', exact: true }).click();
    await expect(outcome).toHaveCount(0);
  }
  /** The two shirts the match legend names for the observed playback, from its recorded look. */
  async function observedKits(page) {
    const swatches = page.getByTestId('match-theatre').getByRole('img', { name: /유니폼/ });
    await expect(swatches).toHaveCount(2);
    const labels = await swatches.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label') ?? ''),
    );
    return labels.map((label) => ({
      label,
      pattern: label.slice(label.lastIndexOf(': ') + 2).split(', ')[0],
      recorded: !label.includes('유니폼 미기록'),
    }));
  }
  /**
   * Watches the next match the way the owner reaches it on the streamlined home (b4d1c7f0 removed
   * the menu's direct watch; tests/e2e/watch.ts's openWatchAction is the journeys' form): the
   * calendar runs to the match-eve observation, earlier cards are read (확인) or declined (거절),
   * and the eve card's 관전하기 starts the live match.
   */
  async function watchNextMatch(page) {
    const cards = page.getByTestId('event-card');
    const watch = cards.getByRole('button', { name: '관전하기 ▶', exact: true });
    const report = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'NEXT MATCH', exact: true }) });
    for (let step = 0; step < 80 && !(await watch.isVisible()); step++) {
      if (await report.isVisible())
        await report.getByRole('button', { name: '창 닫기', exact: true }).click();
      const pill = page.getByTestId('event-pill');
      if (await pill.isVisible()) await pill.click();
      if (await watch.isVisible()) break;
      const card = cards.first();
      const text = (await card.count()) ? await card.innerText() : '';
      if (text && !text.includes('내일 경기')) {
        const read = card.getByRole('button', { name: '확인', exact: true });
        await (
          (await read.count()) ? read : card.getByRole('button', { name: '거절', exact: true })
        ).click();
        continue;
      }
      const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
      const play = page.getByRole('button', { name: '자동 진행 시작', exact: true });
      if (await next.isVisible()) await next.click();
      else if (await play.isVisible()) await play.click();
      await expect
        .poll(async () => (await watch.isVisible()) || (await cards.count()) > 0, {
          timeout: 60000,
        })
        .toBe(true);
    }
    await watch.click();
    await page.getByTestId('match-theatre').waitFor({ state: 'visible' });
  }
  const patterned = (kits) =>
    kits.length === 2 &&
    kits.every((kit) => kit.recorded) &&
    kits.some((kit) => kit.pattern !== '단색');
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
  await wearHomeShirt(desktop.page);
  await watchNextMatch(desktop.page);
  await expect(desktop.page.getByRole('button', { name: '결과 보기' })).toBeEnabled();
  const desktopFps = await fps(desktop.page);
  const desktopKits = await observedKits(desktop.page);
  const firstPlayResources = Array.from(desktop.resources.values());
  await desktop.page.evaluate(() => {
    window.inputSamples = [];
  });
  // Thirty navigations make the p95 the second-slowest sample, so one shared-runner stall
  // cannot decide the gate on its own. Sample all six primary destinations (→WEB-10).
  const desktopNav = desktop.page.getByRole('navigation', { name: '게임 메뉴', exact: true });
  for (let i = 0; i < 5; i++)
    for (const name of ['1군', '유소년', '코치진', '시즌', '역사', '클럽 홈'])
      await desktopNav.getByRole('button', { name, exact: true }).click();
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
  await wearHomeShirt(mobile.page);
  await watchNextMatch(mobile.page);
  await expect(mobile.page.getByRole('button', { name: '결과 보기' })).toBeEnabled();
  const mobileFps = await fps(mobile.page);
  const mobileKits = await observedKits(mobile.page);
  const mobileFirstPlayResources = Array.from(mobile.resources.values());
  await mobile.page.evaluate(() => {
    window.inputSamples = [];
  });
  // Live observation offers speeds only (no pause): sample real taps on two of them.
  const speeds = mobile.page.getByRole('radiogroup', { name: '관전 속도', exact: true });
  for (let i = 0; i < 6; i++) {
    await speeds.getByRole('radio', { name: '2×', exact: true }).click();
    await speeds.getByRole('radio', { name: '1×', exact: true }).click();
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
  // An in-game address continues the game in play without the slot screen (→WEB-62), so this
  // measures loading the century career itself.
  await restored.goto(`${origin}/journal`);
  // The century checkpoint is 100 seasons after the 1950 founding: the progress controls' calendar
  // names its season (the date line reads 2050년 8월 1일 since the controls were compacted).
  await expect(restored.locator('[data-testid="calendar"][data-season]')).toHaveAttribute(
    'data-season',
    '2050',
  );
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
  const entryRawBytes = entryPaths.reduce((sum, path) => sum + readFileSync(path).length, 0);
  const entry = {
    gzipBytes: entryGzipBytes,
    rawBytes: entryRawBytes,
    limit: ENTRY_GZIP_LIMIT,
    withinBudget: entryGzipBytes <= ENTRY_GZIP_LIMIT,
    beforeRelease: ENTRY_BEFORE_RELEASE,
    // Growth past the entry the release started from: a regression, whatever its cause.
    regression:
      entryGzipBytes >
      Math.max(ENTRY_GZIP_LIMIT, ENTRY_BEFORE_RELEASE.gzipBytes + ENTRY_NAME_SLACK_BYTES),
    nameSlackBytes: ENTRY_NAME_SLACK_BYTES,
  };
  if (
    sourceFingerprint().sha256 !== source.sha256 ||
    fingerprint(outputPaths()).sha256 !== build.sha256
  )
    throw new Error(
      'Source or build changed during browser verification; rerun after edits settle',
    );
  const patternRendering = patterned(desktopKits) && patterned(mobileKits);
  // ARCH-28's budgets other than the entry's, which `entry` reports against its own baseline.
  const budgetsPassed =
    centuryLoadMs <= 5000 &&
    desktopInit.foundingCommandMs <= 5000 &&
    mobileInit.foundingCommandMs <= 5000 &&
    pointerP95Ms < 100 &&
    mobilePointerP95Ms < 100 &&
    desktopFps >= 30 &&
    mobileFps >= 30 &&
    !overflow &&
    patternRendering &&
    !errors.length;
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
    desktop: {
      viewport: [1440, 1000],
      ...desktopInit,
      animationFps: Math.round(desktopFps),
      observedKits: desktopKits,
    },
    mobile: {
      viewport: [390, 844],
      deviceScaleFactor: 2,
      ...mobileInit,
      animationFps: Math.round(mobileFps),
      observedKits: mobileKits,
      inputSamples: mobileSamples.length,
      pointerToSecondFrameP95Ms: Math.round(mobilePointerP95Ms),
    },
    entryGzipBytes,
    entryGzipLimit: ENTRY_GZIP_LIMIT,
    entry,
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
    patternRendering,
    pageErrors: errors,
    // Every ARCH-28 budget, the entry's included: false while the entry stays over its budget.
    passed: budgetsPassed && entry.withinBudget,
    // The release run's gate: every other budget, and no entry growth past `entry.beforeRelease`.
    releasePassed: budgetsPassed && !entry.regression,
    scope:
      'Built Netlify-policy local CSP preview. Reference pages use CDP 4x page CPU slowdown and cold Fast 4G (9/1.5 Mbps,60ms); mobile uses DPR2. FPS counts actual pitch background paints during playback, after the founded club chose its striped home shirt for that fixture in preparation, so both pitches paint a recorded patterned shirt (observedKits names the worn shirts from the match legend). Pointer-to-second-frame measures presentation latency for post-founding navigation/replay controls. Entry JavaScript/CSS is budgeted; the conservative all-asset compressed inventory, including the lazy engine worker, is reported separately; page-target transfers may omit worker targets. No universal device-speed or live-provider validation claim.',
  };
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync(
    'artifacts/benchmarks/T010-first-play.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  // T255: the browser half of the identity feature evidence, beside the storage run's facts.
  writeFileSync(
    'artifacts/benchmarks/club-identity-final.json',
    JSON.stringify(
      {
        ...identityReport,
        browser: {
          report: 'artifacts/benchmarks/T010-first-play.json',
          date: report.date,
          browser: report.browser,
          playwright: report.playwright,
          gitHead,
          gitDirty,
          sourceFingerprint: source,
          buildFingerprint: build,
          entryGzipBytes,
          entryGzipLimit: report.entryGzipLimit,
          entry,
          buildGzipBytes,
          firstPlayPageTargetTransferBytes: report.firstPlayPageTargetTransferBytes,
          mobileFirstPlayPageTargetTransferBytes: report.mobileFirstPlayPageTargetTransferBytes,
          foundingCommandMs: [desktopInit.foundingCommandMs, mobileInit.foundingCommandMs],
          centuryLoadMs: report.centuryLoadMs,
          initializationLimitMs: report.initializationLimitMs,
          pointerToSecondFrameP95Ms: [
            report.pointerToSecondFrameP95Ms,
            report.mobile.pointerToSecondFrameP95Ms,
          ],
          inputLimitMs: report.inputLimitMs,
          animationFps: [report.desktop.animationFps, report.mobile.animationFps],
          minimumFps: report.minimumFps,
          observedKits: { desktop: desktopKits, mobile: mobileKits },
          patternRendering,
          pageErrors: errors,
          passed: report.passed,
          releasePassed: report.releasePassed,
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(report);
  if (!report.releasePassed) process.exitCode = 1;
} finally {
  await browser.close();
}
