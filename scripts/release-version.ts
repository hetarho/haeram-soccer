/** Prepare a compatible patch before verification; this tool imports no game simulation. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

export const RELEASE_MANIFESTS = [
  'package.json',
  'apps/web/package.json',
  'packages/contracts/package.json',
  'packages/engine/package.json',
  'packages/catalogs/package.json',
] as const;
export const RULES_SOURCE = 'packages/contracts/src/versions.ts';
const currentPattern = /export const CURRENT_ENGINE_VERSION = '([^']+)';/;
const compatiblePattern =
  /export const COMPATIBLE_ENGINE_VERSIONS: readonly string\[\] = \[([\s\S]*?)\];/;

function parts(value: string, field: string) {
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value), field);
  const result = value.split('.').map(Number);
  assert(result.every(Number.isSafeInteger), field);
  return result as [number, number, number];
}

/** Validate the complete edit in memory before the command writes any file. */
export function prepareRelease(documents: Record<string, string>, requested?: string) {
  const source = documents[RULES_SOURCE];
  assert(typeof source === 'string', RULES_SOURCE);
  const current = currentPattern.exec(source)?.[1];
  assert(current, 'CURRENT_ENGINE_VERSION');
  const previous = parts(current, 'CURRENT_ENGINE_VERSION');
  const declaration = compatiblePattern.exec(source);
  assert(declaration, 'COMPATIBLE_ENGINE_VERSIONS');
  const body = declaration[1]!;
  const aliases = [...body.matchAll(/'([^']*)'/g)].map((match) => match[1]!);
  assert(body.replace(/'[^']*'/g, '').replace(/[\s,]/g, '') === '', RULES_SOURCE);
  const manifests = RELEASE_MANIFESTS.map((file) => {
    assert(typeof documents[file] === 'string', file);
    const data = JSON.parse(documents[file]) as { version?: unknown };
    assert(data && typeof data === 'object' && typeof data.version === 'string', file);
    return { file, data, version: parts(data.version, file) };
  });
  const known = [
    previous,
    ...manifests.map((manifest) => manifest.version),
    ...aliases.map((alias) => parts(alias, 'COMPATIBLE_ENGINE_VERSIONS')),
  ];
  assert(
    known.every(([major, minor]) => major === previous[0] && minor === previous[1]),
    RULES_SOURCE,
  );
  const highestPatch = Math.max(...known.map((version) => version[2]));
  const version = requested ?? [previous[0], previous[1], highestPatch + 1].join('.');
  const next = parts(version, 'CURRENT_ENGINE_VERSION');
  assert(
    next[0] === previous[0] && next[1] === previous[1] && next[2] > highestPatch,
    'CURRENT_ENGINE_VERSION',
  );
  const supported = [...new Set([...aliases, current])];
  const files: Record<string, string> = {};
  for (const { file, data } of manifests)
    files[file] = JSON.stringify({ ...data, version }, null, 2) + '\n';
  files[RULES_SOURCE] = source
    .replace(currentPattern, "export const CURRENT_ENGINE_VERSION = '" + version + "';")
    .replace(
      compatiblePattern,
      'export const COMPATIBLE_ENGINE_VERSIONS: readonly string[] = [' +
        supported.map((alias) => "'" + alias + "'").join(', ') +
        '];',
    );
  return { version, files };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  assert(args.length <= 1, 'release:prepare');
  const documents = Object.fromEntries(
    [...RELEASE_MANIFESTS, RULES_SOURCE].map((file) => [file, readFileSync(file, 'utf8')]),
  );
  const prepared = prepareRelease(documents, args[0]);
  const formatted = await Promise.all(
    Object.entries(prepared.files).map(
      async ([file, text]) =>
        [file, await format(text, { ...(await resolveConfig(file)), filepath: file })] as const,
    ),
  );
  for (const [file, text] of formatted) writeFileSync(file, text);
  console.log(
    JSON.stringify({ version: prepared.version, files: formatted.map(([file]) => file) }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
