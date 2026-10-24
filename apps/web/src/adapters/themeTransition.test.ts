import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserThemeTransition, THEME_TRANSITION } from './themeTransition';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function browser() {
  const styles: {
    dataset: Record<string, string>;
    textContent: string;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  const finished = deferred();
  const skipTransition = vi.fn();
  let callback!: () => void;
  const startViewTransition = vi.fn((update: () => void) => {
    callback = update;
    return {
      ready: Promise.resolve(),
      finished: finished.promise,
      updateCallbackDone: Promise.resolve().then(update),
      skipTransition,
    };
  });
  const document = {
    visibilityState: 'visible',
    documentElement: { clientWidth: 400, clientHeight: 800 },
    querySelectorAll: vi.fn(() => {
      throw new Error('Controls must not be extracted from their composited root');
    }),
    head: { append: vi.fn() },
    createElement: () => {
      const style = { dataset: {}, textContent: '', remove: vi.fn() };
      styles.push(style);
      return style;
    },
    startViewTransition,
  };
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  return {
    document,
    styles,
    finished,
    skipTransition,
    startViewTransition,
    repeatUpdate: () => callback(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('progressive theme cascade', () => {
  it.each(['animated', 'unsupported', 'reduced'] as const)(
    'flushes presentation consumers through the host before the %s commit completes',
    async (mode) => {
      const b = browser();
      if (mode === 'unsupported') Object.assign(b.document, { startViewTransition: undefined });
      if (mode === 'reduced') vi.stubGlobal('matchMedia', () => ({ matches: true }));
      const order: string[] = [];
      const commit = vi.fn((update: () => void) => {
        order.push('flush');
        update();
        order.push('consumers-painted');
      });
      await createBrowserThemeTransition(b.document as unknown as Document, commit).run(() => {
        order.push('publish');
      });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['flush', 'publish', 'consumers-painted']);
      b.finished.resolve();
    },
  );

  it('reveals one composited root without enumerating or naming controls', async () => {
    const b = browser();
    const update = vi.fn();
    await createBrowserThemeTransition(b.document as unknown as Document).run(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(b.document.querySelectorAll).not.toHaveBeenCalled();
    expect(b.styles[0].textContent).toContain('::view-transition-group(root)');
    expect(b.styles[0].textContent).toContain(`${THEME_TRANSITION.duration}ms`);
    expect(b.styles[0].textContent).not.toContain('theme-unit-');
    b.repeatUpdate();
    expect(update).toHaveBeenCalledTimes(1);
    b.finished.resolve();
    await vi.waitFor(() => expect(b.styles[0].remove).toHaveBeenCalledTimes(1));
  });

  it.each(['unsupported', 'hidden', 'reduced'] as const)(
    'commits immediately when %s',
    async (reason) => {
      const b = browser();
      if (reason === 'unsupported') Object.assign(b.document, { startViewTransition: undefined });
      if (reason === 'hidden') b.document.visibilityState = 'hidden';
      if (reason === 'reduced') vi.stubGlobal('matchMedia', () => ({ matches: true }));
      const update = vi.fn();
      await createBrowserThemeTransition(b.document as unknown as Document).run(update);
      expect(update).toHaveBeenCalledTimes(1);
      expect(b.startViewTransition).not.toHaveBeenCalled();
      expect(b.styles).toHaveLength(0);
    },
  );

  it('falls back once and cleans up when snapshot startup throws', async () => {
    const b = browser();
    b.startViewTransition.mockImplementation(() => {
      throw new Error('snapshot unavailable');
    });
    const update = vi.fn();
    await createBrowserThemeTransition(b.document as unknown as Document).run(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(b.styles[0].remove).toHaveBeenCalled();
  });

  it('retains real commit errors without replaying the update', async () => {
    const b = browser();
    const update = vi.fn(() => {
      throw new Error('resource activation failed');
    });
    const adapter = createBrowserThemeTransition(b.document as unknown as Document);
    await expect(adapter.run(update)).rejects.toThrow('resource activation failed');
    expect(update).toHaveBeenCalledTimes(1);
    expect(b.styles[0].remove).toHaveBeenCalled();
  });

  it('cancels older visuals without letting their late cleanup remove current styles', async () => {
    const b = browser();
    const adapter = createBrowserThemeTransition(b.document as unknown as Document);
    await adapter.run(() => {});
    await adapter.run(() => {});
    expect(b.skipTransition).toHaveBeenCalledTimes(1);
    expect(b.styles[0].remove).toHaveBeenCalledTimes(1);
    adapter.dispose();
    expect(b.skipTransition).toHaveBeenCalledTimes(2);
    b.finished.reject(new Error('snapshot skipped'));
    await Promise.resolve();
  });

  it('does not cancel the newer animation when an older snapshot rejects late', async () => {
    const b = browser();
    const failed = deferred();
    b.startViewTransition.mockImplementationOnce(() => ({
      ready: Promise.resolve(),
      finished: b.finished.promise,
      updateCallbackDone: failed.promise,
      skipTransition: b.skipTransition,
    }));
    const adapter = createBrowserThemeTransition(b.document as unknown as Document);
    const old = adapter.run(() => {});
    await adapter.run(() => {});
    failed.reject(new Error('old snapshot rejected'));
    await old;
    expect(b.skipTransition).toHaveBeenCalledTimes(1);
    expect(b.styles[0].remove).toHaveBeenCalledTimes(1);
    expect(b.styles[1].remove).not.toHaveBeenCalled();
    adapter.dispose();
  });
});
