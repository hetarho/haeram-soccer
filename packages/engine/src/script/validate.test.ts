import { describe, expect, it } from 'vitest';
import { sampleDetail } from '../../../../tests/fixtures/match-script';
import { validateScript } from './validate';
import { writeScript } from './write';
const detail = sampleDetail(),
  result = writeScript(detail, 'validate-unit');
if ('problems' in result) throw new Error(result.problems.join(';'));
const original = result.script;
const fresh = () => structuredClone(original);

describe('fitted validation', () => {
  it('checks each row exactly once', () => {
    expect(validateScript(detail, original)).toEqual([]);
    const missing = fresh(),
      b = missing.beats.find((b) => b.event !== undefined)!;
    missing.beats = missing.beats.filter((x) => x !== b);
    expect(validateScript(detail, missing)).toContain(`event:${b.event}:missing`);
    const duplicate = fresh();
    duplicate.beats.push({ ...b, index: duplicate.beats.length });
    expect(validateScript(detail, duplicate)).toContain(`event:${b.event}:twice`);
  });
  it('rejects altered actor, recorded cell, outcome and credited winner', () => {
    const s = fresh(),
      b = s.beats.find((b) => b.event !== undefined && b.outcome === 'intercepted')!;
    b.actor = (b.actor + 1) % 11;
    b.opponent = (b.opponent! + 1) % 11;
    b.outcome = 'complete';
    b.from = [104, 67];
    const problems = validateScript(detail, s);
    for (const key of ['actor', 'from', 'result', 'other'])
      expect(problems).toContain(`beat:${b.index}:${key}`);
  });
  it('rejects an altered qualifier or shot minute', () => {
    const s = fresh(),
      b = s.beats.find((b) => b.shot !== undefined)!;
    b.xg!++;
    b.clock += 60;
    expect(validateScript(detail, s)).toContain(`beat:${b.index}:qualifier`);
    expect(validateScript(detail, s)).toContain(`beat:${b.index}:minute`);
  });
  it('allows only the three connective forms', () => {
    const s = fresh(),
      b = s.beats.find((b) => b.move === 'link')!;
    b.kind = 'pass';
    expect(validateScript(detail, s)).toContain(`beat:${b.index}:connective`);
  });
  it('checks side as well as the local line when handing on the ball', () => {
    const s = fresh(),
      i = s.beats.findIndex(
        (b, k) => b.outcome === 'complete' && s.beats[k + 1]?.kind !== 'kickOff',
      );
    const b = s.beats[i + 1]!;
    b.side = b.side === 0 ? 1 : 0;
    expect(validateScript(detail, s)).toContain(`beat:${b.index}:possession`);
  });
  it('requires a receiver and the restart the recorded out actually awards', () => {
    const noReceiver = fresh(),
      p = noReceiver.beats.find((b) => b.kind === 'pass' && b.outcome === 'complete')!;
    delete p.receiver;
    expect(validateScript(detail, noReceiver)).toContain(`beat:${p.index}:receiver`);
    const wrongRestart = fresh(),
      i = wrongRestart.beats.findIndex((b) => b.outKind === 'outTouch');
    wrongRestart.beats[i + 1]!.kind = 'goalKick';
    expect(validateScript(detail, wrongRestart)).toContain(`beat:${i + 1}:restart`);
  });
  it('rejects nonfinite coordinates and an opening kick-off moved off its half', () => {
    const s = fresh();
    s.beats[0]!.from = [NaN, 0];
    expect(validateScript(detail, s)).toContain('beat:0:bounds');
    const shifted = fresh();
    shifted.beats.find((b) => b.clock === 2700)!.clock = 2701;
    expect(validateScript(detail, shifted).some((p) => p.endsWith(':half'))).toBe(true);
  });
});
