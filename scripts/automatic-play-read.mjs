/**
 * T522: what the owner sees of automatic play in the production build (→WEB-18). Drives a preview
 * of `apps/web/dist` in Chromium with a 1950 ENG founding whose observation and decisions are
 * delegated, plays one season at x10 and a month each at x1/x2/x5, and records every shown day:
 * the gap since the previous one, stalls (a gap of at least 1.5 × the pace), days a second, the
 * main thread's long tasks and whether the fixture helpers ran. Writes reports/automatic-play-read
 * -<YYMMDD>.{json,md} with machine, load and build hash, beside the Node simulation's numbers.
 *
 * Run after `pnpm run build`: `pnpm exec tsx scripts/automatic-play-read.mjs [--reps 2]
 * [--days 30] [--season-days 365] [--viewport 1280x800] [--origin http://127.0.0.1:4193]`.
 * Timing wants a quiet machine; the load average is recorded beside each run.
 */
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createWorld, operate } from '../packages/engine/src/index.ts';
import { encode } from '../apps/web/src/adapters/persistence.ts';

const args = new Map(
  process.argv
    .slice(2)
    .flatMap((arg, i, all) => (arg.startsWith('--') ? [[arg.slice(2), all[i + 1]]] : [])),
);
const reps = Number(args.get('reps') ?? 2);
const monthDays = Number(args.get('days') ?? 30);
const seasonDays = Number(args.get('season-days') ?? 365);
const [width, height] = (args.get('viewport') ?? '1280x800').split('x').map(Number);
const PACE_MS = { x1: 1000, x2: 500, x5: 200, x10: 100 };
/** WEB-18's Node timeline simulation (1950 ENG season, x10, depth 7, measured 261027). */
const SIMULATION = { pace: 'x10', stalls: 10, daysPerSecond: 8.9, depth: 7 };

function fingerprint(root) {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );
  const hash = createHash('sha256');
  for (const file of files(root).sort()) hash.update(file).update('\0').update(readFileSync(file));
  return hash.digest('hex').slice(0, 16);
}

/** A delegated 1950 founding: no owner decisions and no match-eve observation stop the clock. */
async function founding() {
  const w = createWorld({
    country: 'ENG',
    name: 'Automatic Read',
    color: '#224466',
    seed: 'automatic-play-read',
    level: 'normal',
  });
  const settings = structuredClone(w.settings);
  for (const key of Object.keys(settings.responsibilities))
    settings.responsibilities[key] = 'delegated';
  settings.mode = 'automatic';
  settings.observations = { matchEve: false, windowOpen: false };
  operate(w, { type: 'settings', settings });
  return Buffer.from(await encode(w, 1, 0));
}

