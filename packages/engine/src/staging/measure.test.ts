import { describe, expect, it } from 'vitest';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import type { MatchScript } from '../../../contracts/src/match-script';
import { fitLines, METRIC_IDS, stagingMetrics } from './measure';
import { matchScript, scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';
import { advance, createStaging } from './perform';

// One hand-made recorded interception, with small connective kick-offs. No world or full fixture.
const fixture = demoFixture();
const detail = smallDetail([[0, 0, 0, 0, 17, 22, 5, 2, 0, 2]]);
const script: MatchScript = matchScript(
  scriptOf(fixture, [
    { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
    { kind: 'pass', actor: 5, receiver: 6, opponent: 13, outcome: 'intercepted', to: [60, 30] },
  ]),
);
Object.assign(script.beats[1], {
  event: 0,
  move: 'short',
  creditedOpponent: true,
  from: [45, 30],
  setPiece: 'none',
});
const staged = advance(createStaging(script, fixture.sides), Infinity);
const fit = (events = staged.events, s = script) => fitLines(staged.frames, events, s, detail);
const value = (id: string, metrics = fit()) => metrics.find((m) => m.id === id)!;

describe('staging measures', () => {
  it('recounts only performed beats and the actual staged winner', () => {
    expect(value('fit.exact').value).toBe(0);
    expect(value('fit.performed').value).toBe(0);
    expect(value('fit.recast').value).toBe(0);
    const wrong = staged.events.map((e) =>
      e.kind === 'intercept' ? { ...e, other: { side: 1 as const, line: 4 } } : e,
    );
    expect(value('fit.exact', fit(wrong)).value).toBeGreaterThan(0);
    expect(
      value(
        'fit.performed',
        fit(staged.events.filter((e) => !(e.kind === 'performed' && e.beat === 1))),
      ).value,
    ).toBe(1);
  });
  it('reports strain and script invention without timing or new random draws', () => {
    const events = staged.events.map((e) =>
      e.kind === 'intercept' ? { ...e, stretch: true, late: true } : e,
    );
    const metrics = fit(events);
    expect(value('fit.stretch', metrics).value).toBe(1);
    expect(value('fit.late', metrics).value).toBe(1);
    expect(metrics.map((m) => m.id)).toEqual([
      'fit.exact',
      'fit.performed',
      'fit.recast',
      'fit.stretch',
      'fit.late',
      'fit.links',
      'fit.linkMetres',
      'fit.miscontrols',
      'fit.connectiveRestarts',
      'fit.orphans',
      'fit.stagedSeconds',
      'fit.clockRatio',
    ]);
    expect(value('fit.stagedSeconds', metrics).value).toBe(staged.frames.at(-1)!.t);
    expect(fit(events)).toEqual(metrics);
  });
  it('retains all 31 metric IDs and measures the small picture under the unchanged limits', () => {
    expect(METRIC_IDS).toHaveLength(31);
    const metrics = stagingMetrics(staged.frames, staged.events, script, fixture.sides);
    expect(metrics.map((m) => m.id)).toEqual(METRIC_IDS);
    expect(metrics.every((m) => Number.isFinite(m.value) && m.limit.length > 0)).toBe(true);
    expect(metrics.find((m) => m.id === 'events.recastRate')?.value).toBe(0);
    expect(stagingMetrics(staged.frames, staged.events, script, fixture.sides)).toEqual(metrics);
  });
  it('groups added-time frames with the final scheduled minute in the clock ratio', () => {
    const frames = Array.from({ length: 1200 }, (_, i) => ({
      ...staged.frames[0],
      t: i / 10,
      clock: 89 * 60 + i / 10,
      live: true,
    }));
    expect(
      fitLines(frames, staged.events, script, detail).find((m) => m.id === 'fit.clockRatio')?.value,
    ).toBe(2);
  });
});
