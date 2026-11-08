import tseslint from 'typescript-eslint';
import i18n from './scripts/lib/i18n-rules.mjs';

/*
 * Feature-sliced layers of apps/web/src (→ARCH-3), lowest first: shared, entities, features,
 * widgets, pages; the legacy `ui/` screens sit above them while they migrate. A layer imports only
 * layers below it, slices of one layer never import each other, and anything outside a slice
 * imports it through its index.
 */
const WEB = 'apps/web/src';
const above = (layers) => ({
  regex: `(^|/)(${layers.join('|')})(/|$)`,
  message: 'A layer imports only the layers below it.',
});
const PUBLIC_API = {
  regex: '(^|/)(entities|features|widgets|pages)/[^/]+/',
  message: 'Import a slice through its index (its public API).',
};
// From <layer>/<slice>/<segment>/file, two steps up and back down is another slice of the layer.
const SIBLING = {
  regex: '^\\.\\./\\.\\./(?!\\.\\.)',
  message: 'Slices of one layer do not import each other; move the shared part down a layer.',
};
const restrict = (files, patterns) => ({
  files: files.map((path) => `${WEB}/${path}/**/*.{ts,tsx}`),
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  {
    files: ['apps/web/src/**/*.{js,jsx,mjs,ts,tsx}', 'packages/*/src/**/*.{js,jsx,mjs,ts,tsx}'],
    ignores: [
      '**/*.test.*',
      '**/*.testkit.*',
      '**/*.d.ts',
      'packages/contracts/src/source-messages.ts',
    ],
    linterOptions: { noInlineConfig: true },
    plugins: { i18n },
    rules: { 'i18n/no-hardcoded-copy': 'error' },
  },
  restrict(
    ['shared'],
    [
      above(['entities', 'features', 'widgets', 'pages']),
      { regex: '^\\.\\./\\.\\./ui/', message: 'shared does not import the legacy screens.' },
    ],
  ),
  restrict(['entities'], [above(['features', 'widgets', 'pages']), PUBLIC_API, SIBLING]),
  restrict(['features'], [above(['widgets', 'pages']), PUBLIC_API, SIBLING]),
  restrict(['widgets'], [above(['pages']), PUBLIC_API, SIBLING]),
  restrict(['pages'], [PUBLIC_API, SIBLING]),
  restrict(['ui', 'design-system', 'runtime', 'adapters', 'presentation'], [PUBLIC_API]),
  // Host transcendental Math is the CPU's C library (arm64 fuses multiply-adds), so its last bits
  // differ between linux-x64 and darwin-arm64 and a season can settle otherwise (T713, →ARCH-5,
  // ARCH-9). Engine and contracts source use portable-math.ts or exact integer arithmetic instead.
  {
    files: [
      'packages/engine/src/**/*.{js,mjs,ts,tsx}',
      'packages/contracts/src/**/*.{js,mjs,ts,tsx}',
    ],
    ignores: ['**/*.test.*', '**/*.testkit.*', 'packages/engine/src/portable-math.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...'exp expm1 log log1p log2 log10 sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh cbrt hypot pow'
          .split(' ')
          .map((property) => ({
            object: 'Math',
            property,
            message:
              'Host Math gives other last bits on other CPUs; use packages/engine/src/portable-math.ts.',
          })),
      ],
    },
  },
);
