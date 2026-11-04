import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { sourceMessages } from '../packages/contracts/src/source-messages';
import { getMessageParameters, validateLocalePack } from '../apps/web/src/presentation/contracts';
import { validateRegistry } from '../apps/web/src/presentation/registry';

export async function validateI18n(root = fileURLToPath(new URL('../', import.meta.url))) {
  const directory = resolve(root, 'apps/web/public/presentation/locales');
  const json = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(resolve(directory, name), 'utf8'));
  const registry = validateRegistry(await json('index.json'), 'locale');
  const baseline = validateLocalePack(
    await json(registry.entries.find((entry) => entry.id === registry.defaultId)!.resource),
  );
  const errors: string[] = [];
  for (const [id, text] of Object.entries(sourceMessages))
    if (baseline.messages[id] !== text) errors.push(`Source/default message differs: ${id}`);
  const expected = Object.keys(baseline.messages).sort().join('\n');
  for (const entry of registry.entries) {
    const pack = validateLocalePack(await json(entry.resource), baseline);
    if (pack.id !== entry.id) errors.push(`Registry/pack ID differs: ${entry.id}`);
    if (Object.keys(pack.messages).sort().join('\n') !== expected)
      errors.push(`Incomplete or extra message keys: ${entry.id}`);
    for (const [id, value] of Object.entries(pack.messages)) {
      if (
        entry.id !== registry.defaultId &&
        (typeof value === 'string'
          ? /[가-힣]/.test(value)
          : Object.values(value.forms).some((form) => /[가-힣]/.test(form)))
      )
        errors.push(`Untranslated Korean: ${entry.id}/${id}`);
    }
  }
  let references = 0;
  for (const base of [
    'apps/web/src',
    'packages/engine/src',
    'packages/contracts/src',
    'packages/catalogs/src',
  ]) {
    const paths = await readdir(resolve(root, base), { recursive: true });
    for (const path of paths) {
      if (
        !/\.(js|jsx|mjs|ts|tsx)$/.test(path) ||
        /\.(test|testkit|d)\./.test(path) ||
        path === 'source-messages.ts'
      )
        continue;
      const file = resolve(root, base, path);
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const check = (id: string, node: ts.Node, parameters?: ts.Node, rich = false) => {
        references++;
        const message = baseline.messages[id];
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const location = `${relative(root, file)}:${line}`;
        if (!message) {
          errors.push(`${location}: unknown message ${id}`);
          return;
        }
        if (parameters && !ts.isObjectLiteralExpression(parameters)) return;
        const supplied = new Set(
          parameters && ts.isObjectLiteralExpression(parameters)
            ? parameters.properties
                .filter(
                  (property) =>
                    ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property),
                )
                .map((property) => property.name.getText(source).replace(/^['"]|['"]$/g, ''))
            : [],
        );
        if (
          parameters &&
          ts.isObjectLiteralExpression(parameters) &&
          parameters.properties.some(ts.isSpreadAssignment)
        )
          return;
        for (const name of getMessageParameters(message))
          if (!supplied.has(name))
            errors.push(`${location}: ${id} misses parameter ${name}${rich ? ' (rich)' : ''}`);
      };
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          /^(sourceMessage|displayMessage|richMessage|message|t)$/.test(node.expression.text) &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          check(node.arguments[0].text, node, node.arguments[1]);
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          node.tagName.getText(source) === 'LocalizedMessage'
        ) {
          const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
          const id = attrs.find((attr) => attr.name.getText(source) === 'id')?.initializer;
          const values = attrs.find((attr) => attr.name.getText(source) === 'values')?.initializer;
          if (id && ts.isStringLiteral(id))
            check(
              id.text,
              node,
              values && ts.isJsxExpression(values) ? values.expression : undefined,
              true,
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  for (const name of await readdir(resolve(root, 'apps/web'))) {
    if (
      name.endsWith('.html') &&
      /[가-힣]/.test(await readFile(resolve(root, 'apps/web', name), 'utf8'))
    )
      errors.push(`Hardcoded Korean in entry HTML: apps/web/${name}`);
  }
  for (const name of await readdir(resolve(root, 'apps/web/src'), { recursive: true })) {
    if (!name.endsWith('.css')) continue;
    const css = await readFile(resolve(root, 'apps/web/src', name), 'utf8');
    if (
      [...css.matchAll(/\bcontent\s*:\s*(['"])(.*?)\1/g)].some((match) => /\p{L}/u.test(match[2]))
    )
      errors.push(`Hardcoded CSS content: apps/web/src/${name}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    locales: registry.entries.length,
    messages: Object.keys(baseline.messages).length,
    references,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateI18n()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
