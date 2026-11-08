import tseslint from 'typescript-eslint';
import i18n from './scripts/lib/i18n-rules.mjs';
import layers from './scripts/lib/layer-rules.mjs';

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
  // Feature-sliced layer direction, slice public APIs and side-effect-free layer modules
  // (→ARCH-3/4); the rule resolves each specifier from the importing file (scripts/lib/layer-rules.mjs).
  {
    files: ['apps/web/src/**/*.{js,jsx,mjs,ts,tsx}'],
    plugins: { layers },
    rules: { 'layers/feature-sliced-imports': 'error' },
  },
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