/** Page-side recorder: shown dates, long tasks and the fixture helpers' lives. */
function recorder() {
  const read = { days: [], longtasks: [], helpers: { created: 0, terminated: 0, errors: 0 } };
  globalThis.automaticRead = read;
  const NativeWorker = Worker;
  globalThis.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      if (!/fixtureHelper/.test(String(url))) return;
      read.helpers.created++;
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        read.helpers.terminated++;
        terminate();
      };
      this.addEventListener('error', () => read.helpers.errors++);
    }
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) read.longtasks.push([entry.startTime, entry.duration]);
  }).observe({ type: 'longtask', buffered: true });
  let last;
  new MutationObserver(() => {
    const text = document.querySelector('[data-testid="game-date"]')?.textContent;
    if (text && text !== last) {
      last = text;
      read.days.push([performance.now(), text]);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
}

const dayNumber = (text) => {
  const [, y, m, d] = text.match(/(\d+)년 (\d+)월 (\d+)일/).map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

/** Clears whatever stopped the clock the way an owner would, then plays on. */
async function resume(page) {
  for (const name of ['창 닫기', '확인', '거절']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
  }
  const pill = page.getByTestId('event-pill');
  if (await pill.isVisible().catch(() => false)) await pill.click().catch(() => {});
  const play = page.getByRole('button', { name: '자동 진행 시작', exact: true });
  if (await play.isEnabled().catch(() => false)) await play.click().catch(() => {});
}

async function run(browser, origin, raw, pace, days) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.addInitScript(recorder);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: '클럽 창단' }).waitFor();
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'automatic-read.json',
    mimeType: 'application/json',
    buffer: raw,
  });
  await page
    .getByTestId('club-hub')
    .waitFor({ timeout: 30000 })
    .catch(async (error) => {
      await page.screenshot({ path: 'test-results/automatic-play-read-import.png' });
      throw new Error(`${error.message}\npage errors: ${errors.join(' | ') || 'none'}`);
    });
  const control = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  await control.click();
  const list = page.locator(`[id=${JSON.stringify(await control.getAttribute('aria-controls'))}]`);
  await list.locator(`[role="option"][data-value="${pace}"]`).click();
  const load = os.loadavg()[0];
  const start = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const stops = [];
  const deadline = Date.now() + days * PACE_MS[pace] * 4 + 60000;
  for (;;) {
    const state = await page.evaluate((first) => {
      const shown = globalThis.automaticRead.days.filter(([at]) => at >= first);
      const stopped = !!document.querySelector('button[aria-label="자동 진행 시작"]:enabled');
      return { count: shown.length, stopped, date: shown.at(-1)?.[1] };
    }, start);
    if (state.count >= days) break;
    if (Date.now() > deadline) throw new Error(`${pace}: ${state.count}/${days} days in time`);
    if (state.stopped) {
      stops.push({ date: state.date, at: await page.evaluate(() => performance.now()) });
      await resume(page);
    }
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: '자동 진행 정지', exact: true }).click();
  const read = await page.evaluate(() => globalThis.automaticRead);
  const hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency);
  await context.close();

  const shown = read.days.filter(([at]) => at >= start).slice(0, days);
  const gaps = [];
  const jumps = [];
  for (let i = 1; i < shown.length; i++) {
    const [at, text] = shown[i];
    const [before, previous] = shown[i - 1];
    // A gap spanning a stop measures the owner's resume, not the clock.
    if (stops.some((stop) => stop.at > before && stop.at < at)) continue;
    gaps.push(at - before);
    const missing = dayNumber(text) - dayNumber(previous) - 1;
    if (missing > 0)
      jumps.push({ from: previous, to: text, missing, gapMs: Math.round(at - before) });
  }
  const skipped = jumps.reduce((sum, jump) => sum + jump.missing, 0);
  const ms = PACE_MS[pace];
  const running = gaps.reduce((sum, gap) => sum + gap, 0);
  const end = shown.at(-1)[0];
  const tasks = read.longtasks.filter(([at]) => at >= start && at <= end);
  const sorted = [...gaps].sort((a, b) => a - b);
  const quantile = (q) =>
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
  return {
    pace,
    days: shown.length,
    from: shown[0][1],
    to: shown.at(-1)[1],
    loadBefore: Number(load.toFixed(2)),
    stalls: gaps.filter((gap) => gap >= 1.5 * ms).length,
    worstGapMs: Math.round(sorted.at(-1)),
    gapMs: { p50: quantile(0.5), p90: quantile(0.9), p99: quantile(0.99) },
    daysPerSecond: Number(((gaps.length / running) * 1000).toFixed(2)),
    targetDaysPerSecond: 1000 / ms,
    skippedDays: skipped,
    jumps: jumps.slice(0, 20),
    stops,
    longTasks: {
      count: tasks.length,
      over100ms: tasks.filter(([, duration]) => duration > 100).length,
      totalMs: Math.round(tasks.reduce((sum, [, duration]) => sum + duration, 0)),
      maxMs: Math.round(Math.max(0, ...tasks.map(([, duration]) => duration))),
    },
    helpers: { ...read.helpers, hardwareConcurrency },
  };
}

