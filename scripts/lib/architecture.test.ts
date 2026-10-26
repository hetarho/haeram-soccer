import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { dependencies, sourceGraph } from './source-graph';

const closure = (entry: string) =>
  dependencies(sourceGraph(process.cwd()), [entry]).map((file) => relative(process.cwd(), file));
describe('runtime architecture boundaries', () => {
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
