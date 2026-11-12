import { describe, expect, it } from 'vitest';
import type { PlayerMotion } from '../../../../../../packages/contracts/src/types';
import { stageAll } from '../../../../../../packages/engine/src/staging/frames';
import { frameTestInputs } from '../../../../../../packages/engine/src/staging/frames.testkit';
import {
  matchScript,
  scriptOf,
} from '../../../../../../packages/engine/src/staging/script.testkit';
import { demoFixture } from '../../../../../../packages/engine/src/staging/squads.testkit';
import { MOTION_STATE_LABELS, motionStateLabel } from './motionState';

/** A few staged beats: a kick-off, passes, a tackle, a throw-in and a saved header. */
const script = matchScript(
  scriptOf(demoFixture(), [
    { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
    { kind: 'pass', actor: 5, receiver: 6, to: [60, 24] },
    { kind: 'carry', actor: 6, to: [70, 30], outcome: 'tackled', opponent: 13 },
    { kind: 'pass', team: 1, actor: 13, receiver: 15, to: [62, 40], possession: 2 },
    { kind: 'pass', team: 1, actor: 15, to: [70, 69], outcome: 'out', possession: 2 },
    { kind: 'throwIn', actor: 4, receiver: 8, to: [75, 54], possession: 3 },
    { kind: 'shot', actor: 8, to: [105, 34], outcome: 'saved', opponent: 11, possession: 3 },
  ]),
);

describe('player sheet', () => {
  it("a staged player's state has a label in every state", () => {
    for (const [state, label] of Object.entries(MOTION_STATE_LABELS))
      expect(label.trim(), state).not.toBe('');
    expect(new Set(Object.values(MOTION_STATE_LABELS)).size).toBe(
      Object.keys(MOTION_STATE_LABELS).length,
    );
    const input = frameTestInputs(script);
    const motions = stageAll(script, input.sides, input.record, input.squads).flatMap((frame) =>
      (frame.motion ?? []).flatMap((sample) => sample.players.flat()),
    );
    expect(motions.length).toBeGreaterThan(100);
    const seen = new Set(motions.map((p) => p.state));
    expect(seen.size).toBeGreaterThan(1);
    for (const motion of motions) {
      // The staging holds no intention: the sheet reads the state alone.
      expect(motion.intention).toBeUndefined();
      expect(motionStateLabel(motion), motion.state).toBe(MOTION_STATE_LABELS[motion.state]);
      expect(motionStateLabel(motion).trim()).not.toBe('');
    }
    // An intention a grid-era sample carried never changes what the sheet says.
    const held = {
      ...motions[0]!,
      intention: { kind: 'screen' },
    } as unknown as PlayerMotion;
    expect(motionStateLabel(held)).toBe(MOTION_STATE_LABELS[held.state]);
  });
});
