/**
 * Headless check of a combined page: runs the page's own bundle in happy-dom with a recording
 * canvas (no browser, no server, no port), then
 *   1. clock: the page's shared clock against the game's own `advanceGoalFeedback` + dead-ball
 *      beats over a whole match (1x for a while, then 16x), identical panels → identical clocks;
 *      running play at 1x advances 60 match seconds per WATCH_MINUTE_MS;
 *   2. picture: at a few minutes, every panel draws the same 22 numbered dots and a ball, the
 *      scoreboard shows the running score and the minute label;
 *   3. period alignment: panel B with one added minute fewer in the first half holds (대기) while A
 *      plays 45+4, and both kick off the second half on the same shared minute;
 *   4. writes scene JSON for render.py (PNG).
 *
 *   cd /home/deep/haeram/haeram-soccor && pnpm exec tsx <abs>/viewer/check.mts <abs>/viewer/out/smoke
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { gunzipSync, gzipSync } from 'node:zlib';

const repo = process.cwd();
const dir = process.argv[2]!;
const shots = join(dir, '..', '..', 'check');
mkdirSync(shots, { recursive: true });
const { Window } = await import(pathToFileURL(join(repo, 'node_modules/happy-dom/lib/index.js')).href);
const clockLib = await import(pathToFileURL(join(repo, 'apps/web/src/entities/match/lib/presentationClock.ts')).href);
const goalLib = await import(pathToFileURL(join(repo, 'apps/web/src/features/match-viewer/lib/goalFeedback.ts')).href);

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const failures: string[] = [];
const ok = (cond: boolean, what: string) => {
  if (!cond) failures.push(what);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
};

// ---- colour parsing for the recorder ---------------------------------------------------------
function rgba(c: string): [number, number, number, number] {
  c = String(c).trim();
  let m = /^#([\da-f]{3})$/i.exec(c);
  if (m) return [...m[1]!].map((h) => parseInt(h + h, 16)).concat(255) as Any;
  m = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(c);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const [r, g, b, a = '1'] = m[1]!.split(',').map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Math.round(Number(a) * 255)];
  }
  return [255, 0, 255, 255];
}

/** A Canvas 2D stand-in that records filled/stroked paths, text and blits. */
function recorder(canvas: Any) {
  const ops: Any[] = [];
  let path: number[][][] = [];
  let sub: number[][] | null = null;
  const stack: Any[] = [];
  const keys = ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'globalAlpha'];
  const arcPoints = (x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number) => {
    const n = 28;
    const pts: number[][] = [];
    const span = a1 - a0;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      pts.push([x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    return pts;
  };
  const ctx: Any = {
    canvas,
    ops,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    save() { stack.push(Object.fromEntries(keys.map((k) => [k, ctx[k]]))); },
    restore() { Object.assign(ctx, stack.pop() ?? {}); },
    setTransform() {}, scale() {}, translate() {}, rotate() {}, clip() {}, setLineDash() {},
    createPattern() { return null; },
    measureText(t: string) { return { width: t.length * 6 }; },
    beginPath() { path = []; sub = null; },
    moveTo(x: number, y: number) { sub = [[x, y]]; path.push(sub); },
    lineTo(x: number, y: number) { if (!sub) { sub = []; path.push(sub); } sub.push([x, y]); },
    closePath() { if (sub?.length) sub.push([...sub[0]!]); },
    rect(x: number, y: number, w: number, h: number) { path.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]); sub = null; },
    arc(x: number, y: number, r: number, a0: number, a1: number) { sub = arcPoints(x, y, r, r, 0, a0, a1); path.push(sub); },
    ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number) { sub = arcPoints(x, y, rx, ry, rot, a0, a1); path.push(sub); },
    fill() { ops.push({ op: 'fill', path: path.map((s) => s.map((p) => [...p])), color: rgba(ctx.fillStyle) }); },
    stroke() { ops.push({ op: 'stroke', path: path.map((s) => s.map((p) => [...p])), color: rgba(ctx.strokeStyle), width: ctx.lineWidth }); },
    fillRect(x: number, y: number, w: number, h: number) { ops.push({ op: 'fill', path: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]], color: rgba(ctx.fillStyle) }); },
    strokeRect(x: number, y: number, w: number, h: number) { ops.push({ op: 'stroke', path: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]], color: rgba(ctx.strokeStyle), width: ctx.lineWidth }); },
    fillText(text: string, x: number, y: number) { ops.push({ op: 'text', text, x, y, color: rgba(ctx.fillStyle), font: ctx.font, align: ctx.textAlign, baseline: ctx.textBaseline }); },
    drawImage(img: Any, x: number, y: number, w: number, h: number) { ops.push({ op: 'image', ops: img.__ctx?.ops ?? [], x, y, w, h }); },
  };
  return ctx;
}

