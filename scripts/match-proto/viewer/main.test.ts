// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { fakePlayback, frameOf } from '../check/playback.testkit.ts';
import { PROTO_CONFIG } from '../core/config.ts';
import { recordingContext } from './context.testkit.ts';
import { createViewer, type Viewer } from './main.ts';

const { viewer } = PROTO_CONFIG;
const playback = fakePlayback({
  frames: Array.from({ length: 101 }, (_, i) => frameOf(i / PROTO_CONFIG.hz)),
});
let open: Viewer[] = [];

const mount = (withContext = false) => {
  const root = document.createElement('div');
  document.body.append(root);
  const recorded = recordingContext();
  const v = createViewer(root, playback, {
    raf: () => 0,
    ...(withContext ? { getContext: () => recorded.ctx } : {}),
  });
  open.push(v);
  return { root, v, calls: recorded.calls };
};
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));

afterEach(() => {
  for (const v of open) v.destroy();
  open = [];
  document.body.innerHTML = '';
});

describe('viewer page', () => {
  it('createViewer builds a canvas and the controls', () => {
    const { root, v, calls } = mount(true);
    expect(root.querySelector('canvas')).not.toBeNull();
    expect(root.querySelector('button[data-act="play"]')?.textContent).toBe('❚❚');
    const speeds = [...root.querySelectorAll('button[data-speed]')].map((b) => b.textContent);
    expect(speeds).toEqual(viewer.speeds.map((s) => `${s}×`));
    const seek = root.querySelector<HTMLInputElement>('input[data-act="seek"]');
    expect(seek?.type).toBe('range');
    expect(seek?.max).toBe(String(playback.duration));
    const toggles = [...root.querySelectorAll('button[data-toggle]')].map((b) =>
      b.getAttribute('data-toggle'),
    );
    expect(toggles).toEqual(['offsideLines', 'roles', 'trail']);
    expect(v.state).toEqual({
      t: 0,
      playing: true,
      speed: viewer.speeds[0],
      offsideLines: false,
      roles: false,
      trail: false,
    });
    expect(calls.filter((c) => c.name === 'arc').length).toBeGreaterThanOrEqual(23);
    // Without a 2D context `render` only updates the controls.
    expect(() => mount().v.render()).not.toThrow();
  });

  it('tick advances time by the speed and stops at the end', () => {
    const { v } = mount();
    v.tick(1);
    expect(v.state.t).toBeCloseTo(1);
    v.state.speed = 2;
    v.tick(1);
    expect(v.state.t).toBeCloseTo(3);
    v.tick(100);
    expect(v.state.t).toBe(playback.duration);
    expect(v.state.playing).toBe(false);
    v.tick(1);
    expect(v.state.t).toBe(playback.duration);
  });

  it('the speed buttons, the seek bar and the space key change the state', () => {
    const { root, v } = mount();
    const fast = root.querySelector<HTMLButtonElement>(`button[data-speed="${viewer.speeds[2]}"]`);
    fast?.click();
    expect(v.state.speed).toBe(viewer.speeds[2]);
    expect(fast?.classList.contains('on')).toBe(true);
    press('2');
    expect(v.state.speed).toBe(viewer.speeds[1]);
    const seek = root.querySelector<HTMLInputElement>('input[data-act="seek"]');
    if (!seek) throw new Error('seek');
    seek.value = '7';
    seek.dispatchEvent(new Event('input'));
    expect(v.state.t).toBeCloseTo(7);
    press('ArrowRight');
    expect(v.state.t).toBe(playback.duration);
    press('ArrowLeft');
    expect(v.state.t).toBeCloseTo(playback.duration - viewer.seekStep);
    press(' ');
    expect(v.state.playing).toBe(false);
    expect(root.querySelector('button[data-act="play"]')?.textContent).toBe('▶');
    root.querySelector<HTMLButtonElement>('button[data-act="play"]')?.click();
    expect(v.state.playing).toBe(true);
  });

  it('toggles flip their flags', () => {
    const { root, v } = mount();
    const roles = root.querySelector<HTMLButtonElement>('button[data-toggle="roles"]');
    roles?.click();
    expect(v.state.roles).toBe(true);
    expect(roles?.classList.contains('on')).toBe(true);
    roles?.click();
    expect(v.state.roles).toBe(false);
    press('o');
    expect(v.state.offsideLines).toBe(true);
    press('t');
    expect(v.state.trail).toBe(true);
    press('r');
    expect(v.state.roles).toBe(true);
  });
});
