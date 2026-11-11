// The viewer page: a canvas and a row of symbol-only controls that play a recorded playback.
// Presentation state only (ARCH-7): `requestAnimationFrame` moves the viewing time, never football.
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH } from '../core/pitch.ts';
import type { Playback } from '../core/types.ts';
import { clamp } from '../core/vec.ts';
import { drawScene } from './draw.ts';
import { fitPitch, sampleAt, speedsFor, trailAt, type View } from './model.ts';

const { viewer } = PROTO_CONFIG;
type ToggleId = 'offsideLines' | 'roles' | 'trail';
const TOGGLES: ReadonlyArray<readonly [ToggleId, string, string]> = [
  ['offsideLines', '⇥', 'o'],
  ['roles', '#', 'r'],
  ['trail', '∿', 't'],
];
const PLAY = '▶';
const PAUSE = '❚❚';

export interface ViewerState {
  t: number;
  playing: boolean;
  speed: number;
  offsideLines: boolean;
  roles: boolean;
  trail: boolean;
}
export interface ViewerDeps {
  getContext?: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;
  raf?: (cb: (ms: number) => void) => number;
}
export interface Viewer {
  state: ViewerState;
  tick(seconds: number): void;
  render(): void;
  destroy(): void;
}

export function createViewer(root: HTMLElement, playback: Playback, deps?: ViewerDeps): Viewer {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const speeds = speedsFor(playback);
  const state: ViewerState = {
    t: 0,
    playing: true,
    speed: speeds[0],
    offsideLines: false,
    roles: false,
    trail: false,
  };

  const width = Math.min(root.clientWidth || win.innerWidth, viewer.maxWidth);
  const pitchHeight = (width * (PITCH.width + 2 * viewer.pad)) / (PITCH.length + 2 * viewer.pad);
  const height = Math.round(pitchHeight + viewer.hud);
  const dpr = win.devicePixelRatio || 1;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.display = 'block';
  const fitted = fitPitch(width, height - viewer.hud, viewer.pad);
  const view: View = { ...fitted, oy: fitted.oy + viewer.hud };
  const ctx = (deps?.getContext ?? ((c: HTMLCanvasElement) => c.getContext('2d')))(canvas);

  const controls = doc.createElement('div');
  controls.className = 'controls';
  const button = (text: string, attr: string, value: string): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute(attr, value);
    controls.append(b);
    return b;
  };
  const play = button(PAUSE, 'data-act', 'play');
  const speedButtons = speeds.map((s) => button(`${s}×`, 'data-speed', String(s)));
  const seek = doc.createElement('input');
  seek.type = 'range';
  seek.setAttribute('data-act', 'seek');
  seek.min = '0';
  seek.max = String(playback.duration);
  seek.step = '0.1';
  controls.append(seek);
  const toggleButtons = TOGGLES.map(([id, symbol]) => button(symbol, 'data-toggle', id));
  root.append(canvas, controls);

  const syncControls = (): void => {
    play.textContent = state.playing ? PAUSE : PLAY;
    speedButtons.forEach((b, k) => b.classList.toggle('on', speeds[k] === state.speed));
    toggleButtons.forEach((b, k) => b.classList.toggle('on', state[TOGGLES[k][0]]));
    seek.value = String(state.t);
  };

  const render = (): void => {
    syncControls();
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sample = sampleAt(playback, state.t);
    const options = { ...state, width, height };
    drawScene(
      ctx,
      view,
      playback,
      sample,
      options,
      state.trail ? trailAt(playback, state.t) : undefined,
    );
  };

  const tick = (seconds: number): void => {
    if (!state.playing) return;
    state.t = Math.min(playback.duration, state.t + seconds * state.speed);
    if (state.t >= playback.duration) state.playing = false;
  };

  const togglePlay = (): void => {
    if (!state.playing && state.t >= playback.duration) state.t = 0;
    state.playing = !state.playing;
  };
  const seekTo = (t: number): void => {
    state.t = clamp(t, 0, playback.duration);
  };
  const flip = (id: ToggleId): void => {
    state[id] = !state[id];
  };

  play.addEventListener('click', () => {
    togglePlay();
    render();
  });
  speedButtons.forEach((b, k) =>
    b.addEventListener('click', () => {
      state.speed = speeds[k];
      render();
    }),
  );
  toggleButtons.forEach((b, k) =>
    b.addEventListener('click', () => {
      flip(TOGGLES[k][0]);
      render();
    }),
  );
  seek.addEventListener('input', () => {
    seekTo(Number(seek.value));
    render();
  });

  const onKey = (e: KeyboardEvent): void => {
    const speedKey = ['1', '2', '3'].indexOf(e.key);
    const toggle = TOGGLES.find(([, , key]) => key === e.key);
    if (e.key === ' ') togglePlay();
    else if (e.key === 'ArrowLeft') seekTo(state.t - viewer.seekStep);
    else if (e.key === 'ArrowRight') seekTo(state.t + viewer.seekStep);
    else if (speedKey >= 0 && speedKey < speeds.length) state.speed = speeds[speedKey];
    else if (toggle) flip(toggle[0]);
    else return;
    e.preventDefault();
    render();
  };
  win.addEventListener('keydown', onKey);

  const raf = deps?.raf ?? ((cb: (ms: number) => void) => win.requestAnimationFrame(cb));
  let stopped = false;
  let last: number | undefined;
  let handle = 0;
  const frame = (now: number): void => {
    if (stopped) return;
    if (last !== undefined) tick(Math.min((now - last) / 1000, viewer.maxFrameSeconds));
    last = now;
    render();
    handle = raf(frame);
  };
  handle = raf(frame);
  render();

  return {
    state,
    tick,
    render,
    destroy: () => {
      stopped = true;
      if (!deps?.raf) win.cancelAnimationFrame(handle);
      win.removeEventListener('keydown', onKey);
    },
  };
}

declare global {
  interface Window {
    __MATCH_PROTO__?: Playback;
  }
}

// The page's entry: the build inlines the playback as `window.__MATCH_PROTO__` before this bundle.
if (typeof window !== 'undefined') {
  const app = document.getElementById('app');
  if (window.__MATCH_PROTO__ && app) createViewer(app, window.__MATCH_PROTO__);
}
