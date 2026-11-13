/**
 * World generation on the reference trace (→ARCH-28, T667): the built preview in the pinned
 * Chromium at 390x844 (DPR 2) with cold Fast 4G loading, generating 1930 → the chosen decade
 * through the start flow on screen and taking the first club the fortune pays for over. Records the
 * generation time and the seasons its progress named, the renderer's CPU time and peak memory, the
 * engine worker's JS heap, and the first checkpoint.
 *
 * Generation runs in the engine worker, which DevTools' CPU throttling does not reach (a worker
 * target answers `Emulation.setCPUThrottlingRate` with "only supported for pages"). Modes:
 *   x1          no slowdown;
 *   cdp-x4      the page's main thread at 4x through DevTools, as first-play.mjs throttles;
 *   process-x4  every renderer process, main thread and workers alike, runs 1 of each 4 slices
 *               (SIGSTOP/SIGCONT from a helper process, 5 ms run / 15 ms stopped).
 *
 *   pnpm run build
 *   pnpm exec tsx scripts/generation-budget.ts [--decades 1930,1970,2000] [--modes process-x4,x1]
 *     [--seed generation-reference] [--out artifacts/benchmarks/T667-generation.json] [--append]
 *     [--task T667] [--beside artifacts/benchmarks/T667-generation.json]
 *
 * Each run also records the host's load average, the time a season played, the progress replies
 * carrying the history view's digest and the feat cards it showed (→WEB-115, T679).
 *
 * Memory and CPU time come from /proc (VmHWM, utime + stime), so they read 0 off Linux; the
 * slowdown is signals to the renderer processes this script's browser started (Linux and macOS).
 */
import { chromium, expect, type CDPSession, type Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OWNER_TIERS } from '../packages/engine/src/owner-config';

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1]! : fallback;
};
type Mode = 'x1' | 'cdp-x4' | 'process-x4';
const decades = arg('decades', '1930,1970,2000').split(',').map(Number);
const modes = arg('modes', 'process-x4,x1').split(',') as Mode[];
for (const mode of modes)
  if (!['x1', 'cdp-x4', 'process-x4'].includes(mode)) throw new Error(`Unknown mode ${mode}`);
/** The process slowdown's slices: runs RUN_MS, stops 3 × RUN_MS. */
const RUN_MS = 5;
const TICK_HZ = 100;
const seed = arg('seed', 'generation-reference');
const out = arg('out', 'artifacts/benchmarks/T667-generation.json');
const listingTimeoutMs = Number(arg('listing-timeout-ms', '1800000'));
const port = Number(process.env.GENERATION_BENCH_PORT || 4291);
const origin = `http://127.0.0.1:${port}`;
/** ARCH-28's budgets and the checkpoint limits a takeover's first save must meet (→SAVE-4). */
const BUDGET_MS: Record<number, number> = { 1930: 5000, 2000: 90000 };
const MiB = 1024 * 1024;
const load = () => os.loadavg().map((value) => Math.round(value * 10) / 10);

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(root, entry.name))
        : entry.isFile()
          ? [path.join(root, entry.name)]
          : [],
    )
    .sort();
}
const dist = files('apps/web/dist');
const buildHash = createHash('sha256');
for (const file of dist) buildHash.update(file).update('\0').update(readFileSync(file));
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
/** Indented JSON with each timeline sample, renderer list and season mark on one line. */
const compactJson = (value: unknown) =>
  JSON.stringify(value, null, 2)
    .replace(/\[\n\s+(\d+),\n\s+(\d+),\n\s+(\d+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+(\d+)\n\s+\]/g, '[$1]')
    .replace(/\{\n\s+"season": (\d+),\n\s+"atMs": (\d+)\n\s+\}/g, '{ "season": $1, "atMs": $2 }');

/** A renderer process's resident and peak resident memory (kB) and CPU time (ms) from /proc. */
function procMemory(pid: number) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const kib = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(status)?.[1]);
    // utime and stime are the 14th and 15th fields, after the parenthesised command name.
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const cpuMs = ((Number(fields[11]) + Number(fields[12])) * 1000) / TICK_HZ;
    return { rssKiB: kib('VmRSS'), peakKiB: kib('VmHWM'), cpuMs };
  } catch {
    return undefined;
  }
}
async function renderers(browserCdp: CDPSession) {
  const { processInfo } = (await browserCdp.send('SystemInfo.getProcessInfo')) as {
    processInfo: { type: string; id: number }[];
  };
  return processInfo
    .filter((item) => item.type === 'renderer')
    .map((item) => ({ pid: item.id, ...procMemory(item.id) }));
}

