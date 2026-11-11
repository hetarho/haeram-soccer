/** Ten whole-match scripts and the prototype comparison are integration scope (ARCH-21).
 * The prototype imports below are the task-base implementation, untouched by this port.
 * The host's batch runs this once and retains the printed baseline/candidate metrics and fit lines.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StagingSide } from '../../../contracts/src/match-script';
import { loadDetail } from '../../../../tests/fixtures/match-script';
import { readSettled } from '../../../../scripts/match-proto/core/settled';
import { writeFitted } from '../../../../scripts/match-proto/fit/write';
import { performScript } from '../../../../scripts/match-proto/stage/perform';
import { computeMetrics } from '../../../../scripts/match-proto/check/metrics';
import { fitMetrics } from '../../../../scripts/match-proto/check/fit';
import { writeScript } from '../script/write';
import { fitLines, stagingMetrics } from './measure';
import { advance, createStaging } from './perform';

const IDS = Array.from({ length: 10 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);
const BASE = '9e1332bdf6e055112f36917d51974bf3f9c26281';

describe('T828: every fixture is performed without re-crediting the record', () => {
  for (const id of IDS)
    it(id, () => {
      const raw = JSON.parse(
        readFileSync(new URL(`../script/fixtures/${id}.json`, import.meta.url), 'utf8'),
      );
      const original = readSettled(raw);
      const protoScript = writeFitted(original, 'fit');
      const prototype = performScript(protoScript);
      const baseline = computeMetrics(prototype);
      const baselineFit = fitMetrics(prototype, protoScript, original, {
        writeMs: 0,
        stageMs: 0,
      }).filter((m) => !m.id.endsWith('Ms'));
      const detail = loadDetail(id);
      const written = writeScript(detail, 'fit');
      expect('problems' in written ? written.problems : []).toEqual([]);
      if (!('script' in written)) throw new Error(id);
      const script = written.script;
      const sides = detail.sides.map((side, t): StagingSide => ({
        tactic: side.tactic,
        players: side.lines.map((line, i) => ({
          line: i,
          slot: line.slot,
          role: line.role,
          pace: raw.sides[t].players[i].attrs[4],
          anticipation: raw.sides[t].players[i].attrs[5],
          discipline: 50,
          pressing: 50,
          freedom: 50,
        })),
      })) as [StagingSide, StagingSide];
      const staged = advance(createStaging(script, sides), Infinity);
      expect(staged.done).toBe(true);
      const metrics = stagingMetrics(staged.frames, staged.events, script, sides);
      const fit = fitLines(staged.frames, staged.events, script, detail);
      const passed = metrics.filter((m) => m.pass).length;
      const prototypePassed = baseline.filter((m) => m.pass).length;
      // Print both full lists before judging so every failure preserves its exact evidence.
      console.info(
        'T828 picture',
        JSON.stringify({
          id,
          base: BASE,
          prototypePassed,
          passed,
          prototype: baseline,
          metrics,
          prototypeFit: baselineFit,
          fit,
        }),
      );
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
