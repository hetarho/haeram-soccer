import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Root } from 'react-dom/client';

const { startPresentation, presentationImported } = vi.hoisted(() => ({
  startPresentation: vi.fn(),
  presentationImported: vi.fn(),
}));
vi.mock('../presentation/startPresentation', () => {
  presentationImported();
  return { startPresentation };
});
vi.mock('./StoryFrame', () => ({ default: () => null }));

const registry = {
  schemaVersion: 1,
  defaultId: 'new-default',
  entries: [
    { id: 'new-default', label: 'Default theme', resource: 'default.json' },
    { id: 'new-alternative', label: 'Alternative theme', resource: 'alternative.json' },
  ],
};

beforeEach(() => {
  vi.resetModules();
  startPresentation.mockReset();
  presentationImported.mockClear();
  vi.stubGlobal('location', { search: '', reload: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

function createRoot() {
  const render = vi.fn<Root['render']>();
  return {
    root: { render } as unknown as Root,
    markup: () => renderToStaticMarkup(render.mock.calls.at(-1)![0]),
  };
}

describe('design-system document bootstrap', () => {
  it.each([
    ['new-alternative', 'new-alternative'],
    ['unknown-theme', 'new-default'],
    ['', 'new-default'],
  ])(
    'loads only the registry for workbench theme %s, selecting %s',
    async (requested, selected) => {
      location.search = requested ? `?theme=${requested}` : '';
      const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => registry }));
      vi.stubGlobal('fetch', fetch);
      const { root, markup } = createRoot();

      const { startDesignSystem } = await import('./start');
      await startDesignSystem(root, false);

      expect(fetch.mock.calls).toEqual([
        ['/presentation/themes/index.json', { cache: 'no-cache', credentials: 'same-origin' }],
      ]);
      expect(startPresentation).not.toHaveBeenCalled();
      expect(presentationImported).not.toHaveBeenCalled();
      const html = markup();
      expect(html).toContain('컴포넌트 검색');
      expect(html).toContain('Default theme');
      expect(html).toContain('Alternative theme');
      expect(html).toContain(`<option value="${selected}" selected="">`);
      expect(html).toContain(`theme=${selected}`);
    },
  );

  it('uses the shared game bootstrap only inside a preview document', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { root } = createRoot();

    const { startDesignSystem } = await import('./start');
    await startDesignSystem(root, true);

    expect(startPresentation).toHaveBeenCalledOnce();
    expect(presentationImported).toHaveBeenCalledOnce();
    expect(startPresentation).toHaveBeenCalledWith(root, expect.anything());
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['network failure', 'invalid registry'])('offers retry after %s', async (failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (failure === 'network failure') throw new Error('offline');
        return { ok: true, status: 200, json: async () => ({ ...registry, entries: [] }) };
      }),
    );
    const { root, markup } = createRoot();

    const { startDesignSystem } = await import('./start');
    await startDesignSystem(root, false);

    expect(markup()).toContain('role="alert"');
    expect(markup()).toContain('다시 시도</button>');
    expect(startPresentation).not.toHaveBeenCalled();
  });
});
