import { expect, it } from 'vitest';
import { detailSample } from './sample.testkit';
import { writeScript } from './write';
import { validateScript } from './validate';
import { compareRecord, countScript, scriptCost, type ScriptCost } from './count';

/** Full match settlement and a seeded rare-scene search belong to the host integration gate. */
it('writes every detail of the sixty-fixture T825 corpus exactly', () => {
  const { selected, covered, needed } = detailSample();
  expect(selected).toHaveLength(60);
  expect(needed.filter((k) => !covered.has(k))).toEqual([]);
  const costs: ScriptCost[] = [];
  for (const { detail } of selected) {
    const written = writeScript(detail, `sample:${detail.id}`);
    expect('problems' in written ? written.problems : [], detail.id).toEqual([]);
    if (!('script' in written)) throw new Error(`no script: ${detail.id}`);
    expect(validateScript(detail, written.script), detail.id).toEqual([]);
    expect(compareRecord(detail, countScript(written.script, detail)), detail.id).toEqual([]);
    const cost = scriptCost(written.script, detail);
    costs.push(cost);
    console.info('T827 scriptCost', JSON.stringify({ id: detail.id, ...cost }));
  }
  const means = Object.fromEntries(
    (Object.keys(costs[0]!) as (keyof ScriptCost)[]).map((key) => [
      key,
      costs.reduce((sum, cost) => sum + cost[key], 0) / costs.length,
    ]),
  );
  console.info('T827 scriptCost means', JSON.stringify(means));
});