const port = 4193 + Math.floor(Math.random() * 100);
const origin = args.get('origin') ?? `http://127.0.0.1:${port}`;
const server = args.has('origin')
  ? undefined
  : spawn(process.execPath, ['scripts/preview.mjs'], {
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });
try {
  for (let i = 0; ; i++) {
    if (
      await fetch(origin).then(
        (response) => response.ok,
        () => false,
      )
    )
      break;
    if (i > 100) throw new Error(`No preview at ${origin}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const raw = await founding();
  const browser = await chromium.launch();
  const runs = [];
  try {
    for (let rep = 0; rep < reps; rep++)
      for (const [pace, days] of [
        ['x10', seasonDays],
        ['x1', monthDays],
        ['x2', monthDays],
        ['x5', monthDays],
      ]) {
        const result = await run(browser, origin, raw, pace, days);
        runs.push({ rep, ...result });
        console.log(
          `${pace} rep ${rep}: ${result.days} days ${result.from} → ${result.to}, ` +
            `${result.daysPerSecond}/s, ${result.stalls} stalls, worst ${result.worstGapMs} ms, ` +
            `long tasks ${result.longTasks.count} (max ${result.longTasks.maxMs} ms), ` +
            `helpers ${result.helpers.created}/${result.helpers.terminated} terminated`,
        );
      }
  } finally {
    await browser.close();
  }
  const date = new Date();
  const stamp = [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  const x10 = runs.filter((result) => result.pace === 'x10');
  const report = {
    task: 'T522',
    at: date.toISOString(),
    source: { commit: head, dirty },
    build: { sha256: fingerprint('apps/web/dist') },
    machine: {
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      platform: `${os.platform()} ${os.release()}`,
      node: process.version,
      chromium: chromium.executablePath().match(/chromium[-_](\d+)/)?.[1] ?? 'bundled',
      loadAfter: os.loadavg().map((value) => Number(value.toFixed(2))),
    },
    setup: { viewport: `${width}x${height}`, seasonDays, monthDays, reps, stall: '≥ 1.5 × pace' },
    simulation: SIMULATION,
    comparison: {
      x10Stalls: x10.map((result) => result.stalls),
      x10DaysPerSecond: x10.map((result) => result.daysPerSecond),
    },
    runs,
  };
  mkdirSync('reports', { recursive: true });
  const file = `reports/automatic-play-read-${stamp}`;
  writeFileSync(`${file}.json`, JSON.stringify(report, null, 2) + '\n');
  const rows = runs.map(
    (r) =>
      `| ${r.pace} | ${r.rep} | ${r.days} | ${r.daysPerSecond} / ${r.targetDaysPerSecond} | ` +
      `${r.stalls} | ${r.worstGapMs} | ${r.gapMs.p50} / ${r.gapMs.p90} / ${r.gapMs.p99} | ` +
      `${r.skippedDays} | ${r.longTasks.count} (${r.longTasks.over100ms} > 100 ms, max ` +
      `${r.longTasks.maxMs}) | ${r.helpers.created} / ${r.helpers.terminated} | ${r.loadBefore} |`,
  );
  writeFileSync(
    `${file}.md`,
    [
      `# Automatic play in the built browser game (T522, ${stamp})`,
      '',
      `Build ${report.build.sha256} from ${head.slice(0, 8)}${dirty ? ' (dirty)' : ''}; ` +
        `${report.machine.cpu}, ${report.machine.logicalCpus} logical CPUs, ` +
        `${report.machine.memoryGiB} GiB; Chromium headless ${width}x${height}; ` +
        `navigator.hardwareConcurrency ${runs[0].helpers.hardwareConcurrency}.`,
      '',
      `Node simulation (→WEB-18): x10 about ${SIMULATION.stalls} stalls a season and ` +
        `${SIMULATION.daysPerSecond} days a second at depth ${SIMULATION.depth}.`,
      '',
      '| pace | rep | days | days/s (target) | stalls | worst gap ms | gap p50/p90/p99 ms | skipped | long tasks | helpers created / terminated | load |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log(`wrote ${file}.json and ${file}.md`);
} finally {
  server?.kill();
}
