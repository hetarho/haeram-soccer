import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { format, resolveConfig } from 'prettier';
import { canonical } from '../packages/contracts/src/index';
import { invalidDetail } from '../packages/engine/src/script/failure';
import { runFixture, type FixtureDefinition } from '../tests/fixtures/run';

if (!process.argv.includes('--write')) throw invalidDetail('portable-fixtures:review-required');
const path = 'tests/fixtures/portable-v1.json';
const source = readFileSync(path, 'utf8');
const fixture = JSON.parse(source) as { definitions: FixtureDefinition[] };
const captureArgument = process.argv.indexOf('--captures');
const captures = captureArgument >= 0 ? process.argv[captureArgument + 1] : undefined;
if (captureArgument >= 0 && !captures) throw invalidDetail('portable-fixtures:capture-directory');

/** Locate only the existing formatted definition values; all other source bytes are retained. */
function expectedRanges(text: string): [number, number][] {
  return [...text.matchAll(/^      "expected": /gm)].map<[number, number]>((match) => {
    const start = match.index + match[0].length;
    if (text[start] !== '{') throw invalidDetail('portable-fixtures:expected-object');
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if ((char === '}' || char === ']') && --depth === 0) return [start, end + 1];
    }
    throw invalidDetail('portable-fixtures:expected-boundary');
  });
}

const ranges = expectedRanges(source);
if (ranges.length !== fixture.definitions.length)
  throw invalidDetail('portable-fixtures:expected-count');
const inputHash = createHash('sha256').update(source).digest('hex');
let output = '';
let cursor = 0;
for (const [index, definition] of fixture.definitions.entries()) {
  let expected: unknown;
  if (captures) {
    const capture = JSON.parse(
      gunzipSync(readFileSync(join(captures, `${definition.name}.json.gz`))).toString('utf8'),
    ) as { inputSha256: string; definition: Omit<FixtureDefinition, 'expected'>; facts: unknown };
    const { expected: previous, ...input } = definition;
    void previous;
    if (capture.inputSha256 !== inputHash || canonical(capture.definition) !== canonical(input))
      throw invalidDetail(`portable-fixtures:capture-input:${definition.name}`);
    expected = capture.facts;
  } else expected = runFixture(definition);
  const [start, end] = ranges[index];
  output +=
    source.slice(cursor, start) + JSON.stringify(expected, null, 2).replaceAll('\n', '\n      ');
  cursor = end;
}
output += source.slice(cursor);
// Apply the repository's JSON style to expectation values only. Even formatting must not
// rewrite the scenario inputs or the original top-level provenance.
const formatted = await format(output, { ...(await resolveConfig(path)), filepath: path });
const formattedRanges = expectedRanges(formatted);
if (formattedRanges.length !== ranges.length)
  throw invalidDetail('portable-fixtures:formatted-count');
output = '';
cursor = 0;
for (const [index, [start, end]] of ranges.entries()) {
  const [formattedStart, formattedEnd] = formattedRanges[index];
  output += source.slice(cursor, start) + formatted.slice(formattedStart, formattedEnd);
  cursor = end;
}
writeFileSync(path, output + source.slice(cursor));
console.log(
  JSON.stringify({ definitions: fixture.definitions.length, expectationsOnly: true, inputHash }),
);