/**
 * Slows the given processes to a quarter: a helper process stops them for 3 slices of each 4. It
 * continues them before it exits on SIGTERM, so a stopped renderer is never left behind.
 */
function slowDown(pids: number[]) {
  const helper = `
    const [run, ...pids] = process.argv.slice(1).map(Number);
    const cell = new Int32Array(new SharedArrayBuffer(4));
    const each = (signal) => { for (const pid of pids) try { process.kill(pid, signal); } catch {} };
    let on = true;
    process.on('SIGTERM', () => { on = false; });
    const cycle = () => {
      if (!on) { each('SIGCONT'); process.exit(0); }
      each('SIGCONT'); Atomics.wait(cell, 0, 0, run);
      each('SIGSTOP'); Atomics.wait(cell, 0, 0, 3 * run);
      setImmediate(cycle);
    };
    process.on('exit', () => each('SIGCONT'));
    cycle();`;
  const child = spawn(process.execPath, ['-e', helper, String(RUN_MS), ...pids.map(String)], {
    stdio: 'ignore',
  });
  return () =>
    new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
}

/**
 * The page's workers through a second DevTools client (non-flattened sessions, so messages reach
 * a worker through `Target.sendMessageToTarget`), for their heaps; with a rate, each is asked for
 * the page's CPU slowdown as it attaches and the answer is kept.
 */
function workerSessions(cdp: CDPSession, rate?: number) {
  const workers = new Map<string, { url: string; throttle: string }>();
  const calls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let next = 1;
  const send = <T>(sessionId: string, method: string, params = {}, timeoutMs = 3000) =>
    new Promise<T>((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => {
        calls.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      calls.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error: Error) => calls.get(id)?.reject(error));
    });
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const message = JSON.parse(event.message);
    const call = calls.get(message.id);
    if (!call) return;
    calls.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  cdp.on('Target.attachedToTarget', (event) => {
    if (event.targetInfo.type !== 'worker') return;
    const worker = { url: event.targetInfo.url, throttle: rate ? 'pending' : 'none' };
    workers.set(event.sessionId, worker);
    if (rate)
      send(event.sessionId, 'Emulation.setCPUThrottlingRate', { rate }).then(
        () => (worker.throttle = `rate ${rate}`),
        (error: Error) => (worker.throttle = `failed: ${error.message}`),
      );
  });
  cdp.on('Target.detachedFromTarget', (event) => workers.delete(event.sessionId));
  return {
    workers,
    send,
    attach: () =>
      cdp.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: false,
      }),
  };
}

// Page scripts are plain strings: tsx's transform would wrap functions passed to the page in helpers
// the page does not have.
/** Records, on the page's clock, the generate request, each season reached and the club list. */
const MARKS = `
  window.generationMarks = [];
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (typeof data.season === 'number' && 'progress' in data)
          window.generationMarks.push({
            kind: 'season',
            season: data.season,
            digest: !!data.digest,
            at: performance.now(),
          });
        else if (data.start) window.generationMarks.push({ kind: 'listed', at: performance.now() });
      });
    }
    postMessage(message, options) {
      const type = message && message.body && message.body.type;
      if (type === 'generate' || type === 'take-over')
        window.generationMarks.push({ kind: type, at: performance.now() });
      return super.postMessage(message, options);
    }
  };
  // Each feat card the history view shows (→WEB-115).
  let shownCard = null;
  new MutationObserver(() => {
    const card = document.querySelector('[data-testid="generation-feat"]');
    if (card && card !== shownCard)
      window.generationMarks.push({ kind: 'card', feat: card.dataset.feat, at: performance.now() });
    shownCard = card;
  }).observe(document, { childList: true, subtree: true });`;

