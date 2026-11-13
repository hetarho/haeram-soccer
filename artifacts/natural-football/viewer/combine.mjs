#!/usr/bin/env node
/**
 * Combines up to four exports into one 2×2 page: out/<name>/index.html + out/<name>/data/*.json.gz.
 *
 *   node combine.mjs --name <name> \
 *     --panel A "caption" /abs/a.json.gz --panel B "caption" /abs/b.json.gz … \
 *     [--repo /home/deep/haeram/haeram-soccor] [--title "Variant Match Viewer"] [--inline]
 *
 * The page's clock and sampling code is bundled NOW from `--repo` (default: the main checkout) with
 * that checkout's esbuild, so WATCH_MINUTE_MS and the dead-ball beats are whatever the checkout
 * holds when this runs. `--inline` also embeds the data (base64) for opening the file locally.
 * Nothing is written inside the checkout.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
};
const name = opt('name');
if (!name || !/^[\w.-]+$/.test(name)) throw new Error('--name <name> (letters, digits, . _ -)');
const repo = resolve(opt('repo', '/home/deep/haeram/haeram-soccor'));
const title = opt('title', 'Variant Match Viewer');
const inline = argv.includes('--inline');
const panels = [];
for (let i = 0; i < argv.length; i++)
  if (argv[i] === '--panel') {
    const [label, caption, file] = argv.slice(i + 1, i + 4);
    if (!file) throw new Error('--panel <label> <caption> <file.json.gz>');
    panels.push({ label, caption, file: resolve(file) });
    i += 3;
  }
if (!panels.length || panels.length > 4) throw new Error('give 1–4 --panel entries');

const outDir = join(here, 'out', name);
mkdirSync(join(outDir, 'data'), { recursive: true });

// ---- data: validated, deduplicated by content -------------------------------------------------
const MB = 1048576;
const entries = [];
const written = new Map();
for (const panel of panels) {
  const bytes = readFileSync(panel.file);
  const data = JSON.parse(gunzipSync(bytes));
  if (data.v !== 1 || !data.playback?.frames?.length) throw new Error(`${panel.file}: not a viewer export`);
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  const rel = `data/${hash}.json.gz`;
  if (!written.has(rel)) {
    copyFileSync(panel.file, join(outDir, rel));
    written.set(rel, bytes.length);
  }
  if (bytes.length > 15 * MB) throw new Error(`${panel.file}: ${(bytes.length / MB).toFixed(1)} MB > 15 MB`);
  entries.push({ label: panel.label, caption: panel.caption, file: rel, inline: inline ? `viewer-data-${hash}` : undefined, bytes, meta: data.meta });
}

// ---- the game's presentation code, bundled from the checkout ---------------------------------
const require = createRequire(join(repo, 'package.json'));
const esbuild = require('esbuild');
const repoPlugin = {
  name: 'repo',
  setup(build) {
    build.onResolve({ filter: /^repo:/ }, (args) => ({ path: join(repo, `${args.path.slice(5)}.ts`) }));
  },
};
const built = await esbuild.build({
  entryPoints: [join(here, 'page', 'viewer.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [repoPlugin],
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
});
const bundle = built.outputFiles[0].text;
const watchMinuteMs = Number(
  /export const WATCH_MINUTE_MS = ([\d_]+)/.exec(
    readFileSync(join(repo, 'apps/web/src/entities/match/lib/presentationClock.ts'), 'utf8'),
  )?.[1]?.replaceAll('_', ''),
);
const git = (...a) => {
  try {
    return execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
  } catch {
    return '?';
  }
};
const dirtyClock = git('status', '--porcelain', '--', 'apps/web/src/entities/match/lib', 'apps/web/src/features/match-viewer/lib');
const build = {
  head: `${git('rev-parse', '--abbrev-ref', 'HEAD')}@${git('rev-parse', '--short', 'HEAD')}${dirtyClock ? '+수정' : ''}`,
  at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  watchMinuteMs,
};

// ---- page --------------------------------------------------------------------------------------
const safe = (text) => text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const esc = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const config = {
  build,
  panels: entries.map(({ label, caption, file, inline: id }) => ({ label, caption, file, inline: id })),
};
const first = entries[0].meta;
const inlineData = inline
  ? [...new Map(entries.map((e) => [e.inline, e])).values()]
      .map((e) => `<script type="application/octet-stream" id="${e.inline}">${e.bytes.toString('base64')}</script>`)
      .join('\n')
  : '';
const html = readFileSync(join(here, 'page', 'template.html'), 'utf8')
  .replace('__TITLE__', () => esc(title))
  .replace('__HEADING__', () => esc(`${first.home.short} 대 ${first.away.short} · 변형 ${entries.length}개 비교`))
  .replace('__CONFIG__', () => safe(JSON.stringify(config)))
  .replace('__INLINE_DATA__', () => inlineData)
  .replace('__BUNDLE__', () => safe(bundle));
const page = join(outDir, 'index.html');
writeFileSync(page, html);

// ---- report ------------------------------------------------------------------------------------
const pageBytes = statSync(page).size;
const dataBytes = [...written.values()].reduce((a, b) => a + b, 0);
console.log(`page  ${page}  ${(pageBytes / MB).toFixed(2)} MB (bundle ${(bundle.length / 1024).toFixed(0)} KB)`);
console.log(`data  ${written.size} file(s) ${(dataBytes / MB).toFixed(2)} MB; publish total ${((pageBytes + (inline ? 0 : dataBytes)) / MB).toFixed(2)} MB`);
console.log(`clock WATCH_MINUTE_MS = ${watchMinuteMs} (${build.head}, bundled ${build.at})`);
for (const e of entries)
  console.log(`  ${e.label}  ${e.file}  ${e.meta.branch}@${e.meta.head}${e.meta.dirtyEngineFiles ? `+${e.meta.dirtyEngineFiles}` : ''}  ${e.meta.summary}  ${e.meta.frames} frames`);
if (new Set(entries.map((e) => `${e.meta.fixture.id} ${e.meta.home.id} ${e.meta.away.id}`)).size > 1) console.warn('WARNING: panels show different fixtures');
if (pageBytes > 16 * MB) console.warn('WARNING: page over the 16 MB Artifact limit (drop --inline)');
if (pageBytes + dataBytes > 64 * MB) console.warn('WARNING: over the 64 MB per-publish limit');
