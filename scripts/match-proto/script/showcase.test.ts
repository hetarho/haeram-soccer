import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { demoFixture } from '../core/squads.ts';
import type { Beat } from '../core/types.ts';
import {
  checkQuotas,
  findShowcaseScript,
  quotaRequirements,
  showcaseScripts,
  showcaseWindow,
} from './showcase.ts';

const SHOWCASE = PROTO_CONFIG.grammar.showcase;
const FIXTURE = demoFixture();

const beat = (index: number, fields: Partial<Beat>): Beat => ({
  index,
  possession: index,
  team: 0,
  phase: 'finalThird',
  move: 'boxShot',
  kind: 'shot',
  actor: 9,
  from: [95, 34],
  to: [105, 34],
  loft: false,
  through: false,
  header: false,
  outcome: 'goal',
  hold: 0.5,
  ...fields,
});

describe('the showcase search', () => {
  it('checkQuotas names what is missing', () => {
    const none = checkQuotas([], FIXTURE);
    expect(none.met).toEqual([]);
    expect(none.missing).toEqual(Object.keys(quotaRequirements()));

    const beats: Beat[] = [
      beat(0, {}),
      // A through ball to the away poacher (decisions 32) flagged offside.
      beat(1, {
        team: 1,
        actor: 17,
        receiver: 20,
        move: 'throughBall',
        kind: 'pass',
        through: true,
        outcome: 'offside',
      }),
      // The home false nine (slot 9) receiving a drop-in twice.
      beat(2, { move: 'dropLink', kind: 'pass', actor: 5, receiver: 9, outcome: 'complete' }),
      beat(3, { move: 'dropLink', kind: 'pass', actor: 5, receiver: 9, outcome: 'complete' }),
    ];
    const check = checkQuotas(beats, FIXTURE);
    expect(check.counts).toMatchObject({
      goals: 1,
      shots: 1,
      lowIqOffside: 1,
      dropLinkFalseNine: 2,
      share: 25,
    });
    expect(check.met).toEqual(['goals', 'lowIqOffside', 'dropLinkFalseNine']);
    expect(check.missing).toContain('shots');
    expect(check.missing).toContain('share');
    expect(check.missing).toHaveLength(Object.keys(quotaRequirements()).length - 3);
  });

  it("findShowcaseScript('demo') meets every quota inside the window", () => {
    const found = findShowcaseScript('demo');
    expect(found.check.missing).toEqual([]);
    expect(found.attempts).toBeLessThanOrEqual(SHOWCASE.maxAttempts);
    expect(found.seed).toBe(`demo#${found.attempts - 1}`);
    expect(found.script.seed).toBe(found.seed);
    const window = showcaseWindow(found.script);
    expect(window.length).toBeLessThan(found.script.beats.length);
    expect(checkQuotas(window, found.script.fixture)).toEqual(found.check);
  });

  it('the search is deterministic', () => {
    const a = findShowcaseScript('demo');
    const b = findShowcaseScript('demo');
    expect(b.seed).toBe(a.seed);
    expect(b.script).toEqual(a.script);
    const first = showcaseScripts('demo').next();
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.value.seed).toBe(a.seed);
      expect(first.value.attempt).toBe(a.attempts - 1);
      expect(first.value.script).toEqual(a.script);
    }
  });
});
