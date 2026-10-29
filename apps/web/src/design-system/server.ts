import type { Connect, Plugin } from 'vite';

export const SAMPLE_PATH = '/__design-system';
const isPreview = (url: string) =>
  new URL(url, 'http://localhost').searchParams.has('__design_system');
export const isDesignSystemPath = (url: string) =>
  /^\/design-system(?:\/|\.html)?(?:[?#]|$)/.test(url);

/** Installed only by Vite's development server; never a public/static API. */
export function designSystem(): Plugin {
  return {
    name: 'haeram-design-system',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (isDesignSystemPath(req.url ?? '') || isPreview(req.url ?? '')) {
          req.url =
            '/design-system.html' + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '');
          return next();
        }
        if (path !== SAMPLE_PATH) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const sample = await server.ssrLoadModule('/src/design-system/fixture.ts');
          if (req.method === 'GET') {
            res.end(JSON.stringify(await sample.sampleData()));
          } else if (req.method === 'POST') {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 16384) throw new Error('미리보기 요청이 너무 큽니다.');
            }
            res.end(JSON.stringify(await sample.sampleRead(JSON.parse(body))));
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'GET / POST only' }));
          }
        } catch (error) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          );
        }
      });
    },
    configurePreviewServer(server) {
      const unavailable: Connect.NextHandleFunction = (req, res, next) => {
        if (
          !isDesignSystemPath(req.url ?? '') &&
          !isPreview(req.url ?? '') &&
          req.url?.split('?')[0] !== SAMPLE_PATH
        )
          return next();
        res.statusCode = 404;
        res.end('Development only');
      };
      server.middlewares.use(unavailable);
    },
  };
}