/** The committed checkpoint of the game in play (→SAVE-3), read back from IndexedDB. */
const ACTIVE_CHECKPOINT = `new Promise((resolve, reject) => {
  const open = indexedDB.open('haeram-soccor');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const request = open.result.transaction('checkpoints').objectStore('checkpoints').get('active');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const raw = request.result;
      open.result.close();
      const envelope = JSON.parse(raw);
      const payload = typeof envelope.payload === 'string' ? envelope.payload : '';
      resolve({
        utf16Units: raw.length,
        conservativeUtf16Bytes: (raw.length + 'active'.length) * 2,
        utf8Bytes: new TextEncoder().encode(raw).length,
        payloadUnits: payload.length,
        codec: envelope.codec,
        generation: envelope.generation,
        fields: Object.keys(envelope),
      });
    };
  };
})`;

async function run(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  browserCdp: CDPSession,
  decade: number,
  mode: Mode,
) {
  const pageRate = mode === 'cdp-x4' ? 4 : 1;
  const loadAtStart = load();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript({ content: MARKS });
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
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: pageRate });
  const workers = workerSessions(cdp, pageRate > 1 ? pageRate : undefined);
  await workers.attach();
  const loadStart = performance.now();
  await page.goto(origin);
  const flow = page.getByTestId('start-flow');
  await expect(flow).toBeVisible({ timeout: 120000 });
  const coldLoadMs = Math.round(performance.now() - loadStart);
  // The process slowdown starts once the page's renderer has loaded (its cold load is not slowed).
  const slowed = (await renderers(browserCdp)).map((item) => item.pid);
  const resume = mode === 'process-x4' ? slowDown(slowed) : async () => {};
  let stopSampling = async () => {};
  try {
    console.log(`${decade} ${mode}: loaded in ${coldLoadMs} ms; renderers ${slowed.join(', ')}`);
    await flow
      .getByTestId('start-tiers')
      .getByRole('button', { name: OWNER_TIERS.oil.label })
      .click();
    await flow.getByRole('button', { name: '다음 →', exact: true }).click();
    await expect(flow.getByTestId('start-traits')).toBeVisible();
    await flow.getByRole('button', { name: '다음 →', exact: true }).click();
    await flow
      .getByTestId('start-decades')
      .getByRole('button', { name: `${decade}년대` })
      .click();
    await flow.getByText('고급 설정', { exact: true }).click();
    await flow.getByLabel('세계 생성 시드').fill(seed);
    const button = flow.getByRole('button', { name: '세계 생성 →', exact: true });
    await expect(button).toBeEnabled();

    // Samples memory and heaps once a second while the world is generated.
    const samples: {
      atMs: number;
      renderers: { pid: number; rssKiB?: number; peakKiB?: number; cpuMs?: number }[];
      workerHeaps: { url: string; usedBytes?: number; error?: string }[];
      pageHeapBytes?: number;
    }[] = [];
    let sampling = true;
    const cpuAt = async () =>
      (await renderers(browserCdp)).reduce((sum, item) => sum + (item.cpuMs ?? 0), 0);
    const cpuBefore = await cpuAt();
    const clicked = performance.now();
    const sampler = (async () => {
      while (sampling) {
        const processes = await renderers(browserCdp);
        const workerHeaps = await Promise.all(
          [...workers.workers].map(([sessionId, worker]) =>
            workers.send<{ usedSize: number }>(sessionId, 'Runtime.getHeapUsage', {}, 2000).then(
              (heap) => ({ url: worker.url, usedBytes: heap.usedSize }),
              (error: Error) => ({ url: worker.url, error: error.message }),
            ),
          ),
        );
        const pageHeap = (await cdp.send('Runtime.getHeapUsage').catch(() => undefined)) as
          { usedSize: number } | undefined;
        samples.push({
          atMs: Math.round(performance.now() - clicked),
          renderers: processes,
          workerHeaps,
          pageHeapBytes: pageHeap?.usedSize,
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();
    stopSampling = async () => {
      sampling = false;
      await sampler;
    };
    await button.click();
    const listing = flow.getByTestId('club-listing');
    await expect(listing).toBeVisible({ timeout: listingTimeoutMs });
    const generationMs = Math.round(performance.now() - clicked);
    const generationCpuMs = Math.round((await cpuAt()) - cpuBefore);
    const loadAtListing = load();
    console.log(`${decade} ${mode}: club list after ${generationMs} ms, load ${loadAtListing[0]}`);
    const pageMarks = (await page.evaluate('window.generationMarks')) as {
      kind: string;
      at: number;
      season?: number;
      digest?: boolean;
      feat?: string;
    }[];

    // Takes the first club the fortune pays for over and reads its first checkpoint back.
    const row = listing.locator('button[data-affordable="true"]').first();
    const club = (await row.locator('b').first().textContent())!.trim();
    await row.click();
    const sheet = page.getByRole('dialog', { name: club, exact: true });
    await expect(sheet.getByTestId('club-sheet')).toBeVisible({ timeout: 120000 });
    await sheet.getByRole('button', { name: '인수 검토 →', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: `${club} 인수`, exact: true });
    await expect(confirm.getByTestId('takeover-confirm')).toBeVisible({ timeout: 120000 });
    const takeoverStart = performance.now();
    await confirm.getByRole('button', { name: '인수 확정', exact: true }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 600000 });
    const hubMs = Math.round(performance.now() - takeoverStart);
    console.log(`${decade} ${mode}: club hub ${hubMs} ms after the takeover`);
    await expect(page.getByTestId('save-status')).toContainText('저장 완료', { timeout: 600000 });
    const savedMs = Math.round(performance.now() - takeoverStart);
    sampling = false;
    await sampler;
    const checkpoint = (await page.evaluate(ACTIVE_CHECKPOINT)) as {
      conservativeUtf16Bytes: number;
    };
    const worker = [...workers.workers.values()].map(({ url, throttle }) => ({ url, throttle }));

    const request = pageMarks.find((mark) => mark.kind === 'generate');
    const listed = pageMarks.find((mark) => mark.kind === 'listed');
    const seasons = pageMarks
      .filter((mark) => mark.kind === 'season')
      .map((mark) => ({ season: mark.season!, atMs: Math.round(mark.at - (request?.at ?? 0)) }));
    const peakRendererKiB = Math.max(
      0,
      ...samples.flatMap((sample) => sample.renderers.map((item) => item.peakKiB ?? 0)),
    );
    const peakWorkerHeapBytes = Math.max(
      0,
      ...samples.flatMap((sample) => sample.workerHeaps.map((heap) => heap.usedBytes ?? 0)),
    );
    const peakPageHeapBytes = Math.max(0, ...samples.map((sample) => sample.pageHeapBytes ?? 0));
    const workerGenerationMs = request && listed ? Math.round(listed.at - request.at) : null;
    const perSeason = (ms: number | null) =>
      ms !== null && seasons.length ? Math.round(ms / seasons.length) : null;
    const result = {
      decade,
      mode,
      seed,
      club,
      /** os.loadavg() as the run began and as the club list opened (a shared host, →T679). */
      loadAverage: { start: loadAtStart, listing: loadAtListing },
      coldLoadMs,
      slowedRenderers: mode === 'process-x4' ? slowed : [],
      generationMs,
      generationRendererCpuMs: generationCpuMs,
      budgetMs: BUDGET_MS[decade] ?? null,
      withinBudget: BUDGET_MS[decade] === undefined ? null : generationMs <= BUDGET_MS[decade]!,
      workerGenerationMs,
      /** Click to club list, and the worker's request to its listing, per season played. */
      perSeasonMs: perSeason(generationMs),
      canonicalSeasonBudgetMs: 5000,
      withinCanonicalSeasonBudget: seasons.length
        ? generationMs / seasons.length <= 5000
        : generationMs <= 5000,
      perSeasonWorkerMs: perSeason(workerGenerationMs),
      seasonsReported: seasons.length,
      /** Progress replies carrying the history view's digest (→WEB-115) and the cards it showed. */
      seasonsWithDigest: pageMarks.filter((mark) => mark.kind === 'season' && mark.digest).length,
      cards: pageMarks
        .filter((mark) => mark.kind === 'card')
        .map((mark) => ({ feat: mark.feat, atMs: Math.round(mark.at - (request?.at ?? 0)) })),
      /**
       * Click to club list beyond the worker's span: the click's dispatch, the list's wait behind a
       * card still open or waiting after the last season (→WEB-115) and its render.
       */
      beyondWorkerMs: workerGenerationMs !== null ? generationMs - workerGenerationMs : null,
      decadeMarks: seasons.filter((item) => item.season % 10 === 0),
      lastSeasonGapMs: seasons.length
        ? Math.round((listed?.at ?? 0) - (request?.at ?? 0)) - seasons.at(-1)!.atMs
        : null,
      takeover: { hubMs, savedMs },
      memory: {
        peakRendererRssMiB: Math.round((peakRendererKiB / 1024) * 10) / 10,
        peakWorkerHeapMiB: Math.round((peakWorkerHeapBytes / MiB) * 10) / 10,
        peakPageHeapMiB: Math.round((peakPageHeapBytes / MiB) * 10) / 10,
        samples: samples.length,
        workerHeapSamples: samples.filter((sample) => sample.workerHeaps.some((h) => h.usedBytes))
          .length,
        /** [ms since the click, largest renderer RSS MiB, largest worker heap MiB] once a second. */
        timeline: samples.map((sample) => [
          sample.atMs,
          Math.round(Math.max(0, ...sample.renderers.map((item) => item.rssKiB ?? 0)) / 1024),
          Math.round(Math.max(0, ...sample.workerHeaps.map((heap) => heap.usedBytes ?? 0)) / MiB),
        ]),
      },
      checkpoint,
      workers: worker,
      errors,
    };
    console.log(
      `${decade} ${mode}: generation ${(generationMs / 1000).toFixed(1)} s` +
        ` (worker ${((result.workerGenerationMs ?? 0) / 1000).toFixed(1)} s, renderer CPU ${(generationCpuMs / 1000).toFixed(1)} s, ${seasons.length} seasons),` +
        ` renderer peak ${result.memory.peakRendererRssMiB} MiB, worker heap ${result.memory.peakWorkerHeapMiB} MiB,` +
        ` checkpoint ${checkpoint.conservativeUtf16Bytes} B UTF-16,` +
        ` takeover saved ${(savedMs / 1000).toFixed(1)} s; workers ${worker.map((item) => item.throttle).join(', ')}`,
    );
    return result;
  } finally {
    await resume();
    try {
      await stopSampling();
    } finally {
      await context.close();
    }
  }
}

const preview = spawn(process.execPath, ['scripts/preview.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await new Promise<void>((resolve, reject) => {
    preview.stdout!.on('data', (chunk) => {
      if (String(chunk).includes('Built static preview')) resolve();
    });
    preview.on('exit', (code) => reject(new Error(`preview exited with ${code}`)));
  });
  // The served entry and assets are the recorded build (→WEB-19).
  for (const file of dist.filter((item) => /(\.js|\.css|index\.html)$/.test(item))) {
    const relative = path.relative('apps/web/dist', file);
    const response = await fetch(`${origin}/${relative === 'index.html' ? '' : relative}`);
    const served = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200 || !served.equals(readFileSync(file)))
      throw new Error(`Served build mismatch: ${relative}`);
  }
  const browser = await chromium.launch();
  const browserCdp = await browser.newBrowserCDPSession();
  const report = {
    task: arg('task', 'T667'),
    measuredAt: new Date().toISOString(),
    source: { head: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain') },
    build: { sha256: buildHash.digest('hex'), files: dist.length },
    environment: {
      chromium: browser.version(),
      playwright: JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8'))
        .version,
      node: process.version,
      cpus: `${os.cpus().length} × ${os.cpus()[0]?.model}`,
      memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
      loadAverageAtStart: load(),
      loadAverageAtEnd: [] as number[],
    },
    reference: {
      observationTimeoutMs: listingTimeoutMs,
      viewport: '390x844',
      deviceScaleFactor: 2,
      modes: {
        x1: 'no slowdown',
        'cdp-x4':
          'Emulation.setCPUThrottlingRate 4 on the page (main thread only; worker targets refuse it)',
        'process-x4': `every renderer process runs ${RUN_MS} ms of each ${4 * RUN_MS} ms (SIGSTOP/SIGCONT), main thread and workers alike, from the loaded start screen on`,
      },
      network: 'Fast 4G (9/1.5 Mbps, 60 ms), cache disabled, for the cold load',
      tier: 'oil',
      traits: [],
      club: 'first affordable row of the list as it opens',
    },
    limits: {
      generationBudgetMs: BUDGET_MS,
      checkpointIndexedDbConservativeUtf16Bytes: 6 * MiB,
      checkpointLimitInThisTreeBytes: 3 * MiB,
      portableUtf8Bytes: 8 * MiB,
    },
    runs: [] as unknown[],
    /** An earlier report's figures, a season played at a time, for comparison (--beside). */
    beside: undefined as unknown,
  };
  const besideFile = arg('beside', '');
  if (besideFile) {
    const earlier = JSON.parse(readFileSync(besideFile, 'utf8'));
    report.beside = {
      file: besideFile,
      task: earlier.task,
      source: earlier.source,
      cpus: earlier.environment?.cpus,
      runs: earlier.runs.map((item: Record<string, number | string>) => ({
        decade: item.decade,
        mode: item.mode,
        generationMs: item.generationMs,
        workerGenerationMs: item.workerGenerationMs,
        seasonsReported: item.seasonsReported,
        perSeasonMs: item.seasonsReported
          ? Math.round(Number(item.generationMs) / Number(item.seasonsReported))
          : null,
      })),
    };
  }
  // --append keeps the runs an earlier invocation wrote to the same file (each must fit a timeout).
  if (process.argv.includes('--append') && existsSync(out)) {
    const earlier = JSON.parse(readFileSync(out, 'utf8'));
    if (earlier.build?.sha256 !== report.build.sha256)
      throw new Error(`${out} was measured on another build`);
    report.runs.push(...earlier.runs);
    report.measuredAt = earlier.measuredAt;
    report.environment.loadAverageAtStart = earlier.environment.loadAverageAtStart;
  }
  const write = () => {
    report.environment.loadAverageAtEnd = load();
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, compactJson(report) + '\n');
  };
  try {
    for (const mode of modes)
      for (const decade of decades) {
        report.runs.push(await run(browser, browserCdp, decade, mode));
        write();
      }
  } finally {
    await browser.close();
  }
  console.log(`wrote ${out}`);
} finally {
  preview.kill();
}
