/**
 * The match lab's catalog of tunable grid numbers (→LAB-3, T573): every leaf `tunableLeaves()`
 * lists with its default, its code comment and whether it is copied at load, grouped by config
 * object, written to apps/web/src/lab/tunables.json for the lab page (which imports no engine code).
 *
 *   pnpm run lab:tunables
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import ts from 'typescript';
import {
  GRID_TUNABLES,
  LOAD_TIME_LEAVES,
  tunableLeaves,
} from '../packages/engine/src/grid/tunables';

const GRID = fileURLToPath(new URL('../packages/engine/src/grid/', import.meta.url));
export const CATALOG_PATH = fileURLToPath(
  new URL('../apps/web/src/lab/tunables.json', import.meta.url),
);

export interface CatalogLeaf {
  path: string;
  value: number;
  comment: string;
  loadTime: boolean;
}
export interface CatalogGroup {
  name: string;
  file: string;
  comment: string;
  leaves: CatalogLeaf[];
}
export interface Catalog {
  groups: CatalogGroup[];
}

/** A comment's text without its markers, one line. */
function clean(raw: string): string {
  return raw
    .replace(/^\/\*\*?|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(\*|\/\/)\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function leadingComment(text: string, node: ts.Node): string {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges.map((r) => clean(text.slice(r.pos, r.end))).join(' ');
}

/** A `// …` after the property on its own line (past its comma). */
function trailingComment(text: string, node: ts.Node): string {
  const end = text[node.getEnd()] === ',' ? node.getEnd() + 1 : node.getEnd();
  const ranges = ts.getTrailingCommentRanges(text, end) ?? [];
  return ranges.map((r) => clean(text.slice(r.pos, r.end))).join(' ');
}

/** Comments by path from each `export const X_CONFIG = { … }` literal, and each export's file. */
function sourceComments() {
  const comments = new Map<string, string>();
  const files = new Map<string, { file: string; comment: string }>();
  for (const file of readdirSync(GRID).filter(
    (f) => f.endsWith('.ts') && !f.includes('.test') && !f.includes('.testkit'),
  )) {
    const text = readFileSync(GRID + file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const walk = (node: ts.Expression, path: string) => {
      let inner: ts.Expression = node;
      while (
        ts.isAsExpression(inner) ||
        ts.isSatisfiesExpression(inner) ||
        ts.isParenthesizedExpression(inner)
      )
        inner = inner.expression;
      if (ts.isObjectLiteralExpression(inner))
        for (const prop of inner.properties) {
          if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
          const key = prop.name.getText(sf).replace(/^['"]|['"]$/g, '');
          const at = `${path}.${key}`;
          const comment = leadingComment(text, prop) || trailingComment(text, prop);
          if (comment) comments.set(at, comment);
          walk(prop.initializer, at);
        }
      else if (ts.isArrayLiteralExpression(inner))
        inner.elements.forEach((e, i) => walk(e, `${path}.${i}`));
    };
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        const name = d.name.getText(sf);
        if (!(name in GRID_TUNABLES) || !d.initializer) continue;
        files.set(name, {
          file: `packages/engine/src/grid/${file}`,
          comment: leadingComment(text, st),
        });
        walk(d.initializer, name);
      }
    }
  }
  return { comments, files };
}

/** The catalog as the engine and its sources stand now. */
export function buildCatalog(): Catalog {
  const { comments, files } = sourceComments();
  const leaves = tunableLeaves();
  const commentOf = (path: string) => {
    // A leaf without its own comment takes its nearest commented parent's.
    for (let at = path; at.includes('.'); at = at.slice(0, at.lastIndexOf('.'))) {
      const c = comments.get(at);
      if (c) return c;
    }
    return '';
  };
  return {
    groups: Object.keys(GRID_TUNABLES).map((name) => ({
      name,
      file: files.get(name)?.file ?? '',
      comment: files.get(name)?.comment ?? '',
      leaves: leaves
        .filter((l) => l.path.startsWith(`${name}.`))
        .map((l) => ({
          path: l.path,
          value: l.value,
          comment: commentOf(l.path),
          loadTime: LOAD_TIME_LEAVES.includes(l.path),
        })),
    })),
  };
}

export async function catalogText(): Promise<string> {
  return format(JSON.stringify(buildCatalog()), { parser: 'json', printWidth: 100 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(CATALOG_PATH, await catalogText());
  const catalog = buildCatalog();
  console.log(
    `wrote ${CATALOG_PATH}: ${catalog.groups.length} groups, ${catalog.groups.reduce((a, g) => a + g.leaves.length, 0)} leaves`,
  );
}
