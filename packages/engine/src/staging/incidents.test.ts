/** Whole recorded fixtures, rare-scene search and staging through every period: integration. */
import { expect, it } from 'vitest';
import type { StagingSide } from '../../../contracts/src/match-script';
import { detailSample } from '../script/sample.testkit';
import type { MatchDetail } from '../script/detail';
import { IN } from '../script/codes';
import { writeScript } from '../script/write';
import { fitLines, stagingMetrics } from './measure';
import { advance, createStaging } from './staging';

it('stages each T825 incident scenario through its final whistle without re-crediting facts', () => {
  const { selected } = detailSample();
  const has = (d: MatchDetail, kind: number) => d.incidents.some((x) => x[IN.kind] === kind);
  const scenarios: [string, (d: MatchDetail) => boolean][] = [
    ['substitution', (d) => has(d, 3)],
    [
      'injuryWithoutReplacement',
      (d) =>
        d.incidents.some(
          (x) =>
            x[IN.kind] === 4 &&
            !d.incidents.some(
              (s) =>
                s[IN.kind] === 3 &&
                s[IN.side] === x[IN.side] &&
                s[IN.line] === x[IN.line] &&
                s[IN.minute] === x[IN.minute],
            ),
        ),
    ],
    ['straightRed', (d) => has(d, 2)],
    ['penalty', (d) => d.penalties.length > 0],
    ['extraTime', (d) => d.length === 120],
    ['shootout', (d) => d.shootout.length > 0],
  ];
  for (const [scenario, accepts] of scenarios) {
    const sample = selected.find((s) => accepts(s.detail));
    expect(sample, scenario).toBeDefined();
    const detail = sample!.detail;
    const written = writeScript(detail, `T830:${detail.id}`);
    expect('problems' in written ? written.problems : [], scenario).toEqual([]);
    if (!('script' in written)) throw new Error(detail.id);
    const sides = detail.sides.map((side): StagingSide => ({
      tactic: side.tactic,
      players: side.lines.map((p, line) => ({
        line,
        slot: p.slot,
        role: p.role,
        pace: 50,
        anticipation: 50,
        discipline: 50,
        pressing: 50,
        freedom: 50,
      })),
    })) as [StagingSide, StagingSide];
    const staged = advance(createStaging(written.script, sides), Infinity);
    expect(staged.done).toBe(true);
    const fit = fitLines(staged.frames, staged.events, written.script, detail);
    const metrics = stagingMetrics(staged.frames, staged.events, written.script, sides);
    console.info('T830 incident', JSON.stringify({ scenario, id: detail.id, fit, metrics }));
    expect(
      fit.slice(0, 3).map((m) => [m.id, m.value, m.pass]),
      scenario,
    ).toEqual([
      ['fit.exact', 0, true],
      ['fit.performed', 0, true],
      ['fit.recast', 0, true],
    ]);
    for (const id of [
      'kinematics.maxStep',
      'kinematics.outside',
      'ball.maxSpeed',
      'ball.ownerDistance',
      'events.reception',
    ])
      expect(metrics.find((m) => m.id === id)?.pass, `${scenario}/${id}`).toBe(true);

    // During an exit/entry the dead scene still shows the man walking to the line. The
    // boundary is the crossing, not a hidden replacement at the start of the record minute.
    const entrants = new Set(
      detail.incidents
        .filter((x) => x[IN.kind] === 3)
        .map((x) => `${x[IN.side]}/${x[IN.otherLine]}`),
    );
    const active = new Set(
      detail.sides
        .flatMap((s, side) => s.lines.map((_, line) => `${side}/${line}`))
        .filter((id) => !entrants.has(id)),
    );
    let cursor = 0;
    const membership = staged.events.filter((e) => e.kind === 'sub' || e.kind === 'exit');
    for (const frame of staged.frames) {
      while (cursor < membership.length && membership[cursor].t <= frame.t + 1e-9) {
        const e = membership[cursor++];
        active.delete(`${e.actor!.side}/${e.actor!.line}`);
        if (e.other) active.add(`${e.other.side}/${e.other.line}`);
      }
      const ids = frame.p.map((p) => `${p.player.side}/${p.player.line}`);
      expect(new Set(ids).size, `${scenario}/${frame.t}/unique`).toBe(ids.length);
      expect(new Set(ids), `${scenario}/${frame.t}/sceneXI`).toEqual(active);
      for (const side of [0, 1] as const) {
        const players = frame.p.filter((p) => p.player.side === side);
        expect(players.length).toBeLessThanOrEqual(11);
        expect(new Set(players.map((p) => p.slot)).size, `${scenario}/${frame.t}/slots`).toBe(
          players.length,
        );
        // Live play is a record fact; the entering/leaving dead scene above has its own boundary.
        if (frame.live && frame.clock !== undefined && frame.period !== 5) {
          const minute = Math.min(detail.length - 1, Math.floor(frame.clock / 60));
          const expected = new Set(
            detail.stints
              .filter((s) => s[0] === side && s[3] <= minute && s[4] > minute)
              .map((s) => s[1]),
          );
          // A minute-level record places the change at the minute's boundary. Its picture
          // has the old man until his exit, and the entrant from the actual entry crossing.
          const leaves = (side: number, line: number) =>
            staged.events.find(
              (e) => e.kind === 'exit' && e.actor?.side === side && e.actor.line === line,
            );
          for (const x of detail.incidents.filter(
            (x) => x[IN.side] === side && x[IN.minute] === minute + 1,
          )) {
            const line = x[IN.line],
              kind = x[IN.kind];
            const exit = leaves(side, line);
            if (kind === 3) {
              const sub = staged.events.find(
                (e) =>
                  e.kind === 'sub' &&
                  e.actor?.side === side &&
                  e.actor.line === line &&
                  e.other?.line === x[IN.otherLine],
              );
              if (sub && sub.t > frame.t + 1e-9) {
                expected.delete(x[IN.otherLine]);
                if (!exit || exit.t > frame.t + 1e-9) expected.add(line);
              }
            } else if ([1, 2, 4].includes(kind)) {
              if (exit && exit.t > frame.t + 1e-9) expected.add(line);
              else if (exit) expected.delete(line);
            }
          }
          expect(
            new Set(players.map((p) => p.player.line)),
            `${scenario}/${frame.t}/recordXI`,
          ).toEqual(expected);
        }
      }
    }
  }
});
