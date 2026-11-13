/**
 * The 2×2 viewer's runtime. Every `repo:` import is resolved by combine.mjs against the main
 * checkout at bundle time, so timing (WATCH_MINUTE_MS, runningRate, dead-ball beats, goal holds)
 * and sampling (presentationSamples, locate, figureInputs, keepers, possession) are the game's own
 * code as it stands when combine runs. Only drawing is local: numbered dots instead of figures.
 */
import {
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
  beatAt,
  deadBallBeats,
  frameElapsedMs,
  locate,
  presentationAdvance,
  presentationSamples,
  runningLength,
  runningRate,
  type Preparation,
} from 'repo:apps/web/src/entities/match/lib/presentationClock';
import {
  advanceGoalFeedback,
  goalInstants,
  seekGoalFeedback,
  type GoalFeedbackState,
  type GoalInstant,
} from 'repo:apps/web/src/features/match-viewer/lib/goalFeedback';
import { figureInputs } from 'repo:apps/web/src/features/match-viewer/lib/pitchFigures';
import { resolvePossessionCue } from 'repo:apps/web/src/features/match-viewer/lib/possessionCue';
import { gaitDistances } from 'repo:apps/web/src/entities/match/lib/figurePose';
import { keepersBySample, matchLook } from 'repo:apps/web/src/entities/match/lib/matchAppearance';
import {
  ballRadius,
  createGroundPainter,
  DEFAULT_PITCH_SKIN,
  markerRadius,
  paintPitchBall,
  PITCH_PAD,
} from 'repo:apps/web/src/entities/match/lib/pitchPainting';
import { MATCH_MOTION_CONFIG } from 'repo:packages/engine/src/match/motion';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- drawing constants copied from Pitch.tsx (module-private there) ---------------------------
const BALL_PEAK = MATCH_MOTION_CONFIG.ball.maxLoft;
const CARRIER_MARK = { ringScale: 1.45, ringGap: 3 } as const;
const BALL_SPIN_PER_UNIT = 0.35;
const SKIN = DEFAULT_PITCH_SKIN;
const HOLD_EPS = 1e-3;

function ballLook(height: number, width: number, fh: number, spin: number) {
  const air = Math.min(1, Math.max(0, height) / BALL_PEAK);
  const size = ballRadius(width);
  return {
    air,
    radius: size * (1 + air * 0.35),
    shadow: size * (1 - air * 0.3),
    lift: (Math.max(0, height) * fh) / 100,
    spin,
  };
}
function trackTravel(track: readonly (readonly [number, number, number])[]) {
  const travel: number[] = [];
  let sum = 0;
  track.forEach((point, i) => {
    const before = track[i - 1];
    if (before) sum += Math.hypot(point[0] - before[0], point[1] - before[1]);
    travel.push(sum);
  });
  return travel;
}
/** Black or white numbers, whichever reads on `hex`. */
function inkOn(hex: string) {
  const m = /^#?([\da-f]{6})/i.exec(hex ?? '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? '#111111' : '#ffffff';
}

// ---- data --------------------------------------------------------------------------------------
interface PanelConfig {
  label: string;
  caption: string;
  file: string;
  inline?: string;
}
interface Period {
  period: number;
  start: number;
  count: number;
}

