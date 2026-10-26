import { describe, expect, it } from 'vitest';
import { relative } from 'node:path';
import { dependencies, sourceGraph } from './source-graph';

const closure = (entry: string) =>
  dependencies(sourceGraph(process.cwd()), [entry]).map((file) => relative(process.cwd(), file));
const MODEL = 'packages/engine/src/facility-model.ts';

describe('facility architecture boundaries', () => {
  it('keeps the completed-facility model a leaf', () => {
    expect(closure(MODEL)).toEqual([MODEL]);
  });
  it('selects facility artwork from completed facts, without construction or the world', () => {
    const images = 'apps/web/src/presentation/facilityImages.ts';
    const files = closure(images);
    for (const forbidden of ['facilities', 'world', 'season', 'calendar', 'events', 'quotes'])
      expect(files, forbidden).not.toContain(`packages/engine/src/${forbidden}.ts`);
    const allowed = [images, 'apps/web/src/presentation/contracts.ts', MODEL];
    expect(files.filter((file) => !allowed.includes(file))).toEqual([]);
    expect(files).toContain(MODEL);
  });
  it('builds construction on the same model', () => {
    expect(closure('packages/engine/src/facilities.ts')).toContain(MODEL);
  });
});
