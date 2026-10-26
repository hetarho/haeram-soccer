import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { dependencies, runtimeImports, sourceGraph } from './source-graph';

const closure = (entry: string) =>
  dependencies(sourceGraph(process.cwd()), [entry]).map((file) => relative(process.cwd(), file));
const UI = 'apps/web/src/ui/';
/** Every local module a file names, type-only imports included: a type still ties it to its owner. */
const named = (file: string) =>
  ts
    .preProcessFile(readFileSync(file, 'utf8'), true, true)
    .importedFiles.map((entry) => entry.fileName)
    .filter((name) => name.startsWith('.'))
    .map((name) => relative(process.cwd(), resolve(dirname(file), name)));
/** The packages a closure executes, as named in its files. */
const packages = (files: readonly string[]) =>
  files.flatMap((file) =>
    runtimeImports(readFileSync(file, 'utf8'), file).filter((name) => !name.startsWith('.')),
  );
const FRAMEWORK = /^(react|react-dom|zustand)(\/|$)/;
/** Framework-independent read models shared by the Worker, slot summaries and the UI. */
const SHARED_READS = [
  'apps/web/src/runtime/playerTallies.ts',
  'apps/web/src/presentation/competitionLabels.ts',
  'apps/web/src/presentation/crests.ts',
];
describe('runtime architecture boundaries', () => {
  it.each(['host', 'protocol', 'slots'])(
    'runtime %s names no UI module and reaches none, nor React or Zustand',
    (entry) => {
      const file = `apps/web/src/runtime/${entry}.ts`;
      expect(named(file).filter((name) => name.startsWith(UI))).toEqual([]);
      const files = closure(file);
      expect(files.filter((name) => name.startsWith(UI))).toEqual([]);
      expect(packages(files).filter((name) => FRAMEWORK.test(name))).toEqual([]);
    },
  );
  it.each(SHARED_READS)(
    '%s reads only contracts, catalogs and engine leaves: no UI, framework, preference or storage code',
    (entry) => {
      const files = closure(entry);
      expect(
        files.filter((name) => name.startsWith('apps/') && !SHARED_READS.includes(name)),
      ).toEqual([]);
      expect(packages(files).filter((name) => FRAMEWORK.test(name))).toEqual([]);
      for (const forbidden of ['world', 'season', 'match'])
        expect(files, forbidden).not.toContain(`packages/engine/src/${forbidden}.ts`);
    },
  );
  it.each(['events', 'quotes', 'player-state'])(
    '%s stays below world generation, campaign and match orchestration',
    (leaf) => {
      const files = closure(`packages/engine/src/${leaf}.ts`);
      for (const forbidden of ['world', 'season', 'transfers', 'managerMarket', 'match'])
        expect(files, forbidden).not.toContain(`packages/engine/src/${forbidden}.ts`);
    },
  );
  it('executes an already prepared grid match without campaign or presentation code', () => {
    const files = closure('packages/engine/src/grid/engine.ts');
    for (const forbidden of [
      'world',
      'season',
      'match',
      'careers',
      'founding',
      'managerMarket',
      'grid/setup',
      'grid/playback',
    ])
      expect(files, forbidden).not.toContain(`packages/engine/src/${forbidden}.ts`);
  });
  it('rebuilds packed fixtures without starting the season or a match', () => {
    const files = closure('apps/web/src/adapters/packing.ts');
    for (const forbidden of ['world', 'season', 'match', 'founding', 'grid/engine'])
      expect(files, forbidden).not.toContain(`packages/engine/src/${forbidden}.ts`);
    expect(files).toContain('packages/engine/src/league-fixtures.ts');
  });
  it('queries transfer windows with only the calendar, without negotiation or orchestration', () => {
    expect(closure('packages/engine/src/transfer-window.ts')).toEqual([
      'packages/engine/src/calendar.ts',
      'packages/engine/src/transfer-window.ts',
    ]);
  });
});
