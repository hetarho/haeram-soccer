import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { dependencies, runtimeImports, sourceGraph } from './source-graph';

const graph = sourceGraph(process.cwd());
const closure = (entry: string) =>
  dependencies(graph, [entry]).map((file) => relative(process.cwd(), file));
const preference = 'apps/web/src/adapters/motionPreference.ts';

describe('motion preference boundaries', () => {
  it('runs the theme transition adapter without UI modules or React', () => {
    const files = closure('apps/web/src/adapters/themeTransition.ts');
    expect(files).toContain(preference);
    expect(files.filter((file) => file.startsWith('apps/web/src/ui/'))).toEqual([]);
    for (const file of files)
      expect(
        runtimeImports(readFileSync(file, 'utf8'), file).filter((name) =>
          /^react(\/|$)/.test(name),
        ),
        file,
      ).toEqual([]);
  });
  it('leaves the reduced-motion query to the preference adapter that UI motion reuses', () => {
    expect(closure('apps/web/src/ui/motion.ts')).toContain(preference);
    for (const file of ['apps/web/src/ui/motion.ts', 'apps/web/src/adapters/themeTransition.ts'])
      expect(readFileSync(file, 'utf8'), file).not.toContain('prefers-reduced-motion');
    expect(readFileSync(preference, 'utf8')).toContain('prefers-reduced-motion');
  });
});
