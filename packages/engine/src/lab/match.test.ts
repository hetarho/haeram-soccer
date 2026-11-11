import { afterEach, describe, expect, it } from 'vitest';
import { stageFrames } from '../staging/frames';
import {
  applyOverrides,
  restoreDefaults,
  tunableDefault,
  tunableLeaves,
  withOverrides,
} from '../tunables';
import { createLabWorld, playLabMatch, watchLabMatch } from './match';
import { tinyLabWorld } from './match.testkit';
import { generateLabSide } from './sides';

const lab = createLabWorld(tinyLabWorld().w);
const sides = [
  generateLabSide({ side: 0, seed: 'lab-unit', tactic: 'balanced', average: 72, spread: 4 }),
  generateLabSide({ side: 1, seed: 'lab-unit', tactic: 'counter', average: 72, spread: 4 }),
] as const;
afterEach(restoreDefaults);

describe('result-path lab match', () => {
  it('uses the generated sides, modern participation and placed attribution without changing inputs', () => {
    const before = structuredClone(sides);
    const { match, record } = playLabMatch(lab, sides, 'lab-unit', 0);
    expect(match.plan.placed).toBe(true);
    expect(match.plan.era.named).toBe(9);
    expect(record.model).toBe('scripted-aggregate-11');
    expect(
      record.players.every((p) => sides.some((s) => s.players.some((one) => one.id === p.id))),
    ).toBe(true);
    expect(sides).toEqual(before);
  });

  it('a staging value changes the picture and not the record', () => {
    const watched = watchLabMatch(lab, sides, 'lab-unit');
    expect(watched.problems).toBeUndefined();
    expect(watched.frames).toEqual([]);
    expect(watched.script).toBeDefined();
    expect(watched.staging).toBeDefined();
    const picture = () => {
      const frames = stageFrames(watched.script!, watched.staging!, watched.record, watched.squads);
      // Two prepared minutes suffice to observe pass spacing; no whole-match staging or world.
      try {
        return [frames.next().value, frames.next().value];
      } finally {
        frames.return(undefined);
      }
    };
    const before = picture();
    const record = structuredClone(watched.record);
    applyOverrides({ 'STAGING_CONFIG.stage.kickGap': 12 });
    expect(picture()).not.toEqual(before);
    expect(watchLabMatch(lab, sides, 'lab-unit').record).toEqual(record);
    applyOverrides({ 'STAGING_CONFIG.shape.ip.lineBase': 40 });
    const restaged = watchLabMatch(lab, sides, 'lab-unit');
    expect(restaged.record).toEqual(record);
    expect(restaged.script).toEqual(watched.script);
  });

  it('a result value changes the record', () => {
    const before = playLabMatch(lab, sides, 'lab-unit', 0).record;
    applyOverrides({ 'AGGREGATE_CONFIG.shots.scale': 0 });
    const after = playLabMatch(lab, sides, 'lab-unit', 0).record;
    expect(after.metrics).not.toEqual(before.metrics);
    restoreDefaults();
    expect(playLabMatch(lab, sides, 'lab-unit', 0).record).toEqual(before);
  });

  it('a script value changes its places while retaining the settled football counts', () => {
    const before = watchLabMatch(lab, sides, 'lab-unit');
    const changed = withOverrides({ 'SCRIPT_CONFIG.cellJitter': 0.5 }, () =>
      watchLabMatch(lab, sides, 'lab-unit'),
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.problems).toBeUndefined();
    expect(changed.value.script).not.toEqual(before.script);
    expect(changed.value.record.metrics).toEqual(before.record.metrics);
    expect(changed.value.record.players).toEqual(before.record.players);
  });

  it('refreshes copied attribution tables and restores their original player credits', () => {
    const before = playLabMatch(lab, sides, 'lab-unit', 0).record;
    applyOverrides({ 'AGGREGATE_ATTRIBUTION_CONFIG.pass.GK.0': 500 });
    expect(playLabMatch(lab, sides, 'lab-unit', 0).record.players).not.toEqual(before.players);
    restoreDefaults();
    expect(playLabMatch(lab, sides, 'lab-unit', 0).record).toEqual(before);
  });

  it('values are restored after the run', () => {
    const defaults = tunableLeaves();
    const result = withOverrides(
      { 'SCRIPT_CONFIG.minPass': 8, 'STAGING_CONFIG.stage.kickGap': 9 },
      () => watchLabMatch(lab, sides, 'lab-unit'),
    );
    expect(result.ok).toBe(true);
    expect(() =>
      withOverrides({ 'AGGREGATE_CONFIG.shots.scale': 0 }, () => {
        throw new Error('synthetic failure');
      }),
    ).toThrow('synthetic failure');
    expect(tunableLeaves()).toEqual(defaults);
    expect(tunableDefault('STAGING_CONFIG.stage.kickGap')).toBe(5.5);
  });
});
