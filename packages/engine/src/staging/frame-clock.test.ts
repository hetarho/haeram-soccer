import { expect, it } from 'vitest';
import type { MatchScript } from '../../../contracts/src/match-script';
import { clockRates } from './frame-clock';
import { matchScript, scriptOf } from './script.testkit';
import { demoFixture } from './squads.testkit';
import type { StageEvent } from './staging';

/** A key pass and its shot: the pass played at 61 s plus its hold, the shot at 72 s plus its hold. */
function keyPassAndShot(): MatchScript {
  const script = matchScript(
    scriptOf(demoFixture(), [
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'throwIn', actor: 4, receiver: 8, to: [75, 54], possession: 2 },
      { kind: 'shot', actor: 8, to: [105, 34], outcome: 'saved', opponent: 11, possession: 2 },
    ]),
  );
  script.beats.forEach((b, i) => (b.clock = [0, 61, 72][i]!));
  Object.assign(script.beats[1]!, { event: 0, hold: 1.5 });
  Object.assign(script.beats[2]!, { shot: 0, source: 0, hold: 2.5 });
  return script;
}

const event = (beat: number, kind: StageEvent['kind'], t: number): StageEvent =>
  ({ beat, kind, t, actor: null }) as StageEvent;

it('anchors a fixed beat at its action, the beat clock plus its hold, as the writer times it', () => {
  const script = keyPassAndShot();
  // Staged exactly as nominally timed: every stretch then runs at rate 1.
  const events = [
    event(0, 'begin', 0),
    event(1, 'kick', 62.5),
    event(2, 'shot', 74.5),
    event(2, 'whistle', 120),
  ];
  const rates = clockRates(script, { frames: [], events });
  expect(rates.map((r) => [r.startSeconds, r.endSeconds])).toEqual([
    [0, 62.5],
    [62.5, 74.5],
    [74.5, 120],
  ]);
  for (const r of rates) expect(r.rate).toBeCloseTo(1, 9);
});
