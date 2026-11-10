/** Runtime dependency identities for Node-only fixtures and measurement tools. */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type ts from 'typescript';

/**
 * Import lists remembered across processes, keyed by sha256 of (root-relative path, NUL, file
 * bytes). Only the parse is remembered: every run still resolves the names on the live file system.
 */
export interface ImportMemo {
  file: string;
  entries: Map<string, readonly string[]>;
  /** Keys this process looked up; past the cap only these are written back. */
  used: Set<string>;
  /** Entries parsed since the last save. */
  misses: number;
}

export interface SourceGraph {
  root: string;
  files: Map<string, string[]>;
  memo?: ImportMemo;
}

const sourceExtension = /\.[cm]?[jt]sx?$/;
const requireHere = createRequire(import.meta.url);
let compiler: typeof ts | undefined;
/** Loading TypeScript costs about 0.3 s, so only a parse (a memo miss) loads it. */
const typescript = () => (compiler ??= requireHere('typescript') as typeof ts);
/** The installed compiler's `ts.version`, read without loading the compiler. */
export const typescriptVersion = (requireHere('typescript/package.json') as { version: string })
  .version;
const MEMO_FORMAT = 'runtime-imports-v1';
const MEMO_CAP = 10_000;
let memoHeader: { format: string; typescript: string; sourceGraph: string } | undefined;
/** A new format, compiler or edge rule in this file invalidates every remembered list. */
const header = () =>
  (memoHeader ??= {
    format: MEMO_FORMAT,
    typescript: typescriptVersion,
    sourceGraph: createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest('hex'),
  });

export function sourceGraph(root: string, memo?: ImportMemo): SourceGraph {
  return { root: resolve(root), files: new Map(), ...(memo ? { memo } : {}) };
}

/** A missing, corrupt or differently headed memo file is an empty memo. */
function readMemo(file: string): Map<string, readonly string[]> {
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const expected = header();
    const entries = stored.entries;
    if (
      stored.format === expected.format &&
      stored.typescript === expected.typescript &&
      stored.sourceGraph === expected.sourceGraph &&
      entries &&
      typeof entries === 'object' &&
      !Array.isArray(entries)
    )
      return new Map(
        Object.entries(entries).filter(
          (entry): entry is [string, string[]] =>
            Array.isArray(entry[1]) && entry[1].every((name) => typeof name === 'string'),
        ),
      );
  } catch {
    // Missing or unreadable: parse again.
  }
  return new Map();
}

export function importMemo(file: string): ImportMemo {
  return { file, entries: readMemo(file), used: new Set(), misses: 0 };
}

/**
 * After misses, merges with the current file and replaces it atomically; past the cap it keeps
 * only the entries this process used. Returns whether it wrote.
 */
export function saveImportMemo(memo: ImportMemo, cap = MEMO_CAP): boolean {
  if (!memo.misses) return false;
  const merged = readMemo(memo.file);
  for (const [key, names] of memo.entries) merged.set(key, names);
  const kept =
    merged.size > cap
      ? [...memo.used].map((key) => [key, memo.entries.get(key)!] as const)
      : merged;
  mkdirSync(dirname(memo.file), { recursive: true });
  const temp = `${memo.file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify({ ...header(), entries: Object.fromEntries(kept) }));
  renameSync(temp, memo.file);
  memo.misses = 0;
  return true;
}

/** Type-only edges do not execute code; literal dynamic imports do. */
export function runtimeImports(text: string, file = 'source.ts'): string[] {
  const ts = typescript();
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const add = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const bindings = clause?.namedBindings;
      if (
        !clause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((entry) => entry.isTypeOnly)
      )
        return;
      if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly || !node.moduleSpecifier) return;
      if (
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((entry) => entry.isTypeOnly)
      )
        return;
      if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    )
      imports.push(node.arguments[0]!.text);
    ts.forEachChild(node, add);
  };
  add(tree);
  return [...new Set(imports)];
}

function resolveImport(from: string, name: string): string | undefined {
  if (!name.startsWith('.')) return;
  const base = resolve(dirname(from), name);
  const stem = /\.[cm]?js$/.test(base) ? base.replace(/\.[cm]?js$/, '') : base;
  for (const file of [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${base}.mts`,
    `${base}.mjs`,
    `${base}.json`,
    join(base, 'index.ts'),
  ])
    if (existsSync(file) && statSync(file).isFile()) return file;
  throw new Error(`Unresolved local runtime import ${name} in ${from}`);
}

/** The file's runtime import names, from the memo when its path and bytes were parsed before. */
function importNames(graph: SourceGraph, file: string): readonly string[] {
  const memo = graph.memo;
  if (!memo) return runtimeImports(readFileSync(file, 'utf8'), file);
  const bytes = readFileSync(file);
  const key = createHash('sha256')
    .update(relative(graph.root, file))
    .update('\0')
    .update(bytes)
    .digest('hex');
  memo.used.add(key);
  let names = memo.entries.get(key);
  if (!names) {
    names = runtimeImports(bytes.toString('utf8'), file);
    memo.entries.set(key, names);
    memo.misses++;
  }
  return names;
}

/** Resolves local source edges without importing or executing application code. */
export function dependencies(graph: SourceGraph, entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    file = isAbsolute(file) ? file : resolve(graph.root, file);
    if (seen.has(file)) return;
    if (!existsSync(file)) throw new Error(`Missing computation dependency ${file}`);
    seen.add(file);
    let edges = graph.files.get(file);
    if (!edges) {
      edges = sourceExtension.test(file)
        ? importNames(graph, file)
            .map((name) => resolveImport(file, name))
            .filter((path): path is string => !!path)
        : [];
      graph.files.set(file, edges);
    }
    edges.forEach(visit);
  };
  entries.forEach(visit);
  return [...seen].sort();
}

export function sourceFiles(root: string, paths: readonly string[]): string[] {
  const out: string[] = [];
  const visit = (path: string) => {
    const file = resolve(root, path);
    if (!existsSync(file)) throw new Error(`Missing fingerprint input ${file}`);
    if (statSync(file).isDirectory()) {
      for (const name of readdirSync(file).sort()) visit(join(file, name));
    } else out.push(file);
  };
  paths.forEach(visit);
  return [...new Set(out)].sort();
}

export function fingerprintFiles(root: string, files: readonly string[]) {
  const hash = createHash('sha256')
    .update('runtime-dependencies-v1')
    .update(process.version)
    .update(typescriptVersion);
  for (const file of [...new Set(files)].sort())
    hash.update(relative(root, file)).update('\0').update(readFileSync(file));
  return { algorithm: 'sha256' as const, sha256: hash.digest('hex'), files: new Set(files).size };
}

export function computationFingerprint(
  graph: SourceGraph,
  entries: readonly string[],
  inputs: readonly string[] = [],
) {
  return fingerprintFiles(graph.root, [
    ...dependencies(graph, entries),
    ...sourceFiles(graph.root, inputs),
  ]);
}

export const isSource = (file: string) => sourceExtension.test(file) || extname(file) === '.json';
