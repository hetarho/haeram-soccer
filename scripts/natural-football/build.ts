/** Build an offline comparison with the current game's shared painters and presentation clock. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { message } from '../../packages/contracts/src/messages';
import { createLoadedLocale } from '../../apps/web/src/presentation/locale';
import type { LocalePack, PackRegistry } from '../../apps/web/src/presentation/contracts';
import { assertComparable, readExport } from './data';

const args = process.argv.slice(2);
const opt = (key: string, fallback?: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1];
};
const baseline = opt('baseline'),
  candidate = opt('candidate'),
  out = opt('out');
if (!baseline || !candidate || !out)
  throw new Error(
    message('naturalFootball.usage', {
      command:
        'build.ts --baseline BASE.json.gz --candidate CANDIDATE.json.gz --out index.html [--locale ko-KR]',
    }),
  );
const bytes = [readFileSync(baseline), readFileSync(candidate)];
const data = bytes.map((b) => readExport(JSON.parse(gunzipSync(b).toString('utf8'))));
assertComparable(data[0], data[1]);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const resourceDir = resolve(root, 'apps/web/public/presentation/locales');
const registry = JSON.parse(
  readFileSync(resolve(resourceDir, 'index.json'), 'utf8'),
) as PackRegistry<'locale'>;
const id = opt('locale', registry.defaultId)!;
const entry = registry.entries.find((e) => e.id === id);
if (!entry) throw new Error(message('naturalFootball.invalid'));
const pack = (id: string) =>
  JSON.parse(
    readFileSync(resolve(resourceDir, registry.entries.find((e) => e.id === id)!.resource), 'utf8'),
  ) as LocalePack;
const selected = pack(id),
  baselinePack = pack(registry.defaultId);
const locale = createLoadedLocale(registry, selected, baselinePack);
const bundled = await build({
  entryPoints: [resolve(here, 'viewer.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
});
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const config = JSON.stringify({ registry, selected, baselinePack }).replaceAll('<', '\\u003c');
const html = readFileSync(resolve(here, 'template.html'), 'utf8')
  .replace('__LANG__', escapeHtml(id))
  .replace('__DIR__', locale.direction)
  .replace('__TITLE__', escapeHtml(locale.t('naturalFootball.title')))
  .replace('__CONFIG__', () => config)
  .replace('__BASELINE__', () => bytes[0].toString('base64'))
  .replace('__CANDIDATE__', () => bytes[1].toString('base64'))
  .replace('__BUNDLE__', () => bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), html);
console.log(
  JSON.stringify({
    out: resolve(out),
    bytes: Buffer.byteLength(html),
    baseline: data[0].meta.head,
    candidate: data[1].meta.head,
    inputHash: data[0].meta.inputHash,
    recordHash: data[0].meta.recordHash,
    locale: id,
  }),
);
