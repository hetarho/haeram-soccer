import { describe, expect, it } from 'vitest';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import type { MatchScript } from '../../../contracts/src/match-script';
import { fitLines, METRIC_IDS, stagingMetrics } from './measure';
import { matchScript, scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';
import { advance, createStaging } from './perform';
import { formationSides } from './tactics.testkit';

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

  it('recounts cards, injuries, subs, penalties and shoot-out kicks from their staged events', () => {
    const d = smallDetail(
      [],
      [[0, 3, 32, 3, 0, 76, 0, 0, 9, -1, -1, 0]],
      [[0, 32, 3, 9, -1, 1, 0]],
    );
    d.incidents = [
      [3, 1, 0, 2, -1, 2],
      [3, 0, 4, 1, -1, -1],
      [3, 0, 3, 6, 11, -1],
    ];
    d.sides[0].lines.push({ ...d.sides[0].lines[6], id: '0:11' });
    for (const stint of d.stints) if (stint[0] === 0 && [1, 6].includes(stint[1])) stint[4] = 2;
    d.stints.push([0, 11, 6, 2, 90]);
    d.shootout = [
      [0, 9, 1],
      [1, 9, 0],
    ];
    d.penalties = [[0, 0]];
    const sides = formationSides('possession', 'possession');
    sides[0].players.push({ ...sides[0].players[6], line: 11 });
    const base = script.beats[0];
    const s: MatchScript = {
      ...script,
      beats: [
        { ...base, index: 0 },
        {
          ...base,
          index: 1,
          kind: 'carry',
          move: 'foul',
          actor: 9,
          receiver: undefined,
          opponent: 3,
          outcome: 'foul',
          from: [94, 34],
          to: [94, 34],
          foul: 0,
          clock: 120,
        },
        {
          ...base,
          index: 2,
          kind: 'stoppage',
          actor: 0,
          receiver: undefined,
          clock: 120,
          incidents: [
            { kind: 'yellow', side: 1, line: 2, reason: 'dissent' },
            { kind: 'injury', side: 0, line: 1 },
            { kind: 'sub', side: 0, line: 6, other: 11 },
          ],
        },
        {
          ...base,
          index: 3,
          kind: 'penalty',
          actor: 9,
          receiver: undefined,
          keeper: 0,
          shot: 0,
          shotKind: 'penalty',
          xg: 76,
          source: -1,
          clock: 130,
          from: [94, 34],
          to: [105, 34],
          outcome: 'goal',
        },
        {
          ...base,
          index: 4,
          kind: 'shootoutKick',
          period: 5,
          actor: 9,
          receiver: undefined,
          clock: 5400,
          from: [94, 34],
          to: [105, 34],
          outcome: 'goal',
        },
        {
          ...base,
          index: 5,
          kind: 'shootoutKick',
          period: 5,
          side: 1,
          actor: 9,
          receiver: undefined,
          clock: 5425,
          from: [11, 34],
          to: [0, 39],
          outcome: 'wide',
        },
      ],
    };
    const staged = advance(createStaging(s, sides), Infinity);
    const exact = (events: typeof staged.events) =>
      fitLines(staged.frames, events, s, d).find((m) => m.id === 'fit.exact')!;
    expect(exact(staged.events)).toMatchObject({ value: 0, pass: true });
    for (const kind of ['card', 'sub', 'injury'] as const) {
      expect(exact(staged.events.filter((e) => e.kind !== kind)).value, kind).toBeGreaterThan(0);
    }
    expect(
      exact(staged.events.filter((e) => !(e.kind === 'shot' && e.penalty))).value,
    ).toBeGreaterThan(0);
    expect(
      exact(staged.events.filter((e) => !(e.kind === 'shot' && e.shootout && e.team === 0))).value,
    ).toBeGreaterThan(0);
    const changed = staged.events.map((e) =>
      e.kind === 'sub' ? { ...e, other: { side: 0 as const, line: 5 } } : e,
    );
    expect(exact(changed).value).toBeGreaterThan(0);
    for (const flag of ['penalty', 'shootout'] as const) {
      const kick = staged.events.find((e) => e.kind === 'shot' && e[flag])!;
      expect(exact([...staged.events, kick]).value, `duplicate ${flag}`).toBeGreaterThan(0);
    }
  });
});
