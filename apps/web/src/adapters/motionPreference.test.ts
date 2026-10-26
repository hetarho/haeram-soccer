import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const preference = async () => (await import('./motionPreference')).reducedMotion;

describe('reduced-motion preference', () => {
  it.each([true, false])('reports a query matching %s', async (matches) => {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect((await preference())()).toBe(matches);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('means full motion when the browser has no media queries', async () => {
    vi.stubGlobal('matchMedia', undefined);
    expect((await preference())()).toBe(false);
  });

  it('means full motion when the media query throws', async () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('media queries unavailable');
    });
    expect((await preference())()).toBe(false);
  });

  it('reads the browser only when called, so a later change is seen', async () => {
    let matches = false;
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('matchMedia', matchMedia);
    const reducedMotion = await preference();
    expect(matchMedia).not.toHaveBeenCalled();
    expect(reducedMotion()).toBe(false);
    matches = true;
    expect(reducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(2);
  });
});
