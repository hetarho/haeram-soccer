/**
 * Moves source modules and rewrites every reference to them (→ARCH-3), so a later move needs no
 * hand-edited imports. Usage: `pnpm exec tsx scripts/move-modules.ts <manifest.json> [--dry-run]`,
 * where the manifest lists repository-relative `{ "from": …, "to": … }` pairs.
 *
 * Each pair is moved with `git mv`. In every file under apps, packages, scripts and tests, relative
 * specifiers are rewritten when the file or its target moved: static, type-only and re-export
 * imports, side-effect imports, `import()`, `vi.mock` / `vi.doMock` / `vi.importActual`, CSS
 * `composes: … from`, and literal `new URL('…', import.meta.url)` paths (a template literal's static
 * directory prefix included). A string literal that is exactly a moved repository path, such as a
 * test tier or an architecture exception key, follows the move. A specifier keeps its form: an
 * omitted extension stays omitted and a folder stays a folder.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Move = { from: string; to: string };
/** What the rewriter may ask of the tree: whether a repository-relative path is a file / folder. */
export type Tree = { isFile(path: string): boolean; isDirectory(path: string): boolean };

const SOURCE = /\.(?:[cm]?[jt]sx?|css)$/;
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];
const posix = (path: string) => path.split(sep).join('/');
const join2 = (from: string, spec: string) => posix(join(dirname(from), spec));

/** The file (or folder) a relative specifier names from `file`, or undefined if it is not local. */
function target(
  tree: Tree,
  file: string,
  spec: string,
): { path: string; suffix: string } | undefined {
  const base = join2(file, spec);
  for (const suffix of EXTENSIONS) {
    if (tree.isFile(base + suffix)) return { path: base + suffix, suffix };
  }
  if (tree.isDirectory(base)) return { path: base, suffix: '' };
  return undefined;
}

/** The specifier from `file` to `path`, in the form of the original specifier. */
function specifier(file: string, path: string, suffix: string): string {
  let out = posix(relative(dirname(file), path));
  if (suffix && out.endsWith(suffix)) out = out.slice(0, -suffix.length);
  return out.startsWith('.') ? out : `./${out}`;
}

const PATTERNS: RegExp[] = [
  // import … from '…', export … from '…'
  /(\bfrom\s*)(['"])(\.{1,2}\/[^'"\n]*)\2/g,
  // import '…' (side effect)
  /(\bimport\s*)(['"])(\.{1,2}\/[^'"\n]*)\2/g,
  // import('…'), vi.mock('…'), vi.doMock('…'), vi.importActual('…'), require('…')
  /(\b(?:import|vi\.mock|vi\.doMock|vi\.importActual|vi\.importMock|require)\(\s*)(['"])(\.{1,2}\/[^'"\n]*)\2/g,
];
const URL_LITERAL = /(\bnew URL\(\s*)(['"`])(\.{1,2}\/[^'"`\n]*?)(\$\{|\2)/g;

/**
 * Rewrites the references in `text`, a file that lived at `from` and now lives at `to`, given the
 * old→new map of every moved file. Paths are repository-relative with forward slashes; `tree`
 * answers for the tree before the move.
 */
export function rewriteSource(
  text: string,
  from: string,
  to: string,
  moved: ReadonlyMap<string, string>,
  tree: Tree,
): string {
  const follow = (spec: string): string => {
    const found = target(tree, from, spec);
    if (!found) return spec;
    const next = moved.get(found.path) ?? movedFolder(found.path, moved) ?? found.path;
    if (next === found.path && from === to) return spec;
    return specifier(to, next, found.suffix);
  };
  const swap = (all: string, head: string, quote: string, spec: string) => {
    const next = follow(spec);
    return next === spec ? all : `${head}${quote}${next}${quote}`;
  };
  if (/\.css$/.test(from))
    return text
      .replace(/(composes:[^;{}]*?\bfrom\s+)(['"])(\.{1,2}\/[^'"\n]*)\2/g, swap)
      .replace(/(@import\s+)(['"])(\.{1,2}\/[^'"\n]*)\2/g, swap);
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, swap);
  // A URL literal names a file or a folder prefix; resolve its directory part only when partial.
  out = out.replace(URL_LITERAL, (all, head: string, quote: string, spec: string, end: string) => {
    const whole = end === quote;
    const cut = whole ? spec.length : spec.lastIndexOf('/') + 1;
    const path = spec.slice(0, cut),
      rest = spec.slice(cut);
    const base = join2(from, path);
    if (!tree.isFile(base) && !tree.isDirectory(base)) return all;
    const next = moved.get(base) ?? movedFolder(base, moved) ?? base;
    if (next === base && from === to) return all;
    let rewritten = posix(relative(dirname(to), next));
    if (!rewritten.startsWith('.')) rewritten = `./${rewritten}`;
    if (path.endsWith('/') && !rewritten.endsWith('/')) rewritten += '/';
    return `${head}${quote}${rewritten}${rest}${end}`;
  });
  // A literal that is exactly a moved repository path follows it (test tiers, exception keys).
  out = out.replace(/(['"])([\w@./-]+\.[\w.]+)\1/g, (all, quote: string, path: string) => {
    const next = moved.get(path);
    return next ? `${quote}${next}${quote}` : all;
  });
  return out;
}

/** A folder whose every listed file moved together keeps naming the folder at its new place. */
function movedFolder(path: string, moved: ReadonlyMap<string, string>): string | undefined {
  const prefix = `${path}/`;
  const targets = [...moved].filter(([from]) => from.startsWith(prefix));
  if (!targets.length) return undefined;
  const folders = new Set(
    targets.map(([from, to]) => to.slice(0, to.length - (from.length - prefix.length) - 1)),
  );
  return folders.size === 1 ? [...folders][0] : undefined;
}

const ROOTS = ['apps', 'packages', 'scripts', 'tests'];
function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir))) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const path = dir ? `${dir}/${name}` : name;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (SOURCE.test(name)) out.push(path);
    }
  };
  for (const dir of ROOTS) if (existsSync(join(root, dir))) walk(dir);
  return out;
}

/** Applies a manifest: rewrites every reference first, then moves the files with `git mv`. */
export function moveModules(root: string, manifest: readonly Move[], dryRun = false) {
  const moved = new Map(manifest.map(({ from, to }) => [from, to]));
  for (const { from, to } of manifest) {
    if (!existsSync(join(root, from))) throw new Error(`${from} does not exist`);
    if (existsSync(join(root, to))) throw new Error(`${to} already exists`);
  }
  const tree: Tree = {
    isFile: (path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile(),
    isDirectory: (path) => existsSync(join(root, path)) && statSync(join(root, path)).isDirectory(),
  };
  const writes = new Map<string, string>();
  for (const file of sources(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    const to = moved.get(file) ?? file;
    const next = rewriteSource(text, file, to, moved, tree);
    if (next !== text) writes.set(to, next);
  }
  if (dryRun) return { moved: manifest.length, rewritten: writes.size };
  for (const { from, to } of manifest) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    execFileSync('git', ['mv', from, to], { cwd: root });
  }
  for (const [file, text] of writes) writeFileSync(join(root, file), text);
  return { moved: manifest.length, rewritten: writes.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, flag] = process.argv.slice(2);
  if (!manifestPath)
    throw new Error('usage: tsx scripts/move-modules.ts <manifest.json> [--dry-run]');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Move[];
  const result = moveModules(process.cwd(), manifest, flag === '--dry-run');
  console.log(`moved ${result.moved} files, rewrote references in ${result.rewritten}`);
}
