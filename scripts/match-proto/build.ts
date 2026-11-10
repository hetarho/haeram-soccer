// CLI: stages a playback and writes one self-contained page that plays it; identifiers and numbers only.
//   pnpm exec tsx scripts/match-proto/build.ts [--seed <s>] [--no-showcase] [--duration <seconds>]
//     [--out <dir>] [--serve [port]]
// Writes `<out>/index.html` (playback and viewer bundle inline) and `<out>/playback.json` (default
// out `.tmp/match-proto` under the repository root) and prints `html=`, `json=`, `bytes=`, `seed=`
// and `passed=<n>/<m>` of the staging metrics. `--serve` then answers every GET with the page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { computeMetrics } from './check/metrics.ts';
import { PROTO_CONFIG } from './core/config.ts';
import { producePlayback } from './stage/pipeline.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const VIEWER_ENTRY = resolve(HERE, 'viewer/main.ts');
const DEFAULT_OUT = '.tmp/match-proto';

const STYLE = [
  'html,body{margin:0;background:#111;color:#fff;font-family:sans-serif}',
  '#app{max-width:1180px;margin:0 auto;padding:8px}',
  '.controls{display:flex;gap:6px;align-items:center;padding:8px 0}',
  '.controls button{min-width:44px;min-height:44px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;font-size:16px;cursor:pointer}',
  '.controls button.on{background:#2f7d3b;border-color:#e8f2e9}',
  '.controls input[type=range]{flex:1;min-height:44px}',
].join('');

/** The page: the playback as `window.__MATCH_PROTO__`, then the viewer bundle, both inline. */
export function renderHtml(playbackJson: string, bundleJs: string): string {
  const data = playbackJson.replace(/</g, '\\u003c');
  const code = bundleJs.replace(/<\/script/gi, '<\\/script');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>match-proto</title><style>${STYLE}</style></head>` +
    `<body><div id="app"></div><script>window.__MATCH_PROTO__ = ${data};</script>` +
    `<script>${code}</script></body></html>`
  );
}

/** The viewer as one minified IIFE (esbuild, nothing written to disk). */
export async function bundleViewer(): Promise<string> {
  const result = await build({
    entryPoints: [VIEWER_ENTRY],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const serveAt = args.indexOf('--serve');
  if (serveAt >= 0 && (args[serveAt + 1] === undefined || args[serveAt + 1].startsWith('--'))) {
    args.splice(serveAt + 1, 0, String(PROTO_CONFIG.viewer.port));
  }
  const { values } = parseArgs({
    args,
    options: {
      seed: { type: 'string', default: 'demo' },
      'no-showcase': { type: 'boolean', default: false },
      duration: { type: 'string' },
      out: { type: 'string', default: DEFAULT_OUT },
      serve: { type: 'string' },
    },
  });
  const duration = values.duration === undefined ? undefined : Number(values.duration);
  const { playback, info } = producePlayback(values.seed, {
    showcase: !values['no-showcase'],
    ...(duration === undefined ? {} : { duration }),
  });
  const metrics = computeMetrics(playback);
  const json = JSON.stringify(playback);
  const html = renderHtml(json, await bundleViewer());
  const out = resolve(ROOT, values.out);
  mkdirSync(out, { recursive: true });
  const htmlPath = resolve(out, 'index.html');
  const jsonPath = resolve(out, 'playback.json');
  writeFileSync(htmlPath, html);
  writeFileSync(jsonPath, json);
  const lines = [
    `html=${htmlPath}`,
    `json=${jsonPath}`,
    `bytes=${Buffer.byteLength(html)}`,
    `seed=${info.seed}`,
    `passed=${metrics.filter((m) => m.pass).length}/${metrics.length}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  if (values.serve !== undefined) {
    const port = Number(values.serve);
    createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    }).listen(port, () => process.stdout.write(`url=http://localhost:${port}/\n`));
  }
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) void main();
