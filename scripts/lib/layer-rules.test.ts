import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const { Linter } = require('eslint');
const { featureSlicedImports } = require('./layer-rules.mjs');
const linter = new Linter();
const lint = (filename: string, code: string): { ruleId: string | null; messageId?: string }[] =>
  linter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { layers: { rules: { 'feature-sliced-imports': featureSlicedImports } } },
        rules: { 'layers/feature-sliced-imports': 'error' },
      },
    ],
    { filename },
  );
const verify = (file: string, code: string) => lint(`apps/web/src/${file}`, code);

describe('feature-sliced import guard', () => {
  it.each([
    // a slice index re-exporting a sibling slice
    ['pages/club/index.ts', "export * from '../journal';", 'sibling'],
    // a file below its segment reaching a sibling slice
    ['entities/player/ui/deep/X.tsx', "import { A } from '../../../club/ui/ClubCrest';", 'entity'],
    // an entity using another consumer's cross-import file
    ['entities/player/ui/X.tsx', "import { A } from '../../club/@x/league';", 'entity'],
    // a dynamic import() of a higher layer or a sibling slice
    [
      'features/match-viewer/ui/X.tsx',
      "const a = () => import('../../../widgets/b/ui/B');",
      'higher',
    ],
    ['pages/club/ui/X.tsx', "const a = () => import('../../journal/ui/Season');", 'sibling'],
    ['entities/player/ui/X.tsx', "const a = () => import('../../club/ui/ClubCrest');", 'entity'],
    // a side-effect-only import inside each layer
    ['app/ui/X.ts', "import '../../shared/x';", 'sideEffect'],
    ['pages/club/ui/X.ts', "import '../../../shared/x';", 'sideEffect'],
    ['widgets/cash-alarm/ui/X.ts', "import '../../../shared/x';", 'sideEffect'],
    ['features/approvals/ui/X.ts', "import '../../../shared/x';", 'sideEffect'],
    ['entities/club/ui/X.ts', "import '../../../shared/x';", 'sideEffect'],
    ['shared/ui/X.ts', "import './x.css';", 'sideEffect'],
    ['pages/club/index.ts', "export {} from './ui/Rich';", 'sideEffect'],
    // a specifier that climbs above src and comes back is classified by where it lands
    [
      'pages/club/ui/X.tsx',
      "import { A } from '../../../../src/entities/player/ui/PlayerLink';",
      'publicApi',
    ],
    [
      'pages/club/ui/X.tsx',
      "import { A } from '../../../../../web/src/pages/journal/ui/LiveSeason';",
      'sibling',
    ],
    ['shared/ui/X.tsx', "import { A } from '../../../src/app/ui/App';", 'higher'],
    // the shapes the previous patterns already caught
    [
      'features/match-viewer/ui/X.tsx',
      "import { A } from '../../../widgets/event-center';",
      'higher',
    ],
    ['features/approvals/ui/X.tsx', "import type { A } from '../../../pages/club';", 'higher'],
    [
      'features/approvals/ui/X.ts',
      "type A = typeof import('../../../pages/club/ui/Rich');",
      'higher',
    ],
    ['shared/ui/X.tsx', "import { A } from '../../entities/player';", 'higher'],
    ['entities/player/ui/X.tsx', "import { A } from '../../club';", 'entity'],
    ['pages/club/ui/X.tsx', "import { A } from '../../journal';", 'sibling'],
    ['widgets/club-detail/ui/X.tsx', "import { A } from '../../../features/b/ui/B';", 'publicApi'],
    ['app/ui/X.tsx', "import { A } from '../../pages/club/ui/Rich';", 'publicApi'],
    ['design-system/X.tsx', "import { A } from '../entities/player/ui/PlayerLink';", 'publicApi'],
    ['app/ui/X.tsx', "const a = () => import('../../pages/club');", 'lazyIndex'],
    // a dynamic import() naming a slice's logic.ts entry
    ['app/ui/X.tsx', "const a = () => import('../../entities/match/logic');", 'lazyIndex'],
    // a slice's logic.ts re-exporting anything but its own lib/
    ['entities/match/logic.ts', "export { A } from './ui/HeatPitch';", 'logicLib'],
    ['entities/match/logic.ts', "export { A } from './model/usePitchSkin';", 'logicLib'],
    ['entities/match/logic.ts', "export { A } from '../club/lib/crests';", 'logicLib'],
    ['features/match-viewer/logic.ts', "export * from '../../entities/match';", 'logicLib'],
    ['runtime/X.ts', "import { A } from '../entities/player';", 'infrastructure'],
    ['presentation/X.ts', "const a = () => import('../shared/lib/x');", 'infrastructure'],
  ])('rejects %s: %s', (file, code, messageId) => {
    expect(verify(file, code)).toEqual([
      expect.objectContaining({ ruleId: 'layers/feature-sliced-imports', messageId }),
    ]);
  });

  it.each([
    // index imports, with or without the file name
    ['features/approvals/ui/X.tsx', "import { A } from '../../../entities/club';"],
    ['features/approvals/ui/X.tsx', "import { A } from '../../../entities/club/index';"],
    // a slice's framework-free logic.ts entry, and that file re-exporting its own lib/
    ['features/match-viewer/lib/X.ts', "import { A } from '../../../entities/match/logic';"],
    [
      'entities/match/logic.ts',
      "export { A } from './lib/advanced';\nexport * from './lib/replay';",
    ],
    ['main.tsx', "import { A } from './widgets/presentation-settings';"],
    [
      'design-system/X.tsx',
      "import { A } from '../pages/club';\nimport { B } from '../app/ui/App';",
    ],
    // own-slice relative imports at any depth, and an index exporting its own modules
    ['entities/player/ui/X.tsx', "import { A } from './Y';\nimport { B } from '../lib/z';"],
    ['entities/player/ui/deep/X.tsx', "import { A } from '../../lib/z';"],
    ['pages/club/index.ts', "export { A } from './ui/Rich';\nexport * from './lib/x';"],
    // the importing entity's own cross-import file
    ['entities/league/ui/X.tsx', "import { A } from '../../club/@x/league';"],
    ['entities/league/ui/deep/X.tsx', "import { A } from '../../../club/@x/league';"],
    // dynamic import() of a module file in an allowed slice
    ['app/ui/X.tsx', "const a = () => import('../../pages/club/ui/Rich');"],
    [
      'widgets/b/ui/X.tsx',
      "const a = () => import('../../../features/match-viewer/ui/MatchReport');",
    ],
    ['pages/club/ui/X.tsx', "const a = () => import('./RecordsRoom');"],
    ['app/office/X.test.ts', "type A = typeof import('../../pages/club/lib/worldMarket');"],
    // CSS modules, shared segments, infrastructure, packages and type-only empty imports
    [
      'pages/club/ui/X.tsx',
      "import s from './Rich.module.css';\nimport t from '../../../shared/ui/styles/App.module.css';",
    ],
    [
      'shared/ui/X.tsx',
      "import { A } from '../lib/y';\nimport { B } from '../../presentation/format';\nimport { C } from '../../../../../packages/engine/src/player';\nimport { useState } from 'react';",
    ],
    ['app/ui/X.ts', "import type {} from '../../shared/lib/x';"],
    ['pages/club/index.ts', "export type {} from './ui/Rich';"],
    ['pages/club/ui/X.tsx', "import { A } from '../../../../src/pages/club/ui/Y';"],
    // side-effect imports outside the layers
    ['presentation/X.ts', "import './theme.css';\nimport '../adapters/themeTransition.css';"],
  ])('allows %s: %s', (file, code) => {
    expect(verify(file, code)).toEqual([]);
  });

  it('keeps logic.ts to its own lib/ under the absolute file name ESLint passes', () => {
    const file = resolve('apps/web/src/entities/match/logic.ts');
    expect(lint(file, "export { A } from './lib/advanced';")).toEqual([]);
    expect(lint(file, "export { A } from './ui/HeatPitch';")).toEqual([
      expect.objectContaining({ messageId: 'logicLib' }),
    ]);
  });
});
