import { describe, expect, it } from 'vitest';
import { traceAggregate } from '../aggregate/trace';
import { matchDetail } from './build';
import { compareRecord, countScript, scriptCost, type ScriptCost } from './count';
import { detailSample, SAMPLE } from './sample.testkit';
import { validateScript } from './validate';
import { writeScript } from './write';

// Every detail of T825's sample is written (→MATCH-38, T827): substitutions, cards, injuries, a
// side a man short, penalties, extra time and the shoot-out, each script valid and counting back
// to its record.
//
// Skipped until the aggregate's attribution draws a ball's winner among the men on the pitch with
// the man who lost it: one of the sixty (fixture `1950:ENG:0:0:1:3:detail:26`) credits a take-on
// lost by a man who left at 79 to a man who came on at 80, and no trade keeps its record (T827's
// result). Un-skip once that lands.
describe.skip('the script of every detail of the sample (T827)', () => {
  it('is written, valid and counts back to its record', () => {
    const { chosen } = detailSample();
    expect(chosen.length).toBeGreaterThanOrEqual(SAMPLE);
    const costs: ScriptCost[] = [];
    for (const { f, rosters, match } of chosen) {
      const detail = matchDetail(match, rosters, traceAggregate(match));
      const r = writeScript(detail, 'fit');
      expect('problems' in r ? r.problems : [], f.id).toEqual([]);
      if ('problems' in r) continue;
      expect(validateScript(detail, r.script), f.id).toEqual([]);
      expect(compareRecord(detail, countScript(r.script, detail)), f.id).toEqual([]);
      const cost = scriptCost(r.script, detail);
      costs.push(cost);
      console.log(`T827 ${f.id} ${JSON.stringify(cost)}`);
    }
    const mean = (k: keyof ScriptCost) =>
      Math.round((costs.reduce((s, c) => s + c[k], 0) / Math.max(1, costs.length)) * 10) / 10;
    console.log(
      `T827 sample means over ${costs.length}: links ${mean('links')} (${mean('linkMetres')} m), heavy touches ${mean('miscontrols')}, restarts without a recorded delivery ${mean('connectiveRestarts')}`,
    );
  });
});
