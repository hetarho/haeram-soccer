import { describe, expect, it } from 'vitest';
import { demoFixture } from '../core/squads.ts';
import type { Beat, TeamId } from '../core/types.ts';
import { validateScript } from './validate.ts';

const fixture = demoFixture();

type Row = [
  team: TeamId,
  possession: number,
  kind: Beat['kind'],
  actor: number,
  outcome: Beat['outcome'],
  extra?: Partial<Beat>,
];

const beatsOf = (rows: readonly Row[]): Beat[] =>
  rows.map(([team, possession, kind, actor, outcome, extra], index) => ({
    index,
    possession,
    team,
    phase: 'progression',
    move: kind,
    kind,
    actor,
    from: [50, 34],
    to: [55, 34],
    loft: false,
    through: false,
    header: false,
    outcome,
    hold: 1,
    ...extra,
  }));

/** A valid hand-written list: team 0 is indexes 0–10, team 1 11–21. */
const valid = (): Beat[] =>
  beatsOf([
    [0, 1, 'kickOff', 9, 'complete', { receiver: 5 }],
    [0, 1, 'pass', 5, 'complete', { receiver: 6 }],
    [0, 1, 'carry', 6, 'complete'],
    [0, 1, 'pass', 6, 'intercepted', { receiver: 9, opponent: 13 }],
    [1, 2, 'carry', 13, 'foul', { opponent: 7 }],
    [1, 3, 'freeKick', 13, 'complete', { receiver: 14 }],
    [1, 3, 'clearance', 14, 'out', { to: [50, -1] }],
    [0, 4, 'throwIn', 1, 'complete', { receiver: 2 }],
    [0, 4, 'shot', 2, 'goal', { to: [105, 35] }],
    [1, 5, 'kickOff', 20, 'complete', { receiver: 17 }],
  ]);

const only = (beats: Beat[], rule: number): void => {
  const messages = validateScript({ beats, fixture });
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatch(new RegExp(`^rule ${rule}: beat \\d+: `));
};

describe('validateScript', () => {
  it('accepts the valid list', () => {
    expect(validateScript({ beats: valid(), fixture })).toEqual([]);
  });

  it('rule 1: indexes run 0, 1, 2, …', () => {
    const beats = valid();
    beats[5].index = 50;
    only(beats, 1);
  });

  it('rule 2: the receiver is not the actor', () => {
    const beats = valid();
    beats[9].receiver = 20;
    only(beats, 2);
  });

  it('rule 3: through only on a pass', () => {
    const beats = valid();
    beats[2].through = true;
    only(beats, 3);
  });

  it('rule 4: hold within 0.1–6', () => {
    const beats = valid();
    beats[1].hold = 9;
    only(beats, 4);
  });

  it('rule 5: a completed pass is followed by its receiver', () => {
    const beats = valid();
    beats[1].receiver = 7;
    only(beats, 5);
  });

  it('rule 6: an interception is followed by the interceptor', () => {
    const beats = valid();
    beats[3].opponent = 14;
    only(beats, 6);
  });

  it('rule 7: a foul is followed by a free kick of the fouled side', () => {
    const beats = valid();
    beats[5].kind = 'throwIn';
    only(beats, 7);
  });

  it('rule 8: a save is followed by a corner or the keeper', () => {
    const beats = valid();
    beats[8].outcome = 'saved';
    beats[8].opponent = 11;
    only(beats, 8);
  });
});
