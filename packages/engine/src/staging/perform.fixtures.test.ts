/** Ten whole-match scripts staged are integration scope (ARCH-21). The host's batch runs this once
 * and retains the printed metrics and fit lines (`scripts/staging-read.ts` prints one fixture's).
 */
import { describe, expect, it } from 'vitest';
import { fixtureSides, loadDetail } from '../../../../tests/fixtures/match-script';
import { writeScript } from '../script/write';
import { fitLines, stagingMetrics } from './measure';
import { advance, createStaging } from './perform';

const IDS = Array.from({ length: 10 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);

/** Metrics the match prototype's own staging passed on each fixture (its fitted script, 28–31
 * metrics), read once at 195c900a before T841 removed it; the staging may pass one fewer. */
const PROTOTYPE_PASSED: Readonly<Record<string, number>> = {
  s01: 21,
  s02: 20,
  s03: 20,
  s04: 20,
  s05: 22,
  s06: 21,
  s07: 20,
  s08: 19,
  s09: 21,
  s10: 20,
};

describe('T828: every fixture is performed without re-crediting the record', () => {
  for (const id of IDS)
    it(id, () => {
      const detail = loadDetail(id);
      const written = writeScript(detail, 'fit');
      expect('problems' in written ? written.problems : []).toEqual([]);
      if (!('script' in written)) throw new Error(id);
      const script = written.script;
      const sides = fixtureSides(id, detail);
      const staged = advance(createStaging(script, sides), Infinity);
      expect(staged.done).toBe(true);
      const metrics = stagingMetrics(staged.frames, staged.events, script, sides);
      const fit = fitLines(staged.frames, staged.events, script, detail);
      const passed = metrics.filter((m) => m.pass).length;
      const prototypePassed = PROTOTYPE_PASSED[id]!;
      // Print the full lists before judging so every failure preserves its exact evidence.
      console.info('T828 picture', JSON.stringify({ id, prototypePassed, passed, metrics, fit }));
      expect(staged.events.filter((e) => e.kind === 'performed').map((e) => e.beat)).toEqual(
        script.beats.map((b) => b.index),
      );
      expect(fit.slice(0, 3).map((m) => [m.id, m.value, m.pass])).toEqual([
        ['fit.exact', 0, true],
        ['fit.performed', 0, true],
        ['fit.recast', 0, true],
      ]);
      expect(staged.events.some((e) => e.recast)).toBe(false);
      expect(passed).toBeGreaterThanOrEqual(prototypePassed - 1);
    });
});
