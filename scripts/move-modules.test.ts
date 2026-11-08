import { describe, expect, it } from 'vitest';
import { rewriteSource, type Tree } from './move-modules';

const FILES = new Set([
  'apps/web/src/ui/App.tsx',
  'apps/web/src/ui/App.module.css',
  'apps/web/src/ui/format.ts',
  'apps/web/src/ui/Pitch.tsx',
  'apps/web/src/ui/Pitch.module.css',
  'apps/web/src/ui/OwnerSheet.tsx',
  'apps/web/src/entities/club/index.ts',
  'apps/web/src/runtime/store.ts',
  'apps/web/public/presentation/locales/ko-KR.json',
]);
const tree: Tree = {
  isFile: (path) => FILES.has(path),
  isDirectory: (path) => [...FILES].some((file) => file.startsWith(`${path.replace(/\/$/, '')}/`)),
};
const moved = new Map([
  ['apps/web/src/ui/App.module.css', 'apps/web/src/shared/ui/styles/App.module.css'],
  ['apps/web/src/ui/format.ts', 'apps/web/src/shared/lib/format.ts'],
  ['apps/web/src/ui/Pitch.tsx', 'apps/web/src/features/match-viewer/ui/Pitch.tsx'],
  ['apps/web/src/ui/Pitch.module.css', 'apps/web/src/features/match-viewer/ui/Pitch.module.css'],
  ['apps/web/src/ui/OwnerSheet.tsx', 'apps/web/src/entities/office/ui/OwnerSheet.tsx'],
]);

describe('move-modules specifier rewriting', () => {
  it('follows moved targets from a file that stays, keeping each specifier form', () => {
    const app = [
      "import s from './App.module.css';",
      "import { number, type Format } from './format';",
      "import { OwnerSheetBody } from './OwnerSheet.tsx';",
      "export { Pitch } from './Pitch';",
      "import { ClubLink } from '../entities/club';",
      "const Pitch = lazy(() => import('./Pitch'));",
      "vi.mock('./format', async () => vi.importActual('./format'));",
    ].join('\n');
    expect(
      rewriteSource(app, 'apps/web/src/ui/App.tsx', 'apps/web/src/ui/App.tsx', moved, tree),
    ).toBe(
      [
        "import s from '../shared/ui/styles/App.module.css';",
        "import { number, type Format } from '../shared/lib/format';",
        "import { OwnerSheetBody } from '../entities/office/ui/OwnerSheet.tsx';",
        "export { Pitch } from '../features/match-viewer/ui/Pitch';",
        "import { ClubLink } from '../entities/club';",
        "const Pitch = lazy(() => import('../features/match-viewer/ui/Pitch'));",
        "vi.mock('../shared/lib/format', async () => vi.importActual('../shared/lib/format'));",
      ].join('\n'),
    );
  });

  it('recomputes every relative path of a moved file, URL literals and folder prefixes included', () => {
    const pitch = [
      "import s from './Pitch.module.css';",
      "import { useGameState } from '../runtime/store';",
      "import '../runtime/store';",
      "const one = new URL('../../public/presentation/locales/ko-KR.json', import.meta.url);",
      'const all = new URL(`../../public/presentation/locales/${id}.json`, import.meta.url);',
      "const web = new URL('https://example.test/journal');",
    ].join('\n');
    expect(
      rewriteSource(
        pitch,
        'apps/web/src/ui/Pitch.tsx',
        'apps/web/src/features/match-viewer/ui/Pitch.tsx',
        moved,
        tree,
      ),
    ).toBe(
      [
        "import s from './Pitch.module.css';",
        "import { useGameState } from '../../../runtime/store';",
        "import '../../../runtime/store';",
        "const one = new URL('../../../../public/presentation/locales/ko-KR.json', import.meta.url);",
        'const all = new URL(`../../../../public/presentation/locales/${id}.json`, import.meta.url);',
        "const web = new URL('https://example.test/journal');",
      ].join('\n'),
    );
  });

  it('rewrites CSS composes and exact repository paths, and leaves unknown specifiers alone', () => {
    const css = ".panel { composes: card from './App.module.css'; }";
    expect(
      rewriteSource(
        css,
        'apps/web/src/ui/Pitch.module.css',
        'apps/web/src/features/match-viewer/ui/Pitch.module.css',
        moved,
        tree,
      ),
    ).toBe(".panel { composes: card from '../../../shared/ui/styles/App.module.css'; }");
    const tiers = "export const FILES = ['apps/web/src/ui/format.ts', './missing'];";
    expect(
      rewriteSource(tiers, 'tests/config/tiers.ts', 'tests/config/tiers.ts', moved, tree),
    ).toBe("export const FILES = ['apps/web/src/shared/lib/format.ts', './missing'];");
  });
});
