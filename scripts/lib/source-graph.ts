/** Runtime dependency identities for Node-only fixtures and measurement tools. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface SourceGraph {
  root: string;
  files: Map<string, string[]>;
}

const sourceExtension = /\.[cm]?[jt]sx?$/;

export function sourceGraph(root: string): SourceGraph {
  return { root: resolve(root), files: new Map() };
}

/** Type-only edges do not execute code; literal dynamic imports do. */
export function runtimeImports(text: string, file = 'source.ts'): string[] {
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
        ? runtimeImports(readFileSync(file, 'utf8'), file)
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
    .update(ts.version);
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
