import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const { Linter } = require('eslint');
const { noHardcodedCopy } = require('./lib/i18n-rules.mjs');
const linter = new Linter();
const verify = (code: string): { ruleId: string | null; message: string }[] =>
  linter.verify(
    code,
    [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { i18n: { rules: { 'no-hardcoded-copy': noHardcodedCopy } } },
        rules: { 'i18n/no-hardcoded-copy': 'error' },
      },
    ],
    { filename: 'example.tsx' },
  );

describe('resource-only copy guard', () => {
  it.each([
    "const label = '저장';",
    'const text = `선수 ${count}명`;',
    'const View = () => <button>Save</button>;',
    'const View = () => <button aria-label="저장" />;',
    'const View = () => <button title={ready ? "Ready" : "Paused"} />;',
    "const label = '\\uc800\\uc7a5';",
  ])('rejects hardcoded prose: %s', (code) => {
    expect(verify(code)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'i18n/no-hardcoded-copy' })]),
    );
  });
  it('allows resource references, semantic attributes, comments and type-only historical facts', () => {
    expect(
      verify(`
      // 저장 is a source-language example, not display copy.
      type Outcome = '승' | '무' | '패';
      const label = sourceMessage('result.win');
      const View = () => <button data-testid="save" aria-label={displayMessage('save.done')}>{label}</button>;
    `),
    ).toEqual([]);
  });
});
