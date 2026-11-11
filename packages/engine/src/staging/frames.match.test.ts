/** Three complete record/script/stage/frame pipelines, including rare knockout scenes: integration. */
import { expect, it } from 'vitest';
import { frameTimeIssues } from '../../../contracts/src/match-model';
import { M } from '../grid/record';
import { detailSample } from '../script/sample.testkit';
import { writeScript } from '../script/write';
import { frameTestInputs } from './frames.testkit';
import { clockRates, stageAll } from './frames';
import { matchSecond, rateAt } from './frame-clock';
import { advance, createStaging } from './staging';

it('frames retain the records, fixed minutes, current XIs and fitted clock rates of three T830 sample matches', () => {
  const { selected } = detailSample();
  const shootout = selected.find((s) => s.detail.shootout.length > 0)!;
  const injury = selected.find(
    (s) => s !== shootout && s.detail.incidents.some((x) => x[2] === 4),
  )!;
  const ordinary = selected.find((s) => s !== shootout && s !== injury)!;
  expect(shootout).toBeDefined();
  expect(injury).toBeDefined();
  expect(ordinary).toBeDefined();
  for (const sample of [ordinary, injury, shootout]) {
    const written = writeScript(sample.detail, `T831:${sample.detail.id}`);
    if (!('script' in written)) throw new Error(sample.detail.id);
    const script = written.script;
    const { sides, squads } = frameTestInputs(script, sample.detail);
    const frames = stageAll(script, sides, sample.record, squads);
    expect(frameTimeIssues(frames), sample.detail.id).toEqual([]);
    const last = frames.at(-1)!;
    expect(last.score).toEqual(sample.record.score);
    expect(last.metrics).toEqual(sample.record.metrics);
    expect(last.xg).toEqual(sample.record.xg);
    for (let i = 0; i < frames.length; i++) {
      for (const side of [0, 1] as const)
        for (let k = 0; k < sample.record.metrics[side].length; k++) {
          expect(
            frames[i].metrics[side][k],
            `${sample.detail.id}/${i}/${side}/${k}/cap`,
          ).toBeLessThanOrEqual(sample.record.metrics[side][k]);
          if (i)
            expect(
              frames[i].metrics[side][k],
              `${sample.detail.id}/${i}/${side}/${k}/growth`,
            ).toBeGreaterThanOrEqual(frames[i - 1].metrics[side][k]);
        }
      if (i)
        for (const side of [0, 1] as const)
          expect(frames[i].xg![side]).toBeGreaterThanOrEqual(frames[i - 1].xg![side]);
    }
    const events = frames.flatMap((f) =>
      f.events!.map((e) => ({
        ...e,
        period: f.period,
        minute: f.minute,
        at: f.startSeconds! + e.t,
      })),
    );
    const goals = events.filter((e) => e.outcome === 'goal');
    const expected = script.beats
      .filter((b) => b.outcome === 'goal' && b.period !== 5)
      .map((b) => ({
        minute: Math.floor(b.clock / 60) + 1,
        side: b.side,
        actor: sample.detail.sides[b.side].lines[b.actor].id,
      }));
    expect(goals.map((e) => ({ minute: e.minute, side: e.side, actor: e.actor }))).toEqual(
      expected,
    );
    const score = [0, 0];
    for (const f of frames) {
      for (const e of f.events!) if (e.outcome === 'goal') score[e.side]++;
      expect(f.score).toEqual({ home: score[0], away: score[1] });
    }
    expect(goals.length).toBe(sample.record.score.home + sample.record.score.away);
    for (const e of events.filter((e) => ['card', 'injury', 'sub'].includes(e.kind))) {
      const stops = frames.flatMap((f) =>
        (f.stoppages ?? []).map((s) => ({
          period: f.period,
          dead: f.startSeconds! + s.dead,
          kick: f.startSeconds! + s.kick,
        })),
      );
      expect(
        stops.some((s) => s.period === e.period && s.dead <= e.at + 1e-8 && e.at <= s.kick + 1e-8),
        `${sample.detail.id}/${e.kind}/${e.actor}`,
      ).toBe(true);
      const recorded = sample.record.incidents!.find(
        (x) =>
          x.player === e.actor &&
          x.minute === e.minute &&
          (x.kind === e.kind ||
            (e.kind === 'card' && ['yellow', 'red', 'secondYellow'].includes(x.kind))),
      );
      expect(recorded).toBeDefined();
    }

    const staged = advance(createStaging(script, sides), Infinity);
    const rates = clockRates(script, { ...staged, added: sample.record.added });
    const sorted = rates.map((r) => r.rate).sort((a, b) => a - b);
    console.info(
      'T831 clock rates',
      JSON.stringify({
        id: sample.detail.id,
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        max: sorted.at(-1),
        count: sorted.length,
      }),
    );
    const membership = staged.events
      .filter((e) => e.kind === 'sub' || e.kind === 'exit')
      .flatMap((e) => {
        const r = rateAt(rates, e.t);
        return r ? [{ ...e, time: matchSecond(r, e.t) }] : [];
      });
    const entrants = new Set(
      script.beats.flatMap(
        (b) =>
          b.incidents
            ?.filter((x) => x.kind === 'sub')
            .map((x) => sample.detail.sides[x.side].lines[x.other!].id) ?? [],
      ),
    );
    const initial = sample.detail.sides.map((s) =>
      s.lines.map((p) => p.id).filter((id) => !entrants.has(id)),
    );
    for (const frame of frames)
      for (const motion of frame.motion!) {
        const active = initial.map((s) => new Set(s));
        for (const e of membership)
          if (e.time <= motion.elapsedSeconds + 1e-8) {
            if (e.actor)
              active[e.actor.side].delete(sample.detail.sides[e.actor.side].lines[e.actor.line].id);
            if (e.kind === 'sub' && e.other)
              active[e.other.side].add(sample.detail.sides[e.other.side].lines[e.other.line].id);
          }
        for (const side of [0, 1] as const)
          expect(
            new Set(motion.players[side].map((p) => p.id)),
            `${sample.detail.id}/${motion.elapsedSeconds}/${side}/XI`,
          ).toEqual(active[side]);
      }
    expect(last.metrics[0][M.minutes]).toBe(sample.detail.length);
  }
});
