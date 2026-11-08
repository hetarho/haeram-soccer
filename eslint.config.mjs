import tseslint from 'typescript-eslint';
import i18n from './scripts/lib/i18n-rules.mjs';

/*
 * Feature-sliced layers of apps/web/src (→ARCH-3/4), highest first: app, pages, widgets, features,
 * entities, shared. A layer imports only the layers below it, slices of one layer never import each
 * other (an entity names another only through that entity's `@x/<consumer>.ts` file), and anything
 * outside a slice imports it through its index. runtime, adapters and presentation sit below every
 * layer and import none of them, which keeps the Worker free of React (→ARCH-6).
 */
const WEB = 'apps/web/src';
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
/** The layers above `layer`. */
const higher = (layer) => LAYERS.slice(0, LAYERS.indexOf(layer));
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
// An entity names another entity only through that entity's cross-import file.
const ENTITY_SIBLING = {
  regex: '^\\.\\./\\.\\./(?!\\.\\.)(?![^/]+/@x/[^/]+$)',
  message: 'An entity names another only through its `@x/<consumer>` file.',
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
  restrict(['shared'], [above(higher('shared'))]),
  restrict(['entities'], [above(higher('entities')), PUBLIC_API, ENTITY_SIBLING]),
  restrict(['features'], [above(higher('features')), PUBLIC_API, SIBLING]),
  restrict(['widgets'], [above(higher('widgets')), PUBLIC_API, SIBLING]),
  restrict(['pages'], [above(higher('pages')), PUBLIC_API, SIBLING]),
  restrict(['app', 'design-system', 'lab', 'constants'], [PUBLIC_API]),
  restrict(['runtime', 'adapters', 'presentation'], [above(LAYERS)]),
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