async function loadData(entry: PanelConfig) {
  let bytes: Uint8Array;
  const inline = entry.inline ? document.getElementById(entry.inline) : null;
  if (inline) bytes = Uint8Array.from(atob(inline.textContent!.trim()), (c) => c.charCodeAt(0));
  else {
    const res = await fetch(entry.file);
    if (!res.ok) throw new Error(`${entry.file}: HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  // A host may already have undone the gzip (Content-Encoding); only gzip magic is inflated.
  let text: string;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

function periodsOf(frames: readonly Any[]): Period[] {
  const periods: Period[] = [];
  frames.forEach((frame, i) => {
    const last = periods.at(-1);
    if (last && last.period === frame.period) last.count++;
    else periods.push({ period: frame.period, start: i, count: 1 });
  });
  return periods;
}

function preparePanel(config: PanelConfig, data: Any) {
  const { record, frames, squads } = data.playback;
  const timed = presentationSamples(frames);
  const { samples } = timed;
  const starts: number[] = [];
  for (const sample of samples) starts[sample.frame] ??= sample.time;
  return {
    config,
    meta: data.meta,
    record,
    frames,
    squads,
    timed,
    travel: trackTravel(timed.track),
    beats: deadBallBeats(frames),
    goals: goalInstants(record, frames, starts),
    numbers: new Map<string, number>(
      squads.flatMap((squad: Any[]) => squad.map((p, i) => [p.id, i] as const)),
    ),
    names: new Map<string, string>(
      squads.flatMap((squad: Any[]) => squad.map((p) => [p.id, p.name] as const)),
    ),
    distances: gaitDistances(samples),
    keepers: keepersBySample(samples, squads),
    look: matchLook(record),
    periods: periodsOf(frames),
    length: runningLength(frames.length),
    ground: createGroundPainter(),
    /** Own presentation clock, used only by the 각자 시계 mode. */
    own: { seconds: 0, next: 0 } as GoalFeedbackState,
    canvas: undefined as HTMLCanvasElement | undefined,
    ui: {} as Record<string, HTMLElement>,
    shown: '',
  };
}
type Panel = ReturnType<typeof preparePanel>;

// ---- the shared match clock ----------------------------------------------------------------------
/**
 * Periods line up across panels: a shared period lasts as long as its longest panel (added time
 * differs per variant); a panel whose period is shorter holds its last picture until the next
 * period kicks off everywhere. So the same match minute shows in every panel.
 */
function sharedTimeline(panels: Panel[]) {
  const order = [...new Set(panels.flatMap((p) => p.periods.map((q) => q.period)))].sort();
  let at = 0;
  const periods: Period[] = [];
  for (const period of order) {
    const count = Math.max(...panels.map((p) => p.periods.find((q) => q.period === period)?.count ?? 0));
    periods.push({ period, start: at, count });
    at += count;
  }
  const labels: string[] = [];
  for (const sq of periods)
    for (let j = 0; j < sq.count; j++) {
      const owner = panels.find((p) => (p.periods.find((q) => q.period === sq.period)?.count ?? 0) > j)!;
      const q = owner.periods.find((x) => x.period === sq.period)!;
      labels.push(owner.frames[q.start + j].label);
    }
  return { periods, minutes: at, length: at * 60, labels };
}
type Shared = ReturnType<typeof sharedTimeline>;

/** The panel period holding own running second `s` (the earlier one at a boundary). */
const ownPeriod = (panel: Panel, s: number) =>
  panel.periods.find((q) => s <= (q.start + q.count) * 60) ?? panel.periods.at(-1)!;
/** Own running second → shared second (`via` picks the period, e.g. a beat's start). */
function toShared(panel: Panel, shared: Shared, s: number, via = s) {
  const q = ownPeriod(panel, via);
  const sq = shared.periods.find((x) => x.period === q.period)!;
  return sq.start * 60 + (s - q.start * 60);
}
/** Shared second → own running second, and whether the panel is holding (its period is over). */
function toOwn(panel: Panel, shared: Shared, T: number) {
  const sq =
    shared.periods.find((x) => T < (x.start + x.count) * 60) ?? shared.periods.at(-1)!;
  const u = T - sq.start * 60;
  const q = panel.periods.find((x) => x.period === sq.period);
  if (!q) return { seconds: panel.length, hold: true };
  if (u >= q.count * 60) {
    const end = (q.start + q.count) * 60;
    return { seconds: end >= panel.length ? panel.length : end - HOLD_EPS, hold: T < shared.length };
  }
  return { seconds: q.start * 60 + u, hold: false };
}

/**
 * The shared clock's dead-ball segments: each panel's beats (the game's `deadBallBeats`) moved onto
 * the shared seconds as a rate multiple of running play; a stretch runs faster than running play
 * only as fast as the slowest panel allows (min over the panels playing there), so no panel is
 * ever shown faster than the game shows it. Four identical panels give the game's own clock.
 */
function sharedBeats(panels: Panel[], shared: Shared): Preparation[] {
  const base = runningRate(1);
  const lists = panels.map((p) =>
    p.beats.map((b) => {
      const from = toShared(p, shared, b.from);
      return {
        from,
        to: from + (b.to - b.from),
        factor: Math.max(b.factor, (b.to - b.from) / b.ms / base),
      };
    }),
  );
  const active = panels.map((p) =>
    p.periods.map((q) => {
      const sq = shared.periods.find((x) => x.period === q.period)!;
      return [sq.start * 60, sq.start * 60 + q.count * 60] as const;
    }),
  );
  const cuts = new Set<number>([0, shared.length]);
  for (const list of lists) for (const b of list) cuts.add(b.from).add(b.to);
  for (const ranges of active) for (const [a, b] of ranges) cuts.add(a).add(b);
  const points = [...cuts].filter((x) => x >= 0 && x <= shared.length).sort((a, b) => a - b);
  const out: Preparation[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    if (b - a < 1e-9) continue;
    const mid = (a + b) / 2;
    let factor = Infinity;
    panels.forEach((_, k) => {
      if (!active[k]!.some(([x, y]) => x <= mid && mid < y)) return;
      const beat = lists[k]!.find((x) => x.from <= mid && mid < x.to);
      factor = Math.min(factor, beat ? beat.factor : 1);
    });
    if (!Number.isFinite(factor) || factor <= 1 + 1e-9) continue;
    const last = out.at(-1);
    if (last && Math.abs(last.to - a) < 1e-9 && Math.abs(last.factor - factor) < 1e-9) last.to = b;
    else out.push({ from: a, to: b, factor, ms: Infinity });
  }
  return out;
}

/** Every panel's goals on the shared seconds, one hold per instant (the game's 1 s goal hold). */
function sharedGoals(panels: Panel[], shared: Shared) {
  const all = panels.flatMap((p, k) =>
    p.goals.map((g) => ({ seconds: toShared(p, shared, g.seconds), panel: k, goal: g })),
  );
  all.sort((a, b) => a.seconds - b.seconds);
  const merged: (GoalInstant & { panels: number[] })[] = [];
  for (const g of all) {
    const last = merged.at(-1);
    if (last && Math.abs(last.seconds - g.seconds) < 1e-6) last.panels.push(g.panel);
    else merged.push({ ...g.goal, id: merged.length, seconds: g.seconds, panels: [g.panel] });
  }
  return merged;
}

// ---- page --------------------------------------------------------------------------------------
const STOPPAGE: Record<string, string> = {
  throwIn: '스로인',
  goalKick: '골킥',
  corner: '코너킥',
  freeKick: '프리킥',
  penalty: '페널티킥',
  kickoff: '킥오프',
  dropBall: '드롭볼',
};

function boot() {
  const config = JSON.parse(document.getElementById('viewer-config')!.textContent!);
  const grid = document.getElementById('grid')!;
  const status = document.getElementById('status')!;
  const playButton = document.getElementById('play') as HTMLButtonElement;
  const seek = document.getElementById('seek') as HTMLInputElement;
  const minuteOut = document.getElementById('minute')!;
  const speeds = document.getElementById('speeds')!;
  const modeButton = document.getElementById('mode') as HTMLButtonElement;
  const meta = document.getElementById('build')!;
  meta.textContent = `스페이스 재생/정지 · ← → 5초 이동 · 1x = 경기 1분당 ${(WATCH_MINUTE_MS / 1000).toLocaleString()}초 · 게임 코드 ${config.build.head} (${config.build.at})`;

  const state = {
    panels: [] as Panel[],
    shared: undefined as Shared | undefined,
    beats: [] as Preparation[],
    goals: [] as (GoalInstant & { panels: number[] })[],
    clock: { seconds: 0, next: 0 } as GoalFeedbackState,
    speed: 1,
    paused: true,
    independent: false,
    last: 0,
    dragging: false,
  };

  // Panels are laid out before the data arrives, so the grid never jumps.
  const cells = (config.panels as PanelConfig[]).map((entry, k) => {
    const cell = document.createElement('section');
    cell.className = 'panel';
    cell.innerHTML = `
      <header class="panel-head">
        <span class="tag"></span><span class="caption"></span>
      </header>
      <div class="board">
        <span class="side home"><i class="swatch"></i><b class="team"></b></span>
        <span class="score"><b class="h">0</b><span class="dash">:</span><b class="a">0</b></span>
        <span class="side away"><b class="team"></b><i class="swatch"></i></span>
        <span class="clock">0′</span>
      </div>
      <div class="stage">
        <canvas width="0" height="0"></canvas>
        <div class="note" hidden></div>
        <div class="flash" hidden></div>
      </div>
      <footer class="panel-foot"></footer>`;
    cell.querySelector('.tag')!.textContent = entry.label;
    cell.querySelector('.caption')!.textContent = entry.caption;
    cell.querySelector('.panel-foot')!.textContent = '불러오는 중…';
    cell.dataset.panel = String(k);
    grid.appendChild(cell);
    return cell;
  });

  for (const speed of WATCH_SPEEDS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${speed}x`;
    chip.dataset.speed = String(speed);
    chip.setAttribute('aria-pressed', String(speed === state.speed));
    chip.addEventListener('click', () => setSpeed(speed));
    speeds.appendChild(chip);
  }
  function setSpeed(speed: number) {
    state.speed = speed;
    for (const chip of speeds.querySelectorAll<HTMLButtonElement>('.chip'))
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.speed) === speed));
  }
  function setPaused(paused: boolean) {
    state.paused = paused;
    state.last = 0;
    playButton.textContent = paused ? '재생' : '일시정지';
    playButton.setAttribute('aria-pressed', String(!paused));
  }

  const sharedNow = () =>
    state.independent && state.panels[0]
      ? toShared(state.panels[0], state.shared!, state.panels[0].own.seconds)
      : state.clock.seconds;
  function seekTo(T: number) {
    if (!state.shared) return;
    const t = Math.max(0, Math.min(state.shared.length, T));
    state.clock = seekGoalFeedback(state.goals, t);
    for (const p of state.panels) p.own = seekGoalFeedback(p.goals, toOwn(p, state.shared, t).seconds);
    state.last = 0;
  }
  const ended = () =>
    state.independent
      ? state.panels.every((p) => p.own.seconds >= p.length && !p.own.cue)
      : state.clock.seconds >= state.shared!.length && !state.clock.cue;

  playButton.addEventListener('click', () => {
    if (!state.shared) return;
    if (state.paused && ended()) seekTo(0);
    setPaused(!state.paused);
  });
  seek.addEventListener('input', () => seekTo(Number(seek.value) * 60));
  seek.addEventListener('pointerdown', () => (state.dragging = true));
  seek.addEventListener('pointerup', () => (state.dragging = false));
  modeButton.addEventListener('click', () => {
    const T = sharedNow();
    state.independent = !state.independent;
    modeButton.setAttribute('aria-pressed', String(state.independent));
    modeButton.textContent = state.independent ? '각자 시계' : '공통 시계';
    seekTo(T);
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.key === ' ' && !/^(BUTTON|INPUT)$/.test(target.tagName)) {
      event.preventDefault();
      playButton.click();
    }
    // ← / → step the shared match clock 5 s back or forward (the seek slider keeps its own keys).
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
      event.preventDefault();
      seekTo(sharedNow() + (event.key === 'ArrowLeft' ? -5 : 5));
    }
  });

  function paint(panel: Panel, k: number, T: number) {
    const shared = state.shared!;
    const mapped = state.independent
      ? { seconds: panel.own.seconds, hold: false }
      : toOwn(panel, shared, T);
    const now = mapped.seconds;
    const { timed, frames } = panel;
    const { samples, track } = timed;
    const end = Math.max(0, samples.length - 1);
    const position = Math.min(end, locate(timed.times, now, timed.sampleBreak));
    const index = Math.min(end, Math.floor(position + 1e-6));
    const shown = samples[index];
    const minute =
      shown && now - shown.frame * 60 > 60
        ? Math.min(frames.length - 1, Math.floor(now / 60))
        : (shown?.frame ?? 0);
    const cue = resolvePossessionCue(shown, frames[minute], now - minute * 60);

    // Scoreboard and captions (DOM, written only when they change).
    const goalsIn = panel.goals.filter((g) => g.seconds <= now + 1e-6);
    const score = goalsIn.at(-1) ?? { home: 0, away: 0 };
    const holding = state.independent
      ? panel.own.cue !== undefined
      : state.clock.cue !== undefined && state.goals[state.clock.cue.goal]!.panels.includes(k);
    const heldGoal = holding
      ? state.independent
        ? panel.goals[panel.own.cue!.goal]
        : panel.goals.find((g) => Math.abs(toShared(panel, shared, g.seconds) - T) < 1e-6)
      : undefined;
    const beat = beatAt(panel.beats, now);
    const finished = now >= panel.length - 1e-9;
    const second = String(Math.min(59, Math.max(0, Math.floor(now - minute * 60)))).padStart(2, '0');
    const clockText = finished
      ? `종료 ${frames.at(-1).label}′`
      : mapped.hold
        ? `${frames[minute].label}′ · 대기`
        : `${frames[minute].label}′ ${second}″`;
    let note = '';
    if (beat?.beat) {
      const lines = beat.beat.incidents.map((e: Any) =>
        e.kind === 'sub'
          ? `교체 ${panel.names.get(e.actor) ?? ''} → ${panel.names.get(e.receiver ?? '') ?? ''}`
          : e.kind === 'injury'
            ? `부상 ${panel.names.get(e.actor) ?? ''}`
            : `${e.card === 'red' ? '퇴장' : '경고'} ${panel.names.get(e.actor) ?? ''}`,
      );
      note = [STOPPAGE[beat.beat.kind] ?? beat.beat.kind, ...lines].join(' · ');
    }
    const flash = heldGoal
      ? `골 ${heldGoal.home}:${heldGoal.away}${heldGoal.scorer ? ` ${heldGoal.scorer}` : ''}`
      : '';
    const key = `${score.home}:${score.away}|${clockText}|${note}|${flash}`;
    if (key !== panel.shown) {
      panel.shown = key;
      panel.ui.h!.textContent = String(score.home);
      panel.ui.a!.textContent = String(score.away);
      panel.ui.clock!.textContent = clockText;
      panel.ui.note!.textContent = note;
      panel.ui.note!.hidden = !note;
      panel.ui.flash!.textContent = flash;
      panel.ui.flash!.hidden = !flash;
      panel.ui.cell!.classList.toggle('goal', !!heldGoal);
      if (heldGoal) panel.ui[heldGoal.side ? 'a' : 'h']!.classList.add('scored');
      else for (const s of ['h', 'a']) panel.ui[s]!.classList.remove('scored');
    }

    // The pitch.
    const element = panel.canvas!;
    const ctx = element.getContext('2d');
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!ctx || !width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (element.width !== Math.round(width * dpr) || element.height !== Math.round(height * dpr)) {
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    panel.ground.draw(ctx, width, height, dpr, SKIN);
    const current = samples[index];
    if (!current) return;
    const next = samples[Math.min(end, index + 1)] || current;
    const mix = Math.max(0, position - index);
    const pad = width * PITCH_PAD;
    const fw = width - pad * 2;
    const fh = height - pad * 2;
    const x = (v: number) => pad + (fw * v) / 100;
    const y = (v: number) => pad + (fh * v) / 100;
    const radius = markerRadius(width);
    let bx = current.ball[0] * (1 - mix) + next.ball[0] * mix;
    let by = current.ball[1] * (1 - mix) + next.ball[1] * mix;
    let bh = 0;
    let rolled = 0;
    if (track.length) {
      const g = locate(timed.trackTimes, now, timed.trackBreak);
      const a = track[Math.floor(g)]!,
        b = track[Math.ceil(g)]!,
        f = g - Math.floor(g);
      bx = a[0] * (1 - f) + b[0] * f;
      by = a[1] * (1 - f) + b[1] * f;
      bh = a[2] * (1 - f) + b[2] * f;
      rolled = panel.travel[Math.floor(g)]! * (1 - f) + panel.travel[Math.ceil(g)]! * f;
    }
    const figures = figureInputs(current, next, mix, {
      time: now,
      index,
      timeline: timed,
      distances: panel.distances,
      mapping: { pad, fw, fh },
      ball: [bx, by],
      ballHeight: bh,
      carrierId: cue.carrierId,
      keepers: panel.keepers[index] ?? [undefined, undefined],
      numbers: panel.numbers,
    });
    const carrier = figures.find((f) => f.input.carrier);
    if (carrier)
      for (const [colour, lineWidth] of [
        ['#101314', 4.5],
        [SKIN.carrier, 2.5],
      ] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(carrier.x, carrier.y, radius * CARRIER_MARK.ringScale + CARRIER_MARK.ringGap, 0, Math.PI * 2);
        ctx.stroke();
      }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(7, radius * 1.05).toFixed(1)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    for (const figure of figures) {
      const sideLook = panel.look.sides[figure.side];
      const shirt = figure.input.keeper ? sideLook.keeperKit.shirt : sideLook.kit.shirt;
      ctx.beginPath();
      ctx.arc(figure.x, figure.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = shirt.primary;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = shirt.secondary ?? shirt.trim ?? '#101314';
      ctx.stroke();
      ctx.fillStyle = inkOn(shirt.primary);
      ctx.fillText(String(figure.number), figure.x, figure.y + 0.5);
    }
    // The ball over its shadow, lifted by its recorded height (ballLook/paintBall of Pitch.tsx).
    const ball = ballLook(bh, width, fh, rolled * BALL_SPIN_PER_UNIT);
    const px = x(bx),
      py = y(by);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.4 - ball.air * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(px + 1.5, py + 2, ball.shadow, ball.shadow * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    paintPitchBall(ctx, px, py - ball.lift, ball.radius, SKIN, ball.spin);
  }

  function frame(time: number) {
    const elapsed = state.paused ? 0 : frameElapsedMs(time, state.last);
    state.last = state.paused ? 0 : time;
    const shared = state.shared;
    if (shared) {
      const running = !state.paused && !document.hidden;
      if (state.independent) {
        for (const p of state.panels)
          p.own = advanceGoalFeedback(p.own, p.goals, {
            elapsedMs: elapsed,
            speed: state.speed,
            length: p.length,
            running,
            preparations: p.beats,
          });
      } else
        state.clock = advanceGoalFeedback(state.clock, state.goals, {
          elapsedMs: elapsed,
          speed: state.speed,
          length: shared.length,
          running,
          preparations: state.beats,
        });
      const T = sharedNow();
      state.panels.forEach((p, k) => paint(p, k, T));
      const minuteIndex = Math.min(shared.minutes - 1, Math.floor(T / 60));
      if (!state.dragging && seek.value !== String(minuteIndex)) seek.value = String(minuteIndex);
      const second = String(Math.min(59, Math.max(0, Math.floor(T - minuteIndex * 60)))).padStart(2, '0');
      const label = `${shared.labels[minuteIndex]}′ ${second}″`;
      if (minuteOut.textContent !== label) minuteOut.textContent = label;
      if (!state.paused && ended()) setPaused(true);
    }
    requestAnimationFrame(frame);
  }

  const ready = Promise.all((config.panels as PanelConfig[]).map(loadData)).then((list) => {
    state.panels = list.map((data, k) => {
      const panel = preparePanel(config.panels[k], data);
      const cell = cells[k]!;
      panel.canvas = cell.querySelector('canvas')!;
      panel.canvas.setAttribute('aria-label', `${panel.config.label} 패널 경기장`);
      panel.ui = {
        cell,
        h: cell.querySelector('.score .h')!,
        a: cell.querySelector('.score .a')!,
        clock: cell.querySelector('.clock')!,
        note: cell.querySelector('.note')!,
        flash: cell.querySelector('.flash')!,
      };
      const sides = [data.meta.home, data.meta.away];
      cell.querySelectorAll<HTMLElement>('.side').forEach((el, s) => {
        el.querySelector('.team')!.textContent = sides[s]?.short ?? (s ? 'AWAY' : 'HOME');
        el.title = sides[s]?.name ?? '';
        el.querySelector<HTMLElement>('.swatch')!.style.background =
          panel.look.sides[s].kit.shirt.primary;
      });
      const m = data.meta;
      cell.querySelector('.panel-foot')!.textContent =
        `${m.branch ?? ''}@${m.head}${m.dirtyEngineFiles ? ` +${m.dirtyEngineFiles} 수정` : ''} · 최종 ${m.score.home}:${m.score.away} · ${m.frames}분 · 스테이징 ${(m.ms.stage / 1000).toFixed(1)}초`;
      return panel;
    });
    state.shared = sharedTimeline(state.panels);
    state.beats = sharedBeats(state.panels, state.shared);
    state.goals = sharedGoals(state.panels, state.shared);
    seek.max = String(state.shared.minutes - 1);
    seek.disabled = false;
    playButton.disabled = false;
    const first = state.panels[0]!.meta;
    const fixtures = new Set(state.panels.map((p) => `${p.record.id} ${p.record.home} ${p.record.away}`));
    status.textContent =
      `${first.home.name} 대 ${first.away.name} · ${first.year} ${first.fixture.kind === 'league' ? '리그' : first.fixture.kind} ${first.fixture.round}라운드 · 시드 ${first.seed}` +
      (fixtures.size > 1 ? ' · 주의: 패널마다 경기가 다름' : '');
    seekTo(0);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setPaused(!!still);
  });
  ready.catch((error) => {
    status.textContent = `불러오기 실패: ${error.message}`;
    status.classList.add('error');
  });
  requestAnimationFrame(frame);

  // Read-only hooks for headless checks; the page never needs them.
  (window as Any).__matchViewer = {
    ready,
    state,
    seekTo,
    setSpeed,
    setPaused,
    sharedNow,
    toOwn: (k: number, T: number) => toOwn(state.panels[k]!, state.shared!, T),
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
