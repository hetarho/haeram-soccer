// The writer's natural-play rules (variant d of natural-football): touches spread over each
// player's window so no minute bursts, every pass played back carries the reason the staging
// shows, and a carry recorded inside one cell moves the ball. Small fixtures: three prototype details, written once.
import { describe, expect, it } from 'vitest';
import { cellAt, toAttack, dist } from './cells';
import { SCRIPT_CONFIG } from './config';
import { isPassLike } from './types';
import type { Beat, Script } from './types';
import { writeScript } from './write';
import { fixtureSeed, loadDetail } from '../../../../tests/fixtures/match-script';

const ids = ['s01', 's02', 's08'];
const scripts: [string, Script][] = ids.map((id) => {
  const written = writeScript(loadDetail(id), fixtureSeed(id));
  if ('problems' in written) throw new Error(`${id}: ${written.problems.join(';')}`);
  return [id, written.script];
});
const x = (b: Beat, p: Beat['from']) => toAttack(b.side, p)[0];

describe('natural play', () => {
  it.each(scripts)('%s: no minute holds a burst of beats', (_, script) => {
    const perMinute = new Map<number, number>();
    for (const b of script.beats) {
      if (b.period > 4) continue;
      const m = Math.floor(b.clock / 60);
      perMinute.set(m, (perMinute.get(m) ?? 0) + 1);
    }
    // T840 read 260 beats in one minute where a reserved delivery held a closing window open.
    expect(Math.max(...perMinute.values())).toBeLessThanOrEqual(80);
  });

  it.each(scripts)('%s: every open-play pass played back has a reason', (_, script) => {
    const back = script.beats.filter(
      (b) => b.kind === 'pass' && x(b, b.to) <= x(b, b.from) - SCRIPT_CONFIG.backPass,
    );
    expect(back.length).toBeGreaterThan(0);
    expect(back.filter((b) => b.reason === undefined)).toEqual([]);
  });

  it.each(scripts)('%s: reasons follow the play', (_, script) => {
    script.beats.forEach((b, i) => {
      if (b.reason === undefined || b.reason === 'cutBack') return;
      expect(b.kind).toBe('pass');
      if (b.reason === 'layoff') {
        // First time: the beat before is a forward pass from a teammate that reached him.
        const prev = script.beats[i - 1]!;
        expect(isPassLike(prev.kind)).toBe(true);
        expect(prev.side).toBe(b.side);
        expect(prev.receiver).toBe(b.actor);
        expect(x(prev, prev.to)).toBeGreaterThan(x(prev, prev.from));
      } else if (b.reason === 'pressed') expect(x(b, b.from)).toBeGreaterThanOrEqual(52.5);
      else expect(b.reason === 'reset' && x(b, b.from) < 52.5).toBe(true);
    });
  });

  it.each(scripts)('%s: a recorded carry inside one cell still carries the ball', (_, script) => {
    const inCell = script.beats.filter(
      (b) =>
        b.move !== 'link' &&
        b.outcome === 'complete' &&
        (b.kind === 'carry' || b.kind === 'takeOn') &&
        cellAt(b.side, b.from) === cellAt(b.side, b.to),
    );
    expect(inCell.length).toBeGreaterThan(0);
    // The cell's edges may stop one now and then; the man never stands on the spot as a rule.
    const still = inCell.filter((b) => dist(b.from, b.to) < SCRIPT_CONFIG.cellCarry / 2);
    expect(still.length).toBeLessThanOrEqual(inCell.length * 0.2);
  });

  it('a received pass meets its receiver on the side nearest his next touch', () => {
    // The carry linking a reception to the next recorded action is short on average.
    for (const [, script] of scripts) {
      const links = script.beats.filter((b) => b.move === 'link');
      const metres = links.reduce((s, b) => s + dist(b.from, b.to), 0);
      expect(metres / links.length).toBeLessThan(12);
    }
  });
});
