import type { Connect, Plugin } from 'vite';
import { buildInfluenceCatalog } from '../../../../scripts/gameplay-influences.ts';
import { influenceMarkdown } from './catalog.ts';

/** Curated explanations with source-resolved evidence; separate assets from the game entry. */
export function gameplayInfluences(): Plugin {
  const serve: Connect.NextHandleFunction = (request, response, next) => {
    const path = request.url?.split('?')[0];
    if (path !== '/gameplay-influences.json' && path !== '/gameplay-influences.md') return next();
    try {
      const catalog = buildInfluenceCatalog();
      response.setHeader(
        'Content-Type',
        path.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      );
      response.setHeader('Cache-Control', 'no-store');
      response.end(path.endsWith('.md') ? influenceMarkdown(catalog) : JSON.stringify(catalog));
    } catch (error) {
      response.statusCode = 500;
      response.end(String(error));
    }
  };
  return {
    name: 'haeram-gameplay-influences',
    configureServer: (server) => void server.middlewares.use(serve),
    generateBundle() {
      const catalog = buildInfluenceCatalog();
      this.emitFile({
        type: 'asset',
        fileName: 'gameplay-influences.json',
        source: JSON.stringify(catalog),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'gameplay-influences.md',
        source: influenceMarkdown(catalog),
      });
    },
  };
}