// ---- one page instance -------------------------------------------------------------------------
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const bundle = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const WIDTH = 640;

async function openPage(files: Record<string, Buffer>, configEdit?: (c: Any) => void, noFetch = false) {
  const window = new Window({
    url: pathToFileURL(join(dir, 'index.html')).href,
    width: 1400,
    height: 1000,
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  const document = window.document;
  document.write(html.slice(0, html.lastIndexOf('<script>')));
  const configEl = document.getElementById('viewer-config');
  const config = JSON.parse(configEl.textContent);
  configEdit?.(config);
  configEl.textContent = JSON.stringify(config);
  const proto = window.HTMLCanvasElement.prototype;
  proto.getContext = function (this: Any) { return (this.__ctx ??= recorder(this)); };
  Object.defineProperty(proto, 'clientWidth', { get: () => WIDTH, configurable: true });
  Object.defineProperty(proto, 'clientHeight', { get: () => Math.round(WIDTH / 1.9), configurable: true });
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  const queue: ((t: number) => void)[] = [];
  const g = globalThis as Any;
  g.window = window;
  g.document = document;
  g.requestAnimationFrame = (cb: (t: number) => void) => queue.push(cb);
  g.fetch = async (url: string) => {
    if (noFetch) throw new Error(`fetch is off (${url})`);
    const body = files[url] ?? readFileSync(join(dir, url));
    return new Response(body);
  };
  vm.runInThisContext(bundle);
  if (document.readyState === 'loading') document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const api = window.__matchViewer;
  await api.ready;
  const canvases = [...document.querySelectorAll('#grid canvas')] as Any[];
  const tick = (time: number) => {
    for (const c of canvases) if (c.__ctx) c.__ctx.ops.length = 0;
    const callbacks = queue.splice(0);
    for (const cb of callbacks) cb(time);
  };
  const text = (sel: string) => [...document.querySelectorAll(sel)].map((e: Any) => e.textContent);
  return { window, document, api, canvases, tick, text, config };
}

if (process.argv[3] === '--inline') {
  // A self-contained page must load with no fetch at all (as from a local file:// open).
  const page = await openPage({}, undefined, true);
  const state = page.api.state;
  page.api.seekTo(20 * 60);
  page.tick(1);
  page.tick(20);
  const texts = page.canvases.map((c: Any) => c.__ctx.ops.filter((o: Any) => o.op === 'text').length);
  ok(state.panels.length > 0 && texts.every((n: number) => n >= 20), `inline page loads ${state.panels.length} panels without fetch and draws ${texts.join('/')} dots`);
  process.exit(failures.length ? 1 : 0);
}

const smoke = await openPage({});
const { api } = smoke;
const S = api.state;
const panel0 = S.panels[0];
const frames = panel0.frames;
const record = panel0.record;
console.log(`page: ${S.panels.length} panels, ${S.shared.minutes} shared minutes, ${S.beats.length} shared beat segments, ${S.goals.length} goal holds, WATCH_MINUTE_MS ${clockLib.WATCH_MINUTE_MS}`);

// ---- 1. clock fidelity -------------------------------------------------------------------------
{
  const { samples } = clockLib.presentationSamples(frames);
  const starts: number[] = [];
  for (const s of samples) starts[s.frame] ??= s.time;
  const goals = goalLib.goalInstants(record, frames, starts);
  const beats = clockLib.deadBallBeats(frames);
  const length = clockLib.runningLength(frames.length);
  let ref = { seconds: 0, next: 0 } as Any;
  api.seekTo(0);
  api.setSpeed(1);
  api.setPaused(false);
  const step = 1000 / 60;
  let t = 1000;
  smoke.tick(t); // first frame after play: elapsed 0
  let worst = 0, frameCount = 0, speed = 1;
  let firstGoalMs: number | undefined;
  while (frameCount < 200_000) {
    t += step;
    frameCount++;
    if (frameCount === 1800) { api.setSpeed(16); speed = 16; } // 30 s at 1x, then 16x
    smoke.tick(t);
    ref = goalLib.advanceGoalFeedback(ref, goals, { elapsedMs: step, speed, length, running: true, preparations: beats });
    worst = Math.max(worst, Math.abs(ref.seconds - S.clock.seconds));
    if (firstGoalMs === undefined && S.clock.cue) firstGoalMs = frameCount * step;
    if (S.paused) break;
  }
  const refDone = ref.seconds >= length && !ref.cue;
  ok(worst < 1e-6, `shared clock = game clock (advanceGoalFeedback + deadBallBeats) over the whole match, max |Δ| ${worst.toExponential(1)} s`);
  ok(refDone && S.clock.seconds >= length, `page and game reach the final whistle on the same frame (${(frameCount * step / 1000).toFixed(1)} s real: 30 s at 1x, rest at 16x)`);
  ok(firstGoalMs !== undefined, `a goal hold fired (first after ${((firstGoalMs ?? 0) / 1000).toFixed(1)} s real)`);
  // Running play at 1x: a minute with no beat and no goal plays in exactly WATCH_MINUTE_MS.
  const quiet = frames.findIndex((_: Any, i: number) => i > 2 && !beats.some((b: Any) => b.to > i * 60 && b.from < i * 60 + 60) && !goals.some((g: Any) => g.seconds >= i * 60 && g.seconds <= i * 60 + 60));
  api.setPaused(true);
  api.seekTo(quiet * 60);
  api.setSpeed(1);
  api.setPaused(false);
  t += 1000;
  smoke.tick(t);
  const ticks = Math.round(clockLib.WATCH_MINUTE_MS / 10);
  for (let i = 0; i < ticks; i++) { t += 10; smoke.tick(t); }
  const advanced = S.clock.seconds - quiet * 60;
  ok(Math.abs(advanced - 60) < 1e-6, `1x: minute ${frames[quiet].label} (no dead ball) takes ${clockLib.WATCH_MINUTE_MS} ms real → ${advanced.toFixed(3)} match s`);
  api.setPaused(true);
}

// ---- 2. picture at a few minutes ---------------------------------------------------------------
const scenes: Any[] = [];
function capture(page: Any, name: string, T: number) {
  page.api.seekTo(T);
  page.api.setPaused(true);
  page.tick(1e9);
  page.tick(1e9 + 16);
  const clocks = page.text('.clock');
  const scores = page.text('.score').map((s: string) => s.replace(/\s+/g, ''));
  const notes = page.text('.note');
  const panels = page.canvases.map((c: Any, k: number) => {
    // A snapshot: the recorder's array is reused by every later tick.
    const ops = structuredClone(c.__ctx?.ops ?? []);
    const dots = ops.filter((o: Any) => o.op === 'text').length;
    return {
      label: page.api.state.panels[k].config.label,
      header: `${page.api.state.panels[k].config.label}  ${scores[k]}  ${clocks[k]}${notes[k] ? `  [${notes[k]}]` : ''}`,
      w: WIDTH,
      h: Math.round(WIDTH / 1.9),
      ops,
      dots,
    };
  });
  scenes.push({ name, title: `${name} — shared ${page.document.getElementById('minute').textContent}`, panels });
  return { clocks, scores, notes, panels };
}

const goalFrames = frames.map((f: Any, i: number) => [i, f.score.home + f.score.away] as const);
for (const [name, T] of [
  ['kickoff', 0],
  ['m10', 9 * 60 + 30],
  ['m45+2', 46 * 60 + 20],
  ['m60', 59 * 60 + 40],
  ['m80', 79 * 60 + 10],
] as const) {
  const shot = capture(smoke, name, T);
  const want = frames[Math.floor(T / 60)];
  const same = shot.panels.every((p: Any) => JSON.stringify(p.ops) === JSON.stringify(shot.panels[0].ops));
  const onPitch = (want.motion?.[0]?.players?.[0]?.length ?? 11) + (want.motion?.[0]?.players?.[1]?.length ?? 11);
  ok(same, `${name}: four identical panels draw identical pictures`);
  ok(shot.panels[0].dots >= onPitch - 1 && shot.panels[0].dots <= 22, `${name}: ${shot.panels[0].dots} numbered dots drawn (≈${onPitch} on the pitch)`);
  ok(shot.clocks.every((c: string) => c.startsWith(want.label)), `${name}: clock reads ${shot.clocks[0]} (frame label ${want.label})`);
  const prev = Math.floor(T / 60) - 1;
  const lo = prev >= 0 ? frames[prev].score : { home: 0, away: 0 };
  const hi = want.score;
  const [h, a] = shot.scores[0].split(':').map(Number);
  ok(h >= lo.home && h <= hi.home && a >= lo.away && a <= hi.away, `${name}: score ${shot.scores[0]} within the frame's running score ${lo.home}:${lo.away}..${hi.home}:${hi.away}`);
}
void goalFrames;
{
  const pictures = scenes.map((s: Any) => JSON.stringify(s.panels[0].ops.filter((o: Any) => o.op === 'text')));
  ok(new Set(pictures).size === pictures.length, `the ${pictures.length} sampled minutes draw ${new Set(pictures).size} different pictures`);
  // The first dot (home side's first listed player) sits where the raw samples put him, interpolated.
  const T = 9 * 60 + 30;
  const timed = clockLib.presentationSamples(frames);
  const at = clockLib.locate(timed.times, T, timed.sampleBreak);
  const k = Math.floor(at + 1e-6), mix = at - k;
  const a = timed.samples[k].players[0][0], b = timed.samples[k + 1].players[0].find((p: Any) => p.id === a.id) ?? a;
  const pad = WIDTH * 0.013, fw = WIDTH - 2 * pad, fh = Math.round(WIDTH / 1.9) - 2 * pad;
  const want = [pad + (fw * (a.position[0] + (b.position[0] - a.position[0]) * mix)) / 100, pad + (fh * (a.position[1] + (b.position[1] - a.position[1]) * mix)) / 100];
  const got = scenes.find((s: Any) => s.name === 'm10').panels[0].ops.find((o: Any) => o.op === 'text');
  ok(Math.hypot(got.x - want[0]!, got.y - 0.5 - want[1]!) < 0.01, `m10: first dot at (${got.x.toFixed(1)}, ${(got.y - 0.5).toFixed(1)}) px = raw samples interpolated (${want[0]!.toFixed(1)}, ${want[1]!.toFixed(1)})`);
}

// ---- 3. period alignment with a variant that has one added minute fewer --------------------------
{
  const file = smoke.config.panels[1].file;
  const data = JSON.parse(gunzipSync(readFileSync(join(dir, file))).toString());
  const firstHalfEnd = data.playback.frames.findIndex((f: Any) => f.period === 2) - 1;
  const dropped = data.playback.frames[firstHalfEnd].label;
  data.playback.frames.splice(firstHalfEnd, 1);
  data.meta = { ...data.meta, head: 'mutated', summary: `${data.meta.summary} minus ${dropped}` };
  const mutated = gzipSync(JSON.stringify(data));
  const page = await openPage({ 'data/mutated.json.gz': mutated }, (c) => {
    c.panels[1] = { ...c.panels[1], file: 'data/mutated.json.gz', caption: `${dropped} 제거` };
  });
  const shared = page.api.state.shared;
  ok(shared.minutes === frames.length, `shared timeline keeps the longest period (${shared.minutes} minutes)`);
  const hold = capture(page, 'halftime-hold', firstHalfEnd * 60 + 30);
  ok(hold.clocks[0]!.startsWith(dropped) && hold.clocks[1]!.includes('대기'), `at shared ${dropped}: A shows ${hold.clocks[0]}, B (no ${dropped}) shows ${hold.clocks[1]}`);
  const kick = capture(page, 'second-half', (firstHalfEnd + 1) * 60 + 5);
  ok(kick.clocks[0] === kick.clocks[1], `both kick off the second half together: A ${kick.clocks[0]}, B ${kick.clocks[1]}`);
  const dots = (shot: Any, k: number) => JSON.stringify(shot.panels[k].ops.filter((o: Any) => o.op === 'text'));
  ok(dots(hold, 0) !== dots(hold, 1), 'at the hold, B shows its own end-of-half picture, not A’s 45+4');
  ok(dots(kick, 0) === dots(kick, 1), 'in the second half A and B (same second-half data) draw the same picture');
  const late = capture(page, 'late', 85 * 60 + 30);
  ok(late.clocks[0] === late.clocks[1], `late in the match the same minute shows: A ${late.clocks[0]}, B ${late.clocks[1]}`);
  // 각자 시계: each panel on its own game clock.
  page.document.getElementById('mode').click();
  page.api.setSpeed(4);
  page.api.setPaused(false);
  let t = 5e9;
  page.tick(t);
  for (let i = 0; i < 600; i++) page.tick((t += 16.7));
  const own = page.api.state.panels.map((p: Any) => p.own.seconds.toFixed(2));
  ok(page.api.state.independent && own[0] !== '0.00', `각자 시계 runs each panel on its own clock (A ${own[0]} s, B ${own[1]} s own running seconds)`);
}

writeFileSync(join(shots, 'scenes.json'), JSON.stringify(scenes));
console.log(`${scenes.length} scenes → ${join(shots, 'scenes.json')}`);
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
