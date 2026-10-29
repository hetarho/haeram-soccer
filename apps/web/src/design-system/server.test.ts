import { describe, expect, it, vi } from 'vitest';
import type { Connect, ViteDevServer, PreviewServer } from 'vite';
import { designSystem, isDesignSystemPath } from './server';

function harness(preview = false) {
  let middleware: Connect.NextHandleFunction;
  const sampleData = vi.fn(async () => ({ view: { world: { id: 'sample' } } }));
  const sampleRead = vi.fn(async (body) => ({ ok: true, body }));
  const server = {
    middlewares: {
      use: (handle: Connect.NextHandleFunction) => {
        middleware = handle;
      },
    },
    ssrLoadModule: vi.fn(async () => ({ sampleData, sampleRead })),
  };
  const plugin = designSystem();
  const install = preview ? plugin.configurePreviewServer : plugin.configureServer;
  if (typeof install !== 'function') throw new Error('Missing server hook');
  install.call({} as never, server as unknown as ViteDevServer & PreviewServer);
  return {
    server,
    sampleData,
    sampleRead,
    async request(url: string, method = 'GET', body = '') {
      const req = {
        url,
        method,
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(body);
        },
      };
      const res = {
        statusCode: 200,
        body: '',
        setHeader: vi.fn(),
        end(value: string) {
          this.body = value;
        },
      };
      const next = vi.fn();
      await middleware!(req as never, res as never, next);
      return { req, res, next };
    },
  };
}

describe('development workbench server', () => {
  it('rewrites only its own exact address and preserves preview parameters', async () => {
    const dev = harness();
    const { req, next } = await dev.request('/design-system/?preview=controls&theme=pixel');
    expect(req.url).toBe('/design-system.html?preview=controls&theme=pixel');
    expect(next).toHaveBeenCalledOnce();
    expect(isDesignSystemPath('/design-system-other')).toBe(false);
    expect(isDesignSystemPath('/design-system/nested')).toBe(false);
    expect((await dev.request('/journal')).next).toHaveBeenCalledOnce();
    expect((await dev.request('/first-team?view=players&__design_system=roster')).req.url).toBe(
      '/design-system.html?view=players&__design_system=roster',
    );
    expect(dev.server.ssrLoadModule).not.toHaveBeenCalled();
  });
  it('loads sample data only on demand, with no browser cache', async () => {
    const dev = harness();
    const { res } = await dev.request('/__design-system');
    expect(JSON.parse(res.body)).toEqual({ view: { world: { id: 'sample' } } });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(dev.sampleData).toHaveBeenCalledOnce();
  });
  it('forwards bounded JSON reads and rejects unsupported methods', async () => {
    const dev = harness();
    await dev.request('/__design-system', 'POST', '{"type":"archive","year":1950}');
    expect(dev.sampleRead).toHaveBeenCalledWith({ type: 'archive', year: 1950 });
    expect((await dev.request('/__design-system', 'POST', 'invalid')).res.statusCode).toBe(400);
    expect((await dev.request('/__design-system', 'POST', 'x'.repeat(16385))).res.statusCode).toBe(
      400,
    );
    expect((await dev.request('/__design-system', 'DELETE')).res.statusCode).toBe(405);
  });
  it('refuses both HTML aliases and the sample endpoint in built preview', async () => {
    const preview = harness(true);
    for (const path of [
      '/design-system',
      '/design-system/',
      '/design-system.html',
      '/__design-system?x=1',
      '/first-team?__design_system=roster',
    ]) {
      const { res, next } = await preview.request(path);
      expect(res.statusCode).toBe(404);
      expect(next).not.toHaveBeenCalled();
    }
    expect((await preview.request('/lab')).next).toHaveBeenCalledOnce();
    expect(preview.server.ssrLoadModule).not.toHaveBeenCalled();
  });
});
